// 美术零件：羊皮纸面板、蜡封、黄铜、木质圆币、纸签、缎带、行囊外框（全部缓存为精灵）
import { deckledRect, ellipsePts, fillPts, inkStroke, INK, pathPts, rectPts, type Pts } from './ink.ts';
import { hashf } from './noise.ts';
import { pxRatio, stage } from './stage.ts';
import { HAND, CN, sprite, SpriteCache, text, type Sprite, drawSprite } from './text.ts';
import { leatherTile, metalTile, mixHex, parchmentTile, rgba, weaveTile } from './textures.ts';

export const C = {
  woodDark: '#2e1b10',
  wood: '#5a3720',
  woodLight: '#7d5232',
  grain: '#3a2213',
  lamp: '#ffd08a',
  leather: '#8b5a32',
  leatherDark: '#5b3519',
  leatherLight: '#b07a45',
  stitch: '#efd9a7',
  lining: '#4a2d18',
  dentDark: '#2f1b0d',
  dentLight: '#6e4527',
  paper: '#f0e3c2',
  paperShade: '#dcc699',
  paperBurn: '#a9814f',
  ink: '#2b1d14',
  inkSoft: '#5d4837',
  pencil: '#8a7a66',
  hp: '#c2402c',
  ghost: '#f3c46b',
  shield: '#4f7fa8',
  shieldLight: '#a9c6dd',
  heal: '#6f9d3c',
  healLight: '#b9d77f',
  gold: '#e2a533',
  goldLight: '#f8da7a',
  goldDark: '#9a6a1f',
  poison: '#7e4fa0',
  poisonLight: '#c3a0d8',
  stun: '#f2cd3f',
  ok: '#78a447',
  bad: '#c4472f',
  wax: '#9f2a22',
  waxLight: '#d0503f',
  brass: '#c8963e',
  brassLight: '#f1cf7a',
  chalk: '#e9d8b0',
  awning: '#b5523b',
};

export const RARITY_COLOR = ['#8a7863', '#3f8a7a', '#3e68a6', '#c46a24'];
export const RARITY_TINT = ['#f0e3c2', '#e3ece0', '#dfe5ef', '#f5e2b8'];
export const TAG_COLOR = { weapon: '#c2402c', armor: '#4f7fa8', remedy: '#6f9d3c', tool: '#d9952e' } as const;

const tiles: Record<string, HTMLCanvasElement> = {};

export function initKit(): void {
  tiles.leather = leatherTile(C.leather, 2);
  tiles.parchment = parchmentTile(3);
}

/** 敌人背包外框纹理按需生成 */
export function tile(name: string): HTMLCanvasElement {
  let t = tiles[name];
  if (t) return t;
  switch (name) {
    case 'leatherDark': t = leatherTile(C.leatherDark, 4); break;
    case 'hide': t = leatherTile('#7a5a3a', 6); break;
    case 'bone': t = leatherTile('#6b4a35', 8); break;
    case 'shadow': t = leatherTile('#3a3a36', 9); break;
    case 'moss': t = weaveTile('#7d8a5a', 'linen', 11); break;
    case 'patch': t = weaveTile('#9a7a52', 'linen', 12); break;
    case 'silk': t = weaveTile('#bdb7aa', 'linen', 13); break;
    case 'wicker': t = weaveTile('#a8854f', 'wicker', 14); break;
    case 'crate': t = weaveTile('#a8804c', 'linen', 15); break;
    case 'iron': t = metalTile('#6f7378', 16); break;
    case 'gold': t = leatherTile('#7a2e22', 17); break;
    default: t = tiles.parchment;
  }
  tiles[name] = t;
  return t;
}

/** pattern：纹素对齐设备像素 */
export function pat(ctx: CanvasRenderingContext2D, name: string, ratio: number, scale = 1): CanvasPattern {
  const p = ctx.createPattern(tile(name), 'repeat')!;
  p.setTransform(new DOMMatrix([scale / ratio, 0, 0, scale / ratio, 0, 0]));
  return p;
}

const cache = new SpriteCache();

export function cached(key: string, w: number, h: number, pad: number, draw: (ctx: CanvasRenderingContext2D, r: number) => void): Sprite {
  const r = pxRatio();
  return cache.get(key, stage.version, () => sprite(w, h, r, pad, (ctx) => draw(ctx, r)));
}

export function clearKitCache(): void {
  cache.clear();
}

// ---------- 羊皮纸面板 ----------

export interface PaperOpts {
  seed?: number;
  tint?: string;
  burn?: number;
  border?: boolean;
  shadow?: boolean;
  r?: number;
}

export function drawPaper(ctx: CanvasRenderingContext2D, ratio: number, x: number, y: number, w: number, h: number, o: PaperOpts = {}): Pts {
  const seed = o.seed ?? 1;
  const poly = deckledRect(x, y, w, h, seed, 6, w < 90 ? 1.6 : 2.5, o.r ?? 3);
  if (o.shadow ?? true) {
    ctx.save();
    ctx.translate(1.5, 3.5);
    fillPts(ctx, poly, 'rgba(25,12,5,0.28)');
    ctx.translate(1, 1.5);
    fillPts(ctx, poly, 'rgba(25,12,5,0.14)');
    ctx.restore();
  }
  fillPts(ctx, poly, pat(ctx, 'parchment', ratio));
  if (o.tint && o.tint !== C.paper) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fillPts(ctx, poly, o.tint);
    ctx.restore();
  }
  ctx.save();
  pathPts(ctx, poly, true);
  ctx.clip();
  const burn = o.burn ?? 1;
  ctx.strokeStyle = C.paperBurn;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.18 * burn;
  ctx.lineWidth = Math.min(22, Math.min(w, h) * 0.22);
  ctx.stroke();
  ctx.globalAlpha = 0.28 * burn;
  ctx.lineWidth = Math.min(8, Math.min(w, h) * 0.1);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = C.paperBurn;
  ctx.lineWidth = 1;
  pathPts(ctx, poly, true);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (o.border) {
    inkStroke(ctx, rectPts(x + 7, y + 7, w - 14, h - 14, 4), true, 1.3, rgba(C.ink, 0.55), seed + 3, { unit: 1, jitter: 0.6 });
  }
  return poly;
}

export function paper(key: string, w: number, h: number, o: PaperOpts = {}): Sprite {
  return cached('paper|' + key + '|' + w + 'x' + h, w, h, 6, (ctx, r) => {
    drawPaper(ctx, r, 0, 0, w, h, o);
  });
}

// ---------- 黄铜 ----------

export function brassFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, C.brassLight);
  g.addColorStop(0.55, C.brass);
  g.addColorStop(1, '#8a6224');
  return g;
}

export function brassShape(ctx: CanvasRenderingContext2D, p: Pts, bx: number, by: number, bw: number, bh: number, seed = 1, lw = 1.4): void {
  fillPts(ctx, p, brassFill(ctx, bx, by, bw, bh));
  inkStroke(ctx, p, true, lw, C.ink, seed, { unit: 1, jitter: 0.4, dry: false });
  // 高光
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#fff6d8';
  ctx.lineWidth = Math.max(1, Math.min(bw, bh) * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.22, by + bh * 0.28);
  ctx.quadraticCurveTo(bx + bw * 0.3, by + bh * 0.15, bx + bw * 0.5, by + bh * 0.18);
  ctx.stroke();
  ctx.restore();
}

export function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#5b4020';
  ctx.beginPath();
  ctx.arc(x + 0.4, y + 0.6, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.5, C.brass);
  g.addColorStop(1, '#7a5420');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 蜡封 ----------

export function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, glyph: string, seed = 1, color = C.wax): void {
  const p: Pts = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.93 + 0.1 * hashf(i, seed) + 0.04 * Math.sin(a * 3 + seed));
    p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.save();
  ctx.translate(1, 2);
  fillPts(ctx, p, 'rgba(30,8,5,0.35)');
  ctx.restore();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, color === C.wax ? C.waxLight : mixHex(color, '#ffffff', 0.25));
  g.addColorStop(0.7, color);
  g.addColorStop(1, mixHex(color, '#000000', 0.35));
  fillPts(ctx, p, g);
  // 压印环
  ctx.strokeStyle = 'rgba(60,8,6,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,180,160,0.35)';
  ctx.lineWidth = Math.max(0.8, r * 0.05);
  ctx.beginPath();
  ctx.arc(cx + 0.6, cy + 0.8, r * 0.68, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  // 浮雕字
  const fs = r * 0.95;
  text(ctx, glyph, cx + 0.8, cy + 1.2, { size: fs, weight: 900, color: 'rgba(255,190,170,0.45)' });
  text(ctx, glyph, cx, cy, { size: fs, weight: 900, color: 'rgba(70,10,8,0.85)' });
  // 镜面高光
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffd9cc';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, Math.PI * 1.08, Math.PI * 1.38);
  ctx.stroke();
  ctx.restore();
}

export function seal(glyph: string, r: number, seed = 1, color = C.wax): Sprite {
  return cached('seal|' + glyph + '|' + r + '|' + seed + '|' + color, r * 2, r * 2, 4, (ctx) => drawSeal(ctx, r, r, r, glyph, seed, color));
}

// ---------- 木质圆币按钮 ----------

export type CoinIcon = 'pause' | 'gear' | 'help' | 'close' | 'lock' | 'unlock' | 'refresh' | 'eye';

function coinIcon(ctx: CanvasRenderingContext2D, icon: CoinIcon, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = C.paper;
  ctx.fillStyle = C.paper;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.13;
  switch (icon) {
    case 'pause':
      ctx.fillRect(-s * 0.28, -s * 0.32, s * 0.19, s * 0.64);
      ctx.fillRect(s * 0.09, -s * 0.32, s * 0.19, s * 0.64);
      break;
    case 'gear': {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 === 0 ? s * 0.42 : s * 0.3;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.wood;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'help':
      text(ctx, '?', 0, s * 0.04, { size: s * 0.9, weight: 700, family: HAND, color: C.paper });
      break;
    case 'close':
      ctx.beginPath();
      ctx.moveTo(-s * 0.25, -s * 0.25);
      ctx.lineTo(s * 0.25, s * 0.25);
      ctx.moveTo(s * 0.25, -s * 0.25);
      ctx.lineTo(-s * 0.25, s * 0.25);
      ctx.stroke();
      break;
    case 'lock':
    case 'unlock':
      ctx.beginPath();
      if (icon === 'lock') ctx.arc(0, -s * 0.08, s * 0.17, Math.PI, 0);
      else ctx.arc(-s * 0.2, -s * 0.12, s * 0.17, Math.PI, -0.2);
      ctx.stroke();
      ctx.fillRect(-s * 0.24, -s * 0.06, s * 0.48, s * 0.36);
      break;
    case 'refresh':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.26, -Math.PI * 0.2, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.32, -s * 0.28);
      ctx.lineTo(s * 0.26, -s * 0.02);
      ctx.lineTo(s * 0.02, -s * 0.14);
      ctx.closePath();
      ctx.fill();
      break;
    case 'eye':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.34, s * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

export function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, icon: CoinIcon | null, seed = 1): void {
  ctx.fillStyle = 'rgba(20,10,4,0.4)';
  ctx.beginPath();
  ctx.arc(cx + 1, cy + 2.5, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#a3713f');
  g.addColorStop(0.75, '#74492a');
  g.addColorStop(1, '#4e2f19');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 木纹
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,20,8,0.25)';
  ctx.lineWidth = 0.8;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + i * r * 0.28 + hashf(i, seed) * 2);
    ctx.quadraticCurveTo(cx, cy + i * r * 0.28 + (hashf(i + 9, seed) - 0.5) * 5, cx + r, cy + i * r * 0.28);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,220,170,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  inkStroke(ctx, ellipsePts(cx, cy, r, r, 28), true, 1.8, C.ink, seed, { unit: 1, jitter: 0.5, dry: false });
  if (icon) coinIcon(ctx, icon, cx, cy, r * 1.05);
}

export function coin(icon: CoinIcon | null, r: number, seed = 1): Sprite {
  return cached('coin|' + icon + '|' + r + '|' + seed, r * 2, r * 2, 4, (ctx) => drawCoin(ctx, r, r, r, icon, seed));
}

// ---------- 金币图标 ----------

export function drawGoldCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = C.goldDark;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.12, r, r * 0.96, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fff1b0');
  g.addColorStop(0.5, C.goldLight);
  g.addColorStop(1, C.gold);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(154,106,31,0.8)';
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.06, r, r * 1.0, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function goldCoin(r: number): Sprite {
  return cached('gold|' + r, r * 2, r * 2, 2, (ctx) => drawGoldCoin(ctx, r, r, r));
}

// ---------- 心 ----------

export function heartPts(cx: number, cy: number, w: number, h: number): Pts {
  const p: Pts = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    p.push(cx + (x / 34) * w, cy + (y / 32) * h + h * 0.08);
  }
  return p;
}

export function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, full: boolean, seed = 1): void {
  const p = heartPts(cx, cy, w, h);
  if (full) {
    const g = ctx.createRadialGradient(cx - w * 0.2, cy - h * 0.25, 1, cx, cy, w * 0.7);
    g.addColorStop(0, '#f07a5e');
    g.addColorStop(1, C.hp);
    fillPts(ctx, p, g);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#ffd6c8';
    ctx.lineWidth = Math.max(1, w * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - w * 0.2, cy - h * 0.12, w * 0.15, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();
    inkStroke(ctx, p, true, 1.6, C.ink, seed, { unit: 1, jitter: 0.4, dry: false });
  } else {
    fillPts(ctx, p, 'rgba(43,29,20,0.25)');
    inkStroke(ctx, p, true, 1.3, 'rgba(240,227,194,0.45)', seed, { unit: 1, jitter: 0.4, dry: false });
  }
}

// ---------- 纸签（带图钉或细绳） ----------

export function drawTag(ctx: CanvasRenderingContext2D, ratio: number, x: number, y: number, w: number, h: number, seed = 1, tint?: string): void {
  drawPaper(ctx, ratio, x, y, w, h, { seed, tint, burn: 0.7, r: 4 });
}

export function tagSprite(key: string, w: number, h: number, seed = 1, tint?: string): Sprite {
  return cached('tag|' + key + '|' + w + 'x' + h + '|' + tint, w, h, 6, (ctx, r) => drawTag(ctx, r, 0, 0, w, h, seed, tint));
}

// ---------- 缎带 ----------

export function drawRibbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed = 1): void {
  const tail = h * 0.55;
  // 两端燕尾
  const dark = mixHex(color, '#000000', 0.35);
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x : x + w;
    const p: Pts = [ex, y + h * 0.2, ex + side * tail * 1.4, y + h * 0.2, ex + side * tail * 0.9, y + h * 0.7, ex + side * tail * 1.4, y + h * 1.2, ex, y + h * 1.2];
    fillPts(ctx, p, dark);
    inkStroke(ctx, p, true, 1.4, C.ink, seed + side, { unit: 1, jitter: 0.5, dry: false });
  }
  const p = rectPts(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mixHex(color, '#ffffff', 0.18));
  g.addColorStop(1, mixHex(color, '#000000', 0.12));
  fillPts(ctx, p, g);
  ctx.strokeStyle = 'rgba(255,240,210,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + w - 4, y + 4);
  ctx.moveTo(x + 4, y + h - 4);
  ctx.lineTo(x + w - 4, y + h - 4);
  ctx.stroke();
  inkStroke(ctx, p, true, 1.8, C.ink, seed, { unit: 1, jitter: 0.6, dry: false });
}

// ---------- 木牌按钮（开战 / 继续 / 再来一局） ----------

export function drawPlank(ctx: CanvasRenderingContext2D, ratio: number, x: number, y: number, w: number, h: number, seed = 1, tone = 0): void {
  ctx.save();
  ctx.translate(1.5, 4);
  fillPts(ctx, rectPts(x, y, w, h, 10), 'rgba(15,8,3,0.45)');
  ctx.restore();
  const p = rectPts(x, y, w, h, 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tone === 0 ? '#8f5f37' : '#7a4f2d');
  g.addColorStop(1, tone === 0 ? '#5f3b20' : '#4e301a');
  fillPts(ctx, p, g);
  ctx.save();
  pathPts(ctx, p, true);
  ctx.clip();
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = pat(ctx, 'leather', ratio, 1);
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(40,20,8,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const yy = y + 8 + i * ((h - 16) / 5) + (hashf(i, seed) - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + (hashf(i + 3, seed) - 0.5) * 6, x + w * 0.7, yy + (hashf(i + 6, seed) - 0.5) * 6, x + w, yy);
    ctx.stroke();
  }
  // 顶部亮边
  ctx.strokeStyle = 'rgba(255,215,160,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 2.5);
  ctx.lineTo(x + w - 10, y + 2.5);
  ctx.stroke();
  ctx.restore();
  inkStroke(ctx, p, true, 2.2, C.ink, seed, { unit: 1, jitter: 0.6, dry: false });
  // 两颗钉子
  rivet(ctx, x + 12, y + h / 2, 3);
  rivet(ctx, x + w - 12, y + h / 2, 3);
}

// ---------- 行囊外框 ----------

export interface BagFrameOpts {
  cols: number;
  rows: number;
  cell: number;
  frame: number;
  style: string;
  flap?: boolean;
  straps?: boolean;
  corners?: 'brass' | 'iron' | 'bone' | 'gold' | 'none';
}

/** 外框 + 内衬 + 格压痕；返回精灵（原点 = 外框左上） */
export function bagFrame(o: BagFrameOpts): Sprite {
  const W = o.cols * o.cell + o.frame * 2;
  const H = o.rows * o.cell + o.frame * 2;
  const key = `bag|${o.cols}x${o.rows}|${o.cell}|${o.frame}|${o.style}|${o.flap}|${o.straps}|${o.corners}`;
  return cached(key, W, H, 18, (ctx, ratio) => {
    const f = o.frame;
    const rad = Math.min(18, f + 6);
    const outer = rectPts(0, 0, W, H, rad);
    // 投影
    ctx.save();
    ctx.translate(2, 6);
    fillPts(ctx, outer, 'rgba(15,7,2,0.35)');
    ctx.translate(1, 3);
    fillPts(ctx, outer, 'rgba(15,7,2,0.2)');
    ctx.restore();
    // 侧皮带（外框下面）
    if (o.straps) {
      for (const sx of [W * 0.18, W * 0.82]) {
        const sp = rectPts(sx - 9, -6, 18, H + 12, 3);
        fillPts(ctx, sp, pat(ctx, 'leatherDark', ratio));
        inkStroke(ctx, sp, true, 1.4, C.ink, 9, { unit: 1, jitter: 0.5, dry: false });
      }
    }
    fillPts(ctx, outer, pat(ctx, o.style, ratio));
    // 左上亮、右下暗
    ctx.save();
    pathPts(ctx, outer, true);
    ctx.clip();
    const lg = ctx.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, 'rgba(255,220,170,0.22)');
    lg.addColorStop(0.5, 'rgba(255,220,170,0)');
    lg.addColorStop(1, 'rgba(10,4,0,0.3)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    // 抛光边缘
    ctx.strokeStyle = 'rgba(20,8,2,0.35)';
    ctx.lineWidth = 6;
    pathPts(ctx, outer, true);
    ctx.stroke();
    ctx.restore();
    // 缝线（双行）
    const stitch = (inset: number, seed: number): void => {
      const p = rectPts(inset, inset, W - inset * 2, H - inset * 2, Math.max(4, rad - inset));
      // 沿路径每 10px 一针
      let acc = 0;
      let idx = 0;
      ctx.lineCap = 'round';
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        const ax = p[i];
        const ay = p[i + 1];
        const bx = p[j];
        const by = p[j + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / (len || 1);
        const uy = (by - ay) / (len || 1);
        let d = acc;
        while (d < len) {
          const px = ax + ux * d;
          const py = ay + uy * d;
          const rot = (hashf(idx++, seed) - 0.5) * 0.14;
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          const vx = (ux * c - uy * s) * 3;
          const vy = (ux * s + uy * c) * 3;
          ctx.strokeStyle = 'rgba(20,8,2,0.5)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px - vx, py - vy + 1);
          ctx.lineTo(px + vx, py + vy + 1);
          ctx.stroke();
          ctx.strokeStyle = C.stitch;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px - vx, py - vy);
          ctx.lineTo(px + vx, py + vy);
          ctx.stroke();
          d += 10;
        }
        acc = d - len;
      }
    };
    stitch(Math.max(4, f * 0.32), 3);
    if (f >= 12) stitch(f - 4.5, 4);
    // 内衬
    const ix = f;
    const iy = f;
    const iw = o.cols * o.cell;
    const ih = o.rows * o.cell;
    const inner = rectPts(ix, iy, iw, ih, 5);
    fillPts(ctx, inner, C.lining);
    ctx.save();
    pathPts(ctx, inner, true);
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pat(ctx, 'leather', ratio);
    ctx.fillRect(ix, iy, iw, ih);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // 内阴影
    const ig = ctx.createLinearGradient(0, iy, 0, iy + 14);
    ig.addColorStop(0, 'rgba(10,4,0,0.55)');
    ig.addColorStop(1, 'rgba(10,4,0,0)');
    ctx.fillStyle = ig;
    ctx.fillRect(ix, iy, iw, 14);
    const ig2 = ctx.createLinearGradient(ix, 0, ix + 10, 0);
    ig2.addColorStop(0, 'rgba(10,4,0,0.4)');
    ig2.addColorStop(1, 'rgba(10,4,0,0)');
    ctx.fillStyle = ig2;
    ctx.fillRect(ix, iy, 10, ih);
    // 格压痕：暗线 + 1px 偏移亮线
    for (let cx = 0; cx <= o.cols; cx++) {
      const x = ix + cx * o.cell;
      ctx.fillStyle = C.dentLight;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + 1, iy, 1, ih);
      ctx.fillStyle = C.dentDark;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x - 0.5, iy, 1.4, ih);
    }
    for (let cy = 0; cy <= o.rows; cy++) {
      const y = iy + cy * o.cell;
      ctx.fillStyle = C.dentLight;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(ix, y + 1, iw, 1);
      ctx.fillStyle = C.dentDark;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(ix, y - 0.5, iw, 1.4);
    }
    ctx.globalAlpha = 1;
    // 格中心的小压点
    ctx.fillStyle = 'rgba(110,69,39,0.25)';
    for (let cy = 0; cy < o.rows; cy++) {
      for (let cx = 0; cx < o.cols; cx++) {
        ctx.beginPath();
        ctx.arc(ix + (cx + 0.5) * o.cell, iy + (cy + 0.5) * o.cell, Math.max(1, o.cell * 0.025), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    inkStroke(ctx, inner, true, 1.4, C.ink, 7, { unit: 1, jitter: 0.4, dry: false });
    inkStroke(ctx, outer, true, 2.4, C.ink, 5, { unit: 1, jitter: 0.6, dry: false });
    // 包角
    const corner = o.corners ?? 'brass';
    if (corner !== 'none') {
      const cs = Math.max(14, f + 8);
      const cornerFill = (bx: number, by: number, sx: number, sy: number, seed: number): void => {
        const p: Pts = [bx, by + sy * cs, bx, by + sy * 4, bx + sx * 4, by, bx + sx * cs, by, bx + sx * cs * 0.55, by + sy * cs * 0.55];
        if (corner === 'brass' || corner === 'gold') {
          brassShape(ctx, p, Math.min(bx, bx + sx * cs), Math.min(by, by + sy * cs), cs, cs, seed, 1.2);
        } else {
          fillPts(ctx, p, corner === 'iron' ? '#8a8f94' : '#e6dcc4');
          inkStroke(ctx, p, true, 1.2, C.ink, seed, { unit: 1, jitter: 0.4, dry: false });
        }
        rivet(ctx, bx + sx * cs * 0.3, by + sy * cs * 0.3, 1.8);
      };
      cornerFill(1, 1, 1, 1, 21);
      cornerFill(W - 1, 1, -1, 1, 22);
      cornerFill(1, H - 1, 1, -1, 23);
      cornerFill(W - 1, H - 1, -1, -1, 24);
    }
    // 翻盖 + 扣具
    if (o.flap) {
      const fw = W * 0.5;
      const fx = (W - fw) / 2;
      const fp = rectPts(fx, -12, fw, 12 + f * 0.6, 8);
      fillPts(ctx, fp, pat(ctx, 'leatherDark', ratio));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(fx + 4, f * 0.6 - 3, fw - 8, 3);
      inkStroke(ctx, fp, true, 1.6, C.ink, 31, { unit: 1, jitter: 0.5, dry: false });
      const bw = 26;
      const bh = 18;
      const bp = rectPts(W / 2 - bw / 2, -6 - bh / 2 + 2, bw, bh, 4);
      brassShape(ctx, bp, W / 2 - bw / 2, -6 - bh / 2 + 2, bw, bh, 33, 1.4);
      ctx.fillStyle = C.ink;
      ctx.fillRect(W / 2 - 1.5, -6 - 4 + 2, 3, 8);
    }
  });
}

export function drawBagFrame(ctx: CanvasRenderingContext2D, o: BagFrameOpts, x: number, y: number, scale = 1): void {
  drawSprite(ctx, bagFrame(o), x, y, scale);
}

/** 文字：浅色字 + 墨描边（深色底上） */
export function labelOnDark(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number | string = 700, family = CN, align: CanvasTextAlign = 'center'): void {
  text(ctx, s, x, y, { size, weight, family, color: C.paper, stroke: INK, strokeW: Math.max(2.5, size * 0.2), align });
}
