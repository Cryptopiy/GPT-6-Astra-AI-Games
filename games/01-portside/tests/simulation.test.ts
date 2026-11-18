import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../src/game/simulation.ts';
import { NO_INPUT, type InputFrame, type Point, type Vehicle } from '../src/game/types.ts';
import { angleDelta, boxIntersects, circleIntersectsBox, clamp, dist } from '../src/game/collision.ts';

function advance(sim: Simulation, seconds: number, input: Partial<InputFrame> = {}): void {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) sim.step(1 / 60, { ...NO_INPUT, ...input });
}

function collectCourier(sim: Simulation): Vehicle {
  advance(sim, 0.6, { forward: -1 });
  sim.interact();
  assert.equal(sim.state.mission.phase, 'collect');
  advance(sim, 0.65, { turn: -1 });
  sim.interact();
  assert.equal(sim.state.player.vehicleId, 'courier-01');
  assert.equal(sim.state.mission.phase, 'deliver');
  return sim.state.vehicles.find(v => v.id === 'courier-01')!;
}

/** The integration driver supplies controls only; it never assigns a pose or phase. */
function driveRoute(sim: Simulation, route: Point[], options: { maxSeconds?: number; cruising?: number; stopAtEnd?: boolean; until?: () => boolean } = {}): void {
  let waypoint = 0;
  for (let frame = 0; frame < (options.maxSeconds ?? 100) * 60; frame++) {
    const car = sim.getControlled() as Vehicle;
    const target = route[waypoint];
    const distance = dist(car, target);
    const cornerDistance = options.cruising ? 4 : 5;
    if (distance < cornerDistance && waypoint < route.length - 1) { waypoint++; continue; }
    const angle = angleDelta(car.yaw, Math.atan2(target.x - car.x, target.z - car.z));
    const finalApproach = options.stopAtEnd && waypoint === route.length - 1 && distance < 10;
    const goalSpeed = finalApproach ? Math.max(0, (distance - 2) * 0.8)
      : Math.abs(angle) > 0.6 ? options.cruising ? 4.8 : 5
      : distance < (options.cruising ? 18 : 14) ? 6 : options.cruising ?? 12;
    sim.step(1 / 60, {
      ...NO_INPUT, turn: clamp(-angle * 2, -1, 1),
      forward: car.speed < goalSpeed - 0.3 ? 1 : car.speed > goalSpeed + 0.4 ? -1 : 0,
      brake: !!options.stopAtEnd && waypoint === route.length - 1 && distance < 4,
    });
    if (options.until?.()) return;
  }
}

test('fresh physical delivery completes, records best, and safely replays', () => {
  const sim = new Simulation();
  const car = collectCourier(sim);
  driveRoute(sim, [{ x: 6, z: 1 }, { x: 79, z: 0 }, sim.world.destination], {
    stopAtEnd: true, maxSeconds: 40, until: () => sim.state.mission.phase === 'success',
  });
  assert.equal(sim.state.mission.phase, 'success');
  assert.equal(sim.state.collisions, 0);
  assert.equal(sim.state.police.wanted, 0);
  assert.ok(dist(car, sim.world.destination) < 7);
  assert.ok(Math.abs(car.speed) < 1.15);
  const best = sim.state.mission.best;
  assert.ok(best !== null && best > 10);
  const trafficBefore = sim.state.vehicles.filter(v => v.kind === 'traffic').map(v => ({ id: v.id, x: v.x, z: v.z }));
  sim.restartMission();
  assert.equal(sim.state.mission.phase, 'available');
  assert.equal(sim.state.mission.best, best);
  assert.equal(sim.state.player.vehicleId, null);
  assert.ok(!sim.state.vehicles.some(v => v.active && circleIntersectsBox(sim.state.player.x, sim.state.player.z, 0.48, v)));
  assert.deepEqual(sim.state.vehicles.filter(v => v.kind === 'traffic').map(v => ({ id: v.id, x: v.x, z: v.z })), trafficBefore);
  collectCourier(sim);
});

test('walking hits a real building footprint and can slide along its facade', () => {
  const sim = new Simulation();
  advance(sim, 16 / 5.2, { forward: 1 });
  advance(sim, 3, { turn: 1 });
  assert.ok(sim.state.player.x < 16.53);
  assert.ok(sim.state.player.x > 16.3);
  const previousZ = sim.state.player.z;
  advance(sim, 0.5, { turn: 1, forward: -1 });
  assert.ok(sim.state.player.z > previousZ + 1.5);
  assert.ok(!sim.world.buildings.some(solid => circleIntersectsBox(sim.state.player.x, sim.state.player.z, 0.48, solid)));
});

test('the on-foot player cannot walk through the solid courier car', () => {
  const sim = new Simulation();
  const car = sim.state.vehicles.find(v => v.id === 'courier-01')!;
  advance(sim, 4 / 5.2, { forward: -1 });
  advance(sim, 2, { turn: -1 });
  assert.ok(Math.abs(sim.state.player.z - 40) < 0.1);
  assert.ok(sim.state.player.x >= car.x + car.width / 2 + 0.48);
  assert.ok(sim.state.player.x < 7.8);
  assert.ok(!circleIntersectsBox(sim.state.player.x, sim.state.player.z, 0.48, car));
});

function isolatedCar(sim: Simulation, x: number, z: number, yaw: number): Vehicle {
  for (const v of sim.state.vehicles) v.active = false;
  sim.state.pedestrians = [];
  const car = sim.state.vehicles.find(v => v.id === 'courier-01')!;
  Object.assign(car, { x, z, yaw, speed: 0, active: true });
  Object.assign(sim.state.player, { x, z, yaw, vehicleId: car.id });
  return car;
}

test('a fast car impact stops against building geometry without penetration', () => {
  const sim = new Simulation();
  const car = isolatedCar(sim, 24, 8, 0);
  const facade = sim.world.buildings.find(s => s.x === 24 && s.z === 20)!;
  assert.ok(facade);
  advance(sim, 2, { forward: 1 });
  assert.ok(sim.state.collisions > 0);
  assert.ok(car.z < facade.z - facade.depth / 2 - car.depth / 2);
  assert.ok(Math.abs(car.speed) < 2);
  assert.ok(!boxIntersects(car, facade));
  car.speed = 29;
  sim.step(2, { ...NO_INPUT, forward: 1 });
  assert.ok(!boxIntersects(car, facade), 'a large frame cannot tunnel through the facade');
});

test('crashing into another solid vehicle causes heat and leaves both bodies separate', () => {
  const sim = new Simulation();
  const car = isolatedCar(sim, 0, 40, Math.PI);
  const obstacle = sim.state.vehicles.find(v => v.id === 'parked-coral')!;
  Object.assign(obstacle, { x: 0, z: 28, yaw: Math.PI, active: true });
  advance(sim, 1.8, { forward: 1 });
  assert.ok(sim.state.collisions > 0);
  assert.equal(sim.state.police.wanted, 1);
  assert.ok(!boxIntersects(car, obstacle));
  assert.equal(obstacle.z, 28);
});

test('traffic brakes for a parked blocker and resumes without teleporting once clear', () => {
  const sim = new Simulation();
  for (const v of sim.state.vehicles) v.active = false;
  sim.state.pedestrians = [];
  const traffic = sim.state.vehicles.find(v => v.id === 'traffic-0')!;
  traffic.active = true;
  const blocker = sim.state.vehicles.find(v => v.id === 'parked-coral')!;
  Object.assign(blocker, { x: 76, z: -30, yaw: 0, active: true });
  advance(sim, 4);
  assert.ok(traffic.z > -40 && traffic.z < -34.6);
  assert.ok(Math.abs(traffic.speed) < 0.5);
  assert.ok(!boxIntersects(traffic, blocker));
  const stopped = { x: traffic.x, z: traffic.z };
  blocker.active = false;
  for (let frame = 0; frame < 180; frame++) {
    const before = { x: traffic.x, z: traffic.z };
    sim.step(1 / 60, NO_INPUT);
    assert.ok(dist(traffic, before) < 0.2);
  }
  assert.ok(dist(traffic, stopped) > 10);
  assert.ok(traffic.speed > 6);
});

test('vehicle acceleration, inertia, speed-based steering, and safe repeat entry work', () => {
  const sim = new Simulation();
  const car = collectCourier(sim);
  const initialYaw = car.yaw;
  advance(sim, 0.25, { turn: 1 });
  assert.equal(car.yaw, initialYaw, 'a stopped car cannot rotate on the spot');
  advance(sim, 1.1, { forward: 1 });
  assert.ok(car.speed > 9);
  const previousSpeed = car.speed;
  const previousZ = car.z;
  advance(sim, 0.2);
  assert.ok(car.speed > 0 && car.speed < previousSpeed);
  assert.ok(car.z < previousZ - 1);
  sim.interact();
  assert.equal(sim.state.player.vehicleId, car.id, 'high-speed exit must be rejected');
  advance(sim, 1, { brake: true });
  assert.equal(car.speed, 0);
  for (let repeat = 0; repeat < 12; repeat++) {
    sim.interact();
    assert.equal(sim.state.player.vehicleId, null);
    assert.ok(!circleIntersectsBox(sim.state.player.x, sim.state.player.z, 0.48, car));
    sim.interact();
    assert.equal(sim.state.player.vehicleId, car.id);
  }
});

test('holding the interaction key triggers one action, and release re-arms it', () => {
  const sim = new Simulation();
  advance(sim, 0.6, { forward: -1 });
  advance(sim, 1, { interact: true });
  assert.equal(sim.state.mission.phase, 'collect');
  advance(sim, 0.65, { turn: -1, interact: true });
  assert.equal(sim.state.player.vehicleId, null);
  advance(sim, 1 / 60);
  advance(sim, 1 / 60, { interact: true });
  assert.equal(sim.state.player.vehicleId, 'courier-01');
});

test('on-foot restricted trespass activates, routes, and closes a real pursuit', () => {
  const sim = new Simulation();
  const route = [{ x: 13, z: -68.7 }, { x: -68.7, z: -68.7 }, { x: -68.7, z: -91.3 },
    { x: -91.3, z: -91.3 }, { x: -91.3, z: -110 }, sim.world.restricted];
  let waypoint = 0;
  let wantedAt = 0;
  let closest = Infinity;
  let priorUnits = new Map<string, Point>();
  for (let frame = 0; frame < 55 * 60; frame++) {
    const p = sim.state.player;
    const target = route[waypoint];
    const distance = dist(p, target);
    if (distance < 0.3 && waypoint < route.length - 1) waypoint++;
    sim.step(1 / 60, { ...NO_INPUT, sprint: true,
      turn: distance > 0.3 ? clamp(target.x - p.x, -1, 1) : 0,
      forward: distance > 0.3 ? clamp(p.z - target.z, -1, 1) : 0 });
    const units = sim.state.vehicles.filter(v => v.kind === 'police' && v.active);
    for (const unit of units) {
      const previous = priorUnits.get(unit.id);
      if (previous) assert.ok(dist(previous, unit) < 0.4, 'active pursuit units must never teleport');
    }
    priorUnits = new Map(units.map(v => [v.id, { x: v.x, z: v.z }]));
    if (sim.state.police.wanted && !wantedAt) wantedAt = sim.state.time;
    if (wantedAt) {
      closest = Math.min(closest, ...units.map(v => dist(v, p)));
      if (!sim.state.police.wanted) break;
    }
  }
  assert.ok(wantedAt > 20, 'the player must physically reach the restricted depot');
  assert.ok(closest < 4, 'patrols must actually reach the player');
  assert.equal(sim.state.police.wanted, 0);
  assert.ok(sim.state.message.startsWith('Stopped by the patrol'));
  assert.equal(sim.state.player.vehicleId, null);
});

test('driving trespass pursues a moving car, and physical evasion clears wanted after hiding', () => {
  const sim = new Simulation();
  collectCourier(sim);
  let wantedAt = 0;
  let initialUnits: Point[] = [];
  let movedUnits = false;
  driveRoute(sim, [
    { x: 6, z: -80 }, { x: -80, z: -80 }, { x: -80, z: -125 }, { x: -100, z: -125 },
    { x: -100, z: -110 }, { x: -85, z: -110 }, { x: -84, z: 80 }, { x: 0, z: 84 },
    { x: 0, z: -120 }, { x: 80, z: -120 }, { x: 80, z: 80 },
  ], { maxSeconds: 100, cruising: 25, until: () => {
    const units = sim.state.vehicles.filter(v => v.kind === 'police' && v.active);
    if (sim.state.police.wanted && !wantedAt) {
      wantedAt = sim.state.time;
      initialUnits = units.map(v => ({ x: v.x, z: v.z }));
    }
    if (wantedAt && units.some((v, i) => initialUnits[i] && dist(v, initialUnits[i]) > 20)) movedUnits = true;
    return wantedAt > 0 && sim.state.police.wanted === 0;
  } });
  assert.ok(wantedAt > 10);
  assert.ok(movedUnits, 'patrols must continue moving while the target drives');
  assert.ok(sim.state.time - wantedAt > 12);
  assert.equal(sim.state.police.wanted, 0);
  assert.equal(sim.state.mission.phase, 'deliver', 'escaping must preserve the active delivery');
  assert.equal(sim.state.message, 'You lost the patrol. Heat cleared.');
  sim.interact();
  assert.equal(sim.state.player.vehicleId, null, 'the world remains playable after escape');
});

test('two-minute city soak keeps NPCs active, finite, and separated from solids and player', () => {
  const sim = new Simulation();
  const starts = new Map(sim.state.vehicles.map(v => [v.id, { x: v.x, z: v.z }]));
  const pedestrianStarts = new Map(sim.state.pedestrians.map(p => [p.id, { x: p.x, z: p.z }]));
  for (let frame = 0; frame < 120 * 60; frame++) {
    sim.step(1 / 60, NO_INPUT);
    if (frame % 15 !== 0) continue;
    const active = sim.state.vehicles.filter(v => v.active);
    for (let index = 0; index < active.length; index++) {
      const v = active[index];
      assert.ok([v.x, v.z, v.yaw, v.speed].every(Number.isFinite));
      assert.ok(![...sim.world.buildings, ...sim.world.obstacles].some(s => boxIntersects(v, s)));
      assert.ok(!circleIntersectsBox(sim.state.player.x, sim.state.player.z, 0.48, v));
      for (const other of active.slice(index + 1)) assert.ok(!boxIntersects(v, other), `${v.id} overlaps ${other.id}`);
    }
    for (const p of sim.state.pedestrians) assert.ok([p.x, p.z, p.yaw].every(Number.isFinite));
  }
  const traffic = sim.state.vehicles.filter(v => v.kind === 'traffic');
  assert.equal(traffic.length, 8);
  assert.ok(traffic.every(v => Math.abs(v.speed) > 2 && dist(v, starts.get(v.id)!) > 10));
  assert.ok(sim.state.pedestrians.filter(p => dist(p, pedestrianStarts.get(p.id)!) > 5).length >= 16);
});

test('one continuous session delivers, trespasses, faces pursuit, exits, walks, and restarts', () => {
  const sim = new Simulation();
  collectCourier(sim);
  driveRoute(sim, [{ x: 6, z: 1 }, { x: 79, z: 0 }, sim.world.destination], {
    stopAtEnd: true, maxSeconds: 40, until: () => sim.state.mission.phase === 'success',
  });
  assert.equal(sim.state.mission.phase, 'success');
  const best = sim.state.mission.best;
  let wantedAt = 0;
  driveRoute(sim, [
    { x: 80, z: -80 }, { x: -80, z: -80 }, { x: -80, z: -125 }, { x: -100, z: -125 },
    { x: -100, z: -110 }, { x: -85, z: -110 }, { x: -84, z: 80 }, { x: 0, z: 84 },
    { x: 0, z: -120 }, { x: 80, z: -120 }, { x: 80, z: 80 },
  ], { maxSeconds: 100, cruising: 25, until: () => {
    if (sim.state.police.wanted && !wantedAt) wantedAt = sim.state.time;
    return wantedAt > 0 && sim.state.police.wanted === 0;
  } });
  assert.ok(wantedAt > 30);
  assert.ok(sim.state.vehicles.some(v => v.kind === 'police' && v.active));
  assert.equal(sim.state.police.wanted, 0);
  assert.equal(sim.state.mission.phase, 'success', 'a completed delivery stays completed');
  advance(sim, 2, { brake: true });
  sim.interact();
  assert.equal(sim.state.player.vehicleId, null);
  const exit = { ...sim.state.player };
  advance(sim, 0.4, { turn: -1 });
  assert.ok(dist(exit, sim.state.player) > 1, 'walking remains functional after the pursuit');
  sim.restartMission();
  assert.equal(sim.state.mission.phase, 'available');
  assert.equal(sim.state.mission.best, best);
  collectCourier(sim);
});

test('long frame and non-finite input cannot tunnel through the city or poison state', () => {
  const sim = new Simulation();
  const initial = { ...sim.state.player };
  sim.step(Number.NaN, NO_INPUT);
  sim.step(Infinity, NO_INPUT);
  sim.step(-1, NO_INPUT);
  assert.deepEqual(sim.state.player, initial);
  sim.step(60, { ...NO_INPUT, forward: 1, sprint: true });
  assert.ok(dist(sim.state.player, initial) <= 0.81, 'a stalled frame is limited to 100 ms');
  sim.step(1 / 60, { ...NO_INPUT, forward: Number.NaN, turn: Infinity });
  assert.ok([sim.state.player.x, sim.state.player.z, sim.state.player.yaw].every(Number.isFinite));
});
