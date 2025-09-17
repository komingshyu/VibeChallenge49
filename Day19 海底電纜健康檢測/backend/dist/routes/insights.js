import { Router } from 'express';
import { getRecentIncidents } from '../providers/insights.js';
import { getRisStatus } from '../providers/risLive.js';
import { CONFIG } from '../config.js';
import { checkRadarToken } from '../providers/radarOutage.js';
const r = Router();
r.get('/recent', (_q, s) => { try {
    s.json({ incidents: getRecentIncidents() });
}
catch (e) {
    s.status(500).json({ error: e?.message || 'insights error' });
} });
r.get('/status', async (_q, s) => { try {
    const ris = getRisStatus();
    const auth = await checkRadarToken();
    s.json({ sources: { risLive: { state: ris.upstreamState, asnSubscribed: ris.asnCount }, radar: { hasToken: !!CONFIG.CLOUDFLARE_API_TOKEN, authorized: !!auth.ok, lastChecked: new Date(auth.ts).toISOString(), status: auth.status || 0, error: auth.message } } });
}
catch (e) {
    s.status(500).json({ error: e?.message || 'status error' });
} });
export default r;
