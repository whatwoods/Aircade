/** 牌面绘制（§6.4）：部件牌 / 字牌 / 未成牌。纸牌底预渲染，字走字形缓存。 */
import { BASE_MAP, RECIPE_MAP } from '../core/recipes.ts';
import type { Tile } from '../core/types.ts';
import { pendingBoxes } from './compose.ts';
import { INK, glyphs } from './glyphs.ts';
import { drawSeal, seal } from './seal.ts';

export const TILE = 62;
export const GLYPH_BASE = 40;
export const GLYPH_CHAR = 44;

let card: HTMLCanvasElement | null = null;
let cardVer = -1;
let cardHi: HTMLCanvasElement | null = null;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function makeCard(dpr: number, lifted: boolean): HTMLCanvasElement {
  const pad = 12;
  const S = TILE + pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.ceil(S * dpr);
  c.height = Math.ceil(S * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.shadowColor = lifted ? 'rgba(60,40,20,0.22)' : 'rgba(60,40,20,0.14)';
  g.shadowBlur = lifted ? 12 : 3;
  g.shadowOffsetY = lifted ? 6 : 2;
  roundRect(g, pad, pad, TILE, TILE, 6);
  g.fillStyle = '#F9F5EC';
  g.fill();
  g.shadowColor = 'transparent';
  const grd = g.createLinearGradient(0, pad, 0, pad + TILE);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(214,199,170,0.18)');
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = 'rgba(167,122,67,0.28)';
  g.lineWidth = 1;
  roundRect(g, pad + 0.5, pad + 0.5, TILE - 1, TILE - 1, 5.5);
  g.stroke();
  return c;
}

function ensureCards(): void {
  if (card && cardVer === glyphs.version) return;
  card = makeCard(glyphs.dpr, false);
  cardHi = makeCard(glyphs.dpr, true);
  cardVer = glyphs.version;
}

export interface TileOpts {
  scale: number;
  alpha: number;
  /** 0..1 抬起（阴影变大） */
  lift: number;
  pinyin: boolean;
  method: boolean;
  /** 0..1 褪成清墨（墨尽） */
  fade: number;
  /** 秒，用于未成牌虚线呼吸 */
  time: number;
  /** 0..1 字形透明度（合成时部件淡出） */
  glyphAlpha: number;
  /** 墨润（待机）0..1 */
  bloom: number;
}

export const defaultOpts = (): TileOpts => ({ scale: 1, alpha: 1, lift: 0, pinyin: true, method: true, fade: 0, time: 0, glyphAlpha: 1, bloom: 0 });

export function drawCard(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, alpha: number, lift: number, sx = 1, sy = 1): void {
  ensureCards();
  const c = lift > 0.5 ? cardHi! : card!;
  const S = c.width / glyphs.dpr;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  const w = S * scale * sx;
  const h = S * scale * sy;
  ctx.drawImage(c, cx - w / 2, cy - h / 2 + lift * 2, w, h);
  ctx.globalAlpha = prev;
}

export function variantMark(ch: string): string {
  const v = BASE_MAP.get(ch)?.v;
  if (!v) return '';
  for (const k of ['l', 't', 'b', 'r'] as const) if (v[k]) return v[k]!;
  return '';
}

const METHOD_SHORT: Record<string, string> = { 会意: '会', 形声: '形', 指事: '指' };

/** 画一张牌的字面（不含牌底） */
export function drawFace(ctx: CanvasRenderingContext2D, t: Pick<Tile, 'kind' | 'ch' | 'parts'>, cx: number, cy: number, o: TileOpts): void {
  const s = o.scale;
  const fadeCol = o.fade > 0.5;
  const a = o.alpha * o.glyphAlpha;
  if (t.kind === 'base') {
    const col = fadeCol ? INK.wash : INK.light;
    glyphs.draw(ctx, t.ch, cx, cy, GLYPH_BASE, col, a, GLYPH_BASE * s, GLYPH_BASE * s);
    const vm = variantMark(t.ch);
    if (vm) glyphs.draw(ctx, vm, cx - 21 * s, cy - 20 * s, 12, INK.red, a * 0.9, 12 * s, 12 * s);
  } else if (t.kind === 'char') {
    const col = fadeCol ? INK.wash : INK.ink;
    const py = o.pinyin;
    const gy = cy - (py ? 5 : 0) * s;
    if (o.bloom > 0) glyphs.draw(ctx, t.ch, gy === cy ? cx : cx, gy, GLYPH_CHAR, INK.wash, a * o.bloom * 0.5, GLYPH_CHAR * s * 1.06, GLYPH_CHAR * s * 1.06);
    glyphs.draw(ctx, t.ch, cx, gy, GLYPH_CHAR, col, a, GLYPH_CHAR * s, GLYPH_CHAR * s);
    const r = RECIPE_MAP.get(t.ch);
    if (r && py) glyphs.label(ctx, r.py, cx, cy + 23 * s, 11, INK.light, 0.5, a * 0.95);
    if (r && o.method && s > 0.6) {
      const m = seal(METHOD_SHORT[r.t], 11, 'white', 'kai', 5);
      drawSeal(ctx, m, cx - 23 * s, cy + 23 * s, s, 0, a * 0.85);
    }
  } else {
    // 未成：两部件按最终位置 70% 淡墨 + 呼吸的朱色虚线框 + 「未成」小印
    const parts = t.parts ?? [];
    const target = pendingTarget(parts);
    const boxes = target ? pendingBoxes(parts, target) : [];
    const F = GLYPH_CHAR * 0.7 * s;
    const x0 = cx - F / 2;
    const y0 = cy - F / 2 - 2 * s;
    for (const b of boxes) glyphs.drawFit(ctx, b.show, GLYPH_CHAR, fadeCol ? INK.wash : INK.light, x0 + b.x * F, y0 + b.y * F, b.w * F, b.h * F, a);
    const breath = 0.6 + 0.2 * Math.sin((o.time / 1.6) * Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = o.alpha * breath;
    ctx.strokeStyle = INK.red;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    roundRect(ctx, cx - 27 * s, cy - 27 * s, 54 * s, 54 * s, 4 * s);
    ctx.stroke();
    ctx.restore();
    const m = seal('未成', 15, 'white', 'kai', 9);
    drawSeal(ctx, m, cx + 21 * s, cy + 21 * s, s, 0.05, o.alpha * 0.9);
  }
}

/** 未成牌对应的目标字（三部件配方里包含这两个部件的第一个） */
const pendCache = new Map<string, string>();
export function pendingTarget(parts: string[]): string {
  const k = [...parts].sort().join('');
  const hit = pendCache.get(k);
  if (hit !== undefined) return hit;
  let res = '';
  for (const r of RECIPE_MAP.values()) {
    if (r.parts.length !== 3) continue;
    const rest = [...r.parts];
    let ok = true;
    for (const p of parts) {
      const i = rest.indexOf(p);
      if (i < 0) {
        ok = false;
        break;
      }
      rest.splice(i, 1);
    }
    if (ok) {
      res = r.c;
      break;
    }
  }
  pendCache.set(k, res);
  return res;
}

export function drawTile(ctx: CanvasRenderingContext2D, t: Pick<Tile, 'kind' | 'ch' | 'parts'>, cx: number, cy: number, o: TileOpts): void {
  drawCard(ctx, cx, cy, o.scale, o.alpha * (1 - o.fade * 0.5), o.lift);
  drawFace(ctx, t, cx, cy, o);
}

export { roundRect };
