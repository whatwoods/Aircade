/**
 * 卷轴 HUD（§8.4 / §6.6 ⑤ / §7.2）：最多 3 个目标字，描红空心；点卷轴升提示；
 * 交付时笔扫填满浓墨、盖「成」印、卷起，再展开下一个目标。
 */
import { LAYOUT } from '../config.ts';
import { RECIPE_MAP } from '../core/recipes.ts';
import type { Order } from '../core/types.ts';
import type { Struct } from '../data/hanzi.ts';
import { clamp, easeInOutQuad, easeOutBack, easeOutCubic } from '../anim/ease.ts';
import { INK, glyphs } from './glyphs.ts';
import type { Revealer } from './ink.ts';
import { drawSeal, seal } from './seal.ts';

const OPEN_T = 0.42;
const CLOSE_T = 0.3;
const FILL_T = 0.35;
const HOLD_T = 0.32;

interface View {
  ch: string;
  uid: number;
  hint: number;
  /** 'open' 展开中/已展开；'fill' 已抵达、笔扫中；'hold' 盖印后停留；'close' 卷起中 */
  phase: 'open' | 'fill' | 'hold' | 'close';
  t: number;
  /** 交付中（字在飞，描红仍空心） */
  delivering: boolean;
  hintFlash: number;
  sealRot: number;
}

export interface ScrollHooks {
  stamp(slot: number, x: number, y: number): void;
  closed(slot: number): void;
}

/** 提示行文字：0 结构图标；1 半示；2 全示；3 展开到底层 */
export function hintParts(ch: string, level: number): string[] {
  const r = RECIPE_MAP.get(ch);
  if (!r || level <= 0) return [];
  const ps = r.parts;
  if (level === 1) {
    // 形声字给形旁（非声旁那一个），其他给第一个部件
    const i = r.ph !== undefined ? (r.ph === 0 ? 1 : 0) : 0;
    return ps.map((p, k) => (k === i ? p : '？'));
  }
  if (level === 2) return [...ps];
  return ps.flatMap((p) => {
    const rr = RECIPE_MAP.get(p);
    return rr ? rr.parts : [p];
  });
}

export class Scrolls {
  views: (View | null)[] = [null, null, null];
  private queue: (Order | null)[] = [null, null, null];
  active = 3;
  private hooks: ScrollHooks;
  private reveal: Revealer;
  constructor(reveal: Revealer, hooks: ScrollHooks) {
    this.reveal = reveal;
    this.hooks = hooks;
  }

  x(slot: number): number {
    if (this.active >= 3) return LAYOUT.scrollXs[slot];
    const W = LAYOUT.scrollW;
    const gap = 14;
    const total = this.active * W + (this.active - 1) * gap;
    return Math.round((LAYOUT.W - total) / 2 + slot * (W + gap));
  }

  reset(active: number, orders: Order[]): void {
    this.active = active;
    this.views = [null, null, null];
    this.queue = [null, null, null];
    for (const o of orders) this.open(o, 0.12 * o.slot);
  }

  private open(o: Order, delay = 0): void {
    this.views[o.slot] = { ch: o.ch, uid: o.uid, hint: o.hint, phase: 'open', t: -delay, delivering: false, hintFlash: 0, sealRot: (Math.random() - 0.5) * 0.12 };
  }

  /** 新目标：若该槽还在播交付，排队 */
  orderOpened(o: Order): void {
    const v = this.views[o.slot];
    if (v && v.uid !== o.uid) this.queue[o.slot] = o;
    else this.open(o);
  }

  delivered(slot: number, uid: number): void {
    const v = this.views[slot];
    if (v && v.uid === uid) v.delivering = true;
  }

  arrive(slot: number, uid: number): void {
    const v = this.views[slot];
    if (!v || v.uid !== uid) return;
    v.phase = 'fill';
    v.t = 0;
  }

  setHint(o: Order): void {
    const v = this.views[o.slot];
    if (v && v.uid === o.uid) {
      v.hint = o.hint;
      v.hintFlash = 0.26;
    }
  }

  /** 与核心状态同步（悔笔后） */
  sync(orders: Order[]): void {
    for (let s = 0; s < 3; s++) {
      const o = orders.find((x) => x.slot === s) ?? null;
      const v = this.views[s];
      this.queue[s] = null;
      if (!o) {
        this.views[s] = null;
        continue;
      }
      if (!v || v.uid !== o.uid) this.open(o);
      else {
        v.hint = o.hint;
        v.phase = 'open';
        v.t = Math.max(v.t, OPEN_T);
        v.delivering = false;
      }
    }
  }

  /** 点到哪个卷轴（-1 无） */
  hit(x: number, y: number): number {
    if (y < LAYOUT.scrollY - 4 || y > LAYOUT.scrollY + LAYOUT.scrollH + 6) return -1;
    for (let s = 0; s < 3; s++) {
      const v = this.views[s];
      if (!v || v.phase !== 'open' || v.delivering) continue;
      const sx = this.x(s);
      if (x >= sx - 3 && x <= sx + LAYOUT.scrollW + 3) return s;
    }
    return -1;
  }

  update(dt: number): void {
    for (let s = 0; s < 3; s++) {
      const v = this.views[s];
      if (!v) continue;
      v.t += dt;
      if (v.hintFlash > 0) v.hintFlash = Math.max(0, v.hintFlash - dt);
      if (v.phase === 'fill' && v.t >= FILL_T) {
        v.phase = 'hold';
        v.t = 0;
        this.hooks.stamp(s, this.x(s) + LAYOUT.scrollW - 22, LAYOUT.scrollY + LAYOUT.scrollH - 30);
      } else if (v.phase === 'hold' && v.t >= HOLD_T) {
        v.phase = 'close';
        v.t = 0;
      } else if (v.phase === 'close' && v.t >= CLOSE_T) {
        this.views[s] = null;
        this.hooks.closed(s);
        const q = this.queue[s];
        if (q) {
          this.queue[s] = null;
          this.open(q);
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    for (let s = 0; s < 3; s++) {
      const v = this.views[s];
      if (v) this.drawOne(ctx, s, v, time);
    }
  }

  private drawOne(ctx: CanvasRenderingContext2D, slot: number, v: View, time: number): void {
    const x = this.x(slot);
    const y = LAYOUT.scrollY;
    const W = LAYOUT.scrollW;
    const H = LAYOUT.scrollH;
    let open = 1;
    if (v.phase === 'open') open = v.t < 0 ? 0 : easeOutCubic(clamp(v.t / OPEN_T));
    else if (v.phase === 'close') open = 1 - easeInOutQuad(clamp(v.t / CLOSE_T));
    if (v.t < 0 && v.phase === 'open') {
      this.rod(ctx, x, y, W);
      return;
    }
    const ph = (H - 16) * open;
    // 纸面
    ctx.fillStyle = '#EDE3CF';
    ctx.fillRect(x + 4, y + 8, W - 8, ph);
    ctx.strokeStyle = 'rgba(167,122,67,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 4.5, y + 8.5, W - 9, ph - 1);
    // 内框：细朱线
    if (open > 0.6) {
      ctx.globalAlpha = (open - 0.6) / 0.4;
      ctx.strokeStyle = 'rgba(184,49,42,0.25)';
      ctx.strokeRect(x + 10.5, y + 14.5, W - 21, H - 29);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y + 8, W - 8, ph);
    ctx.clip();
    const cx = x + W / 2;
    const gy = 108;
    // 描红（呼吸 0.75↔1，3 s）
    const breath = 0.875 + 0.125 * Math.sin((time / 3) * Math.PI * 2 + slot);
    const filled = v.phase === 'fill' || v.phase === 'hold' || v.phase === 'close';
    if (!filled || v.phase === 'fill') glyphs.draw(ctx, v.ch, cx, gy, 60, INK.red, breath, 60, 60, 'kai', 1.2);
    if (filled) {
      const c = glyphs.get(v.ch, 60, INK.ink);
      const box = c.width / glyphs.dpr;
      const p = v.phase === 'fill' ? easeInOutQuad(clamp(v.t / FILL_T)) : 1;
      this.reveal.sweepReveal(ctx, c, cx, gy, box, box, p);
    }
    // 提示行
    if (!filled) this.drawHint(ctx, cx, 160, v);
    ctx.restore();
    // 「成」印
    if (v.phase === 'hold' || v.phase === 'close') {
      const u = v.phase === 'hold' ? clamp(v.t / 0.16) : 1;
      const sc = 1.6 - 0.6 * easeOutBack(u);
      drawSeal(ctx, seal('成', 26, 'white', 'kai', 6), x + W - 24, y + H - 32 - (1 - open) * 40, sc, v.sealRot, Math.min(1, u * 2) * open);
    }
    this.rod(ctx, x, y, W);
    this.rod(ctx, x, y + 8 + ph, W);
  }

  private rodC: HTMLCanvasElement | null = null;
  private rodV = -1;
  private rod(ctx: CanvasRenderingContext2D, x: number, y: number, W: number): void {
    if (!this.rodC || this.rodV !== glyphs.version) {
      const d = glyphs.dpr;
      const c = document.createElement('canvas');
      c.width = Math.ceil((W + 6) * d);
      c.height = Math.ceil(8 * d);
      const g = c.getContext('2d')!;
      g.scale(d, d);
      const gr = g.createLinearGradient(0, 0, 0, 8);
      gr.addColorStop(0, '#c79a5f');
      gr.addColorStop(0.5, '#a77a43');
      gr.addColorStop(1, '#7d5a2f');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(3, 0, W, 8, 4);
      g.fill();
      g.fillStyle = '#5a3f1f';
      g.fillRect(1, 1, 4, 6);
      g.fillRect(W + 1, 1, 4, 6);
      this.rodC = c;
      this.rodV = glyphs.version;
    }
    ctx.drawImage(this.rodC, x - 3, y, W + 6, 8);
  }

  private drawHint(ctx: CanvasRenderingContext2D, cx: number, y: number, v: View): void {
    const r = RECIPE_MAP.get(v.ch);
    if (!r) return;
    const flash = v.hintFlash > 0 ? 1 + v.hintFlash * 1.2 : 1;
    if (v.hint <= 0) {
      structIcon(ctx, r.s, cx, y, 14, INK.light);
      return;
    }
    const parts = hintParts(v.ch, v.hint);
    const n = parts.length;
    const step = n > 3 ? 20 : 26;
    const x0 = cx - ((n - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      const px = x0 + i * step;
      if (parts[i] === '？') glyphs.draw(ctx, '？', px, y, 16, INK.wash, 1);
      else glyphs.draw(ctx, parts[i], px, y, 16, INK.ink2, 1, 16 * flash, 16 * flash);
      if (i < n - 1) glyphs.label(ctx, '+', px + step / 2, y, 12, INK.wash, 0.5, 1);
    }
  }
}

/** 结构图标（⿰⿱⿴…，字体里没有这些码位，程序绘制） */
export function structIcon(ctx: CanvasRenderingContext2D, s: Struct, cx: number, cy: number, size: number, color: string): void {
  const h = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.strokeRect(cx - h, cy - h, size, size);
  ctx.beginPath();
  switch (s) {
    case '⿰':
      ctx.moveTo(cx - h * 0.1, cy - h);
      ctx.lineTo(cx - h * 0.1, cy + h);
      break;
    case '⿱':
      ctx.moveTo(cx - h, cy - h * 0.1);
      ctx.lineTo(cx + h, cy - h * 0.1);
      break;
    case '⿴':
      ctx.rect(cx - h * 0.45, cy - h * 0.45, h * 0.9, h * 0.9);
      break;
    case '⿵':
      ctx.moveTo(cx - h * 0.45, cy + h);
      ctx.lineTo(cx - h * 0.45, cy - h * 0.3);
      ctx.lineTo(cx + h * 0.45, cy - h * 0.3);
      ctx.lineTo(cx + h * 0.45, cy + h);
      break;
    case '⿸':
      ctx.moveTo(cx + h, cy - h * 0.3);
      ctx.lineTo(cx - h * 0.3, cy - h * 0.3);
      ctx.lineTo(cx - h * 0.3, cy + h);
      break;
    case '⿹':
      ctx.moveTo(cx - h, cy - h * 0.3);
      ctx.lineTo(cx + h * 0.3, cy - h * 0.3);
      ctx.lineTo(cx + h * 0.3, cy + h);
      break;
    case '⿺':
      ctx.moveTo(cx - h * 0.3, cy - h);
      ctx.lineTo(cx - h * 0.3, cy + h * 0.3);
      ctx.lineTo(cx + h, cy + h * 0.3);
      break;
    default:
      ctx.moveTo(cx - h, cy);
      ctx.lineTo(cx + h, cy);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + h);
  }
  ctx.stroke();
  ctx.restore();
}

