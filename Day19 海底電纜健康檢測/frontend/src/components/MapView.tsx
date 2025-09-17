
import React,{useEffect,useRef} from 'react'; import maplibregl from 'maplibre-gl';
const style:any={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'&copy; OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
export default function MapView(){ const ref=useRef<HTMLDivElement>(null); useEffect(()=>{ if(!ref.current)return; const map=new maplibregl.Map({container:ref.current,style,center:[121,23.7],zoom:5.5});
  map.on('load',()=>map.resize());
  fetch('/api/cables/geojson').then(r=>r.json()).then(data=>{ const cables=data.cables; const landings=data.landings;
    map.addSource('cables',{type:'geojson',data:cables} as any); map.addLayer({id:'cables-line',type:'line',source:'cables',paint:{'line-color':['get','color'],'line-width':2,'line-opacity':0.9}});
    map.addSource('landings',{type:'geojson',data:landings} as any); map.addLayer({id:'landings-circle',type:'circle',source:'landings',paint:{'circle-radius':4,'circle-color':'#36d6ff','circle-blur':0.1}});
  }).catch(console.error); return ()=>{ map.remove(); }; },[]); return <div ref={ref} className='map-container' style={{height:'520px',borderRadius:12,paddingBottom:8}}/>; }
