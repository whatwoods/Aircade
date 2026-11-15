// 快手端输入：画布上的 touchstart / touchmove / touchend / touchcancel（快手适配层把 ks.onTouch* 转成 DOM 风格事件）。
// 手势语义和网页的 core/input.ts 一致：轻点 / 长按 / 拖拽 / 第二指轻点；不处理键盘。
// H5 预览里额外认鼠标（左键 = 单指，右键 = 旋转），真机上没有。
import { INPUT } from '../../config.ts';
import { input, scaleToCss } from '../../core/input.ts';
import { toLogical } from '../../render/stage.ts';
import { now } from '../now.ts';
import { inKwai, kw } from './kwai.ts';

interface Touch {
  identifier: number;
  clientX: number;
  clientY: number;
}
interface TouchEv {
  changedTouches: ArrayLike<Touch>;
  preventDefault?: () => void;
}

const P = { x: 0, y: 0 };
let seen = false;
/** 用户碰过屏幕了吗（H5 预览的音频解锁） */
export const gestureSeen = (): boolean => seen;
const MOUSE_ID = 100000;

export function initTouchInput(canvas: HTMLCanvasElement): void {
  // 屏幕坐标 → 画布 CSS 坐标（快手适配层的 rect 就是整个窗口）
  const css = (cx: number, cy: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const L = kw().AIGCUtils.Layout;
    return [(cx - r.left) * (L.w / (r.width || L.w)), (cy - r.top) * (L.h / (r.height || L.h))];
  };

  const begin = (id: number, cx: number, cy: number, touch: boolean): void => {
    const [x, y] = css(cx, cy);
    toLogical(x, y, P);
    input.touch = touch;
    seen = true;
    if (input.id === -1) {
      input.id = id;
      input.type = touch ? 'touch' : 'mouse';
      input.x = input.x0 = P.x;
      input.y = input.y0 = P.y;
      input.t0 = now();
      input.dragging = false;
      input.longFired = false;
      input.pressed = true;
      input.handler?.down(P.x, P.y);
    } else if (input.id2 === -1) {
      input.id2 = id;
      input.x2 = x;
      input.y2 = y;
      input.t2 = now();
      input.moved2 = false;
    }
  };

  const move = (id: number, cx: number, cy: number, touch: boolean): void => {
    const [x, y] = css(cx, cy);
    toLogical(x, y, P);
    if (id === input.id) {
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
    } else if (id === input.id2) {
      if (Math.hypot(x - input.x2, y - input.y2) > INPUT.dragThreshold) input.moved2 = true;
    } else if (!touch && input.id === -1) {
      input.hx = P.x;
      input.hy = P.y;
      input.handler?.hover(P.x, P.y);
    }
  };

  const end = (id: number, cx: number, cy: number, cancelled: boolean, touch: boolean): void => {
    const [x, y] = css(cx, cy);
    toLogical(x, y, P);
    if (id === input.id) {
      const dur = now() - input.t0;
      const tap = !input.dragging && !input.longFired && dur <= INPUT.tapMaxMs;
      input.id = -1;
      input.pressed = false;
      const wasDrag = input.dragging;
      input.dragging = false;
      if (cancelled) input.handler?.cancel();
      else input.handler?.up(P.x, P.y, tap);
      if (wasDrag && !touch) {
        input.hx = P.x;
        input.hy = P.y;
      }
    } else if (id === input.id2) {
      const dur = now() - input.t2;
      if (!cancelled && !input.moved2 && dur <= INPUT.tapMaxMs + 100) input.handler?.rotate();
      input.id2 = -1;
    }
  };

  const each = (e: TouchEv, fn: (t: Touch) => void): void => {
    e.preventDefault?.();
    for (let i = 0; i < e.changedTouches.length; i++) fn(e.changedTouches[i]);
  };
  const opt = { passive: false } as AddEventListenerOptions;
  canvas.addEventListener('touchstart', ((e: TouchEv) => each(e, (t) => begin(t.identifier, t.clientX, t.clientY, true))) as unknown as EventListener, opt);
  canvas.addEventListener('touchmove', ((e: TouchEv) => each(e, (t) => move(t.identifier, t.clientX, t.clientY, true))) as unknown as EventListener, opt);
  canvas.addEventListener('touchend', ((e: TouchEv) => each(e, (t) => end(t.identifier, t.clientX, t.clientY, false, true))) as unknown as EventListener, opt);
  canvas.addEventListener('touchcancel', ((e: TouchEv) => each(e, (t) => end(t.identifier, t.clientX, t.clientY, true, true))) as unknown as EventListener, opt);

  if (!inKwai()) {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) input.handler?.rotate();
      else if (e.button === 0) begin(MOUSE_ID, e.clientX, e.clientY, false);
    });
    canvas.addEventListener('mousemove', (e) => move(MOUSE_ID, e.clientX, e.clientY, false));
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) end(MOUSE_ID, e.clientX, e.clientY, false, false);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
