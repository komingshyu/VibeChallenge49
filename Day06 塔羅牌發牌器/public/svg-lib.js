// --- 幾何牌底與圖標庫 ---

function defsBase({ id='cardDefs' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');

  // 漸層
  const rg = document.createElementNS(ns, 'radialGradient');
  rg.setAttribute('id', 'glow');
  rg.setAttribute('cx', '50%'); rg.setAttribute('cy', '20%'); rg.setAttribute('r', '70%');
  rg.innerHTML = `
    <stop offset="0%" stop-color="#5d5fe9" stop-opacity="0.16"/>
    <stop offset="60%" stop-color="#1db4c2" stop-opacity="0.10"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  `;

  // 背景網格 pattern
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.setAttribute('id', 'grid');
  pattern.setAttribute('width', '18');
  pattern.setAttribute('height', '18');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  const ppath = document.createElementNS(ns, 'path');
  ppath.setAttribute('d', 'M0 18H18M18 0V18');
  ppath.setAttribute('stroke', '#e9eaf6');
  ppath.setAttribute('stroke-width', '1');
  ppath.setAttribute('opacity', '0.8');

  pattern.appendChild(ppath);

  // 細點 pattern
  const patternDots = document.createElementNS(ns, 'pattern');
  patternDots.setAttribute('id', 'dots');
  patternDots.setAttribute('width', '42');
  patternDots.setAttribute('height', '42');
  patternDots.setAttribute('patternUnits', 'userSpaceOnUse');
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', '6'); dot.setAttribute('cy', '6'); dot.setAttribute('r', '1.2');
  dot.setAttribute('fill', '#b6b8f2'); dot.setAttribute('opacity', '0.35');
  patternDots.appendChild(dot);

  // 發光濾鏡（微）
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', 'softGlow');
  filter.innerHTML = `
    <feGaussianBlur stdDeviation="3.2" result="blur"/>
    <feBlend in="SourceGraphic" in2="blur" mode="screen"/>
  `;

  defs.appendChild(rg);
  defs.appendChild(pattern);
  defs.appendChild(patternDots);
  defs.appendChild(filter);
  return defs;
}

// 圖標庫（以簡單 path 表示常見象徵）
function iconPath(name) {
  // 所有 path 均置於 100x100 視窗
  switch (name) {
    case 'wands': return 'M52 12 l6 10 -26 64 -6 -10 z M42 76 l24 -60 6 10 -24 60 z';
    case 'cups': return 'M20 20 h60 a0 0 0 0 1 0 0 v10 c0 18 -16 32 -30 38 v16 h-10 v-16 c-14 -6 -30 -20 -30 -38 v-10 z';
    case 'swords': return 'M50 10 l6 8 -6 60 -6 -60 z M40 84 h20 v6 h-20 z';
    case 'pentacles': return 'M50 16 a34 34 0 1 1 -0.1 0 z M50 28 l8 24 h-16 z M34 58 h32 l-26 18 z';
    case 'sun': return 'M50 28 a22 22 0 1 1 0 44 a22 22 0 1 1 0 -44 M50 10 v10 M50 80 v10 M20 50 h10 M70 50 h10 M28 28 l6 6 M66 66 l6 6 M28 72 l6 -6 M66 34 l6 -6';
    case 'moon': return 'M66 26 a28 28 0 1 1 -0.1 0 a18 28 0 1 0 0.1 0';
    case 'moon2': return 'M64 28 a26 26 0 1 1 -0.1 0 a18 26 0 1 0 0.1 0';
    case 'star': return 'M50 14 l8 22 h24 l-20 14 8 22 -20 -14 -20 14 8 -22 -20 -14 h24 z';
    case 'wheel': return 'M50 18 a30 30 0 1 1 0 60 a30 30 0 1 1 0 -60 M50 18 v60 M20 48 h60 M32 30 l36 36 M32 66 l36 -36';
    case 'wheel2': return 'M50 18 a30 30 0 1 1 0 60 a30 30 0 1 1 0 -60 M50 18 v60 M20 48 h60';
    case 'lantern': return 'M50 18 a10 10 0 0 1 10 10 v4 h-20 v-4 a10 10 0 0 1 10 -10 M40 32 h20 v34 a10 10 0 0 1 -20 0 z';
    case 'infinity': return 'M30 50 c0 -12 16 -18 28 -8 c12 10 28 4 28 -8 c0 12 -16 18 -28 8 c-12 -10 -28 -4 -28 8 z';
    case 'fool': return 'M26 70 l18 -18 12 12 18 -18 6 6 -24 24 -12 -12 -12 12 z M50 20 l8 10';
    case 'wheat': return 'M44 20 c-2 12 10 24 22 26 c-12 2 -24 14 -26 26 c-2 -12 -14 -24 -26 -26 c12 -2 24 -14 26 -26 z';
    case 'crown': return 'M20 54 l10 -20 20 16 20 -16 10 20 v14 h-60 z';
    case 'keys': return 'M28 64 a10 10 0 1 1 0 0 M30 64 h28 v6 h-28 z M56 36 l12 12 -8 8 -12 -12 z';
    case 'heart': return 'M50 76 l-26 -26 a16 16 0 0 1 26 -20 a16 16 0 0 1 26 20 z';
    case 'lion': return 'M32 64 a18 18 0 1 0 36 0 v-8 h-36 z M34 36 a18 14 0 1 1 32 0 v8 h-32 z';
    case 'scales': return 'M50 24 v44 M28 40 h44 M34 40 a10 10 0 1 0 0 0 M66 40 a10 10 0 1 0 0 0';
    case 'triangle': return 'M50 20 l24 50 h-48 z M50 34 v24';
    case 'scythe': return 'M36 18 v64 h8 v-36 c20 -10 28 -22 30 -34 c-10 8 -22 12 -38 14 z';
    case 'vessel': return 'M34 22 h32 v12 c0 18 -8 30 -16 36 c-8 -6 -16 -18 -16 -36 z M42 74 h16 v6 h-16 z';
    case 'horns': return 'M24 36 c0 -12 16 -18 24 -8 c8 -10 24 -4 24 8 c0 12 -16 18 -24 8 c-8 10 -24 4 -24 -8 z';
    case 'tower': return 'M40 20 h20 v16 h-20 z M38 36 h24 v44 h-24 z M34 80 h32 v6 h-32 z';
    case 'trumpet': return 'M34 52 h26 l16 10 -16 10 h-26 z M32 42 v36h6 v-36 z';
    case 'laurel': return 'M50 16 c-16 8 -24 20 -24 36 s8 28 24 36 c16 -8 24 -20 24 -36 s-8 -28 -24 -36 z';
    default:
      return 'M20 50 h60'; // fallback
  }
}

function iconSvg(name, { size=88 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', iconPath(name));
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', '#3b3f9f');
  p.setAttribute('stroke-width', '3');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('filter', 'url(#softGlow)');
  g.appendChild(p);
  g.setAttribute('transform', `translate(6,6) scale(1)`);
  return g;
}

/**
 * 建立一張卡片的 SVG（若 card 為 null，呈現牌背）
 */
export function createCardSVG(card, { width=140, height=228 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 350 570'); // 統一內部尺寸，對應 35:57 比例
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const defs = defsBase();
  svg.appendChild(defs);

  // 背景
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x','5'); rect.setAttribute('y','5');
  rect.setAttribute('width','340'); rect.setAttribute('height','560');
  rect.setAttribute('rx','24');
  rect.setAttribute('fill','#ffffff');
  rect.setAttribute('stroke','#dee0f4');
  rect.setAttribute('stroke-width','2');
  rect.setAttribute('filter','url(#softGlow)');
  svg.appendChild(rect);

  // 幾何底紋
  const grid = document.createElementNS(ns, 'rect');
  grid.setAttribute('x','5'); grid.setAttribute('y','5');
  grid.setAttribute('width','340'); grid.setAttribute('height','560');
  grid.setAttribute('rx','24');
  grid.setAttribute('fill','url(#grid)');
  grid.setAttribute('opacity','0.7');
  svg.appendChild(grid);

  const dots = document.createElementNS(ns, 'rect');
  dots.setAttribute('x','5'); dots.setAttribute('y','5');
  dots.setAttribute('width','340'); dots.setAttribute('height','560');
  dots.setAttribute('rx','24');
  dots.setAttribute('fill','url(#dots)');
  dots.setAttribute('opacity','0.4');
  svg.appendChild(dots);

  const glow = document.createElementNS(ns, 'rect');
  glow.setAttribute('x','5'); glow.setAttribute('y','5');
  glow.setAttribute('width','340'); glow.setAttribute('height','560');
  glow.setAttribute('rx','24');
  glow.setAttribute('fill','url(#glow)');
  svg.appendChild(glow);

  // 內邊界
  const frame = document.createElementNS(ns, 'rect');
  frame.setAttribute('x','20'); frame.setAttribute('y','20');
  frame.setAttribute('width','310'); frame.setAttribute('height','530');
  frame.setAttribute('rx','18');
  frame.setAttribute('fill','rgba(255,255,255,0.82)');
  frame.setAttribute('stroke','#e3e6fb');
  frame.setAttribute('stroke-width','1.5');
  svg.appendChild(frame);

  // 牌背（card == null）
  if (!card) {
    const emblem = iconSvg('star');
    emblem.setAttribute('transform','translate(90,140) scale(1.2)');
    svg.appendChild(emblem);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x','175'); text.setAttribute('y','480');
    text.setAttribute('text-anchor','middle'); text.setAttribute('font-size','28');
    text.setAttribute('fill','#4b4fd6'); text.setAttribute('font-weight','700');
    text.textContent = 'TAROT';
    svg.appendChild(text);
    return svg;
  }

  // 卡面：圖標
  const gIcon = iconSvg(card.icon || 'star');
  gIcon.setAttribute('transform','translate(96,150) scale(1.3)');
  if (card.reversed) {
    gIcon.setAttribute('transform','translate(96,150) scale(1.3) rotate(180,79,79)');
  }
  svg.appendChild(gIcon);

  // 卡面：標題（上/下）
  const title = document.createElementNS(ns, 'text');
  title.setAttribute('x','175'); title.setAttribute('y','72');
  title.setAttribute('text-anchor','middle'); title.setAttribute('font-size','22');
  title.setAttribute('fill','#2d2f7a'); title.setAttribute('font-weight','700');
  title.textContent = card.arcana === 'major' ? (card.zhName || card.name) : (card.zhName || card.name);
  svg.appendChild(title);

  const footer = document.createElementNS(ns, 'text');
  footer.setAttribute('x','175'); footer.setAttribute('y','520');
  footer.setAttribute('text-anchor','middle'); footer.setAttribute('font-size','16');
  footer.setAttribute('fill','#5b5e6a');
  footer.textContent = card.arcana === 'major'
    ? card.name
    : `${card.rankEn || card.rank} of ${card.suit?.[0]?.toUpperCase()}${card.suit?.slice(1)}`;
  svg.appendChild(footer);

  // 正/逆位徽記
  const badge = document.createElementNS(ns, 'rect');
  badge.setAttribute('x','268'); badge.setAttribute('y','28');
  badge.setAttribute('rx','8'); badge.setAttribute('width','66'); badge.setAttribute('height','28');
  badge.setAttribute('fill', card.reversed ? 'rgba(255,105,97,.08)' : 'rgba(93,95,233,.08)');
  badge.setAttribute('stroke', card.reversed ? '#ff6b6b' : '#6b6df2');
  badge.setAttribute('stroke-width','1');
  svg.appendChild(badge);

  const btxt = document.createElementNS(ns, 'text');
  btxt.setAttribute('x','301'); btxt.setAttribute('y','48');
  btxt.setAttribute('text-anchor','middle'); btxt.setAttribute('font-size','14');
  btxt.setAttribute('fill', card.reversed ? '#b74040' : '#4547c8');
  btxt.textContent = card.reversed ? '逆位' : '正位';
  svg.appendChild(btxt);

  return svg;
}