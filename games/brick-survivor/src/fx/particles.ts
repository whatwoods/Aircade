// SoA particle pool (Float32Array / Uint32Array), capped per quality tier; overflow overwrites round-robin.
import { mixHex, col } from '../render/batcher';
import type { Batcher } from '../render/batcher';
import type { Frame } from '../render/atlas';
import { config } from '../config';

export const P_STRETCH = 1;
export const P_FLOOR = 2;
export const P_GROW = 4; // size eases out (rings / shockwaves)
export const P_FADE_SQ = 8;
export const P_FADE_LATE = 16;
export const P_HIGH = 32; // drawn above balls (default: below)
export const P_SPIN_VEL = 64; // rotation follows velocity
export const P_FLICKER = 128;

const MAX = 2000;
const FLOOR = config.field.floorY;

export class Particles {
  cap = 1800;
  n = 0;
  private rr = 0;
  readonly x = new Float32Array(MAX);
  readonly y = new Float32Array(MAX);
  readonly vx = new Float32Array(MAX);
  readonly vy = new Float32Array(MAX);
  readonly grav = new Float32Array(MAX);
  readonly drag = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly maxLife = new Float32Array(MAX);
  readonly rot = new Float32Array(MAX);
  readonly vrot = new Float32Array(MAX);
  readonly s0 = new Float32Array(MAX);
  readonly s1 = new Float32Array(MAX);
  readonly sy = new Float32Array(MAX);
  readonly a0 = new Float32Array(MAX);
  readonly add = new Float32Array(MAX);
  readonly c0 = new Uint32Array(MAX);
  readonly c1 = new Uint32Array(MAX);
  readonly frame = new Uint8Array(MAX);
  readonly flags = new Uint16Array(MAX);
  frames: Frame[] = [];
  /** global multiplier applied to spawn counts (boss fights, low tiers) */
  density = 1;

  setCap(n: number): void {
    this.cap = Math.min(MAX, n);
    if (this.n > this.cap) this.n = this.cap;
  }

  clear(): void {
    this.n = 0;
  }

  spawn(
    frame: number, x: number, y: number, vx: number, vy: number, life: number,
    s0: number, s1: number, c0: number, c1: number, a0: number, add: number, flags: number,
    grav = 0, drag = 0, rot = 0, vrot = 0, sy = 1,
  ): void {
    let i: number;
    if (this.n < this.cap) i = this.n++;
    else {
      i = this.rr;
      this.rr = (this.rr + 1) % this.cap;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.c0[i] = c0;
    this.c1[i] = c1;
    this.a0[i] = a0;
    this.add[i] = add;
    this.flags[i] = flags;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.rot[i] = rot;
    this.vrot[i] = vrot;
    this.frame[i] = frame;
    this.sy[i] = sy;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    let i = 0;
    while (i < this.n) {
      const l = this.life[i]! - dt;
      if (l <= 0) {
        this.kill(i);
        continue;
      }
      this.life[i] = l;
      const d = this.drag[i]!;
      if (d > 0) {
        const k = Math.exp(-d * dt);
        this.vx[i] = this.vx[i]! * k;
        this.vy[i] = this.vy[i]! * k;
      }
      this.vy[i] = this.vy[i]! + this.grav[i]! * dt;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      let y = this.y[i]! + this.vy[i]! * dt;
      if (this.flags[i]! & P_FLOOR && y > FLOOR && this.vy[i]! > 0) {
        y = FLOOR;
        this.vy[i] = -this.vy[i]! * 0.35;
        this.vx[i] = this.vx[i]! * 0.7;
        this.vrot[i] = this.vrot[i]! * 0.5;
      }
      this.y[i] = y;
      this.rot[i] = this.rot[i]! + this.vrot[i]! * dt;
      i++;
    }
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]!;
    this.y[i] = this.y[j]!;
    this.vx[i] = this.vx[j]!;
    this.vy[i] = this.vy[j]!;
    this.grav[i] = this.grav[j]!;
    this.drag[i] = this.drag[j]!;
    this.life[i] = this.life[j]!;
    this.maxLife[i] = this.maxLife[j]!;
    this.rot[i] = this.rot[j]!;
    this.vrot[i] = this.vrot[j]!;
    this.s0[i] = this.s0[j]!;
    this.s1[i] = this.s1[j]!;
    this.sy[i] = this.sy[j]!;
    this.a0[i] = this.a0[j]!;
    this.add[i] = this.add[j]!;
    this.c0[i] = this.c0[j]!;
    this.c1[i] = this.c1[j]!;
    this.frame[i] = this.frame[j]!;
    this.flags[i] = this.flags[j]!;
  }

  draw(b: Batcher, high: boolean, time: number): void {
    const frames = this.frames;
    for (let i = 0; i < this.n; i++) {
      const fl = this.flags[i]!;
      if (((fl & P_HIGH) !== 0) !== high) continue;
      const t = 1 - this.life[i]! / this.maxLife[i]!;
      let a: number;
      if (fl & P_FADE_SQ) a = (1 - t) * (1 - t);
      else if (fl & P_FADE_LATE) a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      else a = 1 - t;
      if (fl & P_FLICKER) a *= 0.6 + 0.4 * Math.sin(time * 60 + i * 1.7);
      a *= this.a0[i]!;
      if (a <= 0.004) continue;
      const g = fl & P_GROW ? 1 - (1 - t) * (1 - t) * (1 - t) : t;
      const s = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * g;
      const fr = frames[this.frame[i]!]!;
      const c0 = this.c0[i]!;
      const c1 = this.c1[i]!;
      const c = col(c0 === c1 ? c0 : mixHex(c0, c1, t), a, this.add[i]!);
      const sc = s / fr.unit;
      if (fl & P_STRETCH) {
        const vx = this.vx[i]!;
        const vy = this.vy[i]!;
        const sp = Math.sqrt(vx * vx + vy * vy);
        const len = 1 + sp / 380;
        b.sprite(fr, this.x[i]!, this.y[i]!, sc * len, sc * this.sy[i]!, Math.atan2(vy, vx), c);
      } else {
        const r = fl & P_SPIN_VEL ? Math.atan2(this.vy[i]!, this.vx[i]!) : this.rot[i]!;
        b.sprite(fr, this.x[i]!, this.y[i]!, sc, sc * this.sy[i]!, r, c);
      }
    }
  }
}
