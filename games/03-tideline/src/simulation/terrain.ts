export const NX = 96;
export const NZ = 80;
export const CELL = 3;
export const WIDTH = NX * CELL;
export const LENGTH = NZ * CELL;
export const SIZE = NX * NZ;
export const ROAD_X = [-48, 18, 78];
export const ROAD_Z = [-78, -27, 27, 78];
export type Building = { id: number; x: number; z: number; width: number; length: number; height: number; base: number; color: number };
export type World = { bed: Float64Array; land: Uint8Array; solid: Uint8Array; roads: Uint8Array; buildings: Building[]; landCount: number };

export const xAt = (i: number) => (i + 0.5) * CELL - WIDTH / 2;
export const zAt = (j: number) => (j + 0.5) * CELL - LENGTH / 2;
export function cellAt(x: number, z: number): number {
  const i = Math.floor((x + WIDTH / 2) / CELL);
  const j = Math.floor((z + LENGTH / 2) / CELL);
  return i < 0 || i >= NX || j < 0 || j >= NZ ? -1 : j * NX + i;
}
export const coastAt = (z: number) => -77 + 5 * Math.sin(z / 34) + 2 * Math.cos(z / 17);
export function isRoad(x: number, z: number): boolean {
  return x > coastAt(z) + 7 && (ROAD_X.some(v => Math.abs(x - v) < 4) || ROAD_Z.some(v => Math.abs(z - v) < 4));
}
export function elevation(x: number, z: number): number {
  const inland = x - coastAt(z);
  if (inland < 0) return Math.max(-8, inland * 0.23);
  const slope = 0.047 * inland + 0.00019 * inland * inland;
  const hill = 15 * Math.exp(-((x - 92) ** 2 / 1600 + (z + 61) ** 2 / 2200));
  const basin = 3.3 * Math.exp(-((x + 3) ** 2 / 950 + (z - 49) ** 2 / 1400));
  const texture = 0.3 * Math.sin(x / 17) * Math.sin(z / 21) * Math.min(1, inland / 20);
  return Math.max(0.04 + inland * 0.003, slope + hill - basin + texture - (isRoad(x, z) ? 0.55 : 0));
}
export function createWorld(): World {
  const bed = new Float64Array(SIZE), land = new Uint8Array(SIZE), solid = new Uint8Array(SIZE), roads = new Uint8Array(SIZE);
  let landCount = 0;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = xAt(i), z = zAt(j);
    bed[k] = elevation(x, z);
    land[k] = bed[k] >= 0 ? 1 : 0;
    roads[k] = isRoad(x, z) ? 1 : 0;
    landCount += land[k];
  }
  const buildings: Building[] = [];
  const colors = [0xe3d8bf, 0xd8c7a6, 0xc4c8bd, 0xe5d9c9, 0xbbc6bd, 0xdec5a8];
  for (const [col, x] of [-61, -30, -7, 39, 59, 99, 122].entries()) {
    for (const [row, z] of [-99, -56, -5, 52, 98].entries()) {
      if ((col === 0 && row === 0) || (x > 80 && z < 0) || (col === 2 && row === 3)) continue;
      const width = col === 0 ? 8 : 11 + (row % 2) * 3;
      const length = 12 + ((row + col) % 3) * 3;
      const id = buildings.length;
      let base = 0;
      for (const dx of [-width / 2, width / 2]) for (const dz of [-length / 2, length / 2]) base = Math.max(base, elevation(x + dx, z + dz));
      buildings.push({ id, x, z, width, length, height: 5 + ((col * 3 + row * 5) % 5) * 2.4, base, color: colors[id % colors.length] });
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        if (Math.abs(xAt(i) - x) < width / 2 && Math.abs(zAt(j) - z) < length / 2) {
          const k = j * NX + i;
          solid[k] = 1;
          bed[k] = base;
        }
      }
    }
  }
  return { bed, land, solid, roads, buildings, landCount };
}

/** Bilinear interpolation shared by terrain-following props and physical bodies. */
export function sampleBed(world: World, x: number, z: number): number {
  const gx = Math.max(0, Math.min(NX - 1.001, (x + WIDTH / 2) / CELL - 0.5));
  const gz = Math.max(0, Math.min(NZ - 1.001, (z + LENGTH / 2) / CELL - 0.5));
  const i = Math.floor(gx), j = Math.floor(gz), tx = gx - i, tz = gz - j;
  const k = j * NX + i;
  return (world.bed[k] * (1 - tx) + world.bed[k + 1] * tx) * (1 - tz) + (world.bed[k + NX] * (1 - tx) + world.bed[k + NX + 1] * tx) * tz;
}
