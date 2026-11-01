/**
 * 字形缓存（§2.4）：每个「字 × 字号 × 颜色」渲染一次到离屏画布，之后只 drawImage。
 * 字体就绪 / DPR 变化时清空重建（按需惰性生成）。
 * 调试模式下，画到画布上的字若不在打包子集里会报错（与构建期 check-dist 互补）。
 */
import charset from '../assets/fonts/charset.json';

export const KAI_STACK = `HMKai, "Kaiti SC", STKaiti, KaiTi, BiauKai, "AR PL UKai CN", "Noto Serif CJK SC", serif`;
export const LOGO_STACK = `HMLogo, HMKai, "Kaiti SC", STKaiti, KaiTi, serif`;
export const BODY_STACK = `"Kaiti SC", STKaiti, KaiTi, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;

export const INK = {
  ink: '#16130F',
  ink2: '#2E2822',
  light: '#6E665C',
  wash: '#A99F92',
  red: '#B8312A',
  redHi: '#D4493B',
  redLo: '#8C221C',
  paper: '#F8F3E8',
  ochre: '#A77A43',
  jade: '#5F7F6A',
} as const;

type FontKind = 'kai' | 'logo';
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const KAI_SET = new Set<string>([...(charset as { kaiChars?: string }).kaiChars ?? '']);
const LOGO_SET = new Set<string>([...(charset as { logoChars?: string }).logoChars ?? '']);
let reported = new Set<string>();
export let checkGlyphs = false;
export function setGlyphCheck(on: boolean): void {
  checkGlyphs = on;
}

/** 字符是否在打包子集里（调试 / 自动化审计用） */
export function inSubset(ch: string, font: FontKind = 'kai'): boolean {
  if (ch === ' ' || ch === '　') return true;
  return font === 'logo' ? LOGO_SET.has(ch) : KAI_SET.has(ch);
}

export interface Ink {
  /** 墨迹包围盒，相对字心、以字号为单位 */
  l: number;
  r: number;
  t: number;
  b: number;
}

class GlyphCache {
  /** 两级缓存：组合（颜色 × 字号 × 描边 × 字体 × 类型）的数字键 → 字 → 画布；查找不产生新字符串 */
  private map = new Map<number, Map<string, HTMLCanvasElement>>();
  private colors = new Map<string, number>();
  private combo(color: string, size: number, stroke: number, font: FontKind, label: number): Map<string, HTMLCanvasElement> {
    let ci = this.colors.get(color);
    if (ci === undefined) {
      ci = this.colors.size + 1;
      this.colors.set(color, ci);
    }
    const k = ((ci * 512 + Math.round(size * 4)) * 16 + stroke * 4) * 4 + (font === 'logo' ? 2 : 0) + label;
    let m = this.map.get(k);
    if (!m) {
      m = new Map();
      this.map.set(k, m);
    }
    return m;
  }
  private inkMap = new Map<string, Ink>();
  private mctx: CanvasRenderingContext2D | null = null;
  dpr = 2;
  /** 字体就绪后递增；用于让其他缓存（棋盘静态层等）知道需要重绘 */
  version = 0;

  reset(dpr = this.dpr): void {
    this.map.clear();
    this.inkMap.clear();
    this.dpr = dpr;
    this.version++;
  }

  get(ch: string, size: number, color: string, font: FontKind = 'kai', stroke = 0): HTMLCanvasElement {
    const bucket = this.combo(color, size, stroke, font, 0);
    let c = bucket.get(ch);
    if (c) return c;
    if (checkGlyphs && !inSubset(ch, font) && !reported.has(font + ch)) {
      reported.add(font + ch);
      console.error(`[glyphs] 「${ch}」不在 ${font} 字体子集中`);
    }
    const pad = Math.ceil(size * 0.18) + stroke;
    const box = size + pad * 2;
    c = document.createElement('canvas');
    c.width = Math.ceil(box * this.dpr);
    c.height = Math.ceil(box * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.font = `${size}px ${font === 'logo' ? LOGO_STACK : KAI_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (stroke) {
      // 描红：朱色空心描边 + 极淡填充
      g.lineJoin = 'round';
      g.strokeStyle = color;
      g.lineWidth = stroke;
      g.globalAlpha = 0.9;
      g.strokeText(ch, box / 2, box / 2 + size * 0.04);
      g.globalAlpha = 0.12;
      g.fillStyle = color;
      g.fillText(ch, box / 2, box / 2 + size * 0.04);
    } else {
      g.fillStyle = color;
      g.fillText(ch, box / 2, box / 2 + size * 0.04);
    }
    bucket.set(ch, c);
    return c;
  }

  /** 一行文字（拼音、数字、短标签）缓存，宽度随文字。align: 0 左 / 0.5 中 / 1 右 */
  label(
    ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color: string,
    align = 0.5, alpha = 1, font: FontKind = 'kai', spacing = 0,
  ): number {
    if (!str) return 0;
    const bucket = this.combo(color, size, spacing, font, 1);
    let c = bucket.get(str);
    if (!c) {
      if (checkGlyphs) for (const ch of str) if (!inSubset(ch, font) && !reported.has(font + ch)) {
        reported.add(font + ch);
        console.error(`[glyphs] 「${ch}」不在 ${font} 字体子集中（${str}）`);
      }
      if (!this.mctx) this.mctx = document.createElement('canvas').getContext('2d')!;
      const f = `${size}px ${font === 'logo' ? LOGO_STACK : KAI_STACK}`;
      this.mctx.font = f;
      const chars = [...str];
      const w = Math.ceil(this.mctx.measureText(str).width + spacing * (chars.length - 1)) + 4;
      const h = Math.ceil(size * 1.5);
      c = document.createElement('canvas');
      c.width = Math.ceil(w * this.dpr);
      c.height = Math.ceil(h * this.dpr);
      const g = c.getContext('2d')!;
      g.scale(this.dpr, this.dpr);
      g.font = f;
      g.fillStyle = color;
      g.textBaseline = 'middle';
      if (spacing) {
        let xx = 2;
        for (const ch of chars) {
          g.fillText(ch, xx, h / 2);
          xx += this.mctx.measureText(ch).width + spacing;
        }
      } else g.fillText(str, 2, h / 2);
      bucket.set(str, c);
    }
    const w = c.width / this.dpr;
    const h = c.height / this.dpr;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(c, x - w * align, y - h / 2, w, h);
    ctx.globalAlpha = prev;
    return w - 4;
  }

  /** 画整数（逐位取字形缓存，不产生新字符串）；align: 0 左 / 0.5 中 / 1 右；返回宽度 */
  number(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, size: number, color: string, align = 1, alpha = 1, prefix = ''): number {
    n = Math.max(0, Math.round(n));
    let digits = 1;
    for (let v = n; v >= 10; v = Math.floor(v / 10)) digits++;
    const adv = size * 0.56;
    const pw = prefix === '+' || prefix === '−' ? adv : 0;
    const w = digits * adv + pw;
    let left = x - w * align;
    if (pw) {
      this.draw(ctx, prefix, left + adv / 2, y, size, color, alpha);
      left += pw;
    }
    let v = n;
    for (let i = digits - 1; i >= 0; i--) {
      const d = v % 10;
      v = Math.floor(v / 10);
      this.draw(ctx, DIGITS[d], left + i * adv + adv / 2, y, size, color, alpha);
    }
    return w;
  }

  /** 字的墨迹包围盒（measureText，随当前生效的字体变化） */
  ink(ch: string): Ink {
    const hit = this.inkMap.get(ch);
    if (hit) return hit;
    if (!this.mctx) this.mctx = document.createElement('canvas').getContext('2d')!;
    const g = this.mctx;
    g.font = `100px ${KAI_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const m = g.measureText(ch);
    const dy = 4; // 与 get() 里的基线偏移 size*0.04 一致
    let v: Ink = {
      l: -(m.actualBoundingBoxLeft ?? 46) / 100,
      r: (m.actualBoundingBoxRight ?? 46) / 100,
      t: (-(m.actualBoundingBoxAscent ?? 46) + dy) / 100,
      b: ((m.actualBoundingBoxDescent ?? 46) + dy) / 100,
    };
    if (!(v.r - v.l > 0.02) || !(v.b - v.t > 0.02)) v = { l: -0.46, r: 0.46, t: -0.46, b: 0.46 };
    this.inkMap.set(ch, v);
    return v;
  }

  /**
   * 把字的墨迹包围盒映射进目标矩形 (x, y, w, h)；ratio 限制非等比压扁的程度。
   */
  drawFit(
    ctx: CanvasRenderingContext2D, ch: string, size: number, color: string,
    x: number, y: number, w: number, h: number, alpha = 1, maxRatio = 2.6,
  ): void {
    if (alpha <= 0.003 || w <= 0.5 || h <= 0.5) return;
    const k = this.ink(ch);
    const iw = (k.r - k.l) * size;
    const ih = (k.b - k.t) * size;
    let sx = w / iw;
    let sy = h / ih;
    // 细长部件（亻、氵）不要被横向拉得过宽
    if (sx / sy > maxRatio) sx = sy * maxRatio;
    if (sy / sx > maxRatio) sy = sx * maxRatio;
    const c = this.get(ch, size, color);
    const box = c.width / this.dpr;
    // 墨迹中心在缓存画布中的位置
    const icx = box / 2 + ((k.l + k.r) / 2) * size;
    const icy = box / 2 + ((k.t + k.b) / 2) * size;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(c, x + w / 2 - icx * sx, y + h / 2 - icy * sy, box * sx, box * sy);
    ctx.globalAlpha = prev;
  }

  /**
   * 以 (cx, cy) 为中心画字；w/h 为目标框（默认 size×size），可以压扁（竹字头、羊字头等无独立码位的变体）。
   */
  draw(
    ctx: CanvasRenderingContext2D, ch: string, cx: number, cy: number, size: number, color: string,
    alpha = 1, w = size, h = size, font: FontKind = 'kai', stroke = 0,
  ): void {
    if (alpha <= 0.003 || w <= 0.5 || h <= 0.5) return;
    const c = this.get(ch, size, color, font, stroke);
    const box = c.width / this.dpr;
    const sx = w / size;
    const sy = h / size;
    const dw = box * sx;
    const dh = box * sy;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(c, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.globalAlpha = prev;
  }
}

export const glyphs = new GlyphCache();

/** 等待打包字体加载（最多 timeoutMs），之后重建缓存。返回是否成功加载 */
export async function waitFonts(timeoutMs: number): Promise<boolean> {
  if (!document.fonts || typeof document.fonts.load !== 'function') return false;
  const load = Promise.all([document.fonts.load('40px HMKai', '林'), document.fonts.load('40px HMLogo', '造')])
    .then((r) => r[0].length > 0)
    .catch(() => false);
  const timeout = new Promise<boolean>((res) => setTimeout(() => res(false), timeoutMs));
  return Promise.race([load, timeout]);
}

export function resetReported(): void {
  reported = new Set();
}
