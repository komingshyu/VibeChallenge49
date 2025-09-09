
const video = document.getElementById('video');
const canvasOverlay = document.getElementById('canvasOverlay');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const btnCam = document.getElementById('btnCam');
const btnStop = document.getElementById('btnStop');
const fileInput = document.getElementById('fileInput');
const bpmValue = document.getElementById('bpmValue');
const confLabel = document.getElementById('confidenceLabel');
const progressBar = document.getElementById('progressBar');
const seekWrap = document.getElementById('seekBarWrap');
const seekRange = document.getElementById('seekRange');
const timeLabel = document.getElementById('timeLabel');
const chkCrop = document.getElementById('chkCrop');
const zoomRange = document.getElementById('zoomRange');

let ws = null;
let MODE = 'idle'; // 'camera' | 'file'
let streaming = false;
let mediaStream = null;
let sendLoop = null;
let currentRecordId = null;

function log(...args){ console.log('[app]', ...args); }

async function fetchJson(url, opts){
  const res = await fetch(url, opts);
  const txt = await res.text();
  let data;
  try{ data = JSON.parse(txt); }
  catch(e){ throw new Error(`HTTP ${res.status}: ${txt.slice(0,180)}`); }
  if (!res.ok || (data && data.ok===false)){
    throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
  }
  return data;
}
function toast(msg){ console.warn(msg); try{ alert(msg); }catch(_){ } }

function fitCanvasToVideo(){
  const rect = document.querySelector('.video-container').getBoundingClientRect();
  canvasOverlay.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  canvasOverlay.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
  canvasOverlay.style.width = rect.width + 'px';
  canvasOverlay.style.height = rect.height + 'px';
}
window.addEventListener('resize', fitCanvasToVideo);

// Chart for signal
const ctx = document.getElementById('signalChart').getContext('2d');
const dataPoints = [];
const chart = new Chart(ctx, {
  type: 'line',
  data: { labels: [], datasets: [{ label: 'rPPG', data: dataPoints }] },
  options: {
    animation: false, maintainAspectRatio: false,
    scales: { x: { display: false }, y: { display: true } },
    elements: { point: { radius: 0 } }, plugins: { legend: { display: false } }
  }
});
function addDataPoint(v){
  dataPoints.push(v); if (dataPoints.length > 600) dataPoints.shift();
  chart.data.labels.push(''); if (chart.data.labels.length > 600) chart.data.labels.shift();
  chart.update();
}

// 3D heart (GLTF or fallback)
const heartEl = document.getElementById('heart3d');
const HEART_MODEL_URL = null; // 例如 'https://cdn.yoursite/heart.glb'
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
heartEl.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(0,0,8);
scene.add(new THREE.AmbientLight(0x404040, 2));
const keyLight = new THREE.PointLight(0xffffff, 1); keyLight.position.set(10,10,10); scene.add(keyLight);

let heartMesh = null;
function buildFallbackHeart(){
  const heartShape = new THREE.Shape();
  const x0 = 0, y0 = 0;
  heartShape.moveTo(x0 + 0, y0 + 2);
  heartShape.bezierCurveTo(x0 + 0, y0 + 2, x0 - 3, y0 + 0, x0 + 0, y0 - 2.5);
  heartShape.bezierCurveTo(x0 + 0, y0 - 2.5, x0 + 3, y0 + 0, x0 + 0, y0 + 2);
  const geometry = new THREE.ExtrudeGeometry(heartShape, { depth: 1, bevelEnabled: true, bevelSegments: 10, steps: 2, bevelSize: 0.4, bevelThickness: 0.4 });
  geometry.center();
  const material = new THREE.MeshStandardMaterial({ color: 0xff2d75, metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.95, emissive: 0x330011, emissiveIntensity: 0.2 });
  heartMesh = new THREE.Mesh(geometry, material);
  scene.add(heartMesh);
}
if (HEART_MODEL_URL){
  const loader = new THREE.GLTFLoader();
  loader.load(HEART_MODEL_URL, (gltf)=>{
    heartMesh = gltf.scene;
    heartMesh.traverse(o=>{ if (o.isMesh){ o.material.emissive = new THREE.Color(0xff2d75); o.material.emissiveIntensity = 0.25; } });
    scene.add(heartMesh);
  }, undefined, (err)=>{ console.warn('GLTF 載入失敗，改用內建幾何', err); buildFallbackHeart(); });
}else{
  buildFallbackHeart();
}

function renderHeart(){
  const rect = heartEl.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width/rect.height; camera.updateProjectionMatrix();
  if (heartMesh){ heartMesh.rotation.y += 0.01; }
  renderer.render(scene, camera);
  requestAnimationFrame(renderHeart);
}
renderHeart();

let bpmForBeat = 0, lastBeatTime = 0, beatAmplitude = 0.15, lastSignal = 0.0, lastConf = 0.0;
function heartbeat(){
  const now = performance.now();
  if (bpmForBeat > 0 && heartMesh){
    const interval = 60000 / bpmForBeat;
    if (now - lastBeatTime > interval){
      lastBeatTime = now;
      const a = 1 + beatAmplitude; heartMesh.scale.set(a,a,a);
      keyLight.intensity = 1.4;
      setTimeout(()=>{ if (heartMesh){ heartMesh.scale.set(1,1,1); keyLight.intensity = 1.0; } }, 140);
    }
  }
  requestAnimationFrame(heartbeat);
}
heartbeat();

function openWS(){
  if (ws && ws.readyState === WebSocket.OPEN) return;
  ws = new WebSocket((location.protocol === 'https:'?'wss://':'ws://') + location.host + '/ws/stream');
  ws.onopen = () => { if (currentRecordId) ws.send(JSON.stringify({type:'start', mid: currentRecordId})); };
  ws.onmessage = ev => {
    const obj = JSON.parse(ev.data);
    if (obj.type === 'metrics'){
      bpmValue.textContent = obj.bpm > 0 ? Math.round(obj.bpm) : '--';
      confLabel.textContent = 'conf: ' + obj.confidence.toFixed(2);
      bpmForBeat = obj.bpm;
      lastSignal = obj.signal_value || 0; lastConf = obj.confidence || 0;
      beatAmplitude = 0.1 + 0.25*Math.min(1, Math.max(0, lastConf));
      addDataPoint(lastSignal);
      if (obj.overlay){
        const img = new Image();
        img.onload = () => {
          fitCanvasToVideo();
          const ctx = canvasOverlay.getContext('2d');
          ctx.clearRect(0,0,canvasOverlay.width, canvasOverlay.height);
          const cw = canvasOverlay.width, ch = canvasOverlay.height;
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
          const scale = Math.min(cw/iw, ch/ih);
          const dw = Math.round(iw*scale), dh = Math.round(ih*scale);
          const dx = Math.floor((cw - dw)/2), dy = Math.floor((ch - dh)/2);
          ctx.drawImage(img, 0,0, iw, ih, dx, dy, dw, dh);
        };
        img.src = obj.overlay;
      }
    }
  };
  ws.onerror = e => console.error(e);
  ws.onclose = () => { log('WS closed'); }
}

async function startCamera(){
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    MODE='camera'; video.controls=false; seekWrap.style.display='none';
    video.srcObject = mediaStream;
    streaming = true; previewPlaceholder.style.display = 'none';
    openWS(); pumpFrames();
  }catch(err){ toast('無法開啟攝影機: ' + err.message); }
}

function stopAll(){
  streaming = false;
  if (mediaStream){ mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  try{ if (video.srcObject) video.srcObject = null; }catch(_){}
  video.removeAttribute('src'); video.load();
  if (sendLoop) clearInterval(sendLoop);
}

function pumpFrames(){
  const canvasSend = document.createElement('canvas');
  const ctx = canvasSend.getContext('2d');
  if (sendLoop) clearInterval(sendLoop);
  sendLoop = setInterval(()=>{
    if (!streaming || !ws || ws.readyState !== WebSocket.OPEN) return;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    if (!vw || !vh) return;
    const sw = 640, sh = Math.round(vh * (640/vw));
    canvasSend.width = sw; canvasSend.height = sh;
    ctx.drawImage(video, 0, 0, sw, sh);
    const dataUrl = canvasSend.toDataURL('image/jpeg', 0.7);
    ws.send(JSON.stringify({type:'frame', data: dataUrl}));
  }, 66); // ~15 fps
}

btnCam.addEventListener('click', startCamera);
btnStop.addEventListener('click', stopAll);

fileInput.addEventListener('change', async (e)=>{
  if (!fileInput.files.length) return;
  stopAll();
  MODE = 'file';
  const file = fileInput.files[0];
  const url = URL.createObjectURL(file);
  video.controls = true; video.srcObject = null; video.src = url;
  previewPlaceholder.style.display='none';
  seekWrap.style.display = 'flex';
  openWS(); streaming = true; pumpFrames();

  // 上傳離線處理（可選擇裁切）
  const form = new FormData();
  if (currentRecordId) form.append('mid', currentRecordId);
  form.append('file', file, file.name);
  if (chkCrop.checked) form.append('crop', '1');
  form.append('zoom', zoomRange.value);
  try{
    const js = await fetchJson('/api/upload', { method:'POST', body: form });
    const jobId = js.job_id;
    const timer = setInterval(async ()=>{
      try{
        const p = await fetchJson('/api/progress/'+jobId);
        progressBar.style.width = ((p.progress || 0)*100).toFixed(1) + '%';
        if (p.done){
          clearInterval(timer);
          if (p.error){ toast('處理失敗：' + p.error); return; }
          const a = document.createElement('a');
          a.href = '/api/download/'+jobId;
          a.textContent = '下載疊加結果影片';
          a.style.marginLeft = '8px';
          document.querySelector('.controls').appendChild(a);
        }
      }catch(err){ clearInterval(timer); toast('查詢進度失敗：' + err.message); }
    }, 800);
  }catch(err){ toast('上傳失敗：' + err.message); }
});

// 自訂 seek bar
function fmtTime(t){ if(!isFinite(t)) return '00:00'; const m=Math.floor(t/60); const s=Math.floor(t%60); return (m<10?'0':'')+m+':' + (s<10?'0':'')+s; }
video.addEventListener('durationchange', ()=>{
  if (MODE==='file'){ seekRange.value = 0; timeLabel.textContent = `00:00 / ${fmtTime(video.duration||0)}`; }
});
video.addEventListener('timeupdate', ()=>{
  if (MODE==='file' && video.duration>0){
    seekRange.value = (video.currentTime / video.duration) * 100;
    timeLabel.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
  }
});
seekRange.addEventListener('input', ()=>{
  if (MODE==='file' && video.duration>0){
    const t = (parseFloat(seekRange.value)/100) * video.duration;
    video.currentTime = t;
  }
});

// CRUD
async function refreshRecords(){
  try{
    const js = await fetchJson('/api/measurements');
    const list = document.getElementById('recordList');
    list.innerHTML = '';
    (js.items || []).forEach(item=>{
      const row = document.createElement('div'); row.className = 'row';
      const name = document.createElement('input'); name.value = item.name;
      const notes = document.createElement('input'); notes.value = item.notes || '';
      const btnSave = document.createElement('button'); btnSave.textContent = '修改';
      const btnDel = document.createElement('button'); btnDel.textContent = '刪除';
      const btnUse = document.createElement('button'); btnUse.textContent = (currentRecordId===item.id?'使用中':'使用');
      const meta = document.createElement('div'); meta.className='meta'; meta.textContent = new Date(item.created_at*1000).toLocaleString();
      row.appendChild(name); row.appendChild(notes); row.appendChild(btnSave); row.appendChild(btnDel); row.appendChild(btnUse); row.appendChild(meta);
      btnSave.onclick = async ()=>{ try{ const j = await fetchJson('/api/measurements/'+item.id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:name.value, notes:notes.value}) }); if (j.ok) refreshRecords(); }catch(err){ toast(err.message);} };
      btnDel.onclick = async ()=>{ try{ const j = await fetchJson('/api/measurements/'+item.id, { method:'DELETE' }); if (j.ok) { if (currentRecordId===item.id) currentRecordId=null; refreshRecords(); } }catch(err){ toast(err.message);} };
      btnUse.onclick = ()=>{ currentRecordId = item.id; openWS(); refreshRecords(); }
      list.appendChild(row);
    });
  }catch(err){ toast('載入紀錄失敗：' + err.message); }
}
document.getElementById('btnAddRecord').addEventListener('click', async ()=>{
  const name = document.getElementById('recordName').value || '未命名';
  const notes = document.getElementById('recordNotes').value || '';
  try{
    const js = await fetchJson('/api/measurements', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, notes}) });
    if (js.ok) { currentRecordId = js.id; refreshRecords(); }
  }catch(err){ toast(err.message); }
});
refreshRecords();
