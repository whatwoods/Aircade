// Title attract demo (docs §4.6 A): synthwave sun behind the logo, 10 slowly spinning outline bricks in the upper
// field, 3 demo balls (orange / cyan / magenta) with trails bouncing between them, occasionally shattering a
// brick that fades back in somewhere else. Fixed pools, no allocation per frame.
import { pal } from '../config';
import type { Batcher } from './batcher';
import { col } from './batcher';
import type { Sprites } from './sprites';
import type { Particles } from '../fx/particles';
import { P_STRETCH, P_FADE_SQ, P_FLOOR, P_FADE_LATE, P_GROW } from '../fx/particles';
import { FR_SPARK, FR_TRI, FR_RING } from '../fx/feedback';
import { Rng } from '../core/rng';

const NB = 10;
const NBALL = 3;
const TRAIL = 12;
const BALL_HALO = [pal.fire, pal.ice, pal.blast];
const BALL_CORE = [0xffe0b0, 0xe8fdff, 0xffd6f6];
const X0 = 22;
const X1 = 368;
const Y0 = 84;
const Y1 = 540;

export class TitleDemo {
  private rng = new Rng(20261026);
  private bx = new Float32Array(NB);
  private by = new Float32Array(NB);
  private brot = new Float32Array(NB);
  private bvr = new Float32Array(NB);
  private bty = new Uint8Array(NB);
  private bhp = new Uint8Array(NB);
  private bfade = new Float32Array(NB);
  private bflash = new Float32Array(NB);
  private bdead = new Float32Array(NB);
  private px = new Float32Array(NBALL);
  private py = new Float32Array(NBALL);
  private vx = new Float32Array(NBALL);
  private vy = new Float32Array(NBALL);
  private tr = new Float32Array(NBALL * TRAIL * 2);
  private trHead = new Uint8Array(NBALL);
  private trN = new Uint8Array(NBALL);
  private trAcc = new Float32Array(NBALL);
  time = 0;

  constructor(private parts: Particles) {
    for (let i = 0; i < NB; i++) this.placeBrick(i, true);
    for (let k = 0; k < NBALL; k++) {
      this.px[k] = 80 + k * 115;
      this.py[k] = 470 - k * 60;
      const a = -Math.PI / 2 + (k - 1) * 0.7 + 0.25;
      this.vx[k] = Math.cos(a) * 230;
      this.vy[k] = Math.sin(a) * 230;
    }
  }

  private placeBrick(i: number, initial: boolean): void {
    const r = this.rng;
    // keep clear of the whole logo band (y 140–370) and the best badge so letters stay readable
    for (let tries = 0; tries < 40; tries++) {
      const x = r.range(X0 + 28, X1 - 28);
      const y = r.range(Y0 + 20, Y1 - 30);
      let ok = !(y > 134 && y < 376) && !(y > 384 && y < 452 && x > 110 && x < 280);
      for (let j = 0; ok && j < NB; j++) {
        if (j === i || (initial && j > i)) continue;
        const dx = this.bx[j]! - x;
        const dy = this.by[j]! - y;
        if (dx * dx + dy * dy < 64 * 64) ok = false;
      }
      if (ok || tries === 39) {
        this.bx[i] = x;
        this.by[i] = y;
        break;
      }
    }
    this.brot[i] = r.range(-0.4, 0.4);
    this.bvr[i] = r.range(-0.18, 0.18);
    this.bty[i] = r.next() < 0.3 ? 1 : 0;
    this.bhp[i] = this.bty[i] ? 3 : 2;
    this.bfade[i] = initial ? 1 : 0;
    this.bflash[i] = 0;
    this.bdead[i] = 0;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    for (let i = 0; i < NB; i++) {
      if (this.bdead[i]! > 0) {
        this.bdead[i]! -= dt;
        if (this.bdead[i]! <= 0) this.placeBrick(i, false);
        continue;
      }
      this.brot[i]! += this.bvr[i]! * dt;
      if (this.bfade[i]! < 1) this.bfade[i] = Math.min(1, this.bfade[i]! + dt / 0.6);
      if (this.bflash[i]! > 0) this.bflash[i]! -= dt;
    }
    for (let k = 0; k < NBALL; k++) {
      let x = this.px[k]! + this.vx[k]! * dt;
      let y = this.py[k]! + this.vy[k]! * dt;
      if (x < X0) { x = X0; this.vx[k] = Math.abs(this.vx[k]!); }
      if (x > X1) { x = X1; this.vx[k] = -Math.abs(this.vx[k]!); }
      if (y < Y0) { y = Y0; this.vy[k] = Math.abs(this.vy[k]!); }
      if (y > Y1) { y = Y1; this.vy[k] = -Math.abs(this.vy[k]!); }
      // bricks as rough circles (r 22 + ball 6)
      for (let i = 0; i < NB; i++) {
        if (this.bdead[i]! > 0 || this.bfade[i]! < 0.6) continue;
        const dx = x - this.bx[i]!;
        const dy = y - this.by[i]!;
        const d2 = dx * dx + dy * dy;
        if (d2 > 28 * 28 || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const dot = this.vx[k]! * nx + this.vy[k]! * ny;
        if (dot >= 0) continue;
        this.vx[k]! -= 2 * dot * nx;
        this.vy[k]! -= 2 * dot * ny;
        x = this.bx[i]! + nx * 28.5;
        y = this.by[i]! + ny * 28.5;
        this.hit(i, k, x, y);
      }
      this.px[k] = x;
      this.py[k] = y;
      // trail sample every ~16 ms
      this.trAcc[k]! += dt;
      if (this.trAcc[k]! >= 0.016) {
        this.trAcc[k] = 0;
        const h = this.trHead[k]!;
        const o = (k * TRAIL + h) * 2;
        this.tr[o] = x;
        this.tr[o + 1] = y;
        this.trHead[k] = (h + 1) % TRAIL;
        if (this.trN[k]! < TRAIL) this.trN[k]!++;
      }
    }
  }

  private hit(i: number, k: number, x: number, y: number): void {
    this.bflash[i] = 0.08;
    const c = BALL_HALO[k]!;
    const P = this.parts;
    const r = this.rng;
    for (let n = 0; n < 3; n++) {
      const a = r.next() * Math.PI * 2;
      P.spawn(FR_SPARK, x, y, Math.cos(a) * 160, Math.sin(a) * 160, 0.22, 3, 1, c, c, 0.9, 1, P_STRETCH | P_FADE_SQ, 0, 3);
    }
    if (--this.bhp[i]! > 0) return;
    // shatter
    const stroke = this.bty[i] ? pal.armored : pal.basic;
    for (let n = 0; n < 12; n++) {
      const a = r.next() * Math.PI * 2;
      const v = r.range(60, 200);
      P.spawn(FR_TRI, this.bx[i]! + r.range(-12, 12), this.by[i]! + r.range(-6, 6), Math.cos(a) * v, Math.sin(a) * v - 50, r.range(0.6, 0.9), r.range(3, 5), 2.5, stroke, stroke, 0.95, 0.55,
        P_FLOOR | P_FADE_LATE, 420, 1.2, r.next() * 6.28, r.range(-12, 12));
    }
    P.spawn(FR_RING, this.bx[i]!, this.by[i]!, 0, 0, 0.3, 8, 46, stroke, stroke, 0.8, 1, P_GROW | P_FADE_SQ);
    this.bdead[i] = 1.4;
  }

  draw(b: Batcher, s: Sprites): void {
    const t = this.time;
    // synthwave sun: 25 % alpha, slow breathing
    b.spriteR(s.sun, 195, 330, 120, 0, col(0xffffff, 0.25 + 0.03 * Math.sin(t * 0.8), 0));
    b.spriteR(s.glow, 195, 330, 210, 0, col(0x8a2a9e, 0.12, 1));
    // bricks: glow then body
    for (let i = 0; i < NB; i++) {
      if (this.bdead[i]! > 0) continue;
      const a = this.bfade[i]!;
      const stroke = this.bty[i] ? pal.armored : pal.basic;
      const y = this.by[i]! + Math.sin(t * 0.9 + i * 1.7) * 4;
      b.sprite(s.brickGlow, this.bx[i]!, y, 1, 1, this.brot[i]!, col(stroke, 0.28 * a, 1));
    }
    for (let i = 0; i < NB; i++) {
      if (this.bdead[i]! > 0) continue;
      const a = this.bfade[i]!;
      const y = this.by[i]! + Math.sin(t * 0.9 + i * 1.7) * 4;
      b.sprite(s.brick[this.bty[i]!]!, this.bx[i]!, y, 1, 1, this.brot[i]!, col(0xffffff, 0.75 * a, 0));
      if (this.bflash[i]! > 0) b.sprite(s.brickFlash, this.bx[i]!, y, 1, 1, this.brot[i]!, col(0xffffff, 0.8, 0.6));
    }
    // trails + balls
    for (let k = 0; k < NBALL; k++) {
      const c = BALL_HALO[k]!;
      const n = this.trN[k]!;
      let lx = this.px[k]!;
      let ly = this.py[k]!;
      for (let j = 0; j < n; j++) {
        const idx = (this.trHead[k]! - 1 - j + TRAIL * 2) % TRAIL;
        const o = (k * TRAIL + idx) * 2;
        const x = this.tr[o]!;
        const y = this.tr[o + 1]!;
        const f = 1 - j / TRAIL;
        b.line(s.strip, lx, ly, x, y, 10 * f + 2, col(c, 0.3 * f, 1));
        b.line(s.stripCore, lx, ly, x, y, 2.6 * f + 0.6, col(BALL_CORE[k]!, 0.8 * f, 0.6));
        lx = x;
        ly = y;
      }
      b.spriteR(s.glow, this.px[k]!, this.py[k]!, 18, 0, col(c, 0.55, 1));
      b.spriteR(s.disc, this.px[k]!, this.py[k]!, 6, 0, col(BALL_CORE[k]!, 1, 0.2));
    }
  }
}
