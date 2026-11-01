/** 缓动函数与小工具 */
export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeOutBack = (t: number, s = 1.70158): number => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
export const easeOutElastic = (t: number): number =>
  t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
/** 0→1→0 的钟形 */
export const bell = (t: number): number => Math.sin(clamp(t) * Math.PI);
/** 进度：在 [a, b] 区间内从 0 到 1 */
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));

/** 指数趋近：用于数值显示缓动（帧率无关） */
export function approach(cur: number, target: number, dt: number, rate = 10): number {
  const k = 1 - Math.exp(-rate * dt);
  const v = cur + (target - cur) * k;
  return Math.abs(target - v) < 0.01 ? target : v;
}

/** 简单弹簧（临界阻尼附近） */
export class Spring {
  v = 0;
  x: number;
  target: number;
  k: number;
  d: number;
  constructor(x = 0, k = 260, d = 18) {
    this.k = k;
    this.d = d;
    this.x = x;
    this.target = x;
  }
  step(dt: number): number {
    const a = this.k * (this.target - this.x) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number): void {
    this.v += v;
  }
}
