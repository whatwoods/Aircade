/**
 * 底部 HUD（§8.4）：墨锭（墨量为液面）、笔架（当前 + 两个预告）、洗笔池、悔笔按钮，以及顶部的暂停按钮、帖名与分数。
 */
import { LAYOUT } from '../config.ts';
import { approach, clamp, easeOutCubic } from '../anim/ease.ts';
import { INK, glyphs } from './glyphs.ts';
import { drawCard, drawFace, defaultOpts, roundRect, TILE } from './tiles.ts';

const SLOTS = [
  { x: LAYOUT.rackCur.x + LAYOUT.rackCur.w / 2, y: LAYOUT.rackCur.y + LAYOUT.rackCur.h / 2, s: LAYOUT.rackCur.w / TILE, a: 1 },
  { x: LAYOUT.rackNext[0].x + 28, y: LAYOUT.rackNext[0].y + 28, s: 56 / TILE, a: 0.85 },
  { x: LAYOUT.rackNext[1].x + 22, y: LAYOUT.rackNext[1].y + 22, s: 44 / TILE, a: 0.6 },
  { x: LAYOUT.rackNext[1].x + 60, y: LAYOUT.rackNext[1].y + 22, s: 36 / TILE, a: 0 },
];
const FACE: { kind: 'base'; ch: string } = { kind: 'base', ch: '' };

export class RackView {
  inkShown = 0;
  inkMax = 1;
  scoreShown = 0;
  /** 笔架补位动画进度（0→1） */
  shift = 1;
  /** 墨锭数值变化时的上浮 */
  inkBump = 0;
  scoreBump = 0;
  bowlRipple = 0;
  /** 拖拽中悬停洗笔池 */
  bowlHot = 0;
  rejectShake = 0;
  private o = defaultOpts();
  private bowlC: HTMLCanvasElement | null = null;
  private bowlV = -1;
  private stickC: HTMLCanvasElement | null = null;

  reset(ink: number, max: number, score: number): void {
    this.inkShown = ink;
    this.inkMax = Math.max(1, max);
    this.scoreShown = score;
    this.shift = 1;
  }

  update(dt: number, ink: number, score: number): void {
    const pi = this.inkShown;
    this.inkShown = approach(this.inkShown, ink, dt, 12);
    if (Math.round(pi) < Math.round(this.inkShown)) this.inkBump = 1;
    const ps = this.scoreShown;
    this.scoreShown = approach(this.scoreShown, score, dt, 7);
    if (ps < score && Math.round(ps) !== Math.round(this.scoreShown)) this.scoreBump = Math.min(1, this.scoreBump + 0.3);
    this.shift = Math.min(1, this.shift + dt / 0.2);
    this.inkBump = Math.max(0, this.inkBump - dt * 3);
    this.scoreBump = Math.max(0, this.scoreBump - dt * 3);
    this.bowlRipple = Math.max(0, this.bowlRipple - dt / 0.45);
    this.rejectShake = Math.max(0, this.rejectShake - dt / 0.26);
  }

  drawInk(ctx: CanvasRenderingContext2D, ink: number, time: number): void {
    const b = LAYOUT.ink;
    const frac = clamp(this.inkShown / this.inkMax);
    const low = ink <= 3;
    const pulse = low ? 0.5 + 0.5 * Math.sin(time * Math.PI) : 0;
    const w = low ? b.w - 10 : b.w - 4;
    const x = b.x + (b.w - w) / 2;
    const y = b.y;
    const h = b.h - 8;
    // 外形：墨锭轮廓（淡墨描边）
    ctx.save();
    ctx.fillStyle = 'rgba(46,40,34,0.08)';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = low ? `rgba(184,49,42,${0.4 + pulse * 0.5})` : 'rgba(110,102,92,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 墨（液面）
    const lh = (h - 6) * frac;
    if (lh > 0.5) {
      if (!this.stickC) this.stickC = this.makeStick();
      ctx.beginPath();
      ctx.rect(x + 3, y + 3 + (h - 6 - lh), w - 6, lh);
      ctx.clip();
      ctx.drawImage(this.stickC, x + 3, y + 3, w - 6, h - 6);
    }
    ctx.restore();
    // 数字「墨 17」
    const ny = 744 - this.inkBump * 4;
    glyphs.draw(ctx, '墨', b.x + 14, ny, 15, INK.ink2, 1);
    glyphs.number(ctx, Math.round(this.inkShown), b.x + 26, ny, 15, low ? INK.red : INK.ink2, 0, 1);
  }

  private makeStick(): HTMLCanvasElement {
    const d = glyphs.dpr;
    const c = document.createElement('canvas');
    const W = LAYOUT.ink.w;
    const H = LAYOUT.ink.h;
    c.width = Math.ceil(W * d);
    c.height = Math.ceil(H * d);
    const g = c.getContext('2d')!;
    g.scale(d, d);
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#2e2822');
    gr.addColorStop(0.35, '#16130f');
    gr.addColorStop(0.7, '#221d18');
    gr.addColorStop(1, '#0e0c0a');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // 金色描纹
    g.strokeStyle = 'rgba(199,154,95,0.55)';
    g.lineWidth = 1;
    g.strokeRect(W * 0.2, 10, W * 0.6, H - 20);
    return c;
  }

  /** 笔架：cur 当前、n1/n2 预告；dragging 时当前位留虚影；gray 墨尽 */
  drawRack(ctx: CanvasRenderingContext2D, rack: string[], dragging: boolean, gray: boolean, time: number): void {
    const c = LAYOUT.rackCur;
    // 竹制笔架托
    ctx.fillStyle = 'rgba(167,122,67,0.55)';
    roundRect(ctx, c.x - 6, c.y + c.h - 2, c.w + 12, 7, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(125,90,47,0.6)';
    ctx.fillRect(c.x + 6, c.y + c.h + 5, 4, 8);
    ctx.fillRect(c.x + c.w - 10, c.y + c.h + 5, 4, 8);
    const o = this.o;
    o.pinyin = false;
    o.method = false;
    o.time = time;
    const k = easeOutCubic(this.shift);
    const slots = SLOTS;
    const shake = this.rejectShake > 0 ? Math.sin(this.rejectShake * Math.PI * 4) * 5 * this.rejectShake : 0;
    for (let i = Math.min(2, rack.length - 1); i >= 0; i--) {
      const to = slots[i];
      const from = slots[i + 1];
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      const s = from.s + (to.s - from.s) * k;
      let a = from.a + (to.a - from.a) * k;
      if (i === 0 && dragging) a = 0.3;
      if (gray) a *= 0.45;
      o.scale = s;
      o.alpha = a;
      o.fade = gray ? 1 : 0;
      const ch = rack[i];
      drawCard(ctx, x + (i === 0 ? shake : 0), y, s, a, 0);
      // 当前部件字更大（52 px）
      if (i === 0) {
        glyphs.draw(ctx, ch, x + shake, y, 52, gray ? INK.wash : INK.light, a, 52 * (s / (c.w / TILE)), 52 * (s / (c.w / TILE)));
        o.fade = 0;
      } else {
        FACE.ch = ch;
        drawFace(ctx, FACE, x, y, o);
      }
    }
    o.scale = 1;
    o.alpha = 1;
    o.fade = 0;
  }

  drawBowl(ctx: CanvasRenderingContext2D, canDiscard: boolean): void {
    const b = LAYOUT.bowl;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (!this.bowlC || this.bowlV !== glyphs.version) {
      this.bowlC = this.makeBowl();
      this.bowlV = glyphs.version;
    }
    ctx.globalAlpha = canDiscard ? 1 : 0.55;
    ctx.drawImage(this.bowlC, b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.globalAlpha = 1;
    if (this.bowlHot > 0) {
      ctx.strokeStyle = `rgba(95,127,106,${0.5 * this.bowlHot})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, b.w / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.bowlRipple > 0) {
      const u = 1 - this.bowlRipple;
      ctx.strokeStyle = `rgba(110,102,92,${0.45 * this.bowlRipple})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + u * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 2 + u * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private makeBowl(): HTMLCanvasElement {
    const d = glyphs.dpr;
    const b = LAYOUT.bowl;
    const W = b.w + 12;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * d);
    c.height = Math.ceil(W * d);
    const g = c.getContext('2d')!;
    g.scale(d, d);
    const cx = W / 2;
    g.shadowColor = 'rgba(60,40,20,0.18)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    g.fillStyle = '#F7F5F0';
    g.beginPath();
    g.arc(cx, cx, b.w / 2, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(110,102,92,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cx, b.w / 2 - 4, 0, Math.PI * 2);
    g.stroke();
    const wg = g.createRadialGradient(cx, cx, 2, cx, cx, b.w / 2 - 7);
    wg.addColorStop(0, 'rgba(120,118,112,0.75)');
    wg.addColorStop(0.45, 'rgba(160,166,162,0.8)');
    wg.addColorStop(1, '#C9CFCB');
    g.fillStyle = wg;
    g.beginPath();
    g.arc(cx, cx, b.w / 2 - 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(cx - 12, cx - 14, 10, 4, -0.5, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  drawUndo(ctx: CanvasRenderingContext2D, left: number, enabled: boolean): void {
    const b = LAYOUT.undoBtn;
    const a = enabled ? 1 : 0.4;
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(110,102,92,0.45)';
    ctx.lineWidth = 1;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    glyphs.label(ctx, '悔笔', b.x + b.w / 2 - 8, b.y + b.h / 2, 16, INK.ink2, 0.5, a);
    glyphs.number(ctx, left, b.x + b.w / 2 + 20, b.y + b.h / 2, 16, INK.red, 0.5, a);
  }

  drawPause(ctx: CanvasRenderingContext2D): void {
    const b = LAYOUT.pauseBtn;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    ctx.strokeStyle = 'rgba(110,102,92,0.6)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK.ink2;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 7);
    ctx.quadraticCurveTo(cx - 5, cy, cx - 4, cy + 7);
    ctx.moveTo(cx + 4, cy - 7);
    ctx.quadraticCurveTo(cx + 3, cy, cx + 4, cy + 7);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /** 帖名（静态字符串缓存）与分数 */
  drawHeader(ctx: CanvasRenderingContext2D, title: string): void {
    glyphs.label(ctx, title, LAYOUT.W / 2, 32, 16, INK.ink2, 0.5, 1);
    glyphs.number(ctx, this.scoreShown, 378, 32 - this.scoreBump * 4, 18, INK.ink, 1, 1);
  }
}
