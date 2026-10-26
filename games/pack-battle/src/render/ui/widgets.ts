// 轻量控件：按钮（木牌 / 蜡封纸签 / 木质圆币 / 纸签 / 羊皮纸）、开关、面板、Toast、气泡、聚光遮罩、手势提示手
import { Spring } from '../../core/spring.ts';
import { ease } from '../../core/tween.ts';
import { inkStroke, rectPts, type Pts } from '../ink.ts';
import { C, cached, coin, drawPaper, drawPlank, drawSeal, paper, rivet, seal, type CoinIcon } from '../kit.ts';
import { type Rect } from '../layout.ts';
import { CN, HAND, drawSprite, text, wrap } from '../text.ts';
import { mixHex, rgba } from '../textures.ts';

// ---------- 全局弹簧登记（由主循环按 120Hz 推进） ----------

const springs: Spring[] = [];
export function regSpring(s: Spring): Spring {
  springs.push(s);
  return s;
}
export function stepWidgets(h: number): void {
  for (let i = 0; i < springs.length; i++) springs[i].step(h);
}

export interface UiEl {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
}

export type BtnKind = 'plank' | 'sealTag' | 'coin' | 'paper' | 'tag' | 'speed';

export class Button {
  id: string;
  r: Rect;
  label: string;
  sub = '';
  kind: BtnKind;
  icon: CoinIcon | null = null;
  glyph = '⚔';
  enabled = true;
  visible = true;
  /** 0..1：整体透明度（滑入滑出） */
  alpha = 1;
  dx = 0;
  dy = 0;
  pressed = false;
  hover = false;
  press = regSpring(new Spring(30, 0.38, 1));
  /** 缓慢脉动 */
  pulse = 0;
  /** 发光（开战按钮有武器时） */
  glow = 0;
  /** 二次确认截止时间（真实秒） */
  confirmUntil = 0;
  confirmLabel = '再点一次确认';
  tint = '';
  seed: number;
  fontSize = 20;
  constructor(id: string, r: Rect, label: string, kind: BtnKind, seed = 1) {
    this.id = id;
    this.r = r;
    this.label = label;
    this.kind = kind;
    this.seed = seed;
    if (kind === 'coin') this.fontSize = 14;
    if (kind === 'tag') this.fontSize = 15;
    if (kind === 'paper') this.fontSize = 19;
  }
  hit(x: number, y: number, pad = 4): boolean {
    if (!this.visible || this.alpha < 0.5) return false;
    const r = this.r;
    return x >= r.x + this.dx - pad && x <= r.x + this.dx + r.w + pad && y >= r.y + this.dy - pad && y <= r.y + this.dy + r.h + pad;
  }
  down(): void {
    this.pressed = true;
    this.press.target = 0.94;
  }
  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.press.target = 1;
    this.press.v += 1.6;
  }
  el(): UiEl {
    return { id: this.id, x: this.r.x + this.dx, y: this.r.y + this.dy, w: this.r.w, h: this.r.h, enabled: this.enabled && this.visible };
  }
  draw(ctx: CanvasRenderingContext2D, time: number, realTime: number): void {
    if (!this.visible || this.alpha <= 0.01) return;
    const r = this.r;
    const cx = r.x + this.dx + r.w / 2;
    const cy = r.y + this.dy + r.h / 2;
    let s = this.press.x;
    if (this.pulse > 0 && this.enabled) s *= 1 + this.pulse * (0.5 - 0.5 * Math.cos((time * Math.PI * 2) / 1.6));
    ctx.save();
    ctx.globalAlpha *= this.alpha * (this.enabled ? 1 : 0.55);
    ctx.translate(cx, cy);
    if (s !== 1) ctx.scale(s, s);
    const x = -r.w / 2;
    const y = -r.h / 2;
    const confirming = this.confirmUntil > realTime;
    const label = confirming ? this.confirmLabel : this.label;
    switch (this.kind) {
      case 'plank': {
        if (this.glow > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha *= this.glow * (0.35 + 0.25 * Math.sin(time * 3.2));
          drawSprite(ctx, glowRect(r.w, r.h), x, y);
          ctx.restore();
        }
        drawSprite(ctx, plankSprite(r.w, r.h, this.seed), x, y);
        const sr = Math.min(22, r.h * 0.38);
        drawSprite(ctx, seal(this.glyph, sr, this.seed + 3), x + 14 + 4, -sr);
        const tx = x + 14 + sr * 2 + (r.w - 14 - sr * 2 - 8) / 2 + 4;
        text(ctx, label, tx, 1, { size: confirming ? 16 : this.fontSize + 2, weight: 900, color: C.paper, stroke: C.ink, strokeW: 4, spacing: confirming ? 1 : 4 });
        if (this.sub) text(ctx, this.sub, tx, r.h * 0.3, { size: 11, weight: 700, color: C.chalk, alpha: 0.85 });
        break;
      }
      case 'sealTag': {
        drawSprite(ctx, tagSprite2(r.w - 30, r.h - 14, this.seed), x + 26, y + 7);
        const sr = r.h * 0.42;
        drawSprite(ctx, seal(this.glyph, sr, this.seed + 1), x + 4, -sr);
        text(ctx, label, x + 26 + (r.w - 30) / 2 + 12, 1, { size: this.fontSize, weight: 900, color: C.ink, spacing: 3 });
        break;
      }
      case 'coin': {
        const rr = Math.min(r.w, r.h) / 2;
        drawSprite(ctx, coin(this.icon, rr, this.seed), -rr, -rr);
        if (this.label) text(ctx, label, 0, rr + 9, { size: 11, weight: 700, color: C.paper, stroke: C.ink, strokeW: 3 });
        break;
      }
      case 'speed': {
        drawSprite(ctx, speedSprite(r.w, r.h), x, y);
        text(ctx, label, 0, 1, { size: 26, family: HAND, color: C.paper, stroke: C.ink, strokeW: 4 });
        break;
      }
      case 'tag': {
        drawSprite(ctx, tagSprite2(r.w, r.h, this.seed, this.tint || undefined), x, y);
        text(ctx, label, 0, 1, { size: this.fontSize, weight: 700, family: HAND, color: C.ink, maxW: r.w - 8 });
        break;
      }
      case 'paper': {
        drawSprite(ctx, paperBtn(r.w, r.h, this.seed, this.tint), x, y);
        text(ctx, label, 0, 1, {
          size: confirming ? 17 : this.fontSize, weight: 800, color: confirming ? C.wax : C.ink, spacing: confirming ? 1 : 2,
        });
        break;
      }
    }
    ctx.restore();
  }
}

function plankSprite(w: number, h: number, seed: number) {
  return cached('plank|' + w + 'x' + h + '|' + seed, w, h, 8, (ctx, r) => drawPlank(ctx, r, 0, 0, w, h, seed));
}

function glowRect(w: number, h: number) {
  return cached('glowrect|' + w + 'x' + h, w, h, 16, (ctx) => {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(255,200,110,0.09)';
      ctx.beginPath();
      ctx.roundRect(-14 + i * 2.5, -14 + i * 2.5, w + 28 - i * 5, h + 28 - i * 5, 18);
      ctx.fill();
    }
  });
}

function tagSprite2(w: number, h: number, seed: number, tint?: string) {
  return cached('btag|' + w + 'x' + h + '|' + seed + '|' + tint, w, h, 6, (ctx, r) => drawPaper(ctx, r, 0, 0, w, h, { seed, tint, burn: 0.6, r: 4 }));
}

function paperBtn(w: number, h: number, seed: number, tint: string) {
  return cached('pbtn|' + w + 'x' + h + '|' + seed + '|' + tint, w, h, 6, (ctx, r) => {
    drawPaper(ctx, r, 0, 0, w, h, { seed, tint: tint || undefined, burn: 0.8, r: 5 });
    inkStroke(ctx, rectPts(5, 5, w - 10, h - 10, 4), true, 1.1, rgba(C.ink, 0.45), seed + 2, { unit: 1, jitter: 0.5, dry: false });
  });
}

function speedSprite(w: number, h: number) {
  return cached('speedcoin|' + w + 'x' + h, w, h, 6, (ctx) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = 'rgba(20,10,4,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 2.5, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.2, 2, cx, cy, w / 2);
    g.addColorStop(0, '#a3713f');
    g.addColorStop(0.75, '#74492a');
    g.addColorStop(1, '#4e2f19');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,170,0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 - 5, h / 2 - 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    const p: Pts = [];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      p.push(cx + (Math.cos(a) * w) / 2, cy + (Math.sin(a) * h) / 2);
    }
    inkStroke(ctx, p, true, 1.8, C.ink, 4, { unit: 1, jitter: 0.5, dry: false });
  });
}

// ---------- 开关（皮带 + 黄铜按钮） ----------

export class Toggle {
  id: string;
  r: Rect;
  label: string;
  on: boolean;
  knob = regSpring(new Spring(26, 0.6, 0));
  constructor(id: string, r: Rect, label: string, on: boolean) {
    this.id = id;
    this.r = r;
    this.label = label;
    this.on = on;
    this.knob.snap(on ? 1 : 0);
  }
  set(on: boolean): void {
    this.on = on;
    this.knob.target = on ? 1 : 0;
  }
  hit(x: number, y: number): boolean {
    const r = this.r;
    return x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4;
  }
  el(): UiEl {
    return { id: this.id, x: this.r.x, y: this.r.y, w: this.r.w, h: this.r.h, enabled: true };
  }
  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.r;
    text(ctx, this.label, r.x, r.y + r.h / 2, { size: 17, weight: 700, align: 'left' });
    const sw = 64;
    const sh = 24;
    const sx = r.x + r.w - sw;
    const sy = r.y + (r.h - sh) / 2;
    drawSprite(ctx, strapSprite(sw, sh), sx, sy);
    const k = this.knob.x;
    if (k > 0.02) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, k);
      ctx.fillStyle = rgba(C.ok, 0.55);
      ctx.beginPath();
      ctx.roundRect(sx + 3, sy + 3, (sw - 6) * Math.min(1, k), sh - 6, 9);
      ctx.fill();
      ctx.restore();
    }
    const kx = sx + 12 + (sw - 24) * k;
    drawSprite(ctx, knobSprite(), kx - 13, sy + sh / 2 - 13);
    text(ctx, this.on ? '开' : '关', sx - 14, sy + sh / 2, { size: 14, weight: 900, color: this.on ? '#4f7a2a' : C.inkSoft });
  }
}

function strapSprite(w: number, h: number) {
  return cached('strap|' + w + 'x' + h, w, h, 4, (ctx) => {
    const p = rectPts(0, 0, w, h, h / 2);
    ctx.fillStyle = '#6b4226';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = C.stitch;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, (h - 8) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    inkStroke(ctx, p, true, 1.6, C.ink, 3, { unit: 1, jitter: 0.4, dry: false });
  });
}

function knobSprite() {
  return cached('knob', 26, 26, 4, (ctx) => {
    rivet(ctx, 13, 13, 11);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(13, 13, 11, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// ---------- 面板 ----------

export function drawPanel(ctx: CanvasRenderingContext2D, r: Rect, seed = 1, scale = 1, border = true): void {
  const sp = paper('panel' + seed + (border ? 'b' : ''), r.w, r.h, { seed, border, burn: 1.1, r: 5 });
  if (scale === 1) drawSprite(ctx, sp, r.x, r.y);
  else {
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(scale, scale);
    drawSprite(ctx, sp, -r.w / 2, -r.h / 2);
    ctx.restore();
  }
}

/** 手写感中文标题：900 字重、墨描边、−2° 旋转、蜡封红错位投影 */
export function titleText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 26, color: string = C.ink, onDark = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.035);
  text(ctx, s, 2, 2, { size, weight: 900, color: C.wax, alpha: 0.35, spacing: 3 });
  if (onDark) text(ctx, s, 0, 0, { size, weight: 900, color: C.paper, stroke: C.ink, strokeW: 4, spacing: 3 });
  else text(ctx, s, 0, 0, { size, weight: 900, color, spacing: 3 });
  ctx.restore();
}

// ---------- Toast ----------

export const toast = { s: '', t: 0, x: 195, y: 470, color: C.ink };

export function showToast(s: string, x = 195, y = 470, color: string = C.ink): void {
  toast.s = s;
  toast.t = 1.6;
  toast.x = x;
  toast.y = y;
  toast.color = color;
}

export function updateToast(dt: number): void {
  if (toast.t > 0) toast.t = Math.max(0, toast.t - dt);
}

export function drawToast(ctx: CanvasRenderingContext2D): void {
  if (toast.t <= 0) return;
  const age = 1.6 - toast.t;
  const a = toast.t < 0.3 ? toast.t / 0.3 : 1;
  const s = age < 0.15 ? 0.85 + ease.outBack(age / 0.15) * 0.15 : 1;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(toast.x, toast.y - Math.min(age, 0.3) * 20);
  ctx.scale(s, s);
  ctx.font = `800 16px ${CN}`;
  const w = Math.max(90, ctx.measureText(toast.s).width + 34);
  drawSprite(ctx, toastSprite(Math.ceil(w / 10) * 10), -Math.ceil(w / 10) * 5, -18);
  text(ctx, toast.s, 0, 0, { size: 16, weight: 800, color: toast.color });
  ctx.restore();
}

function toastSprite(w: number) {
  return cached('toast|' + w, w, 36, 6, (ctx, r) => drawPaper(ctx, r, 0, 0, w, 36, { seed: w, burn: 0.6, r: 6 }));
}

// ---------- 引导气泡 ----------

/** 羊皮纸气泡：tail 指向 (tx,ty)，可为 null */
export function drawBubble(ctx: CanvasRenderingContext2D, s: string, cx: number, cy: number, maxW: number, tail: [number, number] | null, appear = 1): number {
  const lines = wrap(ctx, s, maxW - 28, 16, 800);
  let w = 0;
  ctx.font = `800 16px ${CN}`;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  w = Math.min(maxW, Math.ceil(w + 32));
  const h = lines.length * 22 + 20;
  ctx.save();
  const sc = 0.85 + 0.15 * ease.outBack(Math.min(1, appear));
  ctx.globalAlpha *= Math.min(1, appear * 2);
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  const x = -w / 2;
  const y = -h / 2;
  if (tail) {
    const tx = tail[0] - cx;
    const ty = tail[1] - cy;
    const bx = Math.max(x + 18, Math.min(x + w - 18, tx * 0.3));
    const by = ty > 0 ? y + h - 2 : y + 2;
    const tip: Pts = [bx - 9, by, bx + 9, by, bx + (tx - bx) * 0.35, by + (ty > 0 ? 16 : -16)];
    ctx.fillStyle = 'rgba(25,12,5,0.25)';
    ctx.beginPath();
    ctx.moveTo(tip[0] + 2, tip[1] + 3);
    ctx.lineTo(tip[2] + 2, tip[3] + 3);
    ctx.lineTo(tip[4] + 2, tip[5] + 3);
    ctx.fill();
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[2], tip[3]);
    ctx.lineTo(tip[4], tip[5]);
    ctx.fill();
    ctx.strokeStyle = C.paperBurn;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  drawSprite(ctx, bubbleSprite(w, h), x, y);
  for (let i = 0; i < lines.length; i++) text(ctx, lines[i], 0, y + 20 + i * 22, { size: 16, weight: 800, color: C.ink });
  ctx.restore();
  return h;
}

function bubbleSprite(w: number, h: number) {
  return cached('bubble|' + w + 'x' + h, w, h, 6, (ctx, r) => drawPaper(ctx, r, 0, 0, w, h, { seed: 9, burn: 0.7, r: 8 }));
}

// ---------- 聚光遮罩 ----------

export function spotlight(ctx: CanvasRenderingContext2D, W: number, H: number, holes: Rect[], alpha = 0.55): void {
  ctx.save();
  ctx.fillStyle = `rgba(18,9,4,${alpha})`;
  ctx.beginPath();
  ctx.rect(-400, -400, W + 800, H + 800);
  for (const h of holes) ctx.roundRect(h.x, h.y, h.w, h.h, 10);
  ctx.fill('evenodd');
  ctx.strokeStyle = rgba(C.goldLight, 0.55);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  for (const h of holes) {
    ctx.beginPath();
    ctx.roundRect(h.x, h.y, h.w, h.h, 10);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------- 手势提示手（墨笔画） ----------

export function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, press: number, seed = 1): void {
  drawSprite(ctx, handSprite(seed), x - 14, y - 4 + press * 3, 1 - press * 0.08);
}

function handSprite(seed: number) {
  return cached('hand' + seed, 44, 56, 6, (ctx) => {
    // 指尖在 (14,4)
    const p: Pts = [
      10, 6, 12, 1, 17, 1, 19, 6, 19, 22, 23, 20, 28, 21, 30, 25, 34, 24, 38, 27, 40, 31, 40, 42, 36, 52, 18, 54, 12, 46, 3, 33, 4, 28, 9, 28, 10, 31,
    ];
    ctx.fillStyle = 'rgba(20,10,4,0.3)';
    ctx.save();
    ctx.translate(2, 3);
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fbf3df';
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
    inkStroke(ctx, p, true, 2, C.ink, seed, { unit: 1, jitter: 0.5, dry: false });
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(19, 22);
    ctx.lineTo(19, 30);
    ctx.moveTo(28, 21);
    ctx.lineTo(28, 30);
    ctx.moveTo(34, 24);
    ctx.lineTo(34, 31);
    ctx.stroke();
  });
}

// ---------- 墨章（"合成 ★★"、"已售出"、"击败！"、"狂怒！"） ----------

export function drawStamp(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string = C.wax, rot = -0.12, alpha = 1, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
  ctx.font = `900 ${size}px ${CN}`;
  const w = ctx.measureText(s).width + size * 0.9;
  const h = size * 1.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.roundRect(-w / 2 + size * 0.15, -h / 2 + size * 0.15, w - size * 0.3, h - size * 0.3, size * 0.12);
  ctx.stroke();
  text(ctx, s, 0, size * 0.04, { size, weight: 900, color });
  ctx.restore();
}

export function lighten(c: string, k: number): string {
  return mixHex(c, '#ffffff', k);
}

export { drawSeal };
