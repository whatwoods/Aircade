/** 弹药队列（docs §3.5）：当前 + 下一个、交换、救场、失效重抽、翡翠灵珠 */
import { CONFIG } from '../config.ts';
import type { Rng } from '../core/rng.ts';
import type { Chain } from './chain.ts';

export class Ammo {
  current = 1;
  next = 1;
  wild = 0;
  armed = false;
  /** 引导脚本锁定时不重抽 */
  locked = false;
  private hist: number[] = [];
  private counts = new Int32Array(24);
  private rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  gen(chain: Chain): number {
    const cfg = chain.cfg;
    const maxL = cfg.sealLevel - 2;
    chain.visibleLevels(this.counts);
    const A = CONFIG.ammo;
    // 救场
    if (chain.headProgress() >= A.rescueFrom && this.rng.chance(A.rescueChance)) {
      const cand: number[] = [];
      for (let i = 0; i < Math.min(A.rescueHeadBalls, chain.balls.length); i++) {
        const b = chain.balls[i]!;
        if (b.level <= maxL && chain.track.hittable(b.s)) cand.push(b.level);
      }
      if (cand.length) return this.remember(this.rng.pick(cand));
    }
    let pick = this.weighted(cfg.lo, maxL);
    if (this.hist.length >= 2 && this.hist[0] === pick && this.hist[1] === pick) pick = this.weighted(cfg.lo, maxL);
    return this.remember(pick);
  }

  private weighted(lo: number, maxL: number): number {
    let tot = 0;
    for (let l = lo; l <= maxL; l++) if (this.counts[l]! > 0) tot += Math.sqrt(1 + this.counts[l]!) * Math.pow(CONFIG.ammo.decay, l - lo);
    if (tot <= 0) {
      // 没有可见候选：从任意存在的等级里取（含闸门内），再不行给 lo
      return lo;
    }
    let r = this.rng.next() * tot;
    for (let l = lo; l <= maxL; l++) {
      if (this.counts[l]! <= 0) continue;
      r -= Math.sqrt(1 + this.counts[l]!) * Math.pow(CONFIG.ammo.decay, l - lo);
      if (r <= 0) return l;
    }
    return lo;
  }

  private remember(l: number): number {
    this.hist.unshift(l);
    if (this.hist.length > 2) this.hist.length = 2;
    return l;
  }

  fill(chain: Chain): void {
    this.current = this.gen(chain);
    this.next = this.gen(chain);
  }

  /** 发射后补弹，返回射出的等级 */
  take(chain: Chain): number {
    const l = this.current;
    this.current = this.next;
    this.next = this.locked ? this.next : this.gen(chain);
    return l;
  }

  swap(): void {
    const t = this.current;
    this.current = this.next;
    this.next = t;
  }

  /** 等级在链上消失：返回 0=无变化 1=当前变 2=下一个变 3=都变 */
  reroll(chain: Chain): number {
    if (this.locked) return 0;
    let r = 0;
    if (chain.countLevel(this.current) <= 0 && chain.balls.length) {
      this.current = this.gen(chain);
      r |= 1;
    }
    if (chain.countLevel(this.next) <= 0 && chain.balls.length) {
      this.next = this.gen(chain);
      r |= 2;
    }
    return r;
  }
}
