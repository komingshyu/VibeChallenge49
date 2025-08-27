
// 氧化還原王國 - Redox Kingdom (國二～高二向)
// 自含單頁應用，含劇情、互動視覺化、測驗、成就、分享、PWA & 本地儲存。

(function(){
  const $ = (sel,el=document)=>el.querySelector(sel);
  const $$ = (sel,el=document)=>[...el.querySelectorAll(sel)];
  const app = $('#app');
  const STORE_KEY = 'redox-kingdom-state-v1';

  // ----------- 教學內容（劇情腳本） -----------
  const STORY = [
    {
      id:'prologue', title:'序章．電子覺醒',
      intro:`王國的能量之河忽明忽滅。長老說：『電子精靈不再願意流動。誰能理解「失去電子」之痛與「得到電子」之喜，便能再度點亮王國。』`,
      learn:`核心觀念：氧化＝失去電子（LEO），還原＝得到電子（GER）。
      當一物質被氧化，它的氧化數上升；被還原則下降。氧化劑讓別人被氧化（自己被還原），還原劑讓別人被還原（自己被氧化）。`,
      viz:'intro'
    },
    { id:'oxnum', title:'第一章．氧化數學院',
      intro:`學院的大鐘敲了十三下。你被分到「配位與規則」小組，任務是替化學式貼上氧化數標籤。`,
      learn:`規則速記：
      1) 單質氧化數 = 0（如 Na、O2、S8）。
      2) 單原子離子氧化數 = 離子電荷（如 Fe3+ 為 +3）。
      3) 化合物中：氫通常 +1（但在金屬氫化物中為 -1）；氧通常 -2（過氧為 -1，過氧化氫 H2O2），鹵素通常 -1（與氧或彼此例外）。
      4) 中性分子氧化數代數和 = 0；多原子離子 = 該離子電荷。`,
      viz:'oxnum'
    },
    { id:'half', title:'第二章．半反應工坊',
      intro:`鐵匠鋪裡，一分為二的反應像被切開的河流。把電子放在正確的一岸，才能讓河再度合攏。`,
      learn:`半反應法（酸性溶液）：
      a. 把氧化與還原分兩式； b. 除O外先配原子； c. 用 H2O 補 O； d. 用 H+ 補 H； e. 用 e− 平衡電荷； f. 使兩式電子相等後相加。
      鹼性溶液多一步：先按酸性法配好，再把 H+ 用等量 OH− 中和成 H2O。`,
      viz:'half'
    },
    { id:'gal', title:'第三章．電池城（原電池）',
      intro:`硝酸銀塔與鋅之門隔河相望。當你把鹽橋搭起，電子從失去者流向獲得者，城市燈火瞬間亮起。`,
      learn:`原電池（自發反應）：陽極 anode 發生氧化，陰極 cathode 發生還原；電子從陽極 → 陰極。鹽橋維持電中性。
      標準電池電位 E°cell = E°(陰極) − E°(陽極)。E°cell > 0 表示在標準狀態下趨於自發。`,
      viz:'galvanic'
    },
    { id:'ele', title:'第四章．電解監獄（電解）',
      intro:`在這裡，外接電源逼迫不情願的反應發生。負極成為電子庇護所，離子從黑暗中歸來鍍上一層光。`,
      learn:`電解（非自發反應）：陰極（連電源負極）發生還原，陽極（連電源正極）發生氧化。金屬電鍍是常見應用。
      進階：法拉第定律把「電荷量」與「沉積物質量」連起來（Boss 可見）。`,
      viz:'electrolysis'
    },
    { id:'corr', title:'第五章．腐蝕之海',
      intro:`鹽霧翻湧的海岸，鋼鐵像被海怪啃咬。選對犧牲陽極，便能守護船殼與橋梁。`,
      learn:`鐵的腐蝕本質上是一個原電池：鐵作陽極被氧化，氧氣/水作陰極被還原。防蝕法：塗料隔絕、陰極保護（以較活潑金屬如 Zn、Mg 作犧牲陽極）、合金化（不銹鋼）。`,
      viz:'corrosion'
    },
    { id:'boss', title:'終章．王座試煉',
      intro:`王座大廳，所有規則交織成一道巨大的反應陣。通關者，才是真正的氧化還原守護者。`,
      learn:`綜合挑戰：看式子判氧化還原、配平半反應、由 E° 判斷自發、分辨原電池 vs 電解、提出防腐方案。`,
      viz:'boss'
    }
  ];

  // ----------- 題庫（適配國二～高二，含少量進階） -----------
  const E0 = [
    {half:"Ag+ + e- ⇌ Ag(s)", E:0.80},
    {half:"Cu2+ + 2e- ⇌ Cu(s)", E:0.34},
    {half:"Fe3+ + e- ⇌ Fe2+", E:0.77},
    {half:"Zn2+ + 2e- ⇌ Zn(s)", E:-0.76},
    {half:"2H+ + 2e- ⇌ H2(g)", E:0.00},
    {half:"Cl2 + 2e- ⇌ 2Cl-", E:1.36}
  ];
  const QBANK = {
    prologue:[
      {type:'mcq',q:'下列哪個敘述正確？',opts:[
        '氧化＝得到電子，還原＝失去電子。',
        '氧化＝失去電子，還原＝得到電子。',
        '氧化＝氧原子數變多，還原＝氧原子數變少。',
        '只有含氧的反應才是氧化還原。'
      ],ans:1,ex:'記憶鈎：LEO(lose e− oxidation) & GER(gain e− reduction)。含氧與否不是判準。'},
      {type:'tf',q:'某物質氧化數上升，表示它被氧化。',ans:true,ex:'氧化數上升＝失去電子。'}
    ],
    oxnum:[
      {type:'oxnum',q:'為 H2O2 的各元素標註氧化數。',formula:'H2O2',answer:{H:+1,O:-1},ex:'過氧中氧為 -1；代數和為 0。'},
      {type:'oxnum',q:'為 SO4^2- 各元素標註氧化數。',formula:'SO4^2-',answer:{S:+6,O:-2,charge:-2},ex:'S + 4×(−2) = −2 ⇒ S = +6。'},
      {type:'mcq',q:'下列何者氧化數必為 0？',opts:['NaCl','O2','H+','Fe2O3'],ans:1,ex:'單質之氧化數為 0。'}
    ],
    half:[
      {type:'fill',q:'在酸性溶液配平：MnO4- → Mn2+',blanks:['e','H+','H2O'],answer:{e:5,H:8,H2O:4},ex:'Mn: 1；O:4 由 4H2O 補；加 8H+；右側加 5e- 平衡電荷。'},
      {type:'mcq',q:'下列何者為還原劑？',opts:['使他者失去電子的物質','使他者得到電子的物質','接受電子的物質','在反應中氧化數下降的物質'],ans:0,ex:'還原劑讓別人被還原 → 還原劑自己被氧化（失去電子）。'}
    ],
    gal:[
      {type:'mcq',q:'Zn(s)|Zn2+ // Ag+|Ag(s) 的 E°cell 近似為多少？',opts:['+1.56 V','+0.46 V','−0.46 V','−1.56 V'],ans:0,ex:'陰極 Ag/Ag+ (0.80) − 陽極 Zn/Zn2+ (−0.76) ≈ +1.56 V。'},
      {type:'mcq',q:'原電池中，電子流向為？',opts:['陰極 → 陽極','陽極 → 陰極','鹽橋 → 溶液','外電路與鹽橋相同方向'],ans:1,ex:'電子從被氧化的陽極流向還原的陰極。'}
    ],
    ele:[
      {type:'tf',q:'電解時，陰極連接電源負極並發生還原。',ans:true,ex:'外加電源強迫電子流入陰極，使還原發生。'},
      {type:'mcq',q:'欲把銀鍍到湯匙上，哪個電極當作陰極？',opts:['銀板','湯匙','石墨棒','銅板'],ans:1,ex:'欲鍍在誰身上，誰當陰極（得到電子還原成金屬）。'}
    ],
    corr:[
      {type:'mcq',q:'下列何者最適合作為鐵船之犧牲陽極？',opts:['銅','銀','鋅','碘'],ans:2,ex:'用更易氧化之活潑金屬（如 Zn、Mg）。'},
      {type:'tf',q:'把鐵和銅接在一起淋雨，通常鐵會更快生鏽。',ans:true,ex:'鐵/銅形成微小原電池，鐵作陽極被優先氧化。'}
    ],
    boss:[
      {type:'boss',q:'判斷並配平（酸性）：Fe2+ + MnO4- → Fe3+ + Mn2+',answer:'5Fe2+ + MnO4- + 8H+ → 5Fe3+ + Mn2+ + 4H2O',ex:'經典半反應組合。'},
      {type:'mcq',q:'選出自發的組合（以標準電位近似）：',opts:[
        'Cu 與 Ag+ 反應',
        'Zn 與 Ag+ 反應',
        'Ag 與 Zn2+ 反應',
        'Cu 與 Zn2+ 反應'
      ],ans:1,ex:'Zn/Ag+ 有最大 E°cell。'}
    ]
  };

  // ----------- 成就系統 -----------
  const ACHIEVEMENTS = [
    {id:'hello',name:'初次充電',desc:'建立角色並踏入王國。',xp:50,icon:'⚡'},
    {id:'first-quiz',name:'第一滴電流',desc:'完成任一章節的第一題。',xp:50,icon:'🔋'},
    {id:'oxnum-clear',name:'氧化數見習生',desc:'通過氧化數學院小試。',xp:100,icon:'📛'},
    {id:'half-clear',name:'半反應工匠',desc:'完成半反應工坊。',xp:120,icon:'🛠️'},
    {id:'gal-clear',name:'電池城探險家',desc:'點亮原電池之城。',xp:120,icon:'🏙️'},
    {id:'ele-clear',name:'電解術士',desc:'解鎖電解監獄。',xp:120,icon:'🔌'},
    {id:'corr-clear',name:'防腐工程師',desc:'安撫腐蝕之海。',xp:120,icon:'🧪'},
    {id:'boss-clear',name:'王座守護者',desc:'通關終章 Boss。',xp:200,icon:'👑'},
    {id:'streak-3',name:'連勝之風',desc:'連續答對 3 題。',xp:80,icon:'🌬️'}
  ];

  // ----------- 狀態管理 -----------
  const DEFAULT_STATE = {name:'',xp:0,lvl:1,achv:[],streak:0,scene:'home',cleared:[],settings:{sound:false}};
  const save = (s)=>localStorage.setItem(STORE_KEY, JSON.stringify(s));
  const load = ()=>{ try{ return JSON.parse(localStorage.getItem(STORE_KEY))||{...DEFAULT_STATE}; }catch(e){ return {...DEFAULT_STATE}; } };
  let state = load();

  function grantAchv(id){
    if(!state.achv.includes(id)){
      state.achv.push(id);
      const a = ACHIEVEMENTS.find(x=>x.id===id);
      if(a){ gainXP(a.xp); toast(`成就解鎖：${a.name} +${a.xp}XP`); }
      save(state); render();
    }
  }
  function gainXP(n){
    state.xp += n;
    let next = state.lvl*200;
    while(state.xp>=next){ state.xp-=next; state.lvl++; next = state.lvl*200; toast(`升級！等級 ${state.lvl}`); }
    save(state);
  }

  // ----------- UI 公用 -----------
  function toast(msg){
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position='fixed'; t.style.left='50%'; t.style.bottom='24px'; t.style.transform='translateX(-50%)';
    t.style.background='rgba(0,0,0,.7)'; t.style.color='#fff'; t.style.padding='10px 14px'; t.style.borderRadius='10px'; t.style.zIndex='9999';
    document.body.appendChild(t); setTimeout(()=>t.remove(),1800);
  }
  function header(){
    const xpPct = Math.round((state.xp/(state.lvl*200))*100);
    return `
      <div class="header">
        <div class="brand">
          <div class="logo"></div>
          <div>
            <div class="title">氧化還原王國</div>
            <div class="small">Lv.${state.lvl} <span class="badge">經驗值</span></div>
          </div>
        </div>
        <div class="actions">
          <button class="btn" id="btn-map">王國地圖</button>
          <button class="btn" id="btn-achv">成就</button>
          <button class="btn" id="btn-share">分享</button>
          <button class="btn ghost" id="btn-install">安裝王國</button>
          <button class="btn ghost" id="btn-reset">重置</button>
        </div>
      </div>
      <div class="progress"><span style="width:${xpPct}%;"></span></div>
    `;
  }

  // ----------- 首頁 / 建立角色 -----------
  function renderHome(){
    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="hero card">
          <div class="title">把氧化還原學成一場冒險</div>
          <div class="subtitle">國二～高二對應，含少量 Boss 進階題。視覺化＋劇情＋測驗＋成就。</div>
          <div class="section inline-fields">
            <input id="name" class="input" placeholder="取個勇者名（可留空）" value="${state.name||''}">
            <button class="btn primary" id="start">進入王國</button>
          </div>
          <div class="tips small">提示：直接點「王國地圖」也可自由探索章節。</div>
        </div>
        <div class="section card">
          <h2>今日任務</h2>
          <div class="grid map">
            ${STORY.map(s=>sceneCard(s)).join('')}
          </div>
        </div>
        <div class="footer small">
          <div>本專案離線可用；使用本機儲存，不會傳出資料。</div>
          <div>版本 v1 · MIT 授權</div>
        </div>
      </div>
    `;
    bindHeader();
    $('#start').onclick = ()=>{
      state.name = $('#name').value.trim() || '無名勇者';
      save(state);
      grantAchv('hello');
      state.scene='map'; save(state); render();
    };
  }

  function sceneCard(s){
    const cleared = state.cleared.includes(s.id);
    const badge = cleared? '<span class="badge">已通關</span>' : '<span class="badge">新章節</span>';
    return `
      <div class="card scene-card">
        <div class="bg"></div>
        <div class="content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${s.title}</strong> ${badge}
          </div>
          <div class="small">${s.intro}</div>
          <div class="inline-fields" style="margin-top:10px">
            <button class="btn" data-goto="${s.id}">前往</button>
            <button class="btn ghost" data-preview="${s.id}">內容預覽</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindHeader(){
    $('#btn-map') && ($('#btn-map').onclick = ()=>{ state.scene='map'; save(state); render(); });
    $('#btn-achv') && ($('#btn-achv').onclick = ()=>renderAchv());
    $('#btn-reset') && ($('#btn-reset').onclick = ()=>{
      if(confirm('確定要重置所有進度？')){ state={...DEFAULT_STATE}; save(state); render(); }
    });
    $('#btn-share') && ($('#btn-share').onclick = ()=>renderShare());
    setupInstallPrompt();
  }

  // ----------- 地圖 -----------
  function renderMap(){
    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="section card">
          <h2>王國地圖</h2>
          <div class="grid map">${STORY.map(s=>sceneCard(s)).join('')}</div>
        </div>
      </div>`;
    bindHeader();
    $$('[data-goto]').forEach(b=>b.onclick = ()=>renderScene(b.dataset.goto));
    $$('[data-preview]').forEach(b=>b.onclick = ()=>previewScene(b.dataset.preview));
  }

  function previewScene(id){
    const s = STORY.find(x=>x.id===id);
    if(!s) return;
    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="card">
          <h2>${s.title}</h2>
          <p>${s.intro}</p>
          <p class="tips">${s.learn}</p>
          <div class="inline-fields">
            <button class="btn" onclick="history.back()">返回</button>
            <button class="btn primary" id="go">立刻挑戰</button>
          </div>
        </div>
      </div>`;
    bindHeader();
    $('#go').onclick = ()=>renderScene(id);
  }

  // ----------- 章節主畫面 -----------
  function renderScene(id){
    const s = STORY.find(x=>x.id===id);
    if(!s){ state.scene='map'; render(); return; }
    state.scene=id; save(state);

    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="grid" style="grid-template-columns:1fr;gap:16px">
          <div class="card">
            <h2>${s.title}</h2>
            <div class="subtitle">${s.intro}</div>
            <hr/>
            <div class="tips">${s.learn}</div>
          </div>
          <div class="card">
            <h2>互動視覺化</h2>
            <div class="svg-wrap" id="viz"></div>
            <div class="legend"></div>
          </div>
          <div class="card quiz" id="quiz"></div>
        </div>
      </div>`;
    bindHeader();
    renderViz(s.viz);
    renderQuiz(id);
  }

  // ----------- 視覺化 -----------
  function renderViz(kind){
    const box = $('#viz'); const legend = $('.legend');
    legend.innerHTML='';
    if(kind==='intro'){
      box.innerHTML = introViz();
      legend.innerHTML = chipLegend(['電子 e−','氧化（失去 e−）','還原（得到 e−）']);
    }else if(kind==='oxnum'){
      box.innerHTML = oxnumViz();
      legend.innerHTML = chipLegend(['點擊化學式上的元素以設定氧化數','和為總電荷']);
    }else if(kind==='half'){
      box.innerHTML = halfViz();
      legend.innerHTML = chipLegend(['拖曳電子到一邊以平衡電荷','H2O 與 H+ 幫你配平']);
    }else if(kind==='galvanic'){
      box.innerHTML = galvanicViz();
      legend.innerHTML = chipLegend(['選擇陽極/陰極','觀察電子從陽極 → 陰極','點擊「搭鹽橋」']);
    }else if(kind==='electrolysis'){
      box.innerHTML = electrolysisViz();
      legend.innerHTML = chipLegend(['切換電源','陰極=負極=還原；陽極=正極=氧化']);
    }else if(kind==='corrosion'){
      box.innerHTML = corrosionViz();
      legend.innerHTML = chipLegend(['為鐵選一個犧牲陽極','看腐蝕速度條']);
    }else if(kind==='boss'){
      box.innerHTML = bossViz();
      legend.innerHTML = chipLegend(['綜合挑戰：判、配、算']);
    }
  }
  const chipLegend = arr=>arr.map(t=>`<span class="chip">${t}</span>`).join(' ');

  function introViz(){
    return `
    <svg viewBox="0 0 800 260">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#66f"/>
        </marker>
      </defs>
      <rect x="20" y="20" width="360" height="200" rx="14" fill="#10223f" stroke="#234" />
      <rect x="420" y="20" width="360" height="200" rx="14" fill="#2a1335" stroke="#432" />
      <text x="60" y="52" fill="#9bd">失去電子＝氧化</text>
      <text x="460" y="52" fill="#f9b">得到電子＝還原</text>
      <circle cx="110" cy="120" r="40" fill="#1d3b66" stroke="#3fe0ff"/>
      <circle cx="710" cy="120" r="40" fill="#431a55" stroke="#ff4d6d"/>
      <text x="110" y="125" fill="#9bd" text-anchor="middle">A</text>
      <text x="710" y="125" fill="#f9b" text-anchor="middle">B</text>
      ${[0,1,2,3,4].map(i=>`<circle cx="${200+i*30}" cy="${120-30+Math.sin(i)*8}" r="6" fill="#66f">
         <animate attributeName="cx" values="${200+i*30};${640-i*30}" dur="${2+i*0.2}s" repeatCount="indefinite"/>
        </circle>`).join('')}
      <line x1="160" y1="120" x2="660" y2="120" stroke="#66f" stroke-width="2" marker-end="url(#arrow)"/>
    </svg>`;
  }

  // 簡版氧化數標註器
  function oxnumViz(){
    const formula = 'H2O2  SO4^2-  Fe2O3  NH4+  Cl2';
    return `<div>點擊標註：<span id="oxf" style="font-family:ui-monospace">${formula}</span></div>
    <div class="small tips">提示：過氧中氧常為 −1；單質為 0；總和=總電荷。</div>`;
  }

  function halfViz(){
    return `<div>拖曳電子小球到左右其中一欄，使兩邊電荷相等。</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <div class="card" id="left"><div>氧化式</div><div class="dropzone" style="height:80px;border:1px dashed #345;border-radius:10px"></div></div>
      <div class="card" id="right"><div>還原式</div><div class="dropzone" style="height:80px;border:1px dashed #345;border-radius:10px"></div></div>
    </div>
    <div style="margin-top:10px">
      ${[...Array(6)].map((_,i)=>`<span draggable="true" class="badge" style="margin:4px;cursor:grab" data-e="1">e−</span>`).join('')}
      <button class="btn" id="checkHalf">檢查平衡</button>
    </div>`;
  }

  function galvanicViz(){
    return `
    <div class="small">選擇陽極與陰極金屬，然後點「搭鹽橋」。</div>
    <div class="inline-fields" style="margin:8px 0">
      <select class="input" id="anodeSel">
        <option value="Zn">Zn (E°=-0.76)</option>
        <option value="Fe">Fe2+/Fe (E°=-0.44)</option>
        <option value="Cu">Cu2+/Cu (E°=+0.34)</option>
        <option value="Ag">Ag+/Ag (E°=+0.80)</option>
      </select>
      <select class="input" id="cathSel">
        <option value="Ag">Ag+/Ag (E°=+0.80)</option>
        <option value="Cu">Cu2+/Cu (E°=+0.34)</option>
        <option value="Fe">Fe2+/Fe (E°=-0.44)</option>
        <option value="Zn">Zn (E°=-0.76)</option>
      </select>
      <button class="btn" id="salt">搭鹽橋</button>
    </div>
    <svg viewBox="0 0 800 260">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#66f"/></marker></defs>
      <rect x="80" y="40" width="220" height="140" rx="16" fill="#0a1a33" stroke="#234"/>
      <rect x="500" y="40" width="220" height="140" rx="16" fill="#2a1233" stroke="#432"/>
      <text x="100" y="60" class="small">陽極</text>
      <text x="520" y="60" class="small">陰極</text>
      <rect x="200" y="140" width="20" height="40" fill="#999" id="anodeBar"/>
      <rect x="580" y="140" width="20" height="40" fill="#bbb" id="cathBar"/>
      <path id="bridge" d="M300,80 C370,0 430,0 500,80" stroke="#ccf" stroke-width="10" fill="none" opacity="0"/>
      <line id="eFlow" x1="220" y1="120" x2="580" y2="120" stroke="#66f" stroke-width="2" marker-end="url(#arrow)" opacity="0"/>
    </svg>
    <div class="small tips" id="cellInfo">等待設定…</div>`;
  }

  function electrolysisViz(){
    return `
    <div class="inline-fields">
      <button class="btn" id="power">電源：關</button>
      <span class="badge">陰極=負極（還原）/ 陽極=正極（氧化）</span>
    </div>
    <svg viewBox="0 0 800 260">
      <rect x="120" y="40" width="560" height="160" rx="20" fill="#10223f" stroke="#234"/>
      <rect x="260" y="60" width="20" height="120" fill="#ddd" id="cat"/>
      <rect x="520" y="60" width="20" height="120" fill="#aaa" id="an"/>
      <rect x="380" y="30" width="40" height="20" fill="#333"/><text x="360" y="28" fill="#ccc" class="small">直流電源</text>
      ${[0,1,2,3,4,5,6].map(i=>`<circle cx="${280+i*40}" cy="${100+Math.sin(i)*16}" r="4" fill="#66f" opacity="0" class="ion"></circle>`).join('')}
      ${[0,1,2,3,4,5,6].map(i=>`<circle cx="${500-i*40}" cy="${140+Math.sin(i)*16}" r="4" fill="#ff6b6b" opacity="0" class="ion2"></circle>`).join('')}
    </svg>
    <div class="small tips">開啟電源後，藍色陽離子朝陰極移動並得到電子沉積；紅色陰離子朝陽極移動並失去電子。</div>`;
  }

  function corrosionViz(){
    return `
    <div class="inline-fields">
      <label class="badge">犧牲陽極選擇：</label>
      <select class="input" id="sac">
        <option value="Mg">Mg（最活潑）</option>
        <option value="Zn">Zn</option>
        <option value="Cu">Cu（不適合）</option>
      </select>
    </div>
    <svg viewBox="0 0 800 220">
      <rect x="40" y="120" width="720" height="60" rx="10" fill="#1b2a3f" stroke="#2d4a6e"/>
      <rect x="80" y="140" width="420" height="20" fill="#777" id="iron"/>
      <rect x="520" y="140" width="40" height="20" fill="#bbb" id="sacBar"/>
      <text x="520" y="136" class="small">犧牲陽極</text>
      <rect x="80" y="180" width="420" height="6" fill="#3fe0ff"/>
    </svg>
    <div class="small">預測腐蝕速度：</div>
    <div class="progress"><span id="corrRate" style="width:60%"></span></div>
    <div class="small tips">與鐵接觸的金屬若較活潑，自己優先被氧化，鐵便被保護。</div>`;
  }

  function bossViz(){
    return `<div class="small">Boss 第一關：配平 Fe2+ 與 MnO4−（酸性）。點右側題目作答。</div>
    <div class="small">Boss 第二關：判斷自發性。</div>`;
  }

  // ----------- 測驗 -----------
  function renderQuiz(scene){
    const qbox = $('#quiz');
    const list = QBANK[scene]||[];
    let idx = 0, score = 0;
    qbox.innerHTML = `<h2>任務小試</h2><div id="qwrap"></div><div class="small">答對得分＋成就。少量題為 Boss 進階。</div>`;
    const wrap = $('#qwrap');
    nextQ();

    function nextQ(){
      if(idx>=list.length){
        qbox.innerHTML = `<h2>任務小試</h2><div class="card">完成！得分 ${score}/${list.length}</div>
          <div class="inline-fields" style="margin-top:8px"><button class="btn" id="again">重測</button></div>`;
        $('#again').onclick = ()=>{ idx=0; score=0; state.streak=0; nextQ(); };
        // 通關標記 + 成就
        if(!state.cleared.includes(scene)){ state.cleared.push(scene); save(state); }
        const achvId = scene+'-clear'; if(ACHIEVEMENTS.some(a=>a.id===achvId)) grantAchv(achvId);
        return;
      }
      const q = list[idx];
      wrap.innerHTML = renderQuestion(q, idx+1, list.length);
      bindQuestion(q);
    }

    function renderQuestion(q, n, total){
      if(!state.achv.includes('first-quiz')){ grantAchv('first-quiz'); }
      let body='';
      if(q.type==='mcq'){
        body = q.opts.map((t,i)=>`<div class="opt" data-i="${i}"><div class="badge">${String.fromCharCode(65+i)}</div><div>${t}</div></div>`).join('');
      }else if(q.type==='tf'){
        body = ['正確','錯誤'].map((t,i)=>`<div class="opt" data-i="${i===0}"><div class="badge">${t[0]}</div><div>${t}</div></div>`).join('');
      }else if(q.type==='fill'){
        body = `<div class="small">${q.q}</div><div class="inline-fields">`+
          (q.blanks||[]).map(k=>`<label class="badge">${k}</label><input class="input" style="width:80px" data-k="${k}" placeholder="?">`).join('')+
          `</div><button class="btn" id="submitFill">提交</button>`;
      }else if(q.type==='oxnum'){
        body = `<div class="small">${q.q}</div><div class="inline-fields"><code>${q.formula}</code></div>
        <div class="inline-fields"><label class="badge">H</label><input class="input" style="width:80px" data-k="H" placeholder="?">
        <label class="badge">O</label><input class="input" style="width:80px" data-k="O" placeholder="?">
        ${q.answer.charge!==undefined?'<label class="badge">總電荷</label><input class="input" style="width:80px" data-k="charge" placeholder="?">':''}
        <button class="btn" id="submitOx">提交</button></div>`;
      }else if(q.type==='boss'){
        body = `<div class="small">Boss：${q.q}</div>
          <textarea class="input" style="width:100%;min-height:80px" id="bossAns" placeholder="在此輸入配平後的總反應式"></textarea>
          <div class="inline-fields"><button class="btn" id="submitBoss">提交</button></div>`;
      }
      return `<div class="card"><div class="badge">第 ${n}/${total} 題</div><div class="q" style="margin:8px 0">${q.q||''}</div>${body}<div class="hint small" id="hint"></div></div>`;
    }

    function bindQuestion(q){
      if(q.type==='mcq'){
        $$('.opt', wrap).forEach(el=>el.onclick = ()=>{
          const i = parseInt(el.dataset.i,10);
          if(i===q.ans){ el.classList.add('correct'); score++; state.streak++; gainXP(40); toast('答對 +40XP'); }
          else{ el.classList.add('wrong'); state.streak=0; }
          $('#hint').textContent = q.ex||'';
          if(state.streak>=3) grantAchv('streak-3');
          setTimeout(()=>{ idx++; nextQ(); }, 700);
        });
      }else if(q.type==='tf'){
        $$('.opt', wrap).forEach(el=>el.onclick = ()=>{
          const val = el.dataset.i==='true';
          if(val===q.ans){ el.classList.add('correct'); score++; state.streak++; gainXP(30); toast('答對 +30XP'); }
          else{ el.classList.add('wrong'); state.streak=0; }
          $('#hint').textContent = q.ex||'';
          if(state.streak>=3) grantAchv('streak-3');
          setTimeout(()=>{ idx++; nextQ(); }, 700);
        });
      }else if(q.type==='fill'){
        $('#submitFill').onclick = ()=>{
          let ok=true;
          (q.blanks||[]).forEach(k=>{
            const v = parseInt($(`input[data-k="${k}"]`).value,10);
            if(v!==q.answer[k]) ok=false;
          });
          if(ok){ score++; state.streak++; gainXP(60); toast('配平成功 +60XP'); }
          else{ state.streak=0; }
          $('#hint').textContent = q.ex||'';
          if(state.streak>=3) grantAchv('streak-3');
          setTimeout(()=>{ idx++; nextQ(); }, 800);
        };
      }else if(q.type==='oxnum'){
        $('#submitOx').onclick = ()=>{
          const H = parseInt($('input[data-k="H"]').value,10);
          const O = parseInt($('input[data-k="O"]').value,10);
          const charge = q.answer.charge!==undefined ? parseInt($('input[data-k="charge"]').value,10) : 0;
          let ok = H===q.answer.H && O===q.answer.O && (q.answer.charge===undefined || charge===q.answer.charge);
          if(ok){ score++; state.streak++; gainXP(40); toast('標註正確 +40XP'); }
          else{ state.streak=0; }
          $('#hint').textContent = q.ex||'';
          if(state.streak>=3) grantAchv('streak-3');
          setTimeout(()=>{ idx++; nextQ(); }, 800);
        };
      }else if(q.type==='boss'){
        $('#submitBoss').onclick = ()=>{
          const ans = ($('#bossAns').value||'').replace(/\s+/g,'').replace(/→|=>/,'→');
          const goal = (q.answer||'').replace(/\s+/g,'').replace(/→|=>/,'→');
          let ok = ans===goal;
          if(ok){ score++; state.streak++; gainXP(120); toast('Boss 破關 +120XP'); }
          else{ state.streak=0; }
          $('#hint').textContent = q.ex||'';
          if(state.streak>=3) grantAchv('streak-3');
          setTimeout(()=>{ idx++; nextQ(); }, 1200);
        };
      }

      // 綁定視覺化互動（章節特有）
      setupVizInteractions();
    }
  }

  // ----------- 視覺化互動邏輯 -----------
  function setupVizInteractions(){
    // half：拖拉 e− 到左右
    $$('.dropzone').forEach(z=>{
      z.ondragover = e=>{ e.preventDefault(); };
      z.ondrop = e=>{ e.preventDefault(); z.appendChild(document.querySelector('[data-dragging="1"]')); };
    });
    $$('[data-e]').forEach(b=>{
      b.ondragstart = e=>{ b.dataset.dragging='1'; };
      b.ondragend = e=>{ b.dataset.dragging='0'; };
    });
    const chk = $('#checkHalf');
    if(chk){
      chk.onclick = ()=>{
        const L = $('#left .dropzone').children.length;
        const R = $('#right .dropzone').children.length;
        if(L===R && (L+R)>0){ gainXP(40); toast('電荷平衡！+40XP'); }
        else{ toast('左右電荷數（e−顆數）需相等'); }
      }
    }
    // galvanic：設定電極、顯示電位與電子方向
    const an = $('#anodeSel'), ca = $('#cathSel'), salt = $('#salt');
    if(an && ca && salt){
      const E = {Zn:-0.76, Fe:-0.44, Cu:0.34, Ag:0.80};
      function update(){
        const Ea = E[an.value]; const Ec = E[ca.value];
        const Ecell = (Ec - Ea);
        $('#cellInfo').textContent = `E°cell ≈ ${Ecell.toFixed(2)} V（${Ecell>0?'自發':'非自發'}）；電子：陽極 → 陰極`;
      }
      an.onchange=update; ca.onchange=update; update();
      salt.onclick = ()=>{
        $('#bridge').setAttribute('opacity','1');
        const e = $('#eFlow'); e.setAttribute('opacity','1');
        e.animate([{opacity:0},{opacity:1}],{duration:500,fill:'forwards'});
        gainXP(30); toast('鹽橋已搭成 +30XP');
      };
    }
    // electrolysis：開關電源→離子移動
    const power = $('#power');
    if(power){
      let on=false;
      power.onclick = ()=>{
        on=!on; power.textContent = '電源：'+(on?'開':'關');
        $$('.ion').forEach((c,i)=>{
          c.style.opacity = on?1:0;
          if(on){ c.animate([{cx:c.getAttribute('cx')},{cx:280+i*40+40}],{duration:1200+80*i,iterations:Infinity,direction:'alternate'}); }
        });
        $$('.ion2').forEach((c,i)=>{
          c.style.opacity = on?1:0;
          if(on){ c.animate([{cx:c.getAttribute('cx')},{cx:500-i*40-40}],{duration:1200+80*i,iterations:Infinity,direction:'alternate'}); }
        });
      };
    }
    // corrosion：選犧牲陽極→改變腐蝕速度
    const sac = $('#sac');
    if(sac){
      function upd(){
        const v = sac.value;
        let rate = 60;
        if(v==='Mg') rate = 10;
        if(v==='Zn') rate = 20;
        if(v==='Cu') rate = 85;
        $('#corrRate').style.width = rate+'%';
        toast(`預估鐵腐蝕強度：${rate}%`);
      }
      sac.onchange = upd; upd();
    }
  }

  // ----------- 成就畫面 -----------
  function renderAchv(){
    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="card">
          <h2>成就與稱號</h2>
          <div class="achv-grid">
            ${ACHIEVEMENTS.map(a=>`<div class="achv ${state.achv.includes(a.id)?'':'locked'}">
              <div class="icon">${a.icon}</div>
              <div><div><strong>${a.name}</strong></div><div class="small">${a.desc}</div></div>
            </div>`).join('')}
          </div>
        </div>
      </div>`;
    bindHeader();
  }

  // ----------- 分享（文字＋憑證圖片） -----------
  function renderShare(){
    const text = `我在「氧化還原王國」${state.name||'勇者'} 等級 ${state.lvl}，解鎖成就 ${state.achv.length} 個！`;
    app.innerHTML = `
      <div class="container screen">
        ${header()}
        <div class="card">
          <h2>分享你的電光時刻</h2>
          <div class="inline-fields">
            <button class="btn good" id="nativeShare">系統分享</button>
            <button class="btn" id="dlCert">下載成就憑證</button>
            <button class="btn" id="copyText">複製分享文字</button>
            <a class="btn" id="shareX" target="_blank" rel="noopener">分享到 X</a>
            <a class="btn" id="shareFB" target="_blank" rel="noopener">分享到 Facebook</a>
            <a class="btn" id="shareLINE" target="_blank" rel="noopener">分享到 LINE</a>
          </div>
          <canvas id="cert" width="1200" height="630" style="width:100%;margin-top:10px;border-radius:12px"></canvas>
        </div>
      </div>`;
    bindHeader();
    // draw certificate
    drawCert(text);
    // share handlers
    $('#copyText').onclick = async()=>{ await navigator.clipboard.writeText(text); toast('已複製分享文字'); };
    $('#nativeShare').onclick = async()=>{
      try{
        if(navigator.share) await navigator.share({title:'氧化還原王國', text, url:location.href});
        else toast('此裝置不支援原生分享，請改用下方按鈕或下載圖片。');
      }catch(e){}
    };
    const url = encodeURIComponent(location.href);
    const tw = 'https://twitter.com/intent/tweet?text='+encodeURIComponent(text)+'&url='+url;
    const fb = 'https://www.facebook.com/sharer/sharer.php?u='+url;
    const ln = 'https://social-plugins.line.me/lineit/share?url='+url;
    $('#shareX').href = tw; $('#shareFB').href = fb; $('#shareLINE').href = ln;
    $('#dlCert').onclick = ()=>{
      const a=document.createElement('a'); a.download='RedoxKingdom-Certificate.png';
      a.href = $('#cert').toDataURL('image/png'); a.click();
    };
  }

  function drawCert(text){
    const c = $('#cert'); const g = c.getContext('2d');
    g.fillStyle='#0b1220'; g.fillRect(0,0,c.width,c.height);
    // gradient
    const grd = g.createLinearGradient(0,0,c.width,c.height);
    grd.addColorStop(0,'#09162a'); grd.addColorStop(1,'#1c0e23');
    g.fillStyle=grd; g.fillRect(20,20,c.width-40,c.height-40);
    // title
    g.fillStyle='#3fe0ff'; g.font='48px system-ui'; g.fillText('氧化還原王國 · 成就憑證', 60, 110);
    g.fillStyle='#e6eef9'; g.font='28px system-ui'; g.fillText(text, 60, 170);
    // badges
    const icons = ['⚡','🔋','📛','🛠️','🏙️','🔌','🧪','👑','🌬️'];
    for(let i=0;i<icons.length;i++){
      const x = 60 + (i%6)*180; const y = 240 + Math.floor(i/6)*180;
      g.fillStyle='#10223f'; g.fillRect(x,y,150,120); g.strokeStyle='rgba(255,255,255,.2)'; g.strokeRect(x,y,150,120);
      g.fillStyle='#e6eef9'; g.font='50px serif'; g.fillText(icons[i], x+50, y+70);
    }
    g.fillStyle='#99b2d6'; g.font='20px system-ui'; g.fillText('分享自 Redox Kingdom（離線可玩、PWA 安裝、開源 MIT）', 60, 580);
  }

  // ----------- 安裝（PWA） -----------
  let deferredPrompt=null;
  function setupInstallPrompt(){
    $('#btn-install') && ($('#btn-install').onclick = async()=>{
      if(deferredPrompt){ deferredPrompt.prompt(); const {outcome}=await deferredPrompt.userChoice; if(outcome==='accepted') toast('已加入主畫面'); }
      else{ toast('如需安裝，請先用「一鍵啟動」以 http://localhost 方式開啟。'); }
    });
  }
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt = e; });

  // ----------- Service Worker 註冊 -----------
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });
  }

  // ----------- 首次渲染 -----------
  function render(){
    if(state.scene==='home') renderHome();
    else if(state.scene==='map') renderMap();
    else renderScene(state.scene);
  }
  render();

  // 將函數暴露（必要時）
  window.render = render;
})();
