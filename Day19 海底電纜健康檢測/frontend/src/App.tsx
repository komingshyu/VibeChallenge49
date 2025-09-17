
import React from 'react'
import MapView from './components/MapView'
import HeroStats from './components/HeroStats'
import BgpTicker from './components/BgpTicker'
import RadarAnomalies from './components/RadarAnomalies'
import EarthquakePanel from './components/EarthquakePanel'
import IncidentSummary from './components/IncidentSummary'
export default function App(){
  return (<>
    <div className="hud"><div className="hud-inner">
      <div className="brand">TW Subsea Monitor</div>
      <span className="chip">RIS Live</span>
      <span className="chip">Cloudflare Radar</span>
      <span className="chip">PTWC</span>
    </div></div>
    <div className="grid">
      <div className="panel"><MapView/></div>
      <div className="panel"><HeroStats/><div className="divider"/><BgpTicker/><div className="divider"/><RadarAnomalies/></div>
      <div className="panel"><EarthquakePanel/></div>
      <div className="panel"><IncidentSummary/></div>
    </div>
  </>);
}
