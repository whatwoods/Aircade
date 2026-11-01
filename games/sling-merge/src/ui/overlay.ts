/**
 * 浮层基类（docs §6.8）：遮罩 0.2 s 淡入；面板弹簧进场 0.35 s，退场 0.2 s ease-in。
 */
import { fruitDef } from '../config';
import type { Expression } from '../game/fruits';
import { drawFace, type FaceState } from '../render/faces';
import { drawFruitBody, drawGloss, kingCrown, pineappleCrown, SPRITE_EXTENT } from '../render/fruitArt';

export class Overlay {
  readonly el: HTMLElement;
  readonly panel: HTMLElement;
  isOpen = false;
  private hideTimer = 0;

  constructor(root: HTMLElement, id: string, label: string, light = false) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'overlay ui-block' + (light ? ' light' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="mask"></div><div class="panel"></div>';
    root.appendChild(el);
    this.el = el;
    this.panel = el.querySelector('.panel')!;
  }

  show(focus?: HTMLElement | null): void {
    clearTimeout(this.hideTimer);
    this.isOpen = true;
    const cl = this.el.classList;
    cl.remove('closing');
    if (!cl.contains('on')) {
      cl.add('on');
      void this.el.offsetWidth;
    }
    cl.add('open');
    if (focus) {
      try {
        focus.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  hide(instant = false): void {
    if (!this.isOpen && !this.el.classList.contains('on')) return;
    this.isOpen = false;
    const cl = this.el.classList;
    cl.remove('open');
    clearTimeout(this.hideTimer);
    const ae = document.activeElement as HTMLElement | null;
    if (ae && this.el.contains(ae)) ae.blur();
    if (instant) {
      cl.remove('closing', 'on');
      return;
    }
    cl.add('closing');
    this.hideTimer = window.setTimeout(() => {
      cl.remove('closing', 'on');
    }, 210);
  }
}

/** 创建一个果冻按钮 */
export function jellyButton(cls: string, html: string, label?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'jelly ' + cls;
  b.innerHTML = html;
  if (label) b.setAttribute('aria-label', label);
  return b;
}

/** 在 DOM 画布上绘制一个精灵图标画布（保持清晰：背板 = 逻辑尺寸 × pxRatio） */
export function canvasFrom(src: HTMLCanvasElement, cssSize: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.style.width = `${cssSize}px`;
  c.style.height = `${cssSize}px`;
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return c;
}


/** 带指定表情的水果头像（面板用）；size = 直径（逻辑 px）；返回的画布 CSS 尺寸已设置 */
export function portrait(level: number, size: number, ratio: number, expr: Expression, after?: (ctx: CanvasRenderingContext2D, r: number) => void): HTMLCanvasElement {
  const r = fruitDef(level).radius;
  const ext = SPRITE_EXTENT[level - 1]! * r + 6;
  const k = size / (2 * r);
  const css = ext * 2 * k;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(css * ratio));
  c.height = c.width;
  c.style.width = `${css}px`;
  c.style.height = `${css}px`;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(c.width / (ext * 2), c.height / (ext * 2));
  ctx.translate(ext, ext);
  if (level === 9) {
    ctx.save();
    ctx.translate(0, -0.82 * r);
    pineappleCrown(ctx, r);
    ctx.restore();
  }
  drawFruitBody(ctx, level, r);
  drawGloss(ctx, level, r);
  const face: FaceState = { expr, lookX: 0, lookY: 0.15, open: 1, wink: false, t: 0.4, blush: 1.2 };
  drawFace(ctx, level, r, face);
  if (level === 11) {
    ctx.save();
    ctx.translate(0, -0.84 * r);
    kingCrown(ctx, r);
    ctx.restore();
  }
  if (after) after(ctx, r);
  return c;
}
