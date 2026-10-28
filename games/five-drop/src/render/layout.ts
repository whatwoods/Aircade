// 屏幕适配：390×844 设计帧（第 6.1、6.3 节）
export const FRAME_W = 390;
export const FRAME_H = 844;

export interface Layout {
  vw: number; vh: number; dpr: number;
  /** CSS px / 逻辑 px */
  scale: number;
  /** 帧左上角（CSS px） */
  ox: number; oy: number;
  /** 帧逻辑高度（≥ 844） */
  H: number;
  safeTop: number; safeBottom: number;
  extra: number;
  /** 顶部 HUD 偏移、棋盘偏移、底栏偏移（逻辑 y） */
  topY: number; boardShift: number; barShift: number;
  board: { x: number; y: number; w: number; h: number; cell: number };
  /** 渲染缩放 k = scale × dpr */
  k: number;
}

export function computeLayout(vw: number, vh: number, dprRaw: number, safeTopCss: number, safeBottomCss: number): Layout {
  const dpr = Math.min(2, Math.max(1, dprRaw || 1));
  const scale = Math.min(vw / FRAME_W, vh / FRAME_H, 1.25);
  const H = vh / scale;
  const ox = (vw - FRAME_W * scale) / 2;
  const oy = 0;
  const safeTop = safeTopCss / scale, safeBottom = safeBottomCss / scale;
  const extra = Math.max(0, H - FRAME_H - safeTop - safeBottom);
  const topY = safeTop;
  const boardShift = safeTop + Math.min(extra / 2, 60);
  const barShift = safeTop + extra;
  const cell = 38;
  const board = { x: 24, y: 132 + boardShift, w: cell * 9, h: cell * 15, cell };
  return { vw, vh, dpr, scale, ox, oy, H, safeTop, safeBottom, extra, topY, boardShift, barShift, board, k: scale * dpr };
}

export function toLogical(L: Layout, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - L.ox) / L.scale, y: (cy - L.oy) / L.scale };
}
export function toCss(L: Layout, x: number, y: number): { x: number; y: number } {
  return { x: L.ox + x * L.scale, y: L.oy + y * L.scale };
}
