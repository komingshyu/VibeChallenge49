
import { isLikelyTinyIcon } from "../utils/image_utils.js";

export async function extract({ page, meta, mode }) {
  const di = { images:{ref_count:0, err:0, skipped_icons:0}, notes:[], timings:{} };
  const t0 = performance.now();
  const root = document.querySelector("main") || document.body;

  const turnNodesRaw = Array.from(root.querySelectorAll('[data-testid^="conversation-turn"], [data-message-author-role]'));
  const turnSet = new Set();
  for (const el of turnNodesRaw) {
    const turn = el.closest('[data-testid^="conversation-turn"]') || el;
    turnSet.add(turn);
  }
  const turns = Array.from(turnSet).sort((a,b)=> a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

  const messages = [];
  for (const turn of turns) {
    const role = detectRole(turn);
    if (!role) { di.notes.push("skip-turn-without-role"); continue; }

    const text = textFrom(turn);
    const content = [];
    if (text) content.push({ type:"text", text });

    const imgs = Array.from(turn.querySelectorAll("img"));
    for (const img of imgs) {
      const src = img.currentSrc || img.src || "";
      if (!src || isLikelyTinyIcon(img, src)) { di.images.skipped_icons++; continue; }
      const key = img.dataset.c2mKey || null;
      if (mode === "harmonies") {
        // Harmony 模式：僅放 image token（fast）
        content.push({ type:"image_token" });
      } else {
        // Messages 模式：放 IDB 引用（快；Viewer 會即時 resolve）
        if (key) {
          content.push({ type: role==="user" ? "input_image" : "image_url", image_url: { url: `c2m-idb:${key}`, detail:"high" } });
          di.images.ref_count++;
        } else {
          // 尚未預載就暫時跳過（Viewer 可再請求補抓；或使用可視區保底）
          di.images.err++;
        }
      }
    }
    messages.push({ role, content });
  }

  di.timings.total_extract_ms = Math.round(performance.now() - t0);
  return { metadata: meta, messages, __diagnostics: di };
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
