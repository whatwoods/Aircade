// 快手端的帧入口：kwaiStandard/main.js 的 draw() 只调 AIGCUtils.Render.draw
import { kw } from './kwai.ts';

function render(): NonNullable<ReturnType<typeof kw>['AIGCUtils']['Render']> {
  const u = kw().AIGCUtils;
  return u.Render || (u.Render = {});
}

export function bindDraw(fn: () => void): void {
  render().draw = fn;
}

/**
 * 先把 2D 上下文占住：锁定的 main.js 加载时会先取 webgl，晚了 2d 就是 null。
 * 之后第一次 draw 才真正启动游戏（那时 main.js 已经量好了 AIGCUtils.Layout）。
 */
export function claimCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const w = window as unknown as { canvas?: HTMLCanvasElement; kshelper?: { GetMainCanvas(id: string): HTMLCanvasElement } };
  const canvas = w.canvas || w.kshelper!.GetMainCanvas('canvas');
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D 不可用');
  patch2d(ctx);
  return { canvas, ctx };
}

/** 首帧启动：boot 只跑一次，之后 boot 内部会用 bindDraw 换成真正的帧函数 */
export function bootOnFirstDraw(boot: () => void): void {
  let booted = false;
  render().draw = () => {
    if (booted) return;
    booted = true;
    try {
      boot();
    } catch (e) {
      console.error('Runtime', '启动失败', e);
      return;
    }
    render().draw?.();
  };
}

/**
 * 快手的 2D 实现不是浏览器，较新的 roundRect 未必有；缺了就补在原型上（补不上原型就补实例）。
 * 只覆盖本游戏用到的写法：半径是一个数或数组的第一个数。
 */
export function patch2d(ctx: CanvasRenderingContext2D | null): void {
  if (!ctx || typeof ctx.roundRect === 'function') return;
  const proto = Object.getPrototypeOf(ctx) as object | null;
  const target = (proto && proto !== Object.prototype ? proto : ctx) as { roundRect?: unknown };
  target.roundRect = function (this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radii?: number | number[]): void {
    let r = typeof radii === 'number' ? radii : Array.isArray(radii) && typeof radii[0] === 'number' ? radii[0] : 0;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}
