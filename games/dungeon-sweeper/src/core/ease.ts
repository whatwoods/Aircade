export type Ease = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const linear: Ease = (t) => t;
export const quadIn: Ease = (t) => t * t;
export const quadOut: Ease = (t) => t * (2 - t);
export const quadInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
export const cubicIn: Ease = (t) => t * t * t;
export const cubicOut: Ease = (t) => {
  const u = t - 1;
  return u * u * u + 1;
};
export const cubicInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1);
export const expoOut: Ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const sineInOut: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const backOut: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};
export const backOutStrong: Ease = (t) => {
  const c1 = 2.6;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};
export const elasticOut: Ease = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** 指数趋近（帧率无关）：rate = 每秒趋近比例常数 */
export const approach = (cur: number, target: number, rate: number, dtMs: number): number =>
  target + (cur - target) * Math.exp((-rate * dtMs) / 1000);
