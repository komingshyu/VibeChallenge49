
function $(q,root=document){return root.querySelector(q)}; function $all(q,root=document){return Array.from(root.querySelectorAll(q))};
const params = new URLSearchParams(location.search);
const key = params.get("key"); const mode = params.get("mode") || "messages"; const owner = params.get("owner") || "";
const state = { payload:null, url:null };

$all(".tab").forEach(t=> t.addEventListener("click", ev => { ev.preventDefault(); const tab = t.dataset.tab; selectTab(tab); }));

init();
async function init(){
  const store = await chrome.storage.local.get([key]);
  const payload = store[key] || {};
  state.payload = payload;
  state.url = Object.keys(payload || {})[0] || owner || "";
  selectTab("render"); render();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[key]) return;
    state.payload = changes[key].newValue;
    if (!state.url) state.url = Object.keys(state.payload||{})[0] || owner || "";
    const active = $(".tab.active")?.dataset?.tab || "render";
    if (active==="render") render(); else if (active==="json") renderJSON(); else renderDiag();
  });
}
function selectTab(name){
  $all(".tab").forEach(el=> el.classList.toggle("active", el.dataset.tab===name));
  $("#pane-render").classList.toggle("hidden", name!=="render");
  $("#pane-json").classList.toggle("hidden", name!=="json");
  $("#pane-diag").classList.toggle("hidden", name!=="diag");
  if (name==="json") renderJSON();
  if (name==="diag") renderDiag();
}
function render(){
  const out = $("#pane-render"); out.innerHTML="";
  const data = state.payload?.[state.url] || {};
  const meta = data.metadata || {};
  const banner = document.createElement("div"); banner.className = "banner";
  const st = data.__status || "capturing";
  banner.textContent = (st==="done") ? "已完成擷取" : "擷取中…";
  const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = (mode==="messages"?"messages":"harmony");
  banner.appendChild(badge);
  out.appendChild(banner);

  const mini = document.createElement("div"); mini.className="mono"; mini.textContent = `${meta.platform||""} · ${meta.url||state.url}`;
  out.appendChild(mini);
  out.appendChild(document.createElement("hr"));

  if (mode==="messages"){
    out.appendChild(renderMessages(data.messages||[]));
  } else {
    const text = data.harmonies || "";
    out.appendChild(renderHarmonyText(text || "(等待串流…)"));
  }
}
function renderMessages(messages){
  const wrap = document.createElement("div"); wrap.className="chat";
  for (const m of messages){
    const row = document.createElement("div"); row.className="msg";
    const av = document.createElement("div"); av.className="avatar"; av.textContent = m.role==="user"?"U":(m.role==="assistant"?"A":"T");
    const bubble = document.createElement("div"); bubble.className="bubble";
    const txts = []; const imgs = [];
    if (Array.isArray(m.content)){
      for (const part of m.content){
        if (part.type==="text") txts.push(part.text||"");
        if ((part.type==="image_url" || part.type==="input_image") && part.image_url?.url) imgs.push(part.image_url.url);
        if (part.type==="image_token") imgs.push("c2m-token");
      }
    } else if (typeof m.content==="string"){ txts.push(m.content); }
    if (txts.length){ const pre = document.createElement("pre"); pre.textContent = txts.join("\n\n"); bubble.appendChild(pre); }
    if (imgs.length){
      const box = document.createElement("div"); box.className="images";
      imgs.forEach(async (s)=>{
        const im = new Image();
        if (s.startsWith("data:")) im.src = s;
        else if (s.startsWith("c2m-idb:")) {
          const key = s.slice("c2m-idb:".length);
          const res = await chrome.runtime.sendMessage({ type:"IDB_GET_BLOB", key });
          if (res?.ok) {
            const blob = new Blob([new Uint8Array(res.buf)], { type: res.mime || "image/png" });
            const url = URL.createObjectURL(blob);
            im.src = url;
            im.addEventListener("load", () => setTimeout(()=>URL.revokeObjectURL(url), 8000), { once:true });
          } else {
            im.alt = "(影像快取不存在)";
          }
        } else if (s === "c2m-token") {
          const tag = document.createElement("code"); tag.textContent = "<|image|>"; box.appendChild(tag); return;
        } else {
          im.src = s;
        }
        box.appendChild(im);
      });
      bubble.appendChild(box);
    }
    row.appendChild(av); row.appendChild(bubble); wrap.appendChild(row);
  }
  return wrap;
}
function renderHarmonyText(text){
  const pre = document.createElement("pre"); pre.className="mono";
  pre.innerHTML = highlightHarmony(text);
  const box = document.createElement("div"); box.className="bubble"; box.appendChild(pre);
  return box;
}
function highlightHarmony(s){
  const lines = String(s||"").split(/\n/);
  return lines.map(line => {
    return line
      .replace(/<\|start\|>/g, '<span class="token-start">&lt;|start|&gt;</span>')
      .replace(/<\|end\|>/g, '<span class="token-end">&lt;|end|&gt;</span>')
      .replace(/<\|message\|>/g, '<span class="token-msg">&lt;|message|&gt;</span>')
      .replace(/<\|channel\|>/g, '<span class="token-chan">&lt;|channel|&gt;</span>')
      .replace(/<\|image\|>/g, '<code>&lt;|image|&gt;</code>')
      .replace(/(<\|start\|>)(system|user|assistant|tool)/g, (_,a,b)=> `<span class="token-start">&lt;|start|&gt;</span><span class="token-role">${b}</span>`);
  }).join("\n");
}
function renderJSON(){ $("#json-view").textContent = JSON.stringify(state.payload || {}, null, 2); }
function renderDiag(){
  const data = state.payload?.[state.url] || {};
  $("#diag-view").textContent = JSON.stringify(data.__diagnostics || data || {}, null, 2);
}
$("#btn-copy").addEventListener("click", async ()=>{ await navigator.clipboard.writeText($("#json-view").textContent); alert("已複製 JSON"); });
$("#btn-download").addEventListener("click", ()=>{
  const blob = new Blob([$("#json-view").textContent], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chat2message.json"; a.click(); URL.revokeObjectURL(a.href);
});
$("#btn-export-b64").addEventListener("click", async ()=>{
  const status = $("#export-status"); status.textContent = "轉換中...";
  const data = JSON.parse($("#json-view").textContent || "{}");
  const url = Object.keys(data)[0];
  const page = data[url] || {};
  let replaced = 0;
  async function resolveInContent(parts){
    if (!Array.isArray(parts)) return;
    for (const p of parts) {
      if ((p.type==="image_url" || p.type==="input_image") && p.image_url?.url?.startsWith("c2m-idb:")) {
        const key = p.image_url.url.slice("c2m-idb:".length);
        const res = await chrome.runtime.sendMessage({ type:"IDB_GET_DATAURL", key });
        if (res?.ok) { p.image_url.url = res.dataUrl; replaced++; }
      }
    }
  }
  if (page.messages) for (const m of page.messages) await resolveInContent(m.content);
  const out = JSON.stringify(data, null, 2);
  const blob = new Blob([out], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chat2message_base64.json"; a.click(); URL.revokeObjectURL(a.href);
  status.textContent = `完成，已嵌入 ${replaced} 張影像。`;
});
