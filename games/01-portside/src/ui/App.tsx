import { useEffect, useRef, useState } from 'react';
import { Simulation } from '../game/simulation';
import { Input } from '../game/input';
import { GameAudio } from '../game/audio';
import { GameRenderer } from '../render/GameRenderer';
import type { GameState, MissionPhase, World } from '../game/types';
import { Icon } from './icons';
import { Minimap } from './Minimap';

interface View { state: GameState; world: World; hint: string }
interface Commands { pause(): void; help(): void; sound(): void; restart(): void; camera(): void; interact(): void }
const OBJECTIVES: Record<MissionPhase, [string, string]> = {
  available: ['Your first run.', 'Meet at Portside Dispatch to pick up a local delivery.'],
  collect: ['Your ride is ready.', 'Get into the marked yellow coupe. The parcel is already on board.'],
  deliver: ['Take the scenic route.', 'Deliver the coupe to North Quay. Stop inside the marker with the coast clear.'],
  success: ['Nicely delivered.', 'One happy customer. The rest of the city is yours to explore.'],
  failed: ['A little detour.', 'The police stopped your delivery. Take a breath and try the run again.'],
};
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const commands = useRef<Commands | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [expandedMap, setExpandedMap] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!host.current) return;
    const simulation = new Simulation();
    let renderer: GameRenderer;
    try { renderer = new GameRenderer(host.current, simulation.world, simulation.state); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return; }
    const audio = new GameAudio();
    const resizeObserver = new ResizeObserver(() => renderer.resize());
    resizeObserver.observe(host.current);
    let isPaused = false;
    let isHelp = false;
    let noticeUntil = 0;
    let disposed = false;
    const notify = (message: string) => { setNotice(message); noticeUntil = performance.now() + 2600; };
    const focus = () => { (document.activeElement as HTMLElement)?.blur?.(); host.current?.focus({ preventScroll: true }); };
    const changePause = (value: boolean) => { isPaused = value; setPaused(value); input.clear(); focus(); };
    const input = new Input(code => {
      if (code === 'Escape' || code === 'KeyP') commands.current?.pause();
      if (code === 'KeyH') commands.current?.help();
      if (code === 'KeyM') commands.current?.sound();
      if (code === 'KeyC') commands.current?.camera();
    });
    commands.current = {
      pause: () => { if (isHelp) { isHelp = false; setHelp(false); } changePause(!isPaused); },
      help: () => { isHelp = !isHelp; setHelp(isHelp); changePause(isHelp); },
      sound: () => { void audio.toggle().then(value => { if (!disposed) setSound(value); }).catch(() => notify('Audio is unavailable in this browser.')); focus(); },
      restart: () => { simulation.restartMission(); input.clear(); isHelp = false; setHelp(false); changePause(false); },
      camera: () => { notify(renderer.cycleCamera()); focus(); },
      interact: () => { if (!isPaused) simulation.interact(); focus(); },
    };
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    let lastUI = 0;
    const updateUI = () => {
      setView({ state: { ...simulation.state }, world: simulation.world, hint: simulation.getHint() });
      if (import.meta.env.DEV && host.current) {
        const position = simulation.getControlled();
        host.current.dataset.telemetry = JSON.stringify({ time: simulation.state.time, x: position.x, z: position.z, mode: simulation.state.player.vehicleId ?? 'foot', collisions: simulation.state.collisions, phase: simulation.state.mission.phase });
      }
    };
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      if (!isPaused && !document.hidden) {
        accumulator = Math.min(accumulator + dt, 5 / 60);
        while (accumulator >= 1 / 60) {
          simulation.step(1 / 60, input.sample());
          accumulator -= 1 / 60;
        }
      } else { accumulator = 0; input.clear(); }
      renderer.update(simulation.state, isPaused ? 0 : dt);
      audio.update(simulation.state, isPaused || document.hidden);
      if (now - lastUI > 90) { updateUI(); lastUI = now; }
      if (noticeUntil && now > noticeUntil) { setNotice(''); noticeUntil = 0; }
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => { input.clear(); previous = performance.now(); accumulator = 0; };
    document.addEventListener('visibilitychange', onVisibility);
    updateUI();
    frame = requestAnimationFrame(tick);
    // Read-only development telemetry supports reproducible playtest diagnostics.
    if (import.meta.env.DEV) {
      Object.assign(window, { __PORTSIDE__: { snapshot: () => structuredClone(simulation.state), world: () => structuredClone(simulation.world) } });
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      input.dispose(); audio.dispose(); renderer.dispose(); commands.current = null;
      delete (window as Window & { __PORTSIDE__?: unknown }).__PORTSIDE__;
    };
  }, []);

  const state = view?.state;
  const controlled = state?.vehicles.find(v => v.id === state.player.vehicleId);
  const location = controlled ?? state?.player;
  const phase = state?.mission.phase ?? 'available';
  const objective = OBJECTIVES[phase];
  const target = view && (phase === 'deliver' ? view.world.destination : phase === 'collect' ? state!.vehicles.find(v => v.kind === 'mission')! : view.world.pickup);
  const distance = location && target ? Math.round(Math.hypot(location.x - target.x, location.z - target.z)) : 0;
  const wanted = state?.police.wanted ?? 0;
  const district = !location ? 'Central District' : location.z < -45 ? 'North Quay' : location.x < -45 ? 'Old Town' : location.x > 45 ? 'Palm Quarter' : 'Central District';
  const activeStep = phase === 'available' ? 0 : phase === 'collect' ? 1 : phase === 'deliver' ? 2 : phase === 'success' ? 3 : 2;
  const finished = phase === 'success' || phase === 'failed';
  const hint = view?.hint ?? '';
  const canInteract = /^E\s*[·:—–-]/.test(hint);
  const hintKey = canInteract ? 'E' : hint.startsWith('SPACE') ? 'SPACE' : '';
  const hintText = hint.replace(/^(E|SPACE)\s*[·:—–-]\s*/, '');

  return <main className={`game ${wanted ? 'is-wanted' : ''}`}>
    <div className="world-viewport" ref={host} tabIndex={-1} aria-label="Portside 3D game. Use WASD to move, E to interact, and H for help." />
    <div className="screen-shade" />
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span/><span/><span/></div><div><h1>PORTSIDE<span>®</span></h1><p>A LITTLE OPEN WORLD</p></div></div>
      <div className="place"><Icon name="pin" size={15}/><span>{district}</span><span className="place-divider"/><Icon name="sun" size={17}/><span>16:42</span></div>
      <nav className="toolbar" aria-label="Game settings">
        <span className="live-session"><i className="live-dot"/> FREE ROAM</span>
        <button className={`icon-button ${sound ? 'selected' : ''}`} onClick={() => commands.current?.sound()} aria-label={sound ? 'Mute sound (M)' : 'Enable sound (M)'} title="Toggle sound · M"><Icon name={sound ? 'sound' : 'mute'}/></button>
        <button className="icon-button" onClick={() => commands.current?.pause()} aria-label={paused ? 'Resume game' : 'Pause game'} title="Pause · Esc"><Icon name={paused ? 'play' : 'pause'}/></button>
        <button className="icon-button help-button" onClick={() => commands.current?.help()} aria-label="Show controls and help" title="Controls · H"><Icon name="help"/></button>
      </nav>
    </header>

    {view && <>
      <aside className={`mission panel ${phase === 'success' ? 'mission-complete' : ''}`} aria-label="Current mission">
        <div className="eyebrow"><span className="mission-symbol"><Icon name={phase === 'success' ? 'check' : 'box'} size={16}/></span><span>{phase === 'success' ? 'DELIVERY COMPLETE' : 'LOCAL DELIVERY'}</span><span className="mission-number">01</span></div>
        <h2>{objective[0]}</h2><p className="mission-description">{objective[1]}</p>
        <div className="mission-steps">
          {['Meet at the dispatch', 'Pick up the yellow coupe', 'Deliver to North Quay'].map((label, index) => <div key={label} className={`mission-step ${index === activeStep ? 'current' : ''} ${index < activeStep ? 'done' : ''}`}><span className="step-number">{index < activeStep ? <Icon name="check" size={11}/> : `0${index + 1}`}</span><span>{label}</span>{index === activeStep && <Icon name="arrow" size={14}/>}</div>)}
        </div>
        <div className="mission-footer"><span><Icon name={finished ? 'flag' : 'pin'} size={13}/>{finished ? phase === 'success' ? 'PARCEL DELIVERED' : 'DELIVERY INTERRUPTED' : phase === 'available' ? 'PORTSIDE DISPATCH' : phase === 'collect' ? 'YOUR COURIER COUPE' : 'NORTH QUAY'}</span><strong>{finished ? formatTime(state!.mission.elapsed) : `${distance} m`}</strong></div>
        {finished && <button className="replay-button" onClick={() => commands.current?.restart()}><Icon name="restart" size={14}/> {phase === 'success' ? 'Make another run' : 'Try delivery again'} <kbd>R</kbd></button>}
      </aside>

      <div className={`police-status panel ${wanted ? 'alert' : ''}`} role="status">
        <Icon name="shield" size={17}/><div><span>{wanted ? state!.police.escape > 0 ? 'LOSING THE HEAT' : 'POLICE PURSUIT' : 'THE COAST IS CLEAR'}</span>{wanted > 0 && <small>{state!.police.caught > 0 ? 'Keep moving — police are closing in' : 'Break line of sight. Keep your distance.'}</small>}</div><div className="wanted-stars">{[1, 2, 3].map(n => <span key={n} className={n <= wanted ? 'lit' : ''}>★</span>)}</div>
        {wanted > 0 && <div className="escape-progress" style={{ width: `${Math.min(100, state!.police.escape / 12 * 100)}%` }}/>}
      </div>

      <div className="district-caption"><span>WELCOME TO</span><strong>{district}</strong><span className="district-rule"/></div>

      <div className="bottom-left">
        <section className="player-panel panel" aria-label="Player status">
          <div className="player-mode"><span className="mode-icon"><Icon name={controlled ? 'car' : 'person'} size={23}/></span><div><span className="eyebrow small">{controlled ? controlled.kind === 'mission' ? 'COURIER COUPE' : 'CITY CRUISER' : 'MAKE YOUR OWN WAY'}</span><strong>{controlled ? 'DRIVING' : 'ON FOOT'}</strong></div><i className="live-dot"/></div>
          {controlled && <div className="speedometer"><strong>{Math.round(Math.abs(controlled.speed) * 3.6).toString().padStart(2, '0')}</strong><span>KM/H</span><div className="speed-bars">{Array.from({ length: 14 }, (_, n) => <i key={n} className={n < Math.abs(controlled.speed) / 2 ? 'filled' : ''}/>)}</div><b>{controlled.speed < -0.3 ? 'R' : Math.abs(controlled.speed) < 0.2 ? 'N' : 'D'}</b></div>}
        </section>
        <div className="session-caption"><span className="session-line"/> NO RUSH. JUST EXPLORE.</div>
      </div>

      <div className="map-area"><div className="map-location"><Icon name="compass" size={16}/><span>{district}</span><span>{Math.round(location!.x)}, {Math.round(location!.z)}</span></div><Minimap world={view.world} state={state!} expanded={expandedMap} onToggle={() => setExpandedMap(v => !v)}/></div>

      <div className="interaction-area" aria-live="polite">
        {(notice || (state!.messageUntil > state!.time && state!.message)) && <div className="toast panel">{notice || state!.message}</div>}
        {hint && !paused && (canInteract ? <button className="interaction panel" onClick={() => commands.current?.interact()}><kbd>E</kbd><span>{hintText}</span><Icon name="arrow" size={17}/></button> : <div className="interaction panel">{hintKey && <kbd>{hintKey}</kbd>}<span>{hintText}</span></div>)}
      </div>

      <footer className="controls-bar"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {controlled ? 'Drive' : 'Move'}</span><span><kbd>E</kbd> {controlled ? 'Exit car' : 'Interact'}</span><span><kbd>{controlled ? 'SPACE' : 'SHIFT'}</kbd> {controlled ? 'Brake' : 'Run'}</span><span className="secondary-control"><kbd>C</kbd> Camera</span><span className="secondary-control"><kbd>R</kbd> Replay</span><button onClick={() => commands.current?.help()}><kbd>H</kbd> All controls</button></footer>
    </>}

    {!view && !error && <div className="loading"><div className="loader"/><span>Opening up the neighborhood…</span></div>}
    {error && <div className="modal-backdrop"><section className="dialog"><h2>The city couldn't load.</h2><p>Portside needs a browser with WebGL 2 and hardware acceleration enabled.</p><code>{error}</code><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></section></div>}
    {paused && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button className="dialog-close icon-button" onClick={() => commands.current?.pause()} aria-label="Close and resume"><Icon name="close"/></button>
      <div className="eyebrow"><Icon name="compass" size={18}/><span>A LITTLE ROOM TO ROAM</span></div>
      <h2 id="dialog-title">{help ? 'Know your way around.' : 'Take a breather.'}</h2>
      <p>{help ? 'Walk the neighborhood, borrow a car, or make your first delivery. This little city keeps moving with you.' : 'The city can wait. Your delivery and the simulation are paused.'}</p>
      {help && <><div className="help-controls">{[['W A S D / ↑ ← ↓ →', 'Walk / accelerate, brake & steer'], ['E', 'Start delivery / enter / exit car'], ['Shift / Space', 'Run on foot / brake in a car'], ['C', 'Switch the follow camera'], ['R', 'Restart the courier mission'], ['M', 'Toggle synthesized sound'], ['Esc / P', 'Pause or resume']].map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><div className="help-tip"><Icon name="shield" size={18}/><p>Crashes, hitting pedestrians, or entering the red depot zone attract police. Lose them for 12 seconds to clear your wanted level. Slow down before getting out of a car.</p></div></>}
      <button className="primary-button" onClick={() => commands.current?.pause()}><Icon name="play" size={17}/> Back to the city <span>ESC</span></button>
    </section></div>}
  </main>;
}
