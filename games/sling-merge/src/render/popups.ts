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
const POP_L = CONFIG.layout.jar.inner.L;
const POP_R = CONFIG.layout.jar.inner.R;

export class Popups {
  text: string[] = new Array<string>(CAP).fill('');
  sub: string[] = new Array<string>(CAP).fill('');
  x = new Float32Array(CAP);
  y = new Float32Array(CAP);
  t = new Float32Array(CAP).fill(99);
  dur = new Float32Array(CAP).fill(1);
  size = new Float32Array(CAP);
  style: TextStyle[] = new Array<TextStyle>(CAP).fill('white');
  /** 估算半宽（避让用） */
  hw = new Float32Array(CAP);
  /** 是否为合成得分跳字（可累加） */
  isScore = new Uint8Array(CAP);
  private head = 0;
  private lastScore = -1;
  private lastSum = 0;

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
    this.lastScore = -1;
    this.bannerT = 99;
    this.topT = 99;
    this.recordT = 99;
  }

  private static halfW(text: string, size: number): number {
    let w = 0;
    for (let k = 0; k < text.length; k++) w += text.charCodeAt(k) > 255 ? size : size * 0.6;
    return Math.min(150, w / 2 + size * 0.14 + 4);
  }

  /** 起点最高能到哪：盖子下方留出整段上浮；顶部「新发现」小横幅（y 150±18）在场时再让到它下面 */
  private minY(size: number): number {
    const top = this.topT < this.topDur ? 168 : POP_TOP;
    return top + 36 + size * 0.7;
  }

  /** 当前（上浮后的）y */
  private curY(i: number): number {
    return this.y[i]! - 36 * ease.quadOut(Math.min(1, this.t[i]! / this.dur[i]!));
  }

  add(text: string, x: number, y: number, size: number, style: TextStyle, sub = '', dur = 0.8, optional = false): number {
    // 按估算字宽夹在罐内，长字（「惊险救场 +50」）贴墙时不被玻璃挡住
    const hw = Popups.halfW(text, size);
    const px = Math.max(POP_L + hw, Math.min(POP_R - hw, x));
    // 水果往上浮、合成多发生在罐顶：起点压到盖子下方，保证整段上浮（36px）都在罐内、不钻到盖子和图鉴后面
    const base = Math.max(y, this.minY(size));
    let py = base;
    // 纵向避让：和还清晰可见的跳字重叠时往下让（罐顶没有往上的余地），最多让 64 px
    let clear = false;
    for (let pass = 0; pass < 4 && !clear; pass++) {
      clear = true;
      for (let j = 0; j < CAP; j++) {
        if (this.t[j]! >= this.dur[j]! * 0.75) continue;
        if (Math.abs(this.x[j]! - px) >= this.hw[j]! + hw) continue;
        const oy = this.curY(j);
        const oh = this.size[j]! * (this.sub[j] ? 1.35 : 0.75);
        const gap = oh + size * 0.75;
        if (Math.abs(oy - py) < gap) {
          py = oy + gap;
          clear = false;
        }
      }
    }
    if (!clear || py > base + 64) {
      // 让不开：可选的得分跳字直接省略（分数照常进 HUD），其余留在原位
      if (optional) return -1;
      py = base;
    }
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    if (i === this.lastScore) this.lastScore = -1;
    this.text[i] = text;
    this.sub[i] = sub;
    this.isScore[i] = 0;
    this.hw[i] = hw;
    this.x[i] = px;
    this.y[i] = py;
    this.t[i] = 0;
    this.dur[i] = dur;
    this.size[i] = size;
    this.style[i] = style;
    return i;
  }

  /**
   * 合成得分跳字：0.45 s 内、附近再次合成时累加到同一条（「+110」→「+260」），
   * 连击小字只保留最新的一条，快速连锁不会叠成一团。
   */
  score(gained: number, x: number, y: number, size: number, style: TextStyle, sub: string): void {
    const j = this.lastScore;
    if (j >= 0 && this.isScore[j] && this.t[j]! < 0.45 && Math.abs(this.x[j]! - x) < 130 && Math.abs(this.curY(j) - y) < 130) {
      this.lastSum += gained;
      this.text[j] = '+' + this.lastSum;
      this.sub[j] = sub;
      this.size[j] = Math.max(this.size[j]!, size);
      this.style[j] = style;
      this.hw[j] = Popups.halfW(this.text[j]!, this.size[j]!);
      this.x[j] = Math.max(POP_L + this.hw[j]!, Math.min(POP_R - this.hw[j]!, this.x[j]!));
      this.y[j] = Math.max(this.y[j]!, this.minY(this.size[j]!));
      this.t[j] = 0.06; // 重新弹一下（跳过最开始的缩小）
      return;
    }
    if (sub) for (let k = 0; k < CAP; k++) if (this.isScore[k]) this.sub[k] = '';
    const i = this.add('+' + gained, x, y, size, style, sub, 0.8, true);
    if (i < 0) return;
    this.isScore[i] = 1;
    this.lastScore = i;
    this.lastSum = gained;
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
