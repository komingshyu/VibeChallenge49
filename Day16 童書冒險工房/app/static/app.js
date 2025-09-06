/* app/static/app.js — minimal, production‑safe patch */
(() => {
    'use strict';

    // ----------------------------
    // App State
    // ----------------------------
    const state = {
        pid: null,
        templates: [],
        chosenTemplate: null,
        outlines: [],
        chosenOutline: 0
    };

    // ----------------------------
    // Utils
    // ----------------------------
    function escHtml(s) {
        return (s || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function stylizeMentions(s) {
        return escHtml(s).replace(/@([\u4e00-\u9fa5\w]{1,12})/g, '<span class="mention">@$1</span>');
    }


    const qs = (s, r = document) => r.querySelector(s);
    const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
    const pad2 = (n) => String(n).padStart(2, '0');

    async function getJSON(url, opts = {}) {
        const r = await fetch(url, opts);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return await r.json();
    }

    function b64urlEncode(obj) {
        const json = JSON.stringify(obj);
        const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16)));
        return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function extractJson(text) {
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        return (s !== -1 && e !== -1 && e > s) ? text.slice(s, e + 1) : '';
    }

    function stripAt(str) {
        return (str || '').replace(/^@+/, '');  // 去掉開頭的 @ 符號（可以有多個）
    }

    // ----------------------------
    // Slider (Horizontal Panels)
    // ----------------------------
    let currentPanel = 0, panels = [];
    const SLIDE_MS = 280;
    const STEP_PAUSE = SLIDE_MS + 120;
    let navLock = false;
    let isInputMode = false;

    function vpWidth() {
        const vp = qs('#viewport');
        const w = Math.round(vp?.getBoundingClientRect().width || vp?.clientWidth || window.innerWidth);
        return Math.max(320, w);
    }

    function layoutRail() {
        const rail = qs('#rail');
        if (!rail) return;
        const w = vpWidth();
        rail.style.width = (w * panels.length) + 'px';
        panels.forEach(p => {
            p.style.width = w + 'px';
        });
    }

    function applyTransform(smooth = true) {
        const rail = qs('#rail');
        if (!rail) return;
        const px = -currentPanel * vpWidth();
        rail.style.transition = smooth ? `transform ${SLIDE_MS}ms cubic-bezier(.3,.7,.2,1)` : 'none';
        rail.style.transform = `translate3d(${px}px,0,0)`;
    }

    function updateTabsAndNav() {
        qsa('#tabs li').forEach((li, idx) => {
            li.classList.toggle('active', idx === currentPanel);
            li.setAttribute('aria-selected', idx === currentPanel ? 'true' : 'false');
            li.tabIndex = idx === currentPanel ? 0 : -1;
        });
        const prev = qs('.nav-btn.prev'), next = qs('.nav-btn.next');
        if (prev) prev.disabled = currentPanel <= 0;
        if (next) next.disabled = currentPanel >= panels.length - 1;
        location.hash = `#s${currentPanel + 1}`;
    }

    function goTo(index) {
        currentPanel = Math.max(0, Math.min(panels.length - 1, index));
        applyTransform(true);
        updateTabsAndNav();
    }

    function setupSlider() {
        panels = qsa('.panel');
        const m = location.hash.match(/s(\d+)/);
        currentPanel = Math.min(Math.max((m ? parseInt(m[1], 10) : 1) - 1, 0), panels.length - 1);
        requestAnimationFrame(() => {
            layoutRail();
            applyTransform(false);
            updateTabsAndNav();
        });

        qs('#tabs')?.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            goTo(parseInt(li.dataset.i, 10));
        });

        const prevBtn = qs('.nav-btn.prev'), nextBtn = qs('.nav-btn.next');
        prevBtn?.addEventListener('click', () => requestStep(-1));
        nextBtn?.addEventListener('click', () => requestStep(+1));
        [prevBtn, nextBtn].forEach(btn => btn?.addEventListener('pointerdown', () => {
            if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
        }));

        window.addEventListener('keydown', (e) => {
            if (isInputMode) return;
            if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                requestStep(+1);
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                requestStep(-1);
            }
        });

        const viewport = qs('#viewport');
        viewport?.addEventListener('wheel', (e) => {
            if (isInputMode) return;
            const absX = Math.abs(e.deltaX), absY = Math.abs(e.deltaY);
            if (absX <= absY) return;
            if (canScroll(e.target, 'x', e.deltaX)) return;
            if (navLock) {
                e.preventDefault();
                return;
            }
            if (e.deltaX > 25) {
                e.preventDefault();
                requestStep(+1);
            } else if (e.deltaX < -25) {
                e.preventDefault();
                requestStep(-1);
            }
        }, {passive: false});

        let tStartX = 0, tStartY = 0, tActive = false;
        viewport?.addEventListener('touchstart', (e) => {
            if (isInputMode || e.touches.length !== 1) return;
            tActive = true;
            tStartX = e.touches[0].clientX;
            tStartY = e.touches[0].clientY;
        }, {passive: true});
        viewport?.addEventListener('touchmove', (e) => {
            if (!tActive || isInputMode) return;
            const dx = e.touches[0].clientX - tStartX;
            const dy = e.touches[0].clientY - tStartY;
            if (Math.abs(dx) > Math.abs(dy) * 1.3 && Math.abs(dx) > 24) {
                e.preventDefault();
                requestStep(dx < 0 ? +1 : -1);
                tActive = false;
            }
        }, {passive: false});
        viewport?.addEventListener('touchend', () => {
            tActive = false;
        }, {passive: true});

        const rail = qs('#rail');
        rail?.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'transform') navLock = false;
        });

        window.addEventListener('resize', () => {
            requestAnimationFrame(() => {
                layoutRail();
                applyTransform(false);
            });
        });

        document.addEventListener('focusin', (e) => {
            if (isFormField(e.target)) {
                isInputMode = true;
                document.body.classList.add('input-mode');
            }
        }, true);
        document.addEventListener('focusout', () => {
            setTimeout(() => {
                const a = document.activeElement;
                if (!isFormField(a)) {
                    isInputMode = false;
                    document.body.classList.remove('input-mode');
                }
            }, 0);
        }, true);
    }

    function requestStep(dir) {
        if (navLock || isInputMode) return;
        const target = Math.max(0, Math.min(panels.length - 1, currentPanel + dir));
        if (target === currentPanel) return;
        navLock = true;
        goTo(target);
        clearTimeout(requestStep._t);
        requestStep._t = setTimeout(() => navLock = false, STEP_PAUSE);
    }

    function isFormField(el) {
        return !!(el && (el.closest('input, textarea, select, [contenteditable="true"]')));
    }

    function canScroll(el, axis, delta) {
        let node = el instanceof Element ? el : null;
        while (node && !node.classList.contains('panel')) {
            const style = getComputedStyle(node);
            const over = axis === 'x' ? style.overflowX : style.overflowY;
            const can = /(auto|scroll)/.test(over);
            if (axis === 'x' && can && node.scrollWidth > node.clientWidth) {
                if (delta < 0 && node.scrollLeft > 0) return true;
                if (delta > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth) return true;
            }
            if (axis === 'y' && can && node.scrollHeight > node.clientHeight) {
                if (delta < 0 && node.scrollTop > 0) return true;
                if (delta > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) return true;
            }
            node = node.parentElement;
        }
        return false;
    }



    // ----------------------------
    // bootstrap
    // ----------------------------
    async function boot() {
        const p = await fetch('/api/project/new', {method: 'POST'}).then(r => r.json());
        state.pid = p.project_id;

        const t = await getJSON('/api/templates');
        state.templates = t.templates || [];
        renderTemplates();

        await loadStyle();
        requestAnimationFrame(setupSlider);
    }

    boot().catch(err => console.error(err));

    // ----------------------------
    // Step 1: 套路
    // ----------------------------
    function renderTemplates() {
        const el = qs('#template-list');
        if (!el) return;
        el.innerHTML = '';
        state.templates.forEach(tpl => {
            const div = document.createElement('div');
            div.className = 'tile';
            div.innerHTML = `
        <h3>${tpl.name}</h3>
        <p>${tpl.description || ''}</p>
        <p class="muted">${tpl.category || ''} ｜ ${tpl.age_hint || ''}</p>
        <button>選用此套路</button>`;
            div.querySelector('button').onclick = () => {
                state.chosenTemplate = tpl;
                goTo(1);
            };
            el.appendChild(div);
        });
    }

    // ----------------------------
    // Step 2: 並行串流 3 組大綱（即時 delta）
    // ----------------------------
    qs('#btn-stream')?.addEventListener('click', async () => {
        if (!state.chosenTemplate) {
            alert('請先選擇套路');
            goTo(0);
            return;
        }

        const fd = new FormData(qs('#diff-form'));
        const body = Object.fromEntries(fd.entries());
        body.language_tricks = (body.language_tricks || '').split(',').map(s => s.trim()).filter(Boolean);
        body.visual_tricks = (body.visual_tricks || '').split(',').map(s => s.trim()).filter(Boolean);

        const d = b64urlEncode(body);
        const url = `/api/outlines_stream/${state.pid}/${state.chosenTemplate.key}?d=${d}`;

        const setStatus = (k, t) => {
            const el = qs('#st' + k);
            if (el) el.textContent = t;
        };
        const clearCard = (k) => {
            const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k), u = qs('#use' + k);
            if (t) t.textContent = '大綱 ' + k;
            if (l) l.textContent = '';
            if (c) c.textContent = '';
            if (u) u.disabled = true;
        };
        const fillCard = (k, title, logline, cast) => {
            const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k);
            if (t) t.textContent = title || ('大綱 ' + k);
            if (l) l.textContent = logline || '';
            if (c) c.textContent = (cast && cast.length)
                ? '出場角色：' + cast.map(x => `${(x.name || '').replace(/^@?/, '@')}（${x.role || '配角'}）`).join('，') : '';
        };
        const showOutlineError = (k, msg = '生成失敗') => {
            setStatus(k, '失敗');
            const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k), u = qs('#use' + k);
            if (t) t.textContent = `大綱 ${k} 生成失敗`;
            if (l) l.textContent = String(msg).slice(0, 180);
            if (c) c.textContent = '';
            if (u) u.disabled = true;
        };
        const enableUseButton = (k, index) => {
            const btn = qs('#use' + k);
            if (!btn) return;
            btn.disabled = false;
            btn.onclick = async () => {
                await fetch(`/api/adopt_outline/${state.pid}/${index}`, {method: 'POST'});
                await renderCharacters();
                goTo(2);
            };
        };

        ['A', 'B', 'C'].forEach(k => {
            setStatus(k, '寫作中…');
            clearCard(k);
        });

        const es = new EventSource(url);
        es.onmessage = (ev) => {
            let data = {};
            try {
                data = JSON.parse(ev.data);
            } catch {
                return;
            }
            const map = {1: 'A', 2: 'B', 3: 'C'};

            if (data.status === 'error') {
                ['A', 'B', 'C'].forEach(k => showOutlineError(k, data.error || '未知錯誤'));
                es.close();
                return;
            }
            if (data.outline && map[data.outline]) {
                const k = map[data.outline];
                if (data.stage === 'delta') {
                    if (data.title) qs('#t' + k).textContent = data.title;
                    if (data.logline) qs('#l' + k).textContent = data.logline;
                    if (Array.isArray(data.cast)) {
                        const c = qs('#c' + k);
                        if (c) c.textContent = data.cast.length
                            ? '出場角色：' + data.cast.map(x => `${(x.name || '').replace(/^@?/, '@')}（${x.role || '配角'}）`).join('，') : '';
                    }
                    setStatus(k, '寫作中…');
                }
                if (data.stage === 'complete') {
                    fillCard(k, data.title || '', data.logline || '', data.cast || []);
                    setStatus(k, '已完成');
                    enableUseButton(k, (data.outline - 1));
                }
                if (data.stage === 'error') {
                    showOutlineError(k, data.error || '生成失敗');
                }
            }
            if (data.status === 'done') {
                es.close();
                loadProject({renderList: false});
            }
        };
        es.onerror = () => {
            ['A', 'B', 'C'].forEach(k => setStatus(k, '連線中斷'));
            es.close();
        };
    });

    async function loadProject({renderList = false} = {}) {
        const p = await getJSON(`/api/project/${state.pid}`);
        state.outlines = p.outlines || [];
        if (renderList) renderOutlines();
    }

    function renderOutlines() {
        const el = qs('#outlines');
        if (!el) return;
        el.innerHTML = '';
        state.outlines.forEach((o, idx) => {
            const d = document.createElement('div');
            d.className = 'tile outline';
            d.innerHTML = `<h3>${o.title}</h3><p>${o.logline}</p><button>選此大綱（帶入角色）</button>`;
            d.querySelector('button').onclick = async () => {
                await fetch(`/api/adopt_outline/${state.pid}/${idx}`, {method: 'POST'});
                await renderCharacters();
                goTo(2);
            };
            el.appendChild(d);
        });
    }

    function setStatus(k, s) {
        const el = qs('#st' + k);
        if (el) el.textContent = s;
    }

    // function clearCard(k) {
    //     const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k);
    //     if (t) t.textContent = '大綱 ' + k;
    //     if (l) l.textContent = '';
    //     if (c) c.textContent = '';
    //     const u = qs('#use' + k);
    //     if (u) u.disabled = true;
    // }
    //
    // function fillCard(k, title, logline, cast) {
    //     const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k);
    //     if (t) t.textContent = title || ('大綱 ' + k);
    //     if (l) l.textContent = logline || '';
    //     if (c) c.textContent = (cast && cast.length)
    //         ? '出場角色：' + cast.map(x => `${handle(x.name)}（${x.role || '配角'}）`).join('，') : '';
    //
    // }
    //
    // function showOutlineError(k, msg = '生成失敗') {
    //     setStatus(k, '失敗');
    //     const t = qs('#t' + k), l = qs('#l' + k), c = qs('#c' + k), u = qs('#use' + k);
    //     if (t) t.textContent = `大綱 ${k} 生成失敗`;
    //     if (l) l.textContent = String(msg).slice(0, 180);
    //     if (c) c.textContent = '';
    //     if (u) u.disabled = true;
    // }
    //
    // function enableUseButton(k, index) {
    //     const btn = qs('#use' + k);
    //     if (!btn) return;
    //     btn.disabled = false;
    //     btn.onclick = async () => {
    //         await fetch(`/api/adopt_outline/${state.pid}/${index}`, {method: 'POST'});
    //         await renderCharacters();
    //         goTo(2);
    //     };
    // }

    // ----------------------------
    // Step 3: 角色
    // ----------------------------
    async function loadStyle() {
        const p = await getJSON(`/api/style/${state.pid}`);
        qs('#art-style').value = p.style || '';
    }

    qs('#style-save')?.addEventListener('click', async () => {
        const style = qs('#art-style')?.value || '';
        await fetch(`/api/style/${state.pid}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({style})
        });
        alert('已儲存全書風格');
    });

    qs('#char-add')?.addEventListener('click', async () => {
        const payload = {
            // 儲存時去掉前導 '@'，避免資料層累積多顆
            name: stripAt(qs('#char-name')?.value || ''),
            role: (qs('#char-role')?.value || 'supporting'),
            description: (qs('#char-desc')?.value || ''),
            appearance_prompt: (qs('#char-look')?.value || ''),
            voice: 'alloy'
        };
        await fetch(`/api/characters/${state.pid}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        renderCharacters();
    });

    async function renderCharacters() {
        await loadStyle();
        const data = await getJSON(`/api/characters/${state.pid}`);
        const el = qs('#characters');
        if (!el) return;
        el.innerHTML = '';
        (data.characters || []).forEach(c => {
            c.id=c.id.toString().padStart(2, "0")
            const displayName = c.name && c.name.startsWith('@') ? c.name : ('@' + (c.name || '角色'));
            const imgSrc = `/output/${state.pid}/characters/${c.id}.png`;

            const div = document.createElement('div');
            div.className = 'tile';
            div.innerHTML = `
        <div class="char-head">
          <img class="char-preview" id="prev-${c.id}" src="${imgSrc}">
          <div><h3>${displayName}</h3><p class="muted">${c.role || ''}</p></div>
        </div>
        <p>${c.description || '—'}</p>
        <textarea id="look-${c.id}" placeholder="外觀建議/生圖提示">${c.appearance_prompt || ''}</textarea>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <button class="gen">生成造型</button>
          <button class="save">儲存</button>
          <button class="del" style="background:#e03">刪除</button>
        </div>`;
            el.appendChild(div);
            // 讓圖片在成功載入時自動顯示、失敗時暫時隱藏
            const imgEl = div.querySelector(`#prev-${c.id}`);
            if (imgEl) {
                imgEl.addEventListener('load', () => {
                    imgEl.style.display = '';
                });
                imgEl.addEventListener('error', () => {
                    imgEl.style.display = 'none';
                });
            }
            div.querySelector('.save').onclick = async () => {
                const look = div.querySelector(`#look-${c.id}`).value;
                await fetch(`/api/characters/${state.pid}/${c.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({appearance_prompt: look})
                });
            };
            div.querySelector('.del').onclick = async () => {
                await fetch(`/api/characters/${state.pid}/${c.id}`, {method: 'DELETE'});
                renderCharacters();
            };
            div.querySelector('.gen').onclick = async () => {
                const look = div.querySelector(`#look-${c.id}`).value;
                await fetch(`/api/characters/${state.pid}/${c.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({appearance_prompt: look})
                });
                const sse = new EventSource(`/api/gen/char_image/${state.pid}/${c.id}`);
                const img = qs(`#prev-${c.id}`);
                if (img) img.setAttribute('aria-busy', 'true');
                sse.onmessage = (ev) => {
                    let data = {};
                    try {
                        data = JSON.parse(ev.data);
                    } catch {
                        return;
                    }
                    if (data.stage === 'saved') {
                        if (img) {
                            // 解除先前 onerror 造成的隱藏
                            img.style.display = '';
                            // 強制拿最新檔（no-cache + ts）
                            img.src = `/output/${state.pid}/characters/${c.id}.png`;
                            img.removeAttribute('aria-busy');
                        }
                        try {
                            sse.close();
                        } catch {
                        }
                    }
                    if (data.stage === 'error') {
                        try {
                            img && img.removeAttribute('aria-busy');
                            sse.close();
                        } catch {
                        }
                    }
                };
            };
        });
    }

    // ----------------------------
    // Step 4：14 跨頁分鏡
    // ----------------------------
    function ensureSbLiveBox() {
        let el = document.querySelector('#sb-live');
        if (!el) {
          el = document.createElement('pre');
          el.id = 'sb-live'; el.className = 'mono';
          const host = document.querySelector('#storyboard'); host?.parentElement?.insertBefore(el, host);
        }
        return el;
      }
    function clearStoryboardUI() {
      const list = document.querySelector('#storyboard');
        if (list) list.innerHTML = '';
        const pages = document.querySelector('#pages');
        if (pages) pages.innerHTML = '';
        const box = document.querySelector('#sb-live');
        if (box) {
            box.textContent = '';
            box.style.display = 'none';
            box.classList.remove('typing');
        }
    }

    // 逐字框：需要時才建立；預設先隱藏，等拿到第一個 token 再顯示
    function getOrCreateLiveBox() {
        let el = document.querySelector('#sb-live');
        if (!el) {
            el = document.createElement('pre');
            el.id = 'sb-live';
            el.className = 'mono';
            el.style.display = 'none'; // 先不顯示
            const host = document.querySelector('#storyboard');
            host?.parentElement?.insertBefore(el, host);
        }
        return el;
    }

  function renderStoryboardLive(spreads) {
    const el = qs('#storyboard'); if (!el) return;
    el.innerHTML = '';
    spreads.slice(0, 14).forEach((sp, i) => {
      const page = sp.page || (i + 1);
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        `<div>#${page}</div><div>${escHtml(sp.summary || sp.display_text || '')}</div><div class="imgp">${escHtml(sp.image_prompt || '')}</div>`;
      el.appendChild(row);
    });
    for (let i = spreads.length + 1; i <= 14; i++) {
      const row = document.createElement('div');
      row.className = 'row dim';
      row.innerHTML = `<div>#${i}</div><div>（寫作中…）</div><div class="imgp"></div>`;
      el.appendChild(row);
    }
  }
  function parseAndRenderFromText(text) {
    const json = extractJson(text);
    if (!json) return;
    try {
      const obj = JSON.parse(json);
      if (Array.isArray(obj.spreads)) renderStoryboardLive(obj.spreads);
    } catch {}
  }

  function startStoryboardSSE(prompt, onDoneFallback) {
  const isRewrite = Boolean((prompt || '').trim());
  const url = isRewrite ? `/api/stream/rewrite_storyboard/${encodeURIComponent(state.pid)}?notes=${encodeURIComponent(prompt || '')}`
    : `/api/stream/storyboard/${encodeURIComponent(state.pid)}`;

    const box = ensureSbLiveBox(); box.textContent = '';
    let gotAny = false, buf = '', lastTryParse = 0;
    const es = new EventSource(url);

    const tryParse = (force = false) => {
      const now = Date.now();
      if (!force && now - lastTryParse < 180) return;
      lastTryParse = now;
      parseAndRenderFromText(buf);
    };

    es.addEventListener('storyboard_token', (e) => {
      gotAny = true;
      try { const d = JSON.parse(e.data); buf += (d.text || ''); box.textContent += (d.text || ''); box.scrollTop = box.scrollHeight; } catch {}
      tryParse(false);
    });
    es.addEventListener('storyboard_snapshot', (e) => {
      gotAny = true;
      try { const d = JSON.parse(e.data); if (d.text) { buf = d.text; box.textContent = d.text; box.scrollTop = box.scrollHeight; parseAndRenderFromText(buf); } } catch {}
    });
    es.addEventListener('done', async () => {
      try { es.close(); } catch {}
      // 先嘗試直接用 server 落盤的結果
      try {
        const p = await getJSON(`/api/project/${state.pid}`);
        const spreads = p?.storyboard?.spreads || [];
        if (Array.isArray(spreads) && spreads.length >= 14) { renderStoryboard({ spreads }); return; }
      } catch {}
      // 若沒有落盤，觸發回退（同步 API）
      if (typeof onDoneFallback === 'function') onDoneFallback();
    });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data || '{}');
        if (d.text) { gotAny = true; buf += d.text; box.textContent += d.text; box.scrollTop = box.scrollHeight; tryParse(false); }
        else if (d.stage === 'delta' && d.token) { gotAny = true; buf += d.token; box.textContent += d.token; box.scrollTop = box.scrollHeight; tryParse(false); }
      } catch {}
    };
    es.onerror = () => {
      try { es.close(); } catch {}
      if (!gotAny && typeof onDoneFallback === 'function') onDoneFallback();
    };
  }

    // 建立分鏡：先試 SSE，失敗或未落盤再走同步 POST
    qs('#build-sb')?.addEventListener('click', async () => {
        const fallback = async () => {
            const proj = await getJSON(`/api/project/${state.pid}`);
            let chosen = 0;
            if (typeof proj.chosen_outline === 'number') chosen = proj.chosen_outline;
            else if (proj.outlines && proj.outlines.length) chosen = 0;
            const sb = await fetch(`/api/storyboard/${state.pid}/${chosen}`, {method: 'POST'}).then(r => r.json());
            renderStoryboard(sb);
        };
        clearStoryboardUI();
        startStoryboardSSE('', fallback);
        goTo(3);
    });

    // 重寫分鏡：先清空，再逐字串流；若未落盤則回退到同步重寫 API
    qs('#rewrite-sb')?.addEventListener('click', async () => {
        const notes = qs('#sb-notes')?.value || '';
        const fallback = async () => {
            const r = await fetch(`/api/storyboard/${state.pid}/rewrite`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({notes})
            });
            if (!r.ok) {
                const txt = await r.text();
                alert(`重寫分鏡失敗：${r.status} ${txt}`);
                return;
            }
            const res = await r.json();
            if (res.storyboard) {
                renderStoryboard(res.storyboard);
            }
        };
        clearStoryboardUI();
        startStoryboardSSE(notes, fallback);
        goTo(3);
    });

    function renderStoryboard(sb) {
        const el = qs('#storyboard');
        if (!el) return;
        el.innerHTML = '';
        sb.spreads.forEach(sp => {
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = `<div>#${sp.page}</div><div>${escHtml(sp.summary || sp.display_text || '')}</div><div class="imgp">${escHtml(sp.image_prompt || '')}</div>`;
            el.appendChild(row);
        });
        renderCards(sb.spreads);
    }

    // ----------------------------
    // Step 5: 產製（卡片）
    // ----------------------------
    const MAX_CONCURRENCY = 4;
    const imageSSEs = new Map();
    let running = 0;
    const imageOnDone = new Map();
    const imageQueue = [];

    function pumpImageQueue() {
        while (running < MAX_CONCURRENCY && imageQueue.length) {
            const page = imageQueue.shift();
            _startImageSSE(page);
        }
    }

    function startImageSSE(page, onDone) {
        // 容錯：若前一次連線錯誤未正確清理，強制回收並重啟
        if (imageSSEs.has(page)) {
            try {
                imageSSEs.get(page).close();
            } catch {
            }
            imageSSEs.delete(page);
            running = Math.max(0, running - 1);
        }
        if (typeof onDone === 'function') imageOnDone.set(page, onDone);
        imageQueue.push(page);
        pumpImageQueue();
    }

    // ---- 小工具：容器、補零、睡眠 ----
    function cardsRoot() {
        return document.getElementById('pages') || document.getElementById('cards');
    }



    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 圖檔路徑候選（補零 / 不補零；png / jpg / webp）----
    function imageCandidates(page, pid) {
        const base = `/output/${pid}/images/`;
        const p2 = pad2(page);
        return [
            `${base}${p2}.png`,
            `${base}${p2}.jpg`,
        ];
    }

    async function fileExists(url) {
        try {
            let r = await fetch(url, {method: 'HEAD', cache: 'no-store'});
            if (r.status === 405) r = await fetch(url, {method: 'GET', cache: 'no-store'});
            return r.ok;
        } catch (_) {
            return false;
        }
    }

    async function resolveImageUrl(page) {
        const list = imageCandidates(page, state.pid);
        for (const u of list) {
            if (await fileExists(u)) return u;
        }
        return null;
    }

    // 反覆等待圖片真正落盤（Saved 事件後仍可能晚一拍）
    async function waitForImage(page, tries = 12, delay = 250) {
        for (let i = 0; i < tries; i++) {
            const url = await resolveImageUrl(page);
            if (url) {
                const im = document.getElementById('img-' + page);
                if (im) im.src = url;
                return true;
            }
            await sleep(delay);
        }
        return false;
    }

    async function ensureImageVisible(page) {
        const url = await resolveImageUrl(page);
        if (url) {
            const im = qs('#img-' + page);
            if (im) im.src = url;
        }
    }


    function imgUrlOf(page) {
        return `/output/${state.pid}/images/${pad2(page)}.png`;
    }

    function ttsUrlOf(page) {
        return `/output/${state.pid}/tts/${pad2(page)}.mp3`;
    }

    function cardDisable(page, mask) {
        const pick = (sel, on) => {
            const b = qs(sel + page);
            if (b) b.disabled = !!on;
        };
        // 允許兩種型別：布林（全部一起鎖/解）或物件（選擇性鎖）
        if (mask === true) {
            pick('#reimg-', true);
            pick('#tts-', true);
            pick('#play-', true);
            return;
        }
        if (mask === false || mask == null) {
            pick('#reimg-', false);
            pick('#tts-', false);
            pick('#play-', false);
            return;
        }
        // 選擇性：只處理有提供的鍵
        if (Object.prototype.hasOwnProperty.call(mask, 'img')) pick('#reimg-', mask.img);
        if (Object.prototype.hasOwnProperty.call(mask, 'tts')) pick('#tts-', mask.tts);
        if (Object.prototype.hasOwnProperty.call(mask, 'play')) pick('#play-', mask.play);
    }

    function setPreviewBusy(page, busy) {
        const prev = qs('#prev-' + page);
        if (prev) prev.classList.toggle('busy', !!busy);
    }

    function setDot(page, statusCls) {
        const dot = qs('#dot-' + page);
        if (!dot) return;
        ['status-pending', 'status-processing', 'status-partial', 'status-completed'].forEach(c => dot.classList.remove(c));
        dot.classList.add(statusCls);
    }

    function setBarPct(page, pct) {
        const bar = qs('#bar-' + page);
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    // ---- 渲染 14 張卡片（統一對齊 #pages；若無再退 #cards）----
    function renderCards(spreads) {
        const el = cardsRoot();
        if (!el) {
            console.warn('cards container not found (#pages/#cards)');
            return;
        }
        el.innerHTML = '';

        spreads.forEach(sp => {
            const page = sp.page;
            const card = document.createElement('div');
            card.className = 'story-card';
            card.id = `card-${page}`;
            card.innerHTML = `
      <div class="card-header">
        <span class="card-title">第 ${page} 頁</span>
        <div class="status-dot status-pending" id="dot-${page}"></div>
      </div>
      <div class="card-content">
        <div class="content-preview" id="prev-${page}">
          <img id="img-${page}" src="/static/assets/placeholder.png" alt="第 ${page} 頁預覽">
        </div>
        <div class="story-text" id="txt-${page}">${stylizeMentions(sp.display_text || sp.summary || '')}</div>
        <div class="card-toolbar">
          <button class="btn-compact btn-success-compact" id="reimg-${page}" title="重新生成圖像">🎨</button>
          <button class="btn-compact btn-primary-compact" id="tts-${page}" title="生成旁白">🎵</button>
          <button class="btn-compact" id="play-${page}" title="播放">▶️</button>
          <div class="toolbar-divider"></div>
          <div class="dropdown-mini">
            <button class="btn-compact">⋯</button>
            <div class="dropdown-menu">
              <a href="#" data-act="download-img" data-page="${page}">下載圖像</a>
              <a href="#" data-act="download-tts" data-page="${page}">下載音訊</a>
              <a href="#" data-act="copy-text"   data-page="${page}">複製文字</a>
              <a href="#" data-act="regen-both"  data-page="${page}">重新生成圖+音</a>
            </div>
          </div>
        </div>
        <div class="progress-mini"><div class="progress-fill-mini" id="bar-${page}"></div></div>
      </div>`;
            el.appendChild(card);

            // 初始：嘗試就地載入現有圖
            waitForImage(page);

            // 綁事件（省略：沿用你原本的 startImageSSE / startTTSSSE）
            document.getElementById('reimg-' + page).onclick = () => startImageSSE(page, () => updateCompletion(page));
            document.getElementById('tts-' + page).onclick = () => startTTSSSE(page, () => updateCompletion(page));
            document.getElementById('play-' + page).onclick = () => {
                const audio = new Audio(`/output/${state.pid}/tts/${pad2(page)}.mp3`);
                audio.onerror = () => alert('尚未生成旁白，請先生成');
                audio.play().catch(() => {
                });
            };
        });

// 批次
    qs('#btn-batch-img')?.addEventListener('click', () => {
      const pages = spreads.map(s => s.page);
      let done = 0, total = pages.length;
      const btn = qs('#btn-batch-img'); if (btn) { btn.disabled = true; btn.textContent = '批次生成中…'; }
      pages.forEach(p => {
        startImageSSE(p, () => {
          done++; if (btn) btn.textContent = `批次生成中… (${done}/${total})`;
          if (done >= total && btn) { btn.disabled = false; btn.textContent = '批次生成圖像'; }
        });
      });
    });
    qs('#btn-batch-tts')?.addEventListener('click', () => {
      const pages = spreads.map(s => s.page);
      let done = 0, total = pages.length;
      const btn = qs('#btn-batch-tts'); if (btn) { btn.disabled = true; btn.textContent = '批次生成中…'; }
      pages.forEach(p => {
        startTTSSSE(p, () => {
          done++; if (btn) btn.textContent = `批次生成中… (${done}/${total})`;
          if (done >= total && btn) { btn.disabled = false; btn.textContent = '批次生成旁白'; }
        });
      });
    });
    qs('#dl-pdf').onclick = () => { window.location = `/api/export/pdf/${state.pid}`; };
    qs('#dl-epub').onclick = () => { window.location = `/api/export/epub/${state.pid}`; };
    qs('#dl-mp4').onclick = () => { window.location = `/api/export/mp4/${state.pid}`; };
  }
// ---- 影像 SSE：在 saved/done 兩個時點都重試抓圖 ----
    function _startImageSSE(page) {
        running += 1;
        setDot(page, 'status-processing');
        setBarPct(page, 0);
        cardDisable(page, true);

        const sse = new EventSource(`/api/gen/image/${state.pid}/${page}`);
        imageSSEs.set(page, sse);

        sse.onmessage = async (ev) => {
            let data = {};
            try {
                data = JSON.parse(ev.data);
            } catch {
                return;
            }
            if (data.stage === 'progress') {
                const p = data.percent ?? data.pct ?? (data.step && data.total ? Math.round(100 * data.step / data.total) : null);
                if (p != null) setBarPct(page, p);
            }
            if (data.stage === 'saved') {
                await waitForImage(page);
                setBarPct(page, 70);
                setDot(page, 'status-partial');
            }
            if (data.stage === 'done') {
                await waitForImage(page);
                cardDisable(page, false);
                try {
                    sse.close();
                } catch {
                }
                finishImage(page);
            }
            if (data.stage === 'error') {
                cardDisable(page, false);
                try {
                    sse.close();
                } catch {
                }
                finishImage(page);
            }
        };
        sse.onerror = () => {
            try {
                sse.close();
            } catch {
            }
            finishImage(page);
        };
    }

    function finishImage(page) {
        imageSSEs.delete(page);
        running = Math.max(0, running - 1);
        const cb = imageOnDone.get(page);
        if (cb) {
            try {
                cb();
            } catch {
            }
            imageOnDone.delete(page);
        }
        updateCompletion(page);
        pumpImageQueue();
    }

    function startTTSSSE(page, onDone) {
        setDot(page, 'status-processing');
        setBarPct(page, 0);
        // ⬇️ 僅鎖 TTS 與播放，保留圖像可按（修復「批次 TTS 鎖住所有圖像鍵」）
        cardDisable(page, {tts: true, play: true});
        setPreviewBusy(page, true);
        const sse = new EventSource(`/api/gen/tts/${state.pid}/${page}`);
        sse.onmessage = (ev) => {
            let data = {};
            try {
                data = JSON.parse(ev.data);
            } catch {
                return;
            }
            if (data.stage === 'saved') {
                updateCompletion(page);
                cardDisable(page, false);
                try {
                    sse.close();
                } catch {
                }
                if (onDone) onDone();
            }
            if (data.stage === 'error') {
                cardDisable(page, false);
                try {
                    sse.close();
                } catch {
                }
                setDot(page, 'status-partial');
            }
        };
        sse.onerror = () => {
            try {
                sse.close();
            } catch {
            }
            cardDisable(page, false);
        };
    }

    async function updateCompletion(page) {
        const url = await resolveImageUrl(page);
        const [hasImg, hasTts] = await Promise.all([Boolean(url), fileExists(ttsUrlOf(page))]);
        if (hasImg && hasTts) {
            setDot(page, 'status-completed');
            setBarPct(page, 100);
        } else if (hasImg) {
            setDot(page, 'status-partial');
            setBarPct(page, 70);
        } else {
            setDot(page, 'status-pending');
            setBarPct(page, 0);
        }
        if (hasImg && url) {                      // 真的有檔案就塞進 <img>
            const im = qs('#img-' + page);
            if (im) im.src = url;
        }
    }

})();
