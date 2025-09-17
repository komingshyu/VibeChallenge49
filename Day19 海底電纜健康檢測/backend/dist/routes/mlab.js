import { Router } from 'express';
import { queryMlabSummary } from '../providers/mlab.js';
const r = Router();
r.get('/ndt/summary', async (q, s) => { try {
    const days = parseInt(q.query.days || '7', 10);
    const country = q.query.country || 'TW';
    const rows = await queryMlabSummary({ country, days });
    s.json({ rows });
}
catch (e) {
    s.status(501).json({ error: e.message || 'mlab not enabled' });
} });
export default r;
