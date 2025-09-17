
(async function(){
  if (window.__C2M_INJECTED__) return; window.__C2M_INJECTED__=true;

  const { isLikelyTinyIcon } = await import(chrome.runtime.getURL("/content/utils/image_utils.js"));

  const PLATFORM = detect();
  function detect(){
    const h = location.hostname;
    if (h.includes("chat.openai.com") || h.includes("chatgpt.com") || /(^|\.)openai\.com$/.test(h)) return "chatgpt";
    if (h.includes("claude.ai")) return "claude";
    if (h.includes("gemini.google.com") || h.includes("aistudio.google.com")) return "gemini";
    return "unknown";
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type==="C2M_PING") { sendResponse({ok:true, platform:PLATFORM}); return; }
    if (window.top !== window) return;
    if (msg?.type==="CAPTURE") { startCaptureStream(msg).then(()=>sendResponse({ok:true})); return true; }
  });

  async function startCaptureStream({ mode, storageKey }){
    const pageURL = location.href;
    const meta = { platform: PLATFORM, title: document.title||"", url: pageURL, capturedAt: new Date().toISOString(), language: document.documentElement.lang || navigator.language || "" };
    await sendPatch({ storageKey, url: pageURL, patch: { metadata: meta } });

    if (PLATFORM==="chatgpt") await streamChatGPT({ mode, storageKey, meta });
    else if (PLATFORM==="claude") await streamClaude({ mode, storageKey, meta });
    else if (PLATFORM==="gemini") await streamGemini({ mode, storageKey, meta });
    else {
      const body = (document.body?.innerText || "").trim();
      const msg = body ? [{ role:"user", content:[{type:"text", text: body.slice(0, 4000)}] }] : [];
      if (mode==="harmonies") {
        const { buildHarmonyText } = await import(chrome.runtime.getURL("/content/utils/harmony.js"));
        const text = buildHarmonyText(msg, meta);
        await sendPatch({ storageKey, url: pageURL, patch: { harmoniesChunk: text } });
      } else {
        await sendPatch({ storageKey, url: pageURL, patch: { appendMessages: msg } });
      }
      await sendDone({ storageKey, url: pageURL });
    }
  }

  async function streamChatGPT({ mode, storageKey, meta }){
    const root = document.querySelector("main") || document.body;
    const turnNodesRaw = Array.from(root.querySelectorAll('[data-testid^="conversation-turn"], [data-message-author-role]'));
    const turnSet = new Set();
    for (const el of turnNodesRaw) {
      const t = el.closest('[data-testid^="conversation-turn"]') || el;
      turnSet.add(t);
    }
    const turns = Array.from(turnSet).sort((a,b)=> a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const turn of turns) {
      const role = detectRole(turn);
      if (!role) continue;
      const content = [];
      const text = textFrom(turn);
      if (text) content.push({ type:"text", text });
      const imgs = Array.from(turn.querySelectorAll("img"));
      if (mode === "harmonies") {
        const valid = imgs.filter(img => !isLikelyTinyIcon(img, img.currentSrc||img.src||""));
        for (let k=0; k<valid.length; k++) content.push({ type:"image_token" });
        const m = { role, content };
        const { buildHarmonyText } = await import(chrome.runtime.getURL("/content/utils/harmony.js"));
        const chunk = buildHarmonyText([m], meta) + "\n";
        await sendPatch({ storageKey, url: meta.url, patch: { harmoniesChunk: chunk } });
      } else {
        for (const img of imgs) {
          const src = img.currentSrc || img.src || "";
          if (!src || isLikelyTinyIcon(img, src)) continue;
          const key = img.dataset.c2mKey || null;
          if (key) content.push({ type: role==="user" ? "input_image" : "image_url", image_url: { url: `c2m-idb:${key}`, detail:"high" } });
        }
        const m = { role, content };
        await sendPatch({ storageKey, url: meta.url, patch: { appendMessages: [m] } });
      }
    }
    await sendDone({ storageKey, url: meta.url });
  }

  async function streamClaude({ mode, storageKey, meta }){
    const rows = Array.from(document.querySelectorAll('.font-user-message, .font-claude-response'));
    const items = rows.sort((a,b)=> a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const el of items) {
      const isUser = !!el.closest('.font-user-message') || el.classList.contains('font-user-message');
      const role = isUser ? "user" : "assistant";
      const textNode = isUser ? el : (el.querySelector('.standard-markdown, .progressive-markdown') || el);
      const text = (textNode?.innerText || "").trim();
      const content = [];
      if (text) content.push({ type:"text", text });
      const imgs = Array.from(el.querySelectorAll("img"));
      if (mode==="harmonies") {
        const valid = imgs.filter(img => !isLikelyTinyIcon(img, img.currentSrc||img.src||""));
        for (let k=0; k<valid.length; k++) content.push({ type:"image_token" });
        const m = { role, content };
        const { buildHarmonyText } = await import(chrome.runtime.getURL("/content/utils/harmony.js"));
        const chunk = buildHarmonyText([m], meta) + "\n";
        await sendPatch({ storageKey, url: meta.url, patch: { harmoniesChunk: chunk } });
      } else {
        for (const img of imgs) {
          const src = img.currentSrc || img.src || "";
          if (!src || isLikelyTinyIcon(img, src)) continue;
          const key = img.dataset.c2mKey || null;
          if (key) content.push({ type: role==="user" ? "input_image" : "image_url", image_url:{ url: `c2m-idb:${key}`, detail:"high" } });
        }
        const m = { role, content };
        await sendPatch({ storageKey, url: meta.url, patch: { appendMessages: [m] } });
      }
    }
    await sendDone({ storageKey, url: meta.url });
  }

  async function streamGemini({ mode, storageKey, meta }){
    const main = document.querySelector("main") || document.body;
    const bubbles = Array.from(main.querySelectorAll('article, [role="listitem"]')).slice(-60);
    let role = "user";
    for (const el of bubbles) {
      role = role === "user" ? "assistant" : "user";
      const text = (el.innerText || "").trim();
      const content = [];
      if (text) content.push({ type:"text", text });
      const imgs = Array.from(el.querySelectorAll("img"));
      if (mode==="harmonies") {
        const valid = imgs.filter(img => !isLikelyTinyIcon(img, img.currentSrc||img.src||""));
        for (let k=0; k<valid.length; k++) content.push({ type:"image_token" });
        const m = { role, content };
        const { buildHarmonyText } = await import(chrome.runtime.getURL("/content/utils/harmony.js"));
        const chunk = buildHarmonyText([m], meta) + "\n";
        await sendPatch({ storageKey, url: meta.url, patch: { harmoniesChunk: chunk } });
      } else {
        for (const img of imgs) {
          const src = img.currentSrc || img.src || "";
          if (!src || isLikelyTinyIcon(img, src)) continue;
          const key = img.dataset.c2mKey || null;
          if (key) content.push({ type: role==="user" ? "input_image" : "image_url", image_url:{ url: `c2m-idb:${key}`, detail:"high" } });
        }
        const m = { role, content };
        await sendPatch({ storageKey, url: meta.url, patch: { appendMessages: [m] } });
      }
    }
    await sendDone({ storageKey, url: meta.url });
  }

  function detectRole(turn) {
    const attr = turn.getAttribute("data-message-author-role");
    if (attr && /assistant|user|system/i.test(attr)) return attr.toLowerCase();
    const innerAssist = turn.querySelector('[data-message-author-role="assistant"]');
    const innerUser = turn.querySelector('[data-message-author-role="user"]');
    if (innerAssist) return "assistant";
    if (innerUser) return "user";
    const testid = (turn.dataset?.testid || "").toLowerCase();
    if (testid.includes("assistant")) return "assistant";
    if (testid.includes("user")) return "user";
    if (turn.querySelector('.markdown')) return "assistant";
    return null;
  }
  function textFrom(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('button, input, textarea, select, menu, nav, svg, style, script, [data-testid*="action-bar"], [role="toolbar"]').forEach(n=>n.remove());
    return (clone.innerText || "").trim();
  }

  async function sendPatch({ storageKey, url, patch }){
    await chrome.runtime.sendMessage({ type:"C2M_PROGRESS", storageKey, url, patch });
  }
  async function sendDone({ storageKey, url }){
    await chrome.runtime.sendMessage({ type:"C2M_DONE", storageKey, url, patch: {} });
  }
})();
