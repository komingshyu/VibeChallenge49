import { TAROT_DECK, SPREADS } from './tarot-data.js';
import { createCardSVG } from './svg-lib.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const ui = {
  question: $('#question'),
  spreadList: $('#spread-list'),
  board: $('#board'),
  aiStatus: $('#aiStatus'),
  aiOutput: $('#aiOutput'),
  btnShuffle: $('#btnShuffle'),
  btnClear: $('#btnClear')
};

let currentSpread = SPREADS[0];
let drawnCards = [];

// 渲染牌陣列表
function renderSpreadList() {
  ui.spreadList.innerHTML = '';
  for (const s of SPREADS) {
    const item = document.createElement('div');
    item.className = 'spread-item';
    item.innerHTML = `
      <div class="dot"></div>
      <div class="meta">
        <div class="name">${s.name}</div>
        <div class="use">${s.useWhen}</div>
      </div>
      <div class="count">${s.positions.length} 張</div>
    `;
    item.addEventListener('click', () => {
      currentSpread = s;
      $$('.spread-item', ui.spreadList).forEach(e => e.style.outline = 'none');
      item.style.outline = '2px solid rgba(93,95,233,.5)';
      layoutBoard();
    });
    ui.spreadList.appendChild(item);
  }
  ui.spreadList.firstElementChild?.click();
}

// 布局牌桌（清空或依現有抽牌）
function layoutBoard() {
  ui.board.innerHTML = '';
  const w = ui.board.clientWidth || ui.board.offsetWidth || 960;
  const h = Math.max(ui.board.clientHeight || 520, 420);
  const pad = 10;

  currentSpread.positions.forEach((pos, i) => {
    const x = Math.round(pos.x * (w - pad*2)) + pad;
    const y = Math.round(pos.y * (h - pad*2)) + pad;
    const rot = pos.angle || 0;

    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.style.left = `${x}px`;
    cardEl.style.top = `${y}px`;
    cardEl.style.setProperty('--rot', `${rot}deg`);
    cardEl.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

    // 還沒抽牌時顯示牌背
    const face = drawnCards[i]
      ? createCardSVG(drawnCards[i], { width: 140, height: 228 })
      : createCardSVG(null, { width: 140, height: 228 }); // null 表示牌背

    cardEl.innerHTML = '';
    cardEl.appendChild(face);

    ui.board.appendChild(cardEl);
  });
}

// 洗牌與抽牌
function drawCards() {
  const deck = structuredClone(TAROT_DECK);
  shuffle(deck);
  const need = currentSpread.positions.length;
  const selected = deck.slice(0, need).map(c => {
    // 以 50% 機率逆位
    const reversed = random() < 0.5;
    return { ...c, reversed };
  });
  drawnCards = selected;
  layoutBoard();
}

// Fisher–Yates with crypto randomness
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function cryptoRandInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / (0xFFFFFFFF + 1)) * max);
}
function random() {
  // 0~1 隨機
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xFFFFFFFF;
}

// 串流請求 AI 解讀
async function streamReading() {
  ui.aiOutput.textContent = '';
  ui.aiStatus.textContent = '正在生成解讀（串流中）…';

  const payload = {
    question: ui.question.value?.trim() || '（未輸入具體問題）',
    spread: {
      key: currentSpread.key,
      name: currentSpread.name,
      useWhen: currentSpread.useWhen,
      positions: currentSpread.positions.map(p => ({ label: p.label }))
    },
    drawn: drawnCards.map((c) => ({
      name: c.name,
      arcana: c.arcana,
      suit: c.suit,
      suitZh: c.suitZh,
      rank: c.rank,
      rankZh: c.rankZh,
      reversed: !!c.reversed
    }))
  };

  const res = await fetch('/api/reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(()=>'');
    ui.aiStatus.textContent = '解讀失敗';
    ui.aiOutput.textContent = `伺服器回應錯誤：${res.status}\n${text}`;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    full += chunk;
    ui.aiOutput.textContent += chunk;
    ui.aiOutput.scrollTop = ui.aiOutput.scrollHeight;
  }
  ui.aiStatus.textContent = '解讀完成';
}

// 綁定 UI
ui.btnShuffle.addEventListener('click', () => {
  drawCards();
  streamReading().catch(console.error);
});
ui.btnClear.addEventListener('click', () => {
  drawnCards = [];
  ui.aiOutput.textContent = '';
  ui.aiStatus.textContent = '尚未開始解讀';
  layoutBoard();
});

// 初始
renderSpreadList();
layoutBoard();