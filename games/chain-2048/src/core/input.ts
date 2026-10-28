/**
 * 指针输入（docs §6.4）：按住即瞄准、松手即发射；快速点按直接发射；拖回图腾取消；点按图腾交换。
 * 只认第一个指针。DOM 按钮（[data-ui]）上的按下不进入瞄准。
 */
import { CONFIG } from '../config';
import { toLogical } from './stage';

export interface InputHandlers {
  /** 是否接受场地输入（游戏中且无浮层） */
  enabled(): boolean;
  totem(): { x: number; y: number };
  fire(x: number, y: number): void;
  swap(): void;
  cancel(): void;
  aimStart(): void;
}

export class Input {
  active = false;
  /** 按下的是触摸（触摸才需要放大镜） */
  touch = false;
  /** 鼠标悬停瞄准（桌面） */
  hover = false;
  x = 195;
  y = 300;
  /** 当前是否在图腾上（取消区） */
  overTotem = false;
  private id = -1;
  private mode: 'aim' | 'totem' = 'aim';
  private t0 = 0;
  private x0 = 0;
  private y0 = 0;
  private h: InputHandlers;
  /** 按住时长（用于「手指压住命中点」提示） */
  holdT = 0;

  constructor(el: HTMLElement, h: InputHandlers) {
    this.h = h;
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up, { passive: false });
    window.addEventListener('pointercancel', this.cancelEv);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.h.enabled() && !(e.target as HTMLElement).closest('[data-ui]')) this.h.swap();
    });
    el.addEventListener('pointerleave', () => {
      this.hover = false;
    });
  }

  private inTotem(x: number, y: number): boolean {
    const t = this.h.totem();
    return Math.hypot(x - t.x, y - t.y) <= CONFIG.input.totemRadius;
  }

  reset(): void {
    this.active = false;
    this.id = -1;
    this.hover = false;
  }

  private readonly down = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    if (!this.h.enabled()) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    if (this.id !== -1) return;
    this.id = e.pointerId;
    const p = toLogical(e.clientX, e.clientY);
    this.x = this.x0 = p.x;
    this.y = this.y0 = p.y;
    this.t0 = performance.now();
    this.touch = e.pointerType !== 'mouse';
    this.mode = this.inTotem(p.x, p.y) ? 'totem' : 'aim';
    this.overTotem = this.mode === 'totem';
    this.active = this.mode === 'aim';
    this.holdT = 0;
    if (this.active) this.h.aimStart();
  };

  private readonly move = (e: PointerEvent): void => {
    const p = toLogical(e.clientX, e.clientY);
    if (e.pointerId !== this.id) {
      if (e.pointerType === 'mouse' && this.id === -1) {
        this.x = p.x;
        this.y = p.y;
        this.hover = this.h.enabled() && p.y > 96 && p.y < 760 && p.x >= 0 && p.x <= 390 && !(e.target as HTMLElement).closest?.('[data-ui]');
        this.touch = false;
      }
      return;
    }
    e.preventDefault();
    this.x = p.x;
    this.y = p.y;
    this.overTotem = this.inTotem(p.x, p.y);
    if (this.mode === 'totem' && !this.overTotem && Math.hypot(p.x - this.x0, p.y - this.y0) > CONFIG.input.tapMovePx) {
      this.mode = 'aim';
      this.active = true;
      this.h.aimStart();
    }
  };

  private readonly up = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const p = toLogical(e.clientX, e.clientY);
    this.x = p.x;
    this.y = p.y;
    const dt = performance.now() - this.t0;
    const was = this.mode;
    const wasActive = this.active;
    this.id = -1;
    this.active = false;
    this.hover = e.pointerType === 'mouse';
    if (!this.h.enabled()) return;
    const inT = this.inTotem(p.x, p.y);
    if (was === 'totem' && !wasActive) {
      if (inT && dt < CONFIG.input.swapTapMs) this.h.swap();
      else if (inT) this.h.cancel();
      return;
    }
    if (inT) {
      this.h.cancel();
      return;
    }
    // 快速点按与松手发射都朝松手点发射
    this.h.fire(p.x, p.y);
  };

  private readonly cancelEv = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.id = -1;
    this.active = false;
  };
}
