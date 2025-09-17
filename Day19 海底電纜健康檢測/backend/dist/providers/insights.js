const perPrefix = new Map();
const perOrigin = new Map();
const incidents = [];
const TTL = 60 * 60 * 1000;
const NOW = () => Date.now();
function pickPrefix(d) { if (d.prefix)
    return d.prefix; if (d.announcements && d.announcements[0]?.prefixes?.length)
    return d.announcements[0].prefixes[0]; if (d.withdrawals && d.withdrawals.length)
    return d.withdrawals[0]; return ''; }
function originFromPath(d) { const p = d.path || []; return p.length ? p[p.length - 1] : undefined; }
function actionOf(d) { return (d.withdrawals && d.withdrawals.length) ? 'WDR' : 'ANN'; }
function pushIncident(i) { const cutoff = NOW() - 2 * 60 * 1000; for (let k = incidents.length - 1; k >= 0 && k >= incidents.length - 40; k--) {
    const it = incidents[k];
    if (it.type === i.type && it.title === i.title && it.when >= cutoff)
        return;
} incidents.push(i); const ttlCut = NOW() - TTL; while (incidents.length && incidents[0].when < ttlCut)
    incidents.shift(); }
export function ingestRisMessage(data) {
    try {
        const ts = data.timestamp || Math.floor(NOW() / 1000);
        const pref = pickPrefix(data);
        if (!pref)
            return;
        const origin = originFromPath(data);
        const act = actionOf(data);
        const pathStr = (data.path || []).join(' ');
        const key = pref;
        const st = perPrefix.get(key) || { toggles: 0 };
        if (st.lastAction && st.lastAction !== act && st.lastTs && (ts - st.lastTs) <= 180) {
            st.toggles += 1;
            if (st.toggles >= 3) {
                const sev = Math.min(100, 40 + st.toggles * 10);
                const title = `疑似路由震盪：${pref}`;
                pushIncident({ id: `flap:${pref}:${ts}`, type: 'flap', when: NOW(), severity: sev, title, details: { prefix: pref, origin, toggles: st.toggles } });
                st.toggles = 0;
            }
        }
        if (act === 'ANN' && st.lastPath && st.lastTs && (ts - st.lastTs) <= 180) {
            if (st.lastPath !== pathStr) {
                const prevHops = st.lastPath.split(' ').filter(Boolean).length;
                const newHops = (data.path || []).length;
                const delta = Math.abs(newHops - prevHops);
                if (delta >= 2) {
                    const sev = Math.min(100, 30 + delta * 10);
                    const title = `疑似繞路：${pref}（hops ${prevHops}→${newHops}）`;
                    pushIncident({ id: `reroute:${pref}:${ts}`, type: 'reroute', when: NOW(), severity: sev, title, details: { prefix: pref, origin, prevHops, newHops, delta } });
                }
            }
        }
        st.lastAction = act;
        st.lastTs = ts;
        st.lastPath = pathStr;
        st.lastOrigin = origin;
        perPrefix.set(key, st);
        const okey = String(origin || 'NA');
        const o = perOrigin.get(okey) || { wdrCount: 0, prefixSet: new Set(), windowStart: ts };
        if (ts - o.windowStart > 120) {
            o.wdrCount = 0;
            o.prefixSet = new Set();
            o.windowStart = ts;
        }
        if (act === 'WDR') {
            o.wdrCount += 1;
            o.prefixSet.add(pref);
            if (o.wdrCount >= 10 && o.prefixSet.size >= 5) {
                const sev = Math.min(100, 50 + Math.min(50, (o.wdrCount - 10) * 5));
                const title = `疑似區域性失聯：起源 AS${origin} 多前綴撤告`;
                pushIncident({ id: `outage:${origin}:${ts}`, type: 'localized-outage', when: NOW(), severity: sev, title, details: { origin, wdrCount: o.wdrCount, prefixes: Array.from(o.prefixSet) } });
                o.wdrCount = 0;
                o.prefixSet.clear();
                o.windowStart = ts;
            }
        }
        perOrigin.set(okey, o);
    }
    catch { }
}
export function getRecentIncidents() { const ttlCut = NOW() - TTL; return incidents.filter(i => i.when >= ttlCut).slice(-50); }
