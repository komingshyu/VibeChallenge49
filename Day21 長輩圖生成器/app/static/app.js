
// ================= Nano Banana front-end v1.0.11 =================
// All-in-one app.js (drop-in replacement)
// -----------------------------------------------------------------
const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>document.querySelectorAll(sel);
const basename = (p)=> (p||'').toString().split(/[\\\/]/).pop();
const toAssetUrl = (p)=> '/assets/gallery/' + basename(p);

// ---------------- Style presets ----------------
const STYLE_HINTS = {
  '喜氣紅金（花邊）': 'festive red and gold gradient, floral borders with peony and plum, sparkles, rays, celebratory',
  '晨光花海': 'golden hour sunlight, blooming field of flowers, pastel candy colors, soft vignette, film grain',
  '霓虹漸層': 'neon gradient background, glossy highlights, lens flare, star sparkles, modern kitsch',
  '國畫水墨': 'Chinese ink wash painting on rice paper, brush strokes, misty mountains, minimal text-free aesthetics',
  '復古海報': 'retro poster, halftone print, paper fold texture, bold composition, drop shadow',
  '可愛貼圖': 'kawaii sticker style, thick white outline, simple shapes, pastel palette, cute emojis',
  '山水風景': 'landscape with mountains and rivers, morning mist, birds in distance, poetic atmosphere',
  '療癒動物': 'adorable animals smiling, shallow depth of field, soft sunlight, lavender or grassland',
  '蓮花禪意': 'lotus pond, tranquil zen vibe, dew drops, soothing green and pink, bokeh',
  '金箔光暈': 'gold foil texture, glowing rim light, sparkles, golden particles',
  '藍天白雲': 'bright blue sky with fluffy clouds, sunshine, cheerful mood',
  '春節喜慶': 'Chinese New Year scene, red lanterns (no text), golden ingots, festive crowd bokeh',
  '母親節溫馨': 'Mother day warm pastel floral, pink carnations, soft light, family warmth',
  '聖誕節暖冬': 'Christmas cozy lights, ornaments, warm wood background, snow bokeh',
  '歲月靜好（留白克制）': 'low-saturation, soft window light, clean composition, generous negative space, gentle film grain'
};
const STYLE_KEYS = Object.keys(STYLE_HINTS);

// ---------------- Tabs ----------------
function activateTab(id){
  try{
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const sections = Array.from(document.querySelectorAll('.section'));
    tabs.forEach(t=>{
      const match = (t.dataset && t.dataset.tab) === id;
      t.classList.toggle('active', match);
      t.setAttribute('role','tab');
      t.setAttribute('aria-selected', match ? 'true' : 'false');
      t.setAttribute('tabindex', match ? '0' : '-1');
    });
    sections.forEach(s=>{
      const match = s.id === id;
      s.classList.toggle('active', match);
      s.style.display = match ? 'block' : 'none';  // inline > stylesheet
    });
    if(id === 'tab-i2i') { if(location.hash !== '#i2i') history.replaceState(null,'','#i2i'); }
    else { if(location.hash !== '#text') history.replaceState(null,'','#text'); }
  }catch(e){ console.warn('activateTab error', e); }
}
function initTabs(){
  const tabsWrap = document.querySelector('.tabs');
  if(tabsWrap){
    tabsWrap.addEventListener('click', (e)=>{
      const el = e.target.closest('.tab'); if(!el) return;
      e.preventDefault(); e.stopPropagation();
      const id = el.dataset ? el.dataset.tab : null;
      if(id) activateTab(id);
    });
    tabsWrap.addEventListener('keydown', (e)=>{
      const el = e.target.closest('.tab'); if(!el) return;
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault(); const id = el.dataset ? el.dataset.tab : null; if(id) activateTab(id);
      }
    });
  }
  const byHash = (location.hash === '#i2i') ? 'tab-i2i' : (location.hash === '#text') ? 'tab-text' : null;
  const initial = byHash || (document.querySelector('.tab.active')?.dataset.tab) || 'tab-text';
  activateTab(initial);
}
document.addEventListener('DOMContentLoaded', initTabs);

// ---------------- Dynamic fonts (for WYSIWYG preview) ----------------
const _loadedFonts = new Map();
function _basenameFont(f){ return (f||'').toString().split(/[\\\/]/).pop(); }
async function ensurePreviewFont(fontFile){
  if(!fontFile) return '';
  const base = _basenameFont(fontFile);
  const family = 'ElderPreview-' + base.replace(/\.[^.]+$/, '');
  if(_loadedFonts.has(fontFile)) return _loadedFonts.get(fontFile);
  try{
    const ext = base.split('.').pop().toLowerCase();
    const fmt = ext==='otf' ? 'opentype' : (ext==='ttf' ? 'truetype' : '');
    const url = '/assets/fonts/' + encodeURIComponent(base);
    if('fonts' in document && 'FontFace' in window){
      const face = new FontFace(family, `url(${url})` + (fmt?` format('${fmt}')`:''));
      await face.load();
      document.fonts.add(face);
      _loadedFonts.set(fontFile, family);
      return family;
    }else{
      const css = `@font-face{ font-family:'${family}'; src: url('${url}') ${fmt?`format('${fmt}')`:''}; font-display: swap; }`;
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      _loadedFonts.set(fontFile, family);
      return family;
    }
  }catch(e){
    console.warn('font load failed', e);
    return '';
  }
}
async function setPreviewFontFromSelect(){
  const sel = document.getElementById('selFont');
  if(!sel) return;
  const fam = await ensurePreviewFont(sel.value);
  if(fam){
    Array.from(document.querySelectorAll('.overlay-item')).forEach(el=>{
      el.style.fontFamily = `'${fam}', 'Noto Sans TC', sans-serif`;
    });
  }
}

// Load fonts to list + select
async function refreshFonts(){
  const res = await fetch('/api/fonts/list');
  const data = await res.json();
  const ul = $('#fontList'); if(ul) ul.innerHTML='';
  const sel = $('#selFont'); if(sel) sel.innerHTML='';
  (data.fonts || []).forEach((f,i)=>{
    if(ul){ const li = document.createElement('li'); li.textContent = f; ul.appendChild(li); }
    if(sel){ const opt = document.createElement('option'); opt.value = f; opt.textContent = f; sel.appendChild(opt); if(i===0) sel.value = f; }
  });
  await setPreviewFontFromSelect();
}
$('#btnFonts')?.addEventListener('click', async ()=>{
  const res = await fetch('/api/fonts/install', {method:'POST'});
  const data = await res.json();
  alert('字體安裝結果\\n' + JSON.stringify(data.result, null, 2));
  await refreshFonts();
});
$('#selFont')?.addEventListener('change', ()=>{ setPreviewFontFromSelect(); updateActiveLayerFromControls(); });

// ---------------- Helpers ----------------
async function addLog(sel, msg){ const el = $(sel); if(el){ el.textContent += '\\n' + msg; el.scrollTop = el.scrollHeight; } }
function setProgress(sel, p){ const el = $(sel); if(el){ el.style.width = Math.max(0, Math.min(100, p)) + '%'; } }
function flashPanel(){ const p = document.querySelector('.panel'); if(!p) return; p.classList.add('flash'); setTimeout(()=>p.classList.remove('flash'), 1200); }

// ---------------- Voice (browser fallback) ----------------
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
async function browserSpeechOnce(lang='zh-TW'){
  return new Promise((resolve)=>{
    if(!SpeechRec) return resolve('');
    try{
      const rec = new SpeechRec();
      rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
      let done=false;
      rec.onresult = (e)=>{ if(done) return; done=true; resolve((e.results[0][0].transcript||'').trim()); };
      rec.onerror = ()=>{ if(done) return; done=true; resolve(''); };
      rec.onend = ()=>{ if(done) return; done=true; resolve(''); };
      rec.start();
      setTimeout(()=>{ try{rec.stop();}catch{} }, 8000);
    }catch(err){ resolve(''); }
  });
}
let mediaRecorder, audioChunks=[], mediaStream=null;
async function toggleMic(btn){
  if(mediaRecorder && mediaRecorder.state === 'recording'){
    mediaRecorder.stop();
    btn.classList.remove('recording'); btn.setAttribute('aria-pressed','false');
    return;
  }
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({audio:true});
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks=[];
    mediaRecorder.ondataavailable = e => { if(e.data && e.data.size>0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async ()=>{
      try{ if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); } }catch{}
      if(!audioChunks.length){
        btn.classList.remove('recording'); btn.setAttribute('aria-pressed','false'); return;
      }
      const blob = new Blob(audioChunks, {type:'audio/wav'});
      const fd = new FormData(); fd.append('file', blob, 'voice.wav');
      let text = '';
      try{
        const res = await fetch('/api/voice/transcribe', {method:'POST', body: fd});
        if(res.ok){ const data = await res.json(); text = (data && data.text) ? data.text : ''; }
      }catch(e){ /* ignore */ }
      if(!text){ text = await browserSpeechOnce('zh-TW'); }
      if(text){
        const cur = $('#prompt').value.trim();
        $('#prompt').value = cur ? (cur + ' ' + text) : text;
      }else{
        alert('語音辨識目前不可用，請再試一次或直接輸入文字。');
      }
      btn.classList.remove('recording'); btn.setAttribute('aria-pressed','false');
    };
    mediaRecorder.start();
    btn.classList.add('recording'); btn.setAttribute('aria-pressed','true');
  }catch(err){
    const text = await browserSpeechOnce('zh-TW');
    if(text){
      const cur = $('#prompt').value.trim();
      $('#prompt').value = cur ? (cur + ' ' + text) : text;
    }else{
      alert('無法啟動錄音：' + err);
    }
  }
}
$('#btnVoice')?.addEventListener('click', ()=> toggleMic($('#btnVoice')));

// ---------------- Multi-layer overlay (drag + WYSIWYG) ----------------
let currentImageAbsPath = ''; let currentImageName = '';
let textLayers = [];    // each: {id, text, x, y, size, color, stroke_width, stroke_fill, font, shadow:{strength,color}}
let activeIdx = -1;

function getImgMetrics(){
  const img = $('#previewImg'); const cont = $('#previewArea');
  if(!img || !img.naturalWidth) return {iw:1, ih:1, scale:1, dispW:1, dispH:1, left:0, top:0};
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const cw = cont.clientWidth, ch = cont.clientHeight;
  const scale = Math.min(cw/iw, ch/ih);
  const dispW = iw * scale, dispH = ih * scale;
  const left = (cw - dispW) / 2; const top = (ch - dispH) / 2;
  return {iw, ih, scale, dispW, dispH, left, top};
}
function layerToCSSPos(layer){
  const m = getImgMetrics();
  const x = m.left + layer.x * m.scale; const y = m.top + layer.y * m.scale;
  return {x, y, scale: m.scale};
}
function applyFontToEl(el, fontFile){
  ensurePreviewFont(fontFile).then(fam=>{ if(fam) el.style.fontFamily = `'${fam}', 'Noto Sans TC', sans-serif`; });
}
function renderPreviewLayers(){
  const wrap = $('#overlayWrap'); if(!wrap) return;
  wrap.innerHTML = '';
  const m = getImgMetrics();
  textLayers.forEach((L, idx)=>{
    const div = document.createElement('div');
    div.className = 'overlay-item' + (idx===activeIdx ? ' active':'');
    div.dataset.idx = idx;
    const css = layerToCSSPos(L);
    div.style.transform = `translate(${Math.round(css.x)}px, ${Math.round(css.y)}px)`;
    div.style.fontSize = (L.size * css.scale) + 'px';
    div.style.color = L.color || '#ffffff';
    // scale-aware stroke width
    const sw = Math.max(0, (L.stroke_width||0) * css.scale);
    div.style.webkitTextStrokeWidth = sw + 'px';
    div.style.webkitTextStrokeColor = L.stroke_fill || '#000000';
    // shadow preview (approx)
    if(L.shadow && L.shadow.strength>0){
      const s = Math.max(0.5, L.shadow.strength * css.scale);
      div.style.textShadow = `0 ${Math.round(s)}px ${Math.round(1.5*s)}px ${L.shadow.color||'#0008'}`;
    }else{
      div.style.textShadow = 'none';
    }
    div.textContent = (L.text && L.text.trim()) ? L.text : '早安';
    applyFontToEl(div, L.font);
    wrap.appendChild(div);
  });
}
function renderLayerBar(){
  const bar = $('#layerBar'); if(!bar) return;
  bar.innerHTML='';
  textLayers.forEach((L, idx)=>{
    const chip = document.createElement('div');
    chip.className = 'layer-chip' + (idx===activeIdx ? ' active':'');
    chip.dataset.idx = idx;
    const dot = document.createElement('span'); dot.className='layer-color'; dot.style.background = L.color || '#fff';
    const label = document.createElement('span'); label.textContent = (L.text || '（空白）').slice(0,6);
    chip.appendChild(dot); chip.appendChild(label);
    chip.addEventListener('click', ()=>{ activeIdx = idx; syncControlsFromLayer(); renderLayerBar(); renderPreviewLayers(); });
    bar.appendChild(chip);
  });
}
function ensureOneLayer(){
  if(textLayers.length===0){
    const defaultText = ($('#overlayText')?.value || '早安').trim() || '早安';
    textLayers.push({
      id: 'L1', text: defaultText, x:60, y:60, size: parseInt($('#fontSize')?.value||'72')||72,
      color: $('#fontColor')?.value || '#ffffff',
      stroke_width: Math.max(0, parseInt($('#strokeWidth')?.value||'2')||2),
      stroke_fill: $('#strokeColor')?.value || '#000000',
      font: $('#selFont')?.value || 'NotoSansTC-Regular.otf',
      shadow: (parseInt($('#shadowStrength')?.value||'0')||0) > 0 ? {strength:parseInt($('#shadowStrength').value), color: ($('#shadowColor')?.value||'#00000088')} : null
    });
    activeIdx = 0;
    if($('#overlayText') && !$('#overlayText').value){ $('#overlayText').value = defaultText; }
    renderLayerBar(); renderPreviewLayers();
  }
}
function syncControlsFromLayer(){
  if(activeIdx<0 || !textLayers[activeIdx]) return;
  const L = textLayers[activeIdx];
  $('#overlayText').value = L.text || '';
  $('#fontSize').value = L.size || 72;
  $('#fontSizeRange').value = L.size || 72;
  $('#fontColor').value = L.color || '#ffffff';
  $('#strokeWidth').value = L.stroke_width || 0;
  $('#strokeColor').value = L.stroke_fill || '#000000';
  $('#selFont').value = L.font || $('#selFont').value;
  $('#shadowStrength').value = L.shadow?.strength || 0;
  $('#shadowColor').value = L.shadow?.color || '#00000088';
  setPreviewFontFromSelect();
}
function updateActiveLayerFromControls(){
  if(activeIdx<0 || !textLayers[activeIdx]) return;
  const L = textLayers[activeIdx];
  const t = ($('#overlayText').value || '').trim();
  if(t) L.text = t; // 避免被空字覆蓋
  L.size = parseInt($('#fontSize').value||$('#fontSizeRange').value||72);
  L.color = $('#fontColor').value || '#ffffff';
  L.stroke_width = Math.max(0, parseInt($('#strokeWidth').value||'0')||0);
  L.stroke_fill = $('#strokeColor').value || '#000000';
  L.font = $('#selFont').value || 'NotoSansTC-Regular.otf';
  const s = parseInt($('#shadowStrength').value||'0')||0;
  L.shadow = s>0 ? {strength:s, color: $('#shadowColor').value || '#00000088'} : null;
  renderLayerBar();
  renderPreviewLayers();
}
// control listeners
['overlayText','fontSize','fontSizeRange','strokeWidth','shadowStrength'].forEach(id=>{
  const el = document.getElementById(id); if(!el) return;
  el.addEventListener('input', updateActiveLayerFromControls);
  el.addEventListener('change', updateActiveLayerFromControls);
});
['fontColor','strokeColor','shadowColor','selFont'].forEach(id=>{
  const el = document.getElementById(id); if(!el) return;
  el.addEventListener('input', updateActiveLayerFromControls);
  el.addEventListener('change', updateActiveLayerFromControls);
});
// drag (delta, clamp)
(function enableLayerDragging(){
  const wrap = $('#overlayWrap'); if(!wrap) return;
  let dragging=false, idx=-1, deltaX=0, deltaY=0;
  function posToRel(clientX, clientY){
    const rect = $('#previewArea').getBoundingClientRect();
    const m = getImgMetrics();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    const relX = (cx - m.left) / m.scale; const relY = (cy - m.top) / m.scale;
    return {relX, relY, m};
  }
  wrap.addEventListener('pointerdown', (e)=>{
    const el = e.target.closest('.overlay-item'); if(!el) return;
    e.preventDefault();
    dragging=true;
    idx = parseInt(el.dataset.idx);
    activeIdx = idx; syncControlsFromLayer(); renderLayerBar();
    const L = textLayers[idx];
    const {relX, relY} = posToRel(e.clientX, e.clientY);
    deltaX = L.x - relX; deltaY = L.y - relY;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, {once:true});
  });
  function onMove(e){
    if(!dragging || idx<0) return;
    const {relX, relY, m} = posToRel(e.clientX, e.clientY);
    let x = relX + deltaX, y = relY + deltaY;
    x = Math.max(0, Math.min(m.iw, x));
    y = Math.max(0, Math.min(m.ih, y));
    textLayers[idx].x = x; textLayers[idx].y = y;
    renderPreviewLayers();
  }
  function onUp(){ dragging=false; idx=-1; window.removeEventListener('pointermove', onMove); }
})();

// ---------------- Preview / Gallery ----------------
function setPreviewFromAbsPath(absPath){
  currentImageAbsPath = absPath || ''; currentImageName = basename(absPath||''); 
  $('#previewImg').src = currentImageName ? toAssetUrl(absPath) : '';
  ensureOneLayer();
  setTimeout(()=>{ renderPreviewLayers(); }, 0);
}
$('#previewImg')?.addEventListener('load', ()=>{ renderPreviewLayers(); });
window.addEventListener('resize', ()=>{ renderPreviewLayers(); });
async function refreshGallery(){
  const res = await fetch('/api/gallery'); const data = await res.json();
  const g = $('#gallery'); if(!g) return;
  g.innerHTML='';
  (data.items || []).forEach(it=>{
    const div = document.createElement('div');
    div.className='card';
    const img = document.createElement('img');
    img.src = '/assets/gallery/' + it.name;
    img.dataset.absPath = it.path;
    img.addEventListener('click', ()=> setPreviewFromAbsPath(it.path));
    div.appendChild(img); g.appendChild(div);
  });
}

// ---------------- I2I upload previews + themes ----------------
(function bindI2IPreviews(){
  const gp = document.getElementById('fileGrandparent');
  const gc = document.getElementById('fileGrandchild');
  const gpPrev = document.getElementById('gpPrev');
  const gcPrev = document.getElementById('gcPrev');
  function setPrev(input, img, holder){
    const f = input?.files?.[0];
    if(!img) return;
    try{ if(holder && holder.url){ URL.revokeObjectURL(holder.url); } }catch{}
    if(f){ const u = URL.createObjectURL(f); img.src = u; if(holder) holder.url = u; }
    else{ img.removeAttribute('src'); }
  }
  gp?.addEventListener('change', ()=> setPrev(gp, gpPrev, (gpPrev._h||(gpPrev._h={}))) );
  gc?.addEventListener('change', ()=> setPrev(gc, gcPrev, (gcPrev._h||(gcPrev._h={}))) );
})();

const I2I_TEMPLATES = [
  {k:'夜市走走', t:'熱鬧的台灣夜市，紅燈籠與招牌光影，祖孫手拿小吃微笑合照，暖色調，乾淨背景層次'},
  {k:'廟口吃冰', t:'古色古香的廟埕，石狮與香爐背景，祖孫坐在階梯吃剉冰，夏日陽光通透'},
  {k:'海邊放風箏', t:'晴朗藍天與海風，沙灘邊放風箏，祖孫笑得燦爛，衣著隨風飄動'},
  {k:'郊外野餐', t:'綠地野餐墊、藤籃、果汁與三明治，祖孫坐在樹蔭下，柔和日光逆光邊緣光'},
  {k:'賞花踏青', t:'花海步道，粉嫩與清新色調，祖孫牽手漫步，背景柔焦'},
  {k:'溫泉旅宿', t:'日式溫泉旅館庭院，紙燈籠與木造走廊，祖孫穿浴衣輕鬆合影'},
  {k:'動物園冒險', t:'園區綠意與指示牌，祖孫看著長頸鹿或小熊貓，表情驚喜'},
  {k:'公園運動', t:'晨光草皮與跑步道，祖孫慢跑或伸展，清爽配色'},
  {k:'腳踏車同樂', t:'河濱單車道，安全帽、慢速騎行，愜意微笑'},
  {k:'過年圍爐', t:'紅金喜氣餐桌，全家圍爐的暖光，祖孫在鏡頭前比手勢'},
  {k:'中秋烤肉', t:'庭院燈串，烤肉爐與食材香氣，祖孫翻烤食物，溫暖聚會'},
  {k:'生日慶生', t:'蛋糕、蠟燭與彩帶，祖孫在客廳前合影，柔焦燈光'},
  // 歲月靜好（bj6zj4wj6）
  {k:'歲月靜好·院子喝茶', t:'老屋院子，木桌與陶壺清茶，祖孫安靜對坐，柔和陰影與留白，低飽和細膩色調'},
  {k:'歲月靜好·晨間散步', t:'巷弄清晨薄霧，祖孫慢步相扶，留白與簡潔構圖，低飽和色調'},
  {k:'歲月靜好·窗邊讀書', t:'窗光灑落的木椅，祖孫共讀一本書，細節溫潤，寧靜氛圍'}
];
function buildI2IThemes(){
  const row = $('#i2iThemes'); if(!row) return;
  row.innerHTML = '';
  I2I_TEMPLATES.forEach(it=>{
    const chip = document.createElement('div');
    chip.className = 'theme-chip';
    chip.textContent = it.k;
    chip.title = it.t;
    chip.addEventListener('click', ()=>{ $('#i2iPrompt').value = it.t; });
    row.appendChild(chip);
  });
}

// ---------------- Text-to-Image stream ----------------
$('#btnGenText')?.addEventListener('click', async ()=>{
  $('#log') && ($('#log').textContent='');
  setProgress('#progressBar', 2);
  const user = $('#prompt').value.trim();
  const styleKey = $('#stylePreset')?.value || STYLE_KEYS[0];
  const style = STYLE_HINTS[styleKey];
  const prompt = (user? (style + ', ' + user) : (style + ', family warmth')) + ', no text, no letters, typography-free.';

  const es = new EventSource('/api/generate/text/stream?prompt=' + encodeURIComponent(prompt));
  let lastPath = null; let count=0;
  es.onmessage = (e)=>{
    try{
      const evt = JSON.parse(e.data);
      if(evt.event==='status'){ addLog('#log', evt.text); }
      else if(evt.event==='image_chunk_saved'){
        count++; setProgress('#progressBar', Math.min(95, count*30));
        lastPath = evt.path;
        setPreviewFromAbsPath(lastPath); refreshGallery(); ensureOneLayer(); $('#overlayText')?.focus(); flashPanel();
      }else if(evt.event==='completed'){
        setProgress('#progressBar', 100);
        if(!lastPath && evt.images && evt.images.length){ lastPath = evt.images[evt.images.length-1]; setPreviewFromAbsPath(lastPath); refreshGallery(); ensureOneLayer(); $('#overlayText')?.focus(); flashPanel(); }
        es.close();
      }else if(evt.event==='error'){
        addLog('#log', '錯誤：' + evt.message); es.close();
      }
    }catch{ /* ignore */ }
  };
  es.onerror = ()=>{ es.close(); };
});

// ---------------- Image-to-Image stream (POST + manual SSE parse) ----------------
$('#btnGenI2I')?.addEventListener('click', async ()=>{
  $('#log2') && ($('#log2').textContent='');
  setProgress('#progressBar2', 2);
  const user2 = $('#i2iPrompt').value.trim();
  const styleKey2 = $('#stylePreset2')?.value || STYLE_KEYS[2];
  const style2 = STYLE_HINTS[styleKey2];
  const prompt = (user2? (style2 + ', ' + user2) : (style2 + ', family outing')) + ', no text, no letters, no words, typography-free';

  const fd = new FormData();
  fd.append('prompt', prompt);
  // IMPORTANT: keep order: grandparent first, grandchild second
  if($('#fileGrandparent')?.files[0]) fd.append('grandparent', $('#fileGrandparent').files[0]);
  if($('#fileGrandchild')?.files[0]) fd.append('grandchild', $('#fileGrandchild').files[0]);

  const resp = await fetch('/api/generate/image2image/stream', {method:'POST', body: fd});
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = ''; let count=0; let lastPath = null;

  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    buf += dec.decode(value, {stream:true});

    // 兼容 CRLF 與 LF 的 SSE 分隔
    const parts = buf.split(/\r?\n\r?\n/);
    for(let i=0;i<parts.length-1;i++){
      const line = parts[i].replace(/^event:\s*\w+\s*\r?\n?/,'').replace(/^data:\s?/, '').trim();
      if(!line) continue;
      let evt;
      try{ evt = JSON.parse(line); }catch{ continue; }

      if(evt.event === 'status'){
        addLog('#log2', evt.text);
      }else if(evt.event === 'image_chunk_saved'){
        count++; setProgress('#progressBar2', Math.min(95, count*30));
        lastPath = evt.path;
        setPreviewFromAbsPath(lastPath); refreshGallery(); ensureOneLayer(); $('#overlayText')?.focus(); flashPanel();
      }else if(evt.event === 'completed'){
        setProgress('#progressBar2', 100);
        if(!lastPath && evt.images && evt.images.length){
          lastPath = evt.images[evt.images.length-1];
          setPreviewFromAbsPath(lastPath); refreshGallery(); ensureOneLayer(); $('#overlayText')?.focus(); flashPanel();
        }
      }else if(evt.event === 'error'){
        addLog('#log2', '錯誤：' + evt.message);
      }
    }
    buf = parts[parts.length-1];
  }
});

// ---------------- Overlay: apply, save, delete, share ----------------
$('#btnOverlay')?.addEventListener('click', async ()=>{
  if(!currentImageAbsPath){ alert('請先生成或選擇圖片'); return; }
  const texts = textLayers.map(L=> ({
    text: L.text || '早安', x: Math.round(L.x), y: Math.round(L.y), size: L.size,
    color: L.color, font: L.font, align: 'left',
    stroke_width: L.stroke_width, stroke_fill: L.stroke_fill,
    shadow: L.shadow
  }));
  const res = await fetch('/api/overlay/render', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({base_image_path: currentImageAbsPath, texts}) });
  const data = await res.json(); if(data.output){ setPreviewFromAbsPath(data.output); refreshGallery(); }
});
$('#btnSave')?.addEventListener('click', ()=>{
  if(!currentImageAbsPath){ alert('請先生成或選擇圖片'); return; }
  const a = document.createElement('a'); a.href = toAssetUrl(currentImageAbsPath); a.download = basename(currentImageAbsPath) || 'image.jpg'; a.click();
});
$('#btnDelete')?.addEventListener('click', async ()=>{
  if(!currentImageAbsPath){ alert('請先選擇圖片'); return; }
  const name = basename(currentImageAbsPath); if(!confirm('確定刪除 ' + name + ' ?')) return;
  const res = await fetch('/api/gallery/' + encodeURIComponent(name), {method:'DELETE'});
  const data = await res.json(); if(data.deleted){ currentImageAbsPath=''; currentImageName=''; $('#previewImg').src=''; $('#overlayWrap').innerHTML=''; refreshGallery(); }
});
$('#btnShare')?.addEventListener('click', async ()=>{
  if(!currentImageAbsPath){ alert('請先選擇圖片'); return; }
  const res = await fetch('/api/share/payload', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({image_path: currentImageAbsPath})});
  const data = await res.json(); const url = data.data_url;
  if(navigator.share){
    try{ const resp = await fetch(url); const blob = await resp.blob(); const file = new File([blob], 'share.jpg', {type: blob.type}); await navigator.share({title:'長輩圖', text:'分享給家人朋友', files:[file]}); return; }catch(e){ console.warn(e); }
  }
  const win = window.open(); win.document.write('<img src=\"'+url+'\" style=\"max-width:100%;height:auto;\" />');
});

// ---------------- Optimize / Ideas ----------------
$('#btnPro')?.addEventListener('click', async ()=>{
  const prompt = $('#prompt').value.trim();
  const res = await fetch('/api/prompt/optimize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({prompt}) });
  const data = await res.json(); $('#prompt').value = data.optimized || prompt;
});
$('#btnIdea')?.addEventListener('click', async ()=>{
  const res = await fetch('/api/prompt/ideate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({theme:'祖孫出遊'}) });
  const data = await res.json(); const ideas = data.ideas || []; if(ideas.length){ $('#prompt').value = ideas[Math.floor(Math.random()*ideas.length)]; }
});

// ---------------- Init ----------------
function fillStyleSelects(){
  const sel1 = document.getElementById('stylePreset');
  const sel2 = document.getElementById('stylePreset2');
  if(sel1 && !sel1.options.length){ STYLE_KEYS.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel1.appendChild(o); }); sel1.selectedIndex=0; }
  if(sel2 && !sel2.options.length){ STYLE_KEYS.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel2.appendChild(o); }); sel2.selectedIndex=2; }
}
(async function init(){
  fillStyleSelects();
  await refreshFonts();
  await refreshGallery();
  buildI2IThemes();
  ensureOneLayer();
  renderPreviewLayers();
})();
