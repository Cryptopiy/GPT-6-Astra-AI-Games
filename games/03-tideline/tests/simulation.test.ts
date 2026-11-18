import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, STEP, DURATION, FLOOD_THRESHOLD } from '../src/simulation/Simulation';
import { CELL, NX, NZ, SIZE, createWorld, cellAt, xAt, zAt, sampleBed } from '../src/simulation/terrain';
import { collides, createVehicles, stepVehicles } from '../src/simulation/vehicles';

function advance(sim: Simulation, time: number) { for(let i=0;i<Math.round(time/STEP);i++) sim.advance(STEP); }
function checkFinite(sim: Simulation) {
  for(let k=0;k<SIZE;k++) {
    assert.ok(Number.isFinite(sim.depth[k])&&sim.depth[k]>=0,`depth[${k}]=${sim.depth[k]}`);
    assert.ok(Number.isFinite(sim.qx[k])&&Number.isFinite(sim.qz[k]),`discharge[${k}]`);
    assert.ok(Number.isFinite(sim.flowX[k])&&Number.isFinite(sim.flowZ[k]),`flow[${k}]`);
    if(sim.world.solid[k]) assert.equal(sim.depth[k],0);
  }
  for(const car of sim.vehicles) {
    assert.ok([car.x,car.z,car.y,car.yaw,car.vx,car.vz,car.roll].every(Number.isFinite));
    assert.ok(!collides(sim.world,car.x,car.z),`vehicle ${car.id} intersects building or boundary`);
  }
  const discrepancy=Math.abs(sim.waterVolume()-sim.initialVolume-sim.boundaryVolume);
  assert.ok(discrepancy<1e-7*Math.max(1,sim.waterVolume()),`mass error ${discrepancy}`);
}

test('calm sea has elevated land, roads, solid buildings, clear cars and zero flooded counters',()=>{
  const sim=new Simulation();
  assert.ok(Math.max(...sim.world.bed)>25);
  assert.ok(sim.world.roads.some(Boolean));assert.ok(sim.world.buildings.length>=20);
  assert.equal(sim.vehicles.length,16);
  assert.equal(sim.stats().floodedPercent,0);assert.equal(sim.stats().floodedBuildings,0);
  assert.equal(sim.stats().displacedVehicles,0);checkFinite(sim);
});

test('cell boundaries and terrain interpolation remain finite and bounded',()=>{
  const w=createWorld();
  assert.equal(cellAt(-145,0),-1);assert.equal(cellAt(144,0),-1);assert.equal(cellAt(0,120),-1);
  assert.equal(cellAt(xAt(NX-1),zAt(NZ-1)),SIZE-1);
  for(const x of [-144,-143,-50,0,143,144])for(const z of [-120,-119,0,119,120])assert.ok(Number.isFinite(sampleBed(w,x,z)));
});

test('initial water is in equilibrium without incoming wave',()=>{
  const sim=new Simulation();const before=sim.depth.slice();sim.phase='running';sim.waveHeight=0;
  advance(sim,8);
  for(let k=0;k<SIZE;k++)assert.ok(Math.abs(sim.depth[k]-before[k])<1e-10);
  assert.equal(sim.floodedCount(),0);checkFinite(sim);
});

test('a cell can receive new water only from a wet immediate neighbor',()=>{
  const sim=new Simulation();sim.start(20);
  for(let step=0;step<600;step++){
    const old=sim.depth.slice();sim.advance(STEP);
    for(let j=0;j<NZ;j++)for(let i=1;i<NX;i++){
      const k=j*NX+i;
      if(old[k]===0&&sim.depth[k]>0){
        const neighbors=[k-1,...i<NX-1?[k+1]:[],...j>0?[k-NX]:[],...j<NZ-1?[k+NX]:[]];
        assert.ok(neighbors.some(q=>old[q]>0&&!sim.world.solid[q]),`unreachable new wet cell ${k}`);
      }
    }
  }
});

test('solid wall blocks flood propagation and redirects it',()=>{
  const w=createWorld();
  for(let j=0;j<NZ;j++)w.solid[j*NX+32]=1;
  const sim=new Simulation(w);sim.start(20);sim.vehicles=[];advance(sim,55);
  let before=0,after=0;
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    if(i<32&&w.land[j*NX+i]&&sim.depth[j*NX+i]>.15)before++;
    if(i>32)after+=sim.depth[j*NX+i];
  }
  assert.ok(before>0);assert.equal(after,0);checkFinite(sim);
});

test('1m, 10m and 20m waves complete with progressively larger inundation and valid physics',()=>{
  const outcomes=[];
  for(const height of [1,10,20]){
    const sim=new Simulation();sim.start(height);
    let reached=0,lowArrival=Infinity,highArrival=Infinity;
    const samples=[];
    for(let second=1;second<=DURATION;second++){
      advance(sim,1);checkFinite(sim);
      const stats=sim.stats();reached=Math.max(reached,stats.displacedVehicles);
      if(sim.depth[cellAt(-44,78)]>FLOOD_THRESHOLD&&lowArrival===Infinity)lowArrival=second;
      if(sim.depth[cellAt(78,78)]>FLOOD_THRESHOLD&&highArrival===Infinity)highArrival=second;
      if([10,20,40,60,90,150].includes(second))samples.push({second,flooded:+stats.floodedPercent.toFixed(2),maxDepth:+stats.maxDepth.toFixed(2),vehicles:stats.displacedVehicles});
    }
    assert.equal(sim.phase,'complete');assert.equal(sim.elapsed,DURATION);
    assert.equal(sim.stats().floodedCells,sim.floodedCount());
    let count=0;for(let k=0;k<SIZE;k++)if(sim.world.land[k]&&sim.depth[k]>FLOOD_THRESHOLD)count++;
    assert.equal(sim.stats().floodedPercent,count/sim.world.landCount*100);
    assert.ok(sim.depth[cellAt(92,-61)]<.15,'high refuge stays above the surge');
    outcomes.push({height,peak:sim.peakPercent,reached,lowArrival,highArrival,samples});
  }
  assert.ok(outcomes[0].peak<outcomes[1].peak/2);
  assert.ok(outcomes[1].peak<outcomes[2].peak);
  assert.ok(outcomes[2].reached>=5);
  assert.ok(outcomes[2].lowArrival<outcomes[2].highArrival);
  console.log('WAVE COMPARISON '+JSON.stringify(outcomes));
});

test('depressions retain water after the ocean pulse has receded',()=>{
  const sim=new Simulation();sim.start(10);advance(sim,DURATION);
  assert.equal(sim.boundaryLevel(),0);
  assert.ok(sim.depth[cellAt(-3,49)]>.25,`basin depth ${sim.depth[cellAt(-3,49)]}`);
});

test('pause freezes time, discharge, vehicles and depth',()=>{
  const sim=new Simulation();sim.start(20);advance(sim,32);sim.togglePause();
  const time=sim.elapsed,depth=sim.depth.slice(),qx=sim.qx.slice(),cars=structuredClone(sim.vehicles);
  advance(sim,10);assert.equal(sim.elapsed,time);assert.deepEqual(sim.depth,depth);assert.deepEqual(sim.qx,qx);assert.deepEqual(sim.vehicles,cars);
  sim.togglePause();sim.advance(STEP);assert.ok(sim.elapsed>time);
});

test('reset restores all water arrays, vehicle positions, counters and boundary ledger',()=>{
  const sim=new Simulation();const baseline=sim.depth.slice(),cars=structuredClone(sim.vehicles);
  sim.start(20);advance(sim,60);sim.reset();
  assert.deepEqual(sim.depth,baseline);assert.deepEqual(sim.vehicles,cars);
  for(const a of [sim.qx,sim.qz,sim.flowX,sim.flowZ])assert.ok(a.every(v=>v===0));
  const stats=sim.stats();assert.equal(stats.phase,'ready');assert.equal(stats.elapsed,0);assert.equal(stats.floodedPercent,0);assert.equal(stats.peakPercent,0);assert.equal(stats.floodedBuildings,0);assert.equal(stats.displacedVehicles,0);assert.equal(sim.boundaryVolume,0);
});

test('repeated starts reproduce the same water, discharge and displaced vehicles',()=>{
  const sim=new Simulation();sim.start(20);advance(sim,40);
  const d=sim.depth.slice(),q=sim.qx.slice(),cars=structuredClone(sim.vehicles);
  for(let run=0;run<3;run++){sim.start(20);advance(sim,40);assert.deepEqual(sim.depth,d);assert.deepEqual(sim.qx,q);assert.deepEqual(sim.vehicles,cars);}
});

test('floating cars approach water speed, respond to mass and resist shallow water',()=>{
  const world=createWorld();world.buildings=[];
  const depth=new Float64Array(SIZE).fill(3),flowX=new Float64Array(SIZE).fill(4),flowZ=new Float64Array(SIZE);
  const cars=createVehicles(world).slice(0,1);cars[0].x=-48;cars[0].z=27;
  for(let i=0;i<150;i++)stepVehicles(world,cars,depth,flowX,flowZ,STEP);
  assert.ok(cars[0].vx>3.3&&cars[0].vx<4.01);assert.ok(cars[0].displaced);assert.ok(Math.abs(cars[0].yaw)>.1);
  const light=createVehicles(world).slice(0,1),heavy=createVehicles(world).slice(0,1);heavy[0].mass*=3;
  stepVehicles(world,light,depth,flowX,flowZ,STEP);stepVehicles(world,heavy,depth,flowX,flowZ,STEP);
  assert.ok(light[0].vx>heavy[0].vx);
  const shallow=createVehicles(world).slice(0,1);depth.fill(.1);stepVehicles(world,shallow,depth,flowX,flowZ,STEP);assert.equal(shallow[0].vx,0);
});

test('high-speed flow cannot push a car through a thin fixed building',()=>{
  const world=createWorld();world.buildings=[{id:0,x:0,z:0,width:.3,length:60,height:10,base:0,color:0}];
  const car=createVehicles(world)[0];car.x=-8;car.z=0;car.vx=13;
  const depth=new Float64Array(SIZE).fill(12),flow=new Float64Array(SIZE).fill(14),zero=new Float64Array(SIZE);
  for(let i=0;i<600;i++){stepVehicles(world,[car],depth,flow,zero,STEP);assert.ok(car.x<0);assert.ok(!collides(world,car.x,car.z));}
});

test('invalid controls do not introduce non-finite state',()=>{
  const sim=new Simulation();sim.start(NaN);assert.equal(sim.waveHeight,10);
  sim.advance(NaN);sim.advance(Infinity);sim.advance(-1);assert.equal(sim.elapsed,0);
  sim.start(100);assert.equal(sim.waveHeight,20);sim.start(-100);assert.equal(sim.waveHeight,1);checkFinite(sim);
});
