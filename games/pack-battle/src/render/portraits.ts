// 10 个纸板立牌 + 玩家徽记（冒险者帽）+ 头像徽章。全部启动后按需生成为精灵。
import type { PortraitId } from '../game/types.ts';
import { blade, gem, grip, guard, leaf, lin, line, outline, paint, rad, shine, steel, type Pen } from './icons/primitives.ts';
import { bez, ellipsePts, fillPts, inkStroke, quad, rectPts, xform, type Pts } from './ink.ts';
import { C, cached } from './kit.ts';
import { hashf } from './noise.ts';
import { pxRatio, stage } from './stage.ts';
import { makeCanvas, type Sprite } from './text.ts';

/** 角色绘制框（逻辑单位） */
export const PW = 120;
export const PH = 190;
const PADP = 12;
const BASE_H = 16;

type Draw = (pen: Pen) => void;

interface PDef {
  draw: Draw;
  /** 徽章裁剪：头部中心与半径 */
  head: [number, number, number];
  /** 立牌整体缩放（首领更大） */
  scale: number;
}

const blob = (cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): Pts => ellipsePts(cx, cy, rx, ry, n, rot);

function eyes(pen: Pen, x1: number, x2: number, y: number, rx: number, ry: number, white = true, pupil = '#1d140e'): void {
  const ctx = pen.ctx;
  for (const x of [x1, x2]) {
    if (white) {
      fillPts(ctx, blob(x, y, rx, ry, 18), '#fbf6e8');
      outline(pen, blob(x, y, rx, ry, 18), 1.4);
      fillPts(ctx, blob(x + rx * 0.15, y + ry * 0.1, rx * 0.5, ry * 0.55, 14), pupil);
      fillPts(ctx, blob(x - rx * 0.05, y - ry * 0.2, rx * 0.18, ry * 0.18, 8), '#ffffff');
    } else {
      fillPts(ctx, blob(x, y, rx, ry, 16), pupil);
      fillPts(ctx, blob(x - rx * 0.3, y - ry * 0.35, rx * 0.32, ry * 0.3, 8), 'rgba(255,255,255,0.9)');
    }
  }
}

// ---------- 1 史莱姆 ----------
const slime: Draw = (pen) => {
  const ctx = pen.ctx;
  const p: Pts = [];
  bez(p, 8, 182, 2, 132, 30, 84, 60, 84, 14);
  bez(p, 60, 84, 92, 84, 120, 132, 112, 182, 14, true);
  bez(p, 112, 182, 92, 190, 28, 190, 8, 182, 10, true);
  const g = rad(ctx, 46, 112, 90, '#d4f08f', '#86b84a', '#4d7a26');
  ctx.save();
  ctx.globalAlpha = 0.95;
  paint(pen, p, g, '#3f6a1e', { hatch: 6, outline: 0, edgeW: 4 });
  ctx.restore();
  // 内部气泡
  for (const [x, y, r] of [[82, 150, 6], [36, 166, 4], [90, 124, 3], [70, 172, 3]] as const) {
    ctx.strokeStyle = 'rgba(240,255,210,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  outline(pen, p, 2.6);
  shine(pen, bez([], 26, 132, 28, 112, 40, 100, 52, 96, 8), 5, 0.75);
  fillPts(ctx, blob(66, 100, 4, 3, 10), 'rgba(255,255,255,0.8)');
  eyes(pen, 48, 76, 136, 6.5, 9.5, false);
  // 嘴 + 腮红
  line(pen, quad([], 56, 152, 62, 158, 68, 152, 8), 1.8);
  fillPts(ctx, blob(36, 150, 7, 4, 12), 'rgba(240,120,110,0.35)');
  fillPts(ctx, blob(88, 150, 7, 4, 12), 'rgba(240,120,110,0.35)');
};

// ---------- 2 地精盗贼 ----------
const goblin: Draw = (pen) => {
  const ctx = pen.ctx;
  // 斗篷身体
  const body: Pts = [34, 118, 86, 118, 102, 184, 18, 184];
  paint(pen, body, lin(ctx, 0, 118, 0, 184, '#8a5a34', '#5e3a20'), '#3c2412', { hatch: 5 });
  // 腰带 + 钱袋
  fillPts(ctx, rectPts(24, 150, 72, 7), '#3b2414');
  const pouch: Pts = [];
  bez(pouch, 76, 154, 66, 162, 68, 180, 82, 180, 8);
  bez(pouch, 82, 180, 96, 180, 98, 162, 88, 154, 8, true);
  paint(pen, pouch, '#b08a52', '#6b4e28', { hatch: 0, outline: 1.8 });
  fillPts(ctx, blob(82, 168, 4.5, 4.5, 12), C.gold);
  outline(pen, blob(82, 168, 4.5, 4.5, 12), 1.1);
  // 手
  for (const x of [28, 92]) {
    paint(pen, blob(x, 146, 8, 7, 14), '#94ad7c', '#5b7046', { hatch: 0, outline: 1.6 });
  }
  // 耳朵
  const earL: Pts = [38, 84, 2, 62, 36, 104];
  const earR: Pts = [82, 84, 118, 62, 84, 104];
  for (const e of [earL, earR]) paint(pen, e, '#94ad7c', '#5b7046', { hatch: 0, outline: 2 });
  fillPts(ctx, [34, 88, 12, 70, 34, 99], 'rgba(220,130,120,0.45)');
  fillPts(ctx, [86, 88, 108, 70, 86, 99], 'rgba(220,130,120,0.45)');
  // 头
  const head = blob(60, 92, 27, 25, 30);
  paint(pen, head, rad(ctx, 52, 82, 34, '#b5c99a', '#8fa77a', '#6c8458'), '#55693f', { hatch: 5 });
  // 兜帽
  const hood: Pts = [];
  bez(hood, 28, 100, 22, 66, 44, 50, 66, 52, 10);
  bez(hood, 66, 52, 90, 54, 100, 76, 92, 100, 10, true);
  bez(hood, 92, 100, 88, 78, 76, 66, 60, 66, 8, true);
  bez(hood, 60, 66, 44, 66, 32, 80, 28, 100, 8, true);
  paint(pen, hood, lin(ctx, 0, 50, 0, 100, '#7b4a28', '#5a341a'), '#3a200e', { hatch: 5 });
  eyes(pen, 49, 71, 90, 6, 6.5, true, '#2a1a10');
  // 龅牙笑
  const m: Pts = [];
  quad(m, 46, 104, 60, 116, 74, 104, 10);
  ctx.fillStyle = '#4a2418';
  ctx.beginPath();
  ctx.moveTo(m[0], m[1]);
  for (let i = 2; i < m.length; i += 2) ctx.lineTo(m[i], m[i + 1]);
  ctx.closePath();
  ctx.fill();
  fillPts(ctx, rectPts(55, 104, 4.5, 6), '#fbf6e8');
  fillPts(ctx, rectPts(60.5, 104, 4.5, 6), '#fbf6e8');
  outline(pen, m, 1.6);
  // 鼻
  line(pen, quad([], 58, 96, 62, 100, 58, 101, 6), 1.5);
};

// ---------- 3 毒蛛 ----------
const spider: Draw = (pen) => {
  const ctx = pen.ctx;
  // 腿（先画，在身体下）
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 4; i++) {
      const sx = 60 + s * 16;
      const sy = 104 + i * 9;
      const kx = 60 + s * (44 + i * 6);
      const ky = 76 + i * 18;
      const fx = 60 + s * (50 + i * 3 - (i === 3 ? 10 : 0));
      const fy = 184 - (i === 0 ? 30 : 0);
      const leg: Pts = [];
      quad(leg, sx, sy, kx - s * 6, ky - 14, kx, ky, 8);
      quad(leg, kx, ky, kx + s * 6, (ky + fy) / 2, fx, fy, 8, true);
      inkStroke(ctx, leg, false, 4.2, '#1e1426', pen.seed++, { unit: 1, jitter: 0.6, dry: false });
    }
  }
  // 腹部
  const ab = blob(60, 142, 40, 38, 32);
  paint(pen, ab, rad(ctx, 48, 126, 46, '#7a5a92', '#4a2f60', '#24162f'), '#150c1c', { hatch: 5 });
  // 花纹
  const mark: Pts = [60, 120, 70, 134, 60, 148, 50, 134];
  fillPts(ctx, mark, 'rgba(195,160,216,0.55)');
  fillPts(ctx, [60, 152, 68, 162, 60, 172, 52, 162], 'rgba(195,160,216,0.45)');
  shine(pen, bez([], 32, 132, 34, 118, 44, 110, 54, 108, 8), 3.5, 0.45);
  // 头胸
  const hd = blob(60, 100, 23, 19, 26);
  paint(pen, hd, rad(ctx, 54, 94, 24, '#5d4472', '#33224a', '#1b1027'), '#120a1a', { hatch: 0 });
  // 六只红眼
  for (const [x, y, r] of [[52, 96, 3.6], [68, 96, 3.6], [45, 102, 2.6], [75, 102, 2.6], [56, 90, 2.4], [64, 90, 2.4]] as const) {
    fillPts(ctx, blob(x, y, r, r, 10), '#e0402c');
    fillPts(ctx, blob(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.35, 6), '#ffd0c0');
  }
  // 獠牙
  for (const s of [-1, 1]) {
    const f: Pts = [60 + s * 4, 112, 60 + s * 9, 112, 60 + s * 5, 124];
    paint(pen, f, '#e8dcc0', '#8a7a60', { hatch: 0, outline: 1.4 });
  }
};

// ---------- 4 骷髅卫兵 ----------
const skeleton: Draw = (pen) => {
  const ctx = pen.ctx;
  const bone = '#efe6cf';
  const boneEdge = '#9c8f70';
  // 腿骨
  for (const x of [48, 72]) {
    paint(pen, rectPts(x - 4, 146, 8, 40, 3), bone, boneEdge, { hatch: 0, outline: 1.6 });
    paint(pen, blob(x, 184, 9, 4, 12), bone, boneEdge, { hatch: 0, outline: 1.4 });
  }
  // 骨盆
  paint(pen, [40, 138, 80, 138, 76, 152, 44, 152], bone, boneEdge, { hatch: 0, outline: 1.6 });
  // 脊柱 + 肋骨
  for (let i = 0; i < 6; i++) paint(pen, rectPts(56, 92 + i * 8, 8, 6, 2), bone, boneEdge, { hatch: 0, outline: 1.2 });
  for (let i = 0; i < 4; i++) {
    const y = 98 + i * 10;
    const w = 26 - i * 3;
    const rib: Pts = [];
    quad(rib, 60 - w, y + 6, 60 - w * 0.5, y - 4, 60, y, 8);
    quad(rib, 60, y, 60 + w * 0.5, y - 4, 60 + w, y + 6, 8, true);
    inkStroke(ctx, rib, false, 4.6, boneEdge, pen.seed++, { unit: 1, jitter: 0.3, dry: false });
    inkStroke(ctx, rib, false, 3, bone, pen.seed++, { unit: 1, jitter: 0.3, dry: false });
  }
  // 右臂（举剑侧）
  inkStroke(ctx, [84, 92, 98, 116, 96, 136], false, 5, boneEdge, 3, { unit: 1, jitter: 0.3, dry: false });
  inkStroke(ctx, [84, 92, 98, 116, 96, 136], false, 3.4, bone, 4, { unit: 1, jitter: 0.3, dry: false });
  // 头骨
  const skull: Pts = [];
  bez(skull, 38, 66, 34, 34, 86, 34, 82, 66, 14);
  bez(skull, 82, 66, 80, 78, 74, 80, 72, 84, 6, true);
  bez(skull, 72, 84, 64, 86, 56, 86, 48, 84, 6, true);
  bez(skull, 48, 84, 46, 80, 40, 78, 38, 66, 6, true);
  paint(pen, skull, rad(ctx, 52, 50, 40, '#fffaf0', bone, '#cfc3a4'), boneEdge, { hatch: 5 });
  fillPts(ctx, blob(50, 64, 7.5, 8.5, 14), '#2a1d16');
  fillPts(ctx, blob(70, 64, 7.5, 8.5, 14), '#2a1d16');
  fillPts(ctx, blob(52, 63, 2, 2, 8), '#f3c46b');
  fillPts(ctx, blob(72, 63, 2, 2, 8), '#f3c46b');
  fillPts(ctx, [60, 70, 56, 77, 64, 77], '#2a1d16');
  // 下颌
  const jaw: Pts = [];
  bez(jaw, 46, 86, 48, 98, 72, 98, 74, 86, 10);
  paint(pen, jaw, bone, boneEdge, { hatch: 0, outline: 1.8 });
  ctx.strokeStyle = '#2a1d16';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(51 + i * 4.5, 85);
    ctx.lineTo(51 + i * 4.5, 90);
    ctx.stroke();
  }
  // 圆盾（左手）
  const sh = blob(34, 124, 27, 27, 32);
  paint(pen, sh, rad(ctx, 26, 114, 30, '#b07a45', '#8b5a32', '#5b3519'), '#3a2213', { hatch: 5, outline: 0 });
  ctx.strokeStyle = '#7d868b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(34, 124, 24, 0, Math.PI * 2);
  ctx.stroke();
  outline(pen, sh, 2.2);
  paint(pen, blob(34, 124, 7, 7, 14), steel(ctx, 28, 118, 40, 130), '#4a5056', { hatch: 0, outline: 1.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    fillPts(ctx, blob(34 + Math.cos(a) * 24, 124 + Math.sin(a) * 24, 1.6, 1.6, 6), '#e8ecef');
  }
};

// ---------- 5 食人魔（首领） ----------
const ogre: Draw = (pen) => {
  const ctx = pen.ctx;
  const skin = rad(ctx, 50, 90, 80, '#a9b98a', '#8a9a6a', '#5f6e45');
  // 木棒（背后）
  const club: Pts = [];
  bez(club, 92, 120, 96, 80, 98, 40, 104, 8, 10);
  bez(club, 104, 8, 116, 4, 122, 14, 118, 30, 6, true);
  bez(club, 118, 30, 112, 70, 106, 100, 102, 124, 8, true);
  paint(pen, club, lin(ctx, 92, 0, 122, 0, '#9a6a3c', '#6b4424'), '#3a2213', { hatch: 5 });
  for (const [x, y] of [[110, 20], [106, 46], [112, 34]] as const) fillPts(ctx, blob(x, y, 2.4, 1.6, 8), '#3a2213');
  // 腿
  for (const x of [42, 78]) paint(pen, rectPts(x - 12, 150, 24, 36, 6), skin, '#4c5a36', { hatch: 5 });
  // 躯干
  const torso: Pts = [];
  bez(torso, 6, 92, 8, 70, 30, 62, 60, 62, 8);
  bez(torso, 60, 62, 90, 62, 112, 70, 114, 92, 8, true);
  bez(torso, 114, 92, 116, 120, 104, 150, 92, 158, 8, true);
  bez(torso, 92, 158, 70, 166, 50, 166, 28, 158, 8, true);
  bez(torso, 28, 158, 16, 150, 4, 120, 6, 92, 8, true);
  paint(pen, torso, skin, '#4c5a36', { hatch: 5 });
  // 肚子
  const belly = blob(60, 124, 30, 26, 26);
  fillPts(ctx, belly, 'rgba(210,220,170,0.35)');
  line(pen, quad([], 40, 136, 60, 150, 80, 136, 8), 1.4, '#4c5a36', 0.6);
  // 兽皮腰布
  const cloth: Pts = [24, 146, 96, 146, 92, 170, 82, 162, 72, 172, 60, 162, 48, 172, 38, 162, 28, 170];
  paint(pen, cloth, '#8b6a44', '#4e3820', { hatch: 4 });
  // 右臂扶棒
  paint(pen, blob(100, 112, 13, 16, 18), skin, '#4c5a36', { hatch: 0, outline: 2 });
  paint(pen, blob(18, 118, 12, 18, 18), skin, '#4c5a36', { hatch: 4, outline: 2 });
  // 头（小）
  const head = blob(60, 50, 22, 21, 26);
  paint(pen, head, skin, '#4c5a36', { hatch: 5 });
  // 眉 + 眼
  inkStroke(ctx, [42, 40, 58, 46], false, 3.4, C.ink, 7, { unit: 1, jitter: 0.3, dry: false });
  inkStroke(ctx, [62, 46, 78, 40], false, 3.4, C.ink, 8, { unit: 1, jitter: 0.3, dry: false });
  eyes(pen, 51, 69, 49, 3.6, 3.6, false, '#2a1a10');
  // 嘴 + 独牙
  line(pen, quad([], 48, 62, 60, 58, 72, 62, 8), 2);
  paint(pen, [64, 61, 70, 60, 68, 48], '#fbf6e8', '#8a7a60', { hatch: 0, outline: 1.6 });
  // 鼻
  paint(pen, blob(60, 54, 5, 3.6, 10), '#7d8c5c', '#4c5a36', { hatch: 0, outline: 1.3 });
  // 耳
  for (const s of [-1, 1]) paint(pen, blob(60 + s * 23, 48, 4, 7, 10), skin, '#4c5a36', { hatch: 0, outline: 1.4 });
};

// ---------- 6 鼠群 ----------
function rat(pen: Pen, cx: number, cy: number, s: number, flip: number): void {
  const ctx = pen.ctx;
  const fur = rad(ctx, cx - 8 * s, cy - 6 * s, 30 * s, '#b5b1ab', '#8d8a86', '#5f5c58');
  // 尾巴
  const tail: Pts = [];
  bez(tail, cx - flip * 20 * s, cy + 8 * s, cx - flip * 40 * s, cy + 10 * s, cx - flip * 44 * s, cy - 14 * s, cx - flip * 30 * s, cy - 16 * s, 12);
  inkStroke(ctx, tail, false, 3.2 * s, '#d98c8c', pen.seed++, { unit: 1, jitter: 0.3, dry: false, taper: true });
  const body = blob(cx, cy, 24 * s, 16 * s, 24);
  paint(pen, body, fur, '#45423f', { hatch: 4 });
  // 头
  const hx = cx + flip * 20 * s;
  const head: Pts = [hx - flip * 12 * s, cy - 12 * s, hx + flip * 16 * s, cy - 2 * s, hx - flip * 10 * s, cy + 8 * s];
  paint(pen, head, fur, '#45423f', { hatch: 0, outline: 1.8 });
  fillPts(ctx, blob(hx + flip * 16 * s, cy - 2 * s, 2.6 * s, 2.4 * s, 8), '#e08a8a');
  // 耳朵
  paint(pen, blob(hx - flip * 8 * s, cy - 14 * s, 6 * s, 6 * s, 14), '#e8a8a8', '#8a5050', { hatch: 0, outline: 1.4 });
  fillPts(ctx, blob(hx + flip * 3 * s, cy - 4 * s, 2 * s, 2.2 * s, 8), '#1d140e');
  ctx.strokeStyle = 'rgba(43,29,20,0.6)';
  ctx.lineWidth = 0.8;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + flip * 12 * s, cy);
    ctx.lineTo(hx + flip * 22 * s, cy + i * 4 * s + 1);
    ctx.stroke();
  }
}
const rats: Draw = (pen) => {
  rat(pen, 62, 164, 1.25, 1);
  rat(pen, 56, 122, 1.1, -1);
  rat(pen, 62, 86, 0.95, 1);
};

// ---------- 7 沼泽女巫 ----------
const witch: Draw = (pen) => {
  const ctx = pen.ctx;
  // 驼背斗篷
  const cloak: Pts = [];
  bez(cloak, 30, 96, 20, 110, 12, 150, 10, 186, 8);
  bez(cloak, 10, 186, 50, 188, 90, 188, 106, 186, 8, true);
  bez(cloak, 106, 186, 104, 140, 96, 100, 74, 88, 10, true);
  bez(cloak, 74, 88, 56, 82, 40, 86, 30, 96, 6, true);
  paint(pen, cloak, lin(ctx, 0, 88, 0, 186, '#5a4466', '#352840'), '#1e1426', { hatch: 5 });
  // 绿光药瓶 + 手
  const glow = ctx.createRadialGradient(28, 146, 0, 28, 146, 30);
  glow.addColorStop(0, 'rgba(170,240,120,0.55)');
  glow.addColorStop(1, 'rgba(170,240,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-2, 116, 60, 60);
  paint(pen, blob(28, 150, 9, 10, 16), rad(ctx, 25, 146, 10, '#e6ffb0', '#8fd04f', '#4f8a24'), '#2f5a14', { hatch: 0, outline: 1.6 });
  paint(pen, rectPts(25, 136, 6, 6, 1), '#9a6a3c', '#4a2d18', { hatch: 0, outline: 1.2 });
  paint(pen, blob(40, 140, 7, 6, 12), '#a9c48a', '#5b7046', { hatch: 0, outline: 1.5 });
  // 脸（被绿光照亮）
  const face: Pts = [];
  bez(face, 44, 74, 40, 92, 48, 106, 60, 108, 8);
  bez(face, 60, 108, 72, 106, 78, 92, 74, 74, 8, true);
  paint(pen, face, rad(ctx, 52, 96, 30, '#cfe6a8', '#a9c48a', '#7c955e'), '#55693f', { hatch: 4 });
  // 长鹰钩鼻
  const nose: Pts = [];
  bez(nose, 56, 84, 46, 92, 34, 100, 36, 104, 6);
  bez(nose, 36, 104, 44, 104, 52, 98, 58, 94, 6, true);
  paint(pen, nose, '#a9c48a', '#55693f', { hatch: 0, outline: 1.6 });
  fillPts(ctx, blob(50, 104, 2.2, 2.2, 8), '#6b7a4a');
  eyes(pen, 56, 68, 84, 2.8, 2.6, false, '#f2cd3f');
  line(pen, quad([], 54, 100, 60, 98, 66, 101, 6), 1.4);
  // 尖帽 + 青苔
  const brim = blob(58, 74, 42, 9, 30, -0.05);
  const hat: Pts = [];
  bez(hat, 36, 74, 40, 50, 50, 30, 64, 18, 10);
  bez(hat, 64, 18, 72, 10, 86, 6, 92, 14, 6, true);
  bez(hat, 92, 14, 82, 16, 76, 26, 76, 40, 6, true);
  bez(hat, 76, 40, 76, 54, 78, 64, 80, 74, 6, true);
  paint(pen, hat, lin(ctx, 40, 10, 80, 74, '#4a3a56', '#2a2032'), '#150e1c', { hatch: 5 });
  paint(pen, brim, lin(ctx, 0, 66, 0, 82, '#4a3a56', '#2a2032'), '#150e1c', { hatch: 0, outline: 2 });
  for (const [x, y, r] of [[48, 56, 6], [70, 44, 5], [30, 74, 6], [84, 76, 5], [62, 30, 4]] as const) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      fillPts(ctx, blob(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.4, r * 0.55, r * 0.45, 8), i % 2 ? '#6f9d3c' : '#87b34e');
    }
  }
  fillPts(ctx, rectPts(38, 66, 40, 4), '#7d5a8a');
};

// ---------- 8 黑骑士 ----------
const knight: Draw = (pen) => {
  const ctx = pen.ctx;
  const plate = (x0: number, y0: number, x1: number, y1: number) => lin(ctx, x0, y0, x1, y1, '#8a929a', '#4a5058', '#2a2e33');
  // 羽饰
  const plume: Pts = [];
  bez(plume, 60, 30, 70, 8, 96, 4, 110, 20, 10);
  bez(plume, 110, 20, 100, 16, 90, 20, 84, 30, 6, true);
  bez(plume, 84, 30, 78, 26, 68, 28, 64, 36, 6, true);
  paint(pen, plume, lin(ctx, 60, 4, 110, 30, '#e05a44', '#9f2a22'), '#5a140f', { hatch: 4 });
  // 腿
  for (const x of [46, 74]) paint(pen, rectPts(x - 10, 140, 20, 46, 4), plate(x - 10, 140, x + 10, 186), '#15181b', { hatch: 4 });
  // 躯干（胸甲）
  const torso: Pts = [];
  bez(torso, 26, 82, 30, 74, 90, 74, 94, 82, 6);
  bez(torso, 94, 82, 96, 110, 90, 136, 80, 146, 8, true);
  bez(torso, 80, 146, 66, 150, 54, 150, 40, 146, 6, true);
  bez(torso, 40, 146, 30, 136, 24, 110, 26, 82, 8, true);
  paint(pen, torso, plate(26, 74, 94, 146), '#15181b', { hatch: 5 });
  line(pen, [60, 84, 60, 140], 1.4, '#15181b', 0.6);
  shine(pen, bez([], 36, 92, 38, 110, 42, 124, 46, 132, 6), 3, 0.5);
  // 肩甲
  for (const s of [-1, 1]) {
    const sp = blob(60 + s * 36, 86, 18, 13, 20, s * 0.3);
    paint(pen, sp, plate(60 + s * 36 - 18, 74, 60 + s * 36 + 18, 100), '#15181b', { hatch: 4 });
  }
  // 巨剑（插地，双手扶柄）
  blade(pen, 60, 186, 60, 128, 12, { fuller: true });
  guard(pen, 60, 124, 34, 7, 0);
  grip(pen, 60, 120, 60, 106, 8, '#3a2216', '#9a8a6a');
  for (const s of [-1, 1]) paint(pen, blob(60 + s * 8, 114, 8, 7, 12), plate(52, 108, 68, 120), '#15181b', { hatch: 0, outline: 1.6 });
  // 头盔
  const helm: Pts = rectPts(40, 30, 40, 46, 12);
  paint(pen, helm, plate(40, 30, 80, 76), '#15181b', { hatch: 5 });
  // 面罩缝透光
  const slit = rectPts(44, 50, 32, 5, 2);
  fillPts(ctx, slit, '#1a1008');
  const g = ctx.createLinearGradient(44, 0, 76, 0);
  g.addColorStop(0, 'rgba(255,170,60,0)');
  g.addColorStop(0.5, 'rgba(255,200,90,0.95)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  fillPts(ctx, rectPts(46, 51, 28, 3, 1.5), g);
  line(pen, [60, 58, 60, 72], 1.3, '#15181b', 0.7);
  for (let i = 0; i < 3; i++) fillPts(ctx, blob(52 + i * 8, 66, 1.3, 1.3, 6), '#15181b');
};

// ---------- 9 暗影游侠 ----------
const ranger: Draw = (pen) => {
  const ctx = pen.ctx;
  // 背上的长弓
  const bow: Pts = [];
  bez(bow, 96, 14, 120, 60, 120, 130, 98, 182, 16);
  inkStroke(ctx, bow, false, 5.5, '#5a3a1e', pen.seed++, { unit: 1, jitter: 0.4, dry: false, taper: true });
  ctx.strokeStyle = 'rgba(240,227,194,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(96, 16);
  ctx.lineTo(98, 180);
  ctx.stroke();
  // 箭羽
  for (let i = 0; i < 3; i++) {
    const x = 22 + i * 6;
    inkStroke(ctx, [x, 60, x + 4, 100], false, 1.6, '#5a3a1e', 3 + i, { unit: 1, jitter: 0.3, dry: false });
    fillPts(ctx, [x - 3, 58, x + 3, 56, x + 1, 68], i === 1 ? '#c2402c' : '#e8dcc0');
  }
  // 斗篷
  const cloak: Pts = [];
  bez(cloak, 32, 70, 18, 100, 10, 150, 14, 186, 8);
  bez(cloak, 14, 186, 44, 190, 76, 190, 106, 186, 8, true);
  bez(cloak, 106, 186, 110, 150, 102, 100, 88, 70, 8, true);
  bez(cloak, 88, 70, 70, 62, 50, 62, 32, 70, 6, true);
  paint(pen, cloak, lin(ctx, 0, 62, 0, 186, '#4b6a44', '#253823'), '#121c10', { hatch: 5 });
  line(pen, bez([], 60, 110, 56, 140, 58, 170, 60, 186, 8), 1.4, '#121c10', 0.6);
  // 兜帽
  const hood: Pts = [];
  bez(hood, 30, 96, 22, 58, 40, 24, 62, 18, 10);
  bez(hood, 62, 18, 84, 24, 100, 58, 90, 96, 10, true);
  bez(hood, 90, 96, 80, 100, 40, 100, 30, 96, 6, true);
  paint(pen, hood, lin(ctx, 0, 18, 0, 100, '#56784e', '#2c4229'), '#121c10', { hatch: 5 });
  // 猫头鹰面具
  const mask: Pts = [];
  bez(mask, 40, 60, 40, 44, 80, 44, 80, 60, 10);
  bez(mask, 80, 60, 80, 78, 66, 92, 60, 94, 8, true);
  bez(mask, 60, 94, 54, 92, 40, 78, 40, 60, 8, true);
  paint(pen, mask, rad(ctx, 54, 60, 28, '#fbf3df', '#e3d3ad', '#bba57a'), '#7a6440', { hatch: 4 });
  for (const x of [51, 69]) {
    fillPts(ctx, blob(x, 64, 9, 9, 16), '#2b1d14');
    fillPts(ctx, blob(x, 64, 4, 4, 10), '#f3c46b');
    fillPts(ctx, blob(x - 1, 63, 1.4, 1.4, 6), '#ffffff');
  }
  paint(pen, [56, 72, 64, 72, 60, 84], '#c8963e', '#6b4a1e', { hatch: 0, outline: 1.4 });
  // 羽状眉
  inkStroke(ctx, [40, 54, 50, 50, 58, 56], false, 2.6, '#7a6440', 5, { unit: 1, jitter: 0.3, dry: false });
  inkStroke(ctx, [80, 54, 70, 50, 62, 56], false, 2.6, '#7a6440', 6, { unit: 1, jitter: 0.3, dry: false });
};

// ---------- 10 古龙（首领） ----------
const dragon: Draw = (pen) => {
  const ctx = pen.ctx;
  const memb = lin(ctx, 0, 10, 0, 130, '#a8442c', '#6a2216');
  // 双翼
  for (const s of [-1, 1]) {
    const w: Pts = [];
    const sx = 60 + s * 14;
    bez(w, sx, 96, sx + s * 20, 40, sx + s * 40, 14, sx + s * 56, 8, 10);
    bez(w, sx + s * 56, 8, sx + s * 52, 40, sx + s * 56, 70, sx + s * 50, 100, 8, true);
    quad(w, sx + s * 50, 100, sx + s * 40, 92, sx + s * 34, 112, 6, true);
    quad(w, sx + s * 34, 112, sx + s * 24, 102, sx + s * 16, 122, 6, true);
    quad(w, sx + s * 16, 122, sx + s * 8, 110, sx, 118, 6, true);
    paint(pen, w, memb, '#3a0e08', { hatch: 6 });
    for (const [ex, ey] of [[50, 100], [34, 112], [16, 122]] as const) {
      line(pen, [sx + s * 20, 40, sx + s * ex, ey], 1.6, '#3a0e08', 0.8);
    }
    line(pen, bez([], sx, 96, sx + s * 20, 40, sx + s * 40, 14, sx + s * 56, 8, 10), 3.4, '#4a160c');
  }
  // 颈 + 胸
  const neck: Pts = [];
  bez(neck, 40, 186, 36, 150, 44, 110, 50, 84, 8);
  bez(neck, 50, 84, 56, 80, 66, 80, 70, 84, 6, true);
  bez(neck, 70, 84, 76, 110, 84, 150, 80, 186, 8, true);
  paint(pen, neck, lin(ctx, 36, 0, 84, 0, '#b4583a', '#8a3a24', '#5e2214'), '#3a0e08', { hatch: 5 });
  // 腹鳞
  for (let i = 0; i < 9; i++) {
    const y = 96 + i * 10;
    const hw = 8 + i * 1.6;
    const sc: Pts = [];
    quad(sc, 60 - hw, y, 60, y + 7, 60 + hw, y, 8);
    inkStroke(ctx, sc, false, 1.6, '#e8b070', pen.seed++, { unit: 1, jitter: 0.3, dry: false });
  }
  // 头
  const head: Pts = [];
  bez(head, 36, 58, 34, 36, 48, 26, 60, 26, 8);
  bez(head, 60, 26, 72, 26, 86, 36, 84, 58, 8, true);
  bez(head, 84, 58, 82, 74, 74, 92, 66, 96, 8, true);
  bez(head, 66, 96, 62, 98, 58, 98, 54, 96, 4, true);
  bez(head, 54, 96, 46, 92, 38, 74, 36, 58, 8, true);
  paint(pen, head, rad(ctx, 52, 46, 44, '#d8784e', '#a8442c', '#6a2216'), '#3a0e08', { hatch: 5 });
  // 角
  for (const s of [-1, 1]) {
    const h: Pts = [];
    bez(h, 60 + s * 16, 32, 60 + s * 26, 18, 60 + s * 40, 10, 60 + s * 50, 2, 8);
    bez(h, 60 + s * 50, 2, 60 + s * 40, 16, 60 + s * 30, 28, 60 + s * 22, 40, 8, true);
    paint(pen, h, lin(ctx, 60, 40, 60 + s * 50, 2, '#efe6cf', '#b8a888'), '#5e5038', { hatch: 0, outline: 1.8 });
  }
  // 琥珀发光的眼
  for (const s of [-1, 1]) {
    const ex = 60 + s * 12;
    const g = ctx.createRadialGradient(ex, 52, 0, ex, 52, 12);
    g.addColorStop(0, 'rgba(255,200,90,0.8)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex - 12, 40, 24, 24);
    const eye = blob(ex, 52, 6.5, 4.2, 14, s * 0.35);
    fillPts(ctx, eye, '#ffbf3a');
    fillPts(ctx, blob(ex, 52, 1.4, 3.6, 8), '#2a0e06');
    outline(pen, eye, 1.4);
    inkStroke(ctx, [ex - s * 10, 44 - 2, ex + s * 6, 46], false, 2.6, '#3a0e08', 9 + s, { unit: 1, jitter: 0.3, dry: false });
  }
  // 鼻孔 + 嘴
  fillPts(ctx, blob(55, 82, 2.2, 1.6, 8), '#2a0e06');
  fillPts(ctx, blob(65, 82, 2.2, 1.6, 8), '#2a0e06');
  line(pen, quad([], 48, 88, 60, 94, 72, 88, 8), 1.6, '#2a0e06');
  for (const s of [-1, 1]) paint(pen, [60 + s * 8, 89, 60 + s * 11, 89, 60 + s * 9.5, 95], '#fbf6e8', '#8a7a60', { hatch: 0, outline: 1 });
  shine(pen, bez([], 42, 52, 42, 40, 50, 32, 58, 30, 6), 2.6, 0.5);
};

const DEFS: Record<PortraitId, PDef> = {
  slime: { draw: slime, head: [60, 130, 34], scale: 1 },
  goblin: { draw: goblin, head: [60, 88, 34], scale: 1 },
  spider: { draw: spider, head: [60, 110, 38], scale: 1 },
  skeleton: { draw: skeleton, head: [60, 66, 30], scale: 1 },
  ogre: { draw: ogre, head: [60, 52, 30], scale: 1.12 },
  rats: { draw: rats, head: [62, 92, 30], scale: 1 },
  witch: { draw: witch, head: [58, 80, 32], scale: 1 },
  knight: { draw: knight, head: [60, 54, 30], scale: 1.04 },
  ranger: { draw: ranger, head: [60, 64, 30], scale: 1 },
  dragon: { draw: dragon, head: [60, 60, 36], scale: 1.18 },
};

export function portraitScale(id: PortraitId): number {
  return DEFS[id].scale;
}

// ---------- 立牌精灵（纸板描边 + 厚度 + 木底座） ----------

interface Standee {
  main: HTMLCanvasElement;
  white: HTMLCanvasElement;
  red: HTMLCanvasElement;
  back: HTMLCanvasElement;
  ratio: number;
}

const standees = new Map<string, Standee>();
let standeeVer = -1;

function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** 膨胀描边：16 个外圈 + 8 个内圈偏移叠印；part 0/1/2 分三次各画 8 个（用于分帧），省略则一次画完 */
function dilate(ctx: CanvasRenderingContext2D, sil: HTMLCanvasElement, r: number, dx = 0, dy = 0, part = -1): void {
  for (let p = part < 0 ? 0 : part; p <= (part < 0 ? 2 : part); p++) {
    for (let i = 0; i < 8; i++) {
      const a = p < 2 ? ((i * 2 + p) / 16) * Math.PI * 2 : (i / 8) * Math.PI * 2 + 0.2;
      const k = p < 2 ? r : r * 0.55;
      ctx.drawImage(sil, dx + Math.cos(a) * k, dy + Math.sin(a) * k);
    }
  }
}

/** 立牌分步生成（空闲预热时每帧只做一步，避免单帧 40ms 的卡顿） */
interface StandeeBuild {
  ratio: number;
  step: number;
  cc?: HTMLCanvasElement;
  mc?: HTMLCanvasElement;
  mctx?: CanvasRenderingContext2D;
  sil?: HTMLCanvasElement[];
  white?: HTMLCanvasElement;
  red?: HTMLCanvasElement;
}
const building = new Map<string, StandeeBuild>();

/** 离屏画布的绘制是延迟光栅化的：画到 1×1 画布上强制当场完成，把耗时留在这一步 */
let flushCtx: CanvasRenderingContext2D | null = null;
function flush(c: HTMLCanvasElement): void {
  if (!flushCtx) flushCtx = makeCanvas(1, 1)[1];
  flushCtx.drawImage(c, 0, 0, 1, 1);
}

/** 执行一步；返回 true 表示已完成并写入缓存 */
function stepStandee(id: PortraitId, b: StandeeBuild): boolean {
  const ratio = b.ratio;
  const W = PW + PADP * 2;
  const H = PH + PADP * 2 + BASE_H;
  switch (b.step++) {
    case 0: {
      // 角色
      const [cc, cctx] = makeCanvas(W * ratio, H * ratio);
      cctx.setTransform(ratio, 0, 0, ratio, PADP * ratio, PADP * ratio);
      DEFS[id].draw({ ctx: cctx, k: 1, seed: 7 });
      b.cc = cc;
      flush(cc);
      return false;
    }
    case 1: {
      const cc = b.cc!;
      b.sil = [silhouette(cc, C.ink), silhouette(cc, '#6b5236'), silhouette(cc, '#e9dcc0')];
      for (const c of b.sil) flush(c);
      return false;
    }
    case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9: case 10: {
      // 纸板：纸板厚度 → 墨边 → 纸板面，三次膨胀各分三步，每步立即光栅化
      if (!b.mc) {
        const [mc, mctx] = makeCanvas(W * ratio, H * ratio);
        b.mc = mc;
        b.mctx = mctx;
      }
      const k = b.step - 3;
      const which = Math.floor(k / 3);
      const part = k % 3;
      const sil = b.sil!;
      if (which === 0) dilate(b.mctx!, sil[1], 4.6 * ratio, 2.2 * ratio, 2.4 * ratio, part);
      else if (which === 1) dilate(b.mctx!, sil[0], 5.6 * ratio, 0, 0, part);
      else {
        dilate(b.mctx!, sil[2], 4.0 * ratio, 0, 0, part);
        if (part === 2) {
          b.mctx!.drawImage(b.cc!, 0, 0);
          b.sil = undefined;
          b.cc = undefined;
        }
      }
      flush(b.mc);
      return false;
    }
    case 11: {
      // 底座（脚下的木块）
      const mctx = b.mctx!;
      mctx.setTransform(ratio, 0, 0, ratio, PADP * ratio, PADP * ratio);
      const bx = PW / 2 - 36;
      const by = PH - 6;
      const bp = rectPts(bx, by, 72, BASE_H, 4);
      mctx.save();
      mctx.translate(1.5, 3);
      fillPts(mctx, bp, 'rgba(15,7,2,0.4)');
      mctx.restore();
      const g = mctx.createLinearGradient(0, by, 0, by + BASE_H);
      g.addColorStop(0, '#9a6a3c');
      g.addColorStop(1, '#5e3a20');
      fillPts(mctx, bp, g);
      mctx.strokeStyle = 'rgba(40,20,8,0.35)';
      mctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        mctx.beginPath();
        mctx.moveTo(bx + 4, by + 4 + i * 4 + hashf(i, 3));
        mctx.lineTo(bx + 68, by + 4 + i * 4 - hashf(i, 5));
        mctx.stroke();
      }
      fillPts(mctx, rectPts(PW / 2 - 26, by + 1.5, 52, 3, 1.5), 'rgba(20,10,4,0.55)');
      inkStroke(mctx, bp, true, 1.8, C.ink, 4, { unit: 1, jitter: 0.4, dry: false });
      b.mctx = undefined;
      flush(b.mc!);
      return false;
    }
    case 12:
      b.white = silhouette(b.mc!, '#ffffff');
      flush(b.white);
      return false;
    case 13:
      b.red = silhouette(b.mc!, '#ff5a3a');
      flush(b.red);
      return false;
    default: {
      const back = silhouette(b.mc!, '#8a6a46');
      standees.set(id, { main: b.mc!, white: b.white!, red: b.red!, back, ratio });
      building.delete(id);
      return true;
    }
  }
}

function standeeRatio(): number {
  const r = pxRatio() * 1.05;
  if (standeeVer !== stage.version) {
    standeeVer = stage.version;
    for (const [k, v] of standees) if (Math.abs(v.ratio - r) > 0.05) standees.delete(k);
    for (const [k, v] of building) if (Math.abs(v.ratio - r) > 0.05) building.delete(k);
  }
  return r;
}

function getStandee(id: PortraitId): Standee {
  const r = standeeRatio();
  let s = standees.get(id);
  if (!s) {
    let b = building.get(id);
    if (!b) {
      b = { ratio: r, step: 0 };
      building.set(id, b);
    }
    while (!stepStandee(id, b));
    s = standees.get(id)!;
  }
  return s;
}

/** 空闲预热：做一步；返回 true 表示这一张立牌已就绪 */
export function warmPortrait(id: PortraitId): boolean {
  const r = standeeRatio();
  if (standees.has(id)) return true;
  let b = building.get(id);
  if (!b) {
    b = { ratio: r, step: 0 };
    building.set(id, b);
  }
  return stepStandee(id, b);
}

export type StandeeLayer = 'main' | 'white' | 'red' | 'back';

/**
 * 以底座底边中心 (bx, by) 为锚点绘制立牌；sy = 竖向缩放（弹起/倒下），lean = 前后倾（弧度）
 */
export function drawStandee(ctx: CanvasRenderingContext2D, id: PortraitId, bx: number, by: number, scale: number, sy = 1, lean = 0, layer: StandeeLayer = 'main'): void {
  const s = getStandee(id);
  const img = s[layer];
  const W = PW + PADP * 2;
  const H = PH + PADP * 2 + BASE_H;
  const k = scale * DEFS[id].scale;
  ctx.save();
  ctx.translate(bx, by);
  if (lean !== 0) ctx.rotate(lean);
  ctx.scale(k, k * sy);
  // 底座底边在 y = PADP + PH - 6 + BASE_H
  const baseY = PADP + PH - 6 + BASE_H;
  ctx.drawImage(img, -W / 2, -baseY, W, H);
  ctx.restore();
}

/** 立牌可见高度（逻辑像素，sy=1） */
export function standeeHeight(id: PortraitId, scale: number): number {
  return (PH + BASE_H) * scale * DEFS[id].scale;
}

/** 头像徽章：圆形羊皮纸底 + 头部裁剪 */
export function badge(id: PortraitId | 'player', r: number): Sprite {
  return cached('badge|' + id + '|' + r, r * 2, r * 2, 4, (ctx) => {
    ctx.fillStyle = 'rgba(20,10,4,0.4)';
    ctx.beginPath();
    ctx.arc(r + 1, r + 2, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(r * 0.7, r * 0.6, 1, r, r, r);
    g.addColorStop(0, '#f6ecd2');
    g.addColorStop(1, '#d9c393');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 2.5, 0, Math.PI * 2);
    ctx.clip();
    if (id === 'player') drawHat({ ctx, k: 1, seed: 3 }, r, r, r * 1.6);
    else {
      const d = DEFS[id];
      const k = (r * 0.92) / d.head[2];
      ctx.translate(r - d.head[0] * k, r - d.head[1] * k);
      ctx.scale(k, k);
      d.draw({ ctx, k: 1, seed: 7 });
    }
    ctx.restore();
    ctx.strokeStyle = C.brass;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r, r, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();
    inkStroke(ctx, ellipsePts(r, r, r, r, 30), true, 1.8, C.ink, 5, { unit: 1, jitter: 0.4, dry: false });
  });
}

/** 冒险者帽（玩家徽记） */
function drawHat(pen: Pen, cx: number, cy: number, w: number): void {
  const ctx = pen.ctx;
  const k = w / 100;
  const T = (p: Pts): Pts => xform(p, cx - 50 * k, cy - 50 * k, k, k);
  const brim = T(ellipsePts(50, 66, 48, 13, 30, -0.06));
  paint(pen, brim, lin(ctx, 0, cy, 0, cy + 20 * k, '#8a5a34', '#5e3a20'), '#3a2213', { hatch: 0, outline: 2 });
  const crown: Pts = [];
  bez(crown, 22, 66, 20, 40, 34, 26, 50, 30, 10);
  bez(crown, 50, 30, 60, 22, 80, 30, 78, 66, 10, true);
  paint(pen, T(crown), lin(ctx, 0, cy - 30 * k, 0, cy + 16 * k, '#9a6a3c', '#6b4424'), '#3a2213', { hatch: 4, outline: 2 });
  const band = T(rectPts(22, 54, 56, 8, 3));
  fillPts(ctx, band, C.wax);
  inkStroke(ctx, band, true, 1.2, C.ink, 4, { unit: 1, jitter: 0.3, dry: false });
  // 羽毛
  leaf(pen, cx + 14 * k, cy - 6 * k, 46 * k, 9 * k, -1.0, '#c2402c');
  gem(pen, cx - 12 * k, cy + 8 * k, 4 * k, C.gold, 6);
}

export function drawPlayerBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const b = badge('player', r);
  ctx.drawImage(b.c, x - r - b.pad, y - r - b.pad, (r + b.pad) * 2, (r + b.pad) * 2);
}

export function drawEnemyBadge(ctx: CanvasRenderingContext2D, id: PortraitId, x: number, y: number, r: number): void {
  const b = badge(id, r);
  ctx.drawImage(b.c, x - r - b.pad, y - r - b.pad, (r + b.pad) * 2, (r + b.pad) * 2);
}
