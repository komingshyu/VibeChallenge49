import { CONFIG } from '../config.js';
const RADAR_OUTAGES = 'https://api.cloudflare.com/client/v4/radar/annotations/outages';
export function buildRadarHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.CLOUDFLARE_API_TOKEN)
        headers['Authorization'] = `Bearer ${CONFIG.CLOUDFLARE_API_TOKEN}`;
    return headers;
}
export async function fetchRadarOutages(opts) {
    const url = new URL(RADAR_OUTAGES);
    if (opts.location)
        url.searchParams.set('location', opts.location);
    if (opts.asn)
        url.searchParams.set('asn', opts.asn);
    if (opts.dateRange)
        url.searchParams.set('dateRange', opts.dateRange);
    if (opts.dateStart)
        url.searchParams.set('dateStart', opts.dateStart);
    if (opts.dateEnd)
        url.searchParams.set('dateEnd', opts.dateEnd);
    url.searchParams.set('limit', String(opts.limit ?? 100));
    url.searchParams.set('offset', String(opts.offset ?? 0));
    const res = await fetch(url.toString(), { headers: buildRadarHeaders() });
    if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`Radar API error: ${res.status}${bodyText ? ` ${bodyText.slice(0, 200)}` : ''}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : JSON.parse(await res.text());
}
// Cached token validation (10 min)
let _authCache = null;
export async function checkRadarToken() {
    const now = Date.now();
    if (_authCache && (now - _authCache.ts) < 10 * 60 * 1000)
        return _authCache;
    if (!CONFIG.CLOUDFLARE_API_TOKEN) {
        _authCache = { ok: false, ts: now, status: 0, message: 'No token configured' };
        return _authCache;
    }
    try {
        const u = new URL(RADAR_OUTAGES);
        u.searchParams.set('location', 'TW');
        u.searchParams.set('dateRange', '1d');
        u.searchParams.set('limit', '1');
        const r = await fetch(u.toString(), { headers: buildRadarHeaders() });
        const ok = r.ok;
        let msg = undefined;
        if (!ok) {
            try {
                const j = await r.json();
                msg = JSON.stringify(j);
            }
            catch {
                msg = await r.text().catch(() => undefined);
            }
        }
        _authCache = { ok, ts: now, status: r.status, message: msg };
        return _authCache;
    }
    catch (e) {
        _authCache = { ok: false, ts: now, status: -1, message: e?.message || 'fetch error' };
        return _authCache;
    }
}
// Normalize possible shapes to a plain array of annotations
export function normalizeAnnotations(obj) {
    try {
        if (!obj)
            return [];
        const arr = obj?.result?.annotations ?? obj?.result?.data ?? obj?.annotations ?? obj?.data ?? [];
        if (Array.isArray(arr))
            return arr;
        if (Array.isArray(obj?.result?.annotations?.data))
            return obj.result.annotations.data;
        return [];
    }
    catch {
        return [];
    }
}
