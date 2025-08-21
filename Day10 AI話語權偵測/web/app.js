// AI Discourse Scanner v3 front-end (light theme, responsive charts)
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  q: '',
  results: [],
  hosts: [],
  agents: ['gptbot','ccbot','claudebot','perplexitybot','google-extended','applebot-extended','meta-externalagent'],
  wSerp: 0.7,
  wAi: 0.3,
  treat404: 'allow', // allow | unknown | disallow
  charts: { scatter: null, bar: null, barAi: null, donutRobots: null, barAgents: null }
};

// Tabs
$$('.tab').forEach(t => {
  t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const k = t.dataset.tab;
    $('#tab-results').style.display = (k === 'results') ? '' : 'none';
    $('#tab-viz').style.display = (k === 'viz') ? '' : 'none';
    $('#tab-about').style.display = (k === 'about') ? '' : 'none';
    if (k === 'viz') {
      drawCharts();
      setTimeout(() => resizeCharts(), 0);
    }
  });
});

// Settings dialog
const settingsDialog = $('#settingsDialog');
$('#btnSettings').addEventListener('click', () => {
  $('#agentsInput').value = state.agents.join('\n');
  $('#wSerp').value = state.wSerp;
  $('#wAi').value = state.wAi;
  $('#treat404').value = state.treat404;
  settingsDialog.showModal();
});
$('#closeSettings').addEventListener('click', () => settingsDialog.close());
$('#closeSettings2').addEventListener('click', () => settingsDialog.close());
$('#saveSettings').addEventListener('click', () => {
  const raw = $('#agentsInput').value.trim();
  state.agents = raw.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  state.wSerp = clamp01(parseFloat($('#wSerp').value || '0.7'));
  state.wAi = clamp01(parseFloat($('#wAi').value || '0.3'));
  state.treat404 = $('#treat404').value;
  settingsDialog.close();
  if (state.hosts.length) {
    computeScores();
    renderTable();
    drawCharts();
  }
});

function clamp01(x){ return isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }

// Robots modal
const robotsDialog = $('#robotsDialog');
$('#closeRobots').addEventListener('click', () => robotsDialog.close());
$('#closeRobots2').addEventListener('click', () => robotsDialog.close());
$('#copyRobots').addEventListener('click', async () => {
  const txt = $('#robotsText').textContent;
  try { await navigator.clipboard.writeText(txt); } catch {}
});
$('#openRobots').addEventListener('click', () => {
  const url = $('#robotsMeta').dataset.url;
  if (url) window.open(url, '_blank');
});

// Scan flow
$('#btnScan').addEventListener('click', async () => {
  const q = $('#topic').value.trim();
  if (!q) return;
  state.q = q;
  $('#statusText').textContent = '搜尋中…';
  const num = parseInt($('#num').value || '20', 10);
  let resp;
  try {
    resp = await fetch(`/api/search?q=${encodeURIComponent(q)}&num=${num}`).then(r => r.json());
  } catch (e) {
    console.error(e);
    $('#statusText').textContent = '搜尋錯誤';
    return;
  }
  if (resp.error) {
    $('#statusText').textContent = '搜尋錯誤：' + resp.error;
    return;
  }
  state.results = resp.results || [];
  const map = new Map();
  for (const r of state.results) {
    const host = r.hostname;
    if (!host) continue;
    if (!map.has(host)) map.set(host, {
      host,
      rootDomain: r.rootDomain || host,
      serp: { appears: 0, bestRank: Infinity, sumWeight: 0, positions: [] },
      robots: { status: 'unknown', code: 0, url: '', text: '', error: null },
      ai: { perAgent: {}, friendly: 0 },
      scores: { serp: 0, ai: 0, power: 0 }
    });
    const item = map.get(host);
    item.serp.appears += 1;
    item.serp.bestRank = Math.min(item.serp.bestRank, r.rank || 999);
    const w = 1 / Math.log2((r.rank || 999) + 1);
    item.serp.sumWeight += w;
    item.serp.positions.push(r.rank);
  }
  state.hosts = Array.from(map.values());
  renderTable();
  $('#statusText').textContent = '抓取 robots.txt 中…';
  await fetchAllRobots();
  computeScores();
  renderTable();
  $('#statusText').textContent = '完成';
  drawCharts();
});

$('#btnReset').addEventListener('click', () => {
  state.q = '';
  state.results = [];
  state.hosts = [];
  renderTable();
  destroyCharts();
  $('#statusText').textContent = '已清空';
});

$('#btnAddHost').addEventListener('click', async () => {
  const v = $('#manualHost').value.trim();
  if (!v) return;
  const host = extractHost(v);
  if (!host) { alert('無法辨識主/次網域，請檢查輸入。'); return; }
  if (state.hosts.find(h => h.host === host)) { alert('清單已存在該站點。'); return; }
  state.hosts.push({
    host, rootDomain: host.split('.').slice(-2).join('.'),
    serp: { appears: 0, bestRank: Infinity, sumWeight: 0, positions: [] },
    robots: { status: 'unknown', code: 0, url: '', text: '', error: null },
    ai: { perAgent: {}, friendly: 0 },
    scores: { serp: 0, ai: 0, power: 0 }
  });
  $('#manualHost').value = '';
  renderTable();
  for (const it of state.hosts.filter(h => h.host === host)) {
    await fetchRobots(it);
  }
  computeScores();
  renderTable();
  drawCharts();
});

function extractHost(input){
  try{
    if (input.includes('http')) return (new URL(input)).hostname.toLowerCase();
    return input.toLowerCase().replace(/\s+/g, '').replace(/\/+$/, '');
  }catch{ return null; }
}

async function fetchAllRobots(){
  const chunkSize = 6;
  for (let i=0;i<state.hosts.length;i+=chunkSize){
    const chunk = state.hosts.slice(i,i+chunkSize);
    await Promise.all(chunk.map(h => fetchRobots(h)));
  }
}

async function fetchRobots(item){
  try{
    const resp = await fetch(`/api/robots?domain=${encodeURIComponent(item.host)}`).then(r=>r.json());
    item.robots.url = resp.robots_url || '';
    item.robots.code = resp.status || 0;
    item.robots.text = resp.text || '';
    item.robots.error = resp.error || null;
    if (resp.status === 200) item.robots.status = 'ok';
    else if (resp.status === 404) item.robots.status = 'missing';
    else if (resp.ok === false) item.robots.status = 'error';
    else item.robots.status = 'other';
    analyzeRobotsForItem(item);
  }catch(e){
    item.robots.status = 'error';
    item.robots.error = String(e);
  }
}

function analyzeRobotsForItem(item){
  const txt = item.robots.text || '';
  const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(s=>s.length>0 && !s.startsWith('#'));
  const lowerLines = lines.map(s=>s.toLowerCase());
  const groups = {};
  let currentAgents = ['*'];
  for (const raw of lowerLines){
    if (raw.startsWith('user-agent:')){
      const agents = raw.split(':')[1].split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
      currentAgents = agents;
      currentAgents.forEach(a => { if (!groups[a]) groups[a] = { allow:[], disallow:[], crawlDelay:null }; });
    } else if (raw.startsWith('allow:')){
      const p = raw.split(':')[1].trim();
      currentAgents.forEach(a => groups[a] ? groups[a].allow.push(p) : (groups[a] = {allow:[p], disallow:[], crawlDelay:null}));
    } else if (raw.startsWith('disallow:')){
      const p = raw.split(':')[1].trim();
      currentAgents.forEach(a => groups[a] ? groups[a].disallow.push(p) : (groups[a] = {allow:[], disallow:[p], crawlDelay:null}));
    } else if (raw.startsWith('crawl-delay:')){
      const v = parseFloat(raw.split(':')[1].trim());
      currentAgents.forEach(a => groups[a] ? groups[a].crawlDelay = isFinite(v) ? v : groups[a].crawlDelay : null);
    }
  }
  function decisionForAgent(agent){
    const g = groups[agent] || groups['*'] || null;
    if (!g){
      if (item.robots.status === 'missing' && state.treat404 === 'allow') return 'allow';
      if (item.robots.status === 'missing' && state.treat404 === 'disallow') return 'disallow';
      return 'unknown';
    }
    const blockAll = (g.disallow || []).some(p => p === '/' || p === '/*');
    const allowAll = (g.allow || []).some(p => p === '/' || p === '/*');
    if (blockAll && allowAll) return 'partial';
    if (blockAll) return 'disallow';
    if (allowAll) return 'allow';
    const hasRules = (g.disallow && g.disallow.length) || (g.allow && g.allow.length);
    return hasRules ? 'partial' : 'unknown';
  }
  item.ai.perAgent = {};
  for (const a of state.agents){
    const key = a.toLowerCase();
    item.ai.perAgent[key] = decisionForAgent(key);
  }
}

function computeScores(){
  let maxW = 0;
  for (const h of state.hosts){ maxW = Math.max(maxW, h.serp.sumWeight); }
  for (const h of state.hosts){
    h.scores.serp = maxW > 0 ? (h.serp.sumWeight / maxW) * 100 : 0;
    const vals = Object.values(h.ai.perAgent || {});
    let sum = 0;
    const mapVal = { allow:1, partial:0.5, unknown:0.25, disallow:0 };
    for (const v of vals) sum += mapVal[v] ?? 0.25;
    const total = Math.max(vals.length, state.agents.length || 1);
    let aiFriendly = (sum / total) * 100;
    if (h.robots.status === 'error' || h.robots.status === 'other') aiFriendly *= 0.9;
    h.scores.ai = aiFriendly;
    h.scores.power = state.wSerp * h.scores.serp + state.wAi * h.scores.ai;
  }
}

function renderTable(){
  const tbody = $('#rows');
  tbody.innerHTML = '';
  for (const h of state.hosts){
    const tr = document.createElement('tr');
    tr.className = 'row';
    const c1 = document.createElement('td');
    c1.innerHTML = `<strong>${escapeHtml(h.host)}</strong><div class="small">root: ${escapeHtml(h.rootDomain)}</div>`;
    const c2 = document.createElement('td');
    const badge = robotsBadge(h.robots);
    const btn = `<div class="tooltip"><button class="btn-icon" data-action="view-robots" title="預覽 robots.txt">📄</button>
      <div class="tooltip-content">${escapeHtml(previewRobots(h.robots.text))}</div></div>`;
    c2.innerHTML = `${badge} ${btn}`;
    const c3 = document.createElement('td');
    const aiScore = Math.round(h.scores.ai);
    c3.innerHTML = `<div class="score"><div class="bar"><span style="width:${aiScore}%"></span></div><div>${aiScore}</div></div>
      <div class="chips" style="margin-top:6px;">${agentChips(h.ai.perAgent)}</div>`;
    const c4 = document.createElement('td');
    const serp = Math.round(h.scores.serp);
    const positions = h.serp.positions.sort((a,b)=>a-b).slice(0,5).join(', ');
    c4.innerHTML = `<div class="score"><div class="bar"><span style="width:${serp}%"></span></div><div>${serp}</div></div>
      <div class="small">出現：${h.serp.appears} 次；最佳名次：${h.serp.bestRank === Infinity ? '-' : h.serp.bestRank}<br/>樣本排名：${positions}</div>`;
    const c5 = document.createElement('td');
    const pwr = Math.round(h.scores.power);
    c5.innerHTML = `<div class="score"><div class="bar"><span style="width:${pwr}%"></span></div><div>${pwr}</div></div>`;
    const c6 = document.createElement('td');
    c6.className = 'right';
    c6.innerHTML = `<div class="actions"><button class="btn-icon" data-action="remove" title="刪除">🗑</button></div>`;
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5); tr.appendChild(c6);
    tbody.appendChild(tr);
    tr.querySelector('[data-action="view-robots"]').addEventListener('click', () => {
      $('#robotsMeta').textContent = `${h.robots.status.toUpperCase()} ${h.robots.code || ''} · ${h.robots.url || ''}`;
      $('#robotsMeta').dataset.url = h.robots.url || '';
      $('#robotsText').textContent = h.robots.text || h.robots.error || '(無內容)';
      robotsDialog.showModal();
    });
    tr.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.hosts = state.hosts.filter(x => x.host !== h.host);
      renderTable();
      drawCharts();
    });
  }
}

function robotsBadge(robots){
  if (!robots) return '';
  const st = robots.status;
  if (st === 'ok') return `<span class="badge ok">200</span>`;
  if (st === 'missing') return `<span class="badge warn">404</span>`;
  if (st === 'error') return `<span class="badge err">ERROR</span>`;
  return `<span class="badge warn">${robots.code || 'OTHER'}</span>`;
}

function previewRobots(txt){
  if (!txt) return '(無內容)';
  const s = txt.split(/\r?\n/).slice(0, 40).join('\n');
  return s.length > 2000 ? s.slice(0, 2000) + '\n…' : s;
}

function agentChips(map){
  const chips = [];
  const order = state.agents;
  const color = (v) => {
    if (v === 'allow') return 'ok';
    if (v === 'partial' || v === 'unknown') return 'warn';
    return 'err';
  };
  for (const a of order){
    const v = map[a] || 'unknown';
    chips.push(`<span class="chip ${color(v)}">${a}:${v}</span>`);
  }
  return chips.join(' ');
}

function escapeHtml(s){ return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ==== Charts ====
function destroyCharts(){
  for (const key of Object.keys(state.charts)){
    const ch = state.charts[key];
    if (ch && typeof ch.destroy === 'function'){ ch.destroy(); }
    state.charts[key] = null;
  }
}

function resizeCharts(){
  for (const key of Object.keys(state.charts)){
    const ch = state.charts[key];
    if (ch && typeof ch.resize === 'function'){ ch.resize(); }
  }
}

function drawCharts(){
  const hosts = state.hosts.slice();
  // Build datasets
  const sortedByPower = hosts.slice().sort((a,b)=>b.scores.power - a.scores.power);
  const sortedByAi = hosts.slice().sort((a,b)=>b.scores.ai - a.scores.ai);
  const labels = sortedByPower.map(h => h.host);
  const serp = sortedByPower.map(h => h.scores.serp);
  const ai = sortedByPower.map(h => h.scores.ai);
  const power = sortedByPower.map(h => h.scores.power);

  // Agents decision distribution
  const decisionCounts = { allow:0, partial:0, unknown:0, disallow:0 };
  for (const h of hosts){
    for (const v of Object.values(h.ai.perAgent || {})){
      if (decisionCounts[v] !== undefined) decisionCounts[v]++;
      else decisionCounts.unknown++;
    }
  }
  const robotsCounts = { ok:0, missing:0, error:0, other:0 };
  for (const h of hosts){ robotsCounts[h.robots.status] = (robotsCounts[h.robots.status]||0) + 1; }

  // destroy previous
  destroyCharts();

  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true } }
  };

  // Scatter
  const scatterData = sortedByPower.map(h => ({ x: round2(h.scores.serp), y: round2(h.scores.ai), r: Math.max(5, Math.min(22, Math.sqrt(h.scores.power))), host: h.host }));
  const ctx1 = document.getElementById('chartScatter');
  state.charts.scatter = new Chart(ctx1, {
    type: 'bubble',
    data: { datasets: [{ label: '站點', data: scatterData }] },
    options: {
      ...commonOpts,
      scales: {
        x: { min:0, max:100, title: { display:true, text:'SERP 正規化分數' } },
        y: { min:0, max:100, title: { display:true, text:'AI 友善度' } }
      },
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: (ctx) => {
          const d = ctx.raw; const power = (d.r*d.r); 
          return `${d.host} — SERP:${d.x.toFixed(1)}, AI:${d.y.toFixed(1)}, Power:${power.toFixed(1)}`;
        } } }
      }
    }
  });

  // Bar: power top10
  const top10 = sortedByPower.slice(0, 10);
  const ctx2 = document.getElementById('chartBar');
  state.charts.bar = new Chart(ctx2, {
    type: 'bar',
    data: { labels: top10.map(h=>h.host), datasets: [{ label: 'AI 話語權', data: top10.map(h=>round2(h.scores.power)) }] },
    options: { ...commonOpts, scales: { y: { beginAtZero:true, max:100 } } }
  });

  // Bar: AI friendly top10
  const topAi = sortedByAi.slice(0, 10);
  const ctx3 = document.getElementById('chartBarAi');
  state.charts.barAi = new Chart(ctx3, {
    type: 'bar',
    data: { labels: topAi.map(h=>h.host), datasets: [{ label: 'AI 友善度', data: topAi.map(h=>round2(h.scores.ai)) }] },
    options: { ...commonOpts, scales: { y: { beginAtZero:true, max:100 } } }
  });

  // Donut: robots status
  const ctx4 = document.getElementById('chartRobots');
  state.charts.donutRobots = new Chart(ctx4, {
    type: 'doughnut',
    data: { labels: ['200', '404', 'ERROR', 'OTHER'], datasets: [{ data: [
      robotsCounts.ok||0, robotsCounts.missing||0, robotsCounts.error||0, robotsCounts.other||0
    ] }] },
    options: { responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ display:true, position:'bottom' } } }
  });

  // Bar: agent decision distribution
  const ctx5 = document.getElementById('chartAgents');
  state.charts.barAgents = new Chart(ctx5, {
    type: 'bar',
    data: { labels: ['allow','partial','unknown','disallow'], datasets: [{ label:'決策數', data:[
      decisionCounts.allow, decisionCounts.partial, decisionCounts.unknown, decisionCounts.disallow
    ] }] },
    options: { ...commonOpts, scales: { y: { beginAtZero:true, precision:0 } } }
  });
}

function round2(x){ return Math.round(x*100)/100; }

// Resize charts when window resizes
window.addEventListener('resize', () => resizeCharts());

// Mutation observer: when #tab-viz becomes visible after being hidden, resize
const viz = $('#tab-viz');
const ro = new ResizeObserver(() => resizeCharts());
ro.observe(viz);

// Init
renderTable();
