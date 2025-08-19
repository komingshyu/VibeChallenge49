// ASTRO//ARCANE v3 front-end with streaming interpretation
let chartData = null;
function $(id){ return document.getElementById(id); }

$("btnGeo").addEventListener("click", () => {
  if (!navigator.geolocation){
    alert("此瀏覽器不支援定位。請手動輸入地名或經緯度。"); return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      $("lat").value = pos.coords.latitude.toFixed(6);
      $("lng").value = pos.coords.longitude.toFixed(6);
    },
    err => alert("定位失敗：" + err.message),
    { enableHighAccuracy:true, timeout:8000 }
  );
});

$("btnCalc").addEventListener("click", async () => {
  const place = $("place").value.trim();
  const lat = $("lat").value ? parseFloat($("lat").value) : null;
  const lng = $("lng").value ? parseFloat($("lng").value) : null;
  const date = $("date").value;
  const time = $("time").value;

  if (!date || !time){
    alert("請輸入出生日期與時間（當地）。");
    return;
  }

  const payload = {
    datetime_local: `${date}T${time}`,
    place: place || null,
    latitude: lat,
    longitude: lng
  };

  try{
    const res = await fetch("/api/chart", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok){
      const txt = await res.text();
      throw new Error(txt);
    }
    chartData = await res.json();
    renderAll(chartData);

    // Streaming AI 解讀
    $("aiSec").classList.remove("hidden");
    $("aiText").textContent = "";
    await streamInterpret(chartData);
  }catch(e){
    console.error(e);
    alert("計算失敗：" + e);
  }
});

async function streamInterpret(data){
  const res = await fetch("/api/interpret/stream", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"text/event-stream"
    },
    body: JSON.stringify({ chart: data })
  });
  if (!res.ok){
    $("aiText").textContent = "解讀連線失敗。";
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while(true){
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream:true});
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const f of frames){
      const lines = f.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines){
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event === "start"){
        // 可在此重置 UI 狀態
        continue;
      }
      if (event === "done"){
        return;
      }
      if (data){
        $("aiText").textContent += data;
      }
    }
  }
}

function renderAll(data){
  $("viz").classList.remove("hidden");
  $("tables").classList.remove("hidden");
  drawChart("chartCanvas", data);
  fillTables(data);
  $("readout").textContent = `UTC 時間：${data.utc}（時區：${data.tz}）`;
  renderLegend();
}

function renderLegend(){
  const legend = $("legend");
  const entries = [
    ["☉","太陽"],["☽","月亮"],["☿","水星"],["♀","金星"],["♂","火星"],
    ["♃","木星"],["♄","土星"],["♅","天王星"],["♆","海王星"],["♇","冥王星"],["ASC","上升"]
  ];
  legend.innerHTML = "";
  for (const [glyph, name] of entries){
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span class="tip" data-tip="${name}">${glyph}</span>`;
    legend.appendChild(chip);
  }
}

function fillTables(data){
  const tbody = $("planetTable").querySelector("tbody");
  tbody.innerHTML = "";
  const order = ["上升","太陽","月亮","水星","金星","火星","木星","土星","天王星","海王星","冥王星"];
  for (const name of order){
    const d = data.details[name];
    if (!d) continue;
    const flags = d.accidental && d.accidental.flags ? d.accidental.flags.join("、") : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="tip" data-tip="${name}">${d.glyph || "ASC"}</span></td>
      <td>${name}</td>
      <td>${d.sign.text}</td>
      <td>${d.house}</td>
      <td>${d.house_meaning}</td>
      <td>${flags}</td>`;
    tbody.appendChild(tr);
  }

  const hbody = $("houseTable").querySelector("tbody");
  hbody.innerHTML = "";
  for (const h of data.houses){
    const occ = h.occupants && h.occupants.length ? h.occupants.join("、") : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${h.house}</td><td>${h.cusp_text}</td><td>${h.meaning}</td><td>${occ}</td>`;
    hbody.appendChild(tr);
  }

  const abody = $("aspectTable").querySelector("tbody");
  abody.innerHTML = "";
  for (const a of data.aspects){
    const cls = aspectClass(a.type, a.importance);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="${cls}">${a.pair}</td><td class="${cls}">${a.type}</td><td class="${cls}">${a.off_exact}</td>`;
    abody.appendChild(tr);
  }

  const gt = $("gtList"); gt.textContent = "";
  if (data.grand_trines && data.grand_trines.length){
    for (const g of data.grand_trines){
      const div = document.createElement("div");
      div.className = "gt";
      div.textContent = `大三角：${g.triplet.join("、")}（元素：${g.element}）`;
      gt.appendChild(div);
    }
  }
}

function aspectClass(type, importance){
  let base = (importance === "major") ? "aspect-major " : "";
  if (type === "三分相") return base + "aspect-trine";
  if (type === "合相") return base + "aspect-conj";
  if (type === "對分相") return base + "aspect-oppo";
  if (type === "四分相") return "aspect-square";
  if (type === "六合") return "aspect-sext";
  return "";
}

function drawChart(canvasId, data){
  const canvas = $(canvasId);
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const cx = W/2, cy = H/2;
  const R = Math.min(W,H)/2 - 32;

  // Background glow
  const radial = ctx.createRadialGradient(cx, cy, R*0.1, cx, cy, R);
  radial.addColorStop(0, "rgba(125,249,255,0.12)");
  radial.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fill();

  // Zodiac ring
  const signs = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];
  ctx.save(); ctx.translate(cx,cy);
  for (let i=0;i<12;i++){
    const a0 = (-90 + i*30) * Math.PI/180;
    const a1 = (-90 + (i+1)*30) * Math.PI/180;
    ctx.beginPath();
    ctx.arc(0,0,R, a0, a1);
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.stroke();

    // tick
    ctx.beginPath();
    ctx.arc(0,0,R-22, a0, a0+0.001);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(125,249,255,0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(125,249,255,0.8)";
    ctx.stroke();
    ctx.shadowBlur = 0;

    // label
    ctx.save();
    const mid = (a0+a1)/2;
    const tx = Math.cos(mid)*(R-46);
    const ty = Math.sin(mid)*(R-46);
    ctx.translate(tx,ty);
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(signs[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Houses
  for (const h of data.houses){
    const deg = h.cusp;
    const rad = (deg - 90) * Math.PI/180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad)*R, cy + Math.sin(rad)*R);
    ctx.strokeStyle = "rgba(165,123,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Aspect lines (emphasize major)
  function drawAspectLine(a, b, type, strength){
    const ra = (a - 90)*Math.PI/180;
    const rb = (b - 90)*Math.PI/180;
    const rInner = R*0.56;
    const ax = cx + Math.cos(ra)*rInner, ay = cy + Math.sin(ra)*rInner;
    const bx = cx + Math.cos(rb)*rInner, by = cy + Math.sin(rb)*rInner;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);

    let alpha = 0.2 + Math.min(0.6, (strength||0)/10);
    let width = 1 + Math.min(3, (strength||0)/2);
    let color = "rgba(255,255,255,"+alpha+")";
    if (type === "三分相") color = "rgba(107,255,179,"+alpha+")";
    if (type === "合相") color = "rgba(255,214,107,"+alpha+")";
    if (type === "對分相") color = "rgba(255,143,163,"+alpha+")";
    if (type === "四分相") color = "rgba(164,139,255,"+alpha+")";
    if (type === "六合") color = "rgba(139,211,255,"+alpha+")";
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.stroke();
  }
  if (data.aspects){
    for (const a of data.aspects){
      const [p1, p2] = a.pair.split("–");
      if (!(p1 in data.positions) || !(p2 in data.positions)) continue;
      drawAspectLine(data.positions[p1], data.positions[p2], a.type, a.strength || 0);
    }
  }

  // Grand Trine highlight (bold triangle)
  if (data.grand_trines){
    for (const g of data.grand_trines){
      const pts = g.triplet.map(n => {
        const ang = (data.positions[n] - 90)*Math.PI/180;
        const r = R*0.6;
        return [cx + Math.cos(ang)*r, cy + Math.sin(ang)*r];
      });
      if (pts.length === 3){
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        ctx.strokeStyle = "rgba(107,255,179,0.9)";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 8; ctx.shadowColor = "rgba(107,255,179,0.7)";
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
  }

  // Planet markers + interactive tooltips
  const order = ["太陽","月亮","水星","金星","火星","木星","土星","天王星","海王星","冥王星","上升"];
  const glyphs = {"太陽":"☉","月亮":"☽","水星":"☿","金星":"♀","火星":"♂","木星":"♃","土星":"♄","天王星":"♅","海王星":"♆","冥王星":"♇","上升":"ASC"};
  const hitpoints = []; // {name,x,y,info}

  for (const name of order){
    if (!(name in data.positions)) continue;
    const lon = data.positions[name];
    const angle = (lon - 90) * Math.PI/180;
    const r = R - 28;
    const x = cx + Math.cos(angle)*r;
    const y = cy + Math.sin(angle)*r;

    // glow dot
    ctx.beginPath();
    ctx.arc(x,y,9,0,Math.PI*2);
    ctx.fillStyle = "rgba(125,249,255,0.25)";
    ctx.shadowBlur = 16; ctx.shadowColor = "rgba(125,249,255,0.8)";
    ctx.fill(); ctx.shadowBlur = 0;

    // glyph
    ctx.font = "18px system-ui, sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(glyphs[name] || name, x, y);

    const d = data.details[name];
    if (d){
      hitpoints.push({ name, x, y, info: `${name}｜${d.sign.text}｜第${d.house}宮` });
    }
  }

  // Tooltip interaction
  const tip = $("tooltip");
  canvas.onmousemove = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (canvas.width/rect.width);
    const my = (ev.clientY - rect.top) * (canvas.height/rect.height);
    let nearest = null, best = 999;
    for (const h of hitpoints){
      const d2 = (h.x-mx)*(h.x-mx) + (h.y-my)*(h.y-my);
      if (d2 < best){ best = d2; nearest = h; }
    }
    if (nearest && best < 18*18){
      tip.textContent = nearest.info;
      tip.style.left = ( (nearest.x / canvas.width) * rect.width + rect.left ) + "px";
      tip.style.top = ( (nearest.y / canvas.height) * rect.height + rect.top ) + "px";
      tip.classList.remove("hidden");
    }else{
      tip.classList.add("hidden");
    }
  };
  canvas.onmouseleave = () => tip.classList.add("hidden");
}