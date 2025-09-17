
import React, { useEffect, useState } from 'react';
type Incident={ id:string; type:'flap'|'reroute'|'localized-outage'; when:number; severity:number; title:string; details?:any; };
const typeMeta={ flap:{label:'疑似路由震盪',desc:'同一網段頻繁上下線，可能影響連線穩定度。'}, reroute:{label:'疑似繞路',desc:'路由路徑明顯變動，可能造成延遲上升。'}, 'localized-outage':{label:'疑似區域性失聯',desc:'多個網段同時撤告，可能為區域性障礙。'} } as const;
function sevBadge(n:number){ const level=n>=80?'high':n>=60?'med':'low'; const color=level==='high'?'#ff6b6b':level==='med'?'#f2b01e':'#36d6ff'; const label=level==='high'?'警戒':level==='med'?'注意':'觀察'; return <span style={{border:`1px solid ${color}`,color,padding:'2px 8px',borderRadius:999,fontSize:12}}>{label}</span>; }
export default function IncidentSummary(){
  const [incidents,setIncidents]=useState<Incident[]>([]); const [status,setStatus]=useState<any>(null);
  useEffect(()=>{ let t:any; const pull=()=>{ (async()=>{ try{ const r1=await fetch('/api/insights/recent'); const j1=await r1.json(); setIncidents(j1.incidents||[]);}catch{} try{ const r2=await fetch('/api/insights/status'); const j2=await r2.json(); setStatus(j2);}catch{} t=setTimeout(pull,5000); })(); }; pull(); return()=>{ if(t) clearTimeout(t); }; },[]);
  const groups:{[k:string]:Incident[]}={flap:[],reroute:[],'localized-outage':[]}; for(const it of incidents) groups[it.type]?.push(it);
  return (<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
      <div style={{fontWeight:700}}>重大異常摘要</div>
      <div className="muted" style={{display:'flex',gap:12}}>
        <span>RIS Live：{status?.sources?.risLive?.state||'未知'}</span>
        <span title={status?.sources?.radar?.error||''}>Radar：{status?.sources?.radar?.authorized?'已授權':(status?.sources?.radar?.hasToken?'Token 無效／權限不足':'未設 Token')}</span>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
      {(['flap','reroute','localized-outage'] as const).map((k)=>{ const list=groups[k]||[]; return (
        <div key={k} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:12,minHeight:120}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:600}}>{typeMeta[k].label}</div>
            <div>{list.length?sevBadge(Math.max(...list.map(x=>x.severity))):<span className="muted">—</span>}</div>
          </div>
          <div className="muted" style={{margin:'6px 0 8px'}}>{typeMeta[k].desc}</div>
          <div style={{display:'grid',gap:6}}>
            {list.slice(-5).reverse().map(it=>(
              <div key={it.id} style={{fontSize:12,background:'rgba(0,0,0,0.15)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'6px 8px'}}>
                <div>{it.title}</div>
              </div>
            ))}
            {!list.length && <div className="muted">目前無明顯事件</div>}
          </div>
        </div>
      );})}
    </div>
  </div>); }
