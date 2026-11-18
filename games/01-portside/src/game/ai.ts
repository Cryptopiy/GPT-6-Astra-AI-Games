import type { Pedestrian, Point, Vehicle, World } from './types';
import { angleDelta, clamp, dist } from './collision';

export const MISSION_CAR_ID = 'courier-01';
export const VEHICLE_WIDTH = 2.25;
export const VEHICLE_DEPTH = 4.6;

function vehicle(id: string, kind: Vehicle['kind'], x: number, z: number, yaw: number, color: string, route: Point[] = [], waypoint = 0): Vehicle {
  return { id, kind, x, z, yaw, color, route, waypoint, width: VEHICLE_WIDTH, depth: VEHICLE_DEPTH, speed: 0, steer: 0, blocked: 0, active: kind !== 'police' };
}

export function createVehicles(): Vehicle[] {
  const outer: Point[] = [{ x: 76, z: -76 }, { x: 76, z: 76 }, { x: -76, z: 76 }, { x: -76, z: -76 }];
  const inner: Point[] = [{ x: -4, z: -84 }, { x: -4, z: -4 }, { x: 84, z: -4 }, { x: 84, z: -84 }];
  return [
    vehicle(MISSION_CAR_ID, 'mission', 6, 40, Math.PI, '#f6c452'),
    vehicle('parked-coral', 'parked', -6, 105, 0, '#dd785e'),
    vehicle('parked-mint', 'parked', 86, 110, Math.PI, '#67b5a5'),
    vehicle('parked-cream', 'parked', -110, -86, Math.PI / 2, '#e5ded0'),
    vehicle('traffic-0', 'traffic', 76, -43, 0, '#c5604b', outer, 1),
    vehicle('traffic-1', 'traffic', 76, 49, 0, '#e8d7b3', outer, 1),
    vehicle('traffic-2', 'traffic', -22, 76, -Math.PI / 2, '#7da8b7', outer, 2),
    vehicle('traffic-3', 'traffic', -76, 37, Math.PI, '#b3c785', outer, 3),
    vehicle('traffic-4', 'traffic', -76, -49, Math.PI, '#c19ac7', outer, 3),
    vehicle('traffic-5', 'traffic', -13, -76, Math.PI / 2, '#edba61', outer, 0),
    vehicle('traffic-6', 'traffic', -4, -65, 0, '#7f92b4', inner, 1),
    vehicle('traffic-7', 'traffic', 84, -55, Math.PI, '#e0a88c', inner, 3),
    vehicle('police-0', 'police', 0, 117, Math.PI, '#233e52'),
    vehicle('police-1', 'police', -80, -121, 0, '#233e52'),
  ];
}

export function createPedestrians(): Pedestrian[] {
  const loops: Point[][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corners = [{ x: 11.3 * sx, z: 11.3 * sz }, { x: 68.7 * sx, z: 11.3 * sz }, { x: 68.7 * sx, z: 68.7 * sz }, { x: 11.3 * sx, z: 68.7 * sz }];
    if (sx * sz < 0) corners.reverse();
    loops.push(corners);
  }
  const colors = ['#ee9973', '#7d9cae', '#edcb73', '#9bbb99', '#c9a2b6', '#3f6974'];
  return loops.flatMap((route, loop) => Array.from({ length: 5 }, (_, index) => {
    const edge = index % 4;
    const a = route[edge];
    const b = route[(edge + 1) % 4];
    const t = index === 4 ? 0.76 : 0.14 + index * 0.13;
    return { id: `ped-${loop * 5 + index}`, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
      yaw: Math.atan2(b.x - a.x, b.z - a.z), color: colors[(loop * 3 + index) % colors.length],
      speed: 1.15 + ((index * 7 + loop * 3) % 9) * 0.085, route, waypoint: (edge + 1) % 4,
      phase: index * 1.9 + loop * 0.8, state: 'walking' as const, timer: 0 };
  }));
}

/** Road graph routing first projects both entities onto an unobstructed road. */
export function routeToTarget(from: Point, target: Point, world: World): Point[] {
  const project = (p: Point) => {
    const rx = world.roads.reduce((a, b) => Math.abs(p.x - a) < Math.abs(p.x - b) ? a : b);
    const rz = world.roads.reduce((a, b) => Math.abs(p.z - a) < Math.abs(p.z - b) ? a : b);
    return Math.abs(p.x - rx) < Math.abs(p.z - rz)
      ? { point: { x: rx, z: clamp(p.z, -132, 132) }, axis: 'z' }
      : { point: { x: clamp(p.x, -132, 132), z: rz }, axis: 'x' };
  };
  const a = project(from);
  const b = project(target);
  const points: Point[] = [];
  if (dist(from, a.point) > 3) points.push(a.point);
  if (a.axis === b.axis && (a.axis === 'z' ? a.point.x === b.point.x : a.point.z === b.point.z)) {
    points.push(b.point);
  } else if (a.axis !== b.axis) {
    points.push(a.axis === 'z' ? { x: a.point.x, z: b.point.z } : { x: b.point.x, z: a.point.z });
    points.push(b.point);
  } else {
    const cross = world.roads.reduce((best, road) => {
      const score = a.axis === 'z' ? Math.abs(a.point.z - road) + Math.abs(b.point.z - road) : Math.abs(a.point.x - road) + Math.abs(b.point.x - road);
      const bestScore = a.axis === 'z' ? Math.abs(a.point.z - best) + Math.abs(b.point.z - best) : Math.abs(a.point.x - best) + Math.abs(b.point.x - best);
      return score < bestScore ? road : best;
    });
    points.push(a.axis === 'z' ? { x: a.point.x, z: cross } : { x: cross, z: a.point.z });
    points.push(a.axis === 'z' ? { x: b.point.x, z: cross } : { x: cross, z: b.point.z });
    points.push(b.point);
  }
  return points.filter((p, i) => dist(i === 0 ? from : points[i - 1], p) > 2.8);
}

export function steerToward(car: Vehicle, target: Point, dt: number, targetSpeed: number): void {
  const desired = Math.atan2(target.x - car.x, target.z - car.z);
  const angle = angleDelta(car.yaw, desired);
  const turnSpeed = Math.abs(angle) > 0.62 ? Math.min(targetSpeed, 4.2) : targetSpeed;
  car.speed += clamp(turnSpeed - car.speed, -11 * dt, 5.5 * dt);
  const turnRate = Math.min(2.1, 0.5 + Math.abs(car.speed) * 0.14);
  car.yaw += clamp(angle, -turnRate * dt, turnRate * dt);
  car.steer = clamp(-angle, -0.55, 0.55);
}
