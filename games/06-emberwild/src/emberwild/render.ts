import Phaser from "phaser";
import { BIOMES, Block, TILE } from "./data";
import { Combat } from "./combat";
import { GameState } from "./state";
import { CHUNK, HEIGHT, WIDTH } from "./world";
import { hex } from "./art";
export class WorldView {
  chunks = new Map<string, Phaser.GameObjects.Image>();
  bg: Phaser.GameObjects.Graphics;
  detail: Phaser.GameObjects.Graphics;
  effects: Phaser.GameObjects.Graphics;
  actors = new Map<number, Phaser.GameObjects.Sprite>();
  drops: Phaser.GameObjects.Image[] = [];
  player: Phaser.GameObjects.Sprite;
  guide: Phaser.GameObjects.Sprite;
  boss?: Phaser.GameObjects.Sprite;
  glow: Phaser.Textures.CanvasTexture;
  glowImage: Phaser.GameObjects.Image;
  lastLight = -1;
  constructor(
    public scene: Phaser.Scene,
    public state: GameState,
    public combat: Combat,
  ) {
    this.bg = scene.add.graphics().setScrollFactor(0).setDepth(-20);
    this.detail = scene.add.graphics().setDepth(2);
    this.effects = scene.add.graphics().setDepth(6);
    this.player = scene.add.sprite(0, 0, "hero").setDepth(5).setOrigin(0.5, 1);
    this.guide = scene.add
      .sprite(70 * TILE, state.world.surface[70] * TILE, "guide")
      .setDepth(4)
      .setOrigin(0.5, 1);
    this.glow = scene.textures.createCanvas("lighting", 800, 600)!;
    this.glowImage = scene.add
      .image(0, 0, "lighting")
      .setOrigin(0)
      .setDepth(10);
  }
  chunk(cx: number, cy: number) {
    const key = `${cx},${cy}`,
      textureKey = `chunk-${key}`;
    let image = this.chunks.get(key);
    let tex = this.scene.textures.get(
      textureKey,
    ) as Phaser.Textures.CanvasTexture;
    if (!image) {
      tex = this.scene.textures.createCanvas(
        textureKey,
        CHUNK * TILE,
        CHUNK * TILE,
      )!;
      image = this.scene.add
        .image(cx * CHUNK * TILE, cy * CHUNK * TILE, textureKey)
        .setOrigin(0)
        .setDepth(0);
      this.chunks.set(key, image);
    }
    const c = tex.context;
    c.clearRect(0, 0, CHUNK * TILE, CHUNK * TILE);
    for (let dy = 0; dy < CHUNK; dy++)
      for (let dx = 0; dx < CHUNK; dx++) {
        const x = cx * CHUNK + dx,
          y = cy * CHUNK + dy,
          b = this.state.world.get(x, y);
        if (!b || !this.state.world.inside(x, y)) continue;
        c.drawImage(
          this.scene.textures
            .get(`block${b}`)
            .getSourceImage() as HTMLCanvasElement,
          dx * TILE,
          dy * TILE,
        );
        if (b === Block.Leaves) {
          const biome = this.state.world.biome(x);
          if (biome === "snow" || biome === "wild") {
            c.globalCompositeOperation = "source-atop";
            c.fillStyle = biome === "snow" ? "#bdd5d978" : "#9b73ab75";
            c.fillRect(dx * TILE, dy * TILE, TILE, TILE);
            c.globalCompositeOperation = "source-over";
          }
        }
        if (
          b === Block.Chest &&
          this.state.world.chests.find((q) => q.x === x && q.y === y)?.opened
        ) {
          c.fillStyle = "#352e2bcc";
          c.fillRect(dx * TILE + 2, dy * TILE + 5, 12, 5);
        }
      }
    tex.refresh();
    this.state.world.dirty.delete(key);
    return image;
  }
  background(t: number) {
    const cam = this.scene.cameras.main,
      z = cam.zoom,
      w = cam.width / z,
      h = cam.height / z,
      p = this.state.player,
      biome = BIOMES[this.state.world.biome(p.x / TILE)],
      g = this.bg;
    const deep = p.y / TILE > 51,
      night = this.state.night;
    g.clear();
    g.fillStyle(deep ? 0x282d3b : night ? 0x253b50 : biome.sky);
    g.fillRect(0, 0, w, h);
    if (deep) {
      for (let i = 0; i < 36; i++) {
        const x =
            (((i * 137 - cam.scrollX * 0.15) % (w + 40)) + w + 40) % (w + 40),
          y = (((i * 79 - cam.scrollY * 0.12) % (h + 40)) + h + 40) % (h + 40);
        g.fillStyle(p.y / TILE > 102 ? 0x3e4057 : 0x39404a, 0.8);
        g.fillRect(x, y, 12 + (i % 3) * 9, 25 + (i % 4) * 12);
        g.fillStyle(0x748e9a, 0.18);
        g.fillRect(x, y, 2, 8);
      }
      return;
    }
    const horizon =
      this.state.world.surface[Math.floor(p.x / TILE)] * TILE - cam.scrollY;
    if (night) {
      g.fillStyle(0xd8e4d9, 0.65);
      for (let i = 0; i < 60; i++)
        g.fillRect(
          (i * 113) % Math.ceil(w),
          (i * 47) % Math.max(1, Math.ceil(horizon - 25)),
          i % 4 === 0 ? 2 : 1,
          1,
        );
    }
    const sunX =
        w * 0.72 + Math.sin((this.state.time / 720) * Math.PI * 2) * w * 0.16,
      sunY = Math.max(36, horizon * 0.32);
    g.fillStyle(night ? 0xe9e6c9 : 0xf6e0a1, 0.1);
    g.fillCircle(sunX, sunY, 29);
    g.fillStyle(night ? 0xe6e6ce : 0xffe8b1);
    g.fillCircle(sunX, sunY, 15);
    if (night) {
      g.fillStyle(0x253b50);
      g.fillCircle(sunX + 7, sunY - 5, 13);
    }
    if (!night) {
      g.fillStyle(0xe9eed8, 0.35);
      for (let i = 0; i < 6; i++) {
        const x =
          ((((i * 139 + t * 0.002 - cam.scrollX * 0.05) % (w + 140)) +
            w +
            140) %
            (w + 140)) -
          70;
        g.fillRect(x, 35 + (i % 3) * 23, 45, 5);
        g.fillRect(x + 9, 30 + (i % 3) * 23, 24, 7);
      }
    }
    for (let layer = 0; layer < 3; layer++) {
      g.fillStyle(
        night
          ? [0x304956, 0x2c424b, 0x233d40][layer]
          : [biome.far, biome.near, biome.near][layer],
        layer === 2 ? 0.75 : 1,
      );
      const speed = [0.12, 0.24, 0.42][layer],
        base = horizon + [15, 25, 35][layer];
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 5; x += 5) {
        const worldX = x + cam.scrollX * speed;
        const y =
          base -
          36 -
          layer * 7 -
          Math.sin(worldX * 0.013 + layer) * 22 -
          Math.sin(worldX * 0.034) * 13;
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fillPath();
      if (layer > 0)
        for (let i = -2; i < w / 42 + 3; i++) {
          const x = i * 42 - ((cam.scrollX * speed) % 42),
            height =
              36 +
              Math.abs(
                Math.sin((i + Math.floor((cam.scrollX * speed) / 42)) * 4.8),
              ) *
                50;
          const y = base - 16;
          if (this.state.world.biome(p.x / TILE) === "desert") {
            g.fillRect(x, y - height * 0.5, 4, height * 0.5);
            g.fillRect(x - 6, y - height * 0.35, 8, 4);
          } else {
            g.fillRect(x - 2, y - height, 4, height + 12);
            for (let tier = 0; tier < 3; tier++) {
              const ty = y - height + tier * height * 0.22;
              g.fillTriangle(
                x,
                ty - 9,
                x - 14 - tier * 5,
                ty + height * 0.45,
                x + 14 + tier * 5,
                ty + height * 0.45,
              );
            }
          }
        }
    }
  }
  update(t: number, dt: number) {
    const cam = this.scene.cameras.main,
      p = this.state.player,
      w = cam.width / cam.zoom,
      h = cam.height / cam.zoom;
    this.background(t);
    const x0 = Math.max(0, Math.floor(cam.scrollX / (CHUNK * TILE))),
      y0 = Math.max(0, Math.floor(cam.scrollY / (CHUNK * TILE))),
      x1 = Math.min(
        WIDTH / CHUNK - 1,
        Math.floor((cam.scrollX + w) / (CHUNK * TILE)),
      ),
      y1 = Math.min(
        HEIGHT / CHUNK - 1,
        Math.floor((cam.scrollY + h) / (CHUNK * TILE)),
      );
    for (const [key, img] of this.chunks) {
      const [x, y] = key.split(",").map(Number);
      img.setVisible(x >= x0 && x <= x1 && y >= y0 && y <= y1);
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const key = `${x},${y}`;
        if (!this.chunks.has(key) || this.state.world.dirty.has(key))
          this.chunk(x, y);
        this.chunks.get(key)!.setVisible(true);
      }
    this.player
      .setPosition(Math.round(p.x + 6), Math.round(p.y + p.h))
      .setFlipX(p.facing < 0)
      .setAlpha(p.invulnerable > 0 && Math.floor(t / 90) % 2 ? 0.45 : 1);
    this.player.setAngle(
      p.grounded && Math.abs(p.vx) > 10 ? Math.sin(t * 0.018) * 3 : 0,
    );
    this.player.setTint(
      p.armor === "armor3"
        ? 0xc5fff3
        : p.armor === "armor2"
          ? 0xdcebee
          : 0xffffff,
    );
    const active = new Set<number>();
    for (const e of this.combat.enemies) {
      active.add(e.id);
      let spr = this.actors.get(e.id);
      if (!spr) {
        spr = this.scene.add.sprite(0, 0, e.kind).setOrigin(0.5, 1).setDepth(4);
        this.actors.set(e.id, spr);
      }
      spr
        .setPosition(Math.round(e.x + e.w / 2), Math.round(e.y + e.h))
        .setFlipX(e.facing < 0)
        .setTint(e.hit > 0 ? 0xffefbd : 0xffffff)
        .setAngle(
          e.kind === "moth"
            ? Math.sin(t * 0.018) * 14
            : Math.sin(e.age * 8) * 2,
        );
    }
    for (const [id, spr] of this.actors)
      if (!active.has(id)) {
        spr.destroy();
        this.actors.delete(id);
      }
    while (this.drops.length < this.state.drops.length)
      this.drops.push(
        this.scene.add.image(0, 0, "spark").setDepth(3).setScale(0.65),
      );
    this.drops.forEach((img, i) => {
      const d = this.state.drops[i];
      img.setVisible(!!d);
      if (d)
        img
          .setTexture(`item-${d.id}`)
          .setPosition(d.x + 3, d.y + 3 + Math.sin(t * 0.004 + i) * 1.3);
    });
    const b = this.combat.boss;
    if (b) {
      if (!this.boss)
        this.boss = this.scene.add.sprite(0, 0, "boss").setDepth(5);
      this.boss
        .setVisible(true)
        .setPosition(b.x, b.y)
        .setTint(b.hit > 0 ? 0xffe0a4 : b.phase === 2 ? 0xf3c19b : 0xffffff)
        .setAngle(Math.sin(t * 0.002) * 7);
    } else this.boss?.setVisible(false);
    this.effects.clear();
    for (const a of this.combat.projectiles) {
      this.effects.lineStyle(a.enemy ? 3 : 1, a.enemy ? 0xbd97da : 0xf4d49e);
      this.effects.lineBetween(
        a.x,
        a.y,
        a.x - a.vx * 0.035,
        a.y - a.vy * 0.035,
      );
      this.effects.fillStyle(a.enemy ? 0xefbece : 0xf7e9bf);
      this.effects.fillRect(a.x - 1, a.y - 1, 2, 2);
    }
    if (b && b.warn > 0) {
      this.effects.lineStyle(2, 0xf5ba85, 0.65);
      this.effects.strokeCircle(b.x, b.y, 48 + (1 - b.warn) * 9);
      if (b.attack === 2) {
        this.effects.fillStyle(0xf5ba85, 0.16);
        this.effects.fillRect(b.targetX - 34, cam.scrollY, 68, h);
      }
    }
    this.detail.clear();
    this.detail.fillStyle(0xd5dda9, 0.55);
    for (let i = 0; i < 18; i++) {
      const x = cam.scrollX + ((i * 79 + t * 0.005) % w),
        y = cam.scrollY + ((i * 47 + Math.sin(t * 0.001 + i) * 9) % h);
      this.detail.fillRect(x, y, 1, 1);
    }
    // Local light mask updates at 10 Hz, independent from tiles and world simulation.
    if (t - this.lastLight > 100) {
      this.lastLight = t;
      const c = this.glow.context;
      if (this.glow.width !== Math.ceil(w) || this.glow.height !== Math.ceil(h))
        this.glow.setSize(Math.ceil(w), Math.ceil(h));
      c.clearRect(0, 0, w, h);
      const depth = p.y / TILE;
      const alpha =
        depth > 102 ? 0.78 : depth > 51 ? 0.65 : this.state.night ? 0.49 : 0.03;
      c.fillStyle = `rgba(12,17,32,${alpha})`;
      c.fillRect(0, 0, w, h);
      const light = (x: number, y: number, r: number, strength: number) => {
        const grad = c.createRadialGradient(x, y, 3, x, y, r);
        grad.addColorStop(0, `rgba(0,0,0,${strength})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = grad;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      };
      c.globalCompositeOperation = "destination-out";
      light(p.x + 6 - cam.scrollX, p.y + 12 - cam.scrollY, 68, 0.8);
      for (
        let ty = Math.max(0, Math.floor(cam.scrollY / TILE) - 5);
        ty < Math.min(HEIGHT, Math.ceil((cam.scrollY + h) / TILE) + 5);
        ty++
      )
        for (
          let tx = Math.max(0, Math.floor(cam.scrollX / TILE) - 5);
          tx < Math.min(WIDTH, Math.ceil((cam.scrollX + w) / TILE) + 5);
          tx++
        )
          if (this.state.world.get(tx, ty) === Block.Torch)
            light(
              tx * TILE + 8 - cam.scrollX,
              ty * TILE + 5 - cam.scrollY,
              88,
              1,
            );
      c.globalCompositeOperation = "source-over";
      this.glow.refresh();
    }
    this.glowImage.setPosition(cam.scrollX, cam.scrollY);
    void dt;
    void hex;
  }
  burst(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const particle = this.scene.add.rectangle(x, y, 2, 2, color).setDepth(11);
      this.scene.tweens.add({
        targets: particle,
        x: x + (Math.random() - 0.5) * 32,
        y: y - 8 - Math.random() * 24,
        alpha: 0,
        duration: 350 + Math.random() * 250,
        onComplete: () => particle.destroy(),
      });
    }
  }
  floating(x: number, y: number, text: string, color = 0xffe1a3) {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: hex(color),
        stroke: "#242833",
        strokeThickness: 2,
      })
      .setDepth(12);
    this.scene.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      duration: 800,
      onComplete: () => label.destroy(),
    });
  }
}
