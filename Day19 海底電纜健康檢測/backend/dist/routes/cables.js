import { Router } from 'express';
import { fetchCableGeo } from '../providers/submarineCables.js';
const r = Router();
r.get('/geojson', async (_q, s) => { try {
    s.json(await fetchCableGeo());
}
catch (e) {
    s.status(500).json({ error: e.message || 'cable fetch error' });
} });
export default r;
