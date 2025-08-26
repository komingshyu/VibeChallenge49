const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

/* ---------------- Tabs ---------------- */
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.tab-panel').forEach(p => p.classList.add('hidden'));
    $('#tab-' + tab).classList.remove('hidden');
  });
});

/* ---------------- Batch mode toggle ---------------- */
const modeSel = document.querySelector('select[name="mode"]');
if (modeSel) {
  modeSel.addEventListener('change', (e) => {
    const show = e.target.value === 'person';
    $('#person-for-batch').classList.toggle('hidden', !show);
  });
}

/* ---------------- Helpers ---------------- */
function showRunning(previewEl, label = "處理中...") {
  previewEl.innerHTML = `
    <div class="stage">
      <div class="center">
        <div class="loader"></div><div>${label}</div>
      </div>
    </div>
    <div class="progress"><div id="bar" style="width:10%"></div></div>
  `;
}

/* 進度條 */
function updateBar(previewEl, pct) {
  const bar = previewEl.querySelector('#bar');
  if (bar) bar.style.width = Math.max(10, Math.min(100, Math.round(pct))) + '%';
}

/* 確保有 .stage 容器（以防被外部覆寫） */
function ensureStage(previewEl) {
  let stage = previewEl.querySelector('.stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'stage';
    previewEl.appendChild(stage);
  }
  return stage;
}

/**
 * 將圖片「替代呈現 + 淡入過渡」
 * - 不並排；最新圖覆蓋舊圖
 * - 等圖片 load 成功後才移除 spinner，避免空白一瞬間
 */
function setStageImage(previewEl, url) {
  const stage = ensureStage(previewEl);
  const oldImg = stage.querySelector('img.layer');

  const img = new Image();
  img.className = 'layer fade-in';
  img.onload = () => {
    if (oldImg && oldImg.parentElement) oldImg.remove();
    const spinner = stage.querySelector('.center');
    if (spinner) spinner.remove();
  };
  img.src = url;

  // 先 append 進去，等 onload 再把舊圖拿掉，達到 cross-fade
  stage.appendChild(img);
}

function showError(previewEl, message) {
  previewEl.innerHTML = `
    <div class="stage">
      <div class="center" style="background:rgba(254,242,242,.9);color:#991b1b;border:1px solid #fecaca">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span>錯誤：${message}</span>
      </div>
    </div>
    <div class="progress"><div id="bar" style="width:0%"></div></div>
  `;
}

/* ---------------- HTTP helpers ---------------- */
async function postForm(url, form) {
  const fd = new FormData(form);
  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) {
    const text = await res.text();
    try { const j = JSON.parse(text); throw new Error(j.detail || j.error || text); }
    catch { throw new Error(text || res.statusText); }
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Unknown error');
  return data;
}

async function postSSE(url, form, onEvent) {
  const fd = new FormData(form);
  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) {
    const text = await res.text();
    try { const j = JSON.parse(text); throw new Error(j.detail || j.error || text); }
    catch { throw new Error(text || res.statusText); }
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split("\n");
      let event = "message", data = "";
      for (const l of lines) {
        if (l.startsWith("event:")) event = l.slice(6).trim();
        else if (l.startsWith("data:")) data += l.slice(5).trim();
      }
      if (data) {
        try { onEvent({ event, data: JSON.parse(data) }); } catch { /* ignore */ }
      }
    }
  }
}

/* ---------------- Scene (streaming-first) ---------------- */
$('#form-scene')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const preview = $('#scene-preview');
  const form = e.target;
  const useStream = form.querySelector('input[name="stream_preview"]')?.checked ?? true;
  const maxPartial = Math.max(1, Math.min(3,
    parseInt(form.querySelector('input[name="partial_images"]')?.value || '2', 10)
  ));

  if (useStream) {
    showRunning(preview, "正在生成（逐步預覽）...");
    let partialCount = 0;
    try {
      await postSSE('/api/generate/scene/stream', form, ({event, data}) => {
        if (event === 'partial') {
          partialCount += 1;
          updateBar(preview, 10 + Math.min(partialCount, maxPartial) / maxPartial * 80);
          setStageImage(preview, data.url);  // 逐步替代 + 淡入
        } else if (event === 'final') {
          updateBar(preview, 100);
          const url = data.upscaled_url || data.image_url;
          setStageImage(preview, url);
        } else if (event === 'warn') {
          /* optional: toast */
        } else if (event === 'error') {
          showError(preview, data.message);
        }
      });
    } catch (err) {
      // 串流失敗 → 回退非串流
      try {
        showRunning(preview, "生成中...");
        const data = await postForm('/api/generate/scene', form);
        const url = data.result.upscaled_url || data.result.image_url;
        updateBar(preview, 100);
        setStageImage(preview, url);
      } catch (err2) {
        showError(preview, err2.message);
      }
    }
  } else {
    showRunning(preview, "生成中...");
    try {
      const data = await postForm('/api/generate/scene', form);
      const url = data.result.upscaled_url || data.result.image_url;
      updateBar(preview, 100);
      setStageImage(preview, url);
    } catch (err) {
      showError(preview, err.message);
    }
  }
});

/* ---------------- Person (streaming-first) ---------------- */
$('#form-person')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const preview = $('#person-preview');
  const form = e.target;
  const useStream = form.querySelector('input[name="stream_preview"]')?.checked ?? true;
  const maxPartial = Math.max(1, Math.min(3,
    parseInt(form.querySelector('input[name="partial_images"]')?.value || '2', 10)
  ));

  if (useStream) {
    showRunning(preview, "正在合成（逐步預覽）...");
    let partialCount = 0;
    try {
      await postSSE('/api/generate/person/stream', form, ({event, data}) => {
        if (event === 'partial') {
          partialCount += 1;
          updateBar(preview, 10 + Math.min(partialCount, maxPartial) / maxPartial * 80);
          setStageImage(preview, data.url);
        } else if (event === 'final') {
          updateBar(preview, 100);
          const url = data.upscaled_url || data.image_url;
          setStageImage(preview, url);
        } else if (event === 'warn') {
          /* optional */
        } else if (event === 'error') {
          showError(preview, data.message);
        }
      });
    } catch (err) {
      try {
        showRunning(preview, "合成中...");
        const data = await postForm('/api/generate/person', form);
        const url = data.result.upscaled_url || data.result.image_url;
        updateBar(preview, 100);
        setStageImage(preview, url);
      } catch (err2) {
        showError(preview, err2.message);
      }
    }
  } else {
    showRunning(preview, "合成中...");
    try {
      const data = await postForm('/api/generate/person', form);
      const url = data.result.upscaled_url || data.result.image_url;
      updateBar(preview, 100);
      setStageImage(preview, url);
    } catch (err) {
      showError(preview, err.message);
    }
  }
});

/* ---------------- Upscale only ---------------- */
$('#form-upscale')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const preview = $('#upscale-preview');
  showRunning(preview, "上傳中...");
  try {
    const data = await postForm('/api/upscale', e.target);
    updateBar(preview, 100);
    setStageImage(preview, data.result.upscaled_url);
  } catch (err) {
    showError(preview, err.message);
  }
});

/* ---------------- Batch (unchanged) ---------------- */
$('#form-batch')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const log = $('#batch-log');
  log.innerHTML = '<div class="text-slate-500">批次啟動中...</div>';

  try {
    const data = await postForm('/api/batch', e.target);
    if (!data.results) throw new Error('No results');
    log.innerHTML = data.results.map(r => {
      if (!r.ok) return `<div class="p-2 bg-red-50 border rounded mb-2"><b>${r.file}</b>：失敗 - ${r.error}</div>`;
      return `<div class="p-2 bg-sky-50 border rounded mb-2 flex items-center gap-3">
        <span class="font-medium">${r.file}</span>
        <a class="link" href="${r.image_url}" target="_blank">結果</a>
        ${r.upscaled_url ? `<a class="link" href="${r.upscaled_url}" target="_blank">x4</a>` : ''}
      </div>`;
    }).join('');
  } catch (err) {
    log.innerHTML = `<div class="text-red-600">錯誤：${err.message}</div>`;
  }
});
