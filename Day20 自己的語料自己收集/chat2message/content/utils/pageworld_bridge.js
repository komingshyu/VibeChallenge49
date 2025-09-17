
(function(){
  if (window.__C2M_PW_READY__) return; window.__C2M_PW_READY__=true;
  const ORIGIN = location.origin;
  window.addEventListener("message", async (ev) => {
    const msg = ev.data || {};
    if (!msg || msg.__c2m!=="REQ" || msg.kind!=="fetchImage") return;
    if (ev.origin !== ORIGIN) return;
    const { id, url } = msg;
    try {
      const resp = await fetch(url, { credentials:"include", cache:"no-store" });
      if (!resp.ok) { window.postMessage({ __c2m:"RES", id, ok:false, status:resp.status }, ORIGIN); return; }
      const blob = await resp.blob();
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = fr.result || "";
        const CHUNK = 256*1024; let seq=0;
        for (let i=0; i<dataUrl.length; i+=CHUNK) {
          const part = dataUrl.slice(i, i+CHUNK);
          window.postMessage({ __c2m:"RES", id, ok:true, seq, part, final:(i+CHUNK)>=dataUrl.length }, ORIGIN);
          seq++;
        }
      };
      fr.onerror = () => window.postMessage({ __c2m:"RES", id, ok:false, error:"reader" }, ORIGIN);
      fr.readAsDataURL(blob);
    } catch (e) {
      window.postMessage({ __c2m:"RES", id, ok:false, error:String(e) }, ORIGIN);
    }
  }, false);
})();
