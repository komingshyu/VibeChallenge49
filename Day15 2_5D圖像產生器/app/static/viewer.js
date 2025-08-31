;(function () {
  const CFG = {
    // 以舞台寬/高為基準的視差位移幅度（比例）
    PARALLAX_MIN: 0.03,
    PARALLAX_MAX: 0.14,
    // 近景縮放增益：s = 1 + SCALE_GAIN * weight（weight=近1/遠0）
    SCALE_GAIN: 0.08,
    MAX_TILT_DEG: 7
  };

  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp  = (a,b,t)=>a+(b-a)*t;

  // 將 0..1 的 mean_depth 轉為「近=1 / 遠=0」的權重
  function depthWeight(meanDepth01) {
    const t = clamp(meanDepth01, 0, 1);
    return 1 - t;
  }

  // 建立 DOM 節點
  function el(tag, attrs={}, ...children) {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) {
      if (c==null) continue;
      e.appendChild(typeof c==='string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function px(n){ return `${n.toFixed(2)}px`; }

  // 根據 bbox、anchor 與 scale，推導「保持完整可視」所允許的平移範圍
  function computeTranslateBounds(W, H, bbox, anchor, scale){
    const ax = anchor.x * W, ay = anchor.y * H;
    const x0 = bbox.x0 * W, y0 = bbox.y0 * H, x1 = bbox.x1 * W, y1 = bbox.y1 * H;
    // 以 anchor 為 transform-origin，縮放後邊界位置： ax + (edge-ax)*scale
    const leftAfterScale   = ax + (x0 - ax) * scale;
    const rightAfterScale  = ax + (x1 - ax) * scale;
    const topAfterScale    = ay + (y0 - ay) * scale;
    const bottomAfterScale = ay + (y1 - ay) * scale;

    // 要求：0 <= edge + tx <= W / H
    const margin = 2; // 小邊界，避免剛好卡邊
    const txMin = -leftAfterScale + 0 + margin;
    const txMax = W - rightAfterScale - margin;
    const tyMin = -topAfterScale + 0 + margin;
    const tyMax = H - bottomAfterScale - margin;
    return {txMin, txMax, tyMin, tyMax};
  }

  function initViewer(payload){
    const outer = document.getElementById('viewer-outer');
    const tilt  = document.getElementById('viewer-tilt');
    const root  = document.getElementById('viewer'); // 舞台

    if (!outer || !tilt || !root) return;

    // reset
    root.innerHTML = '';

    const bgB64 = payload.bg;
    const instances = (payload.instances||[]).slice().sort((a,b)=>a.mean_depth - b.mean_depth); // 遠 → 近

    // 背景
    const bgImg = el('img', {class: 'bg', alt: 'background'});
    bgImg.src = `data:image/png;base64,${bgB64}`;
    bgImg.onload = function(){
      const Wimg = bgImg.naturalWidth, Himg = bgImg.naturalHeight;

      // 設定舞台比例（與輸入相同）
      root.style.position = 'absolute';
      root.style.inset = '0';
      root.style.overflow = 'hidden';

      // 背景層
      const bgWrap = el('div', {class:'bg-wrap', style:{position:'absolute', inset:'0'}}, bgImg);
      root.appendChild(bgWrap);

      // 建立前景層
      const layers = [];
      for (let i=0;i<instances.length;i++){
        const inst = instances[i];
        const img = new Image();
        img.decoding = 'async';
        img.alt = `fg-${inst.id}`;
        img.className = 'fg-img';
        img.src = `data:image/png;base64,${inst.img_b64}`;

        const wrap = el('div', {
          class: 'fg-wrap',
          style: {
            position: 'absolute',
            inset: '0',
            transformOrigin: `${(inst.anchor.x*100).toFixed(3)}% ${(inst.anchor.y*100).toFixed(3)}%`,
            willChange: 'transform'
          }
        }, img);

        // z-index：遠景小、近景大
        wrap.style.zIndex = String(100 + Math.round(depthWeight(inst.mean_depth) * 100));
        root.appendChild(wrap);

        // 每層的狀態
        const weight = depthWeight(inst.mean_depth);
        const scale  = 1 + CFG.SCALE_GAIN * weight;
        const bounds = computeTranslateBounds(Wimg, Himg, inst.bbox, inst.anchor, scale);

        layers.push({wrap, inst, weight, scale, bounds, tx:0, ty:0});
      }

      // 指標/傾斜
      const MAX_TILT = CFG.MAX_TILT_DEG;

      function update(mouseX01, mouseY01){
        // 背景也做反向小視差
        const bgWeight = 0.2;
        const bgAmp = lerp(CFG.PARALLAX_MIN, CFG.PARALLAX_MAX, bgWeight);
        const bgTx = (mouseX01 - 0.5) * Wimg * bgAmp * -0.5;
        const bgTy = (mouseY01 - 0.5) * Himg * bgAmp * -0.5;
        bgWrap.style.transform = `translate3d(${px(bgTx)}, ${px(bgTy)}, 0)`;

        // 每個前景依自身深度計算位移，並做邊界夾限
        for (const L of layers){
          const amp = lerp(CFG.PARALLAX_MIN, CFG.PARALLAX_MAX, L.weight);
          const txDesired = (mouseX01 - 0.5) * Wimg * amp;
          const tyDesired = (mouseY01 - 0.5) * Himg * amp;

          const tx = clamp(txDesired, L.bounds.txMin, L.bounds.txMax);
          const ty = clamp(tyDesired, L.bounds.tyMin, L.bounds.tyMax);
          L.tx = tx; L.ty = ty;

          L.wrap.style.transformOrigin = `${(L.inst.anchor.x*100).toFixed(3)}% ${(L.inst.anchor.y*100).toFixed(3)}%`;
          L.wrap.style.transform = `translate3d(${px(tx)}, ${px(ty)}, 0) scale(${L.scale.toFixed(5)})`;
        }
      }

      // 初始位置
      update(0.5, 0.5);

      // 滑鼠/觸控
      function onMove(e){
        const r = outer.getBoundingClientRect();
        const x = clamp((e.clientX - r.left) / r.width, 0, 1);
        const y = clamp((e.clientY - r.top) / r.height, 0, 1);
        tilt.style.transform = `rotateX(${lerp(MAX_TILT,-MAX_TILT,y)}deg) rotateY(${lerp(-MAX_TILT,MAX_TILT,x)}deg)`;
        update(x, y);
      }
      function onLeave(){
        tilt.style.transform = `rotateX(0deg) rotateY(0deg)`;
        update(0.5, 0.5);
      }
      outer.addEventListener('mousemove', onMove);
      outer.addEventListener('mouseleave', onLeave);
      // 觸控
      outer.addEventListener('touchmove', (e)=>{
        const t = e.touches[0];
        if (!t) return;
        const r = outer.getBoundingClientRect();
        const x = clamp((t.clientX - r.left) / r.width, 0, 1);
        const y = clamp((t.clientY - r.top) / r.height, 0, 1);
        update(x, y);
      }, {passive:true});
      outer.addEventListener('touchend', onLeave, {passive:true});
    };
  }

  // 對外介面（app.js 會呼叫）
  window.initViewer = function(payload){
    try { initViewer(payload); } catch (err){ console.error(err); }
  };
})();
