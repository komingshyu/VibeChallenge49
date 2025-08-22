/* app/static/app.js
 * Creative Copy Collider – 前端主控（穩健版）
 * 1) Ready 偵測：不管 script 在 head/尾端/加上 defer，都會綁定成功
 * 2) 所有按鈕以 id 綁定；若 id 找不到，會在 console 警告
 * 3) SSE 事件解析（含寬鬆解析，能吃單引號 dict）
 * 4) 顯示狀態列訊息，首次載入會顯示「對撞機就緒」
 */

(function () {
  // ---------- DOM 快取 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const pick = (...sels) => sels.map(s => $(s)).find(Boolean) || null;

  const EL = {
    productTerm: pick('#productTerm', '#productTermInput', '[name=product_term]'),
    kInput: pick('#kInput', '[name=k]'),
    langSelect: pick('#langSelect', '[name=lang]'),

    btnAlign: $('#btnAlign'),
    btnTerms: pick('#btnTerms', '#btnGenerateTerms'),
    btnInitial: $('#btnInitialCollision'),
    btnDeep: $('#btnDeepCollision'),

    featuresList: $('#featuresList'),
    competitorsList: $('#competitorsList'),
    backgroundList: $('#backgroundList'),
    keywordsList: $('#keywordsList'),

    termsList: $('#termsList'),
    candidateList: $('#candidateList'),

    initialStream: $('#initialStream'),
    deepStream: $('#deepStream'),

    personaName: $('#personaName'),
    personaAge: $('#personaAge'),
    personaRole: $('#personaRole'),
    personaPain: pick('#personaPainPoints', '#personaPain'),
    personaTone: $('#personaTone'),
    mediaSelect: $('#mediaSelect'),

    statusBar: $('#statusBar'),
  };

  const state = {
    productTerm: '',
    k: 8,
    lang: 'zh-TW',
    terms: [],
    chosenTerms: [],
    initialOutputs: [],
    candidates: [],
    deepOutputs: [],
  };

  // ---------- 工具 ----------
  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function setStatus(msg, type = 'info') {
    const el = EL.statusBar || $('#statusBar');
    if (el) {
      el.textContent = msg;
      el.dataset.type = type;
    }
  }

  function warnIfMissing(el, name) {
    if (!el) console.warn(`[app.js] 找不到元素：${name}，請確認 index.html 的 id 是否為 ${name}`);
  }

  function getNumber(el, defVal) {
    const v = Number((el && el.value) || defVal);
    return Number.isFinite(v) && v > 0 ? v : defVal;
  }

  // ---------- 取/送 JSON ----------
  async function postJSON(url, payload) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload || {})
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`[${resp.status}] ${text || 'HTTP error'}`);
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`JSON 解析失敗：${e.message}；原始回應：${text.slice(0,200)}`); }
  }

  async function getJSON(url) {
    const resp = await fetch(url);
    const text = await resp.text();
    if (!resp.ok) throw new Error(`[${resp.status}] ${text || 'HTTP error'}`);
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`JSON 解析失敗：${e.message}；原始回應：${text.slice(0,200)}`); }
  }

  // ---------- 對齊資料正規化 ----------
  function coerceAlignment(alignment) {
    try {
      if (typeof alignment === 'string') {
        let s = alignment.trim().replace(/^```(?:json|JSON)?\s*/m, '').replace(/```$/m, '');
        alignment = JSON.parse(s);
      }
    } catch { alignment = {}; }
    const toList = (v) => {
      if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
      if (typeof v === 'string') {
        return v.split(/\r?\n|[;；]/).map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
      }
      return [];
    };
    return {
      features: toList(alignment.features),
      competitors: toList(alignment.competitors),
      background: toList(alignment.background),
      keywords: toList(alignment.keywords),
    };
  }

  function renderList(ul, arr) {
    if (!ul) return;
    ul.innerHTML = '';
    arr.forEach(txt => {
      const li = document.createElement('li');
      li.textContent = txt;
      ul.appendChild(li);
    });
  }

  function renderAlignment(raw) {
    const data = coerceAlignment(raw);
    renderList(EL.featuresList, data.features);
    renderList(EL.competitorsList, data.competitors);
    renderList(EL.backgroundList, data.background);
    renderList(EL.keywordsList, data.keywords);
  }

  // ---------- 詞庫渲染與選取 ----------
  function renderTerms(terms) {
    state.terms = terms || [];
    state.chosenTerms = [];
    if (!EL.termsList) return;
    EL.termsList.innerHTML = '';
    state.terms.forEach((t, i) => {
      const id = `term_${i}`;
      const li = document.createElement('li');
      li.className = 'term-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = id; cb.value = t;

      const label = document.createElement('label');
      label.setAttribute('for', id); label.textContent = t;

      cb.addEventListener('change', () => {
        if (cb.checked) state.chosenTerms.push(t);
        else state.chosenTerms = state.chosenTerms.filter(x => x !== t);
      });

      li.appendChild(cb); li.appendChild(label);
      EL.termsList.appendChild(li);
    });
  }

  function renderCandidates() {
    if (!EL.candidateList) return;
    EL.candidateList.innerHTML = '';
    state.candidates.forEach((text, idx) => {
      const chip = document.createElement('div'); chip.className = 'chip';
      const span = document.createElement('span'); span.textContent = text.length > 140 ? text.slice(0,140)+'…' : text;
      const btn = document.createElement('button'); btn.className = 'chip-remove'; btn.textContent = '移除';
      btn.addEventListener('click', () => { state.candidates.splice(idx,1); renderCandidates(); });
      chip.appendChild(span); chip.appendChild(btn);
      EL.candidateList.appendChild(chip);
    });
  }
  function addCandidate(text) {
    const t = String(text||'').trim();
    if (!t) return;
    if (!state.candidates.includes(t)) { state.candidates.push(t); renderCandidates(); }
  }

  // ---------- 寬鬆解析（把單引號 dict/True/False/None 修成 JSON） ----------
  function parseSSEDataLoose(dataText) {
    const t = (dataText || '').trim();
    try { return JSON.parse(t); } catch {}
    let fixed = t
      .replace(/([{\s,])'([^']+?)'\s*:/g, '$1"$2":')                                 // key
      .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, p1) => `:"${p1.replace(/"/g, '\\"')}"`) // value
      .replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    try { return JSON.parse(fixed); } catch {}
    return t; // 仍失敗就回傳字串
  }

  // ---------- SSE：POST 串流 ----------
  async function streamSSEPost(url, payload, onEvent) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload || {})
    });
    if (!resp.ok || !resp.body) {
      const msg = await resp.text();
      throw new Error(`[${resp.status}] ${msg || 'SSE HTTP error'}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let eventName = 'message';
        const dataLines = [];
        rawEvent.split(/\r?\n/).forEach(line => {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        });
        const dataText = dataLines.join('\n');
        const data = parseSSEDataLoose(dataText);
        try { onEvent({ event: eventName, data }); }
        catch (e) { console.error('onEvent error:', e); }
      }
    }
  }

  // ---------- 初試碰撞 ----------
  function createInitialCard(index, term) {
    const card = document.createElement('div'); card.className = 'card initial'; card.dataset.index = String(index);
    const head = document.createElement('div'); head.className = 'card-head'; head.textContent = `對撞詞：${term}`;
    const body = document.createElement('div'); body.className = 'card-body';
    const p = document.createElement('p'); p.className = 'stream-text'; p.textContent = '';
    body.appendChild(p);
    const foot = document.createElement('div'); foot.className = 'card-foot';
    const btn = document.createElement('button'); btn.textContent = '加入候選';
    btn.addEventListener('click', () => addCandidate(p.textContent));
    foot.appendChild(btn);
    card.appendChild(head); card.appendChild(body); card.appendChild(foot);
    return { card, p };
  }

  async function runInitialCollision() {
    if (!EL.initialStream) return;
    EL.initialStream.innerHTML = '';
    state.initialOutputs = [];

    const payload = { product_term: state.productTerm, terms: state.chosenTerms, lang: state.lang };
    const current = {}; // idx -> {p,text}

    await streamSSEPost('/api/initial-collision', payload, ({ event, data }) => {
      if (event !== 'delta') return;

      const mode = data && typeof data === 'object' ? data.mode : undefined;
      const idx  = data && typeof data === 'object' ? data.index : undefined;

      function ensureCard(i) {
        if (current[i]) return;
        const term = state.chosenTerms[i] || `#${i}`;
        const { card, p } = createInitialCard(i, term);
        current[i] = { p, text: '' };
        EL.initialStream.appendChild(card);
      }

      if (mode === 'header') {
        ensureCard(idx);
      } else if (mode === 'delta') {
        ensureCard(idx);
        const token = data.token || '';
        current[idx].text += token;
        current[idx].p.textContent = current[idx].text;
      } else if (mode === 'end') {
        ensureCard(idx);
        const txt = (data.text || current[idx].text || '').trim();
        state.initialOutputs[idx] = { term: state.chosenTerms[idx], text: txt };
        current[idx].p.textContent = txt;
      } else {
        // 非結構化資料：丟到第 0 張
        const s = String(data || '').trim();
        if (!s) return;
        ensureCard(0);
        current[0].text += s;
        current[0].p.textContent = current[0].text;
      }
    });

    setStatus('初試碰撞完成，可勾選候選或進入深度碰撞。', 'info');
  }

  // ---------- 深度碰撞 ----------
  function readPersona() {
    const persona = {};
    if (EL.personaName) persona.name = EL.personaName.value.trim();
    if (EL.personaAge) persona.age = EL.personaAge.value.trim();
    if (EL.personaRole) persona.role = EL.personaRole.value.trim();
    if (EL.personaPain) persona.pain_points = EL.personaPain.value.trim();
    if (EL.personaTone) persona.tone = EL.personaTone.value.trim();
    return persona;
  }

  function createDeepCard(index, seed) {
    const card = document.createElement('div'); card.className = 'card deep'; card.dataset.index = String(index);
    const head = document.createElement('div'); head.className = 'card-head'; head.textContent = `候選種子 #${index + 1}`;
    const pre = document.createElement('pre'); pre.className = 'seed'; pre.textContent = seed;
    const body = document.createElement('div'); body.className = 'card-body';
    const p = document.createElement('p'); p.className = 'stream-text'; p.textContent = '';
    body.appendChild(p);
    card.appendChild(head); card.appendChild(pre); card.appendChild(body);
    return { card, p };
  }

  async function runDeepCollision() {
    if (!EL.deepStream) return;
    EL.deepStream.innerHTML = '';
    state.deepOutputs = [];

    const persona = readPersona();
    const media = EL.mediaSelect ? EL.mediaSelect.value : '';
    const payload = { product_term: state.productTerm, candidates: state.candidates, persona, media, lang: state.lang };
    const current = {};

    await streamSSEPost('/api/deep-collision', payload, ({ event, data }) => {
      if (event !== 'delta') return;

      const mode = data && typeof data === 'object' ? data.mode : undefined;
      const idx  = data && typeof data === 'object' ? data.index : undefined;

      function ensureCard(i) {
        if (current[i]) return;
        const seed = state.candidates[i] || `候選 #${i+1}`;
        const { card, p } = createDeepCard(i, seed);
        current[i] = { p, text: '' };
        EL.deepStream.appendChild(card);
      }

      if (mode === 'header') {
        ensureCard(idx);
      } else if (mode === 'delta') {
        ensureCard(idx);
        const token = data.token || '';
        current[idx].text += token;
        current[idx].p.textContent = current[idx].text;
      } else if (mode === 'end') {
        ensureCard(idx);
        const txt = (data.text || current[idx].text || '').trim();
        state.deepOutputs[idx] = txt;
        current[idx].p.textContent = txt;
      } else {
        const s = String(data || '').trim();
        if (!s) return;
        ensureCard(0);
        current[0].text += s;
        current[0].p.textContent = current[0].text;
      }
    });

    setStatus('深度碰撞完成。', 'info');
  }

  // ---------- 綁定事件 ----------
  function bindEvents() {
    // 警示缺少的元素（幫助排查）
    ['btnAlign','btnTerms','btnInitial','btnDeep','featuresList','termsList','initialStream','deepStream','statusBar']
      .forEach(name => warnIfMissing(EL[name], name));

    if (EL.btnAlign) {
      EL.btnAlign.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          state.productTerm = (EL.productTerm && EL.productTerm.value.trim()) || '';
          state.lang = (EL.langSelect && EL.langSelect.value) || 'zh-TW';
          if (!state.productTerm) return setStatus('請先輸入產品詞。', 'error');
          setStatus('概念對齊中…', 'info');
          const data = await postJSON('/api/align', { product_term: state.productTerm, lang: state.lang });
          renderAlignment(data.alignment ?? data);
          setStatus('概念對齊完成。', 'info');
        } catch (err) { console.error(err); setStatus(`概念對齊失敗：${err.message}`, 'error'); }
      });
    }

    if (EL.btnTerms) {
      EL.btnTerms.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          state.k = getNumber(EL.kInput, 8);
          const data = await getJSON(`/api/terms?k=${encodeURIComponent(state.k)}`);
          renderTerms(data.terms || data || []);
          setStatus('已抽出待碰撞詞彙，請勾選。', 'info');
        } catch (err) { console.error(err); setStatus(`載入詞庫失敗：${err.message}`, 'error'); }
      });
    }

    if (EL.btnInitial) {
      EL.btnInitial.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          if (!state.productTerm) return setStatus('請先做概念對齊或輸入產品詞。', 'error');
          if (!state.chosenTerms.length) return setStatus('請先勾選至少 1 個對撞詞。', 'error');
          setStatus('初試碰撞中（串流）…', 'info');
          await runInitialCollision();
        } catch (err) { console.error(err); setStatus(`初試碰撞失敗：${err.message}`, 'error'); }
      });
    }

    if (EL.btnDeep) {
      EL.btnDeep.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          if (!state.candidates.length) return setStatus('請先加入至少 1 則候選文案。', 'error');
          setStatus('深度碰撞中（串流）…', 'info');
          await runDeepCollision();
        } catch (err) { console.error(err); setStatus(`深度碰撞失敗：${err.message}`, 'error'); }
      });
    }

    // 就算誤用 <a href="/api/initial-collision"> 當按鈕，也攔截改走 POST
    document.addEventListener('click', async (e) => {
      const mis = e.target && e.target.closest('a[href="/api/initial-collision"], [data-action="initial"]');
      if (!mis) return;
      e.preventDefault(); e.stopPropagation();
      try {
        if (!state.productTerm) return setStatus('請先做概念對齊或輸入產品詞。', 'error');
        if (!state.chosenTerms.length) return setStatus('請先勾選至少 1 個對撞詞。', 'error');
        setStatus('初試碰撞中（串流）…', 'info');
        await runInitialCollision();
      } catch (err) { console.error(err); setStatus(`初試碰撞失敗：${err.message}`, 'error'); }
    }, true);
  }

  // ---------- 啟動 ----------
  ready(() => {
    // 預設值
    if (EL.kInput && !EL.kInput.value) EL.kInput.value = String(state.k);
    if (EL.langSelect && !EL.langSelect.value) EL.langSelect.value = state.lang;

    bindEvents();
    setStatus('對撞機就緒。', 'info');

    // 若載入過程發生未捕獲錯誤，顯示在狀態列
    window.addEventListener('error', (e) => {
      setStatus(`前端錯誤：${e.message}`, 'error');
    });
  });
})();
