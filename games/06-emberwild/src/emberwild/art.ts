import Phaser from "phaser";
import { Block, BLOCKS, ITEMS } from "./data";
export const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
function texture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h)!;
  draw(t.context);
  t.refresh();
}
export function createArt(scene: Phaser.Scene) {
  for (const [key, d] of Object.entries(BLOCKS)) {
    const id = +key;
    if (!id) continue;
    texture(scene, `block${id}`, 16, 16, (c) => {
      const rect = (
        color: number,
        x: number,
        y: number,
        w: number,
        h: number,
      ) => {
        c.fillStyle = hex(color);
        c.fillRect(x, y, w, h);
      };
      if (id === Block.Torch) {
        rect(0x654332, 7, 6, 2, 10);
        rect(0xd8a364, 6, 7, 4, 2);
        rect(0xd98140, 6, 2, 4, 5);
        rect(0xffc779, 7, 0, 2, 7);
        rect(0xffefb6, 7, 2, 2, 3);
        return;
      }
      if (id === Block.Platform) {
        rect(d.dark, 0, 4, 16, 2);
        rect(d.color, 0, 0, 16, 4);
        rect(d.light, 0, 0, 16, 1);
        for (let x = 2; x < 16; x += 6) rect(d.dark, x, 1, 1, 2);
        return;
      }
      if (id === Block.Workbench) {
        rect(d.dark, 1, 8, 2, 8);
        rect(d.dark, 13, 8, 2, 8);
        rect(d.color, 0, 5, 16, 4);
        rect(d.light, 0, 5, 16, 1);
        rect(0x92999f, 8, 2, 5, 3);
        rect(0xd9b684, 3, 3, 2, 2);
        return;
      }
      if (id === Block.Furnace) {
        rect(d.dark, 1, 3, 14, 13);
        rect(d.color, 2, 2, 12, 13);
        rect(d.light, 6, 10, 4, 4);
        rect(0x36343e, 4, 6, 8, 8);
        rect(0xe28a49, 5, 10, 6, 4);
        rect(0xffd47b, 7, 11, 2, 3);
        rect(0x9d9a96, 4, 0, 8, 2);
        return;
      }
      if (id === Block.Anvil) {
        rect(d.dark, 4, 13, 9, 3);
        rect(d.color, 6, 6, 5, 8);
        rect(d.color, 1, 3, 14, 5);
        rect(d.light, 0, 2, 16, 2);
        rect(d.dark, 12, 5, 3, 2);
        return;
      }
      if (id === Block.Chest) {
        rect(d.dark, 1, 5, 14, 11);
        rect(d.color, 2, 4, 12, 11);
        rect(d.light, 2, 4, 12, 2);
        rect(0x725132, 2, 9, 12, 2);
        rect(0xead297, 3, 6, 1, 8);
        rect(0xead297, 12, 6, 1, 8);
        rect(0xffdfa0, 7, 8, 3, 4);
        return;
      }
      rect(d.color, 0, 0, 16, 16);
      rect(d.dark, 0, 15, 16, 1);
      rect(d.dark, 15, 0, 1, 16);
      for (let i = 0; i < 8; i++) {
        const x = (i * 7 + id * 3) % 14,
          y = (i * 11 + id * 5) % 14;
        rect(i % 2 ? d.dark : d.light, x, y, 2 + (i % 3), 1 + (i % 2));
      }
      if ([Block.Copper, Block.Iron, Block.Crystal].includes(id)) {
        for (const [x, y] of [
          [3, 3],
          [10, 5],
          [6, 10],
        ]) {
          rect(d.dark, x - 1, y - 1, 5, 5);
          rect(d.light, x, y, 3, 3);
          rect(0xe8e8d2, x, y, 1, 1);
        }
      }
      if ([Block.Grass, Block.Moss].includes(id)) {
        rect(id === Block.Moss ? 0x758759 : 0x659452, 0, 0, 16, 4);
        rect(d.light, 0, 0, 16, 2);
        for (let x = 1; x < 16; x += 4) rect(d.light, x, 2, 2, 3);
      }
      if (id === Block.Wood) {
        rect(d.dark, 0, 0, 2, 16);
        rect(d.light, 3, 0, 2, 16);
        rect(d.dark, 10, 3, 2, 6);
        rect(d.light, 12, 9, 2, 6);
      }
      if (id === Block.Brick) {
        rect(d.dark, 0, 7, 16, 1);
        rect(d.dark, 8, 0, 1, 7);
        rect(d.dark, 3, 8, 1, 7);
        rect(d.light, 0, 0, 16, 1);
      }
      if (id === Block.Leaves) {
        rect(d.dark, 0, 12, 16, 4);
        rect(d.light, 3, 2, 5, 2);
        rect(d.light, 9, 7, 5, 2);
      }
    });
  }
  texture(scene, "hero", 24, 32, (c) => {
    const r = (color: string, x: number, y: number, w: number, h: number) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    r("#25363e", 6, 3, 12, 27);
    r("#543d34", 8, 27, 4, 5);
    r("#543d34", 15, 27, 4, 5);
    r("#c57e3d", 5, 14, 14, 13);
    r("#e2a04c", 8, 12, 10, 13);
    r("#ffd178", 9, 13, 3, 12);
    r("#7b4b37", 4, 16, 4, 12);
    r("#cf985e", 17, 16, 4, 9);
    r("#e8c39a", 17, 22, 4, 4);
    r("#e9c8a2", 9, 5, 10, 8);
    r("#fff0cc", 11, 6, 7, 3);
    r("#3d3836", 16, 8, 2, 2);
    r("#854f32", 7, 3, 10, 3);
    r("#ba7538", 5, 1, 14, 4);
    r("#d69a4b", 3, 4, 18, 2);
    r("#704936", 4, 23, 15, 3);
    r("#eacc8e", 12, 23, 3, 3);
    r("#ead7ac", 5, 13, 3, 2);
  });
  texture(scene, "guide", 24, 32, (c) => {
    const r = (color: string, x: number, y: number, w: number, h: number) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    r("#393b40", 7, 4, 12, 27);
    r("#8aa69c", 6, 13, 14, 15);
    r("#567b73", 6, 18, 5, 12);
    r("#d3ccad", 9, 5, 9, 8);
    r("#d6d5ba", 8, 2, 12, 5);
    r("#ede3c3", 5, 6, 17, 2);
    r("#dedac4", 10, 10, 8, 5);
    r("#314549", 16, 8, 2, 2);
    r("#806347", 7, 28, 5, 4);
    r("#806347", 15, 28, 5, 4);
    r("#bba878", 22, 13, 2, 19);
  });
  const palettes: Record<string, string[]> = {
    mossling: ["#354e3d", "#829653", "#b6c77e"],
    prowler: ["#453f54", "#a2809b", "#ddd0bf"],
    moth: ["#645967", "#c6a581", "#e6d5ae"],
    spitter: ["#53435d", "#aa8fb8", "#d5b9d9"],
    scarab: ["#715442", "#c49554", "#f1c17a"],
    crawler: ["#344858", "#6d9dac", "#afe1df"],
  };
  for (const [key, p] of Object.entries(palettes))
    texture(scene, key, 28, 32, (c) => {
      const r = (color: string, x: number, y: number, w: number, h: number) => {
        c.fillStyle = color;
        c.fillRect(x, y, w, h);
      };
      if (key === "moth") {
        for (const [x, y, w, h] of [
          [0, 6, 10, 8],
          [3, 16, 8, 6],
          [18, 6, 10, 8],
          [17, 16, 8, 6],
        ]) {
          r(p[0], x, y, w, h);
          r(p[1], x + 1, y + 1, w - 3, h - 2);
        }
        r(p[2], 12, 9, 4, 17);
        r(p[0], 11, 6, 1, 6);
        r(p[0], 17, 6, 1, 6);
      } else if (key === "prowler") {
        r(p[0], 7, 3, 15, 28);
        r(p[1], 8, 6, 12, 12);
        r(p[1], 6, 15, 17, 10);
        r(p[0], 7, 24, 5, 8);
        r(p[0], 18, 24, 4, 8);
        r(p[2], 13, 11, 3, 2);
        r(p[2], 19, 11, 2, 2);
      } else {
        r(p[0], 3, 17, 23, 12);
        r(p[1], 5, 13, 18, 14);
        r(p[2], 8, 12, 12, 3);
        r(p[0], 1, 26, 5, 4);
        r(p[0], 21, 26, 5, 4);
        r(p[0], 10, 27, 5, 4);
        r("#eeead1", 16, 18, 3, 3);
        r("#2c363d", 17, 19, 2, 2);
        if (key === "spitter") {
          r(p[0], 12, 4, 6, 10);
          r(p[1], 5, 6, 19, 6);
          r(p[2], 9, 4, 11, 3);
        }
        if (key === "crawler") {
          for (let x = 6; x < 23; x += 5) r(p[0], x, 16, 2, 9);
        }
        if (key === "scarab") {
          r(p[0], 21, 7, 2, 8);
          r(p[2], 22, 5, 3, 4);
        }
      }
    });
  texture(scene, "boss", 96, 96, (c) => {
    const r = (color: string, x: number, y: number, w: number, h: number) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    for (const [x, y, w, h] of [
      [22, 12, 7, 24],
      [12, 4, 6, 22],
      [26, 3, 5, 15],
      [61, 8, 8, 30],
      [73, 3, 6, 22],
      [80, 18, 6, 14],
      [10, 43, 16, 8],
      [73, 44, 16, 8],
      [13, 52, 8, 23],
      [76, 52, 8, 23],
      [31, 69, 8, 22],
      [55, 69, 8, 22],
    ])
      r("#6c674a", x, y, w, h);
    r("#353f37", 23, 28, 49, 47);
    r("#69744e", 27, 25, 41, 46);
    r("#8c9560", 30, 23, 36, 8);
    r("#a4a96a", 26, 34, 10, 24);
    r("#4f6143", 58, 32, 9, 35);
    r("#253d39", 35, 39, 26, 23);
    r("#f9d584", 37, 41, 7, 5);
    r("#f9d584", 53, 41, 7, 5);
    r("#80c9a0", 43, 51, 12, 13);
    r("#d0e8aa", 46, 53, 6, 7);
    r("#a4b477", 19, 25, 10, 6);
    r("#a4b477", 67, 22, 11, 7);
    r("#c9b173", 13, 3, 4, 5);
    r("#c9b173", 74, 2, 4, 5);
  });
  texture(scene, "spark", 3, 3, (c) => {
    c.fillStyle = "#fff0b2";
    c.fillRect(0, 0, 3, 3);
  });
  for (const [id, d] of Object.entries(ITEMS))
    texture(scene, `item-${id}`, 16, 16, (c) => {
      c.fillStyle = d.color;
      if (d.block) {
        const src = scene.textures
          .get(`block${d.block}`)
          .getSourceImage() as HTMLCanvasElement;
        c.drawImage(src, 0, 0);
        return;
      }
      if (d.kind === "pick" || d.kind === "axe") {
        c.fillStyle = "#9a734e";
        c.fillRect(7, 5, 2, 11);
        c.fillStyle = d.color;
        c.fillRect(2, 2, 12, 3);
        c.fillRect(d.kind === "axe" ? 2 : 12, 4, 3, 4);
      } else if (d.kind === "sword") {
        c.fillRect(7, 1, 3, 10);
        c.fillStyle = "#ddb075";
        c.fillRect(4, 10, 9, 2);
        c.fillRect(7, 12, 3, 4);
      } else if (d.kind === "bow") {
        c.fillRect(6, 1, 2, 3);
        c.fillRect(9, 3, 2, 3);
        c.fillRect(11, 6, 2, 5);
        c.fillRect(9, 11, 2, 3);
        c.fillRect(6, 14, 2, 2);
        c.fillRect(6, 3, 1, 11);
      } else if (d.kind === "heal") {
        c.fillRect(6, 1, 4, 3);
        c.fillRect(4, 5, 8, 10);
        c.fillStyle = "#fae1c4";
        c.fillRect(5, 6, 2, 4);
      } else if (d.kind === "armor") {
        c.fillRect(4, 3, 9, 12);
        c.fillRect(1, 4, 14, 4);
        c.clearRect(6, 2, 4, 3);
        c.fillStyle = "#ffffff60";
        c.fillRect(5, 7, 2, 6);
      } else if (id === "arrow") {
        c.fillRect(7, 2, 2, 13);
        c.fillRect(5, 2, 6, 3);
      } else if (id.includes("Bar")) {
        c.fillRect(2, 6, 12, 7);
        c.fillStyle = "#ffffff50";
        c.fillRect(3, 6, 10, 2);
      } else {
        c.fillRect(5, 2, 6, 12);
        c.fillRect(2, 5, 12, 6);
        c.fillStyle = "#ffffff80";
        c.fillRect(5, 3, 3, 5);
      }
    });
}
export function itemDataUrls(scene: Phaser.Scene) {
  return Object.fromEntries(
    Object.keys(ITEMS).map((id) => [
      id,
      (
        scene.textures.get(`item-${id}`).getSourceImage() as HTMLCanvasElement
      ).toDataURL(),
    ]),
  );
}
