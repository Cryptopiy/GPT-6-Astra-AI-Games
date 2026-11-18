import test from 'node:test';
import assert from 'node:assert/strict';
import { CrashSimulation, damageZone } from '../src/physics/CrashSimulation';
import { DEFAULT_CONFIG, FIXED_DT, IMPACT_DURATION, OBSTACLES } from '../src/physics/obstacles';
import type { Configuration, ObstacleType, RunResult } from '../src/physics/types';

function experiment(patch: Partial<Configuration> = {}, simulation = new CrashSimulation()): RunResult {
  simulation.run({ ...DEFAULT_CONFIG, ...patch });
  for (let i = 0; i < 10000 && simulation.phase !== 'complete'; i++) simulation.step();
  assert.ok(simulation.result, 'The actual simulation must contact a barrier and produce a final result');
  assert.ok(simulation.isFinite());
  return simulation.result;
}
test('real head-on collision changes velocity and returns an impulse-based estimate', () => {
  const r = experiment();
  assert.equal(r.impact.zone, 'front');
  assert.ok(r.impact.speed > 79 && r.impact.speed < 81);
  assert.ok(r.impact.impulse > 20000 && r.impact.impulse < 60000);
  assert.equal(r.impact.force, r.impact.impulse / IMPACT_DURATION);
  assert.ok(r.finalSpeed < 1); assert.ok(r.settled);
  assert.ok(r.finalPosition.x < -2); assert.ok(Math.abs(r.finalPosition.z) < 1);
  assert.equal(r.obstacleDisplacement, 0);
});
test('doubling speed produces substantially greater force and damage', () => {
  const low = experiment({ speed: 40 }), high = experiment({ speed: 80 });
  assert.ok(high.impact.force > low.impact.force * 1.7);
  assert.ok(high.impact.damage > low.impact.damage + 25);
  assert.ok(Math.abs(high.impact.energy / low.impact.energy - 4) < 0.05);
});
test('greater vehicle mass increases impact impulse and severity', () => {
  const low = experiment({ speed: 50, mass: 700 }), high = experiment({ speed: 50, mass: 3000 });
  assert.ok(high.impact.force > low.impact.force * 3);
  assert.ok(high.impact.energy > low.impact.energy * 4);
  assert.ok(high.impact.damage > low.impact.damage);
});
test('barriers have materially different displacement and outcomes', () => {
  const concrete = experiment(), steel = experiment({ obstacle: 'steel' }), light = experiment({ obstacle: 'light' });
  assert.equal(concrete.obstacleDisplacement, 0);
  assert.ok(steel.obstacleDisplacement > 0.15);
  assert.ok(light.obstacleDisplacement > steel.obstacleDisplacement + 1);
  assert.ok(concrete.impact.force > light.impact.force * 2);
  assert.ok(concrete.impact.damage > light.impact.damage + 40);
});
test('geometry changes normal energy, damage zone, yaw and resting path', () => {
  const straight = experiment(), right = experiment({ angle: 60 }), left = experiment({ angle: -60 });
  assert.ok(right.impact.energy < straight.impact.energy * 0.5);
  assert.equal(right.impact.zone, 'right'); assert.equal(left.impact.zone, 'left');
  assert.ok(Math.abs(right.finalPosition.z) > 1);
  assert.ok(Math.abs(right.rotation.y) > 5);
  assert.ok(Math.abs(right.finalPosition.z + left.finalPosition.z) < 0.7);
});
test('identical input replays deterministically, including after previous crashes', () => {
  const sim = new CrashSimulation();
  const a = experiment({ speed: 110, angle: 35, obstacle: 'steel' }, sim);
  experiment({ speed: 200, obstacle: 'light' }, sim);
  const b = experiment({ speed: 110, angle: 35, obstacle: 'steel' }, sim);
  assert.deepEqual(a.impact, b.impact); assert.deepEqual(a.finalPosition, b.finalPosition); assert.deepEqual(a.rotation, b.rotation);
  assert.equal(b.id, a.id + 2);
});
test('reset clears contact state, debris, traces and velocities mid-crash', () => {
  const sim = new CrashSimulation(); sim.run();
  for (let i = 0; i < 500 && !sim.impact; i++) sim.step();
  assert.ok(sim.impact); assert.ok(sim.debris.length >= 3);
  sim.reset({ ...DEFAULT_CONFIG, speed: 30, angle: -45 });
  assert.equal(sim.phase, 'ready'); assert.equal(sim.impact, null); assert.equal(sim.result, null);
  assert.equal(sim.elapsed, 0); assert.equal(sim.debris.length, 0); assert.equal(sim.trace.length, 0);
  assert.equal(sim.car.velocity.length(), 0); assert.equal(sim.world.bodies.length, 3);
  assert.ok(sim.car.position.z < -10);
  const r = experiment({}, sim); assert.ok(r.impact.force > 0);
});
test('fixed step produces the same state at 30, 60 and 144 render frames per second', () => {
  const states = [30, 60, 144].map(fps => { const sim = new CrashSimulation(); sim.run({ ...DEFAULT_CONFIG, angle: 35 }); for (let i = 0; i < fps * 4; i++) sim.advance(1 / fps); return sim.snapshot(); });
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[0], states[2]);
});
test('ready state remains unchanged and invalid input fails before mutation', () => {
  const sim = new CrashSimulation(); const initial = sim.snapshot(); sim.advance(10); sim.step(); assert.deepEqual(sim.snapshot(), initial);
  for (const patch of [{ speed: NaN }, { speed: Infinity }, { mass: 0 }, { angle: 61 }, { obstacle: 'unknown' as ObstacleType }]) { assert.throws(() => sim.run({ ...DEFAULT_CONFIG, ...patch })); assert.deepEqual(sim.snapshot(), initial); }
  sim.run(); const before = sim.snapshot(); sim.advance(NaN); sim.advance(-1); assert.deepEqual(sim.snapshot(), before);
});
test('zone mapping covers all four directions and corners', () => {
  assert.equal(damageZone({ x: 1, y: 0, z: 0 }), 'front'); assert.equal(damageZone({ x: -1, y: 0, z: 0 }), 'rear');
  assert.equal(damageZone({ x: 0.5, y: 0.1, z: -0.86 }), 'left'); assert.equal(damageZone({ x: 0.5, y: 0.1, z: 0.86 }), 'right');
});
for (const obstacle of Object.keys(OBSTACLES) as ObstacleType[]) for (const speed of [10, 200]) for (const mass of [700, 3000]) for (const angle of [-60, 0, 60]) {
  test(`finite contact without tunneling: ${obstacle}, ${speed} km/h, ${mass} kg, ${angle}°`, () => {
    const r = experiment({ obstacle, speed, mass, angle });
    assert.ok(r.impact.force > 0); assert.ok(r.impact.damage >= 0 && r.impact.damage <= 100);
    assert.ok(r.impact.time < 20); assert.ok(r.elapsed <= r.impact.time + 14 + FIXED_DT);
    assert.ok(r.trace.every(p => [p.time, p.speed, p.force].every(Number.isFinite)));
    // A glancing car can legitimately slide around the finite wall's end.
    if (obstacle === 'concrete' && angle === 0) assert.ok(r.finalPosition.x < -2, 'A head-on car cannot tunnel through the static wall');
    if (obstacle === 'concrete') assert.ok(Math.abs(r.impact.point.x + 0.7) < 0.25, 'First contact must occur at the physical wall face');
  });
}
test('launch remains level, at ground height and at selected speed up to first contact', () => {
  for (const speed of [10, 80, 120, 200]) for (const angle of [-60, 0, 60]) {
    const sim = new CrashSimulation(); sim.run({ ...DEFAULT_CONFIG, speed, angle });
    for (let i = 0; i < 5000 && !sim.impact; i++) {
      assert.ok(sim.car.position.y > 0.61 && sim.car.position.y < 0.64);
      assert.ok(Math.abs(sim.car.quaternion.x) < 0.001 && Math.abs(sim.car.quaternion.z) < 0.001);
      sim.step();
    }
    assert.ok(sim.impact); assert.ok(Math.abs(sim.impact.speed - speed) < 0.01);
    if (angle === 0) assert.equal(sim.impact.zone, 'front');
  }
});
test('light barrier allows substantial continued vehicle motion after impact', () => {
  const r = experiment({ obstacle: 'light' });
  assert.ok(r.finalPosition.x > 15, 'An almost unimpeded car must continue moving, not stop in one frame');
});
test('vertical contact classification uses local point instead of numeric noise', () => {
  assert.equal(damageZone({ x: 1e-17, y: -1, z: -1e-11 }, { x: 2, y: -0.6, z: 0.1 }), 'front');
  assert.equal(damageZone({ x: 1e-17, y: 1, z: -1e-11 }, { x: 0.1, y: 0.6, z: 0.9 }), 'right');
});
