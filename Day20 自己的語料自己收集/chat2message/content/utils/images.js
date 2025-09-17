
// utils/images.js — robust image -> dataURL (base64)
export async function imageToDataURL(imgEl) {
  const w = imgEl.naturalWidth || imgEl.width || 0;
  const h = imgEl.naturalHeight || imgEl.height || 0;
  const classes = (imgEl.className||"")+" "+(imgEl.parentElement?.className||"");
  const isDecor = /avatar|icon|emoji|spinner|logo/i.test(classes);
  if ((w < 24 || h < 24) || isDecor) return { ok:false, reason:"decorative" };

  // data:
  if (imgEl.src.startsWith("data:")) return { ok:true, dataUrl: imgEl.src, width:w, height:h, source:"data" };
  // blob:
  if (imgEl.src.startsWith("blob:")) {
    try {
      const blob = await (await fetch(imgEl.src)).blob();
      const dataUrl = await blobToDataURL(blob);
      return { ok:true, dataUrl, width:w, height:h, source:"blob" };
    } catch (e) { /* continue */ }
  }
  // fetch:
  try {
    const resp = await fetch(imgEl.currentSrc || imgEl.src, { credentials:"omit", cache:"no-store" });
    const blob = await resp.blob();
    const dataUrl = await blobToDataURL(blob);
    return { ok:true, dataUrl, width:w, height:h, source:"fetch" };
  } catch (e) { /* continue */ }

  // canvas:
  try {
    const im = new Image();
    im.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => { im.onload = resolve; im.onerror = reject; im.src = imgEl.currentSrc || imgEl.src; });
    const canvas = document.createElement("canvas");
    canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.drawImage(im, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    return { ok:true, dataUrl, width:im.naturalWidth, height:im.naturalHeight, source:"canvas" };
  } catch (e) { /* continue */ }

  // screenshot fallback (visible region)
  try {
    imgEl.scrollIntoView({ block:"center", inline:"center" });
    await new Promise(r => setTimeout(r, 80));
    const rect = imgEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const res = await chrome.runtime.sendMessage({ type:"CAPTURE_ELEMENT_SCREENSHOT", rect:{ x:rect.x, y:rect.y, width:rect.width, height:rect.height }, dpr });
    if (res?.ok) return { ok:true, dataUrl: res.dataUrl, width: Math.round(rect.width), height: Math.round(rect.height), source:"screenshot" };
  } catch (e) {
    // swallow
  }
  return { ok:false, reason:"cors-blocked" };
}

export async function blobToDataURL(blob) {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
