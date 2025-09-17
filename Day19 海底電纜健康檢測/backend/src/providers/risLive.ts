
import WebSocket,{ WebSocketServer } from 'ws'; import type { Server } from 'http';
import { ingestRisMessage } from './insights.js';
const FALLBACK_TW_ASNS=[3462,17421,9924,24158,9674,17709];
let upstreamWS:WebSocket|null=null; const localClients=new Set<WebSocket>(); let currentASNs:number[]=[...FALLBACK_TW_ASNS]; let lastRefresh=0;
export function attachRipeRisLive(server:Server){ const wss=new WebSocketServer({server,path:'/ws/ris-live'}); wss.on('connection',(ws)=>{localClients.add(ws); ws.on('close',()=>localClients.delete(ws)); ensureUpstream();}); setInterval(ensureUpstream,30000); setInterval(()=>refreshASNList('TW').catch(()=>{}),6*3600*1000); refreshASNList('TW').catch(()=>{}); }
async function fetchCountryASNs(country:string):Promise<number[]>{ try{ const url=`https://stat.ripe.net/data/country-asns/data.json?resource=${country}&lod=1`; const res=await fetch(url); if(!res.ok) throw new Error(`RIPEstat ${res.status}`); const j:any=await res.json(); let asns:number[]=[]; if(j?.data?.countries&&Array.isArray(j.data.countries)&&j.data.countries.length){ const first=j.data.countries[0]; if(Array.isArray(first?.asns)) asns=first.asns.map((a:any)=>Number(a.asn||a)); } else if(Array.isArray(j?.data?.asns)){ asns=j.data.asns.map((a:any)=>Number(a.asn||a)); } asns=asns.filter((n)=>Number.isFinite(n)); if(asns.length) return asns; }catch{} return [...FALLBACK_TW_ASNS]; }
async function refreshASNList(country='TW'){ const now=Date.now(); if(now-lastRefresh<6*3600*1000) return; currentASNs=await fetchCountryASNs(country); lastRefresh=now; if(upstreamWS&&upstreamWS.readyState===WebSocket.OPEN){ try{ upstreamWS.close(); }catch{} } }
function ensureUpstream(){ if(upstreamWS&&upstreamWS.readyState===WebSocket.OPEN) return; try{upstreamWS?.close();}catch{} const ws=new WebSocket('wss://ris-live.ripe.net/v1/ws/?client=tw-subsea-monitor'); upstreamWS=ws;
  ws.on('open',()=>{ for(const asn of currentASNs){ const msg={type:'ris_subscribe',data:{type:'UPDATE',path:`${asn}$`}}; ws.send(JSON.stringify(msg)); }});
  ws.on('message',(data)=>{ try{ const obj=JSON.parse(data.toString()); if(obj?.type==='ris_message') ingestRisMessage(obj.data); }catch{} for(const c of localClients) if(c.readyState===WebSocket.OPEN) c.send(data.toString()); });
  ws.on('close',()=>{}); ws.on('error',()=>{}); }
export async function manualRefreshASNs(country='TW'){ await refreshASNList(country); }
export function getRisStatus(){ return { upstreamState: upstreamWS && upstreamWS.readyState===WebSocket.OPEN ? 'open':'disconnected', asnCount: currentASNs.length }; }
