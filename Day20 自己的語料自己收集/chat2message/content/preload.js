
(function(){
  const OWNER = location.href;
  chrome.runtime.sendMessage({ type:"REGISTER_PAGE", url: OWNER });
  chrome.runtime.sendMessage({ type:"INIT_MAIN_BRIDGE" });

  const seen = new WeakSet();
  const pending = new Set();
  const LIMIT = 4;

  function isTiny(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const cls = ((img.className||'') + ' ' + (img.parentElement?.className||'')).toLowerCase();
    if ((w && h && (w<=32 || h<=32))) return true;
    if (/favicon|emoji|icon|sprite/.test(cls) && (w<=64 || h<=64)) return true;
    if (/www\.google\.com\/s2\/favicons/i.test(img.currentSrc||img.src||"")) return true;
    return false;
  }
  function sha1(s){ const enc = new TextEncoder().encode(s); return crypto.subtle.digest("SHA-1", enc).then(buf => Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,"0")).join("")); }
  function urlHost(u){ try { return new URL(u, location.href).hostname; } catch { return ""; } }
  function shouldUseSW(u){
    const h = urlHost(u); if (!h) return false;
    const firstParty = ["chat.openai.com","chatgpt.com","claude.ai","gemini.google.com","aistudio.google.com"];
    if (firstParty.some(fp => h===fp || h.endsWith("."+fp))) return false;
    const externalPreferSW = ["oaiusercontent.com","googleusercontent.com","gstatic.com","githubusercontent.com","wikimedia.org","imgur.com"];
    if (externalPreferSW.some(d => h===d || h.endsWith("."+d))) return true;
    return true;
  }
  async function fetchViaMainBridge(url){
    const ORIGIN = location.origin;
    const id = "c2m_" + Math.random().toString(36).slice(2);
    return await new Promise((resolve, reject) => {
      const chunks=[]; let done=false;
      const onMsg = (ev) => {
        const d = ev.data || {}; if (ev.origin!==ORIGIN) return;
        if (d.__c2m!=="RES" || d.id!==id) return;
        if (!d.ok) { cleanup(); reject(new Error(d.error || ("http-"+d.status))); return; }
        if (typeof d.part === "string") chunks.push(d.part);
        if (d.final) { done=true; cleanup(); resolve(chunks.join("")); }
      };
      const cleanup = () => window.removeEventListener('message', onMsg);
      window.addEventListener('message', onMsg);
      window.postMessage({ __c2m:"REQ", kind:"fetchImage", id, url }, ORIGIN);
      setTimeout(()=>{ if(!done){ cleanup(); reject(new Error('pw-timeout')); }}, 15000);
    });
  }
  async function handleImage(img){
    if (seen.has(img)) return; seen.add(img);
    if (isTiny(img)) return;
    const src = img.currentSrc || img.src || ""; if (!src || src.startsWith("data:")) return;
    const key = "img:" + await sha1(OWNER + "|" + src);
    img.dataset.c2mKey = key;
    if (pending.has(key)) return; pending.add(key);
    try {
      if (shouldUseSW(src)) {
        const res = await chrome.runtime.sendMessage({ type:"SW_FETCH_AND_PUT", url: src, key, owner: OWNER });
        if (!res?.ok) throw new Error(res?.error || "sw-fetch-failed");
      } else {
        const dataUrl = await fetchViaMainBridge(src);
        await chrome.runtime.sendMessage({ type:"IDB_PUT_FROM_DATAURL", key, owner: OWNER, dataUrl, src });
      }
    } catch (e) {} finally { pending.delete(key); }
  }
  function scanAll(){
    if (document.visibilityState !== "visible") return;
    const imgs = Array.from(document.querySelectorAll("img")).filter(im => !seen.has(im));
    let running = 0, i=0;
    function next(){
      while (running<LIMIT && i<imgs.length){
        const im = imgs[i++]; running++; handleImage(im).finally(()=>{ running--; next(); });
      }
    }
    next();
  }
  const mo = new MutationObserver((muts) => {
    if (document.visibilityState !== "visible") return;
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType===1){ if (n.tagName==="IMG") handleImage(n); n.querySelectorAll?.("img").forEach(im => handleImage(im)); }
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });
  scanAll();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState==="visible") scanAll(); });
  if ("requestIdleCallback" in window) requestIdleCallback(scanAll, { timeout: 2000 }); else setTimeout(scanAll, 1500);
})();
