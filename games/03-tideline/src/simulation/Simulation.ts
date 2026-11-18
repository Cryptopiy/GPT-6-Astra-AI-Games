import { CELL, NX, NZ, SIZE, cellAt, createWorld, type World } from './terrain';
import { createVehicles, stepVehicles, type Vehicle } from './vehicles';

export const FLOOD_THRESHOLD = 0.15;
export const STEP = 1 / 30;
export const DURATION = 150;
export type Phase = 'ready' | 'running' | 'paused' | 'complete';
export type Stats = { floodedPercent: number; floodedCells: number; peakPercent: number; maxDepth: number; floodedBuildings: number; displacedVehicles: number; elapsed: number; stage: string; phase: Phase; waveHeight: number };

export class Simulation {
  readonly world: World;
  readonly depth = new Float64Array(SIZE);
  readonly flowX = new Float64Array(SIZE);
  readonly flowZ = new Float64Array(SIZE);
  // Discharge (m²/s), positive east/south, on right/bottom faces of a cell.
  readonly qx = new Float64Array(SIZE);
  readonly qz = new Float64Array(SIZE);
  private readonly previousX = new Float64Array(SIZE);
  private readonly previousZ = new Float64Array(SIZE);
  private readonly outgoing = new Float64Array(SIZE);
  private readonly scale = new Float64Array(SIZE);
  private readonly delta = new Float64Array(SIZE);
  vehicles: Vehicle[];
  phase: Phase = 'ready';
  elapsed = 0;
  waveHeight = 10;
  peakPercent = 0;
  steps = 0;
  boundaryVolume = 0;
  initialVolume = 0;
  generation = 0;

  constructor(world = createWorld()) { this.world = world; this.vehicles = createVehicles(world); this.reset(); }
  reset(): void {
    this.generation++;
    this.depth.fill(0); this.flowX.fill(0); this.flowZ.fill(0); this.qx.fill(0); this.qz.fill(0);
    this.outgoing.fill(0); this.scale.fill(0); this.delta.fill(0);
    this.previousX.fill(0); this.previousZ.fill(0);
    for (let k = 0; k < SIZE; k++) if (!this.world.land[k] && !this.world.solid[k]) this.depth[k] = -this.world.bed[k];
    this.vehicles = createVehicles(this.world);
    this.elapsed = 0; this.peakPercent = 0; this.steps = 0; this.phase = 'ready';
    this.boundaryVolume = 0; this.initialVolume = this.waterVolume();
  }
  start(height = this.waveHeight): void {
    this.reset(); this.waveHeight = Number.isFinite(height) ? Math.min(20, Math.max(1, height)) : 10; this.phase = 'running';
  }
  togglePause(): void {
    if (this.phase === 'running') this.phase = 'paused'; else if (this.phase === 'paused') this.phase = 'running';
  }
  boundaryLevel(time = this.elapsed): number {
    return time > 0 && time < 78 ? this.waveHeight * Math.sin(Math.PI * time / 78) ** 2 : 0;
  }
  advance(seconds: number): void {
    if (this.phase !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    let left = Math.min(seconds, 1);
    while (left > 1e-9 && this.phase === 'running') {
      const dt = Math.min(STEP, left, DURATION - this.elapsed);
      this.step(dt); left -= dt;
      if (this.elapsed >= DURATION - 1e-7) { this.elapsed = DURATION; this.phase = 'complete'; }
    }
  }
  private step(dt: number): void {
    const { bed, solid } = this.world;
    this.elapsed += dt;
    // The sole source/sink is the seaward boundary, never an inland flood mask.
    const sea = this.boundaryLevel();
    for (let j = 0; j < NZ; j++) {
      const k = j * NX;
      const next = Math.max(0, sea - bed[k]);
      this.boundaryVolume += (next - this.depth[k]) * CELL * CELL;
      this.depth[k] = next;
    }
    this.outgoing.fill(0); this.delta.fill(0);
    this.previousX.set(this.qx); this.previousZ.set(this.qz);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (i < NX - 1) this.face(k, k + 1, this.qx, this.previousX, i > 0 ? k - 1 : k, k + 1, dt);
      if (j < NZ - 1) this.face(k, k + NX, this.qz, this.previousZ, j > 0 ? k - NX : -1, k + NX, dt);
    }
    for (let k = 0; k < SIZE; k++) this.scale[k] = this.outgoing[k] > 0 ? Math.min(1, this.depth[k] * CELL / (dt * this.outgoing[k])) : 1;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (i < NX - 1) this.transfer(k, k + 1, this.qx, dt);
      if (j < NZ - 1) this.transfer(k, k + NX, this.qz, dt);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      this.depth[k] = solid[k] ? 0 : Math.max(0, this.depth[k] + this.delta[k]);
      const wet = this.depth[k] > 0.025;
      const denom = Math.max(this.depth[k], 0.12);
      this.flowX[k] = wet ? Math.max(-14, Math.min(14, ((i > 0 ? this.qx[k - 1] : this.qx[k]) + this.qx[k]) / (2 * denom))) : 0;
      this.flowZ[k] = wet ? Math.max(-14, Math.min(14, ((j > 0 ? this.qz[k - NX] : this.qz[k]) + this.qz[k]) / (2 * denom))) : 0;
    }
    stepVehicles(this.world, this.vehicles, this.depth, this.flowX, this.flowZ, dt);
    this.steps++;
    if (this.steps % 6 === 0) this.peakPercent = Math.max(this.peakPercent, this.floodedCount() / this.world.landCount * 100);
  }
  private face(a: number, b: number, discharge: Float64Array, old: Float64Array, before: number, after: number, dt: number): void {
    const { bed, solid } = this.world;
    if (solid[a] || solid[b]) { discharge[a] = 0; return; }
    const etaA = bed[a] + this.depth[a], etaB = bed[b] + this.depth[b];
    const h = Math.max(0, Math.max(etaA, etaB) - Math.max(bed[a], bed[b]));
    if (h < 0.00001) { discharge[a] = 0; return; }
    const previous = old[a];
    // Almeida-style discharge weighting suppresses grid-scale wet-front oscillation.
    // All neighbors come from the same previous step, so iteration order has no effect.
    const smoothing = 0.2 * dt / STEP;
    const weighted = (1 - smoothing) * previous + smoothing * 0.5 * ((before >= 0 ? old[before] : 0) + old[after]);
    const manning = 0.035;
    const friction = 1 + 9.81 * dt * manning ** 2 * Math.abs(previous) / Math.max(0.00001, h ** (7 / 3));
    let q = (weighted - 9.81 * h * dt * (etaB - etaA) / CELL) / friction;
    // Bound face velocities at unresolved dry fronts; donor limiting below conserves volume.
    q = Math.max(-h * 14, Math.min(h * 14, q));
    discharge[a] = q;
    this.outgoing[q >= 0 ? a : b] += Math.abs(q);
  }
  private transfer(a: number, b: number, discharge: Float64Array, dt: number): void {
    const q = discharge[a] * this.scale[discharge[a] >= 0 ? a : b];
    discharge[a] = q;
    const amount = q * dt / CELL;
    this.delta[a] -= amount; this.delta[b] += amount;
  }
  floodedCount(): number {
    let n = 0;
    for (let k = 0; k < SIZE; k++) if (this.world.land[k] && this.depth[k] > FLOOD_THRESHOLD) n++;
    return n;
  }
  waterVolume(): number {
    let volume = 0;
    for (let k = 0; k < SIZE; k++) volume += this.depth[k] * CELL * CELL;
    return volume;
  }
  buildingDepth(id: number): number {
    const b = this.world.buildings[id];
    let depth = 0;
    for (const [x, z] of [[b.x - b.width / 2 - CELL,b.z],[b.x + b.width / 2 + CELL,b.z],[b.x,b.z - b.length / 2 - CELL],[b.x,b.z + b.length / 2 + CELL]]) {
      const k = cellAt(x,z);
      if (k >= 0 && this.depth[k] > FLOOD_THRESHOLD) depth = Math.max(depth, this.world.bed[k] + this.depth[k] - b.base);
    }
    return Math.max(0, depth);
  }
  stats(): Stats {
    const floodedCells = this.floodedCount();
    let maxDepth = 0, floodedBuildings = 0;
    for (let k = 0; k < SIZE; k++) if (this.world.land[k]) maxDepth = Math.max(maxDepth, this.depth[k]);
    for (const b of this.world.buildings) if (this.buildingDepth(b.id) > FLOOD_THRESHOLD) floodedBuildings++;
    const floodedPercent = floodedCells / this.world.landCount * 100;
    this.peakPercent = Math.max(this.peakPercent, floodedPercent);
    return { floodedPercent, floodedCells, peakPercent: this.peakPercent, maxDepth, floodedBuildings, displacedVehicles: this.vehicles.filter(v => v.displaced).length, elapsed: this.elapsed, phase: this.phase, waveHeight: this.waveHeight,
      stage: this.phase === 'ready' ? 'Calm sea' : this.phase === 'complete' ? 'Run complete' : this.elapsed < 12 ? 'Wave approaching' : this.elapsed < 40 ? 'Coastal inundation' : this.elapsed < 85 ? 'Inland spread' : 'Receding water' };
  }
}
