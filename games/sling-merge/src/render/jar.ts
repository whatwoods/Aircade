/**
 * 汽水玻璃罐（docs §4.7）：背层（汽水渐变、焦散、背壁暗边、发射区压暗、背景气泡）、
 * 前层（高光条、玻璃轮廓、外发光、反光点、糖果条纹盖子）、警戒线三态、危险暗角、边缘折射（P2）。
 */
import { CONFIG } from '../config';
import { rngFx } from '../core/rng';
import { ctx2d, makeCanvas, rrect } from './util';
import type { Sprite } from './sprites';

const J = CONFIG.layout.jar;
const TAU = Math.PI * 2;

/** 内腔路径（顶角 r10，底角 r36） */
export function innerPath(ctx: CanvasRenderingContext2D): void {
  const { L, R, T, B, rTop, rBottom } = J.inner;
  ctx.moveTo(L + rTop, T);
  ctx.lineTo(R - rTop, T);
  ctx.arcTo(R, T, R, T + rTop, rTop);
  ctx.lineTo(R, B - rBottom);
  ctx.arcTo(R, B, R - rBottom, B, rBottom);
  ctx.lineTo(L + rBottom, B);
  ctx.arcTo(L, B, L, B - rBottom, rBottom);
  ctx.lineTo(L, T + rTop);
  ctx.arcTo(L, T, L + rTop, T, rTop);
  ctx.closePath();
}

function outerPath(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h, rTop, rBottom } = J.outer;
  ctx.moveTo(x + rTop, y);
  ctx.lineTo(x + w - rTop, y);
  ctx.arcTo(x + w, y, x + w, y + rTop, rTop);
  ctx.lineTo(x + w, y + h - rBottom);
  ctx.arcTo(x + w, y + h, x + w - rBottom, y + h, rBottom);
  ctx.lineTo(x + rBottom, y + h);
  ctx.arcTo(x, y + h, x, y + h - rBottom, rBottom);
  ctx.lineTo(x, y + rTop);
  ctx.arcTo(x, y, x + rTop, y, rTop);
  ctx.closePath();
}

function mk(w: number, h: number, ratio: number, draw: (c: CanvasRenderingContext2D) => void): Sprite {
  const c = makeCanvas(w * ratio, h * ratio);
  const ctx = ctx2d(c);
  ctx.scale(c.width / w, c.height / h);
  draw(ctx);
  return { c, w, h, ax: 0, ay: 0 };
}

const NB = 28;

/** 前层切片（x, y, w, h，逻辑 px）：顶带（盖子 + 罐口）、底带（含两个圆角）、左右壁条 */
const FRONT_SLICES = [0, 0, 390, 142, 0, 780, 390, 64, 0, 142, 64, 638, 326, 142, 64, 638] as const;

/** 折射需要的水果字段（避免 render 依赖 game 的完整类型） */
export interface RefractFruit {
  level: number;
  body: { r: number; r1: number };
  vis: { rx: number; ry: number; scale: number; angle: number };
}

export class Jar {
  private back: Sprite | null = null;
  private front: Sprite | null = null;
  private lineNormal: Sprite | null = null;
  private vignette: Sprite | null = null;
  private caustic: HTMLCanvasElement | null = null;
  private causticPat: CanvasPattern | null = null;
  private ratio = 0;
  private patCtx: CanvasRenderingContext2D | null = null;
  // 背景气泡
  private bx = new Float32Array(NB);
  private by = new Float32Array(NB);
  private br = new Float32Array(NB);
  private bs = new Float32Array(NB);
  private bp = new Float32Array(NB);
  bubbleCount = NB;
  causticsOn = true;
  refractionOn = true;
  /** 标题页整体提亮 */
  bright = 0;
  private sweepT = 99;
  private flashT = 0;

  constructor() {
    for (let i = 0; i < NB; i++) this.resetBubble(i, true);
  }

  private resetBubble(i: number, anywhere: boolean): void {
    const { L, R, T, B } = J.inner;
    this.bx[i] = L + 10 + rngFx.next() * (R - L - 20);
    this.by[i] = anywhere ? T + rngFx.next() * (B - T) : B - 4 - rngFx.next() * 30;
    this.br[i] = 2 + rngFx.next() * 4;
    this.bs[i] = 30 + rngFx.next() * 50;
    this.bp[i] = rngFx.next() * TAU;
  }

  build(ratio: number): void {
    if (this.back && Math.abs(ratio - this.ratio) / ratio < 0.1) return;
    this.ratio = ratio;
    const W = CONFIG.layout.stageW;
    const H = CONFIG.layout.stageH;
    const { L, R, T, B } = J.inner;
    const dangerY = CONFIG.layout.dangerY;

    this.back = mk(W, H, ratio, (ctx) => {
      ctx.save();
      ctx.beginPath();
      innerPath(ctx);
      ctx.clip();
      const g = ctx.createLinearGradient(0, T, 0, B);
      g.addColorStop(0, '#EFFCFF');
      g.addColorStop(1, '#D3F2F7');
      ctx.fillStyle = g;
      ctx.fillRect(L, T, R - L, B - T);
      // 发射区再压暗 4%
      const lz = ctx.createLinearGradient(0, dangerY, 0, dangerY + 40);
      lz.addColorStop(0, 'rgba(60,120,140,0)');
      lz.addColorStop(1, 'rgba(60,120,140,0.05)');
      ctx.fillStyle = lz;
      ctx.fillRect(L, dangerY, R - L, B - dangerY);
      // 背壁暗边（内侧 18px）
      const edge = 18;
      const gl = ctx.createLinearGradient(L, 0, L + edge, 0);
      gl.addColorStop(0, 'rgba(91,58,94,0.08)');
      gl.addColorStop(1, 'rgba(91,58,94,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(L, T, edge, B - T);
      const gr = ctx.createLinearGradient(R, 0, R - edge, 0);
      gr.addColorStop(0, 'rgba(91,58,94,0.08)');
      gr.addColorStop(1, 'rgba(91,58,94,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(R - edge, T, edge, B - T);
      const gb = ctx.createLinearGradient(0, B, 0, B - edge * 1.6);
      gb.addColorStop(0, 'rgba(91,58,94,0.08)');
      gb.addColorStop(1, 'rgba(91,58,94,0)');
      ctx.fillStyle = gb;
      ctx.fillRect(L, B - edge * 1.6, R - L, edge * 1.6);
      // 盖子下方的投影
      const gt = ctx.createLinearGradient(0, T, 0, T + 22);
      gt.addColorStop(0, 'rgba(91,58,94,0.12)');
      gt.addColorStop(1, 'rgba(91,58,94,0)');
      ctx.fillStyle = gt;
      ctx.fillRect(L, T, R - L, 22);
      ctx.restore();
    });

    this.front = mk(W, H, ratio, (ctx) => {
      // 玻璃壁（外轮廓 − 内腔）
      ctx.beginPath();
      outerPath(ctx);
      innerPath(ctx);
      ctx.fillStyle = 'rgba(190,236,244,0.42)';
      ctx.fill('evenodd');
      // 外发光
      ctx.save();
      ctx.beginPath();
      outerPath(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
      // 玻璃轮廓
      ctx.beginPath();
      outerPath(ctx);
      ctx.strokeStyle = '#A8E3EC';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      innerPath(ctx);
      ctx.strokeStyle = 'rgba(168,227,236,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 左侧宽高光 x30–44
      const hl = ctx.createLinearGradient(0, 140, 0, 780);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.3, 'rgba(255,255,255,0.35)');
      hl.addColorStop(0.7, 'rgba(255,255,255,0.3)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      rrect(ctx, 30, 140, 14, 640, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      rrect(ctx, 48, 170, 4, 160, 2);
      ctx.fill();
      // 右侧细亮线 x356
      const hr = ctx.createLinearGradient(0, 150, 0, 760);
      hr.addColorStop(0, 'rgba(255,255,255,0)');
      hr.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      hr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hr;
      ctx.fillRect(355, 150, 3, 610);
      // 底部弧形高光
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(70, 812);
      ctx.quadraticCurveTo(195, 822, 320, 812);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(L + 36, B - 36, 30, Math.PI * 0.62, Math.PI * 0.9);
      ctx.stroke();
      // 反光点
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [x, y, rr] of [[37, 132, 2.2], [352, 138, 1.6], [362, 520, 1.4], [28, 700, 1.6]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
      }
      // 盖子
      const lid = J.lid;
      ctx.fillStyle = 'rgba(91,58,94,0.18)';
      ctx.beginPath();
      rrect(ctx, lid.x, lid.y + 4, lid.w, lid.h, lid.h / 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      rrect(ctx, lid.x, lid.y, lid.w, lid.h, lid.h / 2);
      ctx.clip();
      const lg = ctx.createLinearGradient(0, lid.y, 0, lid.y + lid.h);
      lg.addColorStop(0, '#FF8FAB');
      lg.addColorStop(0.5, '#FF6F91');
      lg.addColorStop(1, '#E04C73');
      ctx.fillStyle = lg;
      ctx.fillRect(lid.x, lid.y, lid.w, lid.h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = lid.x - 30; x < lid.x + lid.w + 30; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, lid.y + lid.h);
        ctx.lineTo(x + 10, lid.y + lid.h);
        ctx.lineTo(x + 20, lid.y);
        ctx.lineTo(x + 10, lid.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      rrect(ctx, lid.x + 12, lid.y + 2.5, lid.w - 24, 3, 1.5);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#C93D63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      rrect(ctx, lid.x, lid.y, lid.w, lid.h, lid.h / 2);
      ctx.stroke();
      // 糖钉
      for (const sx of [lid.x + 18, lid.x + lid.w - 18]) {
        const sy = lid.y + lid.h / 2;
        const g = ctx.createRadialGradient(sx - 2, sy - 2, 0.5, sx, sy, 6);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.5, '#FFE15A');
        g.addColorStop(1, '#F2A100');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#C97F00';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });

    // 警戒线（常态：粉白斜条纹），宽 6
    const lw = R - L;
    this.lineNormal = mk(lw, 6, ratio, (ctx) => {
      ctx.save();
      ctx.beginPath();
      rrect(ctx, 0, 0, lw, 6, 3);
      ctx.clip();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, lw, 6);
      ctx.fillStyle = '#FF8FAB';
      for (let x = -10; x < lw + 10; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x + 6, 6);
        ctx.lineTo(x + 12, 0);
        ctx.lineTo(x + 6, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    // 危险暗角（罐底红色）
    this.vignette = mk(R - L, B - dangerY + 40, Math.min(ratio, 1), (ctx) => {
      const h = B - dangerY + 40;
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, 'rgba(255,59,92,0.5)');
      g.addColorStop(0.5, 'rgba(255,59,92,0.18)');
      g.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R - L, h);
      const g2 = ctx.createLinearGradient(0, 0, 40, 0);
      g2.addColorStop(0, 'rgba(255,59,92,0.35)');
      g2.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, 40, h);
      const g3 = ctx.createLinearGradient(R - L, 0, R - L - 40, 0);
      g3.addColorStop(0, 'rgba(255,59,92,0.35)');
      g3.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = g3;
      ctx.fillRect(R - L - 40, 0, 40, h);
    });

    // 焦散贴图 256²
    const cs = makeCanvas(256, 256);
    const cc = ctx2d(cs);
    cc.strokeStyle = 'rgba(255,255,255,1)';
    cc.lineCap = 'round';
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 22; i++) {
      const x0 = rnd() * 256;
      const y0 = rnd() * 256;
      cc.lineWidth = 1.5 + rnd() * 2.5;
      cc.globalAlpha = 0.5 + rnd() * 0.5;
      cc.beginPath();
      for (let k = -1; k <= 1; k++) {
        for (let m = -1; m <= 1; m++) {
          const ox = x0 + k * 256;
          const oy = y0 + m * 256;
          cc.moveTo(ox, oy);
          cc.bezierCurveTo(ox + 30 + rnd() * 20, oy - 20, ox + 50, oy + 30 + rnd() * 10, ox + 90, oy + 10);
        }
      }
      cc.stroke();
    }
    this.caustic = cs;
    this.patCtx = null;
    this.causticPat = null;
  }

  /** 白光扫过警戒线（危险解除） */
  sweep(): void {
    this.sweepT = 0;
  }

  /** 引导：警戒线红闪 */
  flash(t: number): void {
    this.flashT = t;
  }

  update(dt: number): void {
    const { T } = J.inner;
    for (let i = 0; i < this.bubbleCount; i++) {
      this.by[i] = this.by[i]! - this.bs[i]! * dt;
      this.bp[i] = this.bp[i]! + dt * 2.2;
      if (this.by[i]! < T + this.br[i]! + 2) this.resetBubble(i, false);
    }
    if (this.sweepT < 1) this.sweepT += dt;
  }

  /**
   * 背层。baked=true 时静态部分（汽水底、静态焦散、标题提亮）已合成进渲染器的底图，
   * 这里只补画动态焦散（q3）。
   */
  drawBack(ctx: CanvasRenderingContext2D, time: number, baked = false): void {
    if (!baked) {
      const back = this.back!;
      ctx.drawImage(back.c, 0, 0, back.w, back.h);
    }
    if (!baked || this.causticsOn) this.drawCaustic(ctx, time);
    if (!baked) this.drawBright(ctx);
  }

  /** 静态背层合成（渲染器底图用；与舞台底一起烘焙成一张，省两层整屏填充） */
  bakeBack(ctx: CanvasRenderingContext2D): void {
    const back = this.back!;
    ctx.drawImage(back.c, 0, 0, back.w, back.h);
    if (!this.causticsOn) this.drawCaustic(ctx, 0);
    this.drawBright(ctx);
  }

  private drawCaustic(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.caustic) return;
    if (!this.causticPat || this.patCtx !== ctx) {
      this.causticPat = ctx.createPattern(this.caustic, 'repeat');
      this.patCtx = ctx;
    }
    if (!this.causticPat) return;
    const { L, R, T, B } = J.inner;
    const ox = this.causticsOn ? (time * 9) % 256 : 0;
    const oy = this.causticsOn ? (time * 5) % 256 : 0;
    ctx.save();
    ctx.beginPath();
    innerPath(ctx);
    ctx.clip();
    ctx.globalAlpha = 0.07 + this.bright * 0.02;
    ctx.translate(ox, oy);
    ctx.fillStyle = this.causticPat;
    ctx.fillRect(L - ox, T - oy, R - L, B - T);
    ctx.restore();
  }

  private drawBright(ctx: CanvasRenderingContext2D): void {
    if (this.bright <= 0) return;
    const { L, R, T, B } = J.inner;
    ctx.globalAlpha = this.bright * 0.04;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(L, T, R - L, B - T);
    ctx.globalAlpha = 1;
  }

  drawBubbles(ctx: CanvasRenderingContext2D, bubble: Sprite): void {
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < this.bubbleCount; i++) {
      const x = this.bx[i]! + Math.sin(this.bp[i]!) * 4;
      const y = this.by[i]!;
      const r = this.br[i]!;
      ctx.drawImage(bubble.c, x - r * 1.23, y - r * 1.23, r * 2.46, r * 2.46);
    }
    ctx.globalAlpha = 1;
  }

  /** 危险暗角（罐底），strength 0..1，pulse 0..1 */
  drawVignette(ctx: CanvasRenderingContext2D, a: number): void {
    if (a <= 0.01 || !this.vignette) return;
    const { L } = J.inner;
    const v = this.vignette;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(v.c, L, CONFIG.layout.dangerY - 40, v.w, v.h);
    ctx.globalAlpha = 1;
  }

  /**
   * 前层玻璃与盖子。整张前层中间大片透明，按四条（顶 / 底 / 左 / 右）切片绘制，
   * 只合成有内容的区域（像素量约为整屏的一半）。
   */
  drawFront(ctx: CanvasRenderingContext2D): void {
    const f = this.front!;
    const s = FRONT_SLICES;
    const k = f.c.width / f.w;
    for (let i = 0; i < s.length; i += 4) {
      const x = s[i]!;
      const y = s[i + 1]!;
      const w = s[i + 2]!;
      const h = s[i + 3]!;
      ctx.drawImage(f.c, x * k, y * k, w * k, h * k, x, y, w, h);
    }
  }

  /**
   * 边缘折射（P2）：内壁 16px 内的水果按 0.6 水平压缩、35% 透明度再画到 9px 玻璃壁上。
   * 不回读画布（回读会强制同步光栅化），只重画贴壁水果的本体贴图。
   */
  drawRefraction(ctx: CanvasRenderingContext2D, fruits: readonly RefractFruit[], body: (level: number) => Sprite): void {
    if (!this.refractionOn) return;
    const { L, R, T, B } = J.inner;
    const y0 = T + 10;
    const h = B - T - 50;
    let any = false;
    for (let side = 0; side < 2; side++) {
      const left = side === 0;
      let opened = false;
      for (let i = 0; i < fruits.length; i++) {
        const f = fruits[i]!;
        const v = f.vis;
        const r = f.body.r * v.scale;
        if (r <= 0.5) continue;
        if (left ? v.rx - r > L + 16 : v.rx + r < R - 16) continue;
        if (v.ry + r < y0 || v.ry - r > y0 + h) continue;
        if (!opened) {
          opened = true;
          any = true;
          ctx.save();
          ctx.beginPath();
          if (left) ctx.rect(L - 9, y0, 9.6, h);
          else ctx.rect(R - 0.6, y0, 9.6, h);
          ctx.clip();
          ctx.globalAlpha = 0.35;
          // x ∈ [L, L+16] → [L-9, L+0.6]；x ∈ [R-16, R] → [R-0.6, R+9]
          if (left) ctx.transform(0.6, 0, 0, 1, L - 9 - L * 0.6, 0);
          else ctx.transform(0.6, 0, 0, 1, R - 0.6 - (R - 16) * 0.6, 0);
        }
        const sp = body(f.level);
        const s = v.scale * (f.body.r / f.body.r1);
        const c = Math.cos(v.angle);
        const sn = Math.sin(v.angle);
        ctx.save();
        ctx.transform(c * s, sn * s, -sn * s, c * s, v.rx, v.ry);
        ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h);
        ctx.restore();
      }
      if (opened) ctx.restore();
    }
    if (any) ctx.globalAlpha = 1;
  }

  /**
   * 警戒线：level 0 粉白条纹；1 橙色 1Hz 呼吸；2 红色发光
   * show: 0..1 整体可见度（标题页隐藏）
   */
  drawLine(ctx: CanvasRenderingContext2D, level: number, time: number, pulseHz: number, show: number): void {
    if (show <= 0.01) return;
    const { L, R } = J.inner;
    const y = CONFIG.layout.dangerY;
    const w = R - L;
    const ln = this.lineNormal!;
    ctx.globalAlpha = 0.85 * show;
    ctx.drawImage(ln.c, L, y - 3, w, 6);
    let flash = 0;
    if (this.flashT > 0) flash = Math.max(0, Math.sin(this.flashT * Math.PI * 3.3)) ;
    if (level === 1) {
      const p = 0.55 + 0.45 * Math.sin(time * TAU);
      ctx.globalAlpha = (0.55 + 0.3 * p) * show;
      ctx.fillStyle = '#FFB13D';
      ctx.beginPath();
      rrect(ctx, L, y - 3, w, 6, 3);
      ctx.fill();
    } else if (level === 2 || flash > 0) {
      const p = level === 2 ? 0.5 + 0.5 * Math.sin(time * TAU * pulseHz) : flash;
      ctx.globalAlpha = (0.25 + 0.25 * p) * show;
      ctx.fillStyle = '#FF3B5C';
      ctx.beginPath();
      rrect(ctx, L, y - 8, w, 16, 8);
      ctx.fill();
      ctx.globalAlpha = 0.95 * show;
      ctx.beginPath();
      rrect(ctx, L, y - 3, w, 6, 3);
      ctx.fill();
    }
    if (this.sweepT < 0.6) {
      const k = this.sweepT / 0.6;
      const sx = L + w * k;
      const g = ctx.createLinearGradient(sx - 50, 0, sx + 10, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.globalAlpha = (1 - k * 0.5) * show;
      ctx.fillStyle = g;
      ctx.fillRect(Math.max(L, sx - 50), y - 5, Math.min(60, sx - L + 10), 10);
    }
    ctx.globalAlpha = 1;
    // 标签
    const tag = CONFIG.layout.dangerTag;
    ctx.globalAlpha = show * (level === 2 ? 1 : 0.9);
    ctx.fillStyle = level === 2 ? '#FF3B5C' : level === 1 ? '#FFB13D' : '#FF8FAB';
    ctx.beginPath();
    rrect(ctx, tag.x, tag.y, tag.w, tag.h, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = TAGFONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('警戒线', tag.x + tag.w / 2, tag.y + tag.h / 2 + 0.5);
    ctx.globalAlpha = 1;
  }

  tickFlash(dt: number): void {
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
  }
}

const TAGFONT = '800 11px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
