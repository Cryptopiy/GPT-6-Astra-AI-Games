import { Biome, Block, BLOCKS, TILE } from "./data";
import type { Stack } from "./inventory";
export const WIDTH = 480,
  HEIGHT = 160,
  CHUNK = 16;
export function randomSeed(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Chest {
  x: number;
  y: number;
  items: Stack[];
  opened: boolean;
}
export class World {
  tiles = new Uint8Array(WIDTH * HEIGHT);
  surface: number[] = [];
  changes: Record<string, number> = {};
  dirty = new Set<string>();
  chests: Chest[] = [];
  spawn = { x: 77 * TILE, y: 30 * TILE };
  seed: string;
  constructor(seed = "EMBER-147") {
    this.seed = seed;
    this.generate();
  }
  biome(x: number): Biome {
    return x < 145 ? "forest" : x < 260 ? "desert" : x < 365 ? "snow" : "wild";
  }
  depth(y: number) {
    return y < 51 ? "surface" : y < 102 ? "underground" : "deep";
  }
  inside(x: number, y: number) {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
  }
  get(x: number, y: number): Block {
    if (y < 0) return Block.Air;
    if (!this.inside(x, y)) return Block.Bedrock;
    return this.tiles[y * WIDTH + x];
  }
  solid(x: number, y: number) {
    return BLOCKS[this.get(x, y)].solid;
  }
  set(x: number, y: number, id: Block) {
    if (!this.inside(x, y) || this.get(x, y) === Block.Bedrock) return false;
    this.tiles[y * WIDTH + x] = id;
    this.changes[String(y * WIDTH + x)] = id;
    this.dirty.add(`${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`);
    return true;
  }
  paint(x: number, y: number, id: Block) {
    if (this.inside(x, y)) this.tiles[y * WIDTH + x] = id;
  }
  carve(cx: number, cy: number, rx: number, ry: number) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (
          y > this.surface[x] + 3 &&
          ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1
        )
          this.paint(x, y, Block.Air);
  }
  generate() {
    const rng = randomSeed(this.seed),
      phase = rng() * 12;
    for (let x = 0; x < WIDTH; x++) {
      const s =
        x >= 64 && x <= 92
          ? 35
          : Math.round(
              35 +
                Math.sin(x * 0.042 + phase) * 4 +
                Math.sin(x * 0.105 + phase) * 2,
            );
      this.surface[x] = s;
      const biome = this.biome(x);
      for (let y = s; y < HEIGHT; y++) {
        let id = y === s ? Block.Grass : y < s + 7 ? Block.Dirt : Block.Stone;
        if (biome === "desert" && y < s + 10) id = Block.Sand;
        if (biome === "snow" && y < s + 5) id = Block.Snow;
        if (biome === "wild" && y === s) id = Block.Moss;
        if (y >= HEIGHT - 2) id = Block.Bedrock;
        this.paint(x, y, id);
      }
    }
    for (let n = 0; n < 95; n++) {
      let x = 8 + rng() * (WIDTH - 16),
        y = 53 + rng() * 90;
      const angle = rng() * Math.PI * 2;
      for (let j = 0; j < 22 + rng() * 30; j++) {
        x += Math.cos(angle + j * 0.08) * 1.5;
        y += Math.sin(angle + j * 0.1) * 0.8;
        this.carve(x, y, 2.5 + rng() * 3, 2 + rng() * 2);
      }
    }
    // A broad, continuous descent near camp joins three guaranteed resource galleries.
    for (let y = 36; y < 137; y++) {
      const x = 106 + Math.round(Math.sin(y * 0.075) * 13);
      for (let dx = -3; dx <= 3; dx++) this.paint(x + dx, y, Block.Air);
      if (y % 5 === 0)
        for (let dx = -3; dx <= 3; dx++) this.paint(x + dx, y, Block.Platform);
    }
    for (const y of [57, 83, 119, 136])
      for (let x = 88; x <= 142; x++) this.carve(x, y, 4, 3);
    // Random clusters are abundant; guaranteed seams make all seeds progressable.
    for (let n = 0; n < 1200; n++) {
      const x = 4 + Math.floor(rng() * (WIDTH - 8)),
        y = 43 + Math.floor(rng() * 111);
      const ore = y < 73 ? Block.Copper : y < 103 ? Block.Iron : Block.Crystal;
      for (let j = 0; j < 8; j++) {
        const xx = x + Math.floor(rng() * 5) - 2,
          yy = y + Math.floor(rng() * 4) - 2;
        if ([Block.Stone, Block.Dirt].includes(this.get(xx, yy)))
          this.paint(xx, yy, ore);
      }
    }
    for (const [ore, cy] of [
      [Block.Copper, 62],
      [Block.Iron, 89],
      [Block.Crystal, 125],
    ] as [Block, number][])
      for (let y = cy; y < cy + 4; y++)
        for (let x = 121; x < 142; x++) this.paint(x, y, ore);
    for (let x = 7; x < WIDTH - 8; x += 5 + Math.floor(rng() * 8)) {
      if (x > 62 && x < 115) continue;
      const s = this.surface[x],
        b = this.biome(x),
        height = 5 + Math.floor(rng() * 5);
      if (b === "desert") {
        for (let y = s - height + 2; y < s; y++) this.paint(x, y, Block.Wood);
        continue;
      }
      for (let y = s - height; y < s; y++) this.paint(x, y, Block.Wood);
      for (let dy = -3; dy < 3; dy++)
        for (let dx = -3; dx < 4; dx++)
          if (Math.abs(dx) + Math.abs(dy) < 5 && (dx || dy < 0))
            this.paint(x + dx, s - height + dy, Block.Leaves);
    }
    // A small camp to expand, with an open entrance and platform hatch.
    this.room(67, 35, false, rng);
    this.paint(67, 34, Block.Air);
    this.paint(67, 33, Block.Air);
    this.paint(67, 32, Block.Air);
    for (const [x, y] of [
      [128, 57],
      [132, 83],
      [91, 119],
      [208, 69],
      [298, 86],
      [391, 115],
      [441, 137],
    ])
      this.room(x, y, true, rng);
    this.spawn = { x: 77 * TILE + 8, y: 35 * TILE - 28 };
    // Guaranteed nearby harvestable trees.
    for (const x of [58, 88, 96]) {
      const s = this.surface[x];
      for (let y = s - 8; y < s; y++) this.paint(x, y, Block.Wood);
      for (let dy = -3; dy <= 2; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (Math.abs(dx) + Math.abs(dy) < 5)
            this.paint(x + dx, s - 8 + dy, Block.Leaves);
      for (let y = s - 8; y < s; y++) this.paint(x, y, Block.Wood);
    }
    for (let y = 32; y < 35; y++)
      for (let x = 75; x < 80; x++) this.paint(x, y, Block.Air);
    // Restore a climbable 48 px ladder after galleries/ruins have been carved.
    for (let y = 30; y < 137; y++) {
      const x = 106 + Math.round(Math.sin(y * 0.075) * 13);
      if (y < this.surface[x] - 1) continue;
      for (let dx = -5; dx <= 5; dx++)
        this.paint(x + dx, y, y % 3 === 2 ? Block.Platform : Block.Air);
    }
  }
  room(x: number, floor: number, chest: boolean, rng: () => number) {
    for (let y = floor - 6; y <= floor; y++)
      for (let xx = x - 6; xx <= x + 6; xx++)
        this.paint(
          xx,
          y,
          y === floor || y === floor - 6 || xx === x - 6 || xx === x + 6
            ? Block.Brick
            : Block.Air,
        );
    for (let y = floor - 3; y < floor; y++) {
      this.paint(x - 6, y, Block.Air);
      this.paint(x + 6, y, Block.Air);
    }
    this.paint(x - 3, floor - 3, Block.Torch);
    this.paint(x + 3, floor - 3, Block.Torch);
    if (chest) {
      const deep = floor > 102;
      const items: Stack[] = [
        { id: "torch", count: 8 },
        { id: "potion", count: 3 },
        { id: "arrow", count: 35 },
        {
          id: deep ? "crystal" : floor > 75 ? "ironOre" : "copperOre",
          count: deep ? 8 : 12,
        },
      ];
      const bonus = deep ? "heart" : rng() > 0.5 ? "boots" : "gel";
      items.push({ id: bonus, count: bonus === "gel" ? 3 : 1 });
      if (deep) items.push({ id: "crystalBow", count: 1 });
      this.chests.push({ x, y: floor - 1, items, opened: false });
      this.paint(x, floor - 1, Block.Chest);
    }
  }
  nearStations(px: number, py: number) {
    const set = new Set<string>(),
      x = Math.floor(px / TILE),
      y = Math.floor(py / TILE);
    for (let yy = y - 4; yy <= y + 4; yy++)
      for (let xx = x - 4; xx <= x + 4; xx++) {
        const b = this.get(xx, yy);
        if (b === Block.Workbench) set.add("workbench");
        if (b === Block.Furnace) set.add("furnace");
        if (b === Block.Anvil) set.add("anvil");
      }
    return set;
  }
  // Flood fill treats platforms as a closable hatch; boundaries stop unbounded rooms.
  shelter(px: number, py: number) {
    const start = [Math.floor(px / TILE), Math.floor(py / TILE)],
      seen = new Set<string>(),
      queue = [start];
    let light = false,
      bench = false;
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (
        seen.size > 220 ||
        Math.abs(x - start[0]) > 16 ||
        Math.abs(y - start[1]) > 12
      )
        return false;
      const b = this.get(x, y);
      if (this.solid(x, y) || b === Block.Platform) continue;
      if (b === Block.Torch) light = true;
      if (b === Block.Workbench) bench = true;
      queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return light && bench && seen.size >= 12;
  }
}
