import { CONFIG } from '../config.js';
export async function fetchRecentEarthquakes() {
    const b = CONFIG.TAIWAN_BBOX;
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const url = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('minlatitude', String(b.minLat));
    url.searchParams.set('maxlatitude', String(b.maxLat));
    url.searchParams.set('minlongitude', String(b.minLon));
    url.searchParams.set('maxlongitude', String(b.maxLon));
    url.searchParams.set('starttime', start.toISOString());
    url.searchParams.set('endtime', end.toISOString());
    const res = await fetch(url.toString());
    if (!res.ok)
        throw new Error(`USGS fetch failed: ${res.status}`);
    return res.json();
}
