
import React,{useEffect,useState} from 'react';
export default function EarthquakePanel(){ const [items,setItems]=useState<any[]>([]); const [tsu,setTsu]=useState<any[]>([]);
  useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/events/earthquakes'); const j=await r.json(); const feats=j.features||[]; setItems(feats.slice(0,10)); }catch{ setItems([]);} try{ const r2=await fetch('/api/events/tsunami'); const j2=await r2.json(); setTsu(j2.items||[]);}catch{ setTsu([]);} })(); },[]);
  return (<div>
    <div style={{fontWeight:700,marginBottom:8}}>近 7 天地震（台灣範圍）</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
      {items.map((f,i)=> (<div key={i} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:8}}>
        <div style={{fontSize:14}}>M{f.properties?.mag ?? '?'} {f.properties?.place ?? ''}</div>
        <div className="muted">{new Date(f.properties?.time).toLocaleString()}</div></div>))}
    </div>
    <div style={{fontWeight:700,marginBottom:8}}>PTWC 海嘯公告（最新）</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6}}>
      {tsu.map((e,i)=> (<a key={i} href={e.link} target="_blank" rel="noreferrer" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:8}}>
        <div style={{fontSize:13}}>{e.title}</div>
        <div className="muted">{e.updated}</div></a>))}
    </div>
  </div>); }
