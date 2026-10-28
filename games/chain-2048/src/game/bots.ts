/**
 * 机器人（docs §3.13）：新手 / 认真 / 高手 / 贪心 / 乱射。模拟器与页面 autoplay 共用。
 * 都使用真实轨道几何：按 1° 扫描 360° 射线，得到「目标珠 + 插入侧」，再在等级数组上模拟连锁打分。
 */
import type { Rng } from '../core/rng.ts';
import type { Session } from './session.ts';
import type { Hit } from './shooter.ts';

export type BotKind = 'human' | 'casual' | 'novice' | 'careful' | 'expert' | 'greedy' | 'spam';

interface BotSpec {
  interval: number;
  /** 只认立即合成（看不到连锁） */
  shallow: boolean;
  /** 只看随机 1/3 方向的概率 */
  partial: number;
  errDeg: number;
  swap: boolean;
  wild: boolean;
  /** 灵珠只在能封印或链头 ≥0.75 时使用（真人通常舍不得用） */
  wildLimited?: boolean;
  lookNext: boolean;
}

export const BOTS: Record<BotKind, BotSpec> = {
  // 真人基准（阶段 3 主门槛）：约 2 s 一发，会看连锁，不交换，灵珠省着用
  human: { interval: 2.0, shallow: false, partial: 0, errDeg: 1.5, swap: false, wild: true, wildLimited: true, lookNext: false },
  // 普通玩家：约 2.4 s 一发，只认「能立刻合成」
  casual: { interval: 2.4, shallow: true, partial: 0.3, errDeg: 2, swap: false, wild: false, lookNext: false },
  novice: { interval: 1.6, shallow: true, partial: 0.6, errDeg: 2.5, swap: false, wild: false, lookNext: false },
  careful: { interval: 1.25, shallow: false, partial: 0, errDeg: 1, swap: true, wild: true, lookNext: false },
  expert: { interval: 1.0, shallow: false, partial: 0, errDeg: 0.5, swap: true, wild: true, lookNext: true },
  greedy: { interval: 1.25, shallow: true, partial: 0, errDeg: 1, swap: false, wild: false, lookNext: false },
  spam: { interval: 0.5, shallow: true, partial: 1, errDeg: 0, swap: false, wild: false, lookNext: false },
};

/** 在等级数组上模拟插入后的连锁（含三合一、封印、缺口回吸近似） */
export function simulateLevels(arr: number[], j: number, sealLevel: number): { steps: number; seals: number } {
  let steps = 0;
  let seals = 0;
  let guard = 0;
  while (guard++ < 40) {
    if (j < 0 || j >= arr.length) break;
    const L = arr[j]!;
    const f = j > 0 && arr[j - 1] === L;
    const r = j + 1 < arr.length && arr[j + 1] === L;
    if (f && r) {
      arr[j] = L + 2;
      arr.splice(j + 1, 1);
      arr.splice(j - 1, 1);
      j -= 1;
    } else if (f) {
      arr[j - 1] = L + 1;
      arr.splice(j, 1);
      j -= 1;
    } else if (r) {
      arr[j] = L + 1;
      arr.splice(j + 1, 1);
    } else break;
    steps++;
    if (arr[j]! >= sealLevel) {
      arr.splice(j, 1);
      seals++;
      if (j - 1 >= 0 && j < arr.length && arr[j - 1] === arr[j]) continue;
      break;
    }
  }
  return { steps, seals };
}

interface Cand {
  index: number;
  side: 0 | 1;
  angles: number[];
  t: number;
}

export class Bot {
  kind: BotKind;
  spec: BotSpec;
  private t = 0;
  private rng: Rng;
  private hit: Hit = { id: -2, index: -1, side: 0, x: 0, y: 0, t: 0, bx: 0, by: 0 };
  private cands = new Map<number, Cand>();

  constructor(kind: BotKind, rng: Rng) {
    this.kind = kind;
    this.spec = BOTS[kind];
    this.rng = rng;
    this.t = this.spec.interval * 0.5;
  }

  /** 每个逻辑步调用 */
  update(s: Session, dt: number): void {
    this.t -= dt;
    if (this.t > 0 || !s.canFire()) return;
    this.t = this.spec.interval * this.rng.range(0.8, 1.25);
    this.decide(s);
  }

  private scan(s: Session): void {
    this.cands.clear();
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180;
      if (!s.predict(a, this.hit)) continue;
      const key = this.hit.id * 2 + this.hit.side;
      let c = this.cands.get(key);
      if (!c) {
        c = { index: this.hit.index, side: this.hit.side, angles: [], t: this.hit.t };
        this.cands.set(key, c);
      }
      c.angles.push(a);
      if (this.hit.t < c.t) c.t = this.hit.t;
    }
  }

  private segLevels(s: Session, index: number): { arr: number[]; local: number } {
    const ch = s.chain;
    const st = ch.segStart(index), en = ch.segEnd(index);
    const arr: number[] = [];
    for (let i = st; i <= en; i++) arr.push(ch.balls[i]!.level);
    return { arr, local: index - st };
  }

  private evaluate(s: Session, c: Cand, level: number, wild: boolean): number {
    const { arr, local } = this.segLevels(s, c.index);
    const lv = wild ? arr[local]! : level;
    const j = local + c.side;
    arr.splice(j, 0, lv);
    const r = simulateLevels(arr, j, s.cfg.sealLevel);
    const sp = this.spec;
    if (sp.shallow) return r.steps > 0 ? 1 : 0;
    let v = r.steps + 6 * r.seals;
    if (r.steps === 0) {
      // 搭阶梯：邻居比自己大一级
      const nb = [arr[j - 1], arr[j + 1]];
      if (nb.includes(lv + 1)) v += 0.4;
      // 不在链头附近乱塞
      v -= 0.2 * (1 - c.index / Math.max(1, s.chain.balls.length));
    } else {
      v += 0.15 * (1 - c.index / Math.max(1, s.chain.balls.length));
    }
    return v;
  }

  private decide(s: Session): void {
    this.scan(s);
    if (!this.cands.size) return;
    const sp = this.spec;
    let list = [...this.cands.values()];
    if (this.kind === 'spam') {
      const c = this.rng.pick(list);
      s.fire(this.rng.pick(c.angles));
      return;
    }
    if (sp.partial > 0 && this.rng.chance(sp.partial)) {
      list = list.filter(() => this.rng.chance(1 / 3));
      if (!list.length) list = [this.rng.pick([...this.cands.values()])];
    }
    const am = s.ammo;
    let best: { v: number; c: Cand; opt: number } | null = null;
    const opts: number[] = [0];
    if (sp.swap) opts.push(1);
    if (sp.wild && am.wild > 0) opts.push(2);
    for (const c of list) {
      for (const o of opts) {
        const lv = o === 0 ? am.current : am.next;
        let v = this.evaluate(s, c, lv, o === 2);
        if (o === 2) {
          v -= 2.5; // 灵珠留给大连锁
          if (sp.wildLimited && v < 4 && s.chain.headProgress() < 0.75) continue;
        }
        if (this.kind === 'greedy') v = v > 0 ? 10 - c.t / 1000 : 0;
        if (!best || v > best.v + 1e-9) best = { v, c, opt: o };
      }
    }
    if (!best) return;
    if (this.kind === 'greedy' && best.v <= 0) best = { v: 0, c: this.rng.pick(list), opt: 0 };
    if (best.v <= 0 && !sp.shallow) {
      // 没有好位置：随机挑一个不在链头附近的
      const far = list.filter((c) => c.index > 3);
      if (far.length) best = { v: 0, c: this.rng.pick(far), opt: 0 };
    }
    if (sp.shallow && best.v <= 0) best = { v: 0, c: this.rng.pick(list), opt: 0 };
    if (best.opt === 1) s.swap();
    if (best.opt === 2) s.armWild();
    const ang = best.c.angles;
    let a = ang[Math.floor(ang.length / 2)]!;
    a += ((this.rng.next() * 2 - 1) * sp.errDeg * Math.PI) / 180;
    if (!s.fire(a) && best.opt === 2) s.armWild();
  }
}
