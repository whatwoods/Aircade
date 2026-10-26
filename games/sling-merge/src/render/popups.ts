/**
 * 跳字与横幅（画布部分，docs §5.5 / §6.4）：糖果描边字、池化跳字、大横幅/顶部小横幅/新纪录小提示。
 */
import { CONFIG } from '../config';
import { ease } from '../core/math';
import { rrect } from './util';

export type TextStyle = 'white' | 'gold' | 'mint' | 'pink' | 'orange' | 'coral' | 'rose' | 'violet' | 'red';

const THICK: Record<TextStyle, string> = {
  white: '#FF8FAB',
  gold: '#F2A100',
  mint: '#36B08F',
  pink: '#E04C73',
  orange: '#E8901A',
  coral: '#E0573A',
  rose: '#D63A72',
  violet: '#8A3FE0',
  red: '#C21E3C',
};
const FILL: Record<TextStyle, string> = {
  white: '#FFFFFF',
  gold: '#FFD84F',
  mint: '#FFFFFF',
  pink: '#FFFFFF',
  orange: '#FFFFFF',
  coral: '#FFFFFF',
  rose: '#FFFFFF',
  violet: '#FFFFFF',
  red: '#FFFFFF',
};
const PLUM = '#5B3A5E';

const fontCache = new Map<number, string>();
export function font(size: number, weight = 700): string {
  const key = size * 10 + (weight === 600 ? 1 : 0);
  let f = fontCache.get(key);
  if (!f) {
    f = `${weight} ${size}px Fredoka, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    fontCache.set(key, f);
  }
  return f;
}

/** 糖果描边字：+3px 厚度层 → 梅子描边（0.14em）→ 填充 */
export function candyText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, style: TextStyle = 'white', fillOverride?: string | CanvasGradient): void {
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const sw = Math.max(2, size * 0.14) * 2;
  const th = Math.max(1.5, size * 0.08);
  ctx.strokeStyle = THICK[style];
  ctx.lineWidth = sw;
  ctx.strokeText(text, x, y + th);
  ctx.fillStyle = THICK[style];
  ctx.fillText(text, x, y + th);
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = sw;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillOverride ?? FILL[style];
  ctx.fillText(text, x, y);
}

const CAP = 24;
/** 罐内腔顶（盖子下沿） */
const POP_TOP = CONFIG.layout.jar.inner.T;

export class Popups {
  text: string[] = new Array<string>(CAP).fill('');
  sub: string[] = new Array<string>(CAP).fill('');
  x = new Float32Array(CAP);
  y = new Float32Array(CAP);
  t = new Float32Array(CAP).fill(99);
  dur = new Float32Array(CAP).fill(1);
  size = new Float32Array(CAP);
  style: TextStyle[] = new Array<TextStyle>(CAP).fill('white');
  private head = 0;

  // 大横幅
  bannerText = '';
  bannerT = 99;
  bannerDur = 2.2;
  bannerKind: 'gold' | 'mint' | 'pink' = 'gold';
  // 顶部小横幅
  topText = '';
  topT = 99;
  topDur = 1.6;
  topLevel = 0;
  // 新纪录小提示
  recordT = 99;

  clear(): void {
    this.t.fill(99);
    this.bannerT = 99;
    this.topT = 99;
    this.recordT = 99;
  }

  add(text: string, x: number, y: number, size: number, style: TextStyle, sub = '', dur = 0.8): void {
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    this.text[i] = text;
    this.sub[i] = sub;
    this.x[i] = Math.max(40, Math.min(350, x));
    // 水果往上浮、合成多发生在罐顶：起点压到盖子下方，保证整段上浮（36px）都在罐内、不钻到盖子和图鉴后面
    this.y[i] = Math.max(y, POP_TOP + 36 + size * 0.7);
    this.t[i] = 0;
    this.dur[i] = dur;
    this.size[i] = size;
    this.style[i] = style;
  }

  banner(text: string, kind: 'gold' | 'mint' | 'pink', dur = 2.2): void {
    this.bannerText = text;
    this.bannerKind = kind;
    this.bannerT = 0;
    this.bannerDur = dur;
  }

  top(text: string, level: number): void {
    this.topText = text;
    this.topLevel = level;
    this.topT = 0;
  }

  record(): void {
    this.recordT = 0;
  }

  update(dt: number, realDt: number): void {
    for (let i = 0; i < CAP; i++) if (this.t[i]! < this.dur[i]!) this.t[i] = this.t[i]! + dt;
    if (this.bannerT < this.bannerDur) this.bannerT += realDt;
    if (this.topT < this.topDur) this.topT += realDt;
    if (this.recordT < 1.5) this.recordT += realDt;
  }

  /** 世界层跳字 */
  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < CAP; i++) {
      const t = this.t[i]!;
      const dur = this.dur[i]!;
      if (t >= dur) continue;
      const k = t / dur;
      const pop = t < 0.16 ? ease.backOut(t / 0.16) : 1;
      const a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const y = this.y[i]! - 36 * ease.quadOut(k);
      const size = this.size[i]!;
      ctx.globalAlpha = Math.max(0, a);
      const x = this.x[i]!;
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      candyText(ctx, this.text[i]!, 0, 0, size, this.style[i]!);
      const sub = this.sub[i]!;
      if (sub) candyText(ctx, sub, 0, size * 0.72, 12, this.style[i]!);
      ctx.scale(1 / pop, 1 / pop);
      ctx.translate(-x, -y);
    }
    ctx.globalAlpha = 1;
  }

  /** HUD 层横幅 */
  drawBanners(ctx: CanvasRenderingContext2D, icon: (level: number, x: number, y: number, size: number) => void): void {
    if (this.bannerT < this.bannerDur) this.drawBig(ctx);
    if (this.topT < this.topDur) {
      const t = this.topT;
      const inK = Math.min(1, t / 0.3);
      const outK = t > this.topDur - 0.25 ? (t - (this.topDur - 0.25)) / 0.25 : 0;
      const y = 150 - 30 * (1 - ease.backOut(inK)) - 20 * outK;
      ctx.globalAlpha = Math.min(1, inK * 2) * (1 - outK);
      ctx.font = font(16);
      const tw = ctx.measureText(this.topText).width;
      const w = tw + 64;
      const x = 195 - w / 2;
      ctx.fillStyle = 'rgba(91,58,94,0.18)';
      ctx.beginPath();
      rrect(ctx, x, y - 18 + 3, w, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#FFF8F0';
      ctx.beginPath();
      rrect(ctx, x, y - 18, w, 36, 18);
      ctx.fill();
      ctx.strokeStyle = '#FFC93C';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      icon(this.topLevel, x + 22, y, 26);
      ctx.fillStyle = PLUM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.topText, x + 42, y + 1);
      ctx.globalAlpha = 1;
    }
    if (this.recordT < 1.5) {
      const t = this.recordT;
      const pop = t < 0.2 ? ease.backOut(t / 0.2) : 1;
      const a = t > 1.2 ? 1 - (t - 1.2) / 0.3 : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(195, 112);
      ctx.scale(pop, pop);
      candyText(ctx, '新纪录！', 0, 0, 16, 'gold');
      ctx.scale(1 / pop, 1 / pop);
      ctx.translate(-195, -112);
      ctx.globalAlpha = 1;
    }
  }

  private drawBig(ctx: CanvasRenderingContext2D): void {
    const t = this.bannerT;
    const dur = this.bannerDur;
    const inT = 0.5;
    const outT = 0.3;
    let x = 195;
    let a = 1;
    if (t < inT) x = -200 + (195 + 200) * ease.elasticOut(t / inT);
    else if (t > dur - outT) {
      const k = (t - (dur - outT)) / outT;
      x = 195 + 420 * ease.cubicIn(k);
      a = 1 - k * 0.5;
    }
    const y = 360;
    const w = 300;
    const h = 56;
    const kind = this.bannerKind;
    const main = kind === 'mint' ? '#5FD3B3' : '#FF6F91';
    const dark = kind === 'mint' ? '#36B08F' : '#E04C73';
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    // 折角
    ctx.fillStyle = dark;
    for (let si = 0; si < 2; si++) {
      const s = si * 2 - 1;
      ctx.beginPath();
      ctx.moveTo(s * (w / 2 - 6), -h / 2 + 12);
      ctx.lineTo(s * (w / 2 + 26), -h / 2 + 12);
      ctx.lineTo(s * (w / 2 + 14), 8);
      ctx.lineTo(s * (w / 2 + 26), h / 2 + 4);
      ctx.lineTo(s * (w / 2 - 6), h / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(91,58,94,0.2)';
    ctx.beginPath();
    rrect(ctx, -w / 2, -h / 2 + 5, w, h, 14);
    ctx.fill();
    ctx.fillStyle = main;
    ctx.beginPath();
    rrect(ctx, -w / 2, -h / 2, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    rrect(ctx, -w / 2 + 8, -h / 2 + 5, w - 16, 12, 6);
    ctx.fill();
    candyText(ctx, this.bannerText, 0, 1, 28, kind === 'gold' ? 'gold' : 'white');
    ctx.translate(-x, -y);
    ctx.globalAlpha = 1;
  }
}
