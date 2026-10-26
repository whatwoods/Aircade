import { CONFIG } from '../config';
import { rngGame } from '../core/rng';

/** 出生水果：权重、等级门控、防连号、开局序列（docs §3.7） */
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

  roll(highest: number): number {
    let lvl: number;
    if (this.queue.length > 0) {
      lvl = this.queue.shift()!;
    } else {
      lvl = this.weighted(highest);
      const S = CONFIG.spawn;
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

  private weighted(highest: number, exclude = -1): number {
    const max = this.maxAllowed(highest);
    const w = CONFIG.spawn.weights;
    let total = 0;
    for (let i = 0; i < max; i++) if (i + 1 !== exclude) total += w[i]!;
    let r = rngGame.next() * total;
    for (let i = 0; i < max; i++) {
      if (i + 1 === exclude) continue;
      r -= w[i]!;
      if (r <= 0) return i + 1;
    }
    return 1;
  }
}
