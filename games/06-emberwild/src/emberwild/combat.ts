import { TILE } from "./data";
import { Body, collides, lineClear, moveBody, overlaps } from "./physics";
import { GameState } from "./state";
export type EnemyKind =
  | "mossling"
  | "prowler"
  | "moth"
  | "spitter"
  | "scarab"
  | "crawler";
export const ENEMY_DEFS: Record<
  EnemyKind,
  {
    name: string;
    hp: number;
    damage: number;
    speed: number;
    fly?: boolean;
    color: number;
  }
> = {
  mossling: { name: "Моховик", hp: 32, damage: 9, speed: 32, color: 0x9eaf65 },
  prowler: {
    name: "Ночной бродяга",
    hp: 58,
    damage: 13,
    speed: 45,
    color: 0xb694aa,
  },
  moth: {
    name: "Пепельный мотылёк",
    hp: 26,
    damage: 10,
    speed: 52,
    fly: true,
    color: 0xccb592,
  },
  spitter: { name: "Споровик", hp: 52, damage: 13, speed: 22, color: 0xa99bcc },
  scarab: {
    name: "Дюнный бегун",
    hp: 44,
    damage: 12,
    speed: 88,
    color: 0xdca868,
  },
  crawler: {
    name: "Глубинный панцирник",
    hp: 78,
    damage: 17,
    speed: 39,
    color: 0x82bdc6,
  },
};
export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  cooldown: number;
  hit: number;
  age: number;
  facing: number;
}
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  enemy: boolean;
  life: number;
  gravity: boolean;
}
export interface Boss {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  timer: number;
  attack: number;
  phase: number;
  warn: number;
  targetX: number;
  hit: number;
}
export type Effect = (
  x: number,
  y: number,
  text: string,
  color?: number,
) => void;
export class Combat {
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  boss: Boss | null = null;
  spawnTimer = 4;
  nextId = 0;
  attackCooldown = 0;
  effect: Effect = () => {};
  lastPlayerX = 0;
  deathCount = 0;
  constructor(public state: GameState) {}
  spawn(kind: EnemyKind, x: number, y: number) {
    const d = ENEMY_DEFS[kind];
    const e: Enemy = {
      id: ++this.nextId,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      w: kind === "moth" ? 18 : 20,
      h: kind === "prowler" ? 27 : 16,
      grounded: false,
      hp: d.hp,
      maxHp: d.hp,
      cooldown: 0.5 + Math.random(),
      hit: 0,
      age: 0,
      facing: 1,
    };
    if (!collides(this.state.world, e)) this.enemies.push(e);
    return e;
  }
  spawnNearby() {
    const s = this.state,
      p = s.player,
      w = s.world,
      depth = w.depth(p.y / TILE),
      biome = w.biome(p.x / TILE);
    const max = s.night ? 12 : 7;
    if (this.enemies.length >= max) return;
    let kind: EnemyKind =
      depth === "deep"
        ? "crawler"
        : depth === "underground"
          ? Math.random() < 0.5
            ? "moth"
            : "spitter"
          : biome === "desert"
            ? "scarab"
            : biome === "wild"
              ? "spitter"
              : s.night
                ? Math.random() < 0.5
                  ? "prowler"
                  : "moth"
                : "mossling";
    const tx =
      Math.floor(p.x / TILE) +
      (Math.random() < 0.5 ? -1 : 1) * (17 + Math.floor(Math.random() * 10));
    if (tx < 3 || tx > 476) return;
    let ty =
      depth === "surface" ? w.surface[tx] - 3 : Math.floor(p.y / TILE) - 3;
    if (kind === "moth") {
      this.spawn(kind, tx * TILE, (ty - 3) * TILE);
      return;
    }
    for (let y = Math.max(3, ty); y < Math.min(155, ty + 18); y++)
      if (w.solid(tx, y + 1) && !w.solid(tx, y) && !w.solid(tx, y - 1)) {
        this.spawn(kind, tx * TILE, y * TILE - 14);
        break;
      }
  }
  hitEnemy(e: Enemy, damage: number, fromX: number) {
    e.hp -= damage;
    e.hit = 0.15;
    e.vx = (e.x >= fromX ? 1 : -1) * 125;
    e.vy = -85;
    this.effect(e.x + 10, e.y, String(damage), 0xffe7ac);
    if (e.hp <= 0) {
      this.state.stats.slain++;
      this.state.drop("gel", 1 + Math.floor(Math.random() * 3), e.x, e.y);
      if (Math.random() < 0.18) this.state.drop("potion", 1, e.x, e.y);
      if (e.kind === "crawler") this.state.drop("crystal", 1, e.x, e.y);
    }
  }
  hitBoss(damage: number) {
    const b = this.boss;
    if (!b) return;
    b.hp -= damage;
    b.hit = 0.15;
    this.effect(b.x, b.y - 35, String(damage), 0xffd77d);
    if (b.hp <= 0) {
      this.state.bossDefeated = true;
      this.state.bossRetry = false;
      const remain = this.state.inventory.add("relic", 1);
      if (remain) this.state.drop("relic", remain, b.x, b.y);
      this.state.drop("crystal", 14, b.x, b.y);
      this.state.player.maxHp = Math.min(180, this.state.player.maxHp + 20);
      this.state.player.hp = this.state.player.maxHp;
      this.state.notify(
        "Страж Корней повержен! Сердце исполина и +20 здоровья",
      );
      this.boss = null;
      this.projectiles = this.projectiles.filter((p) => !p.enemy);
      this.state.save();
    }
  }
  melee(damage: number, range = 64) {
    const p = this.state.player;
    for (const e of this.enemies)
      if (
        e.hp > 0 &&
        Math.hypot(e.x + 10 - p.x - 6, e.y + 10 - p.y - 13) < range &&
        (e.x - p.x) * p.facing > -15 &&
        lineClear(this.state.world, p.x + 6, p.y + 10, e.x + 10, e.y + 8)
      )
        this.hitEnemy(e, damage, p.x);
    if (
      this.boss &&
      Math.hypot(this.boss.x - p.x, this.boss.y - p.y) < range + 40
    )
      this.hitBoss(damage);
  }
  shoot(x: number, y: number, damage: number) {
    const p = this.state.player,
      angle = Math.atan2(y - p.y - 10, x - p.x - 6);
    if (this.state.inventory.remove("arrow"))
      this.projectiles.push({
        x: p.x + 6,
        y: p.y + 10,
        vx: Math.cos(angle) * 340,
        vy: Math.sin(angle) * 340,
        damage,
        enemy: false,
        life: 2.8,
        gravity: true,
      });
    else this.state.notify("Нужны стрелы: древесина + камень");
  }
  summon() {
    const s = this.state;
    if (this.boss) {
      s.notify("Страж уже пробудился");
      return false;
    }
    if (s.world.depth(s.player.y / TILE) !== "surface") {
      s.notify("Зов корней звучит только на поверхности");
      return false;
    }
    if (!s.bossRetry && !s.inventory.remove("sigil")) return false;
    s.bossRetry = true;
    this.boss = {
      x: s.player.x + 210,
      y: s.player.y - 110,
      vx: 0,
      vy: 0,
      hp: 1100,
      maxHp: 1100,
      timer: 0,
      attack: 0,
      phase: 1,
      warn: 0,
      targetX: s.player.x,
      hit: 0,
    };
    s.notify("Страж Корней · древний лес пробуждается");
    s.save();
    return true;
  }
  bossStep(dt: number) {
    const b = this.boss;
    if (!b) return;
    const p = this.state.player;
    b.timer += dt;
    b.hit = Math.max(0, b.hit - dt);
    b.phase = b.hp < b.maxHp * 0.5 ? 2 : 1;
    const cycle = b.phase === 2 ? 3.2 : 4.5;
    if (b.timer > cycle) {
      b.timer = 0;
      b.attack = (b.attack + 1) % 3;
      b.warn = 0.75;
      b.targetX = p.x;
    }
    if (b.warn > 0) {
      b.warn -= dt;
      b.x += (b.targetX - b.x) * dt * 1.4;
      b.y += (p.y - 105 - b.y) * dt * 2;
      if (b.warn <= 0) {
        if (b.attack === 0) {
          const angle = Math.atan2(p.y - b.y, p.x - b.x);
          for (let i = -2; i <= 2; i++)
            this.projectiles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(angle + i * 0.23) * (b.phase === 2 ? 180 : 130),
              vy: Math.sin(angle + i * 0.23) * (b.phase === 2 ? 180 : 130),
              damage: 19,
              enemy: true,
              life: 4,
              gravity: false,
            });
        } else if (b.attack === 1) {
          b.vx = (p.x > b.x ? 1 : -1) * (b.phase === 2 ? 260 : 200);
          b.vy = 90;
        } else {
          b.vx = 0;
          b.vy = 310;
        }
      }
    } else {
      if (b.attack === 0) {
        b.x += (p.x + Math.sin(b.timer) * 105 - b.x) * dt;
        b.y += (p.y - 65 - b.y) * dt;
      } else if (b.attack === 1 && b.timer < 1.5) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      } else if (b.attack === 2 && b.timer < 1.5) {
        b.y += b.vy * dt;
        if (b.y > p.y + 10) {
          b.vy = 0;
          b.y = p.y + 10;
          for (const dir of [-1, 1])
            if (this.projectiles.length < 60)
              this.projectiles.push({
                x: b.x,
                y: b.y,
                vx: dir * 140,
                vy: -20,
                damage: 22,
                enemy: true,
                life: 2,
                gravity: false,
              });
          b.timer = 1.5;
        }
      } else {
        b.y += (p.y - 95 - b.y) * dt * 2;
        b.x += (p.x + 120 - b.x) * dt;
      }
    }
    if (Math.hypot(b.x - p.x - 6, b.y - p.y - 13) < 42) this.hurt(23, b.x);
    if (Math.abs(b.x - p.x) > 1000 || p.y / TILE > 65) {
      this.boss = null;
      this.projectiles = [];
      this.state.notify(
        "Страж отступил. Повторный вызов доступен у проводника.",
      );
    }
  }
  hurt(damage: number, fromX: number) {
    const s = this.state;
    const died =
      s.player.invulnerable <= 0 &&
      s.player.hp <= Math.max(1, damage - s.defense);
    const x = s.player.x,
      y = s.player.y;
    const n = s.damage(damage, fromX);
    if (n) this.effect(x, y, `−${n}`, 0xff9c94);
    if (died) {
      this.deathCount++;
      this.enemies = [];
      this.projectiles = [];
      this.boss = null;
    }
  }
  update(dt: number) {
    const s = this.state,
      p = s.player;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnNearby();
      this.spawnTimer = s.night ? 2.2 : 5.5;
    }
    for (const e of [...this.enemies]) {
      if (e.hp <= 0) continue;
      e.age += dt;
      e.hit = Math.max(0, e.hit - dt);
      e.cooldown -= dt;
      const def = ENEMY_DEFS[e.kind],
        dx = p.x - e.x,
        dy = p.y - e.y;
      e.facing = dx >= 0 ? 1 : -1;
      if (e.hit <= 0) {
        if (def.fly) {
          e.vx = Math.sign(dx) * def.speed;
          e.vy = Math.sign(dy) * 35 + Math.sin(e.age * 4) * 25;
        } else {
          e.vx = e.facing * def.speed;
          if (e.kind === "spitter" && Math.abs(dx) < 190) e.vx = 0;
          if (
            e.grounded &&
            ((Math.abs(dx) > 25 &&
              s.world.solid(
                Math.floor((e.x + (e.facing > 0 ? e.w + 2 : -2)) / TILE),
                Math.floor((e.y + e.h - 3) / TILE),
              )) ||
              (e.kind === "mossling" && e.cooldown <= 0))
          ) {
            e.vy = -230;
            e.cooldown = 1.7;
          }
        }
      }
      if (
        e.kind === "spitter" &&
        e.cooldown <= 0 &&
        Math.abs(dx) < 300 &&
        lineClear(s.world, e.x, e.y, p.x, p.y)
      ) {
        const a = Math.atan2(dy, dx);
        this.projectiles.push({
          x: e.x + 10,
          y: e.y + 4,
          vx: Math.cos(a) * 130,
          vy: Math.sin(a) * 130,
          damage: 13,
          enemy: true,
          life: 3,
          gravity: false,
        });
        e.cooldown = 2.3;
      }
      moveBody(s.world, e, dt, !def.fly);
      if (overlaps(p, e)) this.hurt(def.damage, e.x);
    }
    this.enemies = this.enemies.filter(
      (e) => e.hp > 0 && Math.abs(e.x - p.x) < 850 && Math.abs(e.y - p.y) < 500,
    );
    this.bossStep(dt);
    for (const a of [...this.projectiles]) {
      a.life -= dt;
      if (a.gravity) a.vy += 140 * dt;
      const steps =
        Math.ceil(Math.max(Math.abs(a.vx * dt), Math.abs(a.vy * dt)) / 5) || 1;
      for (let n = 0; n < steps && a.life > 0; n++) {
        a.x += (a.vx * dt) / steps;
        a.y += (a.vy * dt) / steps;
        if (s.world.solid(Math.floor(a.x / TILE), Math.floor(a.y / TILE))) {
          a.life = 0;
          break;
        }
        if (a.enemy) {
          if (overlaps(p, { x: a.x - 3, y: a.y - 3, w: 6, h: 6 })) {
            this.hurt(a.damage, a.x);
            a.life = 0;
          }
        } else {
          for (const e of this.enemies)
            if (
              e.hp > 0 &&
              overlaps(e, { x: a.x - 3, y: a.y - 3, w: 6, h: 6 })
            ) {
              this.hitEnemy(e, a.damage, a.x - a.vx);
              a.life = 0;
              break;
            }
          if (
            a.life > 0 &&
            this.boss &&
            Math.hypot(this.boss.x - a.x, this.boss.y - a.y) < 40
          ) {
            this.hitBoss(a.damage);
            a.life = 0;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((a) => a.life > 0);
  }
}
