// 字体栈、文字绘制、离屏画布工具
export const CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Zen Hei",sans-serif';
export const HAND = '"Patrick Hand",' + CN;
export const LOGO = '"Kalam",' + CN;

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

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}): void {
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

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
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
