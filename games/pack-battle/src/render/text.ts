// 字体栈、文字绘制、离屏画布工具
import { yoolaFamily } from '../platform/yoola/fonts.ts';
import { kw } from '../platform/yoola/kwai.ts';
import { patch2d } from '../platform/yoola/render.ts';
import { pxRatio, stage } from './stage.ts';

export const CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Zen Hei",sans-serif';
export const HAND = (__YOOLA__ ? yoolaFamily('hand') : '"Patrick Hand"') + ',' + CN;
export const LOGO = (__YOOLA__ ? yoolaFamily('logo') : '"Kalam"') + ',' + CN;
/** 标题毛笔字：只含「行囊对决」四字，别的字会落到系统字体 */
export const BRUSH = (__YOOLA__ ? yoolaFamily('brush') : '"Title Brush"') + ',' + CN;

const fontCache = new Map<string, string>();
export function font(size: number, weight: number | string = 400, family = CN): string {
  const k = size + '|' + weight + '|' + family;
  let f = fontCache.get(k);
  if (!f) {
    f = `${weight} ${size}px ${family}`;
    fontCache.set(k, f);
  }
  return f;
}

export interface TextOpts {
  size?: number;
  weight?: number | string;
  family?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  stroke?: string;
  strokeW?: number;
  spacing?: number;
  alpha?: number;
  /** 投影（偏移 x,y 和颜色） */
  shadow?: [number, number, string];
  maxW?: number;
}

type LS = CanvasRenderingContext2D & { letterSpacing?: string };
const spacingStr = new Map<number, string>();

/**
 * 主画布上的文字走缓存：同一段文字连续画到第 2 帧起，就光栅化成小精灵，之后每帧只 drawImage。
 * 原生画布（快手）上 fillText / strokeText 很贵，一帧四五十段文字是主要开销；浏览器里也省。
 * 每帧都在变的文字（滚动数字等）达不到第 2 次命中，照旧直接画，不会反复建画布。
 */
const textCache = new Map<string, Sprite | number>();
let textVer = -1;
const TEXT_CACHE_MAX = 500;
let measureCtx: CanvasRenderingContext2D | null = null;

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): void {
  if (ctx === stage.ctx && s && (!o.baseline || o.baseline === 'middle')) {
    if (textVer !== stage.version) {
      textCache.clear();
      textVer = stage.version;
    }
    const key = s + '\u0001' + (o.size ?? 14) + '|' + (o.weight ?? 400) + '|' + (o.family ?? CN) + '|' + (o.color ?? '') + '|' + (o.align ?? 'center') + '|' +
      (o.stroke ?? '') + '|' + (o.strokeW ?? 3) + '|' + (o.spacing ?? 0) + '|' + (o.maxW ?? 0) + '|' + (o.shadow ? o.shadow.join(',') : '');
    const hit = textCache.get(key);
    if (hit === undefined) {
      if (textCache.size >= TEXT_CACHE_MAX) textCache.clear();
      textCache.set(key, 1);
    } else {
      const sp = typeof hit === 'number' ? buildText(key, s, o) : hit;
      const a0 = ctx.globalAlpha;
      if (o.alpha !== undefined) ctx.globalAlpha = a0 * o.alpha;
      const al = o.align ?? 'center';
      const ax = al === 'left' || al === 'start' ? sp.pad : al === 'right' || al === 'end' ? sp.w + sp.pad : sp.w / 2 + sp.pad;
      ctx.drawImage(sp.c, x - ax, y - (sp.h / 2 + sp.pad), sp.w + sp.pad * 2, sp.h + sp.pad * 2);
      ctx.globalAlpha = a0;
      return;
    }
  }
  drawText(ctx, s, x, y, o);
}

function buildText(key: string, s: string, o: TextOpts): Sprite {
  if (!measureCtx) measureCtx = makeCanvas(1, 1)[1];
  const size = o.size ?? 14;
  measureCtx.font = font(size, o.weight ?? 400, o.family ?? CN);
  const lm = measureCtx as LS;
  if (o.spacing) lm.letterSpacing = o.spacing + 'px';
  let w = measureCtx.measureText(s).width;
  if (o.spacing) lm.letterSpacing = '0px';
  if (o.maxW !== undefined) w = Math.min(w, o.maxW);
  const sw = o.stroke ? (o.strokeW ?? 3) : 0;
  const sh = o.shadow ? Math.max(Math.abs(o.shadow[0]), Math.abs(o.shadow[1])) : 0;
  const pad = Math.ceil(sw / 2 + sh + 2);
  const h = Math.ceil(size * 1.5);
  const al = o.align ?? 'center';
  const ax = al === 'left' || al === 'start' ? 0 : al === 'right' || al === 'end' ? w : w / 2;
  const sp = sprite(w, h, pxRatio(), pad, (c) => drawText(c, s, ax, h / 2, { ...o, alpha: undefined, baseline: 'middle' }));
  textCache.set(key, sp);
  return sp;
}

function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts): void {
  ctx.font = font(o.size ?? 14, o.weight ?? 400, o.family ?? CN);
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  const sp = o.spacing ?? 0;
  const lctx = ctx as LS;
  if (sp) {
    let v = spacingStr.get(sp);
    if (!v) spacingStr.set(sp, (v = sp + 'px'));
    lctx.letterSpacing = v;
  }
  const a0 = ctx.globalAlpha;
  if (o.alpha !== undefined) ctx.globalAlpha = a0 * o.alpha;
  if (o.shadow) {
    ctx.fillStyle = o.shadow[2];
    if (o.stroke) {
      ctx.lineWidth = o.strokeW ?? 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = o.shadow[2];
      ctx.strokeText(s, x + o.shadow[0], y + o.shadow[1], o.maxW);
    }
    ctx.fillText(s, x + o.shadow[0], y + o.shadow[1], o.maxW);
  }
  if (o.stroke) {
    ctx.lineWidth = o.strokeW ?? 3;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(s, x, y, o.maxW);
  }
  ctx.fillStyle = o.color ?? '#2b1d14';
  ctx.fillText(s, x, y, o.maxW);
  if (sp) lctx.letterSpacing = '0px';
  ctx.globalAlpha = a0;
}

export function measure(ctx: CanvasRenderingContext2D, s: string, size: number, weight: number | string = 400, family = CN): number {
  ctx.font = font(size, weight, family);
  return ctx.measureText(s).width;
}

/** 数字 → 字符串缓存（减少每帧字符串分配） */
const numCache = new Map<number, string>();
export function num(n: number): string {
  let s = numCache.get(n);
  if (s === undefined) {
    s = String(n);
    if (numCache.size < 4000) numCache.set(n, s);
  }
  return s;
}

const strCache = new Map<string, string>();
/** 组合字符串缓存：key 相同就复用 */
export function cstr(key: string): string {
  let s = strCache.get(key);
  if (s === undefined) {
    s = key;
    if (strCache.size < 2000) strCache.set(key, s);
  }
  return s;
}

/** 新建空离屏画布：快手端走 KwaiRender 的离屏画布 */
export function newCanvas(): HTMLCanvasElement {
  if (!__YOOLA__) return document.createElement('canvas');
  const c = kw().KwaiRender.createOffscreenCanvas(1, 1);
  patch2d(c.getContext('2d')); // 离屏画布全是 2D，先取一次顺便补上缺的方法
  return c;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = newCanvas();
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export interface Sprite {
  c: HTMLCanvasElement;
  /** 逻辑尺寸（不含 pad） */
  w: number;
  h: number;
  pad: number;
}

/** 按逻辑尺寸生成精灵（内部分辨率 = ratio 倍） */
export function sprite(w: number, h: number, ratio: number, pad: number, draw: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const [c, ctx] = makeCanvas((w + pad * 2) * ratio, (h + pad * 2) * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, pad * ratio, pad * ratio);
  draw(ctx);
  return { c, w, h, pad };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1): void {
  ctx.drawImage(s.c, x - s.pad * scale, y - s.pad * scale, (s.w + s.pad * 2) * scale, (s.h + s.pad * 2) * scale);
}

/** 带键缓存 */
export class SpriteCache {
  private m = new Map<string, Sprite>();
  private ver = -1;
  get(key: string, ver: number, make: () => Sprite): Sprite {
    if (ver !== this.ver) {
      this.m.clear();
      this.ver = ver;
    }
    let s = this.m.get(key);
    if (!s) {
      s = make();
      this.m.set(key, s);
    }
    return s;
  }
  clear(): void {
    this.m.clear();
  }
  get size(): number {
    return this.m.size;
  }
}

/** 文字自动换行（按字符） */
export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number, size: number, weight: number | string = 400, family = CN): string[] {
  ctx.font = font(size, weight, family);
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const ch of para) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = ch;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
