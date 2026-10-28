/** mulberry32：状态是一个 32 位整数，可存进 GameState，便于悔笔与复现。 */
export function nextRand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const ns = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, ns];
}

/** 独立的随机流（特效等，不进入存档） */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  next(): number {
    const [v, s] = nextRand(this.s);
    this.s = s;
    return v;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
