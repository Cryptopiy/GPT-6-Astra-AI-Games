import { useEffect, useRef, useState } from 'react';
import { FloodSimulation, type FloodStats } from './simulation';
import { FloodScene } from './Scene';
import { FIXED_DT } from './terrain';
import { registerSimulationTools, type ModelActions, type ModelContext } from './webmcp';
import './styles.css';

const initial: FloodStats={time:0,floodedPercent:0,peakFloodedPercent:0,maxDepth:0,floodedBuildings:0,displacedVehicles:0,waveLevel:0,phase:'ready'};
const phaseNames={ready:'Ready to simulate',incoming:'Wave approaching',inundation:'Inland inundation',receding:'Water receding',complete:'Simulation complete'};
function Glyph({type}:{type:'wave'|'play'|'reset'|'pause'|'orbit'|'home'|'info'}){
  const paths={wave:'M2 15c4 0 4-8 9-8 4 0 5 4 4 6 3-1 5 0 7 2M2 20c4-3 6 3 10 0s6 3 10 0',play:'m8 5 11 7-11 7Z',reset:'M4 10a8 8 0 1 1 1 8M4 4v6h6',pause:'M8 5v14M16 5v14',orbit:'M20 5c-3-3-15 5-17 10s9 4 15-1 5-10 2-9M12 8v8M8 12h8',home:'m3 11 9-8 9 8M6 10v11h12V10M10 21v-7h4v7',info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'};
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]}/></svg>;
}
export function TsunamiApp(){
  const host=useRef<HTMLDivElement>(null);const sim=useRef<FloodSimulation|null>(null);const scene=useRef<FloodScene|null>(null);
  const [height,setHeight]=useState(10),[speed,setSpeed]=useState(1),[paused,setPaused]=useState(false),[stats,setStats]=useState(initial),[elevation,setElevation]=useState(false),[help,setHelp]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const settings=useRef({speed,paused});settings.current={speed,paused};
  const [history,setHistory]=useState<{time:number;area:number}[]>([{time:0,area:0}]);
  const sampleTime=useRef(0);
  const toolActions=useRef<ModelActions|null>(null);
  useEffect(()=>registerSimulationTools((document as Document & {modelContext?:ModelContext}).modelContext,{
    start:h=>toolActions.current!.start(h),reset:()=>toolActions.current!.reset(),read:()=>toolActions.current!.read()
  }),[]);
  useEffect(()=>{
    if(!help)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setHelp(false);}
      if(event.key==='Tab'){
        const buttons=document.querySelectorAll<HTMLButtonElement>('.surge-modal button');
        if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[buttons.length-1]?.focus();}
        else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0]?.focus();}
      }
    };document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
  },[help]);
  useEffect(()=>{
    document.title='SURGE — Tsunami Laboratory';
    const simulation=new FloodSimulation();sim.current=simulation;
    let view:FloodScene;
    try{view=new FloodScene(host.current!,simulation);scene.current=view;setReady(true);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
    const observer=new ResizeObserver(()=>view.resize());observer.observe(host.current!);
    let raf=0,previous=performance.now(),accumulator=0,lastUI=0,alive=true,perfStart=previous,frames=0;
    const tick=(now:number)=>{
      if(!alive)return;
      const dt=Math.min(.1,(now-previous)/1000);previous=now;
      if(!document.hidden&&!settings.current.paused&&simulation.running){
        accumulator=Math.min(accumulator+dt*settings.current.speed,.4);
        while(accumulator>=FIXED_DT){simulation.step();accumulator-=FIXED_DT;}
      }else accumulator=0;
      if(!document.hidden){view.update(simulation.time);frames++;}
      if(import.meta.env.DEV&&now-perfStart>=1000){
        host.current!.dataset.performance=JSON.stringify({fps:Math.round(frames*1000/(now-perfStart)),drawCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,time:simulation.time});frames=0;perfStart=now;
      }
      if(now-lastUI>120){const next=simulation.stats();setStats(next);lastUI=now;
        if(next.time>=sampleTime.current+1){sampleTime.current=next.time;setHistory(old=>[...old,{time:next.time,area:next.floodedPercent}].slice(-121));}
      }
      raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);
    return()=>{alive=false;cancelAnimationFrame(raf);observer.disconnect();view.dispose();scene.current=null;sim.current=null;};
  },[]);
  const start=(wave=height)=>{sim.current?.start(wave);setPaused(false);setHistory([{time:0,area:0}]);sampleTime.current=0;setStats(sim.current?.stats()??initial);};
  const reset=()=>{sim.current?.reset();setPaused(false);setHistory([{time:0,area:0}]);sampleTime.current=0;setStats({...initial});};
  const active=stats.phase!=='ready'&&stats.phase!=='complete';
  const paint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  toolActions.current={
    async start(h){if(!sim.current||!scene.current)throw new Error('The scene is not ready');if(sim.current.running)throw new Error('Reset or finish the current run first');setHeight(h);start(h);await paint();},
    async reset(){reset();await paint();},
    read:()=>({height,paused:settings.current.paused,speed:settings.current.speed,...sim.current?.stats()})
  };
  const peak=stats.peakFloodedPercent;
  const points=history.map(p=>`${p.time/120*600},${48-p.area*.45}`).join(' ');
  return <div className="surge-app">
    <header className="surge-header"><a className="surge-brand" href="/" aria-label="Surge home"><span className="surge-mark"><Glyph type="wave"/></span><strong>SURGE<span> / </span></strong><span className="surge-wordmark">TSUNAMI<br/>LABORATORY</span></a><div className="header-center"><span className="status-dot"/> COASTAL DYNAMICS <span className="header-divider">/</span> EXPERIMENT 01</div><button className="text-button" aria-label="About the model" onClick={()=>setHelp(true)}><Glyph type="info"/><span>About the model</span></button></header>
    <main className="surge-workspace">
      <aside className="surge-sidebar">
        <div className="scenario-heading"><span className="eyebrow-label">YOUR SCENARIO</span><h1>A coast.<br/>A wave.<br/><em>A chain reaction.</em></h1><p>Send a surge through Portside and watch the terrain shape its path.</p></div>
        <div className="scenario-location"><span className="location-icon">↗</span><div><strong>Portside Bay</strong><span>Coastal town · 384 × 384 m</span></div><span className="scenario-number">01</span></div>
        <section className="wave-control"><div className="control-label"><label htmlFor="wave-height">Wave height</label><span>m</span></div><div className="height-value">{height.toFixed(1)}<span>meters</span><svg viewBox="0 0 80 34" aria-hidden="true"><path d="M0 31C17 31 19 3 43 3c12 0 20 9 16 19 8-3 15 1 21 8"/></svg></div>
          <input id="wave-height" type="range" min="1" max="20" step=".5" value={height} disabled={active} onChange={e=>setHeight(Number(e.target.value))} style={{'--fill':`${(height-1)/19*100}%`} as React.CSSProperties}/><div className="range-labels"><span>1 m · Small</span><span>20 m · Extreme</span></div>
          <div className={`impact-note ${height>=14?'extreme':''}`}><span/>{height<5?'Low-lying coast at risk':height<14?'Coastal neighborhoods at risk':'Widespread inland flooding'}</div>
        </section>
        <button className="start-tsunami" disabled={!ready||active} onClick={()=>start()}><Glyph type="wave"/>START TSUNAMI<span>↗</span></button>
        <div className="secondary-actions"><button disabled={!active} onClick={()=>setPaused(v=>!v)}><Glyph type={paused?'play':'pause'}/>{paused?'RESUME':'PAUSE'}</button><button onClick={reset} disabled={!ready}><Glyph type="reset"/>RESET</button></div>
        <div className="speed-control"><span>Simulation speed</span><div aria-label="Simulation speed">{[1,2,4].map(n=><button key={n} aria-pressed={speed===n} className={speed===n?'selected':''} onClick={()=>setSpeed(n)}>{n}×</button>)}</div></div>
        <div className="sidebar-bottom"><span className="tiny-cross">+</span><p>Higher ground changes everything.<br/>Compare a 3 m wave with a 20 m wave.</p><span className="model-note">EXPLORATORY MODEL · NOT A FORECAST</span></div>
      </aside>
      <section className="simulation-panel" aria-label="Simulation viewport">
        <div className="scene-host" ref={host}/>
        {!ready&&!error&&<div className="scene-message">Preparing coastal terrain…</div>}
        {error&&<div className="scene-message error"><strong>3D rendering unavailable</strong><p>A browser with WebGL 2 and hardware acceleration is required.</p><code>{error}</code></div>}
        <div className="viewport-heading"><span className={`event-status ${active?'active':''}`}><i/>{paused?'Simulation paused':phaseNames[stats.phase]}</span><span className="perspective-label">LIVE 3D · PERSPECTIVE VIEW</span></div>
        <div className="viewport-tools"><button aria-label="Reset camera" title="Reset camera" onClick={()=>scene.current?.home()}><Glyph type="home"/></button><button aria-label="Coast camera" title="Coast camera" onClick={()=>scene.current?.coast()}><Glyph type="orbit"/></button></div>
        <div className="flood-readout"><div className="metric-kicker"><span className="water-dot"/>Flooded Area</div><div className="flood-number">{stats.floodedPercent.toFixed(1)}<span>%</span></div><div className="flood-bar"><i style={{width:`${stats.floodedPercent}%`}}/></div><span className="metric-detail">OF LAND SURFACE · OCEAN EXCLUDED</span></div>
        <div className="scene-legend"><button className={elevation?'overlay-on':''} aria-pressed={elevation} onClick={()=>{const next=!elevation;setElevation(next);scene.current?.setElevation(next);}}>▱ Elevation {elevation?'on':'off'}<span className="toggle-track"><i/></span></button><div className="legend-title">{elevation?'TERRAIN ELEVATION':'WATER DEPTH'}</div><div className={`legend-ramp ${elevation?'terrain-ramp':''}`}/><div className="legend-scale"><span>{elevation?'0 m':'Shallow'}</span><span>{elevation?'24 m':'Deep'}</span></div></div>
        <div className="camera-hint"><span>↔</span> Drag to orbit <i/> Scroll to zoom <i/> Right-drag to pan</div>
        <div className="scene-compass"><span>N</span><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 6 7 26-7-5-7 5Z" fill="#294b58"/><path d="m20 6 0 21-7 5Z" fill="#f1f4e9"/></svg></div>
        <div className="metric-strip"><div><span>MAX. LAND DEPTH</span><strong>{stats.maxDepth.toFixed(1)}<small>m</small></strong></div><div><span>FLOODED BUILDINGS</span><strong>{stats.floodedBuildings}<small>/ {sim.current?.terrain.buildings.length??22}</small></strong></div><div><span>DISPLACED VEHICLES</span><strong>{stats.displacedVehicles}<small>/ 16</small></strong></div><div><span>PEAK FLOODED AREA</span><strong>{peak.toFixed(1)}<small>%</small></strong></div></div>
      </section>
    </main>
    <footer className="event-timeline"><div className="timeline-title"><span className="eyebrow-label">EVENT TIMELINE</span><strong>{Math.floor(stats.time/60).toString().padStart(2,'0')}<span>:</span>{Math.floor(stats.time%60).toString().padStart(2,'0')}<small>/ 02:00</small></strong></div><div className="timeline-chart"><div className="timeline-stages"><span>01 · APPROACH</span><span>02 · INUNDATION</span><span>03 · RECESSION</span></div><svg viewBox="0 0 600 50" preserveAspectRatio="none" aria-label="Flooded land percentage over time"><path d="M0 48H600" stroke="#c8d0d2" strokeDasharray="2 5"/><polygon points={`0,48 ${points} ${stats.time/120*600},48`} fill="#3292a51b"/><polyline points={points} fill="none" stroke="#23859b" strokeWidth="2"/><line x1={stats.time/120*600} x2={stats.time/120*600} y1="0" y2="50" stroke="#ed735c" strokeWidth="1.5"/></svg></div><div className="timeline-end"><span><i/> LIVE INUNDATION</span><strong>{stats.phase==='complete'?'Run complete':stats.time===0?'Awaiting wave':paused?'Paused':`${speed}× playback`}</strong></div></footer>
    {help&&<div className="surge-modal-backdrop" onClick={()=>setHelp(false)}><section className="surge-modal" role="dialog" aria-modal="true" aria-labelledby="model-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close model information" autoFocus onClick={()=>setHelp(false)}>×</button><span className="eyebrow-label">HOW IT WORKS</span><h2 id="model-title">Follow the water.</h2><p>A wave enters from the outer ocean boundary. Water moves between neighboring cells according to surface height and momentum. High ground blocks shallow water; depressions retain it.</p><p>Deeper, faster water drags cars with it. Vehicle mass affects acceleration, and building footprints stop cars and redirect water.</p><p>The flooded counter measures original land cells with more than 15 cm of water. The ocean is excluded. Buildings count as affected above 30 cm of nearby water; cars count after moving 3 m.</p><div className="model-facts"><span>96 × 96 cells</span><span>4 m resolution</span><span>30 physics steps / s</span></div><p className="model-caveat">An educational approximation with a generated coast, simplified fluid dynamics and fixed buildings. It is not suitable for hazard prediction.</p><button className="start-tsunami" onClick={()=>setHelp(false)}>BACK TO THE COAST <span>↗</span></button></section></div>}
  </div>;
}
