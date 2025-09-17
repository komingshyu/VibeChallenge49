import React,{useEffect,useRef,useState} from 'react';
import BgpRow from './BgpRow';

type RisData = { timestamp:number; peer:string; peer_asn:string; host?:string; type?:string; path?:number[]; prefix?:string; announcements?:{prefixes?:string[]}[]; withdrawals?:string[]; next_hop?:string; communities?:number[][]; };
type RisMessage={ type:string; data:RisData; _uid?:string };

function signature(d: RisData): string{
  const prefix = d.prefix || (d.announcements?.[0]?.prefixes?.[0]) || (d.withdrawals?.[0]) || '';
  const pathTail = (d.path||[]).slice(-3).join('-');
  return `${Number(d.timestamp).toFixed(2)}|${d.peer}|${d.peer_asn}|${d.host||''}|${prefix}|${pathTail}`;
}

export default function BgpTicker(){
  const [items,setItems]=useState<RisMessage[]>([]);
  const wsRef=useRef<WebSocket|null>(null);
  const uidRef=useRef(0);

  useEffect(()=>{ 
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/ris-live`);
    wsRef.current=ws;
    ws.onmessage=(ev)=>{ 
      try{ 
        const msg:RisMessage=JSON.parse(ev.data); 
        if(msg.type==='ris_message'){ 
          const sig = signature(msg.data);
          msg._uid = `${Date.now()}-${++uidRef.current}-${sig}`;
          setItems(prev=>[msg,...prev].slice(0,50)); 
        } 
      }catch{} 
    };
    return ()=>{ ws.close(); };
  },[]);

  return (
    <div>
      <div className="muted" style={{marginBottom:6}}>
        說明：<b>ANN</b>=宣告、<b>WDR</b>=撤告；顯示 Prefix、來源營運商、AS Path 長度、對等端與觀測點城市。
      </div>
      <div style={{maxHeight:220,overflowY:'auto',fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',fontSize:12}}>
        {items.map((m)=> (
          <BgpRow key={m._uid || signature(m.data)} msg={m} />
        ))}
      </div>
    </div>
  ); 
}