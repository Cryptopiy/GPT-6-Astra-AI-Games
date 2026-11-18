import { CELL, COUNT, FIXED_DT, SIZE, Terrain, createVehicles, indexAt, type Vehicle } from './terrain';
export interface FloodStats { time: number; floodedPercent: number; peakFloodedPercent: number; maxDepth: number; floodedBuildings: number; displacedVehicles: number; waveLevel: number; phase: 'ready' | 'incoming' | 'inundation' | 'receding' | 'complete' }
/** Local-inertial finite-volume water, with positivity-preserving donor limiting. */
export class FloodSimulation {
  readonly terrain = new Terrain();
  readonly depth = new Float64Array(COUNT);
  readonly velocityX = new Float64Array(COUNT);
  readonly velocityZ = new Float64Array(COUNT);
  readonly fluxX = new Float64Array(COUNT);
  readonly fluxZ = new Float64Array(COUNT);
  private readonly outgoing = new Float64Array(COUNT);
  private readonly scale = new Float64Array(COUNT);
  private readonly delta = new Float64Array(COUNT);
  vehicles: Vehicle[] = createVehicles();
  time = 0;
  waveHeight = 10;
  running = false;
  completed = false;
  peakFloodedPercent = 0;
  readonly duration = 120;
  constructor() { this.reset(); }
  reset() {
    this.time = 0; this.running = false; this.completed = false; this.peakFloodedPercent=0;
    this.depth.fill(0); this.fluxX.fill(0); this.fluxZ.fill(0); this.velocityX.fill(0); this.velocityZ.fill(0);
    for (let i = 0; i < COUNT; i++) this.depth[i] = Math.max(0, -this.terrain.elevation[i]);
    this.vehicles = createVehicles();
  }
  start(height: number) {
    if (!Number.isFinite(height)) throw new Error('Wave height must be finite');
    this.reset(); this.waveHeight = Math.max(1, Math.min(20, height)); this.running = true;
  }
  boundaryLevel() { return this.time < 44 ? this.waveHeight * Math.sin(Math.PI * this.time / 44) ** 2 : 0; }
  step(dt = FIXED_DT) {
    if (!this.running || this.completed) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > FIXED_DT + 1e-9) throw new Error('Use a positive fixed timestep at most 1/30 second');
    this.time += dt;
    const {elevation: bed, blocked} = this.terrain, h = this.depth;
    for (let i=0;i<SIZE;i++) h[i] = Math.max(0,this.boundaryLevel()-bed[i]);
    this.outgoing.fill(0); this.delta.fill(0);
    // Faces have one owner: no row wrapping and no flux through solid buildings.
    for (let j=0;j<SIZE;j++) for (let i=0;i<SIZE;i++) {
      const a=j*SIZE+i;
      if (i<SIZE-1) this.updateFace(a,a+1,this.fluxX,dt);
      if (j<SIZE-1) this.updateFace(a,a+SIZE,this.fluxZ,dt);
    }
    for (let i=0;i<COUNT;i++) this.scale[i] = this.outgoing[i] > 0 ? Math.min(1,h[i]*CELL/(dt*this.outgoing[i])) : 1;
    for (let j=0;j<SIZE;j++) for (let i=0;i<SIZE;i++) {
      const a=j*SIZE+i;
      if (i<SIZE-1) this.transfer(a,a+1,this.fluxX,dt);
      if (j<SIZE-1) this.transfer(a,a+SIZE,this.fluxZ,dt);
    }
    let flooded=0;
    for (let j=0;j<SIZE;j++) for (let i=0;i<SIZE;i++) {
      const a=j*SIZE+i;
      h[a] = blocked[a] ? 0 : Math.max(0,h[a]+this.delta[a]);
      if(this.terrain.land[a]&&h[a]>.15)flooded++;
      const divisor=Math.max(.2,h[a])*2;
      this.velocityX[a]=Math.max(-18,Math.min(18,((i?this.fluxX[a-1]:0)+(i<SIZE-1?this.fluxX[a]:0))/divisor));
      this.velocityZ[a]=Math.max(-18,Math.min(18,((j?this.fluxZ[a-SIZE]:0)+(j<SIZE-1?this.fluxZ[a]:0))/divisor));
      if(h[a]<.025) {this.velocityX[a]=0;this.velocityZ[a]=0;}
    }
    this.peakFloodedPercent=Math.max(this.peakFloodedPercent,100*flooded/this.terrain.landCount);
    this.moveVehicles(dt);
    if(this.time>=this.duration-1e-8){this.time=this.duration;this.running=false;this.completed=true;}
  }
  private updateFace(a:number,b:number,flux:Float64Array,dt:number) {
    const bed=this.terrain.elevation;
    if(this.terrain.blocked[a]||this.terrain.blocked[b]){flux[a]=0;return;}
    const la=bed[a]+this.depth[a],lb=bed[b]+this.depth[b];
    const faceDepth=Math.max(0,Math.max(la,lb)-Math.max(bed[a],bed[b]));
    if(faceDepth<.001){flux[a]=0;return;}
    const resistance=.09 + .10/Math.max(.1,faceDepth);
    const q=(flux[a]+9.81*faceDepth*(la-lb)/CELL*dt)/(1+resistance*dt);
    flux[a]=Math.max(-18*faceDepth,Math.min(18*faceDepth,q));
    this.outgoing[flux[a]>0?a:b]+=Math.abs(flux[a]);
  }
  private transfer(a:number,b:number,flux:Float64Array,dt:number) {
    flux[a]*=this.scale[flux[a]>0?a:b];
    const volume=flux[a]*dt/CELL;
    this.delta[a]-=volume;this.delta[b]+=volume;
  }
  private moveVehicles(dt:number) {
    for (const car of this.vehicles) {
      const k=indexAt(car.x,car.z),d=this.depth[k];
      const mobility=Math.min(1,Math.max(0,(d-.3)/1.1));
      const response=mobility*1500/car.mass;
      car.vx+=(this.velocityX[k]-car.vx)*response*dt;
      car.vz+=(this.velocityZ[k]-car.vz)*response*dt;
      const grip=Math.exp(-(1-mobility)*5*dt);
      car.vx*=grip;car.vz*=grip;
      const nx=car.x+car.vx*dt,nz=car.z+car.vz*dt;
      if(!this.terrain.collision(nx,car.z)) car.x=nx; else car.vx*=-.12;
      if(!this.terrain.collision(car.x,nz)) car.z=nz; else car.vz*=-.12;
      if(Math.hypot(car.vx,car.vz)>.08) {
        const target=Math.atan2(car.vx,car.vz), difference=Math.atan2(Math.sin(target-car.angle),Math.cos(target-car.angle));
        car.spin+=(difference*1.6*mobility-car.spin*2.3)*dt; car.angle+=car.spin*dt;
      }
      if(Math.hypot(car.x-car.originX,car.z-car.originZ)>3)car.displaced=true;
    }
  }
  buildingDepth(b: {x:number;z:number;w:number;d:number}) {
    let depth=0;
    for(const [x,z] of [[b.x-b.w/2-CELL,b.z],[b.x+b.w/2+CELL,b.z],[b.x,b.z-b.d/2-CELL],[b.x,b.z+b.d/2+CELL]])depth=Math.max(depth,this.depth[indexAt(x,z)]);
    return depth;
  }
  stats(): FloodStats {
    let flooded=0,maxDepth=0;
    for(let i=0;i<COUNT;i++)if(this.terrain.land[i]){if(this.depth[i]>.15)flooded++;maxDepth=Math.max(maxDepth,this.depth[i]);}
    return {time:this.time,floodedPercent:100*flooded/this.terrain.landCount,peakFloodedPercent:this.peakFloodedPercent,maxDepth,floodedBuildings:this.terrain.buildings.filter(b=>this.buildingDepth(b)>.3).length,displacedVehicles:this.vehicles.filter(v=>v.displaced).length,waveLevel:this.boundaryLevel(),phase:this.completed?'complete':!this.running&&this.time===0?'ready':this.time<22&&flooded===0?'incoming':this.time<60?'inundation':'receding'};
  }
}
