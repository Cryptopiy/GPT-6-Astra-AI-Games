import { Block, TILE } from "./data";
import { HEIGHT, WIDTH, World } from "./world";
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  grounded: boolean;
  dropThrough?: number;
}
export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
export function collides(world: World, body: Body, x = body.x, y = body.y) {
  for (
    let yy = Math.floor(y / TILE);
    yy <= Math.floor((y + body.h - 0.001) / TILE);
    yy++
  )
    for (
      let xx = Math.floor(x / TILE);
      xx <= Math.floor((x + body.w - 0.001) / TILE);
      xx++
    )
      if (world.solid(xx, yy)) return true;
  return false;
}
export function moveBody(world: World, b: Body, dt: number, gravity = true) {
  if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) {
    b.x = world.spawn.x;
    b.y = world.spawn.y;
    b.vx = b.vy = 0;
  }
  dt = Math.min(0.05, Math.max(0, dt));
  if (gravity) b.vy = Math.min(440, b.vy + 760 * dt);
  b.dropThrough = Math.max(0, (b.dropThrough ?? 0) - dt);
  const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(b.vx * dt), Math.abs(b.vy * dt)) / 4),
    ),
    sub = dt / steps;
  b.grounded = false;
  for (let n = 0; n < steps; n++) {
    b.x += b.vx * sub;
    if (collides(world, b)) {
      if (b.vx > 0) b.x = Math.floor((b.x + b.w - 0.001) / TILE) * TILE - b.w;
      else if (b.vx < 0) b.x = (Math.floor(b.x / TILE) + 1) * TILE;
      b.vx = 0;
    }
    const bottom = b.y + b.h;
    b.y += b.vy * sub;
    let platform = false;
    if (b.vy >= 0 && !b.dropThrough) {
      const row = Math.floor((b.y + b.h) / TILE);
      if (bottom <= row * TILE + 0.1)
        for (
          let x = Math.floor(b.x / TILE);
          x <= Math.floor((b.x + b.w - 0.001) / TILE);
          x++
        )
          if (world.get(x, row) === Block.Platform) platform = true;
    }
    if (collides(world, b) || platform) {
      if (b.vy >= 0) {
        b.y = Math.floor((b.y + b.h - 0.001) / TILE) * TILE - b.h;
        if (platform)
          b.y = Math.floor((bottom + b.vy * sub) / TILE) * TILE - b.h;
        b.grounded = true;
      } else b.y = (Math.floor(b.y / TILE) + 1) * TILE;
      b.vy = 0;
    }
  }
  b.x = Math.max(TILE, Math.min(WIDTH * TILE - TILE - b.w, b.x));
  if (b.y > HEIGHT * TILE) b.y = (HEIGHT - 3) * TILE - b.h;
}
export function lineClear(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (
      world.solid(
        Math.floor((x1 + (x2 - x1) * t) / TILE),
        Math.floor((y1 + (y2 - y1) * t) / TILE),
      )
    )
      return false;
  }
  return true;
}
