
import React,{useEffect,useState} from 'react';
export default function HeroStats(){ const [radarCount,setRadarCount]=useState<number|undefined>();
  useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/radar/outages?location=TW&dateRange=30d'); const j=await r.json(); setRadarCount(j?.result?.annotations?.length??0); }catch{ setRadarCount(undefined);} })(); },[]);
  return (<div className="kpi">
    <div className="tile"><div className="muted">最近 30 天 Radar Outages</div><div style={{fontSize:24,fontWeight:700}}>{radarCount??'—'}</div><div className="muted">事件數（台灣）</div></div>
    <div className="tile"><div className="muted">BGP 即時事件</div><div style={{fontSize:24,fontWeight:700}} id="bgp-live-count">Live</div><div className="muted">RIS Live 更新</div></div>
    <div className="tile"><div className="muted">重點異常</div><div style={{fontSize:24,fontWeight:700}}>{/* reserved */}</div><div className="muted">分析引擎運作中</div></div>
  </div>);
}
