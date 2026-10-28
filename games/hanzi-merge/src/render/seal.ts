/**
 * 程序化印章（§6.5）：圆角方形朱底，白文（反白字）或朱文（朱字），噪声腐蚀边缘与内部。
 * 按 (文字, 尺寸, 样式) 缓存；字体就绪时随字形缓存一起清空。
 */
import { Rng } from '../core/rng.ts';
import { INK, KAI_STACK, LOGO_STACK, glyphs } from './glyphs.ts';

const cache = new Map<string, HTMLCanvasElement>();
let ver = -1;

export function seal(text: string, size: number, style: 'white' | 'red' = 'white', font: 'kai' | 'logo' = 'kai', seed = 1): HTMLCanvasElement {
  if (ver !== glyphs.version) {
    cache.clear();
    ver = glyphs.version;
  }
  const key = `${text}|${size}|${style}|${font}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dpr = glyphs.dpr;
  const c = document.createElement('canvas');
  const pad = 2;
  const W = size + pad * 2;
  c.width = Math.ceil(W * dpr);
  c.height = Math.ceil(W * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const rng = new Rng(seed * 131 + text.length * 7 + size);
  const r = size * 0.12;
  const x = pad;
  const y = pad;
  const rr = (w: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + w - r);
    g.quadraticCurveTo(x + w, y + w, x + w - r, y + w);
    g.lineTo(x + r, y + w);
    g.quadraticCurveTo(x, y + w, x, y + w - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  };
  const chars = [...text];
  const n = chars.length;
  // 字的排布：1 字居中；2 字竖排；3 字右一左二；4 字 2×2（右列先读）
  const cells: { cx: number; cy: number; fs: number }[] = [];
  const inner = size * 0.78;
  const ox = x + (size - inner) / 2;
  const oy = y + (size - inner) / 2;
  if (n === 1) cells.push({ cx: x + size / 2, cy: y + size / 2, fs: inner * 0.92 });
  else if (n === 2) {
    cells.push({ cx: x + size / 2, cy: oy + inner * 0.25, fs: inner * 0.5 });
    cells.push({ cx: x + size / 2, cy: oy + inner * 0.75, fs: inner * 0.5 });
  } else if (n === 3) {
    cells.push({ cx: ox + inner * 0.75, cy: y + size / 2, fs: inner * 0.62 });
    cells.push({ cx: ox + inner * 0.25, cy: oy + inner * 0.25, fs: inner * 0.5 });
    cells.push({ cx: ox + inner * 0.25, cy: oy + inner * 0.75, fs: inner * 0.5 });
  } else {
    const order = [
      [0.75, 0.25], [0.75, 0.75], [0.25, 0.25], [0.25, 0.75],
    ];
    for (let i = 0; i < Math.min(4, n); i++) cells.push({ cx: ox + inner * order[i][0], cy: oy + inner * order[i][1], fs: inner * 0.5 });
  }
  const fontStack = font === 'logo' ? LOGO_STACK : KAI_STACK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (style === 'white') {
    rr(size);
    g.fillStyle = INK.red;
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < cells.length; i++) {
      g.font = `${cells[i].fs}px ${fontStack}`;
      g.fillText(chars[i], cells[i].cx, cells[i].cy + cells[i].fs * 0.04);
    }
  } else {
    rr(size);
    g.strokeStyle = INK.red;
    g.lineWidth = Math.max(1.5, size * 0.07);
    g.stroke();
    g.fillStyle = INK.red;
    for (let i = 0; i < cells.length; i++) {
      g.font = `${cells[i].fs * 0.92}px ${fontStack}`;
      g.fillText(chars[i], cells[i].cx, cells[i].cy + cells[i].fs * 0.04);
    }
  }
  // 腐蚀：边缘缺口 + 内部斑驳
  g.globalCompositeOperation = 'destination-out';
  const spots = Math.round(size * 0.9);
  for (let i = 0; i < spots; i++) {
    const edge = rng.next() < 0.55;
    let px: number;
    let py: number;
    if (edge) {
      const side = Math.floor(rng.next() * 4);
      const t = rng.next() * size;
      px = side === 0 ? x + t : side === 1 ? x + size : side === 2 ? x + t : x;
      py = side === 0 ? y : side === 1 ? y + t : side === 2 ? y + size : y + t;
    } else {
      px = x + rng.next() * size;
      py = y + rng.next() * size;
    }
    g.globalAlpha = edge ? 0.5 + rng.next() * 0.5 : 0.15 + rng.next() * 0.35;
    g.beginPath();
    g.arc(px, py, (edge ? 0.5 : 0.3) + rng.next() * size * (edge ? 0.035 : 0.02), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  cache.set(key, c);
  return c;
}

/** 以中心点、旋转、缩放绘制印章 */
export function drawSeal(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, cx: number, cy: number, scale: number, rot: number, alpha: number): void {
  if (alpha <= 0.003) return;
  const s = (c.width / glyphs.dpr) * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.drawImage(c, -s / 2, -s / 2, s, s);
  ctx.restore();
}
