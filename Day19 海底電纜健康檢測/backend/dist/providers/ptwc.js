const FEED = 'https://www.tsunami.gov/events/xml/PHEBAtom.xml';
function extract(text, tag) { const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)</${tag}>`, 'gi'); const out = []; let m; while ((m = re.exec(text)))
    out.push(m[1].trim()); return out; }
export async function fetchPTWCBulletins(limit = 6) { const r = await fetch(FEED); if (!r.ok)
    throw new Error(`PTWC feed ${r.status}`); const xml = await r.text(); const entries = xml.split('<entry>').slice(1).map(s => '<entry>' + s); const items = entries.slice(0, limit).map((e) => { const title = extract(e, 'title')[0] || ''; const updated = extract(e, 'updated')[0] || ''; const summary = extract(e, 'summary')[0] || ''; const lm = /<link[^>]+href="([^"]+)"/i.exec(e); const link = lm ? lm[1] : ''; return { title, updated, summary, link }; }); return { items }; }
