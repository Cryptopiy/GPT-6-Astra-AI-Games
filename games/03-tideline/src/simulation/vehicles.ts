import { CELL, WIDTH, LENGTH, NX, NZ, cellAt, sampleBed, type World } from './terrain';

export type Vehicle = { id: number; x: number; z: number; y: number; yaw: number; vx: number; vz: number; roll: number; mass: number; color: number; startX: number; startZ: number; startYaw: number; displaced: boolean };
export const CAR_RADIUS = 2.5;
export function createVehicles(world: World): Vehicle[] {
  const starts = [[-48,-96],[-48,-57],[-48,4],[-48,52],[-48,94],[-22,27],[3,-27],[18,-55],[18,3],[18,64],[47,78],[78,36],[78,95],[103,27],[78,-28],[18,-101]];
  return starts.map(([x, z], id) => ({ id, x, z, y: sampleBed(world, x, z), yaw: id < 5 || [7,8,9,11,12,14,15].includes(id) ? 0 : Math.PI / 2, startYaw: id < 5 || [7,8,9,11,12,14,15].includes(id) ? 0 : Math.PI / 2, vx: 0, vz: 0, roll: 0, mass: 1050 + id % 4 * 180, color: [0xdb713f,0xf0ce72,0xe4e8d8,0x2c6062,0x668bae,0xbd645b][id % 6], startX: x, startZ: z, displaced: false }));
}
export function collides(world: World, x: number, z: number, radius = CAR_RADIUS): boolean {
  if (Math.abs(x) > WIDTH / 2 - radius || Math.abs(z) > LENGTH / 2 - radius) return true;
  for (const b of world.buildings) {
    const dx = Math.max(Math.abs(x - b.x) - b.width / 2, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.length / 2, 0);
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
export function stepVehicles(world: World, vehicles: Vehicle[], depth: Float64Array, flowX: Float64Array, flowZ: Float64Array, dt: number): void {
  for (const car of vehicles) {
    const k = cellAt(car.x, car.z);
    if (k < 0) continue;
    const d = depth[k], buoyancy = Math.min(1, Math.max(0, (d - 0.22) / 0.9));
    if (d > 0.12) {
      const rx = flowX[k] - car.vx, rz = flowZ[k] - car.vz;
      const relativeSpeed = Math.hypot(rx, rz);
      const drag = 0.5 * 1000 * 1.1 * Math.min(d, 1.7) * 2.0 / car.mass;
      const traction = (1 - buoyancy) * 5.5;
      const force = drag * relativeSpeed;
      const ax = force * rx, az = force * rz;
      const forceLength = Math.hypot(ax, az);
      const scale = forceLength > 0 ? Math.max(0, 1 - traction / forceLength) : 0;
      // Semi-implicit drag stays bounded even in a fast wet/dry front.
      const effectiveDrag = force * scale;
      car.vx = (car.vx + effectiveDrag * flowX[k] * dt) / (1 + effectiveDrag * dt + (1 - buoyancy) * 2 * dt);
      car.vz = (car.vz + effectiveDrag * flowZ[k] * dt) / (1 + effectiveDrag * dt + (1 - buoyancy) * 2 * dt);
    } else {
      car.vx *= Math.exp(-7 * dt); car.vz *= Math.exp(-7 * dt);
    }
    const speed = Math.hypot(car.vx, car.vz);
    if (speed > 13) { car.vx *= 13 / speed; car.vz *= 13 / speed; }
    // Separate small swept steps permit wall sliding and prevent tunnelling.
    const steps = Math.max(1, Math.ceil(Math.hypot(car.vx, car.vz) * dt / (CELL * 0.2)));
    for (let s = 0; s < steps; s++) {
      const x = car.x + car.vx * dt / steps, z = car.z + car.vz * dt / steps;
      if (!collides(world, x, car.z)) car.x = x; else car.vx *= -0.08;
      if (!collides(world, car.x, z)) car.z = z; else car.vz *= -0.08;
    }
    for (const other of vehicles) {
      if (other.id >= car.id) continue;
      const dx = car.x - other.x, dz = car.z - other.z, distance = Math.hypot(dx, dz);
      if (distance > 0.001 && distance < CAR_RADIUS * 2) {
        const push = CAR_RADIUS * 2 - distance;
        const x = car.x + dx / distance * push, z = car.z + dz / distance * push;
        if (!collides(world, x, z)) { car.x = x; car.z = z; }
        car.vx *= 0.7; car.vz *= 0.7;
      }
    }
    const next = cellAt(car.x, car.z), localDepth = next < 0 ? 0 : depth[next];
    car.y = sampleBed(world, car.x, car.z) + Math.max(0, localDepth - 0.65);
    if (speed > 0.12 && buoyancy > 0.1) {
      const target = Math.atan2(car.vx, car.vz);
      const delta = Math.atan2(Math.sin(target - car.yaw), Math.cos(target - car.yaw));
      car.yaw += delta * Math.min(1, dt * buoyancy * 0.65);
    }
    car.roll += (Math.max(-0.22, Math.min(0.22, (flowX[k] * Math.cos(car.yaw) - flowZ[k] * Math.sin(car.yaw)) * 0.025 * buoyancy)) - car.roll) * Math.min(1, dt * 3);
    car.displaced ||= Math.hypot(car.x - car.startX, car.z - car.startZ) > 2;
  }
}
