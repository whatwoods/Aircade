/**
 * 跳字与气泡（§8.5）：对象池。
 *  - 分数跳字从卷轴升起，同时最多 3 个，第二个起右移 18 px、延迟 80 ms
 *  - 预览气泡（拖拽悬停）和信息气泡（点击 / 重复合成），各同时最多 1 个
 */
import { RECIPE_MAP, BASE_MAP } from '../core/recipes.ts';
import { easeOutBack, easeOutCubic } from '../anim/ease.ts';
import { INK, glyphs } from './glyphs.ts';
import { roundRect } from './tiles.ts';
import { drawSeal, seal } from './seal.ts';

interface Float {
  on: boolean;
  text: string;
  x: number;
  y: number;
  t: number;
  delay: number;
  color: string;
  size: number;
}

export interface Bubble {
  on: boolean;
  ch: string;
  /** 释义文字（系统字体；只画在画布上的说明文字用 BODY 栈） */
  gloss: string;
  x: number;
  y: number;
  t: number;
  life: number;
  big: boolean;
}

export class Popups {
  private floats: Float[] = [];
  preview: Bubble = { on: false, ch: '', gloss: '', x: 0, y: 0, t: 0, life: 0, big: false };
  info: Bubble = { on: false, ch: '', gloss: '', x: 0, y: 0, t: 0, life: 0, big: false };
  /** 预览气泡里的方位箭头（多结果时）：'' | 'up' | 'down' | 'left' | 'right' */
  arrow = '';
  constructor() {
    for (let i = 0; i < 12; i++) this.floats.push({ on: false, text: '', x: 0, y: 0, t: 0, delay: 0, color: INK.ink, size: 16 });
  }

  float(text: string, x: number, y: number, color: string = INK.ink, size = 16): void {
    let active = 0;
    for (const f of this.floats) if (f.on && f.t < 0.4) active++;
    if (active >= 3) return;
    for (const f of this.floats) {
      if (f.on) continue;
      f.on = true;
      f.text = text;
      f.x = x + active * 18;
      f.y = y;
      f.t = 0;
      f.delay = active * 0.08;
      f.color = color;
      f.size = size;
      return;
    }
  }

  setPreview(ch: string, x: number, y: number, arrow: string): void {
    const p = this.preview;
    if (!p.on || p.ch !== ch) {
      p.t = 0;
    }
    p.on = true;
    p.ch = ch;
    p.x = x;
    p.y = y;
    this.arrow = arrow;
  }
  hidePreview(): void {
    this.preview.on = false;
  }

  showInfo(ch: string, x: number, y: number, life = 1.6): void {
    const b = this.info;
    b.on = true;
    b.ch = ch;
    const r = RECIPE_MAP.get(ch);
    const base = BASE_MAP.get(ch);
    b.gloss = r ? r.g : base ? base.g : '';
    b.x = x;
    b.y = y;
    b.t = 0;
    b.life = life;
    b.big = true;
  }

  clear(): void {
    for (const f of this.floats) f.on = false;
    this.preview.on = false;
    this.info.on = false;
  }

  update(dt: number): void {
    for (const f of this.floats) {
      if (!f.on) continue;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      if (f.t > 1.1) f.on = false;
    }
    if (this.preview.on) this.preview.t += dt;
    if (this.info.on) {
      this.info.t += dt;
      if (this.info.t > this.info.life) this.info.on = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, bodyFont: string): void {
    for (const f of this.floats) {
      if (!f.on || f.delay > 0) continue;
      const k = easeOutCubic(Math.min(1, f.t / 0.9));
      const a = f.t < 0.75 ? 1 : Math.max(0, 1 - (f.t - 0.75) / 0.35);
      glyphs.label(ctx, f.text, f.x, f.y - k * 34, f.size, f.color, 0.5, a);
    }
    if (this.preview.on) this.drawBubble(ctx, this.preview, bodyFont, false);
    if (this.info.on) this.drawBubble(ctx, this.info, bodyFont, true);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, b: Bubble, bodyFont: string, info: boolean): void {
    const s = easeOutBack(Math.min(1, b.t / 0.12));
    const fade = info && b.t > b.life - 0.3 ? Math.max(0, (b.life - b.t) / 0.3) : 1;
    const r = RECIPE_MAP.get(b.ch);
    const base = BASE_MAP.get(b.ch);
    const py = r?.py ?? base?.py ?? '';
    const w = info ? 150 : 92;
    const h = info ? 62 : 54;
    let x = b.x;
    const y = b.y;
    x = Math.max(w / 2 + 6, Math.min(390 - w / 2 - 6, x));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.shadowColor = 'rgba(46,40,34,0.22)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fillStyle = 'rgba(248,243,232,0.97)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = info ? 'rgba(167,122,67,0.4)' : 'rgba(95,127,106,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (info) {
      glyphs.draw(ctx, b.ch, -w / 2 + 28, -2, 36, INK.ink, 1);
      glyphs.label(ctx, py, -w / 2 + 54, -12, 13, INK.light, 0, 1);
      ctx.font = `12px ${bodyFont}`;
      ctx.fillStyle = INK.ink2;
      ctx.textBaseline = 'middle';
      const g = b.gloss.length > 8 ? b.gloss.slice(0, 8) + '…' : b.gloss;
      ctx.fillText(g, -w / 2 + 54, 10);
    } else if (!b.ch) {
      drawSeal(ctx, seal('未成', 30, 'white', 'kai', 9), 0, 0, 1, 0.04, 1);
    } else {
      glyphs.draw(ctx, b.ch, -14, -2, 34, INK.ink2, 1);
      glyphs.label(ctx, py, 12, 0, 12, INK.light, 0, 1);
      if (this.arrow) {
        ctx.fillStyle = INK.jade;
        ctx.beginPath();
        const ax = 34;
        const ay = -16;
        const d = 5;
        if (this.arrow === 'up') {
          ctx.moveTo(ax, ay - d);
          ctx.lineTo(ax - d, ay + d);
          ctx.lineTo(ax + d, ay + d);
        } else if (this.arrow === 'down') {
          ctx.moveTo(ax, ay + d);
          ctx.lineTo(ax - d, ay - d);
          ctx.lineTo(ax + d, ay - d);
        } else if (this.arrow === 'left') {
          ctx.moveTo(ax - d, ay);
          ctx.lineTo(ax + d, ay - d);
          ctx.lineTo(ax + d, ay + d);
        } else {
          ctx.moveTo(ax + d, ay);
          ctx.lineTo(ax - d, ay - d);
          ctx.lineTo(ax - d, ay + d);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    // 气泡尾巴
    ctx.fillStyle = 'rgba(248,243,232,0.97)';
    ctx.beginPath();
    ctx.moveTo(-6, h / 2 - 1);
    ctx.lineTo(0, h / 2 + 6);
    ctx.lineTo(6, h / 2 - 1);
    ctx.fill();
    ctx.restore();
  }
}
