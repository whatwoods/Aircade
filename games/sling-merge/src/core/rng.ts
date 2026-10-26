/** sfc32 可播种 PRNG */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.reseed(seed);
  }

  reseed(seed: number): void {
    this.seed = seed >>> 0;
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = this.seed ^ 0xdeadbeef;
    for (let i = 0; i < 15; i++) this.next();
  }

  next(): number {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

function readSeed(): number {
  try {
    const p = new URLSearchParams(location.search).get('seed');
    if (p !== null && p !== '' && Number.isFinite(Number(p))) return Number(p) >>> 0;
  } catch {
    /* ignore */
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export const baseSeed = readSeed();
export const seedFixed = (() => {
  try {
    return new URLSearchParams(location.search).has('seed');
  } catch {
    return false;
  }
})();
/** 玩法随机：出生、引导布置、填充 */
export const rngGame = new Rng(baseSeed);
/** 视觉随机：眨眼、粒子、音乐动机 */
export const rngFx = new Rng(baseSeed + 1);
