import { ITEMS, Recipe } from "./data";
export interface Stack {
  id: string;
  count: number;
}
export class Inventory {
  slots: (Stack | null)[];
  selected = 0;
  revision = 0;
  constructor(slots?: (Stack | null)[]) {
    this.slots = Array.from({ length: 40 }, (_, i) =>
      slots?.[i] ? { ...slots[i]! } : null,
    );
  }
  get current() {
    return this.slots[this.selected];
  }
  count(id: string) {
    return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }
  add(id: string, count = 1): number {
    if (!ITEMS[id] || !Number.isSafeInteger(count) || count <= 0) return count;
    let left = count;
    for (const s of this.slots)
      if (s?.id === id) {
        const n = Math.min(left, ITEMS[id].max - s.count);
        s.count += n;
        left -= n;
        if (!left) break;
      }
    for (let i = 0; i < this.slots.length && left; i++)
      if (!this.slots[i]) {
        const n = Math.min(left, ITEMS[id].max);
        this.slots[i] = { id, count: n };
        left -= n;
      }
    if (left < count) this.revision++;
    return left;
  }
  remove(id: string, count = 1): boolean {
    if (!Number.isSafeInteger(count) || count <= 0 || this.count(id) < count)
      return false;
    let left = count;
    for (let i = 0; i < this.slots.length && left; i++) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const n = Math.min(left, s.count);
      s.count -= n;
      left -= n;
      if (!s.count) this.slots[i] = null;
    }
    this.revision++;
    return true;
  }
  consumeSlot(index: number): boolean {
    const s = this.slots[index];
    if (!s) return false;
    s.count--;
    if (!s.count) this.slots[index] = null;
    this.revision++;
    return true;
  }
  swap(a: number, b: number) {
    if (a < 0 || a >= 40 || b < 0 || b >= 40) return;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.revision++;
  }
  canCraft(r: Recipe, stations: Set<string>) {
    return (
      (!r.station || stations.has(r.station)) &&
      Object.entries(r.needs).every(([id, n]) => this.count(id) >= n)
    );
  }
  craft(r: Recipe, stations: Set<string>): boolean {
    if (!this.canCraft(r, stations)) return false;
    const draft = new Inventory(this.slots);
    for (const [id, n] of Object.entries(r.needs)) draft.remove(id, n);
    if (draft.add(r.out, r.amount)) return false;
    this.slots = draft.slots;
    this.revision++;
    return true;
  }
  static starter() {
    const i = new Inventory();
    for (const [id, count] of [
      ["pick0", 1],
      ["axe", 1],
      ["sword0", 1],
      ["torch", 12],
      ["wood", 20],
      ["platform", 16],
      ["potion", 3],
      ["bow", 1],
      ["arrow", 60],
      ["dirt", 30],
    ] as [string, number][])
      i.add(id, count);
    return i;
  }
}
