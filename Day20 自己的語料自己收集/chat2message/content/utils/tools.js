
export const TOOL_REGISTRY = {
  "image_gen.text2im": { desc:"Text-to-image", args:["prompt","size?","model?"] },
  "vision.describe": { desc:"Vision analysis on uploaded images", args:["images","prompt?"] },
  "browser.open": { desc:"Open external links", args:["urls"] },
  "python.execute": { desc:"Run Python cells", args:["cells"] },
  "files.upload": { desc:"User uploaded a file", args:["name","mime?","size?"] }
};
export async function inferToolsForMessage(ctx, el, role) {
  const calls = [];
  if (role === "user") {
    const imgs = el.querySelectorAll("img");
    if (imgs.length) calls.push({ name:"vision.describe", arguments:{ images: imgs.length } });
    const atts = el.querySelectorAll('a[download], [data-testid*="attachment"], [aria-label*="download" i]');
    for (const a of atts) {
      const name = a.getAttribute("download") || (a.textContent||"").trim() || "file";
      calls.push({ name:"files.upload", arguments:{ name } });
    }
  } else if (role === "assistant") {
    const imgs = Array.from(el.querySelectorAll("img"));
    if (imgs.some(im => /oaidalle|dalle|gpt-image|images\.openai|blob\.core|generated/i.test(im.src))) {
      calls.push({ name:"image_gen.text2im", arguments:{ count: imgs.length } });
    }
    const anchors = Array.from(el.querySelectorAll("a[href^='http']"));
    const external = anchors.filter(a => !/openai\.com|chatgpt\.com|chat\.openai\.com/.test(a.href));
    if (external.length >= 2) calls.push({ name:"browser.open", arguments:{ urls: external.slice(0,8).map(a=>a.href) } });
    const codeBlocks = el.querySelectorAll('pre code[class*="language-python"], pre code');
    if (codeBlocks.length) calls.push({ name:"python.execute", arguments:{ cells: codeBlocks.length } });
  }
  return calls;
}
export function toolCallsToMessages(inferredCalls) {
  if (!inferredCalls?.length) return [];
  const id = "tc_" + Math.random().toString(36).slice(2,9);
  const assistant = {
    role: "assistant",
    content: "",
    tool_calls: inferredCalls.map((c,i)=> ({
      id: `${id}_${i+1}`,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.arguments||{}) }
    }))
  };
  const tools = inferredCalls.map((c,i)=> ({
    role: "tool",
    tool_call_id: `${id}_${i+1}`,
    content: JSON.stringify({ ok:true }),
    name: c.name
  }));
  return [assistant, ...tools];
}
