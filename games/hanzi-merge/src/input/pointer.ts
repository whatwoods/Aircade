/**
 * 指针输入（§3.4 / §8.5）：Pointer Events → 按下 / 拖拽 / 点击。鼠标与触摸一致。
 *  - 拖动开始：移动 ≥ dragStartPx 或按住 ≥ dragStartMs
 *  - 触摸拖拽时，拖拽物显示在手指上方 touchLiftPx（落点按拖拽物中心判定）
 */
import { CONFIG } from '../config.ts';
import type { Stage } from '../render/stage.ts';

export interface PointerHandler {
  /** 按下：返回 true 表示这个位置可以拖（笔架 / 棋盘牌） */
  down(x: number, y: number): boolean;
  dragStart(x: number, y: number): void;
  dragMove(x: number, y: number): void;
  dragEnd(x: number, y: number): void;
  dragCancel(): void;
  tap(x: number, y: number): void;
}

export class Pointer {
  handler: PointerHandler | null = null;
  enabled = true;
  /** 当前拖拽物中心（逻辑坐标） */
  x = 0;
  y = 0;
  /** 原始指针位置 */
  px = 0;
  py = 0;
  pressed = false;
  dragging = false;
  lift = 0;
  private id = -1;
  private sx = 0;
  private sy = 0;
  private t0 = 0;
  private canDrag = false;
  private pt = { x: 0, y: 0 };
  private stage: Stage;

  constructor(stage: Stage) {
    this.stage = stage;
    const el = stage.canvas;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onCancel(e));
    el.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === this.id) this.onCancel(e);
    });
  }

  private logical(e: PointerEvent): void {
    this.stage.toLogical(e.clientX, e.clientY, this.pt);
    this.px = this.pt.x;
    this.py = this.pt.y;
    this.x = this.px;
    this.y = this.py - (this.dragging ? this.lift : 0);
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled || !this.handler || this.id !== -1) return;
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    this.id = e.pointerId;
    try {
      this.stage.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 某些合成事件不支持捕获 */
    }
    this.dragging = false;
    this.lift = e.pointerType === 'mouse' ? 0 : CONFIG.input.touchLiftPx;
    this.logical(e);
    this.sx = this.px;
    this.sy = this.py;
    this.t0 = performance.now();
    this.pressed = true;
    this.canDrag = this.handler.down(this.px, this.py);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.id || !this.handler) return;
    this.logical(e);
    if (!this.dragging && this.canDrag) {
      const d = Math.hypot(this.px - this.sx, this.py - this.sy);
      if (d >= CONFIG.input.dragStartPx) this.begin();
    }
    if (this.dragging) {
      this.y = this.py - this.lift;
      this.handler.dragMove(this.x, this.y);
    }
  }

  private begin(): void {
    this.dragging = true;
    this.y = this.py - this.lift;
    this.handler!.dragStart(this.x, this.y);
  }

  /** 每帧调用：按住不动超过 dragStartMs 也开始拖 */
  update(): void {
    if (this.pressed && !this.dragging && this.canDrag && performance.now() - this.t0 >= CONFIG.input.dragStartMs) {
      this.begin();
      this.handler!.dragMove(this.x, this.y);
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.id || !this.handler) return;
    this.logical(e);
    const h = this.handler;
    const was = this.dragging;
    this.reset();
    if (was) {
      this.y = this.py - this.lift;
      h.dragEnd(this.x, this.y);
    } else h.tap(this.px, this.py);
  }

  private onCancel(e: PointerEvent): void {
    if (e.pointerId !== this.id) return;
    const was = this.dragging;
    this.reset();
    if (was) this.handler?.dragCancel();
  }

  /** 取消当前手势（暂停、弹卡时） */
  cancel(): void {
    if (this.id === -1) return;
    const was = this.dragging;
    try {
      this.stage.canvas.releasePointerCapture(this.id);
    } catch {
      /* 已释放 */
    }
    this.reset();
    if (was) this.handler?.dragCancel();
  }

  private reset(): void {
    this.id = -1;
    this.pressed = false;
    this.dragging = false;
    this.canDrag = false;
  }
}
