const el = sel => document.querySelector(sel);
const els = sel => Array.from(document.querySelectorAll(sel));

// Elements
const fileInput = el('#fileInput');
const pickBtn = el('#pickBtn');
const dropzone = el('#dropzone');
const progress = el('#progress');
const progressBar = el('#progress .bar');
const progressLabel = el('#progress .label');
const queueEl = el('#queue');

const playerOriginal = el('#playerOriginal');
const playerVocals   = el('#playerVocals');
const playerInst     = el('#playerInst');

const dlVocals = el('#dlVocals');
const dlInst   = el('#dlInst');

const gainMain = el('#gainMain');
const delayTime = el('#delayTime');
const reverbMix = el('#reverbMix');
const eqLow = el('#eqLow');
const eqMid = el('#eqMid');
const eqHigh = el('#eqHigh');
const rate = el('#rate');

const btnMic = el('#btnMic');
const btnRec = el('#btnRec');
const dlRec = el('#dlRec');
const viz = el('#viz');

const lrcInput = el('#lrcInput');
const lrcBox = el('#lrc');

let AC, masterGain, delayNode, convolver, convolverGain;
let eq = {low:null, mid:null, high:null};
let analyser, vizCtx, dest, mediaRecorder, recChunks = [];
let micStream, micNode;

function ensureAudioGraph(){
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = AC.createGain();
  masterGain.gain.value = parseFloat(gainMain.value);

  // Effects
  delayNode = AC.createDelay(1.0);
  delayNode.delayTime.value = parseFloat(delayTime.value);
  const feedback = AC.createGain(); feedback.gain.value = 0.35;
  delayNode.connect(feedback).connect(delayNode);

  convolver = AC.createConvolver();
  convolver.buffer = makeImpulseResponse(AC, 2.2, 3.0); // 合成 IR
  convolverGain = AC.createGain(); convolverGain.gain.value = parseFloat(reverbMix.value);

  // EQ
  eq.low = AC.createBiquadFilter(); eq.low.type='lowshelf';
  eq.mid = AC.createBiquadFilter(); eq.mid.type='peaking'; eq.mid.Q.value=0.9;
  eq.high = AC.createBiquadFilter(); eq.high.type='highshelf';

  // Analyser
  analyser = AC.createAnalyser();
  analyser.fftSize = 2048;

  // Destination + recording
  dest = AC.createMediaStreamDestination();
  masterGain.connect(analyser);
  analyser.connect(dest);
  analyser.connect(AC.destination);

  // wire: (sources) -> [eq] -> delay -> (dry+reverb) -> master
  eq.low.connect(eq.mid).connect(eq.high).connect(delayNode);
  const dryGain = AC.createGain(); dryGain.gain.value = 1.0;
  delayNode.connect(dryGain).connect(masterGain);
  delayNode.connect(convolver).connect(convolverGain).connect(masterGain);

  // Recorder
  mediaRecorder = new MediaRecorder(dest.stream);
  mediaRecorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = e => {
    const blob = new Blob(recChunks, {type: 'audio/webm'});
    recChunks = [];
    const url = URL.createObjectURL(blob);
    dlRec.href = url; dlRec.download = 'recording.webm';
    dlRec.textContent = '下載我的錄音';
  };

  // Viz
  vizCtx = viz.getContext('2d');
  requestAnimationFrame(drawViz);
}

function makeImpulseResponse(ctx, duration=2, decay=2){
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for(let c=0;c<2;c++){
    const ch = impulse.getChannelData(c);
    for(let i=0;i<length;i++){
      ch[i] = (Math.random()*2-1) * Math.pow(1 - i/length, decay);
    }
  }
  return impulse;
}

function drawViz(){
  if(!analyser){ requestAnimationFrame(drawViz); return; }
  const buflen = analyser.frequencyBinCount;
  const data = new Uint8Array(buflen);
  analyser.getByteFrequencyData(data);
  vizCtx.clearRect(0,0,viz.width,viz.height);
  const w = viz.width / buflen;
  for(let i=0;i<buflen;i++){
    const h = (data[i]/255) * viz.height;
    const x = i*w, y = viz.height - h;
    vizCtx.fillStyle = `hsl(${(i/buflen)*300}, 70%, 55%)`;
    vizCtx.fillRect(x, y, w, h);
  }
  requestAnimationFrame(drawViz);
}

function connectTagAudio(tag){
  ensureAudioGraph();
  const src = AC.createMediaElementSource(tag);
  // route into EQ chain -> effects -> master (already wired)
  src.connect(eq.low);
}

function setPlaybackRate(val){
  [playerOriginal, playerVocals, playerInst].forEach(p => { p.playbackRate = val; });
}

gainMain.addEventListener('input', e => { ensureAudioGraph(); masterGain.gain.value = parseFloat(e.target.value); });
delayTime.addEventListener('input', e => { ensureAudioGraph(); delayNode.delayTime.value = parseFloat(e.target.value); });
reverbMix.addEventListener('input', e => { ensureAudioGraph(); convolverGain.gain.value = parseFloat(e.target.value); });
eqLow.addEventListener('input', e => { ensureAudioGraph(); eq.low.gain.value = parseFloat(e.target.value); });
eqMid.addEventListener('input', e => { ensureAudioGraph(); eq.mid.gain.value = parseFloat(e.target.value); });
eqHigh.addEventListener('input', e => { ensureAudioGraph(); eq.high.gain.value = parseFloat(e.target.value); });
rate.addEventListener('input', e => setPlaybackRate(parseFloat(e.target.value)));

// Drag & drop / file select
pickBtn.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('hover'); });
dropzone.addEventListener('dragleave', e => { dropzone.classList.remove('hover'); });
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('hover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

async function handleFile(file){
  queueEl.insertAdjacentHTML('beforeend', `<div class="item">佇列：${file.name}</div>`);
  progress.classList.remove('hidden');
  setProgress(0.1, '上傳中…');

  const form = new FormData();
  form.append('file', file);

  const resp = await fetch('/api/separate', { method:'POST', body:form });
  if(!resp.ok){
    setProgress(0, '分離失敗 😢');
    return;
  }
  setProgress(0.7, '分離中，請稍候…');

  const data = await resp.json();
  // 取得檔案 URL
  const { original, vocals, instrumental } = data;

  playerOriginal.src = original;
  playerVocals.src = vocals;
  playerInst.src = instrumental;

  dlVocals.href = vocals; dlVocals.download = 'vocals.wav';
  dlInst.href = instrumental; dlInst.download = 'instrumental.wav';

  ;[playerOriginal, playerVocals, playerInst].forEach(tag => {
    tag.addEventListener('play', ()=> connectTagAudio(tag), {once:true});
  });

  setProgress(1.0, '完成 ✅');
  setTimeout(()=> progress.classList.add('hidden'), 1500);
}

function setProgress(pct, text){
  progressBar.style.setProperty('--w', `${pct*100}%`);
  progress.querySelector('.bar').style.setProperty('--w', `${pct*100}%`);
  progress.querySelector('.bar').style.setProperty('position', 'relative');
  progress.querySelector('.bar').style.setProperty('overflow', 'hidden');
  progress.querySelector('.bar')?.style.setProperty('--w', `${pct*100}%`);
  progress.querySelector('.bar')?.style.setProperty('background', '#eee');
  progress.querySelector('.bar')?.style.setProperty('borderRadius', '999px');
  progress.querySelector('.bar')?.style.setProperty('height', '8px');
  progress.querySelector('.bar')?.style.setProperty('boxShadow', 'inset 0 0 0 1px #fff');
  progress.querySelector('.bar')?.style.setProperty('--grad', 'linear-gradient(90deg, #7c3aed, #06b6d4)');
  progress.querySelector('.bar')?.style.setProperty('backgroundImage', 'var(--grad)');
  progress.querySelector('.bar')?.style.setProperty('backgroundSize', `${pct*100}% 100%`);
  progressLabel.textContent = text;
}

// Mic / recording
btnMic.addEventListener('click', async ()=>{
  ensureAudioGraph();
  if(!micStream){
    micStream = await navigator.mediaDevices.getUserMedia({audio:true});
    micNode = AC.createMediaStreamSource(micStream);
    micNode.connect(eq.low);
    btnMic.textContent = '關閉麥克風';
    btnRec.disabled = false;
  } else {
    micStream.getTracks().forEach(t=>t.stop());
    micStream = null;
    btnMic.textContent = '開啟麥克風';
    btnRec.disabled = true;
  }
});

btnRec.addEventListener('click', ()=>{
  if(mediaRecorder.state === 'inactive'){
    recChunks = [];
    mediaRecorder.start();
    btnRec.textContent = '停止錄音';
  }else{
    mediaRecorder.stop();
    btnRec.textContent = '開始錄音';
  }
});

// LRC
lrcInput.addEventListener('change', async e => {
  const f = e.target.files[0];
  if(!f) return;
  const text = await f.text();
  const lines = parseLRC(text);
  renderLRC(lines);
  syncLRC(lines, playerInst); // 以伴奏為時間軸
});

function parseLRC(txt){
  const lines = txt.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
  const out = [];
  const re = /\\[(\\d{1,2}):(\\d{2})(?:\\.(\\d{1,2}))?\\](.*)/;
  for(const line of lines){
    const m = line.match(re);
    if(m){
      const min = parseInt(m[1],10);
      const sec = parseInt(m[2],10);
      const cs  = m[3] ? parseInt(m[3],10) : 0;
      const time = min*60 + sec + cs/100;
      out.push({time, text:m[4]});
    }
  }
  return out.sort((a,b)=>a.time-b.time);
}

function renderLRC(lines){
  lrcBox.innerHTML = '';
  for(const it of lines){
    const div = document.createElement('div');
    div.className = 'line';
    div.dataset.time = it.time;
    div.textContent = it.text || ' ';
    lrcBox.appendChild(div);
  }
}

function syncLRC(lines, player){
  function tick(){
    const t = player.currentTime || 0;
    let idx = -1;
    for(let i=0;i<lines.length;i++){
      if (t >= lines[i].time) idx = i; else break;
    }
    els('.lrc .line').forEach((el,i)=>{
      el.classList.toggle('active', i === idx);
      if(i === idx) el.scrollIntoView({block:'nearest'});
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}