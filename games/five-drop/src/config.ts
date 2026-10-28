// 五子落 FIVE DROP —— 唯一的玩法数值来源（见 docs/five-drop.md 第 7.3 节）

export type FullRowMode = 'majority' | 'all' | 'none';
export type ShapeId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' | 'I3' | 'V3' | 'D2';

export interface ColorWeight { fromLevel: number; pure: number; major: number; split: number }

export const CONFIG = {
  board: { cols: 9, rows: 15, hiddenRows: 2 },
  pieces: {
    shapes: ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'I3', 'V3'] as ShapeId[],
    nextCount: 3,
    holdEnabled: true,
  },
  colorWeights: [
    { fromLevel: 1, pure: 40, major: 45, split: 15 },
    { fromLevel: 4, pure: 30, major: 45, split: 25 },
    { fromLevel: 8, pure: 22, major: 43, split: 35 },
  ] as ColorWeight[],
  antiDrought: { forcePureAfter: 5, maxSplitStreak: 2, colorBalanceGain: 0.4, colorBalanceClamp: [0.2, 0.8] as [number, number] },
  crystal: { enabled: true, fromLevel: 3, chance: 0.08, lateLevel: 9, lateChance: 0.06, noConsecutive: true },
  /** 翻色：maxPerPiece = -1 表示不限 */
  invert: { maxPerPiece: -1 },
  gravity: { base: 0.9, decay: 0.86, min: 0.12, softDropSecPerRow: 0.035 },
  lock: { delayMs: 500, maxResets: 15, areMs: 100, hardDropGuardMs: 150 },
  level: { secondsPerLevel: 45, max: 15 },
  garbage: {
    fromLevel: 7,
    intervalByLevel: { 7: 14, 8: 12, 9: 11, 10: 10, 11: 9, 12: 8, 13: 7 } as Record<number, number>,
    warnPieces: 2,
    maxSameRun: 2,
    retries: 20,
  },
  fullRow: { mode: 'majority' as FullRowMode },
  score: {
    lineBase: 100,
    crossStep: 0.5,
    chainMult: [1, 2, 3, 5, 8],
    levelStep: 0.1,
    fullRowPerStone: 15,
    comboStep: 50,
    perfectClear: 2000,
    softDrop: 1,
    hardDrop: 2,
  },
  danger: { topRows: 3 },
  input: {
    axisLockPx: 10,
    tapMaxMs: 250,
    tapMaxPx: 10,
    flickVel: 1.1,
    flickMinPx: 56,
    flickWindowMs: 80,
    dragSensitivity: { low: 1.1, mid: 0.9, high: 0.75 } as Record<'low' | 'mid' | 'high', number>,
    softDragPerRow: 0.8,
    das: 150,
    arr: 40,
    twoFingerTapMs: 250,
  },
  feel: {
    hitstopMs: { mid: 60, heavy: 100 },
    trauma: { light: 0.06, mid: 0.22, heavy: 0.45 },
    traumaDecay: 1.6,
    shakeMaxPx: 12,
  },
  anim: {
    /** 结算各阶段时长（秒），无头模式下忽略 */
    fiveMs: 420,
    multiMs: 520,
    fullRowMs: 360,
    fallColStaggerMs: 18,
    fallGravity: 6000,
    fallMaxMs: 400,
    chainCompress: 0.85,
  },
  /** 机器人与模拟器的时间模型 */
  sim: { resolveStepSec: 0.45 },
};

export type Config = typeof CONFIG;

export function secPerRow(level: number, cfg: Config = CONFIG): number {
  return Math.max(cfg.gravity.min, cfg.gravity.base * Math.pow(cfg.gravity.decay, level - 1));
}

export function garbageInterval(level: number, cfg: Config = CONFIG): number {
  if (level < cfg.garbage.fromLevel) return 0;
  const tbl = cfg.garbage.intervalByLevel;
  let v = 0;
  for (const k of Object.keys(tbl)) {
    const lv = Number(k);
    if (level >= lv) v = tbl[lv];
  }
  return v;
}

export function colorWeightsFor(level: number, cfg: Config = CONFIG): ColorWeight {
  let w = cfg.colorWeights[0];
  for (const cw of cfg.colorWeights) if (level >= cw.fromLevel) w = cw;
  return w;
}

export function levelMult(level: number, cfg: Config = CONFIG): number {
  return 1 + cfg.score.levelStep * (level - 1);
}

export function cloneConfig(): Config {
  return JSON.parse(JSON.stringify(CONFIG)) as Config;
}
