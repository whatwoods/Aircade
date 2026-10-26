import { CONFIG } from '../config';
import { backOut, clamp01, cubicOut } from '../core/ease';
import { P, type Fx } from './fx';
import type { Mat } from './gfx';
import type { Layout } from './layout';
import { PAL } from './palette';
import type { Silhouettes } from './silhouettes';
import type { Textures } from './textures';

const BREATH_MS = 3600;

/**
 * 巨龙：巢中待机（呼吸、余烬、眼缝）、随进度显露、惊扰、战斗形态与碎裂。
 */
export class DragonView {
  /** 0 闭眼 1 单眼 2 双眼 */
  eyes = 0;
  awake = false;
  disturbT0 = -1e9;
  /** 屠龙序列 */
  battleT0 = -1;
  riseT0 = -1;
  whiteT0 = -1e9;
  shattered = false;
  hidden = false;
  /** 胜利后巢穴照亮 */
  slain = false;
  private lastPhase = 0;
  private tex: Textures;
  private sil: Silhouettes;
  private fx: Fx;

  constructor(tex: Textures, sil: Silhouettes, fx: Fx) {
    this.tex = tex;
    this.sil = sil;
    this.fx = fx;
  }

  reset(): void {
    this.eyes = 0;
    this.awake = false;
    this.disturbT0 = -1e9;
    this.battleT0 = -1;
    this.riseT0 = -1;
    this.whiteT0 = -1e9;
    this.shattered = false;
    this.hidden = false;
    this.slain = false;
  }

  /** 0..1 呼吸相位值 */
  breath(real: number): number {
    return 0.5 - 0.5 * Math.cos((real / BREATH_MS) * Math.PI * 2);
  }

  lairLight(real: number): number {
    if (this.slain) return 0;
    const b = this.breath(real);
    return this.awake ? 0.6 + 0.3 * b : 0.25 + 0.3 * b;
  }

  lairRect(L: Layout): { x: number; y: number; s: number } {
    const lr = CONFIG.board.lair;
    LR.x = L.board.x + lr.x * L.cell;
    LR.y = L.board.y + lr.y * L.cell;
    LR.s = lr.w * L.cell;
    return LR;
  }

  update(L: Layout, real: number): void {
    // 呼气时鼻孔冒烟
    const ph = Math.floor(real / BREATH_MS);
    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      if (!this.hidden && !this.slain && this.battleT0 < 0) {
        const r = this.lairRect(L);
        for (let k = 0; k < 2; k++)
          this.fx.spawn(P.Smoke, r.x + r.s * (0.47 + k * 0.06), r.y + r.s * 0.86, this.fx.rr(-6, 6), this.fx.rr(-18, -8), 1600, 10, 26, -4, 0.4, 0, 0.7);
      }
    }
  }

  /** 棋盘层（光照之下）：巢底 + 龙身 */
  drawBase(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, real: number, alpha: number): void {
    if (alpha <= 0) return;
    const T = this.tex;
    const r = this.lairRect(L);
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.globalAlpha = alpha;
    ctx.drawImage(T.lairBase.c, r.x, r.y, r.s, r.s);
    if (!this.hidden) {
      const b = this.breath(real);
      let sc = 1 + 0.012 * b;
      let dx = 0;
      const dt = real - this.disturbT0;
      if (dt >= 0 && dt < 500) dx = Math.sin(dt * 0.09) * 2 * (1 - dt / 500);
      if (this.riseT0 >= 0) sc *= 0.96;
      const w = r.s * sc;
      ctx.drawImage(this.sil.lairBody.c, r.x + (r.s - w) / 2 + dx, r.y + (r.s - w) / 2 - (w - r.s) * 0.3, w, w);
    }
    ctx.globalAlpha = 1;
  }

  /** 光后层：余烬裂纹、眼睛、苏醒光圈 */
  drawGlow(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, real: number, alpha: number): number {
    if (this.hidden || alpha <= 0) return 0;
    const r = this.lairRect(L);
    const b = this.breath(real);
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (this.awake ? 0.55 + 0.45 * b : 0.25 + 0.5 * b);
    const sc = 1 + 0.012 * b;
    const w = r.s * sc;
    ctx.drawImage(this.sil.lairCracks.c, r.x + (r.s - w) / 2, r.y + (r.s - w) / 2 - (w - r.s) * 0.3, w, w);
    ctx.globalCompositeOperation = 'source-over';
    // 眼睛
    const u = w / 100;
    const ox = r.x + (r.s - w) / 2;
    const oy = r.y + (r.s - w) / 2 - (w - r.s) * 0.3;
    const eyes = this.sil.lairEyes;
    const dt = real - this.disturbT0;
    const disturbOpen = dt >= 0 && dt < 1400 ? (dt < 200 ? dt / 200 : dt > 1100 ? 1 - (dt - 1100) / 300 : 1) : 0;
    for (let k = 0; k < 2; k++) {
      const [ex, ey, rx] = eyes[k];
      const x = ox + ex * u;
      const y = oy + ey * u;
      let open = 0;
      if (this.eyes === 2) open = 1;
      else if (this.eyes === 1 && k === 1) open = 1;
      if (k === 1) open = Math.max(open, disturbOpen);
      calls_eye(ctx, this.tex, x, y, rx * u, open, alpha, b);
    }
    // 苏醒：巢边金红光圈
    if (this.awake) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (0.35 + 0.35 * b);
      const rs = r.s * 1.25;
      ctx.drawImage(this.tex.ringGold.c, r.x + r.s / 2 - rs / 2, r.y + r.s / 2 - rs / 2, rs, rs);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    return 4;
  }

  /** 屠龙：战斗形态 */
  drawBattle(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, world: number): number {
    if (this.riseT0 < 0 || this.shattered) return 0;
    const t = world - this.riseT0;
    if (t < 0) return 0;
    const pos = this.battlePos(L, world);
    const sil = this.sil.rise;
    const sx = pos.s * (0.6 + 0.4 * cubicOut(clamp01((t - 100) / 500)));
    const sy = pos.s;
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    // 身后龙焰光
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * clamp01(t / 400);
    const gs = sil.unit * pos.s * 1.3;
    ctx.drawImage(this.tex.flameGlow.c, pos.x - gs / 2, pos.y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.translate(pos.x, pos.y);
    ctx.scale(sx, sy);
    const white = world >= this.whiteT0 && world < this.whiteT0 + 70;
    const size = sil.size;
    ctx.drawImage((white ? sil.white : sil.normal).c, -size / 2, -size / 2, size, size);
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    // 口中光核
    const mx = pos.x;
    const my = pos.y + (34 - 50) * (sil.unit / 100) * sy;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(world * 0.02);
    const cs = 26 * sy;
    ctx.drawImage(this.tex.ember.c, mx - cs / 2, my - cs / 2, cs, cs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return 3;
  }

  /** 战斗形态中心与缩放 */
  battlePos(L: Layout, world: number): { x: number; y: number; s: number; mouthX: number; mouthY: number } {
    const r = this.lairRect(L);
    const t = this.riseT0 < 0 ? 0 : world - this.riseT0;
    const k = backOut(clamp01(t / 600));
    const unit = this.sil.rise.unit;
    const s0 = r.s / unit;
    const s1 = (L.colW * 0.9) / unit;
    const s = s0 + (s1 - s0) * k;
    const x = r.x + r.s / 2;
    const y0 = r.y + r.s / 2;
    const y1 = Math.max(L.board.y + unit * s1 * 0.42, y0 - L.cell * 0.6);
    const y = y0 + (y1 - y0) * k;
    BP.x = x;
    BP.y = y;
    BP.s = s;
    BP.mouthX = x;
    BP.mouthY = y + (34 - 50) * (unit / 100) * s;
    return BP;
  }

  /** 惊扰巨龙（生命不足） */
  disturb(L: Layout, real: number): void {
    this.disturbT0 = real;
    const r = this.lairRect(L);
    for (let k = 0; k < 6; k++)
      this.fx.spawn(P.Smoke, r.x + r.s * 0.5 + this.fx.rr(-6, 6), r.y + r.s * 0.86, this.fx.rr(-30, 30), this.fx.rr(-40, -15), 1400, 12, 30, -5, 0.6, 0, 0.8);
  }
}

const BP = { x: 0, y: 0, s: 1, mouthX: 0, mouthY: 0 };
const LR = { x: 0, y: 0, s: 1 };

function calls_eye(ctx: CanvasRenderingContext2D, T: Textures, x: number, y: number, rx: number, open: number, alpha: number, b: number): void {
  // 闭眼：细金线；睁眼：龙眼金竖瞳 + 光晕
  if (open < 0.05) {
    ctx.globalAlpha = alpha * (0.55 + 0.35 * b);
    ctx.fillStyle = PAL.dragonEye;
    ctx.fillRect(x - rx, y - 0.5, rx * 2, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.25;
    ctx.drawImage(T.spark.c, x - rx * 1.6, y - rx * 0.8, rx * 3.2, rx * 1.6);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const ry = Math.max(0.6, rx * 0.75 * open);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.8 * open;
  ctx.drawImage(T.flameGlow.c, x - rx * 3, y - rx * 3, rx * 6, rx * 6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.dragonEye;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1A0A04';
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.18, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
