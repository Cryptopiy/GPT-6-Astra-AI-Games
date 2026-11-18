import { angleDelta, boxIntersects, circleIntersectsBox, clamp, dist } from './collision';
import { createPedestrians, createVehicles, MISSION_CAR_ID, routeToTarget, steerToward } from './ai';
import type { GameState, InputFrame, Pedestrian, Point, SimulationApi, Vehicle, World } from './types';
import { createWorld } from './world';

const FOOT_RADIUS = 0.48;
const FIXED_STEP = 1 / 90;
const SPAWN = { x: 13, z: 36 };
const TAU = Math.PI * 2;

/** Deterministic ground-plane dynamics for vertically extruded 3D colliders. */
export class Simulation implements SimulationApi {
  world: World = createWorld();
  state: GameState = {
    time: 0, player: { ...SPAWN, yaw: Math.PI, vehicleId: null, moving: false },
    vehicles: createVehicles(), pedestrians: createPedestrians(),
    mission: { phase: 'available', elapsed: 0, best: null, deliveryHold: 0 },
    police: { wanted: 0, escape: 0, caught: 0, cooldown: 0 },
    message: 'A delivery is waiting at the amber beacon. Walk over and press E.', messageUntil: 8, collisions: 0,
  };
  private collisionCooldown = 0;
  private policeRouteTimer = 0;
  private pedestrianHitCooldown = 0;
  private lastInteract = false;
  private lastRestart = false;

  getControlled(): Point & { yaw: number } { return this.controlledCar() ?? this.state.player; }

  private controlledCar(): Vehicle | undefined {
    return this.state.vehicles.find(v => v.id === this.state.player.vehicleId);
  }

  private message(text: string, seconds = 4): void {
    this.state.message = text;
    this.state.messageUntil = this.state.time + seconds;
  }

  step(dt: number, input: InputFrame): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (input.restart && !this.lastRestart) this.restartMission();
    if (input.interact && !this.lastInteract) this.interact();
    this.lastRestart = input.restart;
    this.lastInteract = input.interact;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-7) {
      const tick = Math.min(FIXED_STEP, remaining);
      this.tick(tick, input);
      remaining -= tick;
    }
  }

  private tick(dt: number, input: InputFrame): void {
    const s = this.state;
    s.time += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.pedestrianHitCooldown = Math.max(0, this.pedestrianHitCooldown - dt);
    s.police.cooldown = Math.max(0, s.police.cooldown - dt);
    const car = this.controlledCar();
    if (car) this.updateDriving(car, dt, input); else this.updateWalking(dt, input);
    this.updatePedestrians(dt);
    this.updateTraffic(dt);
    this.updatePolice(dt);
    this.updateMission(dt);
  }

  private footBlocked(x: number, z: number, ignoreVehicle?: string, radius = FOOT_RADIUS): boolean {
    if (Math.abs(x) + radius > this.world.size / 2 - 1 || Math.abs(z) + radius > this.world.size / 2 - 1) return true;
    for (const solid of [...this.world.buildings, ...this.world.obstacles]) {
      if (circleIntersectsBox(x, z, radius, solid)) return true;
    }
    return this.state.vehicles.some(v => v.active && v.id !== ignoreVehicle && circleIntersectsBox(x, z, radius, v));
  }

  private vehicleBlock(car: Vehicle, x: number, z: number, yaw: number, includePlayer = true): string | null {
    const test = { x, z, yaw, width: car.width, depth: car.depth };
    // The circumscribed radius keeps every corner inside the actual world.
    const extentX = Math.abs(Math.cos(yaw)) * car.width / 2 + Math.abs(Math.sin(yaw)) * car.depth / 2;
    const extentZ = Math.abs(Math.sin(yaw)) * car.width / 2 + Math.abs(Math.cos(yaw)) * car.depth / 2;
    if (Math.abs(x) + extentX > this.world.size / 2 - 1 || Math.abs(z) + extentZ > this.world.size / 2 - 1) return 'boundary';
    for (const solid of [...this.world.buildings, ...this.world.obstacles]) if (boxIntersects(test, solid, 0.035)) return solid.id;
    for (const other of this.state.vehicles) {
      if (other.active && other.id !== car.id && boxIntersects(test, other, 0.035)) return other.id;
    }
    if (includePlayer && !this.state.player.vehicleId && circleIntersectsBox(this.state.player.x, this.state.player.z, FOOT_RADIUS + 0.15, test)) return 'player';
    return null;
  }

  private updateWalking(dt: number, input: InputFrame): void {
    const p = this.state.player;
    const dx = Number.isFinite(input.turn) ? clamp(input.turn, -1, 1) : 0;
    const dz = Number.isFinite(input.forward) ? -clamp(input.forward, -1, 1) : 0;
    const length = Math.hypot(dx, dz);
    p.moving = length > 0;
    if (!length) return;
    const speed = input.sprint ? 8 : 5.2;
    const moveX = dx / length * speed * dt;
    const moveZ = dz / length * speed * dt;
    p.yaw += angleDelta(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 16);
    if (!this.footBlocked(p.x + moveX, p.z)) p.x += moveX;
    if (!this.footBlocked(p.x, p.z + moveZ)) p.z += moveZ;
  }

  private updateDriving(car: Vehicle, dt: number, input: InputFrame): void {
    const throttle = Number.isFinite(input.forward) ? clamp(input.forward, -1, 1) : 0;
    const turn = Number.isFinite(input.turn) ? clamp(input.turn, -1, 1) : 0;
    if (input.brake) {
      car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - 20 * dt);
    } else if (throttle) {
      const braking = Math.sign(throttle) !== Math.sign(car.speed) && Math.abs(car.speed) > 0.4;
      car.speed += throttle * (braking ? 17 : throttle > 0 ? 10.2 : 6.4) * dt;
    }
    car.speed *= Math.exp(-(throttle && !input.brake ? 0.11 : 0.56) * dt);
    if (Math.abs(car.speed) < 0.018) car.speed = 0;
    car.speed = clamp(car.speed, -10, 29);
    car.steer += (-turn * 0.58 - car.steer) * Math.min(1, 7 * dt);
    const speedTurn = car.speed / (1 + Math.abs(car.speed) * 0.07);
    let yaw = car.yaw + Math.tan(car.steer) * speedTurn / 3.05 * dt;
    let x = car.x + Math.sin(yaw) * car.speed * dt;
    let z = car.z + Math.cos(yaw) * car.speed * dt;
    let blocked = this.vehicleBlock(car, x, z, yaw, false);
    // When steering sweeps the rear corner into a neighbour, retain the heading
    // and allow a clear forward/reverse translation so touching cars can separate.
    if (blocked) {
      const straightX = car.x + Math.sin(car.yaw) * car.speed * dt;
      const straightZ = car.z + Math.cos(car.yaw) * car.speed * dt;
      if (!this.vehicleBlock(car, straightX, straightZ, car.yaw, false)) {
        x = straightX; z = straightZ; yaw = car.yaw; blocked = null;
      }
    }
    if (blocked) {
      const impact = Math.abs(car.speed);
      if (this.collisionCooldown <= 0 && impact > 1.5) {
        this.state.collisions++;
        this.collisionCooldown = 0.55;
        const other = this.state.vehicles.find(v => v.id === blocked);
        if (other && (impact > 7 || other.kind === 'police')) this.raiseWanted('Vehicle collision reported. Lose the patrol to clear your heat.');
        else if (impact > 5) this.message('Collision! Brake early and give solid objects room.', 2.2);
      }
      car.speed = impact > 3 ? -Math.sign(car.speed) * Math.min(1.3, impact * 0.09) : 0;
    } else {
      car.x = x; car.z = z; car.yaw = yaw % TAU;
    }
    const p = this.state.player;
    p.x = car.x; p.z = car.z; p.yaw = car.yaw; p.moving = Math.abs(car.speed) > 0.1;
    if (Math.abs(car.speed) > 3 && this.pedestrianHitCooldown <= 0) {
      for (const pedestrian of this.state.pedestrians) {
        if (circleIntersectsBox(pedestrian.x, pedestrian.z, 0.55, car)) {
          car.speed *= 0.2;
          pedestrian.state = 'fleeing'; pedestrian.timer = 3;
          this.pedestrianHitCooldown = 2;
          this.raiseWanted('Pedestrian collision reported. Police are responding.');
          break;
        }
      }
    }
  }

  private updateTraffic(dt: number): void {
    for (const car of this.state.vehicles) {
      if (!car.active || car.id === this.state.player.vehicleId || car.kind !== 'traffic') continue;
      this.followRoute(car, dt, 8 + Number(car.id.slice(-1)) % 3);
    }
    // Cars retain momentum after a slow exit and settle naturally.
    for (const car of this.state.vehicles) {
      if (!car.active || car.id === this.state.player.vehicleId || !['parked', 'mission'].includes(car.kind) || Math.abs(car.speed) < 0.01) continue;
      car.speed *= Math.exp(-4 * dt);
      const x = car.x + Math.sin(car.yaw) * car.speed * dt;
      const z = car.z + Math.cos(car.yaw) * car.speed * dt;
      if (this.vehicleBlock(car, x, z, car.yaw)) car.speed = 0; else { car.x = x; car.z = z; }
    }
  }

  private followRoute(car: Vehicle, dt: number, speed: number, loop = true): void {
    if (!car.route.length) { car.speed = 0; return; }
    let target = car.route[car.waypoint];
    if (dist(car, target) < 3.1) {
      if (car.waypoint + 1 < car.route.length) car.waypoint++;
      else if (loop) car.waypoint = 0;
      else { car.speed = Math.max(0, car.speed - dt * 14); return; }
      target = car.route[car.waypoint];
    }
    const oldYaw = car.yaw;
    steerToward(car, target, dt, speed);
    const x = car.x + Math.sin(car.yaw) * car.speed * dt;
    const z = car.z + Math.cos(car.yaw) * car.speed * dt;
    const danger = this.state.pedestrians.some(p => circleIntersectsBox(p.x, p.z, 0.55, { x, z, width: car.width, depth: car.depth + 0.6, yaw: car.yaw }));
    const blocked = danger ? 'pedestrian' : this.vehicleBlock(car, x, z, car.yaw);
    if (!blocked) { car.x = x; car.z = z; car.blocked = Math.max(0, car.blocked - dt * 2); }
    else {
      car.yaw = oldYaw;
      car.speed = 0;
      car.blocked += dt;
      // A short, collision-tested backoff gives turning cars room at junctions.
      if (car.blocked > 2.5 && car.blocked < 3.7 && blocked !== 'player' && blocked !== 'pedestrian') {
        const bx = car.x - Math.sin(car.yaw) * 1.7 * dt;
        const bz = car.z - Math.cos(car.yaw) * 1.7 * dt;
        if (!this.vehicleBlock(car, bx, bz, car.yaw)) { car.x = bx; car.z = bz; }
      }
      if (car.blocked > 5) car.blocked = 1;
    }
  }

  private updatePedestrians(dt: number): void {
    for (const p of this.state.pedestrians) {
      p.phase += dt * (p.state === 'fleeing' ? 13 : 6);
      const danger = this.state.vehicles.find(v => v.active && Math.abs(v.speed) > 4 && dist(v, p) < 7);
      if (danger) { p.state = 'fleeing'; p.timer = 1.2; }
      if (p.state === 'waiting') {
        p.timer -= dt;
        if (p.timer <= 0) p.state = 'walking';
        continue;
      }
      let target = p.route[p.waypoint];
      if (p.state === 'fleeing') {
        p.timer -= dt;
        if (danger) {
          const awayX = p.x - danger.x; const awayZ = p.z - danger.z;
          target = { x: p.x + awayX, z: p.z + awayZ };
        }
        if (p.timer <= 0) p.state = 'walking';
      } else if (dist(p, target) < 0.55) {
        p.waypoint = (p.waypoint + 1) % p.route.length;
        p.state = 'waiting'; p.timer = 0.35 + (Number(p.id.slice(4)) % 5) * 0.21;
        continue;
      }
      const dx = target.x - p.x; const dz = target.z - p.z;
      const len = Math.hypot(dx, dz);
      if (!len) continue;
      const speed = p.speed * (p.state === 'fleeing' ? 2.15 : 1);
      const x = p.x + dx / len * speed * dt; const z = p.z + dz / len * speed * dt;
      const blockedByPedestrian = this.state.pedestrians.some(other => other !== p && dist({ x, z }, other) < 0.76);
      if (!blockedByPedestrian && !this.footBlocked(x, z, undefined, 0.36)) {
        p.x = x; p.z = z; p.yaw += angleDelta(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
      } else {
        this.redirectPedestrian(p);
      }
    }
  }

  private redirectPedestrian(p: Pedestrian): void {
    // Reverse along a known sidewalk segment rather than crossing a building.
    p.route = [...p.route].reverse();
    p.waypoint = (p.route.length - p.waypoint) % p.route.length;
    p.state = 'waiting'; p.timer = 0.45 + (Number(p.id.slice(4)) % 7) * 0.17;
  }

  private raiseWanted(reason: string): void {
    if (this.state.police.cooldown > 0) return;
    const fresh = this.state.police.wanted === 0;
    this.state.police.wanted = 1;
    this.state.police.escape = 0;
    if (!fresh) return;
    this.message(reason, 5);
    this.policeRouteTimer = 0;
    const target = this.getControlled();
    for (const police of this.state.vehicles.filter(v => v.kind === 'police' && !v.active)) {
      const candidates = this.world.roads.flatMap(road => [-122, -95, -45, 35, 100, 122].flatMap(t => [{ x: road, z: t }, { x: t, z: road }]));
      candidates.sort((a, b) => Math.abs(dist(a, target) - 55) - Math.abs(dist(b, target) - 55));
      const spot = candidates.find(point => dist(point, target) > 34 && !this.vehicleBlock(police, point.x, point.z, Math.PI));
      if (spot) {
        police.x = spot.x; police.z = spot.z; police.yaw = Math.PI; police.speed = 0;
        police.active = true; police.route = []; police.waypoint = 0;
      }
    }
  }

  private lineClear(from: Point, to: Point): boolean {
    const length = dist(from, to);
    const n = Math.ceil(length / 1.8);
    for (let i = 1; i < n; i++) {
      const x = from.x + (to.x - from.x) * i / n; const z = from.z + (to.z - from.z) * i / n;
      if ([...this.world.buildings, ...this.world.obstacles].some(s => circleIntersectsBox(x, z, 1.25, s))) return false;
    }
    return true;
  }

  private updatePolice(dt: number): void {
    const s = this.state;
    const target = this.getControlled();
    if (dist(target, this.world.restricted) < this.world.restricted.radius && s.police.cooldown <= 0) this.raiseWanted('Restricted depot! Patrols are closing in.');
    const policeCars = s.vehicles.filter(v => v.kind === 'police' && v.active && v.id !== s.player.vehicleId);
    this.policeRouteTimer -= dt;
    let nearest = Infinity;
    let spotted = false;
    for (const police of policeCars) {
      const distance = dist(police, target);
      nearest = Math.min(nearest, distance);
      const canSee = distance < 62 && this.lineClear(police, target);
      spotted ||= canSee;
      if (s.police.wanted) {
        if (this.policeRouteTimer <= 0) {
          police.route = distance < 34 && canSee ? [{ x: target.x, z: target.z }] : routeToTarget(police, target, this.world);
          if (canSee && police.route.length === 0) police.route = [{ x: target.x, z: target.z }];
          police.waypoint = 0;
        }
        this.followRoute(police, dt, s.player.vehicleId ? 17.2 : 12.2, false);
      } else {
        if (!police.route.length || police.waypoint >= police.route.length - 1 && dist(police, police.route[police.waypoint]) < 4) {
          const destination = { x: this.world.roads[(Number(police.id.slice(-1)) + Math.floor(s.time / 20)) % 3], z: s.time % 40 < 20 ? -115 : 115 };
          police.route = routeToTarget(police, destination, this.world); police.waypoint = 0;
        }
        this.followRoute(police, dt, 6.5, false);
      }
    }
    if (this.policeRouteTimer <= 0) this.policeRouteTimer = 0.75;
    if (!s.police.wanted) return;
    const controlledSpeed = Math.abs(this.controlledCar()?.speed ?? 0);
    if (nearest < (s.player.vehicleId ? 5.4 : 4) && controlledSpeed < 4) s.police.caught += dt;
    else s.police.caught = Math.max(0, s.police.caught - dt * 1.5);
    if (s.police.caught >= 3) {
      s.police.wanted = 0; s.police.caught = 0; s.police.escape = 0; s.police.cooldown = 8;
      if (this.controlledCar()) this.controlledCar()!.speed = 0;
      if (s.mission.phase === 'collect' || s.mission.phase === 'deliver') {
        s.mission.phase = 'failed';
        this.message('Stopped by the patrol. Press R to retry the delivery.', 7);
      } else this.message('Stopped by the patrol. Heat cleared — you can keep exploring.', 7);
    } else {
      if (nearest > 72 || !spotted && nearest > 23) s.police.escape += dt;
      else s.police.escape = Math.max(0, s.police.escape - dt * 0.55);
      if (s.police.escape >= 12) {
        s.police.wanted = 0; s.police.escape = 0; s.police.caught = 0; s.police.cooldown = 5;
        this.message('You lost the patrol. Heat cleared.', 4);
      }
    }
  }

  private updateMission(dt: number): void {
    const m = this.state.mission;
    if (m.phase === 'collect' || m.phase === 'deliver') m.elapsed += dt;
    if (m.phase !== 'deliver') return;
    const car = this.controlledCar();
    if (car?.id === MISSION_CAR_ID && dist(car, this.world.destination) < 7 && Math.abs(car.speed) < 1.15 && !this.state.police.wanted) {
      m.deliveryHold += dt;
      if (m.deliveryHold >= 1.25) {
        m.phase = 'success';
        m.best = m.best === null ? m.elapsed : Math.min(m.best, m.elapsed);
        this.message('Delivery complete. Portside thanks you! Press R to replay.', 8);
      }
    } else m.deliveryHold = 0;
  }

  private nearbyVehicle(): Vehicle | undefined {
    const p = this.state.player;
    return this.state.vehicles.filter(v => v.active && v.kind !== 'police' && Math.abs(v.speed) < 1.5 && dist(p, v) < 4.5)
      .sort((a, b) => dist(a, p) - dist(b, p))[0];
  }

  interact(): void {
    const s = this.state;
    const controlled = this.controlledCar();
    if (controlled) {
      if (Math.abs(controlled.speed) > 1.8) { this.message('Slow down to exit safely.', 2); return; }
      const forward = { x: Math.sin(controlled.yaw), z: Math.cos(controlled.yaw) };
      const right = { x: Math.cos(controlled.yaw), z: -Math.sin(controlled.yaw) };
      const exits = [1, -1].flatMap(side => [0, 1.5, -1.5].map(offset => ({ x: controlled.x + right.x * side * 2.05 + forward.x * offset, z: controlled.z + right.z * side * 2.05 + forward.z * offset })));
      exits.push({ x: controlled.x - forward.x * 3.1, z: controlled.z - forward.z * 3.1 });
      const exit = exits.find(point => !this.footBlocked(point.x, point.z));
      if (!exit) { this.message('Both doors are blocked. Move to an open space.', 3); return; }
      s.player.vehicleId = null; s.player.x = exit.x; s.player.z = exit.z;
      s.player.yaw = controlled.yaw; s.player.moving = false;
      controlled.speed = 0;
      this.message('On foot. Your car stays where you parked it.', 2.5);
      return;
    }
    if (s.mission.phase === 'available' && dist(s.player, this.world.pickup) < 4) {
      s.mission.phase = 'collect'; s.mission.elapsed = 0;
      this.message('Portside Express started. Enter the amber courier car.', 5);
      return;
    }
    const car = this.nearbyVehicle();
    if (!car) return;
    s.player.vehicleId = car.id; s.player.x = car.x; s.player.z = car.z; s.player.yaw = car.yaw; car.steer = 0;
    if (car.kind === 'traffic') {
      // A stopped traffic car becomes a persistent, freely usable parked car.
      car.kind = 'parked'; car.route = []; car.speed = 0;
    }
    if (car.id === MISSION_CAR_ID && s.mission.phase === 'collect') {
      s.mission.phase = 'deliver';
      this.message('Drive to the waterfront depot. Stop in the mint delivery zone.', 5);
    } else this.message('W accelerates · S brakes / reverses · Space handbrake · E exits when slow', 4);
  }

  restartMission(): void {
    const s = this.state;
    const missionCar = s.vehicles.find(v => v.id === MISSION_CAR_ID)!;
    // R is an explicit reset. Only reset-owned entities move; live traffic keeps running.
    s.player.vehicleId = null;
    for (const police of s.vehicles.filter(v => v.kind === 'police')) {
      police.active = false; police.speed = 0; police.route = []; police.waypoint = 0; police.blocked = 0;
    }
    const candidates = [40, 35, 45, 30, 50, 25, 55, 20, 60].map(z => ({ x: 6, z }));
    // Temporarily remove the resetting player from candidate checks.
    const oldPlayer = { x: s.player.x, z: s.player.z };
    s.player.x = 140; s.player.z = 140;
    const spot = candidates.find(p => !this.vehicleBlock(missionCar, p.x, p.z, Math.PI, false));
    if (spot) { missionCar.x = spot.x; missionCar.z = spot.z; missionCar.yaw = Math.PI; }
    missionCar.speed = 0; missionCar.steer = 0;
    const spawnOptions = [SPAWN, { x: 14, z: 36 }, { x: 14, z: 43 }, { x: 12, z: 33 }, { x: 15, z: 40 }];
    const spawn = spawnOptions.find(p => !this.footBlocked(p.x, p.z)) ?? oldPlayer;
    s.player.x = spawn.x; s.player.z = spawn.z; s.player.yaw = Math.PI; s.player.moving = false;
    s.mission = { phase: 'available', elapsed: 0, best: s.mission.best, deliveryHold: 0 };
    s.police = { wanted: 0, escape: 0, caught: 0, cooldown: 2 };
    this.collisionCooldown = 0; this.pedestrianHitCooldown = 0;
    this.message('Fresh delivery ready. Press E at the amber beacon to start.', 5);
  }

  getHint(): string {
    const car = this.controlledCar();
    if (car) {
      if (this.state.mission.phase === 'deliver' && dist(car, this.world.destination) < 10) {
        if (this.state.police.wanted) return 'Lose the patrol before delivering';
        return Math.abs(car.speed) >= 1.15 ? 'SPACE · Stop inside the mint zone' : 'Hold still · Delivering package…';
      }
      return Math.abs(car.speed) <= 1.8 ? 'E · Exit vehicle' : 'SPACE · Brake   S · Brake / reverse';
    }
    if (this.state.mission.phase === 'available' && dist(this.state.player, this.world.pickup) < 4) return 'E · Start Portside Express';
    const nearby = this.nearbyVehicle();
    if (nearby) return nearby.id === MISSION_CAR_ID ? 'E · Enter courier car' : 'E · Enter vehicle';
    if (this.state.mission.phase === 'collect') return 'Approach the amber courier car';
    return '';
  }
}
