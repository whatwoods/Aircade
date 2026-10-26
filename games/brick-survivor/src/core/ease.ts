// Easing library (docs §2.5) — all functions map [0,1] → [0,1] (back/elastic overshoot).
export type Ease = (t: number) => number;

const c1 = 1.70158;
const c2 = c1 * 1.525;
const PI = Math.PI;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inBack: (t: number) => (c1 + 1) * t * t * t - c1 * t * t,
  outBack: (t: number) => 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  inOutBack: (t: number) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  outElastic: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1,
  inElastic: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * PI) / 3)),
  inSine: (t: number) => 1 - Math.cos((t * PI) / 2),
  outSine: (t: number) => Math.sin((t * PI) / 2),
  inOutSine: (t: number) => -(Math.cos(PI * t) - 1) / 2,
};

/** Back-out with adjustable overshoot. */
export function outBackK(t: number, k: number): number {
  const u = t - 1;
  return 1 + (k + 1) * u * u * u + k * u * u;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Exponential approach factor for frame-rate independent smoothing: v += (t-v)*approach(k,dt). */
export function approach(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Critically / under-damped spring on a scalar (docs §2.5). Mutates in place, zero allocation. */
export class Spring {
  v = 0;
  vel = 0;
  constructor(
    public target = 0,
    public k = 260,
    public damp = 18,
  ) {
    this.v = target;
  }
  update(dt: number): number {
    const f = -this.k * (this.v - this.target) - this.damp * this.vel;
    this.vel += f * dt;
    this.v += this.vel * dt;
    return this.v;
  }
  kick(impulse: number): void {
    this.vel += impulse;
  }
  set(v: number): void {
    this.v = v;
    this.vel = 0;
  }
}
