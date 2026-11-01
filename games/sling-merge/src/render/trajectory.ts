/**
 * 预测点线（docs §4.7 预测线 / §3.3）：糖珠点每 17 px，半径 4.5→2.2、透明度 1→0.35，
 * 第 1 次反弹后 ×0.7；反弹点四角星；终点幽灵圈（果色 35% + 虚线外圈）；
 * 命中同级时全部变金、幽灵圈旁冒爱心；满力时整体发亮并轻微脉动；淡入 0.12 s / 淡出 0.1 s。
 */
import { CONFIG, fruitDef } from '../config';
import type { Game } from '../game/game';
import { ctx2d, heartPath, hexA, makeCanvas, sparklePath } from './util';

const PV = CONFIG.preview;
const TAU = Math.PI * 2;

interface DotSprite {
  c: HTMLCanvasElement;
  R: number;
}

function dotSprite(ratio: number, fill: string, stroke: string, glow: string | null): DotSprite {
  const R = 10;
  const c = makeCanvas(R * 2 * ratio, R * 2 * ratio);
  const ctx = ctx2d(c);
  ctx.scale(ratio, ratio);
  ctx.translate(R, R);
  if (glow) {
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, R);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, R * 2, R * 2);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-1.4, -1.6, 1.3, 0, TAU);
  ctx.fill();
  return { c, R };
}

const GHOST_FILL: string[] = [];
const GHOST_LINE: string[] = [];
for (let l = 1; l <= CONFIG.maxLevel; l++) {
  GHOST_FILL.push(hexA(fruitDef(l).colors.base, 0.35));
  GHOST_LINE.push(hexA(fruitDef(l).colors.outline, 0.8));
}
const DASH = [5, 5];
const NODASH: number[] = [];

export class Trajectory {
  private ratio = 0;
  private dot: DotSprite | null = null;
  private gold: DotSprite | null = null;
  private dotGlow: DotSprite | null = null;
  private goldGlow: DotSprite | null = null;
  /** 显示强度 0..1（淡入淡出） */
  private a = 0;
  private t = 0;

  build(ratio: number): void {
    if (this.dot && Math.abs(ratio - this.ratio) / ratio < 0.1) return;
    this.ratio = ratio;
    const rr = Math.min(ratio * 1.5, 4);
    this.dot = dotSprite(rr, '#FFFFFF', '#FF8FAB', null);
    this.gold = dotSprite(rr, '#FFC93C', '#F2A100', null);
    this.dotGlow = dotSprite(rr, '#FFFFFF', '#FF6F91', 'rgba(255,255,255,0.9)');
    this.goldGlow = dotSprite(rr, '#FFE15A', '#F2A100', 'rgba(255,240,168,0.95)');
  }

  update(g: Game, dt: number): void {
    this.t += dt;
    const on = g.predictionOn && g.prediction.count > 1;
    if (on) this.a = Math.min(1, this.a + dt / 0.12);
    else this.a = Math.max(0, this.a - dt / 0.1);
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.a <= 0.01) return;
    const pr = g.prediction;
    const n = pr.count;
    if (n < 2) return;
    const s = g.sling;
    const same = g.predictSame;
    const full = s.power >= 0.999;
    const pulse = full ? 0.85 + 0.15 * Math.sin(this.t * 14) : 1;
    const sp = full ? (same ? this.goldGlow! : this.dotGlow!) : same ? this.gold! : this.dot!;
    const xs = pr.xs;
    const ys = pr.ys;
    const seg = pr.seg;
    // 总长
    let total = 0;
    for (let i = 1; i < n; i++) {
      const dx = xs[i]! - xs[i - 1]!;
      const dy = ys[i]! - ys[i - 1]!;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    if (total < 1) return;
    const spacing = PV.dotSpacing;
    const r0 = PV.dotR[0];
    const r1 = PV.dotR[1];
    const tailFade = pr.ended ? 0 : PV.tailAfterLastBounce;
    // 起点让开装填果
    const r = fruitDef(s.loaded ?? 1).radius;
    let next = Math.max(spacing * 0.6, r + 6);
    let acc = 0;
    const base = this.a * pulse;
    const R = sp.R;
    for (let i = 1; i < n; i++) {
      const x0 = xs[i - 1]!;
      const y0 = ys[i - 1]!;
      const dx = xs[i]! - x0;
      const dy = ys[i]! - y0;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L <= 0) continue;
      while (next <= acc + L) {
        const k = (next - acc) / L;
        const x = x0 + dx * k;
        const y = y0 + dy * k;
        const f = next / total;
        let alpha = 1 - 0.65 * f;
        if (seg[i] === 1) alpha *= 0.7;
        if (tailFade > 0 && total - next < tailFade) alpha *= (total - next) / tailFade;
        let rad = r0 + (r1 - r0) * f;
        if (full) rad *= 1.15;
        const sc = rad / 4.5;
        ctx.globalAlpha = base * alpha;
        ctx.drawImage(sp.c, x - R * sc, y - R * sc, R * 2 * sc, R * 2 * sc);
        next += spacing;
      }
      acc += L;
    }
    // 反弹星
    const bc = Math.min(pr.bounceCount, pr.bx.length);
    for (let i = 0; i < bc; i++) {
      const bx = pr.bx[i]!;
      const by = pr.by[i]!;
      ctx.globalAlpha = this.a * (i === 0 ? 1 : 0.75);
      ctx.fillStyle = same ? '#FFC93C' : '#FFFFFF';
      ctx.strokeStyle = same ? '#F2A100' : '#FF8FAB';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      sparklePath(ctx, bx, by, 8 + Math.sin(this.t * 8 + i) * 1.2);
      ctx.fill();
      ctx.stroke();
    }
    // 终点幽灵圈
    if (pr.ended && s.loaded !== null) {
      const lv = s.loaded;
      const ex = pr.endX;
      const ey = pr.endY;
      ctx.globalAlpha = this.a;
      ctx.fillStyle = same ? 'rgba(255,201,60,0.35)' : GHOST_FILL[lv - 1]!;
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, TAU);
      ctx.fill();
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -this.t * 18;
      ctx.lineWidth = 2;
      ctx.strokeStyle = same ? '#F2A100' : GHOST_LINE[lv - 1]!;
      ctx.beginPath();
      ctx.arc(ex, ey, r + 2.5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash(NODASH);
      ctx.lineDashOffset = 0;
      if (same) {
        const hb = 1 + 0.12 * Math.sin(this.t * 9);
        const hx = ex + r * 0.85;
        const hy = ey - r * 0.85;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(hb, hb);
        ctx.beginPath();
        heartPath(ctx, 0, 0, 7);
        ctx.fillStyle = '#FF6F91';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}
