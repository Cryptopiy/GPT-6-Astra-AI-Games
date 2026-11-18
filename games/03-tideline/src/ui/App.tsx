import { useEffect, useRef, useState } from 'react';
import { Simulation, STEP, DURATION, type Stats } from '../simulation/Simulation';
import { SceneRenderer, type View } from '../render/SceneRenderer';
import { installModelTools, type ModelContext, type ControlAction } from './webmcp';

function Icon({name,size=20}:{name:string;size?:number}) {
  const paths:Record<string,React.ReactNode>={
    wave:<><path d="M2 15c5 0 5-9 11-9a7 7 0 0 1 7 7c-3-3-7-2-7 1 0 3 4 4 9 4M2 21h20"/></>,
    reset:<><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
    play:<path d="m9 5 11 7-11 7Z"/>,pause:<><path d="M8 5v14M16 5v14"/></>,
    layers:<><path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5"/></>,
    arrow:<path d="m5 12 14 0m-6-6 6 6-6 6"/>,
    expand:<><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/></>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/></>,
    car:<><path d="m5 8 2-4h10l2 4 2 3v7H3v-7ZM5 8h14M6 13h2m8 0h2M6 18v3m12-3v3"/></>,
    building:<><path d="M5 22V3h14v19M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 22v-4h4v4"/></>,
    depth:<><path d="M6 3v18m-3-3 3 3 3-3M3 6l3-3 3 3M14 4h7M14 12h7M14 20h7"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.info}</svg>;
}
const clock=(time:number)=>`${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;

export function App() {
  const host=useRef<HTMLDivElement>(null),simRef=useRef<Simulation|null>(null),viewRef=useRef<SceneRenderer|null>(null),speedRef=useRef(1);
  const dialogRef=useRef<HTMLDialogElement>(null),aboutRef=useRef<HTMLButtonElement>(null);
  const [stats,setStats]=useState<Stats>(()=>new Simulation().stats());
  const [height,setHeight]=useState(10),[speed,setSpeed]=useState(1),[overlay,setOverlay]=useState(false),[view,setView]=useState<View>('overview');
  const [error,setError]=useState(''),[showInfo,setShowInfo]=useState(false),[history,setHistory]=useState<number[]>([0]);
  const active=stats.phase==='running'||stats.phase==='paused';
  useEffect(()=>{
    if(!showInfo||!dialogRef.current)return;
    const dialog=dialogRef.current;dialog.showModal();
    return()=>{dialog.close();aboutRef.current?.focus();};
  },[showInfo]);
  useEffect(()=>{
    const sim=new Simulation();simRef.current=sim;
    let renderer:SceneRenderer;
    try{renderer=new SceneRenderer(host.current!,sim);viewRef.current=renderer;}catch(e){setError(e instanceof Error?e.message:'WebGL could not start.');return;}
    const removeTools=installModelTools((document as Document&{modelContext?:ModelContext}).modelContext,{read:()=>sim.stats(),control:control});
    let frame=0,previous=performance.now(),accumulator=0,lastUI=0,lastHistory=0,alive=true,generation=sim.generation;
    let fpsStart=performance.now(),frameCount=0;
    const loop=(now:number)=>{
      if(!alive)return;
      const dt=Math.min((now-previous)/1000,.15);previous=now;
      if(generation!==sim.generation){generation=sim.generation;accumulator=0;lastHistory=0;}
      if(sim.phase==='running'&&!document.hidden){
        accumulator+=dt*speedRef.current;
        let steps=0;
        while(accumulator>=STEP&&steps<20){sim.advance(STEP);accumulator-=STEP;steps++;}
      }else accumulator=0;
      renderer.render(now/1000);
      frameCount++;
      if(import.meta.env.DEV&&now-fpsStart>1000){
        host.current!.dataset.telemetry=JSON.stringify({fps:Math.round(frameCount*1000/(now-fpsStart)),drawCalls:renderer.renderer.info.render.calls,geometries:renderer.renderer.info.memory.geometries,textures:renderer.renderer.info.memory.textures,elapsed:sim.elapsed,vehicles:sim.vehicles.map(v=>({id:v.id,x:v.x,z:v.z,yaw:v.yaw})),steps:sim.steps});
        fpsStart=now;frameCount=0;
      }
      if(now-lastUI>120){const s=sim.stats();setStats(s);lastUI=now;
        if(sim.elapsed-lastHistory>=1){setHistory(h=>[...h,s.floodedPercent].slice(-151));lastHistory=sim.elapsed;}
        if(sim.elapsed===0){lastHistory=0;setHistory([0]);}
      }
      frame=requestAnimationFrame(loop);
    };
    frame=requestAnimationFrame(loop);
    const visibility=()=>{previous=performance.now();accumulator=0;};document.addEventListener('visibilitychange',visibility);
    const lost=(event:Event)=>{event.preventDefault();if(sim.phase==='running')sim.togglePause();setError('The 3D graphics context was interrupted. Reload the page to restore the scene.');};renderer.renderer.domElement.addEventListener('webglcontextlost',lost);
    const keyboard=(event:KeyboardEvent)=>{
      if(dialogRef.current?.open)return;
      if((event.target as HTMLElement).matches('input,button,select,textarea'))return;
      if(event.code==='Space'){event.preventDefault();sim.togglePause();setStats(sim.stats());}
      if(event.code==='KeyR'){sim.reset();renderer.forceUpdate();setStats(sim.stats());setHistory([0]);}
    };window.addEventListener('keydown',keyboard);
    return()=>{alive=false;cancelAnimationFrame(frame);removeTools();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',keyboard);renderer.renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();viewRef.current=null;simRef.current=null;};
  },[]);
  function control(action:ControlAction,nextHeight?:number){
    const sim=simRef.current;if(!sim)throw new Error('The simulation is not ready.');
    if(action==='start'){sim.start(nextHeight);setHeight(sim.waveHeight);setHistory([0]);viewRef.current?.forceUpdate();}
    if(action==='reset'){sim.reset();setHistory([0]);viewRef.current?.forceUpdate();}
    if(action==='pause'){if(sim.phase!=='running')throw new Error('Only a running simulation can be paused.');sim.togglePause();}
    if(action==='resume'){if(sim.phase!=='paused')throw new Error('Only a paused simulation can be resumed.');sim.togglePause();}
    setStats(sim.stats());return sim.stats();
  }
  function start(){control('start',height);}
  function reset(){control('reset');}
  function toggle(){control(simRef.current?.phase==='running'?'pause':'resume');}
  function chooseView(next:View){setView(next);viewRef.current?.setView(next);}
  function setRate(rate:number){speedRef.current=rate;setSpeed(rate);}
  const points=history.map((h,i)=>`${i/Math.max(1,history.length-1)*236},${50-h*.46}`).join(' ');
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="./" aria-label="Tideline home"><span className="brand-mark"><Icon name="wave" size={25}/></span><strong>tideline<span>®</span></strong><span className="brand-divider"/><span className="brand-label">COASTAL SIMULATION LAB</span></a>
      <div className={`status-pill ${stats.phase==='running'?'live':''}`}><span/>{stats.phase==='ready'?'SYSTEM READY':stats.phase==='paused'?'SIMULATION PAUSED':stats.phase==='complete'?'SIMULATION COMPLETE':'SIMULATION LIVE'}</div>
      <button ref={aboutRef} className="about-button" onClick={()=>setShowInfo(v=>!v)} aria-expanded={showInfo}><Icon name="info" size={17}/><span>About the model</span></button>
    </header>
    <main className="workspace">
      <aside className="sidebar">
        <div className="panel-heading"><span className="eyebrow">EXPERIMENT 003</span><span className="small-tag">3D</span></div>
        <h1>When the<br/>ocean comes in.</h1>
        <p className="intro">Set a wave in motion. See how the land shapes what happens next.</p>
        <div className="section-label"><span>01</span> WAVE CONDITIONS</div>
        <div className="height-heading"><label htmlFor="wave-height">Wave height</label><div><strong>{height}</strong><span>m</span></div></div>
        <input id="wave-height" aria-label="Wave height in meters" type="range" min="1" max="20" step="1" value={height} disabled={active} onChange={e=>setHeight(Number(e.target.value))} style={{'--progress':`${(height-1)/19*100}%`} as React.CSSProperties}/>
        <div className="range-labels"><span>1 m · SMALL</span><span>20 m · EXTREME</span></div>
        <div className="presets">{[3,10,20].map((h,i)=><button key={h} disabled={active} className={height===h?'selected':''} onClick={()=>setHeight(h)}>{['Small','Major','Extreme'][i]}<span>{h} m</span></button>)}</div>
        <p className="setting-note">{active?'Reset to change the next wave.':'Wave height is measured at the sea boundary.'}</p>
        <div className="section-label playback-label"><span>02</span> SIMULATION</div>
        <div className="speed-control"><span>Playback speed</span><div role="group" aria-label="Playback speed">{[1,2,4].map(n=><button key={n} className={speed===n?'selected':''} onClick={()=>setRate(n)} aria-pressed={speed===n}>{n}×</button>)}</div></div>
        <button className="start-button" onClick={active?toggle:start} disabled={!!error}><Icon name={stats.phase==='running'?'pause':active?'play':'wave'} size={22}/>{stats.phase==='running'?'PAUSE SIMULATION':stats.phase==='paused'?'RESUME SIMULATION':'START TSUNAMI'}<Icon name="arrow" size={19}/></button>
        <button className="reset-button" onClick={reset} disabled={!!error}><Icon name="reset" size={15}/>RESET<span>R</span></button>
        <div className="sidebar-bottom"><Icon name="info" size={16}/><p>An illustrative model of inundation.<br/>For exploration, not hazard prediction.</p></div>
      </aside>
      <section className="simulation-panel" aria-label="Tsunami simulation">
        <div className="scene" ref={host}/>
        <div className="scene-heading"><span className="location-kicker"><span/> PROCEDURAL COASTLINE</span><h2>North Haven</h2><p>288 × 240 m <span>·</span> {simRef.current?.world.buildings.length??29} buildings <span>·</span> 16 vehicles</p></div>
        <div className="scene-clock"><span>ELAPSED TIME</span><strong>{clock(stats.elapsed)}<small> / {clock(DURATION)}</small></strong><div className="stage">{stats.stage}</div></div>
        <div className="view-controls"><div role="group" aria-label="Camera view"><button onClick={()=>chooseView('overview')} className={view==='overview'?'selected':''}><Icon name="compass" size={15}/>Overview</button><button onClick={()=>chooseView('coast')} className={view==='coast'?'selected':''}>Coast view</button></div><button className={`overlay-button ${overlay?'selected':''}`} onClick={()=>{setOverlay(!overlay);viewRef.current?.setElevationOverlay(!overlay);}} aria-pressed={overlay}><Icon name="layers" size={16}/>Elevation</button></div>
        <div className="north-indicator"><span>N</span><Icon name="compass" size={35}/></div>
        <div className="legend"><span>{overlay?'TERRAIN ELEVATION':'WATER DEPTH'}</span><div className={`legend-gradient ${overlay?'terrain-gradient':''}`}/><div><span>{overlay?'0 m':'Shallow'}</span><span>{overlay?'30 m':'Deep'}</span></div></div>
        <div className="camera-hint">Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Right-drag to pan</div>
        {stats.phase==='complete'&&<div className="run-result"><span>RUN COMPLETE</span><strong>{stats.peakPercent.toFixed(1)}% peak inundation</strong><p>Choose a different wave height to compare.</p></div>}
        {error&&<div className="error-panel" role="alert"><h3>3D view unavailable</h3><p>{error}</p><p>Use a browser with WebGL 2 and hardware acceleration enabled.</p></div>}
        <div className="stats-bar" aria-label="Live flood statistics">
          <div className="main-stat"><span><i/>FLOODED AREA</span><div><strong>{stats.floodedPercent.toFixed(1)}<small>%</small></strong><span>of land</span></div><div className="flood-track"><span style={{width:`${stats.floodedPercent}%`}}/></div></div>
          <div className="stat"><span><Icon name="depth" size={16}/>MAX. LAND DEPTH</span><strong>{stats.maxDepth.toFixed(1)}<small>m</small></strong><p>Current water depth</p></div>
          <div className="stat"><span><Icon name="building" size={16}/>FLOODED BUILDINGS</span><strong>{stats.floodedBuildings}<small>/ {simRef.current?.world.buildings.length??29}</small></strong><p>Water above floor level</p></div>
          <div className="stat"><span><Icon name="car" size={16}/>DISPLACED VEHICLES</span><strong>{stats.displacedVehicles}<small>/ 16</small></strong><p>Moved more than 2 m</p></div>
          <div className="history-stat"><span>INUNDATION OVER TIME</span><svg viewBox="0 0 236 54" preserveAspectRatio="none" aria-label="Flooded area history"><path d={`M0,52 L${points.replaceAll(' ',' L')} L236,52 Z`} fill="rgba(76,152,145,.13)"/><polyline points={points} fill="none" stroke="#569d94" strokeWidth="2"/></svg><p>Peak <strong>{stats.peakPercent.toFixed(1)}%</strong></p></div>
        </div>
      </section>
    </main>
    <footer className="footer"><span><i/>LOCAL SIMULATION · NO EXTERNAL DATA</span><span>Terrain-aware flow <b>·</b> Buoyancy & drag <b>·</b> Fixed obstacles</span><span>TIDELINE / 003</span></footer>
    {showInfo&&<dialog ref={dialogRef} className="model-dialog" aria-labelledby="model-title" onCancel={()=>setShowInfo(false)}><button className="dialog-close" autoFocus onClick={()=>setShowInfo(false)} aria-label="Close model details">×</button><span className="eyebrow">BEHIND THE SCENE</span><h2 id="model-title">Water follows the land.</h2><p>A 96 × 80 grid stores terrain elevation, water depth and flow. A 78-second surge enters at the ocean edge. Gravity moves water through neighboring cells; hills resist it and solid buildings redirect it.</p><p>Vehicles respond to local flow, submerged area, mass, drag and buoyancy. They drift and rotate, with solid collision boundaries around buildings.</p><p>The flooded area counts original land cells deeper than 15 cm, including building footprints in the land denominator. Permanent ocean is excluded. All values use physical heights; the view exaggerates terrain and water heights by 1.35×.</p><p className="model-caution">A simplified local-inertia model. It does not predict real tsunami hazards, breaking waves, building collapse or structural damage.</p><button className="dialog-done" onClick={()=>setShowInfo(false)}>Back to the coast<Icon name="arrow" size={17}/></button></dialog>}
  </div>;
}
