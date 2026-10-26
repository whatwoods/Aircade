// 桌面模式两侧道具：左边冒险地图（10 站路线 + 当前小旗），右边蜡烛（每帧烛火）、墨水瓶与羽毛笔、金币、骰子
import { ROUNDS } from '../../config.ts';
import { drawGoldCoin, drawPaper, C } from '../kit.ts';
import { ellipsePts, fillPts, inkStroke, rectPts, bez, type Pts } from '../ink.ts';
import { hashf, noise1 } from '../noise.ts';
import { LW, stage } from '../stage.ts';
import { text, HAND } from '../text.ts';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

let layoutVer = -1;
const L = { left: null as Box | null, right: null as Box | null, k: 1, stations: [] as [number, number][] };

/** 两侧空间 ≥ 120 CSS px 时才画 */
export function decorLayout(): typeof L {
  if (layoutVer === stage.version) return L;
  layoutVer = stage.version;
  const leftW = stage.ox;
  const rightW = stage.vw - (stage.ox + LW * stage.s);
  const k = Math.min(1.3, Math.max(0.7, stage.vh / 900));
  L.k = k;
  L.left = null;
  L.right = null;
  if (stage.desktop && leftW >= 120) {
    const w = Math.min(leftW - 40, 300 * k);
    const h = w * 1.3;
    L.left = { x: (leftW - w) / 2, y: stage.vh * 0.5 - h / 2, w, h };
    L.stations = [];
    for (let i = 0; i < ROUNDS; i++) {
      const t = i / (ROUNDS - 1);
      const sx = L.left.x + w * (0.22 + 0.56 * (0.5 + 0.42 * Math.sin(t * Math.PI * 2.3 + 0.6)));
      const sy = L.left.y + h * (0.88 - t * 0.74);
      L.stations.push([sx, sy]);
    }
  }
  if (stage.desktop && rightW >= 120) {
    const w = Math.min(rightW - 30, 300 * k);
    L.right = { x: stage.ox + LW * stage.s + (rightW - w) / 2, y: stage.vh * 0.5 - w * 0.75, w, h: w * 1.5 };
  }
  return L;
}

export function drawDesktopDecor(ctx: CanvasRenderingContext2D): void {
  const d = decorLayout();
  if (d.left) drawMap(ctx, d.left, d.k);
  if (d.right) drawRight(ctx, d.right, d.k);
}

function drawMap(ctx: CanvasRenderingContext2D, b: Box, k: number): void {
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(-0.06);
  ctx.translate(-b.w / 2, -b.h / 2);
  drawPaper(ctx, stage.dpr, 0, 0, b.w, b.h, { seed: 41, burn: 1.4, r: 4 });
  // 折痕
  ctx.strokeStyle = 'rgba(120,90,50,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.w / 2, 6);
  ctx.lineTo(b.w / 2, b.h - 6);
  ctx.moveTo(6, b.h / 2);
  ctx.lineTo(b.w - 6, b.h / 2);
  ctx.stroke();
  // 山、树、河（淡墨）
  ctx.strokeStyle = 'rgba(93,72,55,0.55)';
  ctx.lineWidth = 1.2 * k;
  for (let i = 0; i < 5; i++) {
    const mx = b.w * (0.12 + hashf(i, 3) * 0.76);
    const my = b.h * (0.18 + hashf(i, 4) * 0.66);
    const s = (8 + hashf(i, 5) * 8) * k;
    ctx.beginPath();
    ctx.moveTo(mx - s, my);
    ctx.lineTo(mx, my - s * 1.1);
    ctx.lineTo(mx + s, my);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const tx = b.w * (0.1 + hashf(i, 8) * 0.8);
    const ty = b.h * (0.15 + hashf(i, 9) * 0.7);
    ctx.beginPath();
    ctx.arc(tx, ty, 3 * k, 0, Math.PI * 2);
    ctx.moveTo(tx, ty + 3 * k);
    ctx.lineTo(tx, ty + 7 * k);
    ctx.stroke();
  }
  const river: Pts = [];
  bez(river, b.w * 0.05, b.h * 0.4, b.w * 0.35, b.h * 0.3, b.w * 0.6, b.h * 0.62, b.w * 0.96, b.h * 0.5, 20);
  inkStroke(ctx, river, false, 3 * k, 'rgba(79,127,168,0.45)', 4, { unit: 1, jitter: 0.6, dry: false });
  // 路线
  const st = L.stations;
  ctx.save();
  ctx.setLineDash([5 * k, 4 * k]);
  ctx.strokeStyle = 'rgba(43,29,20,0.75)';
  ctx.lineWidth = 1.6 * k;
  ctx.beginPath();
  for (let i = 0; i < st.length; i++) {
    const x = st[i][0] - b.x;
    const y = st[i][1] - b.y;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < st.length; i++) {
    const x = st[i][0] - b.x;
    const y = st[i][1] - b.y;
    const boss = i === 4 || i === 9;
    if (boss) {
      // 骷髅标
      fillPts(ctx, ellipsePts(x, y - 1, 7 * k, 6.5 * k, 16), '#f6ecd2');
      inkStroke(ctx, ellipsePts(x, y - 1, 7 * k, 6.5 * k, 16), true, 1.4, C.ink, i, { unit: 1, jitter: 0.3, dry: false });
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(x - 2.4 * k, y - 1.5 * k, 1.6 * k, 0, Math.PI * 2);
      ctx.arc(x + 2.4 * k, y - 1.5 * k, 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 2 * k, y + 3 * k, 4 * k, 2 * k);
    } else {
      ctx.fillStyle = '#f6ecd2';
      ctx.beginPath();
      ctx.arc(x, y, 4.5 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    text(ctx, String(i + 1), x + 12 * k, y + 1, { size: 11 * k, family: HAND, color: C.inkSoft });
  }
  text(ctx, '冒险路线', b.w / 2, 22 * k, { size: 16 * k, weight: 900, color: C.ink, spacing: 2 });
  ctx.restore();
}

/** 当前轮的小旗（每帧画，随轮次变化） */
export function drawMapFlag(ctx: CanvasRenderingContext2D, round: number, time: number): void {
  const d = decorLayout();
  if (!d.left || round < 1) return;
  const b = d.left;
  const st = d.stations[Math.min(ROUNDS, round) - 1];
  if (!st) return;
  const k = d.k;
  ctx.save();
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  // 和地图同样的旋转
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate(-0.06);
  ctx.translate(-b.w / 2 - b.x, -b.h / 2 - b.y);
  const x = st[0];
  const y = st[1];
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.8 * k;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 26 * k);
  ctx.stroke();
  const w = Math.sin(time * 4) * 2 * k;
  ctx.fillStyle = C.wax;
  ctx.beginPath();
  ctx.moveTo(x, y - 26 * k);
  ctx.quadraticCurveTo(x + 8 * k, y - 24 * k + w, x + 16 * k, y - 21 * k + w);
  ctx.quadraticCurveTo(x + 8 * k, y - 18 * k - w, x, y - 16 * k);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRight(ctx: CanvasRenderingContext2D, b: Box, k: number): void {
  const cx = b.x + b.w * 0.42;
  // 蜡烛（烛台 + 蜡身）
  const cy = b.y + b.h * 0.42;
  ctx.fillStyle = 'rgba(15,7,2,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 6 * k, cy + 92 * k, 46 * k, 13 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  const plate = ellipsePts(cx, cy + 86 * k, 42 * k, 12 * k, 30);
  const pg = ctx.createLinearGradient(cx - 40 * k, 0, cx + 40 * k, 0);
  pg.addColorStop(0, C.brassLight);
  pg.addColorStop(0.5, C.brass);
  pg.addColorStop(1, '#7a5420');
  fillPts(ctx, plate, pg);
  inkStroke(ctx, plate, true, 1.6, C.ink, 3, { unit: 1, jitter: 0.4, dry: false });
  const body = rectPts(cx - 14 * k, cy - 20 * k, 28 * k, 104 * k, 4 * k);
  const bg = ctx.createLinearGradient(cx - 14 * k, 0, cx + 14 * k, 0);
  bg.addColorStop(0, '#fff6dc');
  bg.addColorStop(0.6, '#efe0b8');
  bg.addColorStop(1, '#c9b48a');
  fillPts(ctx, body, bg);
  // 蜡泪
  ctx.fillStyle = '#fff3d4';
  for (let i = 0; i < 3; i++) {
    const dx = (-8 + i * 7) * k;
    ctx.beginPath();
    ctx.roundRect(cx + dx, cy - 20 * k, 4 * k, (14 + hashf(i, 3) * 20) * k, 2 * k);
    ctx.fill();
  }
  inkStroke(ctx, body, true, 1.6, C.ink, 5, { unit: 1, jitter: 0.4, dry: false });
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20 * k);
  ctx.lineTo(cx + 1, cy - 28 * k);
  ctx.stroke();
  // 墨水瓶 + 羽毛笔
  const ix = b.x + b.w * 0.78;
  const iy = b.y + b.h * 0.6;
  ctx.fillStyle = 'rgba(15,7,2,0.35)';
  ctx.beginPath();
  ctx.ellipse(ix + 4 * k, iy + 30 * k, 26 * k, 8 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  const bottle: Pts = [];
  bez(bottle, ix - 10 * k, iy - 22 * k, ix - 24 * k, iy - 10 * k, ix - 26 * k, iy + 24 * k, ix, iy + 28 * k, 10);
  bez(bottle, ix, iy + 28 * k, ix + 26 * k, iy + 24 * k, ix + 24 * k, iy - 10 * k, ix + 10 * k, iy - 22 * k, 10, true);
  const glass = ctx.createRadialGradient(ix - 8 * k, iy, 2, ix, iy + 6 * k, 30 * k);
  glass.addColorStop(0, '#4a5a78');
  glass.addColorStop(1, '#141824');
  fillPts(ctx, bottle, glass);
  inkStroke(ctx, bottle, true, 1.6, C.ink, 7, { unit: 1, jitter: 0.4, dry: false });
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.arc(ix - 4 * k, iy + 6 * k, 14 * k, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  fillPts(ctx, rectPts(ix - 9 * k, iy - 28 * k, 18 * k, 8 * k, 2), '#3a2a1a');
  // 羽毛笔
  const q: Pts = [];
  bez(q, ix + 2 * k, iy - 24 * k, ix + 14 * k, iy - 70 * k, ix + 30 * k, iy - 110 * k, ix + 44 * k, iy - 130 * k, 12);
  const vane: Pts = [];
  bez(vane, ix + 10 * k, iy - 50 * k, ix + 4 * k, iy - 90 * k, ix + 24 * k, iy - 128 * k, ix + 44 * k, iy - 130 * k, 12);
  bez(vane, ix + 44 * k, iy - 130 * k, ix + 46 * k, iy - 100 * k, ix + 30 * k, iy - 66 * k, ix + 12 * k, iy - 44 * k, 12, true);
  fillPts(ctx, vane, '#f3ead6');
  ctx.strokeStyle = 'rgba(93,72,55,0.5)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const x = ix + (2 + 42 * t) * k;
    const y = iy + (-24 - 106 * t) * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 10 * k, y - 4 * k);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 * k, y + 4 * k);
    ctx.stroke();
  }
  inkStroke(ctx, vane, true, 1.2, C.ink, 9, { unit: 1, jitter: 0.4, dry: false });
  inkStroke(ctx, q, false, 1.6, C.ink, 11, { unit: 1, jitter: 0.3, dry: false });
  // 金币
  for (let i = 0; i < 4; i++) {
    const gx = b.x + b.w * (0.14 + hashf(i, 21) * 0.36);
    const gy = b.y + b.h * (0.8 + hashf(i, 22) * 0.12);
    drawGoldCoin(ctx, gx, gy, 11 * k);
  }
  // 两颗骰子
  for (let i = 0; i < 2; i++) {
    const dx = b.x + b.w * (0.62 + i * 0.18);
    const dy = b.y + b.h * (0.86 + i * 0.04);
    const s = 22 * k;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(0.3 + i * 0.7);
    ctx.fillStyle = 'rgba(15,7,2,0.35)';
    ctx.fillRect(-s / 2 + 2, -s / 2 + 3, s, s);
    const p = rectPts(-s / 2, -s / 2, s, s, 4 * k);
    fillPts(ctx, p, '#f6ecd2');
    inkStroke(ctx, p, true, 1.4, C.ink, 13 + i, { unit: 1, jitter: 0.3, dry: false });
    ctx.fillStyle = i === 0 ? C.wax : C.ink;
    const pips = i === 0 ? [[0, 0]] : [[-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [0, 0]];
    for (const [px, py] of pips) {
      ctx.beginPath();
      ctx.arc(px * s, py * s, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 烛火：每帧重画，带周围暖光 ±4% 闪烁 */
export function drawCandleFlame(ctx: CanvasRenderingContext2D, time: number): void {
  const d = decorLayout();
  const b = d.right;
  if (!b) return;
  const k = d.k;
  const cx = b.x + b.w * 0.42;
  const cy = b.y + b.h * 0.42 - 30 * k;
  const f = 1 + 0.04 * noise1(time * 6, 3) + 0.03 * Math.sin(time * 17);
  const sway = noise1(time * 2.3, 5) * 3 * k;
  // 光晕
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const R = 150 * k * f;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, 'rgba(255,190,100,0.22)');
  g.addColorStop(0.4, 'rgba(255,160,70,0.08)');
  g.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  // 火焰
  const h = 26 * k * f;
  ctx.save();
  ctx.translate(cx, cy);
  const fg = ctx.createRadialGradient(0, -h * 0.25, 1, 0, -h * 0.3, h * 0.8);
  fg.addColorStop(0, '#fffbe8');
  fg.addColorStop(0.35, '#ffd36b');
  fg.addColorStop(0.8, 'rgba(255,140,40,0.85)');
  fg.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(0, 4 * k);
  ctx.bezierCurveTo(-9 * k, 0, -7 * k, -h * 0.55, sway, -h);
  ctx.bezierCurveTo(7 * k, -h * 0.55, 9 * k, 0, 0, 4 * k);
  ctx.fill();
  ctx.fillStyle = 'rgba(80,120,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 1 * k, 3 * k, 4 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
