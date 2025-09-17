import { CONFIG } from '../config.js';
const CABLE_GEO = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LANDING_GEO = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
let cache = { cables: null, landings: null, ts: null };
function inBbox(coord) { const [lon, lat] = coord; const b = CONFIG.TAIWAN_BBOX; return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat; }
function featureTouchesBbox(f) { try {
    const g = f.geometry;
    if (!g)
        return false;
    if (g.type === 'MultiLineString' || g.type === 'LineString') {
        const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        for (const line of lines) {
            for (const pt of line) {
                if (inBbox(pt))
                    return true;
            }
        }
    }
    else if (g.type === 'Point') {
        return inBbox(g.coordinates);
    }
}
catch { } return false; }
export async function fetchCableGeo() {
    if (cache.cables && cache.landings && cache.ts && Date.now() - cache.ts < 1000 * 60 * 60) {
        return { cables: cache.cables, landings: cache.landings };
    }
    const [cr, lr] = await Promise.all([fetch(CABLE_GEO), fetch(LANDING_GEO)]);
    if (!cr.ok)
        throw new Error(`Cable geo fetch failed: ${cr.status}`);
    if (!lr.ok)
        throw new Error(`Landing geo fetch failed: ${lr.status}`);
    const cables = await cr.json();
    const landings = await lr.json();
    const fc = { ...cables, features: cables.features.filter((f) => featureTouchesBbox(f)) };
    const fl = { ...landings, features: landings.features.filter((f) => featureTouchesBbox(f)) };
    cache = { cables: fc, landings: fl, ts: Date.now() };
    return { cables: fc, landings: fl };
}
