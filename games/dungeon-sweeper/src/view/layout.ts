import { CONFIG } from '../config';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  vw: number;
  vh: number;
  /** 游戏栏在视口中的位置（CSS px） */
  colX: number;
  colW: number;
  colH: number;
  dpr: number;
  /** UI 缩放（以 390 宽参考布局为 1） */
  s: number;
  cell: number;
  frame: number;
  /** 棋盘格区（栏坐标） */
  board: Rect;
  /** 棋盘外框 */
  boardOuter: Rect;
  /** 内容左边界（外框左） */
  cl: number;
  hudTop: number;
  badge: Rect;
  hp: Rect;
  xp: Rect;
  pause: Rect;
  scoreLine: Rect;
  message: Rect;
  roster: Rect;
  hint: Rect;
  showHint: boolean;
  safeTop: number;
  safeBottom: number;
  /** 横屏手机：棋盘在左、HUD 在右侧一栏 */
  landscape: boolean;
  /** HUD 底板（盾徽 + 血条 + 经验） */
  hudPlate: Rect;
  /** 引导气泡 / 提示条所在区域中心与宽度（栏坐标） */
  side: { cx: number; w: number; bubbleTop: number; toastTop: number };
}

const COLS = CONFIG.board.cols;
const ROWS = CONFIG.board.rows;
/** 参考布局（s = 1）各段高度 */
const H_TOP = 64;
const GAP1 = 8;
const H_SCORE = 22;
const GAP2 = 10;
const FRAME = 6;
const GAP3 = 10;
const H_MSG = 22;
const GAP4 = 6;
const H_ROSTER = 76;
const HUD_TOTAL = H_TOP + GAP1 + H_SCORE + GAP2 + 2 * FRAME + GAP3 + H_MSG + GAP4 + H_ROSTER; // 230
const REF_OUTER = 372;

export function computeLayout(vw: number, vh: number, safeTop: number, safeBottom: number, maxDpr: number): Layout {
  const dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1));
  // 横屏且高度放不下「HUD + 12 行」的竖排：改为左右布局
  if (vw >= vh * 1.2 && vh < 620) return landscapeLayout(vw, vh, safeTop, safeBottom, dpr);
  const colW = Math.floor(Math.min(vw, vh * 0.5625, 520));
  const colX = Math.floor((vw - colW) / 2);
  const availH = vh - safeTop - safeBottom - 32;
  // 宽度限制
  const cellW = Math.floor((colW - 18 - 2 * FRAME) / COLS);
  // 高度限制：HUD 随 s 缩放，s = (9c + 12)/372
  const k = HUD_TOTAL / REF_OUTER;
  const cellH = Math.floor((availH - k * 2 * FRAME) / (k * COLS + ROWS));
  const cell = Math.max(26, Math.min(64, cellW, cellH));
  const outerW = cell * COLS + 2 * FRAME;
  const s = Math.max(0.7, Math.min(1.4, outerW / REF_OUTER));
  const frame = Math.round(FRAME * s);
  const ow = cell * COLS + 2 * frame;
  const oh = cell * ROWS + 2 * frame;
  const contentH = (H_TOP + GAP1 + H_SCORE + GAP2 + GAP3 + H_MSG + GAP4 + H_ROSTER) * s + oh;
  const spare = Math.max(0, vh - safeTop - safeBottom - contentH);
  const top = Math.round(safeTop + Math.max(8, spare * 0.45));
  const cl = Math.round((colW - ow) / 2);
  const S = (v: number) => Math.round(v * s);
  const boardOuter: Rect = { x: cl, y: top + S(H_TOP + GAP1 + H_SCORE + GAP2), w: ow, h: oh };
  const board: Rect = { x: cl + frame, y: boardOuter.y + frame, w: cell * COLS, h: cell * ROWS };
  const msgY = boardOuter.y + oh + S(GAP3);
  const rosterY = msgY + S(H_MSG + GAP4);
  const hintY = rosterY + S(H_ROSTER) + S(20);
  const showHint = hintY + S(24) <= vh - safeBottom - 4;
  return {
    vw,
    vh,
    colX,
    colW,
    colH: vh,
    dpr,
    s,
    cell,
    frame,
    board,
    boardOuter,
    cl,
    hudTop: top,
    badge: { x: cl + S(3), y: top + S(4), w: S(52), h: S(56) },
    hp: { x: cl + S(65), y: top + S(8), w: S(252), h: S(22) },
    xp: { x: cl + S(65), y: top + S(38), w: S(252), h: S(12) },
    pause: { x: cl + ow - S(43), y: top + S(10), w: S(40), h: S(40) },
    scoreLine: { x: cl + S(6), y: top + S(H_TOP + GAP1), w: ow - S(12), h: S(H_SCORE) },
    message: { x: cl + S(6), y: msgY, w: ow - S(12), h: S(H_MSG) },
    roster: { x: cl + S(6), y: rosterY, w: ow - S(12), h: S(H_ROSTER) },
    hint: { x: cl + S(6), y: hintY, w: ow - S(12), h: S(24) },
    showHint,
    safeTop,
    safeBottom,
    landscape: false,
    hudPlate: { x: cl, y: top, w: ow, h: S(62) },
    side: { cx: colW / 2, w: Math.min(colW * 0.92, 360), bubbleTop: boardOuter.y + oh + 6, toastTop: boardOuter.y + 8 },
  };
}

const PANEL_H = H_TOP + GAP1 + H_SCORE + GAP2 + H_MSG + GAP4 + H_ROSTER; // 208
const PANEL_W = REF_OUTER;

function landscapeLayout(vw: number, vh: number, safeTop: number, safeBottom: number, dpr: number): Layout {
  const availH = vh - safeTop - safeBottom - 12;
  const frame0 = 5;
  const cell = Math.max(20, Math.min(64, Math.floor((availH - 2 * frame0) / ROWS)));
  const ow0 = cell * COLS + 2 * frame0;
  const GAP = 18;
  const PAD = 10;
  const s = Math.max(0.7, Math.min(1.15, (availH - 8) / (PANEL_H + 34), (vw - ow0 - GAP - 2 * PAD) / PANEL_W));
  const frame = Math.max(4, Math.round(FRAME * Math.min(1, cell / 40)));
  const ow = cell * COLS + 2 * frame;
  const oh = cell * ROWS + 2 * frame;
  const S = (v: number) => Math.round(v * s);
  const pw = S(PANEL_W);
  const colW = Math.min(vw, ow + GAP + pw + 2 * PAD);
  const colX = Math.floor((vw - colW) / 2);
  const bx = PAD;
  const by = Math.round(safeTop + Math.max(6, (vh - safeTop - safeBottom - oh) / 2));
  const boardOuter: Rect = { x: bx, y: by, w: ow, h: oh };
  const board: Rect = { x: bx + frame, y: by + frame, w: cell * COLS, h: cell * ROWS };
  const x0 = bx + ow + GAP;
  const panelH = S(PANEL_H) + S(30);
  const top = Math.round(safeTop + Math.max(6, (vh - safeTop - safeBottom - panelH) / 2));
  const msgY = top + S(H_TOP + GAP1 + H_SCORE + GAP2);
  const rosterY = msgY + S(H_MSG + GAP4);
  const hintY = rosterY + S(H_ROSTER) + S(6);
  return {
    vw,
    vh,
    colX,
    colW,
    colH: vh,
    dpr,
    s,
    cell,
    frame,
    board,
    boardOuter,
    cl: bx,
    hudTop: top,
    badge: { x: x0 + S(3), y: top + S(4), w: S(52), h: S(56) },
    hp: { x: x0 + S(65), y: top + S(8), w: S(252), h: S(22) },
    xp: { x: x0 + S(65), y: top + S(38), w: S(252), h: S(12) },
    pause: { x: x0 + pw - S(43), y: top + S(10), w: S(40), h: S(40) },
    scoreLine: { x: x0 + S(6), y: top + S(H_TOP + GAP1), w: pw - S(12), h: S(H_SCORE) },
    message: { x: x0 + S(6), y: msgY, w: pw - S(12), h: S(H_MSG) },
    roster: { x: x0 + S(6), y: rosterY, w: pw - S(12), h: S(H_ROSTER) },
    hint: { x: x0 + S(6), y: hintY, w: pw - S(12), h: S(24) },
    showHint: hintY + S(24) <= vh - safeBottom - 2,
    safeTop,
    safeBottom,
    landscape: true,
    hudPlate: { x: x0, y: top, w: pw, h: S(62) },
    side: { cx: x0 + pw / 2, w: pw, bubbleTop: msgY, toastTop: rosterY },
  };
}

export function cellRect(L: Layout, i: number): Rect {
  const x = i % COLS;
  const y = (i / COLS) | 0;
  return { x: L.board.x + x * L.cell, y: L.board.y + y * L.cell, w: L.cell, h: L.cell };
}

export function cellAt(L: Layout, px: number, py: number): number {
  const x = Math.floor((px - L.board.x) / L.cell);
  const y = Math.floor((py - L.board.y) / L.cell);
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
  return y * COLS + x;
}
