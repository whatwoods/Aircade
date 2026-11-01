import { CONFIG } from '../config';

export interface InputHandler {
  /** 主指针按下（左键/触摸） */
  onDown(x: number, y: number, mouse: boolean): void;
  /** 指针移动；down = 主指针按下中 */
  onMove(x: number, y: number, down: boolean, mouse: boolean): void;
  /** 主指针抬起；moved = 是否超过拖动阈值 */
  onUp(x: number, y: number, moved: boolean, longFired: boolean, cancelled: boolean): void;
  onTap(x: number, y: number, mouse: boolean): void;
  onLongPress(x: number, y: number): void;
  onContext(x: number, y: number): void;
  onLeave(): void;
  onWheel(x: number, y: number, dir: number): void;
}

/**
 * 指针输入：单指追踪、tap / 长按 / 拖动 / 右键 / 悬停。
 * 坐标为相对于目标元素左上角的 CSS 像素。
 */
export class Input {
  private el: HTMLElement;
  private h: InputHandler;
  private rect: DOMRect;
  private active = -1;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private lastX = 0;
  private lastY = 0;
  private isMouse = false;
  moved = false;
  longFired = false;
  enabled = true;

  constructor(el: HTMLElement, h: InputHandler) {
    this.el = el;
    this.h = h;
    this.rect = el.getBoundingClientRect();
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up, { passive: false });
    el.addEventListener('pointercancel', this.cancel, { passive: false });
    el.addEventListener('pointerleave', this.leave);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', this.wheel, { passive: false });
  }

  updateRect(): void {
    this.rect = this.el.getBoundingClientRect();
  }

  get pressing(): boolean {
    return this.active !== -1;
  }
  get pressX(): number {
    return this.lastX;
  }
  get pressY(): number {
    return this.lastY;
  }
  get startX(): number {
    return this.downX;
  }
  get startY(): number {
    return this.downY;
  }

  /** 长按蓄力进度 0..1（未在蓄力时为 -1） */
  pressProgress(now: number): number {
    if (this.active === -1 || this.moved || this.longFired) return -1;
    const t = now - this.downT - CONFIG.input.longPressHintMs;
    if (t < 0) return -1;
    return Math.min(1, t / (CONFIG.input.longPressMs - CONFIG.input.longPressHintMs));
  }

  update(now: number): void {
    if (this.active === -1 || this.moved || this.longFired) return;
    if (now - this.downT >= CONFIG.input.longPressMs) {
      this.longFired = true;
      this.h.onLongPress(this.downX, this.downY);
    }
  }

  /** 打断当前按压（例如弹出界面） */
  reset(): void {
    this.active = -1;
    this.moved = false;
    this.longFired = false;
  }

  private pos(e: PointerEvent | WheelEvent): [number, number] {
    return [e.clientX - this.rect.left, e.clientY - this.rect.top];
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const [x, y] = this.pos(e);
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button === 2) {
      this.h.onContext(x, y);
      return;
    }
    if (mouse && e.button !== 0) return;
    if (this.active !== -1) return; // 只追踪第一个指针
    this.active = e.pointerId;
    this.isMouse = mouse;
    this.downX = this.lastX = x;
    this.downY = this.lastY = y;
    this.downT = performance.now();
    this.moved = false;
    this.longFired = false;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.h.onDown(x, y, mouse);
  };

  private move = (e: PointerEvent): void => {
    const [x, y] = this.pos(e);
    if (e.pointerId === this.active) {
      e.preventDefault();
      this.lastX = x;
      this.lastY = y;
      const dx = x - this.downX;
      const dy = y - this.downY;
      if (!this.moved && dx * dx + dy * dy > CONFIG.input.tapSlopPx * CONFIG.input.tapSlopPx) this.moved = true;
      this.h.onMove(x, y, true, this.isMouse);
    } else if (this.active === -1) {
      this.h.onMove(x, y, false, e.pointerType === 'mouse');
    }
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.active) return;
    e.preventDefault();
    const [x, y] = this.pos(e);
    const moved = this.moved;
    const lf = this.longFired;
    const mouse = this.isMouse;
    this.active = -1;
    if (this.enabled && !moved && !lf) this.h.onTap(x, y, mouse);
    this.h.onUp(x, y, moved, lf, false);
  };

  private cancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.active) return;
    this.active = -1;
    this.h.onUp(this.lastX, this.lastY, this.moved, this.longFired, true);
  };

  private leave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && this.active === -1) this.h.onLeave();
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const [x, y] = this.pos(e);
    this.h.onWheel(x, y, e.deltaY > 0 ? -1 : 1);
  };
}
