
import { isLikelyTinyIcon } from "../utils/image_utils.js";

export async function extract({ page, meta, mode }) {
  const di = { images:{ref_count:0, err:0, skipped_icons:0}, timings:{} };
  const t0 = performance.now();

  const rows = Array.from(document.querySelectorAll('.font-user-message, .font-claude-response'));
  const items = rows.sort((a,b)=> a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

  const messages = [];
  for (const el of items) {
    const isUser = !!el.closest('.font-user-message') || el.classList.contains('font-user-message');
    const role = isUser ? "user" : "assistant";
    const textNode = isUser ? el : (el.querySelector('.standard-markdown, .progressive-markdown') || el);
    const text = (textNode?.innerText || "").trim();
    const content = [];
    if (text) content.push({ type:"text", text });

    const imgs = Array.from(el.querySelectorAll("img"));
    for (const img of imgs) {
      const src = img.currentSrc || img.src || "";
      if (!src || isLikelyTinyIcon(img, src)) { di.images.skipped_icons++; continue; }
      const key = img.dataset.c2mKey || null;
      if (mode === "harmonies") {
        content.push({ type:"image_token" });
      } else {
        if (key) {
          content.push({ type: role==="user" ? "input_image" : "image_url", image_url:{ url: `c2m-idb:${key}`, detail:"high" } });
          di.images.ref_count++;
        } else {
          di.images.err++;
        }
      }
    }
    messages.push({ role, content });
  }

  di.timings.total_extract_ms = Math.round(performance.now() - t0);
  return { metadata: meta, messages, __diagnostics: di };
}
