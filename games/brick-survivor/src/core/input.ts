// Pointer + keyboard. Touch drags are relative (finger never covers the core); mouse follows absolutely.
import { config } from '../config';
import type { Viewport } from './viewport';

export interface InputHandlers {
  onDragStart(x: number, y: number): void;
  onKey(code: string): void;
}

export class Input {
  enabled = false;
  /** world x the core should follow */
  targetX = 195;
  keyAxis = 0;
  dragging = false;
  /** world-unit pointer speed estimate (for wind sfx / effects) */
  pointerId = -1;
  lastX = 0;
  lastY = 0;
  mouseMode = false;
  private left = false;
  private right = false;
  private handlers: InputHandlers | null = null;

  constructor(
    private vp: Viewport,
    stage: HTMLElement,
  ) {
    const opts: AddEventListenerOptions = { passive: false };
    stage.addEventListener('pointerdown', (e) => this.down(e), opts);
    window.addEventListener('pointermove', (e) => this.move(e), opts);
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.left = this.right = false;
      this.keyAxis = 0;
      this.dragging = false;
      this.pointerId = -1;
    });
  }

  setHandlers(h: InputHandlers): void {
    this.handlers = h;
  }

  reset(x: number): void {
    this.targetX = x;
    this.dragging = false;
    this.pointerId = -1;
  }

  private down(e: PointerEvent): void {
    // buttons / panels handle their own taps
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('.ui')) return;
    if (e.pointerType !== 'mouse') e.preventDefault();
    if (!this.enabled) return;
    if (this.pointerId !== -1 && e.pointerType !== 'mouse') return;
    this.pointerId = e.pointerId;
    this.dragging = true;
    this.mouseMode = e.pointerType === 'mouse';
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.mouseMode) this.targetX = this.vp.toWorldX(e.clientX);
    this.handlers?.onDragStart(this.vp.toWorldX(e.clientX), this.vp.toWorldY(e.clientY));
  }

  private move(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      // mouse follows absolutely, button or not
      this.mouseMode = true;
      this.targetX = this.vp.toWorldX(e.clientX);
      this.lastX = e.clientX;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const dx = (e.clientX - this.lastX) / this.vp.scale;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.targetX += dx * config.input.dragGain;
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.dragging = false;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') {
      this.left = down;
      e.preventDefault();
    } else if (k === 'ArrowRight' || k === 'KeyD') {
      this.right = down;
      e.preventDefault();
    } else if (down && !e.repeat) {
      this.handlers?.onKey(k);
    }
    this.keyAxis = (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  /** keep the relative target inside the movable range so a drag never has to "unwind" */
  clamp(lo: number, hi: number): void {
    if (this.targetX < lo) this.targetX = lo;
    else if (this.targetX > hi) this.targetX = hi;
  }
}
