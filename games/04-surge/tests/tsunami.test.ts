import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloodSimulation } from '../src/tsunami/simulation';
import { CELL, COUNT, FIXED_DT, SIZE, Terrain, center, indexAt } from '../src/tsunami/terrain';

const run=(s:FloodSimulation,seconds:number)=>{for(let i=0;i<Math.round(seconds/FIXED_DT);i++)s.step();};
test('initial state is calm, ocean is excluded, and rendered terrain matches cell beds',()=>{
  const s=new FloodSimulation(),t=s.terrain;
  assert.equal(s.stats().floodedPercent,0);assert.equal(s.stats().maxDepth,0);assert.ok(s.depth.some(v=>v>8));
  for(let j=0;j<SIZE;j++)for(let i=0;i<SIZE;i++)assert.equal(t.elevation[j*SIZE+i],t.height(center(i),center(j)));
  assert.equal(t.vertices.length,(SIZE+1)**2);assert.equal(t.buildings.length,22);assert.equal(s.vehicles.length,16);
  assert.ok(t.height(104,151)>20);assert.ok(t.height(-104,-58)<2);
});
test('lake at rest stays at rest over uneven ocean bed',()=>{
  const s=new FloodSimulation();s.start(1);s.waveHeight=0;const before=s.depth.slice();run(s,20);
  assert.deepEqual(s.depth,before);assert.ok(s.fluxX.every(v=>v===0));assert.ok(s.fluxZ.every(v=>v===0));
});
test('the flood reaches inland probes causally and preserves the high refuge',()=>{
  const s=new FloodSimulation();s.start(10);
  const probes=[indexAt(-104,-58),indexAt(-104,-20),indexAt(-104,40)],wetAt=[Infinity,Infinity,Infinity];
  for(let step=0;step<2100;step++){
    s.step();probes.forEach((k,i)=>{if(s.depth[k]>.15&&wetAt[i]===Infinity)wetAt[i]=s.time;});
    assert.equal(s.depth[indexAt(104,151)],0);
  }
  assert.ok(wetAt[0]>5);assert.ok(wetAt[1]>wetAt[0]+1);assert.ok(wetAt[2]>wetAt[1]+1);assert.ok(wetAt[2]<70);
});
test('1, 10 and 20 metre waves remain finite, give distinct outcomes, and keep cars outside buildings',()=>{
  const results=[];
  for(const height of [1,10,20]){
    const s=new FloodSimulation();s.start(height);let lastPeak=0;
    for(let step=0;step<3600;step++){
      s.step();assert.ok(s.peakFloodedPercent>=lastPeak);lastPeak=s.peakFloodedPercent;
      if(step%30===0){
        for(let i=0;i<COUNT;i++){assert.ok(Number.isFinite(s.depth[i])&&s.depth[i]>=0);assert.ok(Number.isFinite(s.fluxX[i])&&Number.isFinite(s.fluxZ[i]));}
        for(const car of s.vehicles){assert.ok(Number.isFinite(car.x+car.z+car.angle));assert.equal(s.terrain.collision(car.x,car.z),false);}
      }
    }
    results.push({height,...s.stats()});assert.equal(s.completed,true);assert.equal(s.running,false);assert.equal(s.time,120);
  }
  assert.ok(results[0].peakFloodedPercent<10);
  assert.ok(results[1].peakFloodedPercent>results[0].peakFloodedPercent+30);
  assert.ok(results[2].peakFloodedPercent>results[1].peakFloodedPercent+15);
  assert.equal(results[0].displacedVehicles,0);assert.ok(results[2].displacedVehicles>=10);
});
test('reset restores water, momentum, vehicles, peak, event state and deterministic replay',()=>{
  const s=new FloodSimulation(),initialDepth=s.depth.slice(),initialCars=structuredClone(s.vehicles);
  s.start(20);run(s,45);const expected=s.depth.slice(),cars=structuredClone(s.vehicles);assert.ok(s.peakFloodedPercent>0);
  s.reset();assert.deepEqual(s.depth,initialDepth);assert.deepEqual(s.vehicles,initialCars);assert.equal(s.time,0);assert.equal(s.peakFloodedPercent,0);assert.equal(s.completed,false);
  assert.ok(s.fluxX.every(v=>v===0));assert.ok(s.fluxZ.every(v=>v===0));assert.ok(s.velocityX.every(v=>v===0));
  s.start(20);run(s,45);assert.deepEqual(s.depth,expected);assert.deepEqual(s.vehicles,cars);
  s.start(1);assert.deepEqual(s.depth,initialDepth);assert.deepEqual(s.vehicles,initialCars);
});
function reservoir(open:boolean){
  const s=new FloodSimulation();s.terrain.elevation.fill(35);s.terrain.blocked.fill(0);s.depth.fill(0);s.time=50;s.running=true;
  for(let j=20;j<76;j++)for(let i=20;i<76;i++){
    const k=j*SIZE+i;s.terrain.elevation[k]=i===48?18:0;
    if(i<48)s.depth[k]=8;
  }
  if(open)for(let j=40;j<56;j++)s.terrain.elevation[j*SIZE+48]=0;
  return s;
}
test('a sealed ridge blocks an unreachable basin; a low opening admits and retains water',()=>{
  const closed=reservoir(false),open=reservoir(true);run(closed,35);run(open,35);
  const probe=48*SIZE+60;assert.equal(closed.depth[probe],0);assert.ok(open.depth[probe]>.5);
  assert.ok(open.depth[probe]>open.terrain.elevation[probe]);
});
test('finite-volume transfer conserves enclosed water including wet-dry fronts',()=>{
  const s=reservoir(true),sum=()=>s.depth.reduce((a,b)=>a+b,0)*CELL*CELL,initial=sum();run(s,40);
  assert.ok(Math.abs(sum()-initial)<initial*1e-10);
});
test('flood counters use actual current land cells and ignore permanent ocean',()=>{
  const s=new FloodSimulation();s.start(10);run(s,48);
  let wet=0,land=0;for(let i=0;i<COUNT;i++){if(s.terrain.land[i]){land++;if(s.depth[i]>.15)wet++;}}
  assert.equal(s.stats().floodedPercent,wet/land*100);
  const before=s.stats().floodedPercent;for(let i=0;i<COUNT;i++)if(!s.terrain.land[i])s.depth[i]=50;
  assert.equal(s.stats().floodedPercent,before);
});
test('invalid numerical inputs are rejected and completed events do not advance',()=>{
  const s=new FloodSimulation();assert.throws(()=>s.start(NaN));assert.throws(()=>s.start(Infinity));s.start(100);assert.equal(s.waveHeight,20);
  assert.throws(()=>s.step(1));assert.throws(()=>s.step(NaN));assert.throws(()=>s.step(-.1));run(s,120);const d=s.depth.slice();s.step();assert.deepEqual(s.depth,d);
});
