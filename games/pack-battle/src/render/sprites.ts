// 装备卡片精灵：底板（多格并集轮廓）+ 图标 + 等级装饰；阴影 / 白闪 / 灰化变体
import { ITEMS } from '../config.ts';
import { shapeOf, type Cell } from '../game/shapes.ts';
import type { ItemId, Lv, Rot } from '../game/types.ts';
import { ICONS } from './icons/items.ts';
import { S } from './icons/primitives.ts';
import { fillPts, inkStroke, pathPts, type Pts } from './ink.ts';
import { C, pat, RARITY_COLOR, RARITY_TINT } from './kit.ts';
import { pxRatio, stage } from './stage.ts';
import { makeCanvas, text, HAND } from './text.ts';

/** 多格并集外轮廓（格单位，顺时针），合并共线点 */
export function outlineOf(cells: Cell[]): [number, number][] {
  const has = new Set(cells.map((c) => c[0] + ',' + c[1]));
  const at = (x: number, y: number): boolean => has.has(x + ',' + y);
  const edges = new Map<string, [number, number]>();
  for (const [x, y] of cells) {
    if (!at(x, y - 1)) edges.set(x + ',' + y, [x + 1, y]);
    if (!at(x + 1, y)) edges.set(x + 1 + ',' + y, [x + 1, y + 1]);
    if (!at(x, y + 1)) edges.set(x + 1 + ',' + (y + 1), [x, y + 1]);
    if (!at(x - 1, y)) edges.set(x + ',' + (y + 1), [x, y]);
  }
  const start = edges.keys().next().value as string;
  const out: [number, number][] = [];
  let k = start;
  let guard = 0;
  do {
    const [sx, sy] = k.split(',').map(Number);
    out.push([sx, sy]);
    const nxt = edges.get(k)!;
    k = nxt[0] + ',' + nxt[1];
  } while (k !== start && guard++ < 200);
  // 合并共线
  const res: [number, number][] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) res.push(b);
  }
  return res;
}

/** 内缩 + 凸角圆角（像素单位） */
export function tilePoly(cells: Cell[], cell: number, inset: number, radius: number): Pts {
  const poly = outlineOf(cells);
  const n = poly.length;
  const out: Pts = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    const d1x = Math.sign(b[0] - a[0]);
    const d1y = Math.sign(b[1] - a[1]);
    const d2x = Math.sign(c[0] - b[0]);
    const d2y = Math.sign(c[1] - b[1]);
    const n1x = -d1y;
    const n1y = d1x;
    const n2x = -d2y;
    const n2y = d2x;
    const vx = b[0] * cell + inset * (n1x + n2x);
    const vy = b[1] * cell + inset * (n1y + n2y);
    const convex = d1x * d2y - d1y * d2x > 0;
    if (convex && radius > 0) {
      const cx = vx - d1x * radius + d2x * radius;
      const cy = vy - d1y * radius + d2y * radius;
      const a0 = Math.atan2(-d2y, -d2x);
      let a1 = Math.atan2(d1y, d1x);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      a1 = a0 + da;
      for (let j = 0; j <= 5; j++) {
        const t = a0 + (da * j) / 5;
        out.push(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius);
      }
    } else out.push(vx, vy);
  }
  return out;
}

interface ItemSprites {
  L: (HTMLCanvasElement | null)[];
  Sm: (HTMLCanvasElement | null)[];
  shadow: HTMLCanvasElement | null;
  white: HTMLCanvasElement | null;
  gray: (HTMLCanvasElement | null)[];
  ratio: number;
}

const PAD = 8;
/** 小尺寸精灵的基准格（商店卡 / 桌边 ≤ 34px 时用，线条更粗更清楚） */
const SMALL = 34;
const cache = new Map<ItemId, ItemSprites>();
let cacheVer = -1;

function entry(id: ItemId): ItemSprites {
  if (cacheVer !== stage.version) {
    // 只在比例变化时失效
    const r = pxRatio();
    for (const [k, v] of cache) if (Math.abs(v.ratio - r) > 0.01) cache.delete(k);
    cacheVer = stage.version;
  }
  let e = cache.get(id);
  if (!e) {
    e = { L: [null, null, null], Sm: [null, null, null], shadow: null, white: null, gray: [null, null, null], ratio: pxRatio() };
    cache.set(id, e);
  }
  return e;
}

function starStamp(ctx: CanvasRenderingContext2D, lv: Lv, cell: number, small: boolean): void {
  const stars = lv === 1 ? '★' : lv === 2 ? '★★' : '★★★';
  const fs = small ? 12 : Math.round(cell * 0.2);
  const x = small ? 4 : 6;
  const y = small ? 4 : 5;
  ctx.font = `700 ${fs}px ${HAND}`;
  const w = ctx.measureText(stars).width + (small ? 5 : 6);
  const h = fs + (small ? 3.5 : 4);
  const col = lv === 1 ? 'rgba(240,227,194,0.92)' : lv === 2 ? '#e8ecef' : '#f6d47a';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(43,29,20,0.85)';
  ctx.lineWidth = small ? 1.1 : 1.2;
  ctx.stroke();
  text(ctx, stars, w / 2, h / 2 + 0.5, {
    size: fs, weight: 700, family: HAND, color: lv === 3 ? '#8a4a10' : lv === 2 ? '#4a5560' : C.ink,
  });
  ctx.restore();
}

function drawTile(id: ItemId, lv: Lv, small: boolean, ratio: number): HTMLCanvasElement {
  const def = ITEMS[id];
  const sh = shapeOf(id, 0);
  const cell = small ? SMALL : S;
  const w = sh.w * cell;
  const h = sh.h * cell;
  const [c, ctx] = makeCanvas((w + PAD * 2) * ratio, (h + PAD * 2) * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, PAD * ratio, PAD * ratio);
  const inset = small ? 2 : 3;
  const poly = tilePoly(sh.cells, cell, inset, small ? 5 : 6);
  // 底板
  fillPts(ctx, poly, pat(ctx, 'parchment', ratio, small ? 0.6 : 1));
  const tint = RARITY_TINT[def.rarity];
  if (def.rarity > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fillPts(ctx, poly, tint);
    ctx.restore();
  }
  if (def.enemyOnly) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fillPts(ctx, poly, '#e6d2c8');
    ctx.restore();
  }
  // 水彩积边
  ctx.save();
  pathPts(ctx, poly, true);
  ctx.clip();
  ctx.strokeStyle = def.rarity === 3 ? '#c46a24' : C.paperBurn;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = small ? 5.5 : 8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = small ? 12 : 18;
  ctx.stroke();
  ctx.restore();
  // 格间铅笔点线
  if (!small) {
    const has = new Set(sh.cells.map((q) => q[0] + ',' + q[1]));
    ctx.save();
    ctx.setLineDash([1.5, 3.5]);
    ctx.strokeStyle = 'rgba(138,122,102,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [x, y] of sh.cells) {
      if (has.has(x + 1 + ',' + y)) {
        ctx.moveTo((x + 1) * cell, y * cell + 8);
        ctx.lineTo((x + 1) * cell, (y + 1) * cell - 8);
      }
      if (has.has(x + ',' + (y + 1))) {
        ctx.moveTo(x * cell + 8, (y + 1) * cell);
        ctx.lineTo((x + 1) * cell - 8, (y + 1) * cell);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  // 图标
  ctx.save();
  if (small) ctx.scale(cell / S, cell / S);
  // 留出边距：图标整体缩到 92%
  const sc = 0.9;
  ctx.translate((sh.w * S * (1 - sc)) / 2, (sh.h * S * (1 - sc)) / 2 + (small ? 0 : 1));
  ctx.scale(sc, sc);
  ICONS[id]({ ctx, k: small ? 1.5 : 1, seed: 7 });
  ctx.restore();
  // 传说金箔边
  const borderCol = lv === 3 ? '#e0a83a' : lv === 2 ? '#c9d2d8' : null;
  if (def.rarity === 3 && !small) {
    ctx.save();
    pathPts(ctx, poly, true);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#f6d47a');
    g.addColorStop(1, '#c46a24');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  // 描边
  inkStroke(ctx, poly, true, small ? 1.8 : 2.2, C.ink, 3 + lv, { unit: 1, jitter: small ? 0.3 : 0.6, dry: !small });
  // 等级双线
  if (borderCol) {
    const inner = tilePoly(sh.cells, cell, inset + (small ? 3 : 4), small ? 3 : 4);
    ctx.save();
    pathPts(ctx, inner, true);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = small ? 1.4 : 2;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
    ctx.restore();
    if (lv === 3 && !small) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const [gx, gy] = [sh.cells[0][0] * cell + cell * 0.8, sh.cells[0][1] * cell + cell * 0.2];
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 10);
      gg.addColorStop(0, 'rgba(255,240,180,0.9)');
      gg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - 10, gy - 10, 20, 20);
      ctx.restore();
    }
  }
  // 稀有度宝石（右上格）
  if (def.rarity > 0) {
    let tr = sh.cells[0];
    for (const q of sh.cells) if (q[1] < tr[1] || (q[1] === tr[1] && q[0] > tr[0])) tr = q;
    const gx = (tr[0] + 1) * cell - (small ? 7 : 9);
    const gy = tr[1] * cell + (small ? 7 : 9);
    const r = small ? 3.2 : 4;
    ctx.fillStyle = RARITY_COLOR[def.rarity];
    ctx.beginPath();
    ctx.moveTo(gx, gy - r);
    ctx.lineTo(gx + r, gy);
    ctx.lineTo(gx, gy + r);
    ctx.lineTo(gx - r, gy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(gx - r * 0.45, gy - r * 0.45, r * 0.35, r * 0.35);
  }
  // 星章（左上格）
  const tl = sh.cells[0];
  ctx.save();
  ctx.translate(tl[0] * cell, tl[1] * cell);
  starStamp(ctx, lv, cell, small);
  ctx.restore();
  return c;
}

function makeShadow(id: ItemId, ratio: number): HTMLCanvasElement {
  const sh = shapeOf(id, 0);
  const w = sh.w * S;
  const h = sh.h * S;
  const [c, ctx] = makeCanvas((w + PAD * 2) * ratio, (h + PAD * 2) * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, PAD * ratio, PAD * ratio);
  const poly = tilePoly(sh.cells, S, 3, 6);
  const r = 3.2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    fillPts(ctx, poly, 'rgba(12,5,1,0.13)');
    ctx.restore();
  }
  fillPts(ctx, poly, 'rgba(12,5,1,0.25)');
  return c;
}

function variant(src: HTMLCanvasElement, mode: 'white' | 'gray'): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  if (mode === 'white') {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
  } else {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#b8b0a8';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(src, 0, 0);
  }
  return c;
}

export type SpriteKind = 'tile' | 'shadow' | 'white' | 'gray';

export function itemCanvas(id: ItemId, lv: Lv, kind: SpriteKind, small = false): HTMLCanvasElement {
  const e = entry(id);
  const i = lv - 1;
  if (kind === 'tile') {
    const arr = small ? e.Sm : e.L;
    if (!arr[i]) arr[i] = drawTile(id, lv, small, e.ratio);
    return arr[i]!;
  }
  if (kind === 'shadow') {
    if (!e.shadow) e.shadow = makeShadow(id, e.ratio);
    return e.shadow;
  }
  if (kind === 'white') {
    if (!e.white) e.white = variant(itemCanvas(id, 1, 'tile'), 'white');
    return e.white;
  }
  if (!e.gray[i]) e.gray[i] = variant(itemCanvas(id, lv, 'tile'), 'gray');
  return e.gray[i]!;
}

/** 预热（空闲时分批生成） */
export function warmItem(id: ItemId, lv: Lv): void {
  itemCanvas(id, lv, 'tile');
}

/**
 * 在当前变换下绘制装备：旋转后包围盒左上角在 (0,0)，格大小 cell。
 */
export function drawItemLocal(ctx: CanvasRenderingContext2D, id: ItemId, lv: Lv, rot: Rot, cell: number, kind: SpriteKind = 'tile', small = false): void {
  const s0 = shapeOf(id, 0);
  const wr = rot % 2 === 1 ? s0.h : s0.w;
  const hr = rot % 2 === 1 ? s0.w : s0.h;
  const img = itemCanvas(id, lv, kind, small && kind === 'tile');
  const base = small && kind === 'tile' ? SMALL : S;
  const k = cell / base;
  const w = (s0.w * base + PAD * 2) * k;
  const h = (s0.h * base + PAD * 2) * k;
  if (rot === 0) {
    ctx.drawImage(img, -PAD * k, -PAD * k, w, h);
    return;
  }
  ctx.save();
  ctx.translate((wr * cell) / 2, (hr * cell) / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function drawItem(ctx: CanvasRenderingContext2D, id: ItemId, lv: Lv, rot: Rot, x: number, y: number, cell: number, kind: SpriteKind = 'tile', small = false): void {
  ctx.save();
  ctx.translate(x, y);
  drawItemLocal(ctx, id, lv, rot, cell, kind, small);
  ctx.restore();
}

export function shapeSize(id: ItemId, rot: Rot): [number, number] {
  const s = shapeOf(id, rot);
  return [s.w, s.h];
}

/** 以中心 (cx,cy) 绘制 rot0 精灵并旋转 ang（弧度，顺时针为正）——用于动画中的连续旋转 */
export function drawItemAt(ctx: CanvasRenderingContext2D, id: ItemId, lv: Lv, ang: number, cx: number, cy: number, cell: number, kind: SpriteKind = 'tile', small = false): void {
  const s0 = shapeOf(id, 0);
  const useSmall = small && kind === 'tile';
  const img = itemCanvas(id, lv, kind, useSmall);
  const base = useSmall ? SMALL : S;
  const k = cell / base;
  const w = (s0.w * base + PAD * 2) * k;
  const h = (s0.h * base + PAD * 2) * k;
  if (ang === 0) {
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
