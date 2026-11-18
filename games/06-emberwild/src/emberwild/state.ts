import { Block, BLOCKS, ITEMS, Recipe, TILE } from "./data";
import { Inventory, Stack } from "./inventory";
import { Body, collides, overlaps } from "./physics";
import { HEIGHT, WIDTH, World } from "./world";
export interface Player extends Body {
  hp: number;
  maxHp: number;
  armor: string | null;
  boots: boolean;
  facing: number;
  invulnerable: number;
  healCooldown: number;
}
export interface Drop extends Body {
  id: string;
  count: number;
  age: number;
}
export interface SaveData {
  version: 1;
  seed: string;
  changes: Record<string, number>;
  slots: (Stack | null)[];
  selected: number;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    armor: string | null;
    boots: boolean;
  };
  time: number;
  bossDefeated: boolean;
  chests: { items: Stack[]; opened: boolean }[];
  drops: { x: number; y: number; id: string; count: number }[];
  stats: { mined: number; crafted: number; slain: number };
  bossRetry: boolean;
}
export const SAVE_KEY = "emberwild.save.v1";
export class GameState {
  world: World;
  inventory: Inventory;
  player: Player;
  drops: Drop[] = [];
  time = 100;
  paused = false;
  inventoryOpen = false;
  bossDefeated = false;
  bossRetry = false;
  stats = { mined: 0, crafted: 0, slain: 0 };
  notices: { text: string; ttl: number; id: number }[] = [];
  noticeId = 0;
  savedAt = "";
  saveError = "";
  constructor(seed = "EMBER-147") {
    this.world = new World(seed);
    this.inventory = Inventory.starter();
    this.player = {
      ...this.world.spawn,
      vx: 0,
      vy: 0,
      w: 12,
      h: 26,
      grounded: false,
      hp: 100,
      maxHp: 100,
      armor: null,
      boots: false,
      facing: 1,
      invulnerable: 2,
      healCooldown: 0,
    };
  }
  notify(text: string) {
    if (this.notices.some((n) => n.text === text && n.ttl > 1)) return;
    this.notices.push({ text, ttl: 4, id: ++this.noticeId });
    if (this.notices.length > 4) this.notices.shift();
  }
  get night() {
    return this.time % 720 > 420;
  }
  get stations() {
    return this.world.nearStations(this.player.x + 6, this.player.y + 13);
  }
  get defense() {
    return this.player.armor ? (ITEMS[this.player.armor]?.defense ?? 0) : 0;
  }
  get selected() {
    return this.inventory.current
      ? ITEMS[this.inventory.current.id]
      : undefined;
  }
  reach(tx: number, ty: number) {
    return (
      Math.hypot(
        tx * TILE + 8 - this.player.x - 6,
        ty * TILE + 8 - this.player.y - 13,
      ) < 96
    );
  }
  canPlace(tx: number, ty: number) {
    const item = this.selected;
    if (
      !item?.block ||
      !this.inventory.current ||
      !this.world.inside(tx, ty) ||
      !this.reach(tx, ty) ||
      this.world.get(tx, ty) !== Block.Air
    )
      return false;
    if (
      BLOCKS[item.block].solid &&
      overlaps(this.player, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE })
    )
      return false;
    return [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => this.world.get(tx + dx, ty + dy) !== Block.Air);
  }
  place(tx: number, ty: number) {
    if (!this.canPlace(tx, ty)) return false;
    const block = this.selected!.block!;
    if (!this.inventory.consumeSlot(this.inventory.selected)) return false;
    this.world.set(tx, ty, block);
    return true;
  }
  drop(id: string, count: number, x: number, y: number) {
    if (!ITEMS[id] || !Number.isSafeInteger(count) || count <= 0) return;
    x = Math.max(TILE, Math.min(WIDTH * TILE - 2 * TILE, x));
    y = Math.max(0, Math.min(HEIGHT * TILE - 3 * TILE, y));
    for (const d of this.drops)
      if (d.id === id && Math.hypot(d.x - x, d.y - y) < 40) {
        const n = Math.min(count, ITEMS[id].max - d.count);
        d.count += n;
        count -= n;
        if (!count) return;
      }
    while (count > 0) {
      const n = Math.min(count, ITEMS[id].max);
      this.drops.push({
        id,
        count: n,
        x,
        y,
        vx: (Math.random() - 0.5) * 65,
        vy: -90,
        w: 7,
        h: 7,
        grounded: false,
        age: 0,
      });
      count -= n;
    }
  }
  mine(tx: number, ty: number) {
    const id = this.world.get(tx, ty),
      def = BLOCKS[id],
      tool = this.selected;
    if (
      !this.reach(tx, ty) ||
      !def.drop ||
      !tool ||
      !["pick", "axe"].includes(tool.kind) ||
      (tool.tier ?? 0) < def.tier
    )
      return false;
    this.world.set(tx, ty, Block.Air);
    this.drop(def.drop, 1, tx * TILE + 4, ty * TILE + 4);
    this.stats.mined++;
    return true;
  }
  craft(r: Recipe) {
    if (this.inventory.craft(r, this.stations)) {
      this.stats.crafted++;
      this.notify(`Создано: ${ITEMS[r.out].name} ×${r.amount}`);
      return true;
    }
    this.notify("Нужны материалы, станция рядом и место в рюкзаке");
    return false;
  }
  dropSlot(index: number) {
    const stack = this.inventory.slots[index];
    if (!stack) return false;
    this.inventory.slots[index] = null;
    this.inventory.revision++;
    this.drops.push({
      id: stack.id,
      count: stack.count,
      x: Math.max(
        TILE,
        Math.min(
          WIDTH * TILE - 2 * TILE,
          this.player.x + this.player.facing * 22,
        ),
      ),
      y: Math.max(0, this.player.y),
      vx: this.player.facing * 145,
      vy: -120,
      w: 7,
      h: 7,
      grounded: false,
      age: -1.5,
    });
    this.notify(`Выброшено: ${ITEMS[stack.id].name} ×${stack.count}`);
    return true;
  }
  openChest(tx: number, ty: number) {
    if (!this.reach(tx, ty)) return false;
    const c = this.world.chests.find((c) => c.x === tx && c.y === ty);
    if (!c) return false;
    let taken = 0;
    for (const item of c.items) {
      const remain = this.inventory.add(item.id, item.count);
      taken += item.count - remain;
      item.count = remain;
    }
    c.items = c.items.filter((i) => i.count > 0);
    c.opened = !c.items.length;
    this.world.dirty.add(`${Math.floor(tx / 16)},${Math.floor(ty / 16)}`);
    this.notify(
      c.items.length
        ? "Рюкзак заполнен. Остальное осталось в сундуке."
        : taken
          ? "Сундук открыт · находки в рюкзаке"
          : "Здесь уже пусто",
    );
    return true;
  }
  useUtility(): boolean {
    const s = this.inventory.current;
    if (!s) return false;
    const d = ITEMS[s.id],
      p = this.player;
    if (d.kind === "heal") {
      if (p.healCooldown > 0) {
        this.notify("Настой ещё восстанавливается");
        return true;
      }
      if (p.hp === p.maxHp) {
        this.notify("Здоровье уже полное");
        return true;
      }
      p.hp = Math.min(p.maxHp, p.hp + 45);
      p.healCooldown = 6;
      this.inventory.consumeSlot(this.inventory.selected);
      this.notify("+45 здоровья");
      return true;
    }
    if (d.kind === "armor") {
      const old = p.armor;
      p.armor = s.id;
      this.inventory.consumeSlot(this.inventory.selected);
      if (old) this.inventory.add(old);
      this.notify(`${d.name} надет · защита ${d.defense}`);
      return true;
    }
    if (d.kind === "upgrade") {
      if (s.id === "heart") {
        if (p.maxHp >= 180) {
          this.notify("Здоровье уже улучшено до 180");
          return true;
        }
        p.maxHp += 20;
        p.hp = Math.min(p.maxHp, p.hp + 20);
      } else {
        if (p.boots) {
          this.notify("Сапоги уже надеты");
          return true;
        }
        p.boots = true;
      }
      this.inventory.consumeSlot(this.inventory.selected);
      this.notify(d.name + " · улучшение получено");
      return true;
    }
    return false;
  }
  damage(amount: number, fromX: number) {
    const p = this.player;
    if (p.invulnerable > 0) return 0;
    const dmg = Math.max(1, amount - this.defense);
    p.hp -= dmg;
    p.invulnerable = 0.85;
    p.vx = (p.x >= fromX ? 1 : -1) * 170;
    p.vy = -135;
    if (p.hp <= 0) this.respawn();
    return dmg;
  }
  respawn() {
    const p = this.player;
    p.x = this.world.spawn.x;
    p.y = this.world.spawn.y;
    p.vx = p.vy = 0;
    p.hp = p.maxHp;
    p.invulnerable = 4;
    this.ensureSafePosition();
    this.notify("Возвращение к костру · вещи сохранены");
  }
  ensureSafePosition() {
    const p = this.player;
    if (!collides(this.world, p)) return;
    for (let y = 0; y < 30; y++)
      for (const dx of [0, -16, 16, -32, 32])
        if (
          !collides(
            this.world,
            p,
            this.world.spawn.x + dx,
            this.world.spawn.y - y * TILE,
          )
        ) {
          p.x = this.world.spawn.x + dx;
          p.y = this.world.spawn.y - y * TILE;
          return;
        }
    p.x = this.world.spawn.x;
    p.y = 0;
  }
  snapshot(): SaveData {
    const p = this.player;
    return {
      version: 1,
      seed: this.world.seed,
      changes: { ...this.world.changes },
      slots: this.inventory.slots.map((s) => (s ? { ...s } : null)),
      selected: this.inventory.selected,
      player: {
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        armor: p.armor,
        boots: p.boots,
      },
      time: this.time,
      bossDefeated: this.bossDefeated,
      bossRetry: this.bossRetry,
      chests: this.world.chests.map((c) => ({
        items: c.items.map((i) => ({ ...i })),
        opened: c.opened,
      })),
      drops: this.drops.map((d) => ({
        x: d.x,
        y: d.y,
        id: d.id,
        count: d.count,
      })),
      stats: { ...this.stats },
    };
  }
  save(storage?: Pick<Storage, "setItem">) {
    try {
      const snapshot = this.snapshot();
      if (!GameState.validSave(snapshot)) throw Error("Invalid state");
      (storage ?? globalThis.localStorage).setItem(
        SAVE_KEY,
        JSON.stringify(snapshot),
      );
      this.savedAt = new Date().toLocaleTimeString("ru", {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.saveError = "";
      return true;
    } catch {
      this.saveError =
        "Не удалось сохранить. Проверьте свободное место в браузере.";
      return false;
    }
  }
  static load(storage?: Pick<Storage, "getItem">): GameState {
    try {
      const raw = (storage ?? globalThis.localStorage).getItem(SAVE_KEY);
      if (!raw) return new GameState();
      const s = JSON.parse(raw) as SaveData;
      if (!GameState.validSave(s)) throw Error("Invalid save");
      const g = new GameState(s.seed);
      for (const [key, value] of Object.entries(s.changes)) {
        const n = Number(key);
        g.world.set(n % WIDTH, Math.floor(n / WIDTH), value);
      }
      g.inventory = new Inventory(s.slots);
      g.inventory.selected = s.selected;
      Object.assign(g.player, s.player);
      g.time = s.time;
      g.bossDefeated = s.bossDefeated;
      g.bossRetry = !!s.bossRetry;
      g.stats = s.stats ?? g.stats;
      s.chests.forEach((c, i) => {
        if (g.world.chests[i]) Object.assign(g.world.chests[i], c);
      });
      for (const d of s.drops ?? [])
        g.drops.push({
          ...d,
          vx: 0,
          vy: 0,
          w: 7,
          h: 7,
          grounded: false,
          age: 0,
        });
      g.ensureSafePosition();
      g.notify("Мир восстановлен · добро пожаловать домой");
      return g;
    } catch {
      const g = new GameState();
      g.notify("Сохранение недоступно. Запущен новый мир.");
      return g;
    }
  }
  static validSave(s: SaveData) {
    const stack = (v: Stack | null) =>
      v === null ||
      (v &&
        typeof v.id === "string" &&
        !!ITEMS[v.id] &&
        Number.isInteger(v.count) &&
        v.count > 0 &&
        v.count <= ITEMS[v.id].max);
    return (
      s?.version === 1 &&
      typeof s.seed === "string" &&
      s.seed.length <= 80 &&
      Array.isArray(s.slots) &&
      s.slots.length === 40 &&
      s.slots.every(stack) &&
      Number.isInteger(s.selected) &&
      s.selected >= 0 &&
      s.selected < 10 &&
      s.player &&
      [s.player.x, s.player.y, s.player.hp, s.player.maxHp, s.time].every(
        Number.isFinite,
      ) &&
      s.time >= 0 &&
      s.player.x >= 0 &&
      s.player.x < WIDTH * TILE &&
      s.player.y >= -200 &&
      s.player.y < HEIGHT * TILE &&
      s.player.maxHp >= 100 &&
      s.player.maxHp <= 180 &&
      s.player.hp > 0 &&
      s.player.hp <= s.player.maxHp &&
      (s.player.armor === null || ITEMS[s.player.armor]?.kind === "armor") &&
      typeof s.player.boots === "boolean" &&
      typeof s.bossDefeated === "boolean" &&
      s.changes &&
      Object.entries(s.changes).length <= WIDTH * HEIGHT &&
      Object.entries(s.changes).every(
        ([k, v]) =>
          Number.isInteger(+k) &&
          +k >= 0 &&
          +k < WIDTH * HEIGHT &&
          Number.isInteger(v) &&
          v >= 0 &&
          v < Block.Bedrock,
      ) &&
      Array.isArray(s.chests) &&
      s.chests.length <= 50 &&
      s.chests.every(
        (c) =>
          Array.isArray(c.items) &&
          c.items.every(stack) &&
          typeof c.opened === "boolean",
      ) &&
      (!s.drops ||
        (Array.isArray(s.drops) &&
          s.drops.every(
            (d) =>
              stack({ id: d.id, count: d.count }) &&
              [d.x, d.y].every(Number.isFinite) &&
              d.x >= 0 &&
              d.x < WIDTH * TILE &&
              d.y >= -200 &&
              d.y < HEIGHT * TILE,
          ))) &&
      (!s.stats ||
        Object.values(s.stats).every((n) => Number.isSafeInteger(n) && n >= 0))
    );
  }
}
