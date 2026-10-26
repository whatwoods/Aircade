/** 可播种 PRNG（mulberry32） */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let a = (this.s = (this.s + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    a = (t ^ (t >>> 14)) >>> 0;
    return a / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** 整数哈希（用于从种子派生稳定的视觉随机） */
export function hash32(a: number, b = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x27d4eb2f), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return h >>> 0;
}

export function hash01(a: number, b = 0): number {
  return hash32(a, b) / 4294967296;
}

export function randomSeed(): number {
  try {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] % 1000000;
  } catch {
    return Math.floor(Math.random() * 1000000);
  }
}
