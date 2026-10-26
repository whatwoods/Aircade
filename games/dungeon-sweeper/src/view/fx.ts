import { CONFIG } from '../config';
import { clamp01, cubicOut, expoOut, quadIn } from '../core/ease';
import type { Mat, Sprite } from './gfx';
import type { GlyphFont } from './glyphs';
import type { Silhouettes } from './silhouettes';
import type { Textures } from './textures';

export const P = {
  Dust: 0,
  Spark: 1,
  Ember: 2,
  Smoke: 3,
  Chalk: 4,
  Coin: 5,
  Pink: 6,
  GoldDust: 7,
  Chip: 8,
  Bubble: 9,
  Fire: 10,
  Star: 11,
  Purple: 12,
} as const;
export type PType = (typeof P)[keyof typeof P];

/** 0 = 棋盘空间（随震屏），1 = 屏幕空间（HUD） */
export type Space = 0 | 1;

const STEP = 1000 / 120;

/**
 * 粒子 / 碎片 / 刀光 / 跳字 / 光点 / 环形波（文档 §9：SoA 池、交换删除、固定步长）。
 */
export class Fx {
  // ---------------- particles
  readonly cap: number;
  pCount = 0;
  private px: Float32Array;
  private py: Float32Array;
  private pvx: Float32Array;
  private pvy: Float32Array;
  private pg: Float32Array;
  private pdrag: Float32Array;
  private plife: Float32Array;
  private pmax: Float32Array;
  private ps0: Float32Array;
  private ps1: Float32Array;
  private prot: Float32Array;
  private pspin: Float32Array;
  private pa: Float32Array;
  private ptype: Uint8Array;
  private pspace: Uint8Array;
  capScale = 1;
  // ---------------- shards
  sCount = 0;
  private sx: Float32Array;
  private sy: Float32Array;
  private svx: Float32Array;
  private svy: Float32Array;
  private srot: Float32Array;
  private sspin: Float32Array;
  private slife: Float32Array;
  private smax: Float32Array;
  private sset: Uint8Array;
  private sidx: Uint8Array;
  private sscale: Float32Array;
  private sglow: Uint8Array;
  // ---------------- slashes
  private sl: { x: number; y: number; ang: number; t: number; dur: number; len: number; on: boolean; space: Space }[] = [];
  // ---------------- rings
  private rings: { x: number; y: number; t: number; dur: number; r0: number; r1: number; a: number; spr: number; on: boolean; space: Space }[] = [];
  // ---------------- float texts
  private ft: {
    on: boolean;
    font: GlyphFont | null;
    spr: Sprite | null;
    v: number;
    prefix: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
    fly: boolean;
    t: number;
    dur: number;
    sc: number;
    space: Space;
    rise: number;
  }[] = [];
  // ---------------- orbs
  private orbs: {
    on: boolean;
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    x1: number;
    y1: number;
    t: number;
    dur: number;
    pink: boolean;
    cb: (() => void) | null;
    trail: number;
    spr: Sprite | null;
    sz: number;
  }[] = [];
  // ---------------- bursts（升级光芒）
  private bursts: { on: boolean; x: number; y: number; t: number; dur: number; sc: number; space: Space }[] = [];

  private tex: Textures;
  private sil: Silhouettes;
  private acc = 0;
  time = 0;
  private rnd = 1;

  constructor(tex: Textures, sil: Silhouettes) {
    this.tex = tex;
    this.sil = sil;
    const C = CONFIG.fx.maxParticles;
    this.cap = C;
    this.px = new Float32Array(C);
    this.py = new Float32Array(C);
    this.pvx = new Float32Array(C);
    this.pvy = new Float32Array(C);
    this.pg = new Float32Array(C);
    this.pdrag = new Float32Array(C);
    this.plife = new Float32Array(C);
    this.pmax = new Float32Array(C);
    this.ps0 = new Float32Array(C);
    this.ps1 = new Float32Array(C);
    this.prot = new Float32Array(C);
    this.pspin = new Float32Array(C);
    this.pa = new Float32Array(C);
    this.ptype = new Uint8Array(C);
    this.pspace = new Uint8Array(C);
    const S = CONFIG.fx.maxShards;
    this.sx = new Float32Array(S);
    this.sy = new Float32Array(S);
    this.svx = new Float32Array(S);
    this.svy = new Float32Array(S);
    this.srot = new Float32Array(S);
    this.sspin = new Float32Array(S);
    this.slife = new Float32Array(S);
    this.smax = new Float32Array(S);
    this.sset = new Uint8Array(S);
    this.sidx = new Uint8Array(S);
    this.sscale = new Float32Array(S);
    this.sglow = new Uint8Array(S);
    for (let i = 0; i < 12; i++) this.sl.push({ x: 0, y: 0, ang: 0, t: 0, dur: 0, len: 1, on: false, space: 0 });
    for (let i = 0; i < 20; i++) this.rings.push({ x: 0, y: 0, t: 0, dur: 0, r0: 0, r1: 0, a: 0, spr: 0, on: false, space: 0 });
    for (let i = 0; i < CONFIG.fx.maxFloatTexts; i++)
      this.ft.push({ on: false, font: null, spr: null, v: 0, prefix: 0, x: 0, y: 0, tx: 0, ty: 0, fly: false, t: 0, dur: 0, sc: 1, space: 0, rise: 0 });
    for (let i = 0; i < CONFIG.fx.maxOrbs; i++)
      this.orbs.push({ on: false, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, t: 0, dur: 0, pink: false, cb: null, trail: 0, spr: null, sz: 16 });
    for (let i = 0; i < 6; i++) this.bursts.push({ on: false, x: 0, y: 0, t: 0, dur: 0, sc: 1, space: 1 });
  }

  r(): number {
    // xorshift：避免 Math.random 的不可复现与开销差异
    let s = this.rnd;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.rnd = s >>> 0 || 1;
    return this.rnd / 4294967296;
  }
  rr(a: number, b: number): number {
    return a + (b - a) * this.r();
  }

  // ------------------------------------------------------------ spawn
  spawn(
    type: PType,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    size1 = size,
    g = 0,
    drag = 0,
    space: Space = 0,
    alpha = 1,
  ): void {
    const cap = Math.floor(this.cap * this.capScale);
    if (this.pCount >= cap) return;
    const i = this.pCount++;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pg[i] = g;
    this.pdrag[i] = drag;
    this.plife[i] = 0;
    this.pmax[i] = life;
    this.ps0[i] = size;
    this.ps1[i] = size1;
    this.prot[i] = this.r() * 6.28;
    this.pspin[i] = this.rr(-6, 6);
    this.pa[i] = alpha;
    this.ptype[i] = type;
    this.pspace[i] = space;
  }

  /** 放射爆发 */
  burst(type: PType, x: number, y: number, n: number, spMin: number, spMax: number, life: number, size: number, g = 0, up = 0, space: Space = 0, size1 = size * 0.3): void {
    for (let k = 0; k < n; k++) {
      const a = this.r() * Math.PI * 2;
      const sp = this.rr(spMin, spMax);
      this.spawn(type, x, y, Math.cos(a) * sp, Math.sin(a) * sp - up, life * this.rr(0.7, 1.2), size * this.rr(0.7, 1.2), size1, g, 1.2, space);
    }
  }

  shatter(set: number, cx: number, cy: number, scale = 1, glow = false, power = 1): void {
    const sil = set === 13 ? this.sil.rise : this.sil.mon[set];
    if (!sil) return;
    for (let k = 0; k < sil.shards.length; k++) {
      if (this.sCount >= CONFIG.fx.maxShards) return;
      const sh = sil.shards[k];
      const i = this.sCount++;
      const ox = sh.ox * scale;
      const oy = sh.oy * scale;
      const len = Math.hypot(ox, oy) || 1;
      const sp = this.rr(120, 260) * power;
      this.sx[i] = cx + ox;
      this.sy[i] = cy + oy;
      this.svx[i] = (ox / len) * sp + this.rr(-30, 30);
      this.svy[i] = (oy / len) * sp - this.rr(80, 200) * power;
      this.srot[i] = 0;
      this.sspin[i] = this.rr(-9, 9);
      this.slife[i] = 0;
      this.smax[i] = set === 13 ? 1300 : 700;
      this.sset[i] = set;
      this.sidx[i] = k;
      this.sscale[i] = scale;
      this.sglow[i] = glow ? 1 : 0;
    }
  }

  slash(x: number, y: number, ang: number, len = 1, dur = 90, space: Space = 0): void {
    for (const s of this.sl)
      if (!s.on) {
        s.on = true;
        s.x = x;
        s.y = y;
        s.ang = ang;
        s.len = len;
        s.t = this.time;
        s.dur = dur;
        s.space = space;
        return;
      }
  }

  /** spr：0 白环 1 金环 2 红冲击 */
  ring(x: number, y: number, r0: number, r1: number, dur: number, a = 0.25, spr = 1, space: Space = 0): void {
    for (const s of this.rings)
      if (!s.on) {
        s.on = true;
        s.x = x;
        s.y = y;
        s.r0 = r0;
        s.r1 = r1;
        s.dur = dur;
        s.a = a;
        s.spr = spr;
        s.t = this.time;
        s.space = space;
        return;
      }
  }

  numText(font: GlyphFont, v: number, prefix: number, x: number, y: number, dur = 900, space: Space = 0, fly?: { x: number; y: number }, sc = 1): void {
    const f = this.freeText();
    if (!f) return;
    f.on = true;
    f.font = font;
    f.spr = null;
    f.v = v;
    f.prefix = prefix;
    f.x = x;
    f.y = y;
    f.fly = !!fly;
    f.tx = fly ? fly.x : x;
    f.ty = fly ? fly.y : y;
    f.t = this.time;
    f.dur = dur;
    f.space = space;
    f.sc = sc;
    f.rise = 26;
  }

  sprText(spr: Sprite, x: number, y: number, dur = 1000, space: Space = 0, rise = 22, sc = 1): void {
    const f = this.freeText();
    if (!f) return;
    f.on = true;
    f.font = null;
    f.spr = spr;
    f.x = x;
    f.y = y;
    f.fly = false;
    f.tx = x;
    f.ty = y;
    f.t = this.time;
    f.dur = dur;
    f.space = space;
    f.sc = sc;
    f.rise = rise;
  }

  private freeText() {
    for (const f of this.ft) if (!f.on) return f;
    // 回收最老的
    let old = this.ft[0];
    for (const f of this.ft) if (f.t < old.t) old = f;
    return old;
  }

  /** 光点沿二次贝塞尔飞行（屏幕空间），到达回调 */
  orb(x0: number, y0: number, x1: number, y1: number, delay: number, dur: number, pink: boolean, cb: (() => void) | null, spr: Sprite | null = null, sz = 16): void {
    for (const o of this.orbs)
      if (!o.on) {
        o.on = true;
        o.x0 = x0;
        o.y0 = y0;
        o.x1 = x1;
        o.y1 = y1;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const side = this.r() < 0.5 ? -1 : 1;
        o.cx = mx + side * this.rr(40, 110);
        o.cy = my + this.rr(-40, 60);
        o.t = this.time + delay;
        o.dur = dur;
        o.pink = pink;
        o.cb = cb;
        o.trail = 0;
        o.spr = spr;
        o.sz = sz;
        return;
      }
    // 池满：直接回调
    if (cb) cb();
  }

  burstRays(x: number, y: number, sc: number, dur = 900, space: Space = 1): void {
    for (const b of this.bursts)
      if (!b.on) {
        b.on = true;
        b.x = x;
        b.y = y;
        b.sc = sc;
        b.t = this.time;
        b.dur = dur;
        b.space = space;
        return;
      }
  }

  get busy(): boolean {
    if (this.sCount > 0) return true;
    for (const o of this.orbs) if (o.on) return true;
    return false;
  }

  clear(): void {
    this.pCount = 0;
    this.sCount = 0;
    for (const s of this.sl) s.on = false;
    for (const s of this.rings) s.on = false;
    for (const f of this.ft) f.on = false;
    for (const o of this.orbs) {
      if (o.on && o.cb) o.cb();
      o.on = false;
    }
    for (const b of this.bursts) b.on = false;
  }

  // ------------------------------------------------------------ update
  update(dtMs: number): void {
    this.time += dtMs;
    this.acc += dtMs;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.acc -= STEP;
      steps++;
      this.step(STEP / 1000);
    }
    if (steps === 8) this.acc = 0;
    // 光点
    for (const o of this.orbs) {
      if (!o.on || this.time < o.t) continue;
      const t = (this.time - o.t) / o.dur;
      if (t >= 1) {
        o.on = false;
        const cb = o.cb;
        o.cb = null;
        this.burst(o.pink ? P.Pink : P.Spark, o.x1, o.y1, 4, 20, 70, 300, 5, 0, 0, 1);
        if (cb) cb();
        continue;
      }
      o.trail += dtMs;
      if (o.trail > 22) {
        o.trail = 0;
        const [x, y] = this.orbPos(o, Math.max(0, t - 0.02));
        this.spawn(o.pink ? P.Pink : P.GoldDust, x, y, this.rr(-10, 10), this.rr(-10, 10), 260, 5, 1, 0, 0, 1, 0.8);
      }
    }
    for (const s of this.sl) if (s.on && this.time - s.t > s.dur + 160) s.on = false;
    for (const s of this.rings) if (s.on && this.time - s.t > s.dur) s.on = false;
    for (const f of this.ft) if (f.on && this.time - f.t > f.dur) f.on = false;
    for (const b of this.bursts) if (b.on && this.time - b.t > b.dur) b.on = false;
  }

  private orbPos(o: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number }, t: number): [number, number] {
    const e = t * t * (3 - 2 * t);
    const u = 1 - e;
    ORB_TMP[0] = u * u * o.x0 + 2 * u * e * o.cx + e * e * o.x1;
    ORB_TMP[1] = u * u * o.y0 + 2 * u * e * o.cy + e * e * o.y1;
    return ORB_TMP;
  }

  private step(dt: number): void {
    const ms = dt * 1000;
    for (let i = 0; i < this.pCount; i++) {
      this.plife[i] += ms;
      if (this.plife[i] >= this.pmax[i]) {
        this.killP(i);
        i--;
        continue;
      }
      const dr = Math.max(0, 1 - this.pdrag[i] * dt);
      this.pvx[i] *= dr;
      this.pvy[i] = this.pvy[i] * dr + this.pg[i] * dt;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.prot[i] += this.pspin[i] * dt;
    }
    for (let i = 0; i < this.sCount; i++) {
      this.slife[i] += ms;
      if (this.slife[i] >= this.smax[i]) {
        this.killS(i);
        i--;
        continue;
      }
      this.svy[i] += 900 * dt;
      this.svx[i] *= 1 - 0.6 * dt;
      this.sx[i] += this.svx[i] * dt;
      this.sy[i] += this.svy[i] * dt;
      this.srot[i] += this.sspin[i] * dt;
    }
  }

  private killP(i: number): void {
    const j = --this.pCount;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pvx[i] = this.pvx[j];
    this.pvy[i] = this.pvy[j];
    this.pg[i] = this.pg[j];
    this.pdrag[i] = this.pdrag[j];
    this.plife[i] = this.plife[j];
    this.pmax[i] = this.pmax[j];
    this.ps0[i] = this.ps0[j];
    this.ps1[i] = this.ps1[j];
    this.prot[i] = this.prot[j];
    this.pspin[i] = this.pspin[j];
    this.pa[i] = this.pa[j];
    this.ptype[i] = this.ptype[j];
    this.pspace[i] = this.pspace[j];
  }

  private killS(i: number): void {
    const j = --this.sCount;
    if (i === j) return;
    this.sx[i] = this.sx[j];
    this.sy[i] = this.sy[j];
    this.svx[i] = this.svx[j];
    this.svy[i] = this.svy[j];
    this.srot[i] = this.srot[j];
    this.sspin[i] = this.sspin[j];
    this.slife[i] = this.slife[j];
    this.smax[i] = this.smax[j];
    this.sset[i] = this.sset[j];
    this.sidx[i] = this.sidx[j];
    this.sscale[i] = this.sscale[j];
    this.sglow[i] = this.sglow[j];
  }

  // ------------------------------------------------------------ draw
  /**
   * 画指定空间的特效。base 为该空间的基础变换（已含 dpr / 震屏）。
   */
  draw(ctx: CanvasRenderingContext2D, space: Space, b: Mat): number {
    let calls = 0;
    const T = this.tex;
    const set = () => ctx.setTransform(b.a, b.b, b.c, b.d, b.e, b.f);
    set();
    // 环形波
    for (const s of this.rings) {
      if (!s.on || s.space !== space) continue;
      const t = clamp01((this.time - s.t) / s.dur);
      const r = s.r0 + (s.r1 - s.r0) * cubicOut(t);
      const spr = s.spr === 0 ? T.ring : s.spr === 1 ? T.ringGold : T.redShock;
      ctx.globalCompositeOperation = s.spr === 2 ? 'source-over' : 'lighter';
      ctx.globalAlpha = s.a * (1 - t);
      ctx.drawImage(spr.c, s.x - r, s.y - r, r * 2, r * 2);
      calls++;
    }
    // 升级光芒
    for (const bb of this.bursts) {
      if (!bb.on || bb.space !== space) continue;
      const t = clamp01((this.time - bb.t) / bb.dur);
      const sc = bb.sc * (0.4 + 0.9 * expoOut(t));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - quadIn((t - 0.2) / 0.8);
      ctx.translate(bb.x, bb.y);
      ctx.rotate(t * 1.4);
      ctx.drawImage(T.rays.c, -100 * sc, -100 * sc, 200 * sc, 200 * sc);
      set();
      calls++;
    }
    ctx.globalCompositeOperation = 'source-over';
    // 碎片（只在棋盘空间）
    if (space === 0) {
      for (let i = 0; i < this.sCount; i++) {
        const sil = this.sset[i] === 13 ? this.sil.rise : this.sil.mon[this.sset[i]];
        const sh = sil.shards[this.sidx[i]];
        if (!sh) continue;
        const life = this.slife[i] / this.smax[i];
        const a = life < 0.5 ? 1 : 1 - (life - 0.5) / 0.5;
        const sc = this.sscale[i];
        ctx.translate(this.sx[i], this.sy[i]);
        ctx.rotate(this.srot[i]);
        if (this.sglow[i]) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.7;
          const gw = Math.max(sh.w, sh.h) * sc * 1.4;
          ctx.drawImage(T.shardGlow.c, -gw / 2, -gw / 2, gw, gw);
          ctx.globalCompositeOperation = 'source-over';
          calls++;
        }
        ctx.globalAlpha = a;
        ctx.drawImage(sh.c, (-sh.w * sc) / 2, (-sh.h * sc) / 2, sh.w * sc, sh.h * sc);
        set();
        calls++;
      }
    }
    // 粒子：先普通混合，再 lighter
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
      for (let i = 0; i < this.pCount; i++) {
        if (this.pspace[i] !== space) continue;
        const ty = this.ptype[i];
        const add = ty === P.Spark || ty === P.Ember || ty === P.Pink || ty === P.GoldDust || ty === P.Fire || ty === P.Star || ty === P.Purple;
        if ((pass === 1) !== add) continue;
        const t = this.plife[i] / this.pmax[i];
        const size = this.ps0[i] + (this.ps1[i] - this.ps0[i]) * t;
        let a = this.pa[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
        let spr: Sprite;
        switch (ty) {
          case P.Dust:
            spr = T.dust;
            a *= 0.7;
            break;
          case P.Spark:
          case P.GoldDust:
            spr = T.spark;
            break;
          case P.Star:
            spr = T.spark;
            a *= 0.6 + 0.4 * Math.sin(this.plife[i] * 0.04);
            break;
          case P.Ember:
          case P.Fire:
            spr = T.ember;
            break;
          case P.Smoke:
            spr = T.smoke;
            a *= 0.55;
            break;
          case P.Chalk:
            spr = T.chalkDot;
            break;
          case P.Coin: {
            const fx = Math.abs(Math.cos(this.prot[i] * 2));
            ctx.globalAlpha = Math.min(1, a * 1.4);
            ctx.translate(this.px[i], this.py[i]);
            ctx.scale(Math.max(0.15, fx), 1);
            ctx.drawImage(T.coin.c, -size / 2, -size / 2, size, size);
            set();
            calls++;
            continue;
          }
          case P.Pink:
            spr = T.pinkOrb;
            break;
          case P.Purple:
            spr = T.pinkOrb;
            break;
          case P.Chip:
            ctx.globalAlpha = a;
            ctx.fillStyle = '#C8283C';
            ctx.translate(this.px[i], this.py[i]);
            ctx.rotate(this.prot[i]);
            ctx.fillRect(-size / 2, -size / 3, size, (size * 2) / 3);
            set();
            calls++;
            continue;
          case P.Bubble:
            spr = T.pinkOrb;
            a *= 0.6;
            break;
          default:
            spr = T.dust;
        }
        ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
        ctx.drawImage(spr.c, this.px[i] - size / 2, this.py[i] - size / 2, size, size);
        calls++;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // 刀光
    for (const s of this.sl) {
      if (!s.on || s.space !== space) continue;
      const t = (this.time - s.t) / s.dur;
      if (t < 0) continue;
      const grow = clamp01(t);
      const fade = t <= 1 ? 1 : 1 - clamp01((t - 1) / 1.6);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      const w = 96 * s.len;
      const h = 40 * s.len * (0.6 + 0.4 * fade);
      const sw = T.slash.w * grow;
      if (sw > 1) ctx.drawImage(T.slash.c, 0, 0, sw, T.slash.h, -w / 2, -h / 2, w * grow, h);
      set();
      calls++;
    }
    ctx.globalCompositeOperation = 'source-over';
    // 跳字
    for (const f of this.ft) {
      if (!f.on || f.space !== space) continue;
      const t = clamp01((this.time - f.t) / f.dur);
      let x = f.x;
      let y = f.y;
      let sc = f.sc;
      let a = 1;
      if (f.fly) {
        // 先弹起再飞向目标
        if (t < 0.35) {
          const k = cubicOut(t / 0.35);
          y -= f.rise * k;
          sc *= 0.6 + 0.6 * k;
        } else {
          const k = quadIn((t - 0.35) / 0.65);
          x = f.x + (f.tx - f.x) * k;
          y = f.y - f.rise + (f.ty - f.y + f.rise) * k;
          sc *= 1.2 - 0.5 * k;
          a = 1 - k * 0.6;
        }
      } else {
        const k = cubicOut(t);
        y -= f.rise * k;
        sc *= t < 0.15 ? 0.6 + (0.6 * t) / 0.15 : 1.2 - 0.2 * Math.min(1, (t - 0.15) / 0.2);
        a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      }
      ctx.globalAlpha = a;
      if (f.font) f.font.drawInt(ctx, f.v, x, y, 0.5, true, sc, f.prefix);
      else if (f.spr) {
        const d = this.tex.dpr;
        const w = (f.spr.w / d) * sc;
        const h = (f.spr.h / d) * sc;
        ctx.drawImage(f.spr.c, x - w / 2, y - h / 2, w, h);
      }
      calls++;
    }
    // 光点（屏幕空间）
    if (space === 1) {
      ctx.globalCompositeOperation = 'lighter';
      for (const o of this.orbs) {
        if (!o.on || this.time < o.t) continue;
        const t = clamp01((this.time - o.t) / o.dur);
        const [x, y] = this.orbPos(o, t);
        if (o.spr) {
          ctx.globalCompositeOperation = 'source-over';
          const s = o.sz * (1 - 0.25 * t);
          ctx.translate(x, y);
          ctx.rotate(t * 5);
          ctx.globalAlpha = 1;
          ctx.drawImage(o.spr.c, -s / 2, -s / 2, s, s);
          set();
          ctx.globalCompositeOperation = 'lighter';
          calls++;
          continue;
        }
        const s = o.sz * (1 - 0.3 * t);
        ctx.globalAlpha = 1;
        ctx.drawImage((o.pink ? T.pinkOrb : T.orb).c, x - s / 2, y - s / 2, s, s);
        calls++;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    return calls;
  }
}

const ORB_TMP: [number, number] = [0, 0];
