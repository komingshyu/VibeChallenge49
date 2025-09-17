import React,{useEffect,useRef} from 'react'; import * as echarts from 'echarts';

function lastNDays(n:number){ const a:string[]=[]; const now=new Date(); for(let i=n-1;i>=0;i--){ const d=new Date(now.getTime()-i*24*3600*1000); a.push(d.toISOString().slice(0,10)); } return a; }

export default function RadarAnomalies(){ const ref=useRef<HTMLDivElement>(null); useEffect(()=>{ if(!ref.current) return; const chart=echarts.init(ref.current); let disposed=false;
  fetch('/api/radar/outages/summary?location=TW&dateRange=90d').then(r=>r.json()).then(j=>{ if(disposed) return;
    const count = Number(j?.count||0);
    const seriesArr = Array.isArray(j?.series)? j.series : [];
    let days = seriesArr.map((x:any)=>x.date);
    let series = seriesArr.map((x:any)=>x.count);
    if(!days.length){
      // 顯示近 30 天空序列，避免空白一片
      days = lastNDays(30);
      series = new Array(days.length).fill(0);
    }
    chart.setOption({ 
      title:{ text: count>0 ? 'Cloudflare Radar Outage（台灣）' : '近 90 天未偵測到台灣斷網事件', textStyle:{ color:'#e6f1ff', fontSize:12 } }, 
      tooltip:{ trigger:'axis' },
      xAxis:{ type:'category', data:days, axisLabel:{ color:'#92a0b3' } }, 
      yAxis:{ type:'value', axisLabel:{ color:'#92a0b3' }, min:0, max: Math.max(5, Math.max(...series,0)) },
      series:[{ type:'line', data:series, smooth:true, areaStyle:{} }], 
      grid:{ left:40, right:10, top:28, bottom:20 }, backgroundColor:'transparent' 
    });
  }).catch(()=>{ if(disposed) return; chart.setOption({ title:{ text:'Radar API 未授權或無資料（請設定 Token）', textStyle:{ color:'#e6f1ff' } } }); });
  const onResize=()=>{ if(!disposed) chart.resize(); }; window.addEventListener('resize',onResize); return ()=>{ disposed=true; window.removeEventListener('resize',onResize); chart.dispose(); }; },[]); return <div ref={ref} style={{height:200}}/>; }