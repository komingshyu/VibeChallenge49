
export function isLikelyTinyIcon(imgEl, src){
  const w = imgEl?.naturalWidth || imgEl?.width || 0;
  const h = imgEl?.naturalHeight || imgEl?.height || 0;
  const cls = ((imgEl?.className||'') + ' ' + (imgEl?.parentElement?.className||'')).toLowerCase();
  if (w && h && (w <= 32 || h <= 32)) return true;
  if (/favicon|emoji|icon|sprite/.test(cls) && (w <= 64 || h <= 64)) return true;
  if (/www\.google\.com\/s2\/favicons/i.test(src||"")) return true;
  return false;
}
