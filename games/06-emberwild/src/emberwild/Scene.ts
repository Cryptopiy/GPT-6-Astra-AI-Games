import Phaser from "phaser";
import { Block, BLOCKS, ITEMS, TILE } from "./data";
import { createArt, itemDataUrls } from "./art";
import { Combat } from "./combat";
import { moveBody } from "./physics";
import { WorldView } from "./render";
import { GameState } from "./state";
import { HEIGHT, WIDTH } from "./world";
export interface Bridge {
  state: GameState;
  scene: WildScene | null;
  icons: Record<string, string>;
  refresh: () => void;
  guideOpen: boolean;
  helpOpen: boolean;
  confirmOpen: boolean;
  closeConfirm?: () => void;
}
export class WildScene extends Phaser.Scene {
  state: GameState;
  combat: Combat;
  view!: WorldView;
  target!: Phaser.GameObjects.Graphics;
  keys = new Set<string>();
  pressed = new Set<string>();
  mining = { x: -1, y: -1, progress: 0 };
  aim = { x: 0, y: 0 };
  hint = "";
  saveTimer = 0;
  uiTimer = 0;
  housingTimer = 0;
  sheltered = false;
  swing = 0;
  stepAccumulator = 0;
  hasFocus = true;
  constructor(public bridge: Bridge) {
    super("Emberwild");
    this.state = bridge.state;
    this.combat = new Combat(this.state);
  }
  get blocked() {
    return (
      this.state.paused ||
      this.state.inventoryOpen ||
      this.bridge.guideOpen ||
      this.bridge.helpOpen ||
      this.bridge.confirmOpen ||
      !this.hasFocus ||
      document.hidden
    );
  }
  create() {
    createArt(this);
    this.bridge.scene = this;
    this.bridge.icons = itemDataUrls(this);
    this.view = new WorldView(this, this.state, this.combat);
    this.target = this.add.graphics().setDepth(12);
    const camera = this.cameras.main;
    camera.setOrigin(0, 0).setZoom(this.scale.width >= 1400 ? 3 : 2);
    camera.roundPixels = true;
    camera.scrollX = this.state.player.x - (camera.width / camera.zoom) * 0.46;
    camera.scrollY = this.state.player.y - (camera.height / camera.zoom) * 0.53;
    this.input.mouse?.disableContextMenu();
    this.game.canvas.tabIndex = 0;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.downElement === this.game.canvas)
        this.game.canvas.focus({ preventScroll: true });
    });
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown,
        dx: number,
        dy: number,
      ) => {
        if (this.blocked || !this.input.isOver) return;
        this.state.inventory.selected =
          (this.state.inventory.selected + (dy > 0 ? 1 : 9)) % 10;
        this.bridge.refresh();
        void dx;
      },
    );
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (this.bridge.confirmOpen && e.code === "Escape" && !e.repeat) {
        this.bridge.closeConfirm?.();
        return;
      }
      if (tag === "INPUT" || this.bridge.confirmOpen) return;
      if (e.code === "Escape" && !e.repeat) {
        if (this.state.inventoryOpen) this.state.inventoryOpen = false;
        else if (this.bridge.guideOpen) this.bridge.guideOpen = false;
        else if (this.bridge.helpOpen) this.bridge.helpOpen = false;
        else this.state.paused = !this.state.paused;
        this.keys.clear();
        this.pressed.clear();
        this.bridge.refresh();
        if (!this.blocked) this.game.canvas.focus({ preventScroll: true });
        return;
      }
      if (
        e.code === "KeyE" &&
        !e.repeat &&
        !this.state.paused &&
        !this.bridge.helpOpen
      ) {
        this.state.inventoryOpen = !this.state.inventoryOpen;
        this.bridge.guideOpen = false;
        this.keys.clear();
        this.pressed.clear();
        this.bridge.refresh();
        if (!this.blocked) this.game.canvas.focus({ preventScroll: true });
        return;
      }
      if (this.blocked || tag === "BUTTON") return;
      if (
        ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (/^Digit[0-9]$/.test(e.code)) {
        this.state.inventory.selected = (Number(e.code.slice(-1)) + 9) % 10;
        this.bridge.refresh();
      }
      if (e.code === "KeyH" && !e.repeat) {
        const inv = this.state.inventory,
          old = inv.selected,
          slot = inv.slots.findIndex((s) => s?.id === "potion");
        if (slot >= 0) {
          inv.selected = slot;
          this.state.useUtility();
          inv.selected = old;
        } else this.state.notify("Лесной настой: сок ×3 + древесина ×1");
      }
      if (e.code === "KeyF" && !e.repeat) this.interactNear();
      if (e.code === "KeyQ" && !e.repeat)
        this.state.dropSlot(this.state.inventory.selected);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => {
      this.keys.clear();
      this.pressed.clear();
      this.input.activePointer.reset();
      this.hasFocus = false;
      this.state.save();
    };
    const focus = () => {
      this.hasFocus = true;
    };
    const save = () => this.state.save();
    const visibility = () => {
      if (document.hidden) blur();
      else focus();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", visibility);
    const cleanup = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", visibility);
      if (this.bridge.scene === this) this.bridge.scene = null;
    };
    this.events.once("shutdown", cleanup);
    this.events.once("destroy", cleanup);
    this.combat.effect = (x, y, text, color) => {
      this.view.floating(x, y, text, color);
      this.view.burst(x, y, color ?? 0xffd29b);
    };
    this.bridge.refresh();
  }
  interactNear() {
    const p = this.state.player;
    if (Math.hypot(this.view.guide.x - p.x, this.view.guide.y - p.y) < 85) {
      this.bridge.guideOpen = !this.bridge.guideOpen;
      this.state.inventoryOpen = false;
      this.bridge.refresh();
      return;
    }
    const chest = this.state.world.chests.find(
      (c) => Math.hypot(c.x * TILE - p.x, c.y * TILE - p.y) < 70,
    );
    if (chest) {
      this.state.openChest(chest.x, chest.y);
      this.bridge.refresh();
    }
  }
  interact(tx: number, ty: number) {
    if (this.state.world.get(tx, ty) === Block.Chest) {
      this.state.openChest(tx, ty);
      return;
    }
    if (
      Math.hypot(
        tx * TILE - this.view.guide.x,
        ty * TILE - this.view.guide.y + 12,
      ) < 24 &&
      Math.hypot(
        this.state.player.x - this.view.guide.x,
        this.state.player.y - this.view.guide.y,
      ) < 95
    ) {
      this.bridge.guideOpen = true;
      this.bridge.refresh();
      return;
    }
    if (this.state.place(tx, ty)) {
      this.view.burst(tx * TILE + 8, ty * TILE + 8, 0xd6c69a);
      return;
    }
    const b = this.state.world.get(tx, ty);
    if (
      [Block.Workbench, Block.Furnace, Block.Anvil].includes(b) &&
      this.state.reach(tx, ty)
    ) {
      this.state.inventoryOpen = true;
      this.bridge.refresh();
    }
  }
  tool(dt: number) {
    const pointer = this.input.activePointer,
      cam = this.cameras.main,
      point = pointer.positionToCamera(cam) as Phaser.Math.Vector2;
    this.aim.x = Math.floor(point.x / TILE);
    this.aim.y = Math.floor(point.y / TILE);
    const tx = this.aim.x,
      ty = this.aim.y,
      p = this.state.player,
      id = this.state.world.get(tx, ty),
      def = BLOCKS[id],
      stack = this.state.inventory.current,
      item = stack ? ITEMS[stack.id] : undefined;
    this.target.clear();
    const reach = this.state.reach(tx, ty),
      place = item?.kind === "block" && id === Block.Air;
    this.hint =
      id !== Block.Air ? def.name : (item?.name ?? "Выберите предмет");
    if (!reach) this.hint = "Вне досягаемости";
    else if (def.tier > (item?.tier ?? 0) && def.drop)
      this.hint = `${def.name} · нужна ${def.tier === 2 ? "железная" : "медная"} кирка`;
    if (reach && pointer.y > 50 && pointer.y < this.scale.height - 100) {
      const ok = place ? this.state.canPlace(tx, ty) : true;
      this.target.lineStyle(1, ok ? 0xffdaa0 : 0xef8c7c, 0.85);
      this.target.strokeRect(
        tx * TILE + 0.5,
        ty * TILE + 0.5,
        TILE - 1,
        TILE - 1,
      );
      if (place) {
        this.target.fillStyle(ok ? 0xffd998 : 0xe88981, 0.2);
        this.target.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    if (pointer.downElement !== this.game.canvas || !this.input.isOver) {
      this.mining.progress = 0;
      return;
    }
    const down = pointer.leftButtonDown(),
      right = pointer.rightButtonDown();
    if (right && this.combat.attackCooldown <= 0) {
      this.interact(tx, ty);
      this.combat.attackCooldown = 0.17;
    }
    if (!down || !item) {
      this.mining.progress = 0;
      return;
    }
    p.facing = point.x >= p.x + 6 ? 1 : -1;
    if ((item.kind === "pick" || item.kind === "axe") && reach && def.drop) {
      if (this.mining.x !== tx || this.mining.y !== ty) {
        this.mining = { x: tx, y: ty, progress: 0 };
      }
      if ((item.tier ?? 0) < def.tier) return;
      const power =
        (item.power ?? 1) *
        (item.kind === "axe" && id !== Block.Wood && id !== Block.Leaves
          ? 0.18
          : 1);
      this.mining.progress += (dt * power) / def.hardness;
      this.swing = 0.25;
      this.target.lineStyle(1, 0xffe8b6, 0.85);
      const f = this.mining.progress;
      this.target.lineBetween(
        tx * TILE + 3,
        ty * TILE + 3,
        tx * TILE + 8,
        ty * TILE + 8,
      );
      if (f > 0.3)
        this.target.lineBetween(
          tx * TILE + 8,
          ty * TILE + 8,
          tx * TILE + 13,
          ty * TILE + 4,
        );
      if (f > 0.65)
        this.target.lineBetween(
          tx * TILE + 8,
          ty * TILE + 8,
          tx * TILE + 6,
          ty * TILE + 14,
        );
      this.target.fillStyle(0x25252e);
      this.target.fillRect(tx * TILE, ty * TILE - 5, TILE, 3);
      this.target.fillStyle(0xf2c281);
      this.target.fillRect(tx * TILE, ty * TILE - 5, TILE * Math.min(1, f), 3);
      if (f >= 1) {
        if (this.state.mine(tx, ty))
          this.view.burst(tx * TILE + 8, ty * TILE + 8, def.light);
        this.mining.progress = 0;
      }
    } else {
      this.mining.progress = 0;
      if (this.combat.attackCooldown > 0) return;
      if (
        item.kind === "sword" ||
        item.kind === "axe" ||
        item.kind === "pick"
      ) {
        this.combat.melee(
          item.damage ?? 5,
          stack?.id === "rootblade" ? 88 : 64,
        );
        this.swing = 0.25;
        this.combat.attackCooldown = 0.32;
      } else if (item.kind === "bow") {
        this.combat.shoot(point.x, point.y, item.damage ?? 18);
        this.combat.attackCooldown = 0.36;
        this.swing = 0.16;
      } else if (item.kind === "summon") {
        this.combat.summon();
        this.combat.attackCooldown = 0.7;
      } else if (this.state.useUtility()) this.combat.attackCooldown = 0.5;
    }
  }
  step(dt: number) {
    const s = this.state,
      p = s.player,
      blocked = this.blocked;
    if (blocked) {
      this.pressed.clear();
      this.target.clear();
      return;
    }
    s.time += dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.healCooldown = Math.max(0, p.healCooldown - dt);
    this.swing = Math.max(0, this.swing - dt);
    const direction =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
      speed = p.boots ? 140 : 112;
    if (p.invulnerable < 0.65 || p.invulnerable > 1)
      p.vx = Phaser.Math.Linear(p.vx, direction * speed, Math.min(1, dt * 15));
    if (direction) p.facing = direction;
    if (
      this.pressed.has("Space") ||
      this.pressed.has("KeyW") ||
      this.pressed.has("ArrowUp")
    ) {
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) {
        p.dropThrough = 0.28;
        p.y += 2;
        p.grounded = false;
      } else if (p.grounded) {
        p.vy = p.boots ? -340 : -290;
        p.grounded = false;
      }
    }
    this.pressed.clear();
    moveBody(s.world, p, dt);
    this.tool(dt);
    this.combat.update(dt);
    for (const d of s.drops) {
      d.age += dt;
      moveBody(s.world, d, dt);
      if (d.grounded) d.vx *= 0.85;
      const distance = Math.hypot(d.x - p.x, d.y - p.y - 13);
      if (distance < 54 && d.age > 0.25) {
        d.vx = (p.x - d.x) * 7;
        d.vy = (p.y + 13 - d.y) * 7;
      }
      if (distance < 24 && d.age > 0.3) {
        const left = s.inventory.add(d.id, d.count);
        if (left < d.count) {
          this.view.floating(
            d.x,
            d.y,
            `+${d.count - left} ${ITEMS[d.id].name}`,
            0xcbdca2,
          );
          d.count = left;
        }
      }
    }
    s.drops = s.drops.filter((d) => d.count > 0);
    s.notices.forEach((n) => (n.ttl -= dt));
    s.notices = s.notices.filter((n) => n.ttl > 0);
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      s.save();
    }
    this.housingTimer += dt;
    if (this.housingTimer > 2) {
      this.housingTimer = 0;
      this.sheltered = s.world.shelter(p.x + 6, p.y + 13);
      if (
        this.sheltered &&
        Math.hypot(p.x - this.view.guide.x, p.y - this.view.guide.y) > 100
      ) {
        this.view.guide.setPosition(p.x - 20, p.y + p.h);
        s.notify("Орин поселился в вашем убежище");
      }
    }
  }
  update(t: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.stepAccumulator += dt;
    while (this.stepAccumulator >= 1 / 60) {
      this.step(1 / 60);
      this.stepAccumulator -= 1 / 60;
    }
    const camera = this.cameras.main,
      p = this.state.player,
      w = camera.width / camera.zoom,
      h = camera.height / camera.zoom;
    camera.scrollX = Phaser.Math.Linear(
      camera.scrollX,
      Phaser.Math.Clamp(p.x - w * 0.47, 0, WIDTH * TILE - w),
      Math.min(1, dt * 7),
    );
    camera.scrollY = Phaser.Math.Linear(
      camera.scrollY,
      Phaser.Math.Clamp(p.y - h * 0.53, 0, HEIGHT * TILE - h),
      Math.min(1, dt * 6),
    );
    this.view.update(t, dt);
    if (this.swing > 0) {
      const angle = (0.25 - this.swing) * 18,
        p = this.state.player;
      this.view.effects.lineStyle(2, 0xffd599, 0.65);
      this.view.effects.beginPath();
      this.view.effects.arc(
        p.x + 6,
        p.y + 14,
        27,
        p.facing > 0 ? -1.4 + angle : -3.6 - angle,
        p.facing > 0 ? 0.2 + angle : -2 - angle,
        p.facing < 0,
      );
      this.view.effects.strokePath();
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.12) {
      this.uiTimer = 0;
      this.bridge.refresh();
    }
  }
}
