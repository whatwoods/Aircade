import { CONFIG } from '../config';
import { rngGame } from '../core/rng';

/** 出生水果：权重、等级门控、按发射数加压、危险时救场偏向、防连号、开局序列（docs §3.7） */
export class Spawner {
  private history: number[] = [];
  private queue: number[] = [];

  reset(opening: readonly number[]): void {
    this.history.length = 0;
    this.queue.length = 0;
    for (const l of opening) this.queue.push(l);
  }

  /** 强制插入（引导用） */
  force(levels: readonly number[]): void {
    this.queue.length = 0;
    for (const l of levels) this.queue.push(l);
  }

  clearForced(): void {
    this.queue.length = 0;
  }

  maxAllowed(highest: number): number {
    const S = CONFIG.spawn;
    let m = S.maxStart;
    if (highest >= S.unlock4At) m = Math.max(m, 4);
    if (highest >= S.unlock5At) m = Math.max(m, 5);
    return Math.min(m, S.weights.length);
  }

  /**
   * @param shots 本局已发射数（加压曲线）
   * @param rescue 危险时最该救的那颗果的等级（0 = 无）；预警按 rescueChance、已越线按 rescueChanceOver 直接出这一级
   * @param over 是否已有水果越线（第 2 档）
   */
  roll(highest: number, shots = 0, rescue = 0, over = false): number {
    let lvl: number;
    const S = CONFIG.spawn;
    if (this.queue.length > 0) {
      lvl = this.queue.shift()!;
    } else if (rescue > 0 && rescue <= this.maxAllowed(highest) && rngGame.next() < (over ? S.rescueChanceOver : S.rescueChance)) {
      lvl = rescue;
    } else {
      this.ramp = Math.min(1, Math.max(0, (shots - S.rampStart) / S.rampShots));
      lvl = this.weighted(highest);
      const h = this.history;
      if (h.length >= S.maxSameInRow) {
        let same = true;
        for (let i = h.length - S.maxSameInRow; i < h.length; i++) if (h[i] !== lvl) same = false;
        if (same) lvl = this.weighted(highest, lvl);
      }
    }
    this.history.push(lvl);
    if (this.history.length > 8) this.history.shift();
    return lvl;
  }

  private ramp = 0;

  private weight(i: number): number {
    const S = CONFIG.spawn;
    return S.weights[i]! * (1 + (S.rampBoost[i] ?? 0) * this.ramp);
  }

  private weighted(highest: number, exclude = -1): number {
    const max = this.maxAllowed(highest);
    let total = 0;
    for (let i = 0; i < max; i++) if (i + 1 !== exclude) total += this.weight(i);
    let r = rngGame.next() * total;
    for (let i = 0; i < max; i++) {
      if (i + 1 === exclude) continue;
      r -= this.weight(i);
      if (r <= 0) return i + 1;
    }
    return 1;
  }
}
