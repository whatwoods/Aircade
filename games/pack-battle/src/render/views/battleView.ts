// 对决带（沙漏 + VS 墨笔）、投射物池（墨迹斩击 / 箭 / 闪电 / 黏液 / 火球 / 护盾 / 绿叶）、结算缎带
import { Pool } from '../../core/pool.ts';
import { ease } from '../../core/tween.ts';
import type { ItemId } from '../../game/types.ts';
import { C, cached, drawRibbon } from '../kit.ts';
import type { Rect } from '../layout.ts';
import { glowOf } from '../fx/particles.ts';
import { drawItemAt } from '../sprites.ts';
import { HAND, drawSprite, text } from '../text.ts';

// ---------- 对决带 ----------

export function drawBand(ctx: CanvasRenderingContext2D, band: Rect, glass: Rect, remain: number, storm: boolean, time: number, alpha: number): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const cy = band.y + band.h / 2;
  // 两侧墨笔 VS 笔触
  drawSprite(ctx, vsStroke(150), 12, cy - 10);
  ctx.save();
  ctx.translate(378, cy + 10);
  ctx.scale(-1, -1);
  drawSprite(ctx, vsStroke(150), 0, 0);
  ctx.restore();
  text(ctx, 'VS', glass.x - 30, cy + 2, { size: 22, family: HAND, color: C.paper, stroke: C.ink, strokeW: 4, alpha: 0.85 });
  text(ctx, 'VS', glass.x + glass.w + 30, cy + 2, { size: 22, family: HAND, color: C.paper, stroke: C.ink, strokeW: 4, alpha: 0.85 });
  // 沙漏
  drawHourglass(ctx, glass, remain, storm, time);
  ctx.restore();
}

function vsStroke(w: number) {
  return cached('vsstroke|' + w, w, 20, 4, (ctx) => {
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      ctx.lineTo(t * w, 10 - Math.sin(t * Math.PI) * 4 - t * 3);
    }
    for (let i = 20; i >= 0; i--) {
      const t = i / 20;
      ctx.lineTo(t * w, 10 + Math.sin(t * Math.PI) * 1.5 * (1 - t) + 3 * (1 - t) - t * 3);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillRect(w * 0.15, 15, w * 0.3, 1.5);
  });
}

function drawHourglass(ctx: CanvasRenderingContext2D, r: Rect, remain: number, storm: boolean, time: number): void {
  const cx = r.x + r.w / 2;
  const top = r.y + 2;
  const bot = r.y + r.h - 2;
  const hw = r.w / 2 - 6;
  const mid = (top + bot) / 2;
  const frac = Math.max(0, Math.min(1, Math.abs(remain) / 30));
  ctx.save();
  // 木框
  ctx.fillStyle = '#6b4424';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  for (const yy of [top - 2, bot - 4]) {
    ctx.beginPath();
    ctx.roundRect(cx - hw - 6, yy, hw * 2 + 12, 6, 2);
    ctx.fill();
    ctx.stroke();
  }
  // 玻璃
  ctx.beginPath();
  ctx.moveTo(cx - hw, top + 4);
  ctx.lineTo(cx + hw, top + 4);
  ctx.quadraticCurveTo(cx + hw, mid - 6, cx + 2.5, mid);
  ctx.quadraticCurveTo(cx + hw, mid + 6, cx + hw, bot - 4);
  ctx.lineTo(cx - hw, bot - 4);
  ctx.quadraticCurveTo(cx - hw, mid + 6, cx - 2.5, mid);
  ctx.quadraticCurveTo(cx - hw, mid - 6, cx - hw, top + 4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(200,225,235,0.18)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sand = storm ? '#c96a3a' : '#e8c27a';
  ctx.fillStyle = sand;
  const tH = (mid - top - 6) * frac;
  ctx.fillRect(cx - hw, mid - tH, hw * 2, tH);
  const bH = (bot - mid - 6) * (1 - frac);
  ctx.beginPath();
  ctx.moveTo(cx - hw, bot - 4);
  ctx.lineTo(cx + hw, bot - 4);
  ctx.lineTo(cx + hw, bot - 4 - bH * 0.6);
  ctx.lineTo(cx, bot - 4 - bH * 1.2);
  ctx.lineTo(cx - hw, bot - 4 - bH * 0.6);
  ctx.closePath();
  ctx.fill();
  if (frac > 0 || storm) {
    ctx.fillRect(cx - 0.8, mid, 1.6, bot - mid - 4 - bH);
  }
  ctx.restore();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (storm) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - hw + 3, top + 10);
    ctx.lineTo(cx - 2, top + 16);
    ctx.lineTo(cx + 3, top + 13);
    ctx.stroke();
  }
  ctx.restore();
  if (remain < 0) return; // 结算缎带展开时隐藏计时
  const label = storm ? '风暴' : String(Math.ceil(remain));
  text(ctx, label, cx, bot + 9, { size: storm ? 12 : 15, weight: storm ? 900 : 400, family: storm ? undefined : HAND, color: storm ? '#ffb48a' : C.paper, stroke: C.ink, strokeW: 3, alpha: storm ? 0.8 + 0.2 * Math.sin(time * 8) : 1 });
}

// ---------- 投射物 ----------

export type ProjKind = 'slash' | 'arrow' | 'bolt' | 'blob' | 'fire' | 'spin' | 'shield' | 'leaf' | 'fang';

export interface Proj {
  kind: ProjKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  arc: number;
  color: string;
  id: ItemId;
  size: number;
}

export const projs = new Pool<Proj>(
  () => ({ kind: 'slash', x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 0.2, arc: 0, color: '#fff', id: 'dagger', size: 1 }),
  48,
  24,
);

export function launch(kind: ProjKind, x0: number, y0: number, x1: number, y1: number, dur: number, color: string, id: ItemId, arc = 0, size = 1): void {
  const p = projs.get();
  p.kind = kind;
  p.x0 = x0;
  p.y0 = y0;
  p.x1 = x1;
  p.y1 = y1;
  p.t = 0;
  p.dur = Math.max(0.05, dur);
  p.arc = arc;
  p.color = color;
  p.id = id;
  p.size = size;
}

export function updateProjs(dt: number): void {
  const live = projs.live;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.t += dt;
    if (p.t >= p.dur + (p.kind === 'bolt' ? 0.08 : 0)) projs.releaseAt(i);
  }
}

export function clearProjs(): void {
  projs.clear();
}

const Q = { x: 0, y: 0 };
function at(p: Proj, k: number, out: { x: number; y: number }): void {
  out.x = p.x0 + (p.x1 - p.x0) * k;
  out.y = p.y0 + (p.y1 - p.y0) * k - p.arc * 4 * k * (1 - k);
}

export function drawProjs(ctx: CanvasRenderingContext2D, time: number): void {
  const live = projs.live;
  for (let i = 0; i < live.length; i++) {
    const p = live[i];
    const k = Math.min(1, p.t / p.dur);
    const e = p.kind === 'shield' || p.kind === 'leaf' ? ease.inOutQuad(k) : ease.inQuad(k) * 0.35 + k * 0.65;
    at(p, e, Q);
    const ang = Math.atan2(p.y1 - p.y0 - p.arc * 4 * (1 - 2 * e), p.x1 - p.x0);
    ctx.save();
    switch (p.kind) {
      case 'slash': {
        // 墨迹弧形斩击（带短拖尾）
        ctx.translate(Q.x, Q.y);
        ctx.rotate(ang);
        ctx.scale(p.size, p.size);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(glowOf(p.color), -14, -14, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.moveTo(8, -12);
        ctx.quadraticCurveTo(-8, 0, 8, 12);
        ctx.quadraticCurveTo(0, 0, 8, -12);
        ctx.fill();
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath();
        ctx.moveTo(10, -11);
        ctx.quadraticCurveTo(-3, 0, 10, 11);
        ctx.quadraticCurveTo(3, 0, 10, -11);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-26, 0);
        ctx.stroke();
        break;
      }
      case 'fang': {
        ctx.translate(Q.x, Q.y);
        ctx.rotate(ang);
        ctx.fillStyle = '#f6efe0';
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'arrow': {
        ctx.translate(Q.x, Q.y);
        ctx.rotate(ang);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.fillStyle = '#c9ccd2';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(7, -4.5);
        ctx.lineTo(7, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c2402c';
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(-28, -5);
        ctx.lineTo(-16, 0);
        ctx.lineTo(-28, 5);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'bolt': {
        // 闪电：从源头到当前点的折线，随机闪烁
        const n = 7;
        ctx.strokeStyle = '#fff7c0';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'lighter';
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          ctx.moveTo(p.x0, p.y0);
          const f = Math.floor(time * 30);
          for (let j = 1; j <= n; j++) {
            const kk = (j / n) * e;
            const x = p.x0 + (p.x1 - p.x0) * kk;
            const y = p.y0 + (p.y1 - p.y0) * kk;
            const off = j === n ? 0 : Math.sin(j * 12.9898 + f * 78.233) * 9;
            ctx.lineTo(x - Math.sin(ang) * off, y + Math.cos(ang) * off);
          }
          ctx.strokeStyle = pass === 0 ? 'rgba(242,205,63,0.5)' : '#fffbe0';
          ctx.lineWidth = pass === 0 ? 8 : 2.4;
          ctx.stroke();
        }
        break;
      }
      case 'blob': {
        ctx.translate(Q.x, Q.y);
        const sq = 1 + Math.sin(k * 20) * 0.15;
        ctx.scale(sq, 2 - sq);
        ctx.fillStyle = '#7fbf5a';
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-2.5, -2.5, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'fire': {
        ctx.translate(Q.x, Q.y);
        ctx.globalCompositeOperation = 'lighter';
        const s = 26 * p.size;
        ctx.drawImage(glowOf('#ff7a2a'), -s, -s, s * 2, s * 2);
        ctx.drawImage(glowOf('#ffd36b'), -s * 0.5, -s * 0.5, s, s);
        break;
      }
      case 'spin': {
        ctx.translate(Q.x, Q.y);
        drawItemAt(ctx, p.id, 1, time * 22, 0, 0, 18 * p.size, 'tile', true);
        break;
      }
      case 'shield': {
        ctx.translate(Q.x, Q.y);
        const s = 0.8 + 0.3 * Math.sin(k * Math.PI);
        ctx.scale(s, s);
        ctx.fillStyle = C.shield;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(8, -6);
        ctx.quadraticCurveTo(8, 5, 0, 10);
        ctx.quadraticCurveTo(-8, 5, -8, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = C.shieldLight;
        ctx.fillRect(-1, -6, 2, 12);
        break;
      }
      case 'leaf': {
        ctx.translate(Q.x, Q.y);
        ctx.rotate(Math.sin(time * 9 + p.x0) * 0.5);
        ctx.fillStyle = C.heal;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.quadraticCurveTo(7, -2, 0, 8);
        ctx.quadraticCurveTo(-7, -2, 0, -8);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = C.healLight;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}

// ---------- 结算缎带 ----------

export function drawResultRibbon(ctx: CanvasRenderingContext2D, cx: number, cy: number, win: boolean, k: number, time: number): void {
  if (k <= 0.01) return;
  const kx = ease.outBack(Math.min(1, k));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.02 + Math.sin(time * 1.5) * 0.004);
  ctx.save();
  ctx.scale(Math.max(0.02, kx), 1);
  drawSprite(ctx, ribbonSprite(win), -125, -27);
  ctx.restore();
  if (k > 0.5) {
    const a = Math.min(1, (k - 0.5) * 3);
    text(ctx, win ? '胜利！' : '败北…', 0, 2, { size: 30, weight: 900, color: win ? C.wax : C.inkSoft, spacing: 6, alpha: a });
  }
  ctx.restore();
}

function ribbonSprite(win: boolean) {
  return cached('resribbon|' + win, 250, 54, 40, (ctx) => {
    drawRibbon(ctx, 0, 0, 250, 54, win ? '#efe0bd' : '#d8c8a8', 13);
    if (!win) {
      // 纸面撕裂
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(195, 0);
      ctx.lineTo(186, 18);
      ctx.lineTo(197, 34);
      ctx.lineTo(189, 54);
      ctx.stroke();
    }
  });
}
