// 回放游标：两个游标（出手 / 显示），显示值统一延后一个投射物飞行时间，保证单调
import { BATTLE } from '../../config.ts';
import type { BattleEvent, BattleResult, Side } from '../types.ts';

export type EvFn = (e: BattleEvent) => void;

interface UnitTrack {
  fires: number[];
  k: number;
  est: number;
  side: Side;
}

export class Playback {
  res: BattleResult;
  /** 出手游标（战斗时间） */
  t = 0;
  /** 显示游标（战斗时间） */
  disp = 0;
  fi = 0;
  di = 0;
  speed = 1;
  /** 全部事件显示完后经过的真实秒数 */
  after = 0;
  finished = false;
  private stuns: [number, number][][] = [[], []];
  private units = new Map<number, UnitTrack>();

  constructor(res: BattleResult, est: Map<number, { side: Side; est: number }>) {
    this.res = res;
    for (const [uid, v] of est) this.units.set(uid, { fires: [], k: 0, est: v.est, side: v.side });
    for (const e of res.events) {
      if (e.type === 'fire' && e.uid !== undefined) {
        const u = this.units.get(e.uid);
        if (u) u.fires.push(e.t);
      } else if (e.type === 'stun') {
        const side = e.side;
        const list = this.stuns[side];
        const a = e.t;
        const b = e.t + (e.amount ?? 0);
        const last = list[list.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else list.push([a, b]);
      }
    }
  }

  /** 投射物飞行时间折算成战斗时间：真实 0.22/√速度 × 速度 */
  delay(): number {
    return BATTLE.projectileTime * Math.sqrt(this.speed);
  }

  /** realDt：真实秒（已含全局 timeScale 与新手慢放） */
  advance(realDt: number, onFire: EvFn, onShow: EvFn): void {
    const ev = this.res.events;
    const n = ev.length;
    this.t += realDt * this.speed;
    while (this.fi < n && ev[this.fi].t <= this.t) onFire(ev[this.fi++]);
    const d = this.t - this.delay();
    if (d > this.disp) this.disp = d;
    while (this.di < n && ev[this.di].t <= this.disp) onShow(ev[this.di++]);
    if (this.di >= n) {
      this.after += realDt;
      if (this.after >= BATTLE.endHold) this.finished = true;
    }
  }

  /** 直接跳到结尾（调试） */
  skipToEnd(onShow: EvFn): void {
    const ev = this.res.events;
    this.fi = ev.length;
    while (this.di < ev.length) onShow(ev[this.di++]);
    this.t = this.disp = this.res.duration;
    this.finished = true;
  }

  private stunOverlap(side: Side, a: number, b: number): number {
    let s = 0;
    for (const [x, y] of this.stuns[side]) {
      const lo = Math.max(a, x);
      const hi = Math.min(b, y);
      if (hi > lo) s += hi - lo;
    }
    return s;
  }

  isStunned(side: Side, t: number): boolean {
    for (const [x, y] of this.stuns[side]) if (t >= x && t < y) return true;
    return false;
  }

  /** 冷却环进度 0..1（按实际出手时间重建，扣除眩晕） */
  progress(uid: number): number {
    const u = this.units.get(uid);
    if (!u) return 0;
    const T = Math.min(this.t, this.res.duration);
    while (u.k < u.fires.length && u.fires[u.k] <= T) u.k++;
    const prev = u.k > 0 ? u.fires[u.k - 1] : 0;
    const el = T - prev - this.stunOverlap(u.side, prev, T);
    if (u.k < u.fires.length) {
      const next = u.fires[u.k];
      const tot = next - prev - this.stunOverlap(u.side, prev, next);
      return tot > 1e-6 ? Math.max(0, Math.min(1, el / tot)) : 1;
    }
    return Math.max(0, Math.min(0.97, el / Math.max(0.05, u.est)));
  }

  /** 最近一次出手后经过的战斗时间（用于"闪白后重置"） */
  sinceFire(uid: number): number {
    const u = this.units.get(uid);
    if (!u || u.k === 0) return 99;
    return this.t - u.fires[u.k - 1];
  }
}
