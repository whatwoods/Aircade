// sfc32 可播种 PRNG + 字符串派生流

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  constructor(seed: number, stream = '') {
    const h = hashStr(stream);
    this.a = (seed ^ 0x9e3779b9) >>> 0;
    this.b = (h ^ 0x243f6a88) >>> 0;
    this.c = (seed * 31 + h) >>> 0;
    this.d = 1;
    for (let i = 0; i < 16; i++) this.next();
  }
  next(): number {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a >>> 0; this.b = b >>> 0; this.c = c >>> 0; this.d = d;
    return t / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}
