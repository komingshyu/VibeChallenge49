
// MAIN-world bridge (installed once by background.js) + concurrency helpers
function looksData(u){ return typeof u==='string' && u.startsWith('data:'); }
function looksBlob(u){ return typeof u==='string' && u.startsWith('blob:'); }
function looksHttp(u){ return typeof u==='string' && /^https?:/i.test(u); }

export function isLikelyTinyIcon(imgEl, src){
  const w = imgEl.naturalWidth || imgEl.width || 0;
  const h = imgEl.naturalHeight || imgEl.height || 0;
  const cls = ((imgEl.className||'') + ' ' + (imgEl.parentElement?.className||'')).toLowerCase();
  if (w && h && (w <= 32 || h <= 32)) return true;
  if (/favicon|emoji|icon|sprite/.test(cls) && (w <= 64 || h <= 64)) return true;
  if (/www\.google\.com\/s2\/favicons/i.test(src)) return true;
  return false;
}

export async function getImageDataURL(imgEl, { preferPageWorld=true, fallbackCrop=true, trace } = {}){
  const src = imgEl.currentSrc || imgEl.src || '';
  if (!src) throw new Error('no-src');
  if (isLikelyTinyIcon(imgEl, src)) throw new Error('skip-icon');
  if (looksData(src)) return src;

  const t0 = performance.now();

  // 1) MAIN-world bridge via postMessage (credentials include)
  if (preferPageWorld && (looksHttp(src) || looksBlob(src))) {
    try {
      const data = await pwFetchViaBridge(src);
      if (looksData(data)) {
        trace && trace.push({method:"main-world", ms: Math.round(performance.now()-t0), len: data.length});
        return data;
      }
    } catch (e) {
      // continue
    }
  }

  // 2) Content fetch (no cookies)
  try {
    const r = await fetch(src, { credentials:"omit", cache:"no-store" });
    if (r.ok) {
      const blob = await r.blob();
      const data = await blobToDataURL(blob);
      if (looksData(data)) {
        trace && trace.push({method:"content-fetch", ms: Math.round(performance.now()-t0), len: data.length});
        return data;
      }
    }
  } catch {}

  // 3) crossOrigin canvas
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=src; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img,0,0);
    const data = c.toDataURL('image/png');
    if (looksData(data)) {
      trace && trace.push({method:"canvas", ms: Math.round(performance.now()-t0), len: data.length});
      return data;
    }
  } catch {}

  // 4) visible crop fallback
  if (fallbackCrop) {
    imgEl.scrollIntoView({block:'center', inline:'center'});
    await new Promise(r=>setTimeout(r,50));
    const rect = imgEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    try {
      const res = await chrome.runtime.sendMessage({ type:"CAPTURE_ELEMENT_SCREENSHOT", rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}, dpr });
      if (res?.ok && looksData(res.dataUrl)) {
        trace && trace.push({method:"visible-crop", ms: Math.round(performance.now()-t0), len: res.dataUrl.length});
        return res.dataUrl;
      }
    } catch {}
  }
  throw new Error('image-fetch-failed');
}

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(blob);
  });
}

function pwFetchViaBridge(url){
  const ORIGIN = location.origin;
  const id = "c2m_" + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject)=>{
    const chunks=[]; let done=false;
    const onMsg = (ev) => {
      const d = ev.data || {};
      if (ev.origin !== ORIGIN) return;
      if (d.__c2m !== "RES" || d.id !== id) return;
      if (!d.ok) { cleanup(); reject(new Error(d.error || ("http-"+d.status))); return; }
      if (typeof d.part === "string") chunks.push(d.part);
      if (d.final) { done=true; cleanup(); resolve(chunks.join("")); }
    };
    const cleanup = () => window.removeEventListener('message', onMsg);
    window.addEventListener('message', onMsg);
    window.postMessage({ __c2m:"REQ", kind:"fetchImage", id, url }, ORIGIN);
    setTimeout(()=>{ if (!done) { cleanup(); reject(new Error('pw-timeout')); } }, 15000);
  });
}

// Concurrency limiter
export async function mapLimit(items, limit, worker){
  const ret = new Array(items.length);
  let i = 0, running = 0;
  return await new Promise((resolve) => {
    function next(){
      if (i >= items.length && running === 0) return resolve(ret);
      while (running < limit && i < items.length) {
        const idx = i++, it = items[idx];
        running++;
        Promise.resolve(worker(it, idx)).then(v => ret[idx]=v).catch(e => ret[idx]={error:String(e)}).finally(()=>{
          running--; next();
        });
      }
    }
    next();
  });
}
