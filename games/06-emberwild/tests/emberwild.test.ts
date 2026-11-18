import test from "node:test";
import assert from "node:assert/strict";
import { Block, BLOCKS, ITEMS, RECIPES, TILE } from "../src/emberwild/data";
import { Inventory } from "../src/emberwild/inventory";
import { World, WIDTH, HEIGHT } from "../src/emberwild/world";
import { Body, collides, moveBody } from "../src/emberwild/physics";
import { GameState, SAVE_KEY } from "../src/emberwild/state";
import { Combat, ENEMY_DEFS, EnemyKind } from "../src/emberwild/combat";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};
const select = (g: GameState, id: string) => {
  const index = g.inventory.slots.findIndex((s) => s?.id === id);
  assert.ok(index >= 0, `Missing ${id}`);
  if (index >= 10) g.inventory.swap(index, 0);
  g.inventory.selected = index >= 10 ? 0 : index;
};
const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
function flatWorld() {
  const w = new World("flat-test");
  for (let y = 5; y < 25; y++)
    for (let x = 10; x < 45; x++)
      w.paint(x, y, y === 20 ? Block.Stone : Block.Air);
  return w;
}

test("20 seeds: valid fresh saves, safe spawn, all biomes/depths/ores and stocked ruins", () => {
  for (let i = 0; i < 20; i++) {
    const g = new GameState(`seed-${i}`),
      w = g.world;
    assert.equal(collides(w, g.player), false, `spawn seed ${i}`);
    assert.ok(w.solid(Math.floor(g.player.x / TILE), 35));
    assert.equal(w.tiles.length, WIDTH * HEIGHT);
    assert.equal(
      new Set(Array.from({ length: WIDTH }, (_, x) => w.biome(x))).size,
      4,
    );
    assert.deepEqual(
      [w.depth(35), w.depth(65), w.depth(120)],
      ["surface", "underground", "deep"],
    );
    for (const id of [
      Block.Dirt,
      Block.Stone,
      Block.Wood,
      Block.Copper,
      Block.Iron,
      Block.Crystal,
    ])
      assert.ok(w.tiles.includes(id));
    assert.equal(w.chests.length, 7);
    assert.ok(
      w.chests.some((c) => c.y > 110 && c.items.some((i) => i.id === "heart")),
    );
    assert.ok(GameState.validSave(g.snapshot()), `new save ${i}`);
  }
});
test("generation is deterministic and seed changes terrain", () => {
  const a = new World("a"),
    b = new World("a"),
    c = new World("b");
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.chests, b.chests);
  assert.notDeepEqual(a.tiles, c.tiles);
});
test("guaranteed galleries expose enough tiered ore from the descent", () => {
  const w = new World("EMBER-147");
  for (const [id, y] of [
    [Block.Copper, 62],
    [Block.Iron, 89],
    [Block.Crystal, 125],
  ] as [Block, number][]) {
    let n = 0;
    for (let yy = y; yy < y + 4; yy++)
      for (let x = 121; x < 142; x++) if (w.get(x, yy) === id) n++;
    assert.ok(n >= 70, `seam ${id} ${n}`);
  }
  // All three galleries connect to the descent through passable tiles.
  const visited = new Set<number>(),
    queue: number[] = [];
  const sx = 106 + Math.round(Math.sin(40 * 0.075) * 13);
  queue.push(40 * WIDTH + sx);
  while (queue.length) {
    const n = queue.pop()!;
    if (visited.has(n)) continue;
    const x = n % WIDTH,
      y = Math.floor(n / WIDTH);
    if (!w.inside(x, y) || w.solid(x, y)) continue;
    visited.add(n);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (w.inside(x + dx, y + dy)) queue.push((y + dy) * WIDTH + x + dx);
  }
  for (const y of [57, 83, 119])
    assert.ok(
      Array.from({ length: 20 }, (_, i) =>
        visited.has(y * WIDTH + 112 + i),
      ).some(Boolean),
      `gallery ${y}`,
    );
});
test("collision: stable floor, wall, ceiling and zero-NaN after 10k steps", () => {
  const w = flatWorld(),
    b: Body = {
      x: 20 * TILE,
      y: 12 * TILE,
      w: 12,
      h: 26,
      vx: 0,
      vy: 0,
      grounded: false,
    };
  for (let i = 0; i < 150; i++) moveBody(w, b, 1 / 60);
  assert.equal(b.y, 20 * TILE - 26);
  assert.equal(b.grounded, true);
  b.vy = -290;
  for (let i = 0; i < 10; i++) moveBody(w, b, 1 / 60);
  assert.ok(b.y < 20 * TILE - 50);
  for (let y = 7; y < 20; y++) w.paint(25, y, Block.Stone);
  for (let i = 0; i < 10000; i++) {
    b.vx = 112;
    moveBody(w, b, 1 / 60);
    assert.equal(collides(w, b), false);
  }
  assert.ok(b.x <= 25 * TILE - b.w);
  assert.ok([b.x, b.y, b.vx, b.vy].every(Number.isFinite));
});
test("platforms allow upward passage, landing, then deliberate drop through", () => {
  const w = flatWorld();
  for (let x = 12; x < 40; x++) w.paint(x, 16, Block.Platform);
  const b: Body = {
    x: 20 * TILE,
    y: 20 * TILE - 26,
    vx: 0,
    vy: -340,
    w: 12,
    h: 26,
    grounded: true,
  };
  let high = b.y;
  for (let i = 0; i < 70; i++) {
    moveBody(w, b, 1 / 60);
    high = Math.min(high, b.y);
  }
  assert.ok(high < 16 * TILE - 26);
  assert.equal(b.y, 16 * TILE - 26);
  b.dropThrough = 0.28;
  b.y += 2;
  for (let i = 0; i < 80; i++) moveBody(w, b, 1 / 60);
  assert.equal(b.y, 20 * TILE - 26);
});
test("stack capacity, quantity conservation and atomic full-inventory crafting", () => {
  const i = new Inventory();
  assert.equal(i.add("wood", 1200), 0);
  assert.equal(i.slots[0]?.count, 999);
  assert.equal(i.slots[1]?.count, 201);
  assert.equal(i.remove("wood", 1201), false);
  assert.equal(i.count("wood"), 1200);
  assert.equal(i.remove("wood", 1000), true);
  assert.equal(i.count("wood"), 200);
  const full = new Inventory(
    Array.from({ length: 40 }, () => ({ id: "pick0", count: 1 })),
  );
  full.slots[0] = { id: "wood", count: 20 };
  const before = JSON.stringify(full.slots);
  assert.equal(full.craft(recipe("workbench"), new Set()), false);
  assert.equal(JSON.stringify(full.slots), before);
  full.slots[0] = { id: "wood", count: 10 };
  assert.equal(full.craft(recipe("workbench"), new Set()), true);
  assert.equal(full.count("wood"), 0);
  assert.equal(full.count("workbench"), 1);
});
test("crafting requires real materials and actual nearby stations", () => {
  const g = new GameState();
  g.inventory = new Inventory();
  g.inventory.add("stone", 20);
  g.inventory.add("wood", 6);
  assert.equal(g.craft(recipe("furnace")), false);
  g.world.set(78, 34, Block.Workbench);
  assert.equal(g.craft(recipe("furnace")), true);
  assert.equal(g.inventory.count("stone"), 0);
  assert.equal(g.craft(recipe("furnace")), false);
  g.player.x += 200;
  assert.equal(g.stations.has("workbench"), false);
});
test("placement: rejects player overlap, reach, occupied tiles, lack of support and consumes exactly one", () => {
  const g = new GameState();
  select(g, "dirt");
  const initial = g.inventory.count("dirt");
  assert.equal(g.place(77, 34), false);
  assert.equal(g.place(300, 20), false);
  assert.equal(g.place(77, 35), false);
  assert.equal(g.place(78, 29), false);
  assert.equal(g.inventory.count("dirt"), initial);
  assert.equal(g.place(81, 34), true);
  assert.equal(g.world.get(81, 34), Block.Dirt);
  assert.equal(g.inventory.count("dirt"), initial - 1);
  assert.equal(g.place(81, 34), false);
});
test("mining is tier/reach gated, repeat-safe, and has one physical drop", () => {
  const g = new GameState();
  select(g, "pick0");
  g.world.set(81, 34, Block.Crystal);
  assert.equal(g.mine(81, 34), false);
  g.inventory.add("pick2");
  select(g, "pick2");
  assert.equal(g.mine(81, 34), true);
  assert.equal(g.mine(81, 34), false);
  assert.equal(g.world.get(81, 34), Block.Air);
  assert.equal(g.drops.length, 1);
  assert.equal(g.drops[0].id, "crystal");
  assert.equal(g.mine(130, 125), false);
});
test("wood/stone/dirt/ore mine-pickup-place loop shares one inventory", () => {
  const g = new GameState();
  select(g, "pick0");
  for (const [block, id] of [
    [Block.Dirt, "dirt"],
    [Block.Stone, "stone"],
    [Block.Wood, "wood"],
    [Block.Copper, "copperOre"],
  ] as [Block, string][]) {
    g.world.set(81, 34, block);
    const n = g.inventory.count(id);
    assert.equal(g.mine(81, 34), true);
    const d = g.drops.pop()!;
    g.inventory.add(d.id, d.count);
    assert.equal(g.inventory.count(id), n + 1);
    if (ITEMS[id].block) {
      select(g, id);
      assert.equal(g.place(81, 34), true);
      assert.equal(g.inventory.count(id), n);
      g.world.set(81, 34, Block.Air);
      select(g, "pick0");
    }
  }
});
test("chest overflow remains in chest; empty chest cannot duplicate loot", () => {
  const g = new GameState(),
    c = g.world.chests[0];
  g.player.x = c.x * TILE;
  g.player.y = (c.y - 1) * TILE;
  g.inventory = new Inventory(
    Array.from({ length: 40 }, () => ({ id: "pick0", count: 1 })),
  );
  const before = JSON.stringify(c.items);
  g.openChest(c.x, c.y);
  assert.equal(JSON.stringify(c.items), before);
  assert.equal(c.opened, false);
  g.inventory = new Inventory();
  g.openChest(c.x, c.y);
  assert.equal(c.opened, true);
  assert.equal(c.items.length, 0);
  const n = JSON.stringify(g.inventory.slots);
  g.openChest(c.x, c.y);
  assert.equal(JSON.stringify(g.inventory.slots), n);
});
test("armor swaps without loss, healing cooldown and permanent upgrades", () => {
  const g = new GameState();
  g.inventory = new Inventory();
  for (const id of ["armor1", "armor2", "heart", "boots", "potion"])
    g.inventory.add(id);
  select(g, "armor1");
  g.useUtility();
  assert.equal(g.defense, 3);
  select(g, "armor2");
  g.useUtility();
  assert.equal(g.defense, 6);
  assert.equal(g.inventory.count("armor1"), 1);
  select(g, "heart");
  g.useUtility();
  assert.equal(g.player.maxHp, 120);
  select(g, "boots");
  g.useUtility();
  assert.equal(g.player.boots, true);
  g.player.hp = 35;
  select(g, "potion");
  g.useUtility();
  assert.equal(g.player.hp, 80);
  assert.equal(g.player.healCooldown, 6);
});
test("damage applies armor, invulnerability, knockback, safe respawn and retained inventory", () => {
  const g = new GameState();
  g.player.invulnerable = 0;
  g.player.armor = "armor1";
  assert.equal(g.damage(12, g.player.x - 20), 9);
  assert.equal(g.player.hp, 91);
  assert.equal(g.damage(12, 0), 0);
  assert.ok(g.player.vx > 0);
  const before = JSON.stringify(g.inventory.slots);
  g.player.invulnerable = 0;
  g.player.hp = 1;
  g.damage(50, 0);
  assert.equal(g.player.hp, 100);
  assert.equal(JSON.stringify(g.inventory.slots), before);
  assert.equal(collides(g.world, g.player), false);
});
test("six ordinary enemy types are valid and behave independently", () => {
  const g = new GameState();
  g.world = flatWorld();
  g.player.x = 22 * TILE;
  g.player.y = 20 * TILE - 26;
  g.player.invulnerable = 999;
  const c = new Combat(g);
  for (const [i, kind] of Object.keys(ENEMY_DEFS).entries())
    c.spawn(kind as EnemyKind, (14 + i * 4) * TILE, 17 * TILE);
  assert.equal(c.enemies.length, 6);
  const before = c.enemies.map((e) => [e.x, e.y]);
  for (let i = 0; i < 90; i++) c.update(1 / 60);
  for (let i = 0; i < 6; i++) {
    assert.ok(c.enemies[i]);
    assert.notDeepEqual([c.enemies[i].x, c.enemies[i].y], before[i]);
    assert.ok([c.enemies[i].x, c.enemies[i].y].every(Number.isFinite));
  }
  assert.ok(c.enemies.some((e) => e.kind === "moth" && e.vy !== 0));
});
test("melee and moving arrows damage enemies, consume ammunition and award loot", () => {
  const g = new GameState();
  g.world = flatWorld();
  g.player.x = 20 * TILE;
  g.player.y = 20 * TILE - 26;
  g.player.facing = 1;
  g.player.invulnerable = 999;
  const c = new Combat(g),
    e = c.spawn("mossling", g.player.x + 30, g.player.y + 5);
  c.melee(15);
  assert.equal(e.hp, 17);
  const before = g.inventory.count("arrow");
  c.shoot(e.x + 8, e.y + 8, 30);
  assert.equal(g.inventory.count("arrow"), before - 1);
  assert.equal(c.projectiles.length, 1);
  for (let i = 0; i < 20; i++) c.update(1 / 60);
  assert.ok(e.hp <= 0);
  assert.ok(g.drops.some((d) => d.id === "gel"));
  assert.equal(g.stats.slain, 1);
});
test("day/night changes pressure and biome/depth spawning stays bounded", () => {
  const g = new GameState();
  assert.equal(g.night, false);
  g.time = 500;
  assert.equal(g.night, true);
  const c = new Combat(g);
  g.player.invulnerable = 999;
  for (let i = 0; i < 80; i++) c.spawnNearby();
  assert.ok(c.enemies.length <= 12);
  g.time = 730;
  assert.equal(g.night, false);
});
test("shelter requires enclosure, light and workstation, with a platform hatch", () => {
  const g = new GameState(),
    w = g.world;
  for (let y = 10; y <= 16; y++)
    for (let x = 20; x <= 30; x++)
      w.paint(
        x,
        y,
        x === 20 || x === 30 || y === 10 || y === 16 ? Block.Wood : Block.Air,
      );
  w.paint(22, 14, Block.Torch);
  w.paint(27, 15, Block.Workbench);
  w.paint(25, 10, Block.Platform);
  assert.equal(w.shelter(25 * TILE, 14 * TILE), true);
  w.paint(20, 14, Block.Air);
  assert.equal(w.shelter(25 * TILE, 14 * TILE), false);
  w.paint(20, 14, Block.Wood);
  w.paint(22, 14, Block.Air);
  assert.equal(w.shelter(25 * TILE, 14 * TILE), false);
});
test("boss has all three attacks, two phases, recoverable summon and meaningful reward", () => {
  const g = new GameState();
  g.player.invulnerable = 999;
  g.inventory.add("sigil");
  const c = new Combat(g);
  assert.equal(c.summon(), true);
  assert.equal(g.inventory.count("sigil"), 0);
  const seen = new Set<number>();
  for (let i = 0; i < 60 * 17; i++) {
    c.update(1 / 60);
    assert.ok(c.boss);
    seen.add(c.boss.attack);
  }
  assert.equal(seen.size, 3);
  c.boss!.hp = 500;
  c.update(1 / 60);
  assert.equal(c.boss!.phase, 2);
  c.boss = null;
  assert.equal(c.summon(), true);
  c.hitBoss(2000);
  assert.equal(g.bossDefeated, true);
  assert.equal(g.bossRetry, false);
  assert.equal(g.inventory.count("relic"), 1);
  assert.equal(g.player.maxHp, 120);
  assert.equal(c.boss, null);
});
test("save/load preserves mined air, blocks, inventory, health, gear, chests, drops and boss", () => {
  const g = new GameState("persistent-148");
  g.world.set(77, 35, Block.Air);
  g.world.set(81, 34, Block.Torch);
  g.world.set(80, 34, Block.Workbench);
  g.inventory.add("crystal", 13);
  g.inventory.selected = 7;
  g.player.armor = "armor2";
  g.player.maxHp = 140;
  g.player.hp = 88;
  g.player.boots = true;
  g.bossDefeated = true;
  g.time = 530;
  g.world.chests[0].items = [];
  g.world.chests[0].opened = true;
  g.drop("relic", 1, 81 * TILE, 32 * TILE);
  g.stats = { mined: 30, crafted: 4, slain: 10 };
  const storage = memory();
  assert.equal(g.save(storage), true);
  const loaded = GameState.load(storage);
  assert.deepEqual(loaded.snapshot(), g.snapshot());
  assert.equal(loaded.world.get(77, 35), Block.Air);
  assert.equal(loaded.world.get(81, 34), Block.Torch);
  assert.equal(loaded.world.seed, "persistent-148");
});
test("malformed saves and storage failures are handled without invalid state", () => {
  const storage = memory();
  storage.setItem(SAVE_KEY, "{not-json");
  assert.equal(GameState.load(storage).world.seed, "EMBER-147");
  const g = new GameState(),
    snapshot = g.snapshot();
  snapshot.slots[0] = { id: "invented", count: -1 };
  assert.equal(GameState.validSave(snapshot), false);
  assert.equal(
    g.save({
      setItem() {
        throw Error("Quota exceeded");
      },
    }),
    false,
  );
  assert.ok(g.saveError);
  g.player.x = NaN;
  moveBody(g.world, g.player, 1 / 60);
  assert.ok(Number.isFinite(g.player.x));
});
test("all recipes form a reachable dependency graph from natural and enemy resources", () => {
  const available = new Set([
    "wood",
    "dirt",
    "stone",
    "sand",
    "snow",
    "copperOre",
    "gel",
    "pick0",
    "axe",
    "sword0",
  ]);
  const stations = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    if (available.has("pick1")) available.add("ironOre");
    if (available.has("pick2")) available.add("crystal");
    if (available.has("sigil")) available.add("relic");
    for (const r of RECIPES)
      if (
        !available.has(r.out) &&
        (!r.station || stations.has(r.station)) &&
        Object.keys(r.needs).every((id) => available.has(id))
      ) {
        available.add(r.out);
        if (["workbench", "furnace", "anvil"].includes(r.out))
          stations.add(r.out);
        changed = true;
      }
  }
  for (const r of RECIPES)
    assert.ok(available.has(r.out), `Unreachable ${r.out}`);
  assert.ok(available.has("sigil"));
  assert.ok(available.has("rootblade"));
});
test("the guaranteed descent can be climbed one platform at a time with starter jump physics", () => {
  const w = new World("EMBER-147");
  for (let row = 134; row > 41; row -= 3) {
    const x = 106 + Math.round(Math.sin(row * 0.075) * 13),
      targetX = 106 + Math.round(Math.sin((row - 3) * 0.075) * 13);
    const b: Body = {
      x: x * TILE + 2,
      y: row * TILE - 26,
      w: 12,
      h: 26,
      vx: 0,
      vy: -290,
      grounded: true,
    };
    let landed = false;
    for (let i = 0; i < 65; i++) {
      b.vx = Math.max(-112, Math.min(112, (targetX * TILE + 2 - b.x) * 14));
      moveBody(w, b, 1 / 60);
      if (b.grounded && b.y <= (row - 3) * TILE - 26 + 0.1) {
        landed = true;
        break;
      }
    }
    assert.ok(landed, `Could not climb from platform row ${row}`);
  }
});
test("a full gear inventory can free a slot without losing the dropped item", () => {
  const g = new GameState();
  g.inventory = new Inventory(
    Array.from({ length: 40 }, () => ({ id: "pick0", count: 1 })),
  );
  assert.equal(g.inventory.add("wood"), 1);
  assert.equal(g.dropSlot(7), true);
  assert.equal(g.inventory.add("wood"), 0);
  assert.equal(g.drops[0].id, "pick0");
  assert.equal(g.drops[0].count, 1);
  assert.ok(g.drops[0].age < 0);
  assert.equal(g.inventory.count("pick0"), 39);
  assert.ok(GameState.validSave(g.snapshot()));
});
test("many legal drops merge without loss and remain loadable beyond the old 2000-drop limit", () => {
  const g = new GameState();
  for (let i = 0; i < 2500; i++) g.drop("dirt", 1, 80 * TILE, 33 * TILE);
  assert.equal(
    g.drops.reduce((n, d) => n + d.count, 0),
    2500,
  );
  assert.equal(g.drops.length, 3);
  for (let i = 0; i < 2100; i++)
    g.drops.push({
      x: 80 * TILE,
      y: 33 * TILE,
      id: "wood",
      count: 1,
      w: 7,
      h: 7,
      vx: 0,
      vy: 0,
      grounded: false,
      age: 1,
    });
  const storage = memory();
  assert.equal(g.save(storage), true);
  assert.deepEqual(GameState.load(storage).snapshot(), g.snapshot());
});
