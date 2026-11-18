export const TILE = 16;
export enum Block {
  Air,
  Dirt,
  Grass,
  Stone,
  Sand,
  Snow,
  Moss,
  Copper,
  Iron,
  Crystal,
  Wood,
  Leaves,
  Platform,
  Torch,
  Workbench,
  Furnace,
  Anvil,
  Chest,
  Brick,
  Bedrock,
}
export type Biome = "forest" | "desert" | "snow" | "wild";
export const BIOMES: Record<
  Biome,
  { name: string; color: number; sky: number; far: number; near: number }
> = {
  forest: {
    name: "Вересковый лес",
    color: 0x77ac69,
    sky: 0x80b5bb,
    far: 0x668b8a,
    near: 0x355d57,
  },
  desert: {
    name: "Янтарные дюны",
    color: 0xe5b96c,
    sky: 0xd5b18c,
    far: 0xaf917b,
    near: 0x85705e,
  },
  snow: {
    name: "Тихие снега",
    color: 0xc0dde6,
    sky: 0xaccbd9,
    far: 0x849cba,
    near: 0x586e8b,
  },
  wild: {
    name: "Забытые заросли",
    color: 0xb598d1,
    sky: 0x9b9fbd,
    far: 0x776d9a,
    near: 0x474565,
  },
};
export interface TileDef {
  name: string;
  color: number;
  dark: number;
  light: number;
  solid: boolean;
  hardness: number;
  tier: number;
  drop?: string;
}
const tile = (
  name: string,
  color: number,
  dark: number,
  light: number,
  hardness = 1,
  tier = 0,
  drop?: string,
  solid = true,
): TileDef => ({ name, color, dark, light, hardness, tier, drop, solid });
export const BLOCKS: Record<Block, TileDef> = {
  [Block.Air]: tile("Воздух", 0, 0, 0, 0, 0, undefined, false),
  [Block.Dirt]: tile("Земля", 0x70503d, 0x493929, 0x946849, 0.55, 0, "dirt"),
  [Block.Grass]: tile("Дёрн", 0x77503e, 0x4a372e, 0x7fba65, 0.65, 0, "dirt"),
  [Block.Stone]: tile("Камень", 0x60616a, 0x40434e, 0x84828a, 1.35, 0, "stone"),
  [Block.Sand]: tile("Песок", 0xb99660, 0x997443, 0xe3be7e, 0.6, 0, "sand"),
  [Block.Snow]: tile("Снег", 0x9cb8c2, 0x7f99ac, 0xdeedf0, 0.6, 0, "snow"),
  [Block.Moss]: tile(
    "Мшистый камень",
    0x575570,
    0x3d3b52,
    0x93a76b,
    1.3,
    0,
    "stone",
  ),
  [Block.Copper]: tile(
    "Медная жила",
    0x62606a,
    0x41434d,
    0xe1a06b,
    1.7,
    0,
    "copperOre",
  ),
  [Block.Iron]: tile(
    "Железная жила",
    0x62606a,
    0x41434d,
    0xc5d5d8,
    2.1,
    1,
    "ironOre",
  ),
  [Block.Crystal]: tile(
    "Люменит",
    0x514b68,
    0x333044,
    0x89e3db,
    2.8,
    2,
    "crystal",
  ),
  [Block.Wood]: tile("Древесина", 0x8b6043, 0x593e31, 0xb58455, 0.9, 0, "wood"),
  [Block.Leaves]: tile(
    "Листва",
    0x476d45,
    0x35583c,
    0x7e9f58,
    0.22,
    0,
    "wood",
    false,
  ),
  [Block.Platform]: tile(
    "Платформа",
    0xb78655,
    0x6e4c35,
    0xdbb279,
    0.35,
    0,
    "platform",
    false,
  ),
  [Block.Torch]: tile(
    "Факел",
    0xefb95e,
    0x795341,
    0xffe4a1,
    0.15,
    0,
    "torch",
    false,
  ),
  [Block.Workbench]: tile(
    "Верстак",
    0xb68558,
    0x62462f,
    0xdab185,
    0.5,
    0,
    "workbench",
    false,
  ),
  [Block.Furnace]: tile(
    "Печь",
    0x7e7c80,
    0x414451,
    0xe9a259,
    0.8,
    0,
    "furnace",
    false,
  ),
  [Block.Anvil]: tile(
    "Наковальня",
    0x9aabb5,
    0x526274,
    0xd1dbdd,
    0.8,
    0,
    "anvil",
    false,
  ),
  [Block.Chest]: tile(
    "Сундук",
    0xb88545,
    0x664e38,
    0xecd18b,
    2,
    0,
    undefined,
    false,
  ),
  [Block.Brick]: tile("Кладка", 0x7c7a79, 0x4b4a50, 0xa59c8c, 1.1, 0, "brick"),
  [Block.Bedrock]: tile(
    "Основание мира",
    0x30313c,
    0x22232b,
    0x555364,
    999,
    99,
  ),
};
export type ItemKind =
  | "block"
  | "pick"
  | "axe"
  | "sword"
  | "bow"
  | "material"
  | "armor"
  | "heal"
  | "upgrade"
  | "summon";
export interface ItemDef {
  name: string;
  kind: ItemKind;
  color: string;
  description: string;
  max: number;
  block?: Block;
  tier?: number;
  power?: number;
  damage?: number;
  defense?: number;
}
const item = (
  name: string,
  kind: ItemKind,
  color: string,
  description: string,
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  name,
  kind,
  color,
  description,
  max: ["pick", "axe", "sword", "bow", "armor", "upgrade"].includes(kind)
    ? 1
    : 999,
  ...extra,
});
export const ITEMS: Record<string, ItemDef> = {
  dirt: item("Земля", "block", "#a87852", "Прочный блок для строительства.", {
    block: Block.Dirt,
  }),
  stone: item("Камень", "block", "#9393a4", "Для печи, кладки и стрел.", {
    block: Block.Stone,
  }),
  sand: item("Песок", "block", "#e3be7e", "Тёплый песчаный блок.", {
    block: Block.Sand,
  }),
  snow: item("Снег", "block", "#deedf0", "Блок из северных земель.", {
    block: Block.Snow,
  }),
  wood: item(
    "Древесина",
    "block",
    "#bd895e",
    "Добывайте стволы топором. Основа крафта.",
    { block: Block.Wood },
  ),
  brick: item("Кладка", "block", "#b5aa96", "Стены вашего убежища.", {
    block: Block.Brick,
  }),
  platform: item(
    "Платформа",
    "block",
    "#d8a873",
    "Можно прыгнуть снизу. S + Space — спуститься.",
    { block: Block.Platform },
  ),
  torch: item(
    "Факел",
    "block",
    "#ffd187",
    "Освещает пещеры. ПКМ — установить.",
    { block: Block.Torch },
  ),
  workbench: item(
    "Верстак",
    "block",
    "#c79a73",
    "Открывает рецепты поблизости.",
    { block: Block.Workbench },
  ),
  furnace: item(
    "Печь",
    "block",
    "#ffa566",
    "Переплавляет руду. Топливо — древесина.",
    { block: Block.Furnace },
  ),
  anvil: item(
    "Наковальня",
    "block",
    "#c2d5e4",
    "Позволяет ковать железо и люменит.",
    { block: Block.Anvil },
  ),
  copperOre: item(
    "Медная руда",
    "material",
    "#e0a273",
    "В верхних пещерах. 3 руды → 1 слиток.",
  ),
  ironOre: item(
    "Железная руда",
    "material",
    "#d5e1e6",
    "Нужна медная кирка. 3 руды → 1 слиток.",
  ),
  copperBar: item(
    "Медный слиток",
    "material",
    "#e8a16d",
    "Следующая ступень инструментов.",
  ),
  ironBar: item(
    "Железный слиток",
    "material",
    "#ccdce1",
    "Для железных инструментов и брони.",
  ),
  crystal: item(
    "Люменит",
    "material",
    "#7eeee2",
    "Глубинный кристалл. Нужна железная кирка.",
  ),
  gel: item(
    "Светящийся сок",
    "material",
    "#9fdb8b",
    "Выпадает из существ. Для факелов и лечения.",
  ),
  arrow: item("Стрела", "material", "#d7c3a0", "Боеприпас для любого лука."),
  relic: item(
    "Сердце исполина",
    "material",
    "#f9d98d",
    "Трофей Стража Корней. Для корневого клинка.",
  ),
  pick0: item(
    "Походная кирка",
    "pick",
    "#c9bd9f",
    "Камень и медь. Мощность I.",
    { tier: 0, power: 1, damage: 5 },
  ),
  pick1: item(
    "Медная кирка",
    "pick",
    "#e4aa78",
    "Добывает железо. Мощность II.",
    { tier: 1, power: 1.8, damage: 8 },
  ),
  pick2: item(
    "Железная кирка",
    "pick",
    "#c9e2e7",
    "Добывает люменит. Мощность III.",
    { tier: 2, power: 2.7, damage: 12 },
  ),
  pick3: item(
    "Люменитовая кирка",
    "pick",
    "#89efe0",
    "Быстрая добыча всех доступных жил.",
    { tier: 3, power: 4.3, damage: 20 },
  ),
  axe: item("Лесной топор", "axe", "#d8b883", "Быстро рубит дерево.", {
    power: 3,
    damage: 9,
  }),
  sword0: item(
    "Походный клинок",
    "sword",
    "#cbd6dd",
    "Ближний бой · урон 15.",
    { damage: 15 },
  ),
  sword1: item("Медный клинок", "sword", "#e8af7d", "Ближний бой · урон 23.", {
    damage: 23,
  }),
  sword2: item(
    "Железный клинок",
    "sword",
    "#d2e5e7",
    "Ближний бой · урон 34.",
    { damage: 34 },
  ),
  sword3: item(
    "Люменитовый клинок",
    "sword",
    "#8be6dd",
    "Ближний бой · урон 48.",
    { damage: 48 },
  ),
  rootblade: item(
    "Рассветная ветвь",
    "sword",
    "#ffdc8e",
    "Трофейный клинок · урон 78 · большой размах.",
    { damage: 78 },
  ),
  bow: item("Охотничий лук", "bow", "#d5ac79", "Расходует стрелы · урон 18.", {
    damage: 18,
  }),
  crystalBow: item(
    "Лук отголосков",
    "bow",
    "#91e4e0",
    "Редкая находка глубин · урон 33.",
    { damage: 33 },
  ),
  armor1: item(
    "Медный нагрудник",
    "armor",
    "#dca17a",
    "Используйте, чтобы надеть. Защита 3.",
    { defense: 3 },
  ),
  armor2: item(
    "Железный нагрудник",
    "armor",
    "#c0d7de",
    "Используйте, чтобы надеть. Защита 6.",
    { defense: 6 },
  ),
  armor3: item(
    "Люменитовый нагрудник",
    "armor",
    "#80d9d6",
    "Используйте, чтобы надеть. Защита 10.",
    { defense: 10 },
  ),
  potion: item(
    "Лесной настой",
    "heal",
    "#ee9b98",
    "Восстанавливает 45 здоровья. Перерыв 6 секунд.",
  ),
  heart: item(
    "Янтарное сердце",
    "upgrade",
    "#ffc980",
    "Используйте: навсегда +20 к здоровью (до 180).",
  ),
  boots: item(
    "Сапоги странника",
    "upgrade",
    "#dbc19d",
    "Используйте: выше прыжок и быстрее бег.",
  ),
  sigil: item(
    "Зов корней",
    "summon",
    "#bfe19a",
    "Используйте на поверхности: призвать Стража Корней.",
  ),
};
export interface Recipe {
  id: string;
  out: string;
  amount: number;
  needs: Record<string, number>;
  station?: "workbench" | "furnace" | "anvil";
}
const recipe = (
  out: string,
  amount: number,
  needs: Record<string, number>,
  station?: Recipe["station"],
): Recipe => ({ id: out, out, amount, needs, station });
export const RECIPES: Recipe[] = [
  recipe("workbench", 1, { wood: 10 }),
  recipe("torch", 6, { wood: 1, gel: 1 }),
  recipe("platform", 4, { wood: 1 }),
  recipe("potion", 1, { gel: 3, wood: 1 }),
  recipe("brick", 4, { stone: 4 }),
  recipe("arrow", 20, { wood: 1, stone: 1 }),
  recipe("furnace", 1, { stone: 20, wood: 6 }, "workbench"),
  recipe("bow", 1, { wood: 10 }, "workbench"),
  recipe("copperBar", 1, { copperOre: 3, wood: 1 }, "furnace"),
  recipe("ironBar", 1, { ironOre: 3, wood: 1 }, "furnace"),
  recipe("pick1", 1, { copperBar: 5, wood: 4 }, "workbench"),
  recipe("sword1", 1, { copperBar: 5, wood: 2 }, "workbench"),
  recipe("armor1", 1, { copperBar: 7 }, "workbench"),
  recipe("anvil", 1, { copperBar: 5, stone: 8 }, "workbench"),
  recipe("pick2", 1, { ironBar: 6, wood: 4 }, "anvil"),
  recipe("sword2", 1, { ironBar: 7, wood: 2 }, "anvil"),
  recipe("armor2", 1, { ironBar: 9 }, "anvil"),
  recipe("pick3", 1, { crystal: 10, ironBar: 3 }, "anvil"),
  recipe("sword3", 1, { crystal: 12, ironBar: 4 }, "anvil"),
  recipe("armor3", 1, { crystal: 15, ironBar: 5 }, "anvil"),
  recipe("sigil", 1, { crystal: 8, ironBar: 3, gel: 6 }, "anvil"),
  recipe("rootblade", 1, { relic: 1, crystal: 8 }, "anvil"),
];
export const STATION_NAMES = {
  workbench: "Верстак",
  furnace: "Печь",
  anvil: "Наковальня",
};
