
const cache = new Map<number, { name?: string; country?: string; holder?: string }>();
let rrcMap: Record<string, { city?: string; country?: string }> | null = null;

export async function getAsnLabel(asn?: number): Promise<string>{
  if(!asn || !Number.isFinite(asn)) return '';
  const c = cache.get(asn);
  if (c) return (c.name || c.holder || '') as string;
  const r = await fetch(`/api/bgp/asn-info?asn=${asn}`);
  if(!r.ok) return '';
  const j = await r.json();
  cache.set(asn, { name: j?.name, holder: j?.holder, country: j?.country });
  return (j?.name || j?.holder || '') as string;
}

export async function getAsnCountry(asn?: number): Promise<string>{
  if(!asn || !Number.isFinite(asn)) return '';
  const c = cache.get(asn);
  if (c?.country) return c.country;
  const r = await fetch(`/api/bgp/asn-info?asn=${asn}`);
  if(!r.ok) return '';
  const j = await r.json();
  cache.set(asn, { name: j?.name, holder: j?.holder, country: j?.country });
  return (j?.country || '') as string;
}

export async function getRrcCity(host?: string): Promise<string>{
  if(!host) return '';
  if (!rrcMap){
    try{
      const r = await fetch('/api/bgp/rrc-info');
      const j = await r.json();
      rrcMap = {};
      for(const n of (j?.items||[])){
        const id = String(n.id||'').toLowerCase();
        rrcMap[id] = { city: n.location?.city, country: n.location?.country };
      }
    }catch{ rrcMap = {}; }
  }
  const id = String(host).toLowerCase();
  const rec = (rrcMap as any)[id];
  if(!rec) return '';
  const parts = [rec.city, rec.country].filter(Boolean);
  return parts.join('、');
}
