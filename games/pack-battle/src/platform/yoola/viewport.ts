// 快手端的视口与安全区：尺寸取 main.js 量好的 AIGCUtils.Layout，不碰 DOM / CSS
import { YOOLA } from '../../config.ts';
import { inKwai, kw } from './kwai.ts';

let bottomInset = -1;

export function viewport(): { w: number; h: number; dpr: number } {
  const L = kw().AIGCUtils.Layout;
  return { w: L.w, h: L.h, dpr: window.devicePixelRatio || 1 };
}

/** 顶部让出系统安全区 + 间距保护 + 平台控件（胶囊）；底部让出手势区 */
export function readSafe(out: { t: number; r: number; b: number; l: number }): void {
  if (bottomInset < 0) {
    bottomInset = 0;
    // H5 预览里没有系统信息，不调封装（它会打警告）
    if (inKwai()) {
      const si = kw().KwaiBase.getSystemInfo();
      if (si.windowHeight && si.safeArea) bottomInset = Math.max(0, si.windowHeight - si.safeArea.bottom);
    }
  }
  out.t = kw().AIGCUtils.Layout.safeTop + YOOLA.topGap + YOOLA.topControls;
  out.r = 0;
  out.l = 0;
  out.b = Math.max(bottomInset, YOOLA.minBottom);
}
