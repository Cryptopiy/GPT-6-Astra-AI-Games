import { boxIntersects, circleIntersectsBox } from './collision';
import type { Building, Solid, World } from './types';

const PALETTE = ['#d6a38b', '#7aaba4', '#e3c89b', '#b8bfc0', '#d18e74', '#8ca9b7', '#c3ac91', '#9fb29c'];

/** A deterministic city: visuals and simulation share these exact footprints. */
export function createWorld(): World {
  const world: World = {
    size: 284,
    roads: [-80, 0, 80],
    roadWidth: 18,
    buildings: [],
    obstacles: [],
    pickup: { x: 14, z: 40 },
    destination: { x: 80, z: -58 },
    restricted: { x: -100, z: -110, radius: 14 },
  };
  const plaza = { x: 22.5, z: 40, width: 29, depth: 30, yaw: 0 };
  const reserved = (solid: Solid): boolean =>
    boxIntersects(solid, plaza) ||
    circleIntersectsBox(world.restricted.x, world.restricted.z, 17, solid);

  const addBuilding = (x: number, z: number, width: number, depth: number, seed: number, label?: string): void => {
    const building: Building = {
      id: `building-${world.buildings.length}`, kind: 'building', x, z,
      width, depth, height: 7 + (seed * 7 + 3) % 17, yaw: 0,
      color: PALETTE[seed % PALETTE.length], style: seed % 4,
      ...(label ? { label } : {}),
    };
    if (!reserved(building)) world.buildings.push(building);
  };

  // Normalized courtyard arrangements; outer blocks are clipped by the city edge.
  const layouts = [
    [[.24, .34, .36, .50], [.73, .65, .36, .52]],
    [[.31, .25, .52, .32], [.23, .72, .34, .36], [.73, .72, .36, .36]],
    [[.50, .25, .82, .32], [.33, .70, .48, .44]],
    [[.25, .50, .32, .80], [.73, .25, .36, .32], [.73, .72, .36, .36]],
  ];
  const centers = [-120, -40, 40, 120];
  const span = (center: number): [number, number] => {
    if (center === -120) return [-128, -96];
    if (center === 120) return [96, 128];
    return [center - 24, center + 24];
  };
  for (let ix = 0; ix < centers.length; ix++) {
    for (let iz = 0; iz < centers.length; iz++) {
      const [x0, x1] = span(centers[ix]);
      const [z0, z1] = span(centers[iz]);
      const seed = ix * 4 + iz;
      if (ix === 0 && iz === 0) {
        // Leave the restricted compound open so trespassing is an explicit choice.
        addBuilding(-123, -123, 10, 8, seed, 'DEPOT');
        addBuilding(-124, -100, 8, 8, seed + 1);
      } else if (ix === 2 && iz === 2) {
        // Courier pickup, starting player, and pavement approach stay unobstructed.
        addBuilding(51, 34, 20, 24, seed, 'COURIER');
        addBuilding(51, 60, 24, 8, seed + 1, 'CAFE');
        addBuilding(24, 20, 14, 8, seed + 2);
      } else {
        const layout = layouts[(ix * 3 + iz) % layouts.length];
        layout.forEach(([x, z, width, depth], index) => {
          addBuilding(
            x0 + x * (x1 - x0), z0 + z * (z1 - z0),
            width * (x1 - x0), depth * (z1 - z0), seed * 3 + index,
            (seed + index) % 7 === 0 ? ['MARKET', 'HOTEL', 'STUDIO'][(seed + index) % 3] : undefined,
          );
        });
      }

      // Small street-facing gardens; tree collision covers the trunk, not canopy.
      const spots = [
        { x: x0 + 1.2, z: z0 + 1.2 },
        { x: x1 - 1.2, z: z1 - 1.2 },
        { x: x1 - 1.2, z: z0 + (z1 - z0) * .48 },
      ];
      spots.forEach((spot, index) => {
        const obstacle: Solid = {
          id: `garden-${ix}-${iz}-${index}`, ...spot, yaw: 0,
          kind: index === 2 && seed % 3 === 0 ? 'planter' : 'tree',
          width: index === 2 && seed % 3 === 0 ? 2 : .85,
          depth: index === 2 && seed % 3 === 0 ? 2 : .85,
          height: index === 2 && seed % 3 === 0 ? .7 : 4 + seed % 3,
          color: index === 2 && seed % 3 === 0 ? '#bba886' : '#538b72',
        };
        if (!reserved(obstacle) && !world.buildings.some(building => boxIntersects(building, obstacle, .6))) {
          world.obstacles.push(obstacle);
        }
      });
    }
  }
  // Furniture sits beyond the walking routes, with the same solid footprint as its art.
  const furniture = [{ x: 15, z: 60 }, { x: -14.8, z: 32 }, { x: 94.5, z: -51 }, { x: -94.5, z: 55 }];
  furniture.forEach((position, index) => {
    const bench: Solid = { id: `bench-${index}`, kind: 'bench', ...position, yaw: 0, width: .8, depth: 2.2, height: 1.4, color: '#b28a5b' };
    const bin: Solid = { id: `bin-${index}`, kind: 'bin', x: position.x, z: position.z + 2.1, yaw: 0, width: .78, depth: .78, height: 1.2, color: '#507b72' };
    for (const solid of [bench, bin]) {
      if (![...world.buildings, ...world.obstacles].some(other => boxIntersects(solid, other, .2))) world.obstacles.push(solid);
    }
  });
  return world;
}
