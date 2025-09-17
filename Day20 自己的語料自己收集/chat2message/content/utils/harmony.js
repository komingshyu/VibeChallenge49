
export function buildHarmonyText(messages = [], meta = {}) {
  const lines = [];
  const hasSystem = messages.some(m => m.role === "system");
  if (!hasSystem && meta?.platform) {
    lines.push(`<|start|>system<|message|>Captured from ${meta.platform} at ${meta.capturedAt || ""}.<|end|>`);
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] || {};
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      for (const tc of m.tool_calls) {
        const payload = {
          recipient: tc.function?.name || "tool",
          arguments: safeParse(tc.function?.arguments) ?? tc.function?.arguments ?? {}
        };
        lines.push(`<|start|>assistant<|channel|>commentary<|message|>${JSON.stringify(payload)}<|end|>`);
      }
      let j = i + 1;
      while (j < messages.length && messages[j]?.role === "tool") {
        const t = messages[j];
        const body = (typeof t.content === "string") ? t.content : JSON.stringify(t.content);
        lines.push(`<|start|>${(t.name || "tool")}<|message|>${escapeAngle(body)}<|end|>`);
        j++;
      }
      const finalText = textPlusImages(m.content);
      if (finalText) lines.push(`<|start|>assistant<|channel|>final<|message|>${escapeAngle(finalText)}<|end|>`);
      i = j - 1;
      continue;
    }
    const body = textPlusImages(m.content);
    const role = mapRole(m.role);
    if (!role) continue;
    lines.push(`<|start|>${role}${role==="assistant" ? "<|channel|>final" : ""}<|message|>${escapeAngle(body)}<|end|>`);
  }
  return lines.join("\n");
}
function mapRole(role) {
  if (role === "system" || role === "user" || role === "assistant") return role;
  if (role === "developer") return "system";
  if (role === "tool") return "tool";
  return null;
}
function textPlusImages(content) {
  if (typeof content === "string") return content;
  const parts = Array.isArray(content) ? content : [];
  const imgs = parts.filter(p => p.type === "image_url" || p.type === "input_image" || p.type === "image_token" || (p.image_url && typeof p.image_url.url === "string" && p.image_url.url.startsWith("c2m-idb:")));
  const texts = parts.filter(p => p.type === "text").map(p => p.text || "");
  const tokens = imgs.map(() => "<|image|>");
  const body = [...tokens, ...texts].join("\n");
  return body;
}
function escapeAngle(s) { return String(s ?? "").replace(/<\|/g, "< |"); }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
