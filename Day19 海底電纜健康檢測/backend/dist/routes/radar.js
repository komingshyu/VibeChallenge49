import { Router } from 'express';
import { fetchRadarOutages, normalizeAnnotations } from '../providers/radarOutage.js';
const r = Router();
// 原始 Outages 轉發（保留 Cloudflare 原結構）
r.get('/outages', async (q, s) => {
    try {
        const { location = 'TW', asn = '', dateRange = '30d' } = q.query;
        s.json(await fetchRadarOutages({ location, asn, dateRange, limit: 100, offset: 0 }));
    }
    catch (e) {
        s.status(500).json({ error: e.message || 'radar error' });
    }
});
// 統計摘要：每日事件數與總數（前端更好消化）
r.get('/outages/summary', async (q, s) => {
    try {
        const { location = 'TW', asn = '', dateRange = '90d' } = q.query;
        const raw = await fetchRadarOutages({ location, asn, dateRange, limit: 500, offset: 0 });
        const anns = normalizeAnnotations(raw);
        const byDay = new Map();
        for (const a of anns) {
            const d = String(a.startDate || a.date || a.start_time || '').slice(0, 10);
            if (!d)
                continue;
            byDay.set(d, (byDay.get(d) || 0) + 1);
        }
        const days = Array.from(byDay.keys()).sort();
        const series = days.map(d => ({ date: d, count: byDay.get(d) || 0 }));
        s.json({ ok: true, count: anns.length, series });
    }
    catch (e) {
        s.status(500).json({ ok: false, error: e?.message || 'summary error' });
    }
});
export default r;
