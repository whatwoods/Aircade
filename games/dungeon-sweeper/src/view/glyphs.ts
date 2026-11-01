import { type Sprite, makeCanvas, noiseTile, sprite } from './gfx';
import { NUMBER_TIERS, PAL } from './palette';

export const FONT_NUM = "'Cinzel', 'Trajan Pro', 'Times New Roman', serif";
export const FONT_DECO = "'Cinzel Decorative', 'Cinzel', 'Times New Roman', serif";
export const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

export interface GlyphOpts {
  recess?: boolean;
  glow?: string;
  glowBlur?: number;
  stroke?: string;
  strokeW?: number;
}

const DIGITS = new Int8Array(24);

/**
 * 预烘焙字形图集：每帧只 drawImage，不 fillText（文档 §4.3）。
 * 整数直接逐位绘制，不构造字符串。
 */
export class GlyphFont {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
  private dpr: number;
  private slotW: number;
  private H: number;
  private pad: number;
  private index = new Int16Array(128).fill(-1);
  private extra = new Map<number, number>();
  private adv: Float32Array;

  constructor(chars: string, weight: number, size: number, color: string, dpr: number, opts: GlyphOpts = {}, family = FONT_NUM) {
    this.size = size;
    this.dpr = dpr;
    const font = `${weight} ${size * dpr}px ${family}`;
    const [, mctx] = makeCanvas(4, 4);
    mctx.font = font;
    let maxW = 0;
    this.adv = new Float32Array(chars.length);
    for (let k = 0; k < chars.length; k++) {
      const w = mctx.measureText(chars[k]).width;
      this.adv[k] = w / dpr;
      if (w > maxW) maxW = w;
      const code = chars.charCodeAt(k);
      if (code < 128) this.index[code] = k;
      else this.extra.set(code, k);
    }
    const blur = (opts.glow ? (opts.glowBlur ?? 6) : 0) * dpr;
    this.pad = Math.ceil(4 * dpr + blur + (opts.strokeW ?? 0) * dpr);
    this.slotW = Math.ceil(maxW + this.pad * 2);
    this.H = Math.ceil(size * dpr * 1.5 + this.pad * 2);
    const asc = mctx.measureText('0').actualBoundingBoxAscent || size * dpr * 0.72;
    const [c, ctx] = makeCanvas(this.slotW * chars.length, this.H);
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const by = this.H / 2 + asc / 2;
    for (let k = 0; k < chars.length; k++) {
      const x = k * this.slotW + this.pad;
      const ch = chars[k];
      if (opts.recess) {
        ctx.fillStyle = 'rgba(20,13,9,0.92)';
        ctx.fillText(ch, x, by + 1.2 * dpr);
      }
      if (opts.stroke) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = opts.stroke;
        ctx.lineWidth = (opts.strokeW ?? 2) * dpr;
        ctx.strokeText(ch, x, by);
      }
      if (opts.glow) {
        ctx.shadowColor = opts.glow;
        ctx.shadowBlur = blur;
      }
      ctx.fillStyle = color;
      ctx.fillText(ch, x, by);
      ctx.shadowBlur = 0;
    }
    this.canvas = c;
  }

  private drawCode(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, sc: number): number {
    const p = this.pad / this.dpr;
    const sw = this.slotW / this.dpr;
    const h = this.H / this.dpr;
    ctx.drawImage(this.canvas, k * this.slotW, 0, this.slotW, this.H, x - p * sc, y - (h / 2) * sc, sw * sc, h * sc);
    return this.adv[k] * sc;
  }

  private slot(code: number): number {
    return code < 128 ? this.index[code] : (this.extra.get(code) ?? -1);
  }

  charW(code: number): number {
    const k = this.slot(code);
    return k >= 0 ? this.adv[k] : 0;
  }

  /** 将整数拆位写入 DIGITS，返回位数 */
  private split(v: number): number {
    let n = Math.abs(Math.floor(v));
    let len = 0;
    do {
      DIGITS[len++] = n % 10;
      n = Math.floor(n / 10);
    } while (n > 0 && len < 20);
    return len;
  }

  measureInt(v: number, commas = false, prefix = 0): number {
    const len = this.split(v);
    let w = 0;
    for (let i = 0; i < len; i++) w += this.adv[this.index[48 + DIGITS[i]]];
    if (commas) w += Math.floor((len - 1) / 3) * this.charW(44);
    if (prefix) w += this.charW(prefix);
    return w;
  }

  /** align: 0 左 / 0.5 中 / 1 右；y 为垂直中心；prefix 为字符码（如 '+'） */
  drawInt(ctx: CanvasRenderingContext2D, v: number, x: number, y: number, align = 0, commas = false, sc = 1, prefix = 0): number {
    const len = this.split(v);
    const total = this.measureInt(v, commas, prefix) * sc;
    let cx = x - total * align;
    if (prefix) {
      const k = this.slot(prefix);
      if (k >= 0) cx += this.drawCode(ctx, k, cx, y, sc);
    }
    for (let i = len - 1; i >= 0; i--) {
      cx += this.drawCode(ctx, this.index[48 + DIGITS[i]], cx, y, sc);
      if (commas && i > 0 && i % 3 === 0) {
        const k = this.index[44];
        if (k >= 0) cx += this.drawCode(ctx, k, cx, y, sc);
      }
    }
    return total;
  }

  /** a / b */
  drawFraction(ctx: CanvasRenderingContext2D, a: number, b: number, x: number, y: number, align = 0, sc = 1, gap = 3): number {
    const wa = this.measureInt(a);
    const ws = this.charW(47);
    const wb = this.measureInt(b);
    const total = (wa + ws + wb + gap * 2) * sc;
    let cx = x - total * align;
    this.drawInt(ctx, a, cx, y, 0, false, sc);
    cx += (wa + gap) * sc;
    const k = this.index[47];
    if (k >= 0) this.drawCode(ctx, k, cx, y, sc);
    cx += (ws + gap) * sc;
    this.drawInt(ctx, b, cx, y, 0, false, sc);
    return total;
  }

  /** mm:ss */
  drawTime(ctx: CanvasRenderingContext2D, sec: number, x: number, y: number, align = 0, sc = 1): number {
    const m = Math.min(99, Math.floor(sec / 60));
    const s = Math.floor(sec % 60);
    const dw = this.charW(48);
    const cw = this.charW(58);
    const total = (dw * 4 + cw) * sc;
    let cx = x - total * align;
    const d = (n: number) => {
      const k = this.index[48 + n];
      this.drawCode(ctx, k, cx + (dw - this.adv[k]) * 0.5 * sc, y, sc);
      cx += dw * sc;
    };
    d(Math.floor(m / 10));
    d(m % 10);
    const k = this.index[58];
    if (k >= 0) this.drawCode(ctx, k, cx, y, sc);
    cx += cw * sc;
    d(Math.floor(s / 10));
    d(s % 10);
    return total;
  }
}

/** 中文/任意文本的烘焙缓存（只在文本变化时生成） */
export class TextCache {
  private map = new Map<string, Sprite>();
  dpr = 1;
  get(text: string, size: number, color: string, weight = 600, family = FONT_CN, opts: GlyphOpts & { spacing?: number } = {}): Sprite {
    const key = `${text}|${size}|${color}|${weight}|${family}|${opts.glow ?? ''}|${opts.stroke ?? ''}|${opts.spacing ?? 0}`;
    let s = this.map.get(key);
    if (s) return s;
    if (this.map.size > 240) this.map.clear();
    const d = this.dpr;
    const font = `${weight} ${size * d}px ${family}`;
    const [, m] = makeCanvas(4, 4);
    m.font = font;
    const spacing = (opts.spacing ?? 0) * size * d;
    const w0 = m.measureText(text).width + spacing * Math.max(0, text.length - 1);
    const blur = (opts.glow ? (opts.glowBlur ?? 8) : 0) * d;
    const pad = Math.ceil(3 * d + blur + (opts.strokeW ?? 0) * d);
    s = sprite(w0 + pad * 2, size * d * 1.45 + pad * 2, (c, w, h) => {
      c.font = font;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      const draw = (fn: (t: string, x: number, y: number) => void) => {
        if (!spacing) fn(text, pad, h / 2);
        else {
          let x = pad;
          for (const ch of text) {
            fn(ch, x, h / 2);
            x += c.measureText(ch).width + spacing;
          }
        }
      };
      if (opts.recess) {
        c.fillStyle = 'rgba(20,13,9,0.9)';
        draw((t, x, y) => c.fillText(t, x, y + 1.2 * d));
      }
      if (opts.stroke) {
        c.lineJoin = 'round';
        c.strokeStyle = opts.stroke;
        c.lineWidth = (opts.strokeW ?? 2) * d;
        draw((t, x, y) => c.strokeText(t, x, y));
      }
      if (opts.glow) {
        c.shadowColor = opts.glow;
        c.shadowBlur = blur;
      }
      c.fillStyle = color;
      draw((t, x, y) => c.fillText(t, x, y));
      void w;
    });
    this.map.set(key, s);
    return s;
  }
  clear(): void {
    this.map.clear();
  }
}

/** 画缓存文本：x,y 为锚点（align 0/0.5/1），y 为垂直中心 */
export function drawText(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, align = 0.5, dpr = 1, sc = 1): void {
  const w = (s.w / dpr) * sc;
  const h = (s.h / dpr) * sc;
  ctx.drawImage(s.c, x - w * align, y - h / 2, w, h);
}

/**
 * 棋盘数字与粉笔标记图集。
 */
export class Glyphs {
  dpr = 1;
  cell = 0;
  /** [tier][size]：size 0 = 一位数，1 = 两位数，2 = 道具角标 */
  num: GlyphFont[][] = [];
  /** 粉笔数字 [1..9][variant]，致命版 */
  chalk: Sprite[][] = [];
  chalkLethal: Sprite[][] = [];
  chalkQ: Sprite[] = [];
  chalkSafe: Sprite[] = [];
  runeDot!: Sprite;
  /** 剪影旁的等级徽章文字 Lv1..Lv9 */
  lvBadge: Sprite[] = [];
  // HUD
  hp!: GlyphFont;
  score!: GlyphFont;
  time!: GlyphFont;
  level!: GlyphFont;
  small!: GlyphFont;
  roster!: GlyphFont;
  dmg!: GlyphFont;
  heal!: GlyphFont;
  gold!: GlyphFont;
  xpGold!: GlyphFont;
  badgeLv!: GlyphFont;
  text = new TextCache();
  private grain: HTMLCanvasElement;

  constructor() {
    this.grain = noiseTile(64, 0xc4a1, 2.4);
  }

  bake(cell: number, s: number, dpr: number): void {
    this.cell = cell;
    this.dpr = dpr;
    this.text.dpr = dpr;
    this.text.clear();
    const k = cell / 40;
    this.num = NUMBER_TIERS.map((col, t) => {
      const o: GlyphOpts = { recess: true };
      if (t === 4) {
        o.glow = 'rgba(255,77,61,0.85)';
        o.glowBlur = 5;
      } else if (t === 3) {
        o.glow = 'rgba(255,122,26,0.55)';
        o.glowBlur = 4;
      }
      return [
        new GlyphFont('0123456789', 800, Math.round(22 * k), col, dpr, o),
        new GlyphFont('0123456789', 800, Math.round(18 * k), col, dpr, o),
        new GlyphFont('0123456789', 800, Math.max(9, Math.round(11 * k)), col, dpr, o),
      ];
    });
    this.chalk = [[]];
    this.chalkLethal = [[]];
    for (let d = 1; d <= 9; d++) {
      this.chalk.push([this.bakeChalk(String(d), PAL.chalk, 0, 1), this.bakeChalk(String(d), PAL.chalk, 1, 1)]);
      this.chalkLethal.push([this.bakeChalk(String(d), PAL.lethal, 0, 1), this.bakeChalk(String(d), PAL.lethal, 1, 1)]);
    }
    this.chalkQ = [this.bakeChalk('?', PAL.chalk, 0, 0.75), this.bakeChalk('?', PAL.chalk, 1, 0.75)];
    this.chalkSafe = [this.bakeCircle(0), this.bakeCircle(1)];
    const px = Math.round(cell * dpr);
    this.runeDot = sprite(px, px, (c, w) => {
      const m = w / 2;
      c.strokeStyle = 'rgba(233,220,192,0.16)';
      c.lineWidth = 1 * dpr;
      c.beginPath();
      c.moveTo(m, m - 3 * k * dpr);
      c.lineTo(m + 3 * k * dpr, m);
      c.lineTo(m, m + 3 * k * dpr);
      c.lineTo(m - 3 * k * dpr, m);
      c.closePath();
      c.stroke();
      c.fillStyle = 'rgba(233,220,192,0.22)';
      c.beginPath();
      c.arc(m, m, 0.9 * k * dpr, 0, Math.PI * 2);
      c.fill();
    });
    this.lvBadge = [];
    for (let l = 0; l <= 9; l++) this.lvBadge.push(this.text.get(`Lv${l}`, 11, PAL.gold, 700, "'Cinzel', serif"));
    // HUD 字体
    const S = (v: number) => Math.round(v * s * 10) / 10;
    this.hp = new GlyphFont('0123456789/ ', 700, S(15), PAL.parchment, dpr, { stroke: 'rgba(20,6,8,0.85)', strokeW: 2.5 });
    this.score = new GlyphFont('0123456789,+', 700, S(18), PAL.gold, dpr, { glow: 'rgba(255,181,74,0.35)', glowBlur: 6 });
    this.time = new GlyphFont('0123456789:', 600, S(15), PAL.parchment, dpr);
    this.level = new GlyphFont('0123456789', 900, S(26), '#FFE9C2', dpr, { stroke: 'rgba(30,18,8,0.9)', strokeW: 3, glow: 'rgba(255,181,74,0.5)', glowBlur: 6 });
    this.small = new GlyphFont('0123456789/', 700, S(11), PAL.ash, dpr);
    this.roster = new GlyphFont('0123456789×', 700, S(13), PAL.parchment, dpr);
    this.dmg = new GlyphFont('0123456789−+', 900, S(22), PAL.blood, dpr, { stroke: '#FFF4F0', strokeW: 3 });
    this.heal = new GlyphFont('0123456789+', 900, S(22), PAL.mint, dpr, { stroke: '#06140E', strokeW: 3 });
    this.gold = new GlyphFont('0123456789+,', 800, S(18), PAL.gold, dpr, { stroke: 'rgba(40,24,6,0.95)', strokeW: 3, glow: 'rgba(255,181,74,0.5)', glowBlur: 5 });
    this.xpGold = new GlyphFont('0123456789+', 700, S(13), '#FFE9A8', dpr, { stroke: 'rgba(40,24,6,0.9)', strokeW: 2.5 });
    this.badgeLv = new GlyphFont('LV', 700, S(10), PAL.ash, dpr);
  }

  private bakeChalk(ch: string, color: string, variant: number, alpha: number): Sprite {
    const d = this.dpr;
    const px = Math.round(this.cell * d);
    const k = this.cell / 40;
    return sprite(px, px, (c, w) => {
      c.globalAlpha = alpha;
      c.translate(w / 2, w / 2);
      c.rotate(variant ? 0.09 : -0.07);
      c.font = `600 ${Math.round(23 * k * d)}px ${FONT_NUM}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = color === PAL.lethal ? 'rgba(255,77,77,0.7)' : 'rgba(220,227,234,0.55)';
      c.shadowBlur = 5 * d;
      c.fillStyle = color;
      const dx = variant ? 0.8 * k * d : -0.6 * k * d;
      c.fillText(ch, dx, -2 * k * d);
      c.shadowBlur = 0;
      // 粉笔下划弧线
      if (ch !== '?') {
        c.strokeStyle = color;
        c.lineWidth = 1.6 * k * d;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-8 * k * d, 11 * k * d);
        c.quadraticCurveTo(0, (variant ? 14 : 13) * k * d, 8 * k * d, 10 * k * d);
        c.stroke();
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      // 粉笔颗粒
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-out';
      const pat = c.createPattern(this.grain, 'repeat');
      if (pat) {
        c.fillStyle = pat;
        c.translate(variant * 17, variant * 23);
        c.fillRect(-40, -40, w + 80, w + 80);
      }
    });
  }

  private bakeCircle(variant: number): Sprite {
    const d = this.dpr;
    const px = Math.round(this.cell * d);
    const k = this.cell / 40;
    return sprite(px, px, (c, w) => {
      const m = w / 2;
      c.strokeStyle = PAL.mint;
      c.lineWidth = 2.2 * k * d;
      c.lineCap = 'round';
      c.shadowColor = 'rgba(127,224,176,0.6)';
      c.shadowBlur = 5 * d;
      c.beginPath();
      const r = 9.5 * k * d;
      for (let t = 0; t <= 1.08; t += 0.04) {
        const a = -Math.PI / 2 + t * Math.PI * 2 + (variant ? 0.4 : 0);
        const rr = r * (1 + 0.06 * Math.sin(t * 9 + variant));
        const x = m + Math.cos(a) * rr;
        const y = m + Math.sin(a) * rr * 0.94;
        if (t === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.shadowBlur = 0;
      c.globalCompositeOperation = 'destination-out';
      const pat = c.createPattern(this.grain, 'repeat');
      if (pat) {
        c.fillStyle = pat;
        c.fillRect(0, 0, w, w);
      }
    });
  }
}
