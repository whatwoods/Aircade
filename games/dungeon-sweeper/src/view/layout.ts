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
