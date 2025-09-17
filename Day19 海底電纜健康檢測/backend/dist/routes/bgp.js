import { Router } from 'express';
import { manualRefreshASNs } from '../providers/risLive.js';
import { getAsnInfo, getAsnInfoBulk, getRrcInfo } from '../providers/ripeMeta.js';
const router = Router();
// RIPEstat Country ASNs proxy
router.get('/country-asns', async (req, res) => { try {
    const country = req.query.country || 'TW';
    const url = `https://stat.ripe.net/data/country-asns/data.json?resource=${country}&lod=1`;
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`ripestat http ${r.status}`);
    res.json(await r.json());
}
catch (e) {
    res.status(500).json({ error: e.message || 'ripestat error' });
} });
// 手動刷新 RIS 訂閱 ASN 清單
router.post('/refresh-asns', async (req, res) => { try {
    const country = req.query.country || 'TW';
    await manualRefreshASNs(country);
    res.json({ ok: true });
}
catch (e) {
    res.status(500).json({ error: e.message || 'refresh error' });
} });
// ASN 基本資料（運營商名稱、國別）
router.get('/asn-info', async (req, res) => {
    try {
        const asn = Number(req.query.asn || '');
        if (!Number.isFinite(asn))
            return res.status(400).json({ error: 'invalid asn' });
        const info = await getAsnInfo(asn);
        res.json(info);
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'asn-info error' });
    }
});
// 批次 ASN
router.get('/asn-info/bulk', async (req, res) => {
    try {
        const list = String(req.query.asn || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
        const infos = await getAsnInfoBulk(list);
        res.json({ items: infos });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'asn-info bulk error' });
    }
});
// RRC 位置（城市/國家）
router.get('/rrc-info', async (_req, res) => {
    try {
        const nodes = await getRrcInfo();
        res.json({ items: nodes });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'rrc-info error' });
    }
});
export default router;
