// 26 个装备图标（rot0，1 格 = 54 单位）
import type { ItemId } from '../../game/types.ts';
import { bez, ellipsePts, fillPts, pathPts, quad, rectPts, xform, type Pts } from '../ink.ts';
import { hashf } from '../noise.ts';
import { mixHex } from '../textures.ts';
import { ball, blade, gem, grip, guard, leaf, lin, line, outline, paint, rad, shine, steel, woodGrad, woodLines, type Pen } from './primitives.ts';

type Draw = (pen: Pen) => void;

function spark(pen: Pen, x: number, y: number, r: number, color = '#ffd36b'): void {
  const ctx = pen.ctx;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bubbles(pen: Pen, list: [number, number, number][], color: string): void {
  const ctx = pen.ctx;
  for (const [x, y, r] of list) {
    const p = ellipsePts(x, y, r, r, 10);
    fillPts(ctx, p, rad(ctx, x, y, r, mixHex(color, '#ffffff', 0.6), color));
    outline(pen, p, 1.2);
  }
}

const dagger: Draw = (pen) => {
  grip(pen, 9, 47, 18, 37, 8, '#6b3f22', '#d6b47a');
  guard(pen, 19.5, 35, 17, 6, -Math.PI / 4 + Math.PI / 2);
  blade(pen, 21, 33, 46, 8, 10, { fuller: true });
  ball(pen, 7.5, 48.5, 3.6);
};

const sword: Draw = (pen) => {
  blade(pen, 27, 120, 27, 9, 14, { fuller: true });
  guard(pen, 27, 124, 42, 8, 0);
  grip(pen, 27, 128, 27, 148, 9, '#5a3420', '#caa772');
  ball(pen, 27, 153, 6.2);
};

const buckler: Draw = (pen) => {
  const ctx = pen.ctx;
  const p = ellipsePts(54, 54, 47, 47, 40);
  paint(pen, p, woodGrad(ctx, 10, 10, 98, 98, '#a06d3c'), '#5a3720', { hatch: 5, outline: 0 });
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,30,12,0.65)';
  ctx.lineWidth = 1.5 * pen.k;
  for (const x of [32, 54, 76]) {
    ctx.beginPath();
    ctx.moveTo(x + 1, 4);
    ctx.lineTo(x - 1, 104);
    ctx.stroke();
  }
  woodLines(pen, p, 0, 54, 108, 54, 0);
  ctx.restore();
  // 铁边
  const rim = ellipsePts(54, 54, 44, 44, 40);
  ctx.save();
  pathPts(ctx, rim, true);
  ctx.strokeStyle = '#7d868b';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(54, 54, 45, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const x = 54 + Math.cos(a) * 44;
    const y = 54 + Math.sin(a) * 44;
    ctx.fillStyle = '#d9dcdc';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e4447';
    ctx.beginPath();
    ctx.arc(x + 0.6, y + 0.6, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  outline(pen, p, 2.4);
  outline(pen, ellipsePts(54, 54, 40.5, 40.5, 36), 1.3);
  // 中央铁凸
  const boss = ellipsePts(54, 54, 13, 13, 18);
  fillPts(ctx, boss, rad(ctx, 54, 54, 14, '#f1f3f3', '#a3abaf', '#5a6266'));
  shine(pen, [47, 50, 51, 45], 2, 0.9);
  outline(pen, boss, 1.8);
};

const leather: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 14, 46, 10, 30, 14, 18, 44, 10, 6);
  quad(p, 44, 10, 62, 12, 70, 30, 6, true);
  quad(p, 70, 30, 81, 38, 92, 30, 4, true);
  quad(p, 92, 30, 100, 12, 118, 10, 6, true);
  bez(p, 118, 10, 148, 18, 152, 30, 148, 46, 6, true);
  quad(p, 148, 46, 126, 52, 106, 50, 5, true);
  quad(p, 106, 50, 108, 76, 104, 100, 6, true);
  quad(p, 104, 100, 81, 104, 58, 100, 5, true);
  quad(p, 58, 100, 54, 76, 56, 50, 6, true);
  quad(p, 56, 50, 36, 52, 14, 46, 5, true);
  paint(pen, p, lin(ctx, 20, 10, 140, 100, '#b98455', '#8b5a32', '#5f3a1d'), '#4a2a14', { hatch: 5, outline: 0, edgeW: 3 });
  // 缝线
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.setLineDash([3.5, 3.5]);
  ctx.strokeStyle = '#efd9a7';
  ctx.lineWidth = 1.3 * pen.k;
  ctx.globalAlpha = 0.85;
  const inner = xform(p, 81 * 0.1, 56 * 0.14 + 2, 0.9, 0.86);
  pathPts(ctx, inner, true);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // 系带
  ctx.save();
  ctx.strokeStyle = '#3a2213';
  ctx.lineWidth = 1.6 * pen.k;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const y = 44 + i * 13;
    ctx.moveTo(74, y);
    ctx.lineTo(88, y + 9);
    ctx.moveTo(88, y);
    ctx.lineTo(74, y + 9);
  }
  ctx.stroke();
  ctx.restore();
  line(pen, [81, 38, 81, 98], 1.4, '#3a2213', 0.7);
  shine(pen, [22, 26, 34, 17, 44, 15], 2.2, 0.45);
  outline(pen, p, 2.3);
};

const herb: Draw = (pen) => {
  const ctx = pen.ctx;
  line(pen, [27, 46, 27, 30], 2.2, '#4d6b25');
  line(pen, [27, 46, 20, 30], 2, '#4d6b25');
  line(pen, [27, 46, 35, 31], 2, '#4d6b25');
  leaf(pen, 20, 31, 22, 8, -Math.PI / 2 - 0.55, '#6f9d3c');
  leaf(pen, 35, 31, 22, 8, -Math.PI / 2 + 0.55, '#7aa845');
  leaf(pen, 27, 31, 25, 9, -Math.PI / 2, '#86b34f');
  // 麻绳
  const tw = rectPts(21, 38, 12, 6, 2);
  fillPts(ctx, tw, '#c9a46a');
  line(pen, [22, 39, 32, 43], 1, '#7a5a2a', 0.8);
  outline(pen, tw, 1.4);
};

const whetstone: Draw = (pen) => {
  const ctx = pen.ctx;
  const p = xform(rectPts(-19, -11, 38, 22, 6), 26, 30, 1, 1, -0.32);
  paint(pen, p, lin(ctx, 8, 14, 44, 44, '#b7bcbd', '#868d90', '#5d6467'), '#3d4447', { hatch: 4 });
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,46,50,0.4)';
  ctx.lineWidth = 0.9 * pen.k;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(10 + i * 6, 40);
    ctx.lineTo(22 + i * 6, 18);
    ctx.stroke();
  }
  ctx.restore();
  shine(pen, xform([-14, -6, 10, -6], 26, 30, 1, 1, -0.32), 2.2, 0.75);
  outline(pen, p, 2.2);
  spark(pen, 44, 14, 5);
  spark(pen, 38, 8, 3.2, '#ffe9a8');
};

const glove: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  // 从袖口左下开始顺时针
  p.push(12, 98, 12, 66);
  quad(p, 12, 66, 6, 52, 8, 44, 4, true); // 拇指根
  quad(p, 8, 44, 6, 34, 12, 34, 4, true);
  quad(p, 12, 34, 16, 40, 16, 50, 4, true);
  p.push(17, 30);
  quad(p, 17, 30, 15, 14, 20, 12, 4, true);
  quad(p, 20, 12, 25, 12, 24, 30, 4, true);
  p.push(26, 24);
  quad(p, 26, 24, 25, 6, 30, 6, 4, true);
  quad(p, 30, 6, 35, 6, 33, 26, 4, true);
  p.push(35, 28);
  quad(p, 35, 28, 36, 10, 41, 11, 4, true);
  quad(p, 41, 11, 45, 13, 42, 32, 4, true);
  p.push(43, 36);
  quad(p, 43, 36, 46, 24, 49, 26, 4, true);
  quad(p, 49, 26, 51, 30, 47, 52, 4, true);
  p.push(44, 66, 44, 98);
  paint(pen, p, lin(ctx, 8, 10, 50, 90, '#c08a58', '#93613a', '#63401f'), '#4a2a14', { hatch: 5, outline: 0 });
  // 袖口
  const cuff = rectPts(10, 78, 36, 22, 4);
  paint(pen, cuff, lin(ctx, 10, 78, 46, 100, '#8a5a34', '#6a4222'), '#3a2213', { hatch: 0, outline: 2 });
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#efd9a7';
  ctx.lineWidth = 1.2 * pen.k;
  ctx.beginPath();
  ctx.moveTo(13, 83);
  ctx.lineTo(43, 83);
  ctx.moveTo(13, 95);
  ctx.lineTo(43, 95);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  line(pen, [24, 34, 25, 50], 1, '#4a2a14', 0.6);
  line(pen, [33, 30, 33, 50], 1, '#4a2a14', 0.6);
  shine(pen, [15, 60, 15, 48], 2, 0.5);
  outline(pen, p, 2.2);
};

const pouch: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 18, 20, 4, 30, 6, 50, 27, 50, 8);
  bez(p, 27, 50, 48, 50, 50, 30, 36, 20, 8, true);
  quad(p, 36, 20, 27, 17, 18, 20, 4, true);
  paint(pen, p, lin(ctx, 6, 18, 48, 50, '#c49a63', '#9a7040', '#6a4a26'), '#4a3014', { hatch: 4.5 });
  // 袋口褶
  const top: Pts = [];
  quad(top, 17, 18, 27, 4, 37, 18, 6);
  top.push(33, 13, 27, 9, 21, 13);
  fillPts(ctx, top, '#a07848');
  outline(pen, top, 1.6);
  // 金币
  const c = ellipsePts(34, 12, 6.5, 6.5, 14);
  fillPts(ctx, c, rad(ctx, 34, 12, 7, '#fff1b0', '#f8da7a', '#e2a533'));
  outline(pen, c, 1.4);
  // 绳
  ctx.save();
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 2.2 * pen.k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(17, 21);
  ctx.quadraticCurveTo(27, 25, 37, 21);
  ctx.stroke();
  ctx.restore();
  shine(pen, [14, 32, 16, 26], 2, 0.5);
};

const boomerang: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  // 外轮廓：竖臂(左列) + 横臂(底行)，圆角
  quad(p, 14, 14, 18, 6, 30, 8, 4);
  quad(p, 30, 8, 40, 12, 38, 22, 4, true);
  quad(p, 38, 22, 34, 50, 44, 68, 6, true);
  quad(p, 44, 68, 66, 74, 92, 70, 6, true);
  quad(p, 92, 70, 102, 74, 100, 86, 4, true);
  quad(p, 100, 86, 96, 96, 84, 96, 4, true);
  quad(p, 84, 96, 40, 100, 22, 88, 6, true);
  quad(p, 22, 88, 10, 70, 12, 40, 6, true);
  quad(p, 12, 40, 12, 24, 14, 14, 4, true);
  paint(pen, p, woodGrad(ctx, 10, 10, 100, 96, '#c08a4c'), '#6a4220', { hatch: 5, outline: 0 });
  // 红色彩绘带
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.fillStyle = '#b8402e';
  ctx.globalAlpha = 0.9;
  ctx.fillRect(4, 30, 40, 7);
  ctx.fillRect(66, 60, 7, 44);
  ctx.globalAlpha = 1;
  ctx.restore();
  shine(pen, [17, 20, 18, 50, 26, 72], 2, 0.5);
  outline(pen, p, 2.3);
};

const axe: Draw = (pen) => {
  const ctx = pen.ctx;
  // 木柄（左列）
  const h = rectPts(21, 14, 12, 142, 5);
  paint(pen, h, woodGrad(ctx, 21, 0, 33, 0, '#9a6a3c'), '#5a3720', { hatch: 0, outline: 0 });
  woodLines(pen, h, 27, 14, 27, 156, 3);
  outline(pen, h, 2);
  grip(pen, 27, 118, 27, 150, 13, '#5a3420', '#c9a46a');
  // 斧刃（右上格）
  const b: Pts = [];
  b.push(30, 18, 52, 14);
  bez(b, 52, 14, 70, 2, 96, 2, 104, 8, 8, true);
  bez(b, 104, 8, 96, 22, 96, 36, 104, 50, 8, true);
  bez(b, 104, 50, 92, 56, 70, 54, 52, 42, 8, true);
  b.push(30, 40);
  paint(pen, b, steel(ctx, 40, 4, 80, 54), '#4f5a60', { hatch: 4.5, outline: 0 });
  // 刃口亮线
  const edge: Pts = [];
  bez(edge, 101, 11, 94, 22, 94, 36, 101, 47, 8);
  shine(pen, edge, 2.4, 0.9);
  outline(pen, b, 2.3);
  // 套箍
  const sock = rectPts(18, 14, 18, 30, 3);
  fillPts(ctx, sock, lin(ctx, 18, 14, 36, 44, '#c3c9cc', '#7d868b'));
  outline(pen, sock, 1.8);
  ctx.fillStyle = '#e6e9ea';
  for (const y of [21, 37]) {
    ctx.beginPath();
    ctx.arc(27, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

const kris: Draw = (pen) => {
  const ctx = pen.ctx;
  // 波浪刃：从 (68,108) 到 (22,10)
  blade(pen, 70, 108, 22, 10, 13, { wavy: 5, color: '#9a86b0' });
  // 紫色光泽
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'lighter';
  line(pen, [60, 92, 46, 60, 30, 26], 3, '#b07ad8', 0.7);
  ctx.restore();
  // 护手 + 蛇头柄
  guard(pen, 72, 112, 24, 7, Math.atan2(98, -46) + Math.PI / 2);
  const hp: Pts = [];
  quad(hp, 72, 116, 88, 124, 84, 142, 6);
  bez(hp, 84, 142, 82, 152, 96, 158, 100, 148, 6, true);
  bez(hp, 100, 148, 104, 138, 96, 130, 92, 134, 6, true);
  quad(hp, 92, 134, 90, 122, 78, 112, 6, true);
  paint(pen, hp, lin(ctx, 76, 116, 100, 156, '#7fa35a', '#4f7a34', '#2f4f1e'), '#203a14', { hatch: 0, outline: 2 });
  ctx.fillStyle = '#f2cd3f';
  ctx.beginPath();
  ctx.arc(96, 146, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a10';
  ctx.beginPath();
  ctx.arc(96.3, 146, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // 毒液滴
  const drop: Pts = [];
  quad(drop, 16, 20, 11, 30, 16, 34, 6);
  quad(drop, 16, 34, 21, 30, 16, 20, 6, true);
  fillPts(ctx, drop, rad(ctx, 16, 29, 6, '#e3c2f4', '#9b6cc0'));
  outline(pen, drop, 1.3);
};

const helmet: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  p.push(10, 46);
  bez(p, 10, 46, 8, 14, 40, 4, 62, 6, 10, true);
  bez(p, 62, 6, 88, 8, 100, 28, 98, 46, 10, true);
  p.push(76, 46, 72, 36, 50, 36, 48, 46);
  paint(pen, p, steel(ctx, 20, 4, 70, 50), '#4f5a60', { hatch: 4.5, outline: 0 });
  // 眼缝
  const slit = rectPts(54, 22, 34, 5, 2);
  fillPts(ctx, slit, '#1e2326');
  // 护鼻条
  const nose = rectPts(73, 20, 6, 30, 2);
  fillPts(ctx, nose, lin(ctx, 73, 20, 79, 50, '#d8dcde', '#7d868b'));
  outline(pen, nose, 1.4);
  // 冠脊
  line(pen, [16, 30, 30, 12, 56, 7], 1.4, '#59646a', 0.8);
  for (const [x, y] of [[18, 40], [32, 41], [92, 40]] as [number, number][]) {
    ctx.fillStyle = '#e6e9ea';
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3e4447';
    ctx.beginPath();
    ctx.arc(x + 0.6, y + 0.6, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  shine(pen, [20, 24, 30, 14, 44, 10], 2.4, 0.8);
  outline(pen, p, 2.3);
};

const potion: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  p.push(20, 26, 20, 50);
  bez(p, 20, 50, 2, 56, 2, 98, 27, 100, 10, true);
  bez(p, 27, 100, 52, 98, 52, 56, 34, 50, 10, true);
  p.push(34, 26);
  // 玻璃
  fillPts(ctx, p, 'rgba(220,235,235,0.55)');
  // 药水
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  const lq: Pts = [];
  quad(lq, 2, 66, 27, 60, 52, 66, 8);
  lq.push(52, 104, 2, 104);
  fillPts(ctx, lq, rad(ctx, 22, 76, 34, '#ff8a70', '#c2402c', '#7a1e14'));
  ctx.restore();
  // 标签
  const lab = rectPts(14, 72, 26, 16, 2);
  fillPts(ctx, lab, '#f0e3c2');
  outline(pen, lab, 1.2);
  const hx = 27;
  const hy = 80;
  ctx.fillStyle = '#c2402c';
  ctx.beginPath();
  ctx.moveTo(hx, hy + 4);
  ctx.bezierCurveTo(hx - 7, hy - 1, hx - 3, hy - 6, hx, hy - 2.5);
  ctx.bezierCurveTo(hx + 3, hy - 6, hx + 7, hy - 1, hx, hy + 4);
  ctx.fill();
  shine(pen, [10, 66, 9, 80, 13, 90], 2.4, 0.85);
  outline(pen, p, 2.2);
  // 软木塞
  const cork = rectPts(17, 10, 20, 17, 3);
  fillPts(ctx, cork, lin(ctx, 17, 10, 37, 27, '#d7a868', '#a8743c'));
  ctx.fillStyle = 'rgba(90,50,20,0.5)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(20 + hashf(i, 3) * 14, 13 + hashf(i, 4) * 11, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  outline(pen, cork, 1.8);
};

const moonstone: Draw = (pen) => {
  const ctx = pen.ctx;
  // 柔光
  const g = ctx.createRadialGradient(27, 27, 2, 27, 27, 25);
  g.addColorStop(0, 'rgba(200,235,255,0.55)');
  g.addColorStop(1, 'rgba(200,235,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 54, 54);
  const p: Pts = [];
  bez(p, 34, 7, 12, 8, 6, 36, 22, 46, 10);
  bez(p, 22, 46, 34, 52, 46, 44, 48, 36, 8, true);
  bez(p, 48, 36, 36, 42, 22, 36, 24, 22, 8, true);
  bez(p, 24, 22, 25, 14, 30, 10, 34, 7, 6, true);
  fillPts(ctx, p, rad(ctx, 22, 24, 26, '#f2fbff', '#a9d4ec', '#5e93b8'));
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.9 * pen.k;
  ctx.beginPath();
  ctx.moveTo(14, 20);
  ctx.lineTo(24, 30);
  ctx.lineTo(18, 40);
  ctx.moveTo(24, 30);
  ctx.lineTo(36, 44);
  ctx.stroke();
  ctx.restore();
  shine(pen, [17, 18, 24, 12], 2, 0.9);
  outline(pen, p, 2);
  spark(pen, 42, 14, 4, '#e8f6ff');
};

const hammer: Draw = (pen) => {
  const ctx = pen.ctx;
  const h = rectPts(75, 40, 12, 64, 4);
  paint(pen, h, woodGrad(ctx, 75, 0, 87, 0, '#8a5a30'), '#5a3720', { hatch: 0, outline: 0 });
  woodLines(pen, h, 81, 40, 81, 104, 2);
  outline(pen, h, 2);
  grip(pen, 81, 76, 81, 102, 13, '#4a2a18', '#b08850');
  const head = rectPts(10, 10, 142, 34, 6);
  paint(pen, head, steel(ctx, 0, 10, 0, 44), '#4f5a60', { hatch: 5, outline: 0 });
  for (const x of [52, 110]) {
    const band = rectPts(x - 4, 8, 8, 38, 2);
    fillPts(ctx, band, lin(ctx, x - 4, 8, x + 4, 46, '#6a7175', '#3e4447'));
    outline(pen, band, 1.4);
  }
  shine(pen, [16, 16, 140, 16], 2.4, 0.7);
  outline(pen, head, 2.4);
  const cap = rectPts(4, 6, 10, 42, 3);
  fillPts(ctx, cap, lin(ctx, 4, 6, 14, 48, '#d0d5d7', '#7d868b'));
  outline(pen, cap, 1.8);
  const cap2 = rectPts(148, 6, 10, 42, 3);
  fillPts(ctx, cap2, lin(ctx, 148, 6, 158, 48, '#d0d5d7', '#7d868b'));
  outline(pen, cap2, 1.8);
};

const bow: Draw = (pen) => {
  const ctx = pen.ctx;
  // 弓弦
  line(pen, [36, 14, 36, 202], 1.2, '#efe6cf');
  line(pen, [36.6, 14, 36.6, 202], 0.6, '#5d4837', 0.6);
  // 弓身
  const p: Pts = [];
  bez(p, 34, 8, 8, 60, 8, 156, 34, 208, 16);
  bez(p, 34, 208, 26, 190, 26, 196, 24, 198, 2, true);
  bez(p, 24, 198, 0, 150, 0, 66, 24, 18, 16, true);
  p.push(26, 14);
  paint(pen, p, woodGrad(ctx, 0, 0, 40, 0, '#a6743e'), '#5a3720', { hatch: 0, outline: 2.3 });
  // 握把
  grip(pen, 13, 92, 13, 124, 11, '#5a3420', '#caa772');
  // 弓梢
  for (const y of [10, 206]) {
    ctx.fillStyle = '#e6dcc4';
    ctx.beginPath();
    ctx.arc(34, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    outline(pen, ellipsePts(34, y, 3.2, 3.2, 8), 1.2);
  }
  shine(pen, [16, 40, 10, 80], 2, 0.5);
};

const horn: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 8, 30, 30, 26, 52, 30, 76, 14, 10);
  p.push(84, 6);
  bez(p, 84, 6, 96, 12, 102, 30, 98, 46, 8, true);
  p.push(88, 44);
  bez(p, 88, 44, 66, 40, 34, 40, 8, 36, 10, true);
  paint(pen, p, lin(ctx, 8, 30, 100, 30, '#efe2c2', '#cdb58a', '#9b7e52'), '#6a5230', { hatch: 4.5, outline: 0 });
  // 黄铜箍
  for (const [x, y0, y1] of [[40, 29, 41], [66, 22, 43]] as [number, number, number][]) {
    const band = rectPts(x - 3, y0 - 2, 6, y1 - y0 + 4, 2);
    fillPts(ctx, band, lin(ctx, x - 3, y0, x + 3, y1, '#f6dc8e', '#c8963e', '#7d5620'));
    outline(pen, band, 1.3);
  }
  // 号口
  const mouth = ellipsePts(94, 26, 6, 19, 18, 0.12);
  fillPts(ctx, mouth, '#5a3f22');
  outline(pen, mouth, 1.6);
  outline(pen, p, 2.2);
  // 小墨箭头（指向号声方向）
  line(pen, [70, 50, 86, 50], 1.6);
  line(pen, [82, 46.5, 87, 50, 82, 53.5], 1.6);
};

const cauldron: Draw = (pen) => {
  const ctx = pen.ctx;
  // 腿
  for (const [x0, x1] of [[26, 18], [54, 54], [82, 90]] as [number, number][]) {
    const leg: Pts = [x0 - 4, 84, x0 + 4, 84, x1 + 3, 102, x1 - 3, 102];
    fillPts(ctx, leg, '#2a2a2a');
    outline(pen, leg, 1.4);
  }
  const p: Pts = [];
  p.push(12, 36);
  bez(p, 12, 36, 6, 78, 30, 92, 54, 92, 10, true);
  bez(p, 54, 92, 78, 92, 102, 78, 96, 36, 10, true);
  paint(pen, p, rad(ctx, 40, 50, 60, '#6b6d70', '#36383a', '#161718'), '#000000', { hatch: 5, outline: 0 });
  // 液面
  const lq = ellipsePts(54, 36, 42, 11, 30);
  fillPts(ctx, lq, rad(ctx, 46, 32, 40, '#c9f08a', '#6fa83a', '#3d6a1e'));
  bubbles(pen, [[40, 32, 5], [60, 36, 4], [70, 30, 3]], '#9fd45a');
  // 口沿
  const rim = ellipsePts(54, 36, 45, 12, 30);
  ctx.save();
  pathPts(ctx, rim, true);
  ctx.strokeStyle = '#4a4c4f';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
  outline(pen, rim, 1.8);
  shine(pen, [20, 52, 24, 70], 2.4, 0.45);
  outline(pen, p, 2.3);
  // 蒸汽
  ctx.save();
  ctx.globalAlpha = 0.5;
  line(pen, [44, 18, 40, 10, 46, 4], 1.6, '#cfe7b0', 0.7);
  line(pen, [66, 18, 70, 10, 64, 4], 1.6, '#cfe7b0', 0.7);
  ctx.restore();
};

const phoenix: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 27, 156, 10, 120, 4, 50, 26, 6, 18);
  bez(p, 26, 6, 50, 46, 46, 118, 29, 156, 18, true);
  const g = lin(ctx, 0, 156, 0, 6, '#c2402c', '#e8742e', '#f6c64e', '#fff0b0');
  paint(pen, p, g, '#8a2a14', { hatch: 0, outline: 0, edgeW: 2.5 });
  // 羽枝
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,30,10,0.5)';
  ctx.lineWidth = 0.9 * pen.k;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const y = 20 + i * 7.5;
    ctx.moveTo(27, y + 6);
    ctx.lineTo(5, y - 4);
    ctx.moveTo(27, y + 6);
    ctx.lineTo(49, y - 4);
  }
  ctx.stroke();
  ctx.restore();
  line(pen, [27, 160, 27, 112, 26, 40, 26, 12], 1.6, '#7a2810');
  outline(pen, p, 2.1);
  spark(pen, 44, 28, 4, '#ffd36b');
  spark(pen, 9, 70, 3.2, '#ffb04a');
  spark(pen, 46, 96, 3, '#ffd36b');
};

const thunder: Draw = (pen) => {
  const ctx = pen.ctx;
  const path = [18, 150, 30, 102, 76, 72, 82, 30];
  // 杖身
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  pathPts(ctx, path, false);
  ctx.strokeStyle = '#3a2213';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = '#8a5a30';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,170,0.4)';
  ctx.lineWidth = 2;
  ctx.translate(-1.5, -1);
  ctx.stroke();
  ctx.restore();
  line(pen, path, 1.4, '#2b1d14', 0.5);
  // 杖头托
  const cup: Pts = [70, 32, 94, 32, 88, 44, 76, 44];
  fillPts(ctx, cup, lin(ctx, 70, 32, 94, 44, '#f6dc8e', '#c8963e', '#7d5620'));
  outline(pen, cup, 1.6);
  // 闪电
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  line(pen, [60, 18, 54, 26, 60, 28, 52, 38], 1.8, '#9fd0ff', 0.9);
  line(pen, [100, 16, 96, 26, 102, 28, 96, 40], 1.8, '#9fd0ff', 0.9);
  ctx.restore();
  gem(pen, 82, 22, 12, '#3a78d0', 6);
};

const hourglass: Draw = (pen) => {
  const ctx = pen.ctx;
  // 玻璃
  const gl: Pts = [];
  bez(gl, 14, 16, 14, 40, 24, 46, 24, 54, 8);
  bez(gl, 24, 54, 24, 62, 14, 68, 14, 92, 8, true);
  gl.push(40, 92);
  bez(gl, 40, 92, 40, 68, 30, 62, 30, 54, 8, true);
  bez(gl, 30, 54, 30, 46, 40, 40, 40, 16, 8, true);
  fillPts(ctx, gl, 'rgba(225,240,240,0.55)');
  // 沙
  ctx.save();
  pathPts(ctx, gl, true);
  ctx.clip();
  const sandTop: Pts = [16, 34, 38, 34, 27, 50];
  fillPts(ctx, sandTop, '#e8c46a');
  const sandBot: Pts = [];
  quad(sandBot, 14, 92, 27, 70, 40, 92, 8);
  fillPts(ctx, sandBot, '#e0b552');
  ctx.fillStyle = '#e8c46a';
  ctx.fillRect(26.2, 50, 1.6, 26);
  ctx.restore();
  shine(pen, [18, 22, 18, 36], 2, 0.8);
  outline(pen, gl, 1.8);
  // 黄铜框
  for (const y of [8, 92]) {
    const plate = rectPts(6, y, 42, 8, 3);
    fillPts(ctx, plate, lin(ctx, 6, y, 48, y + 8, '#f6dc8e', '#c8963e', '#7d5620'));
    outline(pen, plate, 1.6);
  }
  for (const x of [9, 45]) {
    const post = rectPts(x - 2, 14, 4, 80, 1.5);
    fillPts(ctx, post, lin(ctx, x - 2, 0, x + 2, 0, '#f1cf7a', '#9a6a1f'));
    outline(pen, post, 1.2);
  }
};

const slime: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 8, 44, 4, 24, 18, 10, 28, 12, 10);
  bez(p, 28, 12, 42, 10, 52, 26, 46, 44, 10, true);
  quad(p, 46, 44, 27, 50, 8, 44, 8, true);
  fillPts(ctx, p, rad(ctx, 22, 22, 32, 'rgba(210,250,170,0.95)', 'rgba(120,190,70,0.9)', 'rgba(60,120,40,0.95)'));
  bubbles(pen, [[20, 30, 3], [32, 36, 2.2], [36, 24, 1.8]], '#d8f8b0');
  shine(pen, [14, 26, 18, 18, 24, 16], 2.4, 0.9);
  outline(pen, p, 2.1);
};

const ratfang: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 14, 12, 26, 8, 40, 10, 42, 16, 8);
  bez(p, 42, 16, 40, 30, 34, 42, 22, 48, 8, true);
  bez(p, 22, 48, 26, 36, 24, 22, 14, 12, 8, true);
  paint(pen, p, lin(ctx, 14, 10, 40, 48, '#fff5d0', '#e2cf8e', '#b39a52'), '#7a6630', { hatch: 4 });
  shine(pen, [20, 14, 30, 13], 1.8, 0.8);
};

const breath: Draw = (pen) => {
  const ctx = pen.ctx;
  // 火焰
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    const x0 = 54 + Math.cos(a) * 22;
    const y0 = 58 + Math.sin(a) * 22;
    const f: Pts = [];
    quad(f, x0 - 10, y0 + 6, x0 + Math.cos(a) * 30 - 6, y0 + Math.sin(a) * 30, x0 + Math.cos(a) * 34, y0 + Math.sin(a) * 36, 6);
    quad(f, x0 + Math.cos(a) * 34, y0 + Math.sin(a) * 36, x0 + Math.cos(a) * 18 + 8, y0 + Math.sin(a) * 18, x0 + 10, y0 + 6, 6, true);
    fillPts(ctx, f, lin(ctx, x0, y0, x0 + Math.cos(a) * 34, y0 + Math.sin(a) * 34, '#ffd36b', '#f08a2e', 'rgba(200,60,30,0.8)'));
  }
  const p: Pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 30 + hashf(i, 41) * 8;
    p.push(54 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.85);
  }
  paint(pen, p, rad(ctx, 46, 52, 40, '#6a3a2a', '#3a1e16', '#1a0c08'), '#000000', { hatch: 5, outline: 0 });
  // 熔岩裂纹
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  line(pen, [36, 50, 48, 62, 44, 76], 2.4, '#ff9a3a', 0.95);
  line(pen, [48, 62, 66, 58, 74, 70], 2.4, '#ffb04a', 0.95);
  line(pen, [60, 44, 66, 58], 2, '#ff8a2e', 0.9);
  ctx.restore();
  outline(pen, p, 2.4);
};

const claw: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 12, 46, 14, 26, 26, 10, 44, 8, 10);
  bez(p, 44, 8, 34, 14, 26, 28, 28, 46, 10, true);
  p.push(20, 50);
  paint(pen, p, lin(ctx, 12, 8, 44, 50, '#5a5450', '#2a2624', '#0e0c0a'), '#000000', { hatch: 0 });
  shine(pen, [18, 36, 24, 22, 34, 13], 1.8, 0.6);
};

const scale: Draw = (pen) => {
  const ctx = pen.ctx;
  const rows: [number, number, number][] = [
    [27, 14, 12],
    [16, 28, 12],
    [38, 28, 12],
    [27, 40, 12],
  ];
  for (const [x, y, r] of rows) {
    const p: Pts = [];
    p.push(x - r, y - 4);
    quad(p, x - r, y - 4, x - r, y + r * 0.8, x, y + r, 6, true);
    quad(p, x, y + r, x + r, y + r * 0.8, x + r, y - 4, 6, true);
    quad(p, x + r, y - 4, x, y - 10, x - r, y - 4, 6, true);
    paint(pen, p, rad(ctx, x - 3, y - 2, r * 1.3, '#f0a070', '#b8582e', '#6a2a14'), '#4a1a0a', { hatch: 0, outline: 1.8 });
    shine(pen, [x - r * 0.5, y, x - r * 0.1, y + r * 0.5], 1.6, 0.6);
  }
};

export const ICONS: Record<ItemId, Draw> = {
  dagger, sword, buckler, leather, herb, whetstone, glove, pouch,
  boomerang, axe, kris, helmet, potion, moonstone,
  hammer, bow, horn, cauldron,
  phoenix, thunder, hourglass,
  slime, ratfang, breath, claw, scale,
};
