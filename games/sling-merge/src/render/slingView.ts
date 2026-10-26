/**
 * 糖果弹弓（docs §4.7 弹弓 / §3.3 视觉拉伸 / §5.2 #1–#6）：
 * 糖棒叉臂与柄、薄荷蝴蝶结、软糖底座（预渲染）；半透明软糖皮筋；奶油皮兜；
 * 力度环；装填果（拉伸、落兜压扁、待机浮动、满力颤抖）；「下一个」跳进皮兜的弧线。
 */
import { CONFIG, fruitDef } from '../config';
import { clamp01, ease } from '../core/math';
import { makeVis, setStretch, type Expression, type FruitVis } from '../game/fruits';
import type { Game } from '../game/game';
import { stepBlink, stepScale, stepStrain } from './deform';
import { ctx2d, makeCanvas, rrect, prng } from './util';

const S = CONFIG.layout.sling;
const TAU = Math.PI * 2;

/** 渲染器提供的水果绘制接口（避免循环依赖） */
export interface FruitPainter {
  paint(
    ctx: CanvasRenderingContext2D,
    level: number,
    x: number,
    y: number,
    vis: FruitVis,
    expr: Expression,
    open: number,
    scale: number,
    alpha: number,
  ): void;
}

/** 糖果棒：白底 + 草莓粉螺旋条纹 */
function candyStick(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(dy, dx));
  // 投影
  ctx.fillStyle = 'rgba(91,58,94,0.16)';
  ctx.beginPath();
  rrect(ctx, -w / 2 + 2, -w / 2 + 3, len + w, w, w / 2);
  ctx.fill();
  ctx.beginPath();
  rrect(ctx, -w / 2, -w / 2, len + w, w, w / 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-w, -w, len + w * 2, w * 2);
  ctx.fillStyle = '#FF6F91';
  for (let x = -w * 2; x < len + w * 2; x += 11) {
    ctx.beginPath();
    ctx.moveTo(x, w);
    ctx.lineTo(x + 5, w);
    ctx.lineTo(x + 5 + w * 0.9, -w);
    ctx.lineTo(x + w * 0.9, -w);
    ctx.closePath();
    ctx.fill();
  }
  // 圆柱体积：上亮下暗
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(224,76,115,0)');
  g.addColorStop(1, 'rgba(176,40,80,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(-w, -w / 2, len + w * 2, w);
  ctx.restore();
  // 条纹循环里 beginPath 换掉了当前路径，描边前重建圆角矩形
  ctx.beginPath();
  rrect(ctx, -w / 2, -w / 2, len + w, w, w / 2);
  ctx.strokeStyle = '#E04C73';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  rrect(ctx, 2, -w / 2 + 2, len - 4, 2.2, 1.1);
  ctx.fill();
  ctx.restore();
}

export class SlingView {
  private frame: HTMLCanvasElement | null = null;
  private ratio = 0;
  private readonly fx = 120;
  private readonly fy = 688;
  private readonly fw = 150;
  private readonly fh = 130;
  /** 装填果自己的视觉状态 */
  vis: FruitVis = makeVis(0.3);
  private visLevel = 0;
  private bobT = 0;
  /** 进场 0→1（弹起） */
  private introT = 1;
  private hidden = 1;
  private maxFlash = 0;
  private lookX = 0;
  private lookY = -0.8;
  private sag = 0;
  private hopOpen = 1;

  build(ratio: number): void {
    if (this.frame && Math.abs(ratio - this.ratio) / ratio < 0.1) return;
    this.ratio = ratio;
    const c = makeCanvas(this.fw * ratio, this.fh * ratio);
    const ctx = ctx2d(c);
    ctx.scale(c.width / this.fw, c.height / this.fh);
    ctx.translate(-this.fx, -this.fy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 底座软糖：半椭圆穹顶
    const B = S.base;
    const by = B.y + B.h / 2;
    ctx.fillStyle = 'rgba(91,58,94,0.16)';
    ctx.beginPath();
    ctx.ellipse(B.x + 2, by + 1, B.w / 2 + 2, 4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(B.x, by, B.w / 2, B.h, 0, Math.PI, TAU);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, by - B.h, 0, by);
    g.addColorStop(0, '#8FE8CF');
    g.addColorStop(0.5, '#5FD3B3');
    g.addColorStop(1, '#3FBF9C');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#36B08F';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 糖粒
    const rnd = prng(42);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + 0.25 + rnd() * (Math.PI - 0.5);
      const rr = 0.25 + rnd() * 0.65;
      const x = B.x + Math.cos(a) * (B.w / 2) * rr;
      const y = by + Math.sin(a) * B.h * rr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      ctx.beginPath();
      rrect(ctx, -2.2, -0.9, 4.4, 1.8, 0.9);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(B.x - 14, by - B.h * 0.62, 9, 3.5, -0.2, 0, TAU);
    ctx.fill();
    // 柄与叉臂
    candyStick(ctx, S.stemTop.x, S.stemTop.y, S.stemBottom.x, S.stemBottom.y, 14);
    candyStick(ctx, S.stemTop.x, S.stemTop.y, S.forkL.x, S.forkL.y, 12);
    candyStick(ctx, S.stemTop.x, S.stemTop.y, S.forkR.x, S.forkR.y, 12);
    // 叉尖糖球
    for (const p of [S.forkL, S.forkR]) {
      const gg = ctx.createRadialGradient(p.x - 2, p.y - 2, 0.5, p.x, p.y, 7.5);
      gg.addColorStop(0, '#FFFFFF');
      gg.addColorStop(0.6, '#FFB3C6');
      gg.addColorStop(1, '#FF6F91');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#E04C73';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // 薄荷蝴蝶结
    const kx = S.stemTop.x;
    const ky = S.stemTop.y + 1;
    ctx.fillStyle = '#5FD3B3';
    ctx.strokeStyle = '#36B08F';
    ctx.lineWidth = 1.6;
    for (let si = 0; si < 2; si++) {
      const s = si * 2 - 1;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.bezierCurveTo(kx + s * 6, ky - 12, kx + s * 18, ky - 9, kx + s * 16, ky);
      ctx.bezierCurveTo(kx + s * 18, ky + 9, kx + s * 6, ky + 10, kx, ky);
      ctx.fill();
      ctx.stroke();
      // 飘带
      ctx.beginPath();
      ctx.moveTo(kx + s * 2, ky + 3);
      ctx.lineTo(kx + s * 9, ky + 17);
      ctx.lineTo(kx + s * 4.5, ky + 15.5);
      ctx.lineTo(kx + s * 1, ky + 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(kx - 10, ky - 4, 3.5, 2, -0.5, 0, TAU);
    ctx.ellipse(kx + 8, ky - 4.5, 3, 1.8, 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5FD3B3';
    ctx.beginPath();
    ctx.ellipse(kx, ky, 4.5, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    this.frame = c;
  }

  /** 进入游戏：弹弓从下方弹起 */
  intro(): void {
    this.introT = 0;
    this.hidden = 0;
  }

  hide(): void {
    this.hidden = 1;
  }

  /** 装填完成：落兜压扁 */
  onReload(level: number): void {
    this.visLevel = level;
    setStretch(this.vis, 1, 0, 0.2);
    this.vis.sva = 0;
    this.vis.svb = 0;
    this.vis.scale = 0.92;
    this.vis.scaleV = 0;
    this.vis.angle = 0;
  }

  onAimStart(): void {
    this.vis.scaleV -= 1.4;
  }

  onMax(): void {
    this.maxFlash = 0.25;
  }

  update(g: Game, dt: number): void {
    const s = g.sling;
    const aimingVisible = s.aiming && g.scene === 'playing';
    s.updateVisual(dt, aimingVisible);
    if (this.introT < 1) this.introT = Math.min(1, this.introT + dt / 0.4);
    this.bobT += dt;
    if (this.maxFlash > 0) this.maxFlash = Math.max(0, this.maxFlash - dt);
    const over = g.scene === 'gameover' || g.scene === 'results';
    this.sag += ((over ? 1 : 0) - this.sag) * Math.min(1, dt * 4);
    // 装填果视觉
    const v = this.vis;
    if (s.loaded !== null) {
      if (this.visLevel !== s.loaded) this.visLevel = s.loaded;
      let ta = 0;
      let tb = 0;
      if (aimingVisible && s.valid) {
        const st = 0.12 * s.power;
        ta = st * (s.dirX * s.dirX - s.dirY * s.dirY);
        tb = st * (2 * s.dirX * s.dirY);
      }
      stepStrain(v, s.loaded, ta, tb, dt);
      stepScale(v, dt, 1, 6, 0.35);
      this.hopOpen = stepBlink(v, dt);
      // 视线：瞄准时看发射方向，否则抬眼看堆叠
      let tx = 0;
      let ty = -0.85;
      if (aimingVisible && s.valid) {
        tx = s.dirX;
        ty = s.dirY;
      } else {
        tx = Math.sin(this.bobT * 0.5) * 0.35;
      }
      const k = 1 - Math.exp(-10 * dt);
      this.lookX += (tx - this.lookX) * k;
      this.lookY += (ty - this.lookY) * k;
      v.lookX = this.lookX;
      v.lookY = this.lookY;
    }
  }

  /** 叉臂、后侧皮筋（水果之前画） */
  drawBack(ctx: CanvasRenderingContext2D, g: Game, painter: FruitPainter): void {
    const s = g.sling;
    const off = this.offsetY(g);
    if (off > 200) return;
    ctx.translate(0, off);
    const c = this.frame!;
    ctx.drawImage(c, this.fx, this.fy, this.fw, this.fh);
    const P = S.pouch;
    const tremble = s.aiming && s.maxReached ? Math.sin(this.bobT * 90) * 1 : 0;
    const qx = P.x + s.pouchX + tremble;
    const qy = P.y + s.pouchY + this.sag * 14;
    const level = s.loaded;
    const r = level !== null ? fruitDef(level).radius : 16;
    // 皮兜朝向：背离发射方向
    let ux = 0;
    let uy = 1;
    const pl = Math.hypot(s.pouchX, s.pouchY);
    if (pl > 2) {
      ux = s.pouchX / pl;
      uy = s.pouchY / pl;
    }
    this.pouchGeom(qx, qy, ux, uy, r);
    const stretch = clamp01(Math.hypot(qx - P.x, qy - P.y) / CONFIG.aim.visualPullMax);
    const bw = 5 - 2 * stretch;
    // 后侧皮筋：右叉尖 → 皮兜右端
    this.band(ctx, S.forkR.x, S.forkR.y, this.endRX, this.endRY, bw);
    // 装填果
    let fy = qy;
    if (level !== null) {
      const bob = s.aiming ? 0 : Math.sin(this.bobT * TAU * 1.2) * 2;
      fy = qy + bob - 1;
      painter.paint(ctx, level, qx, fy, this.vis, 'idle', this.hopOpen, 1, 1);
    } else if (s.hopT >= 0) {
      this.drawHop(ctx, g, painter, qx, qy);
    }
    // 皮兜（前沿）
    this.pouch(ctx, qx, qy, ux, uy, r);
    // 前侧皮筋：左叉尖 → 皮兜左端
    this.band(ctx, S.forkL.x, S.forkL.y, this.endLX, this.endLY, bw);
    // 力度环
    if (s.aiming && s.valid && level !== null && g.scene === 'playing') this.powerRing(ctx, qx, fy, r, s.power);
    ctx.translate(0, -off);
  }

  private offsetY(g: Game): number {
    if (g.scene === 'title' || g.scene === 'boot') this.hidden = 1;
    if (this.hidden >= 1 && g.scene !== 'playing' && g.scene !== 'gameover' && g.scene !== 'results') return 999;
    return (1 - ease.backOut(this.introT)) * 140;
  }

  private endLX = 0;
  private endLY = 0;
  private endRX = 0;
  private endRY = 0;
  private pouchGeom(qx: number, qy: number, ux: number, uy: number, r: number): void {
    // 皮兜两端：沿 u 的垂直方向 ±(r+2)，略往 u 方向偏
    const px = -uy;
    const py = ux;
    const w = r + 3;
    const back = r * 0.25;
    // 保证「左端」在屏幕左侧
    const sgn = px <= 0 ? 1 : -1;
    this.endLX = qx + px * w * sgn + ux * back;
    this.endLY = qy + py * w * sgn + uy * back;
    this.endRX = qx - px * w * sgn + ux * back;
    this.endRY = qy - py * w * sgn + uy * back;
  }

  private band(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
    ctx.lineCap = 'round';
    const sag = this.sag * 22;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + sag;
    ctx.strokeStyle = 'rgba(214,58,114,0.55)';
    ctx.lineWidth = w + 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,127,168,0.9)';
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, w * 0.28);
    ctx.beginPath();
    ctx.moveTo(x0, y0 - w * 0.18);
    ctx.quadraticCurveTo(mx, my - w * 0.18, x1, y1 - w * 0.18);
    ctx.stroke();
  }

  /** 奶油皮革皮兜：包住水果背面的月牙 */
  private pouch(ctx: CanvasRenderingContext2D, qx: number, qy: number, ux: number, uy: number, r: number): void {
    const a = Math.atan2(uy, ux);
    const R = r + 2;
    const span = 1.15;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#C9A57A';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(qx, qy, R, a - span, a + span);
    ctx.stroke();
    ctx.strokeStyle = '#FFF1DC';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(qx, qy, R - 2.2, a - span + 0.12, a + span - 0.12);
    ctx.stroke();
    // 缝线
    ctx.strokeStyle = '#E8C9A0';
    ctx.lineWidth = 1.2;
    ctx.setLineDash(DASH);
    ctx.beginPath();
    ctx.arc(qx, qy, R + 1.6, a - span + 0.1, a + span - 0.1);
    ctx.stroke();
    ctx.setLineDash(NODASH);
  }

  private powerRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number): void {
    const R = r + 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
    // 薄荷 → 柠檬 → 草莓
    let col: string;
    if (p < 0.5) col = RING_A[Math.round(p * 2 * 16)]!;
    else col = RING_B[Math.round((p - 0.5) * 2 * 16)]!;
    if (this.maxFlash > 0) col = '#FFFFFF';
    ctx.strokeStyle = 'rgba(91,58,94,0.25)';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, p));
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    if (p >= 0.999) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.bobT * 18);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** 「下一个」沿弧线跳进皮兜 */
  private drawHop(ctx: CanvasRenderingContext2D, g: Game, painter: FruitPainter, qx: number, qy: number): void {
    const s = g.sling;
    const N = CONFIG.layout.next;
    const k = clamp01(s.hopT);
    const e = ease.cubicOut(k);
    const level = s.hopLevel;
    const r = fruitDef(level).radius;
    const s0 = Math.min(1, 40 / (2 * r));
    const x = N.x + (qx - N.x) * e;
    const y = N.y + (qy - N.y) * e - Math.sin(Math.PI * k) * 54;
    const sc = s0 + (1 - s0) * ease.backOut(k);
    if (this.visLevel !== level) {
      this.visLevel = level;
      this.vis.sa = this.vis.sb = this.vis.sva = this.vis.svb = 0;
      this.vis.scale = 1;
      this.vis.scaleV = 0;
    }
    // 跳跃时沿速度方向轻微拉长
    const vx = qx - N.x;
    const vy = (qy - N.y) - Math.cos(Math.PI * k) * 54 * Math.PI;
    setStretch(this.vis, vx, vy, 0.12 * Math.sin(Math.PI * k));
    painter.paint(ctx, level, x, y, this.vis, 'born', 1, sc, 1);
  }
}

const DASH = [3, 3];
const NODASH: number[] = [];

function lerpHexTable(a: string, b: string): string[] {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const out: string[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    out.push(`rgb(${Math.round(pa[0]! + (pb[0]! - pa[0]!) * t)},${Math.round(pa[1]! + (pb[1]! - pa[1]!) * t)},${Math.round(pa[2]! + (pb[2]! - pa[2]!) * t)})`);
  }
  return out;
}
const RING_A = lerpHexTable('#5FD3B3', '#FFE15A');
const RING_B = lerpHexTable('#FFE15A', '#FF6F91');
