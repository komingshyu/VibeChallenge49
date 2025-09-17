import React from 'react';
import { getAsnLabel, getRrcCity } from './asnDirectory';

type RisMessage = { type:string; data:{ timestamp:number; peer:string; peer_asn:string; host?:string; type?:string; path?:number[]; prefix?:string; announcements?:{prefixes?:string[]}[]; withdrawals?:string[]; } };

function timeAgo(tsSec:number){
  const d=(Date.now()-tsSec*1000)/1000;
  if(d<60)return `${Math.floor(d)} 秒前`;
  if(d<3600)return `${Math.floor(d/60)} 分鐘前`;
  return `${Math.floor(d/3600)} 小時前`;
}

function summarize(m:RisMessage['data']){
  const isWdr=!!(m.withdrawals&&m.withdrawals.length);
  const prefix=m.prefix||(m.announcements&&m.announcements[0]&&(m.announcements[0].prefixes?.[0]||''))||(m.withdrawals&&m.withdrawals[0])||'';
  const path=m.path||[];
  const origin=path.length?path[path.length-1]:undefined;
  const hops=path.length||undefined;
  return {isWdr,prefix,origin,hops,host:m.host,peer_asn:m.peer_asn};
}

export default function BgpRow({ msg }: { msg: RisMessage }){
  const s = summarize(msg.data);
  const when = timeAgo(msg.data.timestamp);
  const pathText = (msg.data.path||[]).join(' ');
  const [originLabel,setOriginLabel]=React.useState<string>('');
  const [peerLabel,setPeerLabel]=React.useState<string>('');
  const [city,setCity]=React.useState<string>('');

  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      try{ const name = await getAsnLabel(s.origin as any); if(alive) setOriginLabel(name||''); }catch{}
      try{ const name = await getAsnLabel(Number(s.peer_asn)); if(alive) setPeerLabel(name||''); }catch{}
      try{ const loc = await getRrcCity(String(s.host||'')); if(alive) setCity(loc||''); }catch{}
    })();
    return ()=>{ alive=false; };
  },[s.origin, s.peer_asn, s.host]);

  return (
    <div title={pathText?`AS Path: ${pathText}`:'No path'} style={{display:'grid',gridTemplateColumns:'88px 60px 1fr',gap:8,padding:'6px 0',borderBottom:'1px dashed rgba(255,255,255,0.06)'}}>
      <span style={{color:'#36d6ff'}}>{when}</span>
      <span>{s.isWdr?'WDR':'ANN'}</span>
      <span>
        {s.prefix||''} → 來源AS{ s.origin ?? '?' }{originLabel?`（${originLabel}）`:''}（hops { s.hops ?? '?' }）
        ，對等AS{String(s.peer_asn)}{peerLabel?`（${peerLabel}）`:''}
        {city?`，觀測點：${city}`: (s.host?`，觀測點：${String(s.host)}`:'')}
      </span>
    </div>
  );
}