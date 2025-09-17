
export async function extract({ page, meta, mode }) {
  const body = (document.body?.innerText || "").trim();
  const msg = body ? [{ role:"user", content:[{type:"text", text: body.slice(0, 4000)}] }] : [];
  return { metadata: meta, messages: msg, __diagnostics: { timings: { total_extract_ms: 1 } } };
}
