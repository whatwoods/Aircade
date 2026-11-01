/** 链条出生器（docs §3.11）：单颗 / 阶梯 / 山谷片段，保证不出现相邻相同 */
import { CONFIG, type StageCfg } from '../config.ts';
import type { Rng } from '../core/rng.ts';

export class Spawner {
  private buf: number[] = [];
  private last = -1;
  private cfg: StageCfg;
  private rng: Rng;

  constructor(cfg: StageCfg, rng: Rng) {
    this.cfg = cfg;
    this.rng = rng;
  }

  private single(): number {
    const { lo, hi } = this.cfg;
    let tot = 0;
    for (let k = lo; k <= hi; k++) tot += Math.pow(CONFIG.spawn.singleDecay, k - lo);
    let r = this.rng.next() * tot;
    for (let k = lo; k <= hi; k++) {
      r -= Math.pow(CONFIG.spawn.singleDecay, k - lo);
      if (r <= 0) return k;
    }
    return hi;
  }

  private refill(): void {
    const { lo, hi, stair } = this.cfg;
    const r = this.rng.next();
    const span = hi - lo + 1;
    if (r < stair && span >= 2) {
      const len = this.rng.int(CONFIG.spawn.stairLenMin, Math.min(CONFIG.spawn.stairLenMax, span));
      const start = this.rng.int(lo, hi - len + 1);
      const seq: number[] = [];
      for (let k = 0; k < len; k++) seq.push(start + k);
      if (this.rng.chance(0.5)) seq.reverse();
      this.buf.push(...seq);
    } else if (r < stair + CONFIG.spawn.valley && span >= 2) {
      const k = this.rng.int(lo, hi - 1);
      this.buf.push(k + 1, k, k + 1);
    } else {
      this.buf.push(this.single());
    }
  }

  next(): number {
    if (!this.buf.length) this.refill();
    let v = this.buf.shift()!;
    if (v === this.last) {
      v = v < this.cfg.hi ? v + 1 : v - 1;
      // 片段内下一颗也可能与之相同，丢弃片段剩余
      if (this.buf.length && this.buf[0] === v) this.buf.length = 0;
    }
    this.last = v;
    return v;
  }

  /** 引导/调试：重置相邻约束 */
  setLast(l: number): void {
    this.last = l;
  }
}
