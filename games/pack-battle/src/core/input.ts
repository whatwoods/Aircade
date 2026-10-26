// 指针管理：轻点 / 长按 / 拖拽 / 第二指轻点；屏幕 → 逻辑坐标
import { INPUT } from '../config.ts';
import { toLogical } from '../render/stage.ts';

export interface InputHandler {
  down(x: number, y: number): void;
  dragStart(x: number, y: number): void;
  drag(x: number, y: number): void;
  up(x: number, y: number, tap: boolean): void;
  long(x: number, y: number): void;
  cancel(): void;
  rotate(): void;
  hover(x: number, y: number): void;
  key(code: string): void;
  wheel(): void;
}

const P = { x: 0, y: 0 };

export const input = {
  handler: null as InputHandler | null,
  /** 主指针 */
  id: -1,
  type: 'mouse' as string,
  x: 0,
  y: 0,
  x0: 0,
  y0: 0,
  t0: 0,
  dragging: false,
  longFired: false,
  pressed: false,
  /** 第二指 */
  id2: -1,
  x2: 0,
  y2: 0,
  t2: 0,
  moved2: false,
  /** 鼠标悬停（逻辑坐标） */
  hx: -999,
  hy: -999,
  lastWheel: 0,
  /** 最近一次是否为触屏操作 */
  touch: false,
};

function logical(e: PointerEvent): void {
  toLogical(e.clientX, e.clientY, P);
}

export function initInput(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    logical(e);
    input.touch = e.pointerType !== 'mouse';
    if (e.pointerType === 'mouse' && e.button === 2) {
      input.handler?.rotate();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (input.id === -1) {
      input.id = e.pointerId;
      input.type = e.pointerType;
      input.x = input.x0 = P.x;
      input.y = input.y0 = P.y;
      input.t0 = performance.now();
      input.dragging = false;
      input.longFired = false;
      input.pressed = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      input.handler?.down(P.x, P.y);
    } else if (input.id2 === -1) {
      input.id2 = e.pointerId;
      input.x2 = e.clientX;
      input.y2 = e.clientY;
      input.t2 = performance.now();
      input.moved2 = false;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    logical(e);
    // 拖拽中按下右键（和弦按键只触发 pointermove）：旋转
    if (e.pointerType === 'mouse' && e.button === 2 && (e.buttons & 2) !== 0) input.handler?.rotate();
    if (e.pointerId === input.id) {
      input.x = P.x;
      input.y = P.y;
      if (!input.dragging) {
        const d = Math.hypot(P.x - input.x0, P.y - input.y0);
        if (d * scaleToCss() > INPUT.dragThreshold) {
          input.dragging = true;
          input.handler?.dragStart(P.x, P.y);
        }
      }
      if (input.dragging) input.handler?.drag(P.x, P.y);
    } else if (e.pointerId === input.id2) {
      if (Math.hypot(e.clientX - input.x2, e.clientY - input.y2) > INPUT.dragThreshold) input.moved2 = true;
    } else if (e.pointerType === 'mouse' && input.id === -1) {
      input.hx = P.x;
      input.hy = P.y;
      input.handler?.hover(P.x, P.y);
    }
  });
  const end = (e: PointerEvent, cancelled: boolean): void => {
    logical(e);
    if (e.pointerId === input.id) {
      const dur = performance.now() - input.t0;
      const tap = !input.dragging && !input.longFired && dur <= INPUT.tapMaxMs;
      input.id = -1;
      input.pressed = false;
      const wasDrag = input.dragging;
      input.dragging = false;
      if (cancelled) input.handler?.cancel();
      else input.handler?.up(P.x, P.y, tap);
      if (wasDrag && e.pointerType === 'mouse') {
        input.hx = P.x;
        input.hy = P.y;
      }
    } else if (e.pointerId === input.id2) {
      const dur = performance.now() - input.t2;
      if (!cancelled && !input.moved2 && dur <= INPUT.tapMaxMs + 100) input.handler?.rotate();
      input.id2 = -1;
    }
  };
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId !== input.id) return;
    // 拖拽中右键会弹 contextmenu 并让浏览器释放捕获：左键仍按着就重新捕获，别取消拖拽
    if (e.pointerType === 'mouse' && (e.buttons & 1) !== 0) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 画布全屏，没有捕获也能收到移动事件 */
      }
      return;
    }
    end(e, true);
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && input.id === -1) {
      input.hx = -999;
      input.hy = -999;
      input.handler?.hover(-999, -999);
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - input.lastWheel < 160) return;
      input.lastWheel = now;
      input.handler?.wheel();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Escape' || e.code.startsWith('Digit') || e.code === 'KeyR') e.preventDefault();
    input.handler?.key(e.code);
  });
  // 禁止双指缩放 / 长按菜单 / 选中
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
}

let cssScale = 1;
export function setInputScale(s: number): void {
  cssScale = s;
}
function scaleToCss(): number {
  return cssScale;
}

/** 失焦等情况：取消当前手势 */
export function cancelInput(): void {
  if (input.id !== -1) {
    input.id = -1;
    input.pressed = false;
    input.dragging = false;
    input.handler?.cancel();
  }
  input.id2 = -1;
}

/** 每帧检查长按 */
export function updateInput(): void {
  if (input.id !== -1 && !input.dragging && !input.longFired) {
    if (performance.now() - input.t0 >= INPUT.longPressMs) {
      input.longFired = true;
      input.handler?.long(input.x, input.y);
    }
  }
}
