
import { isLikelyTinyIcon } from "../utils/image_utils.js";

export async function extract({ page, meta, mode }) {
  const di = { images:{ref_count:0, err:0, skipped_icons:0}, timings:{} };
  const t0 = performance.now();

  const main = document.querySelector("main") || document.body;
  const bubbles = Array.from(main.querySelectorAll('article, [role="listitem"]')).slice(-60);

  const messages = [];
  let role = "user";
  for (const el of bubbles) {
    role = role === "user" ? "assistant" : "user";
    const text = (el.innerText || "").trim();
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
