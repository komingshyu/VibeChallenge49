import { setTimeout as delay } from 'timers/promises';
const ASN_CACHE = new Map();
const RRC_CACHE = { nodes: [], ts: 0 };
const TTL_ASN = 24 * 3600 * 1000; // 24h
const TTL_RRC = 24 * 3600 * 1000; // 24h
async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`http ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json'))
        return r.json();
    const t = await r.text();
    try {
        return JSON.parse(t);
    }
    catch {
        throw new Error('not-json');
    }
}
export async function getAsnInfo(asn) {
    const now = Date.now();
    const cached = ASN_CACHE.get(asn);
    if (cached && (now - cached.ts) < TTL_ASN)
        return cached.info;
    const url = `https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`;
    try {
        const j = await fetchJson(url);
        const d = j?.data || {};
        const info = {
            asn,
            holder: d.holder || d.asn?.holder,
            country: d.country,
            rir: d.rir,
            name: d.asn?.name || d.holder
        };
        ASN_CACHE.set(asn, { info, ts: now });
        return info;
    }
    catch (e) {
        const info = { asn };
        ASN_CACHE.set(asn, { info, ts: now });
        return info;
    }
}
export async function getAsnInfoBulk(asns) {
    const uniq = Array.from(new Set(asns.filter(n => Number.isFinite(n))));
    const out = [];
    const missing = [];
    const now = Date.now();
    for (const a of uniq) {
        const c = ASN_CACHE.get(a);
        if (c && (now - c.ts) < TTL_ASN)
            out.push(c.info);
        else
            missing.push(a);
    }
    // polite burst: at most 5 concurrent
    const concurrency = 5;
    for (let i = 0; i < missing.length; i += concurrency) {
        const slice = missing.slice(i, i + concurrency);
        const results = await Promise.all(slice.map(a => getAsnInfo(a)));
        out.push(...results);
        await delay(50);
    }
    // ensure stable order as input order
    const byAsn = new Map(out.map(i => [i.asn, i]));
    return uniq.map(a => byAsn.get(a) || { asn: a });
}
export async function getRrcInfo() {
    const now = Date.now();
    if (RRC_CACHE.nodes.length && (now - RRC_CACHE.ts) < TTL_RRC)
        return RRC_CACHE.nodes;
    const url = 'https://stat.ripe.net/data/rrc-info/data.json';
    try {
        const j = await fetchJson(url);
        const list = (j?.data?.rrcs || []).map((r) => ({
            id: r.id || r.rrc || r.hostname || '',
            location: r.location || { city: r.city, country: r.country, lat: r.latitude, lon: r.longitude },
            ixp: r.ixp || r.ixp_name,
            description: r.description
        }));
        if (list?.length) {
            RRC_CACHE.nodes = list;
            RRC_CACHE.ts = now;
        }
        return RRC_CACHE.nodes;
    }
    catch {
        return RRC_CACHE.nodes;
    }
}
