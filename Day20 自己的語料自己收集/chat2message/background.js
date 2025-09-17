
const MENU_MSG = "c2m-capture-messages";
const MENU_HMY = "c2m-capture-harmonies";
const DOCS = [
  "https://chat.openai.com/*",
  "https://chatgpt.com/*",
  "https://*.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://aistudio.google.com/*"
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_MSG, title: "採集為 message", contexts: ["page"], documentUrlPatterns: DOCS });
    chrome.contextMenus.create({ id: MENU_HMY, title: "採集為 harmony", contexts: ["page"], documentUrlPatterns: DOCS });
  });
});

// ---- IDB (images) ----
let dbp;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open("chat2message", 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("images")) {
        const store = db.createObjectStore("images", { keyPath: "key" });
        store.createIndex("owner", "owner", {});
        store.createIndex("expiresAt", "expiresAt", {});
      } else {
        const store = req.transaction.objectStore("images");
        if (!store.indexNames.contains("owner")) store.createIndex("owner", "owner", {});
        if (!store.indexNames.contains("expiresAt")) store.createIndex("expiresAt", "expiresAt", {});
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
  return dbp;
}
async function idbPutImage(rec) {
  const db = await idb();
  return await new Promise((res, rej) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").put(rec);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGetImage(key) {
  const db = await idb();
  return await new Promise((res, rej) => {
    const tx = db.transaction("images", "readonly");
    tx.objectStore("images").get(key).onsuccess = (ev) => res(ev.target.result || null);
    tx.onerror = () => rej(tx.error);
  });
}
async function dataURLtoBlob(dataUrl) {
  const resp = await fetch(dataUrl);
  return await resp.blob();
}
async function blobToDataURL(blob) {
  const buf = await blob.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

// MAIN world bridge (for first‑party cookie‑gated URLs)
async function initMainBridge(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: "MAIN",
      func: () => {
        if (window.__C2M_BRIDGE_READY__) return "ready";
        window.__C2M_BRIDGE_READY__ = true;
        window.addEventListener("message", async (ev) => {
          const d = ev.data || {};
          if (d?.__c2m !== "REQ" || d.kind !== "fetchImage" || !d.url || !d.id) return;
          try {
            const r = await fetch(d.url, { credentials:"include", cache:"no-store" });
            if (!r.ok) { window.postMessage({ __c2m:"RES", id:d.id, ok:false, status:r.status }, location.origin); return; }
            const blob = await r.blob();
            const fr = new FileReader();
            fr.onload = () => {
              const dataUrl = fr.result || "";
              const CHUNK = 256*1024;
              for (let i=0; i<dataUrl.length; i+=CHUNK) {
                const part = dataUrl.slice(i, i+CHUNK);
                window.postMessage({ __c2m:"RES", id:d.id, ok:true, part, final:(i+CHUNK)>=dataUrl.length }, location.origin);
              }
            };
            fr.onerror = () => window.postMessage({ __c2m:"RES", id:d.id, ok:false, error:"reader" }, location.origin);
            fr.readAsDataURL(blob);
          } catch (e) {
            window.postMessage({ __c2m:"RES", id:d.id, ok:false, error:String(e) }, location.origin);
          }
        }, false);
        return "installed";
      }
    });
    return (res && res[0] && res[0].result) || "ok";
  } catch (e) {
    console.warn("initMainBridge failed", e);
    return "err";
  }
}

// SW fetch for external media (avoid page CSP; no credentials)
async function swFetchToIDB({ url, key, owner }) {
  const resp = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!resp.ok) throw new Error("http-"+resp.status);
  const blob = await resp.blob();
  await idbPutImage({ key, owner, src:url, blob, createdAt: Date.now(), expiresAt: Date.now()+30*60*1000 });
  return true;
}

// Ensure content/content.js is present before CAPTURE
async function ensureContent(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type:"C2M_PING" }, { frameId: 0 });
    if (pong?.ok) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId, allFrames:false }, files: ["content/content.js"] });
  try { await chrome.tabs.sendMessage(tabId, { type:"C2M_PING" }, { frameId: 0 }); } catch {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "REGISTER_PAGE") { sendResponse({ ok:true }); return; }
    if (msg?.type === "INIT_MAIN_BRIDGE") { const tabId = sender?.tab?.id; if (tabId) await initMainBridge(tabId); sendResponse({ ok:true }); return; }
    if (msg?.type === "SW_FETCH_AND_PUT") { try { await swFetchToIDB({ url: msg.url, key: msg.key, owner: msg.owner }); sendResponse({ ok:true }); } catch(e){ sendResponse({ ok:false, error:String(e) }); } return; }
    if (msg?.type === "IDB_PUT_FROM_DATAURL") { const blob = await dataURLtoBlob(msg.dataUrl); await idbPutImage({ key: msg.key, owner: msg.owner, src: msg.src||"", blob, createdAt: Date.now(), expiresAt: Date.now()+30*60*1000 }); sendResponse({ ok:true }); return; }
    if (msg?.type === "IDB_GET_BLOB") { const rec = await idbGetImage(msg.key); if (!rec) { sendResponse({ ok:false, error:"not-found" }); return; } const b = rec.blob; const buf = await b.arrayBuffer(); sendResponse({ ok:true, mime:b.type||"image/png", buf, src: rec.src||"" }); return true; }
    if (msg?.type === "IDB_GET_DATAURL") { const rec = await idbGetImage(msg.key); if (!rec) { sendResponse({ ok:false, error:"not-found" }); return; } const dataUrl = await blobToDataURL(rec.blob); sendResponse({ ok:true, dataUrl, src: rec.src||"" }); return; }

    // Streaming capture updates from content
    if (msg?.type === "C2M_PROGRESS" || msg?.type === "C2M_DONE") {
      const { storageKey, url, patch } = msg;
      const store = await chrome.storage.local.get([storageKey]);
      const data = store[storageKey] || {};
      const page = data[url] || (data[url] = { metadata: {}, messages: [], harmonies: "", __diagnostics: {} });
      if (patch?.metadata) page.metadata = Object.assign({}, page.metadata, patch.metadata);
      if (Array.isArray(patch?.appendMessages) && patch.appendMessages.length) {
        page.messages = page.messages || [];
        page.messages.push(...patch.appendMessages);
      }
      if (typeof patch?.harmoniesChunk === "string" && patch.harmoniesChunk) {
        page.harmonies = (page.harmonies || "") + patch.harmoniesChunk;
      }
      if (patch?.diagnostics) page.__diagnostics = Object.assign({}, page.__diagnostics, patch.diagnostics);
      page.__status = (msg.type === "C2M_DONE") ? "done" : "capturing";
      await chrome.storage.local.set({ [storageKey]: data });
      sendResponse({ ok:true });
      return;
    }
  })();
  return true;
});

// Context menu: open Viewer immediately, then ensure content, then start capture
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const mode = (info.menuItemId === MENU_HMY) ? "harmonies" : "messages";
  const tabId = tab.id;
  await initMainBridge(tabId);

  const storageKey = `c2m:${Date.now()}`;
  const pageURL = tab.url || "about:blank";
  const skeleton = { [pageURL]: { metadata: { url: pageURL, platform: "unknown", title: tab.title || "", capturedAt: new Date().toISOString() }, __status: "capturing" } };
  await chrome.storage.local.set({ [storageKey]: skeleton });

  const viewerURL = chrome.runtime.getURL(`viewer/index.html?key=${encodeURIComponent(storageKey)}&mode=${encodeURIComponent(mode)}&owner=${encodeURIComponent(pageURL)}`);
  chrome.tabs.create({ url: viewerURL });

  // Make sure content/content.js is there before we send CAPTURE
  await ensureContent(tabId);

  chrome.tabs.sendMessage(tabId, { type:"CAPTURE", mode, storageKey }, { frameId: 0 }).catch(()=>{});
});

// Visible crop fallback
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CAPTURE_ELEMENT_SCREENSHOT") {
    const { rect, dpr } = msg;
    chrome.tabs.captureVisibleTab(undefined, { format: "png" }).then(async dataUrl => {
      const blob = await (await fetch(dataUrl)).blob();
      const bmp = await createImageBitmap(blob);
      const sx = Math.max(0, Math.round(rect.x * dpr));
      const sy = Math.max(0, Math.round(rect.y * dpr));
      const sw = Math.max(1, Math.round(rect.width * dpr));
      const sh = Math.max(1, Math.round(rect.height * dpr));
      const canvas = new OffscreenCanvas(sw, sh);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, -sx, -sy);
      const out = await canvas.convertToBlob({ type:"image/png" });
      const buf = await out.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      sendResponse({ ok:true, dataUrl: `data:image/png;base64,${b64}` });
    }).catch(err => sendResponse({ ok:false, error:String(err) }));
    return true;
  }
});
