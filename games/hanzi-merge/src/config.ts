/** 造字记 — 全部可调数值（docs/hanzi-merge.md §3.12）。关卡数据见 src/data/levels.ts。 */

export const CONFIG = {
  /** 4×4：盘面会真的被占满（满了只能花墨洗掉旧牌），牌也更大。focus = 引导与调试默认格 */
  board: { cols: 4, rows: 4, focus: 9 },
  rack: { preview: 2 },
  director: {
    guaranteeWindow: 5,
    earliestOrderWeight: 1.5,
    maxDecoyStreak: 2,
  },
  hint: { costFromChapter: 2, cost: 1 },
  undo: { perLevel: 1 },
  score: {
    orderPerLeaf: 100,
    extraPerLeaf: 10,
    discovery: 50,
    multiOrder: 100,
    inkLeft: 40,
  },
  endless: {
    startInk: 30,
    refundBonus: 1,
    refundDecayStages: 2,
    refundMin: -1,
    ordersPerStage: 5,
    decoyStart: 0.12,
    decoyStep: 0.04,
    decoyMax: 0.4,
    active: 3,
  },
  input: {
    dragStartPx: 6,
    dragStartMs: 180,
    touchLiftPx: 64,
    centerZone: 0.18,
  },
  fx: {
    mergeMs: 640,
    discoveryMs: 1100,
    deliverMs: 700,
    trauma: { light: 0.04, medium: 0.16, heavy: 0.3 },
    hitstop: { medium: 40, heavy: 80 },
    maxShake: 5,
    shakeRot: 0.5,
    traumaDecay: 1.6,
    maxParticles: 220,
  },
  card: { minShowMs: 500 },
  sim: {
    seeds: 200,
    diligentMinClear: 0.97,
    secPerActionDiligent: 1.8,
    secPerActionNovice: 3.0,
    secPerCard: 3.0,
  },
} as const;

/** 布局（逻辑像素，390×844），§8.4 */
export const LAYOUT = {
  W: 390,
  H: 844,
  cell: 82,
  gap: 8,
  boardX: 19,
  boardY: 230,
  scrollY: 58,
  scrollW: 112,
  scrollH: 124,
  scrollXs: [13, 139, 265],
  ink: { x: 16, y: 636, w: 56, h: 92 },
  rackCur: { x: 88, y: 638, w: 88, h: 88 },
  rackNext: [
    { x: 188, y: 652, w: 56, h: 56 },
    { x: 252, y: 660, w: 44, h: 44 },
  ],
  bowl: { x: 306, y: 640, w: 70, h: 70 },
  undoBtn: { x: 16, y: 770, w: 96, h: 44 },
  tipBar: { x: 120, y: 770, w: 254, h: 44 },
  pauseBtn: { x: 12, y: 6, w: 44, h: 44 },
} as const;

/** 盘面牌相对设计基准（66 px 格）的缩放 */
export const BS = LAYOUT.cell / 66;

export function cellXY(i: number): { x: number; y: number } {
  const c = i % CONFIG.board.cols;
  const r = Math.floor(i / CONFIG.board.cols);
  return { x: LAYOUT.boardX + c * (LAYOUT.cell + LAYOUT.gap), y: LAYOUT.boardY + r * (LAYOUT.cell + LAYOUT.gap) };
}
