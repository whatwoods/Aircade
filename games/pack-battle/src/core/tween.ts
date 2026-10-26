// 缓动函数 + Tween 池 + 数值滚动显示
import { Pool } from './pool.ts';

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Tw {
  obj: Record<string, number>;
  key: string;
  from: number;
  to: number;
  dur: number;
  t: number;
  delay: number;
  ease: Ease;
  done: (() => void) | null;
}

const pool = new Pool<Tw>(
  () => ({ obj: {}, key: '', from: 0, to: 0, dur: 0, t: 0, delay: 0, ease: ease.linear, done: null }),
  256,
  64,
);

/** obj[key] 从当前值缓动到 to；会替换同一对象同一字段上已有的 tween */
export function tween<T extends object>(o: T, key: keyof T & string, to: number, dur: number, e: Ease = ease.outCubic, delay = 0, done: (() => void) | null = null): void {
  const obj = o as unknown as Record<string, number>;
  const live = pool.live;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].obj === obj && live[i].key === key) pool.releaseAt(i);
  const tw = pool.get();
  tw.obj = obj;
  tw.key = key;
  tw.from = obj[key];
  tw.to = to;
  tw.dur = Math.max(1e-4, dur);
  tw.t = 0;
  tw.delay = delay;
  tw.ease = e;
  tw.done = done;
}

export function killTweens(o: object): void {
  const live = pool.live;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].obj === (o as unknown)) pool.releaseAt(i);
}

export function updateTweens(dt: number): void {
  const live = pool.live;
  for (let i = live.length - 1; i >= 0; i--) {
    const tw = live[i];
    if (tw.delay > 0) {
      tw.delay -= dt;
      if (tw.delay > 0) continue;
      tw.from = tw.obj[tw.key];
    }
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(k);
    if (k >= 1) {
      const d = tw.done;
      pool.releaseAt(i);
      if (d) d();
    }
  }
}

/** 数值滚动显示：350ms easeOutCubic，增加闪琥珀、减少闪红 */
export class Rolling {
  value: number;
  shown: number;
  private from: number;
  private t = 1;
  private dur: number;
  /** >0 增加闪烁，<0 减少闪烁，绝对值为剩余时间 */
  flash = 0;
  constructor(v: number, dur = 0.35) {
    this.value = this.shown = this.from = v;
    this.dur = dur;
  }
  set(v: number, instant = false): void {
    if (v === this.value && !instant) return;
    if (!instant) this.flash = v > this.value ? 0.45 : -0.45;
    this.from = this.shown;
    this.value = v;
    this.t = instant ? 1 : 0;
    if (instant) this.shown = v;
  }
  update(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    else if (this.flash < 0) this.flash = Math.min(0, this.flash + dt);
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    this.shown = this.from + (this.value - this.from) * ease.outCubic(this.t);
  }
  get int(): number {
    return Math.round(this.shown);
  }
}
