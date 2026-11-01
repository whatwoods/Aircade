// 特效对象池：碎片、粒子、冲击环、光束、跳字、残影、闪光（第 8 节：池满复用最旧的）
import { C, fNum, fCn } from './theme.ts';
import type { StoneArt } from './stones.ts';
import { easeOutCubic, easeOutQuad } from '../util/ease.ts';

interface Shard { on: boolean; x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; life: number; max: number; kind: number; a0: number; a1: number; a2: number; r0: number; r1: number; r2: number }
interface Particle { on: boolean; x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; kind: number; g: number }
interface Ring { on: boolean; x: number; y: number; r0: number; r1: number; life: number; max: number; w: number; white: boolean }
interface Beam { on: boolean; ax: number; ay: number; bx: number; by: number; life: number; max: number; w: number; sweep: number }
interface Float { on: boolean; x: number; y: number; text: string; sub: string; life: number; max: number; size: number; delay: number }
interface Trail { on: boolean; x: number; y0: number; y1: number; w: number; life: number; max: number }
interface Flash { on: boolean; x: number; y: number; life: number; max: number; kind: number }

function pool<T extends { on: boolean }>(n: number, make: () => T): T[] { return Array.from({ length: n }, make); }
function take<T extends { on: boolean; life: number; max: number }>(arr: T[]): T {
  let oldest = arr[0], best = -1;
  for (const o of arr) {
    if (!o.on) return o;
    const age = o.life / Math.max(1e-6, o.max);
    if (age > best) { best = age; oldest = o; }
  }
  return oldest;
}

export class Fx {
  shards = pool<Shard>(320, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, s: 0, life: 0, max: 1, kind: 0, a0: 0, a1: 0, a2: 0, r0: 0, r1: 0, r2: 0 }));
  parts = pool<Particle>(400, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 0, kind: 0, g: 0 }));
  rings = pool<Ring>(12, () => ({ on: false, x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, w: 2, white: false }));
  beams = pool<Beam>(12, () => ({ on: false, ax: 0, ay: 0, bx: 0, by: 0, life: 0, max: 1, w: 4, sweep: 0.12 }));
  floats = pool<Float>(8, () => ({ on: false, x: 0, y: 0, text: '', sub: '', life: 0, max: 1, size: 20, delay: 0 }));
  trails = pool<Trail>(24, () => ({ on: false, x: 0, y0: 0, y1: 0, w: 0, life: 0, max: 1 }));
  flashes = pool<Flash>(40, () => ({ on: false, x: 0, y: 0, life: 0, max: 1, kind: 0 }));
  /** 粒子数量倍率（减弱动态 = 0.5） */
  density = 1;
  private rnd = Math.random;

  count(): number {
    let n = 0;
    for (const a of [this.shards, this.parts, this.rings, this.beams, this.floats, this.trails, this.flashes] as { on: boolean }[][]) for (const o of a) if (o.on) n++;
    return n;
  }
  clear(): void {
    for (const a of [this.shards, this.parts, this.rings, this.beams, this.floats, this.trails, this.flashes] as { on: boolean }[][]) for (const o of a) o.on = false;
  }

  /** 棋子碎裂：kind 0 黑曜石、1 白瓷、2 冰晶 */
  shatter(x: number, y: number, kind: number, r: number, power = 1): void {
    const n = Math.round((6 + Math.floor(this.rnd() * 4)) * this.density);
    for (let i = 0; i < n; i++) {
      const s = take(this.shards);
      const a = this.rnd() * Math.PI * 2;
      const sp = (90 + this.rnd() * 220) * power;
      s.on = true; s.x = x + Math.cos(a) * r * 0.3; s.y = y + Math.sin(a) * r * 0.3;
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - 160 * power;
      s.rot = this.rnd() * 6.28; s.vr = (this.rnd() - 0.5) * 18;
      s.s = r * (0.35 + this.rnd() * 0.4);
      s.life = 0; s.max = 0.55 + this.rnd() * 0.25; s.kind = kind;
      s.a0 = this.rnd() * 2; s.a1 = 2 + this.rnd() * 2; s.a2 = 4 + this.rnd() * 2;
      s.r0 = 0.6 + this.rnd() * 0.4; s.r1 = 0.6 + this.rnd() * 0.4; s.r2 = 0.5 + this.rnd() * 0.5;
    }
    if (kind === 2) this.sparks(x, y, Math.round(12 * this.density), 1);
  }

  /** 冰蓝光点（kind 1 加色）/ 石屑（kind 0）/ 细尘（kind 2） */
  sparks(x: number, y: number, n: number, kind: number, speed = 1): void {
    for (let i = 0; i < n; i++) {
      const p = take(this.parts);
      const a = this.rnd() * Math.PI * 2;
      const sp = (40 + this.rnd() * 160) * speed;
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 0 ? 120 : 30);
      p.life = 0; p.max = 0.35 + this.rnd() * 0.45; p.s = kind === 0 ? 1.5 + this.rnd() * 2 : 1 + this.rnd() * 2.2; p.kind = kind;
      p.g = kind === 0 ? 900 : kind === 2 ? -40 : 60;
    }
  }

  dust(x: number, y: number, w: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = take(this.parts);
      p.on = true; p.x = x + (this.rnd() - 0.5) * w; p.y = y + (this.rnd() - 0.5) * w;
      p.vx = (this.rnd() - 0.5) * 30; p.vy = -10 - this.rnd() * 40;
      p.life = 0; p.max = 0.5 + this.rnd() * 0.5; p.s = 1 + this.rnd() * 1.8; p.kind = 2; p.g = -20;
    }
  }

  ring(x: number, y: number, r1: number, max: number, white = false, w = 3): void {
    const o = take(this.rings);
    o.on = true; o.x = x; o.y = y; o.r0 = 4; o.r1 = r1; o.life = 0; o.max = max; o.white = white; o.w = w;
  }

  beam(ax: number, ay: number, bx: number, by: number, w: number, max = 0.42, sweep = 0.12): void {
    const o = take(this.beams);
    o.on = true; o.ax = ax; o.ay = ay; o.bx = bx; o.by = by; o.w = w; o.life = 0; o.max = max; o.sweep = sweep;
  }

  float(x: number, y: number, text: string, sub = '', size = 20, delay = 0): void {
    const o = take(this.floats);
    o.on = true; o.x = x; o.y = y; o.text = text; o.sub = sub; o.size = size; o.life = 0; o.max = size >= 28 ? 1.0 : 0.7; o.delay = delay;
  }

  trail(x: number, y0: number, y1: number, w: number): void {
    const o = take(this.trails);
    o.on = true; o.x = x; o.y0 = y0; o.y1 = y1; o.w = w; o.life = 0; o.max = 0.22;
  }

  flash(x: number, y: number, max = 0.12, kind = 0): void {
    const o = take(this.flashes);
    o.on = true; o.x = x; o.y = y; o.life = 0; o.max = max; o.kind = kind;
  }

  update(dt: number): void {
    for (const s of this.shards) if (s.on) {
      s.life += dt; if (s.life >= s.max) { s.on = false; continue; }
      s.vy += 980 * dt; s.vx *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
    }
    for (const p of this.parts) if (p.on) {
      p.life += dt; if (p.life >= p.max) { p.on = false; continue; }
      p.vy += p.g * dt; p.vx *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (const a of [this.rings, this.beams, this.trails, this.flashes] as { on: boolean; life: number; max: number }[][]) for (const o of a) if (o.on) {
      o.life += dt; if (o.life >= o.max) o.on = false;
    }
    for (const f of this.floats) if (f.on) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.life += dt; if (f.life >= f.max) f.on = false;
    }
  }

  /** 棋盘层特效（碎片、粒子、光束、环）——在棋子之上绘制 */
  drawWorld(ctx: CanvasRenderingContext2D, art: StoneArt): void {
    // 残影
    for (const t of this.trails) if (t.on) {
      const k = 1 - t.life / t.max;
      const gr = ctx.createLinearGradient(0, t.y0, 0, t.y1);
      gr.addColorStop(0, 'rgba(127,219,255,0)');
      gr.addColorStop(1, `rgba(127,219,255,${0.35 * k})`);
      ctx.fillStyle = gr;
      ctx.fillRect(t.x - t.w / 2, t.y0, t.w, t.y1 - t.y0);
    }
    // 闪光
    for (const f of this.flashes) if (f.on) {
      const k = 1 - f.life / f.max;
      ctx.globalAlpha = k;
      art.draw(ctx, f.kind === 1 ? 'halo' : 'flash', f.x, f.y);
    }
    ctx.globalAlpha = 1;
    // 碎片
    for (const s of this.shards) if (s.on) {
      const k = s.life / s.max;
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const p0x = Math.cos(s.a0) * s.r0 * s.s, p0y = Math.sin(s.a0) * s.r0 * s.s;
      const p1x = Math.cos(s.a1) * s.r1 * s.s, p1y = Math.sin(s.a1) * s.r1 * s.s;
      const p2x = Math.cos(s.a2) * s.r2 * s.s, p2y = Math.sin(s.a2) * s.r2 * s.s;
      ctx.beginPath();
      ctx.moveTo(s.x + p0x * c - p0y * sn, s.y + p0x * sn + p0y * c);
      ctx.lineTo(s.x + p1x * c - p1y * sn, s.y + p1x * sn + p1y * c);
      ctx.lineTo(s.x + p2x * c - p2y * sn, s.y + p2x * sn + p2y * c);
      ctx.closePath();
      // 翻面时明暗交替
      const face = Math.sin(s.rot * 1.3) > 0;
      if (s.kind === 0) {
        ctx.fillStyle = face ? '#1F252C' : '#0A0C0E';
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,219,255,0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (s.kind === 1) {
        ctx.fillStyle = face ? '#F7F9FB' : '#C3CCD5';
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(160,230,255,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(230,250,255,0.9)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 粒子
    for (const p of this.parts) if (p.on) {
      const k = 1 - p.life / p.max;
      if (p.kind === 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(127,219,255,${0.9 * k})`;
      } else if (p.kind === 0) {
        ctx.fillStyle = `rgba(60,70,80,${0.8 * k})`;
      } else {
        ctx.fillStyle = `rgba(220,232,242,${0.55 * k})`;
      }
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 光束：从 a 扫到 b，然后淡出
    for (const b of this.beams) if (b.on) {
      const sweepT = Math.min(1, b.life / b.sweep);
      const fade = b.life < b.sweep ? 1 : 1 - (b.life - b.sweep) / (b.max - b.sweep);
      const ex = b.ax + (b.bx - b.ax) * easeOutQuad(sweepT), ey = b.ay + (b.by - b.ay) * easeOutQuad(sweepT);
      const dx = b.bx - b.ax, dy = b.by - b.ay;
      const len = Math.hypot(dx, dy) || 1;
      const ext = 14;
      const sx = b.ax - (dx / len) * ext, sy = b.ay - (dy / len) * ext;
      const tx = ex + (dx / len) * ext * sweepT, ty = ey + (dy / len) * ext * sweepT;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(127,219,255,${0.35 * fade})`;
      ctx.lineWidth = b.w * 3.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = `rgba(127,219,255,${0.8 * fade})`;
      ctx.lineWidth = b.w * 1.4;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = `rgba(235,252,255,${fade})`;
      ctx.lineWidth = Math.max(1.2, b.w * 0.5);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
      if (sweepT < 1) {
        ctx.globalAlpha = 0.9;
        art.draw(ctx, 'glow', ex, ey, art.D * 0.9);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 冲击环
    for (const r of this.rings) if (r.on) {
      const k = r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(k);
      ctx.strokeStyle = r.white ? `rgba(255,255,255,${0.9 * (1 - k)})` : `rgba(127,219,255,${0.75 * (1 - k)})`;
      ctx.lineWidth = r.w * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /** 跳字（在 HUD 之下、棋盘之上） */
  drawFloats(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) if (f.on && f.delay <= 0) {
      const k = f.life / f.max;
      const y = f.y - 40 * easeOutCubic(k);
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : Math.min(1, k * 8);
      const sc = k < 0.12 ? 0.7 + 0.3 * easeOutCubic(k / 0.12) * 1.1 : 1;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(sc, sc);
      ctx.globalAlpha = a;
      ctx.font = fNum(600, f.size);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(14,20,26,0.55)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = C.text1;
      ctx.fillText(f.text, 0, 0);
      if (f.sub) {
        // 小标随档位放大：单线 11px，双线 14px，三线/连锁 17px
        ctx.font = fCn(600, Math.max(11, Math.round(f.size * 0.5)));
        ctx.fillStyle = C.accent;
        ctx.strokeText(f.sub, 0, -f.size * 0.9);
        ctx.fillText(f.sub, 0, -f.size * 0.9);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  floatsActiveNear(x: number, y: number, r: number): number {
    let n = 0;
    for (const f of this.floats) if (f.on && Math.abs(f.x - x) < r && Math.abs(f.y - y) < r) n++;
    return n;
  }
}
