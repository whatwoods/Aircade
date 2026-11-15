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
