/**
 * 全部玩法数值（docs/chain-2048.md §7.1）。纯视觉的微调常量可以就近写在渲染代码里。
 * 本文件不得引用 DOM，scripts/sim.ts 会在 Node 里直接 import。
 */

export interface StageCfg {
  /** 轨道 id：0=A 蛇庭 1=B 日轮 2=C 双蛇 3=D 金阶 */
  track: number;
  /** 基础推进速度 px/s */
  vBase: number;
  /** 关内爬升（每秒增加的比例） */
  creep: number;
  /** 出生最低等级（2^lo） */
  lo: number;
  /** 出生最高等级 */
  hi: number;
  /** 金印等级（2^sealLevel） */
  sealLevel: number;
  /** 封印配额 */
  quota: number;
  /** 阶梯片段概率 */
  stair: number;
}

const S = (track: number, vBase: number, creep: number, lo: number, hi: number, sealLevel: number, quota: number, stair: number): StageCfg =>
  ({ track, vBase, creep, lo, hi, sealLevel, quota, stair });

export const CONFIG = {
  logic: {
    /** 固定步长 120 Hz */
    fixedDt: 1 / 120,
    maxStepsPerFrame: 8,
  },
  ball: {
    D: 40,
    /** 相邻两珠「紧贴」的容差 px */
    joinEps: 0.75,
  },
  shot: {
    speed: 1500,
    cooldown: 0.22,
    maxInFlight: 2,
    hitRadiusK: 0.92,
    substeps: 2,
  },
  merge: {
    settleDelay: 0.09,
    stepDelayBase: 0.13,
    stepDelayDecay: 0.88,
    stepDelayMin: 0.06,
    /** 每步合成额外把「该段及其后方整条链」吸回的球数（合成净缩短 = 1 + pullBalls 格；docs §11.6） */
    pullBalls: 0.75,
    /** 吸回的视觉回弹速率（1/s） */
    pullRate: 6,
  },
  seal: {
    freeze: 1.0,
    /** 封印后，缺口后方（尾部一侧）被震退的球数 */
    knockBalls: 2,
    knockDur: 0.4,
    attractSpeed: 420,
    holdBeforeBurst: 0.35,
  },
  push: {
    introSpeed: 260,
    introTo: 0.28,
    rubber: 3.5,
    rubberTo: 0.55,
    nearFrom: 0.85,
    nearMul: 0.6,
    failRushSpeed: 600,
    retreatSpeed: 360,
    /** 退潮与失败吞噬的加速度（速度 = 基础 × (1 + endAccel·t)） */
    endAccel: 1.5,
    /** 收官时等待场上判定/弹丸结束的最长时间 */
    clearWaitMax: 1.5,
  },
  ammo: {
    decay: 0.8,
    rescueFrom: 0.7,
    rescueChance: 0.3,
    rescueHeadBalls: 6,
    rerollDur: 0.25,
    swapDur: 0.14,
  },
  spawn: {
    singleDecay: 0.75,
    valley: 0.1,
    stairLenMin: 2,
    stairLenMax: 4,
  },
  wild: {
    earnSteps: 4,
    maxHeld: 1,
    extraBonus: 500,
  },
  score: {
    streakStep: 0.1,
    streakCap: 10,
    tripleMul: 2,
    sealMul: 5,
    overSealMul: 2,
    retreatPerBall: 5,
    clearBase: 1000,
    clearPerStage: 0.25,
    emptyBonus: 200,
  },
  run: {
    lives: 2,
    endlessSpeedGrowth: 1.15,
    endlessQuota: 5,
  },
  danger: {
    warn: 0.75,
    critical: 0.9,
  },
  /** 关卡表（docs §3.9；阶段 2 按真实几何模拟器调整过，见 §11） */
  stages: [
    S(0, 16, 0.004, 1, 3, 6, 2, 0.55),
    S(0, 21, 0.005, 1, 3, 6, 2, 0.5),
    S(0, 24, 0.006, 1, 4, 7, 3, 0.5),
    S(1, 30, 0.006, 1, 4, 7, 3, 0.6),
    S(1, 36, 0.007, 2, 5, 8, 3, 0.6),
    S(1, 41, 0.007, 2, 5, 8, 3, 0.55),
    S(2, 41, 0.008, 3, 6, 9, 4, 0.45),
    S(2, 50, 0.008, 3, 6, 9, 4, 0.4),
    S(2, 56, 0.009, 4, 7, 10, 4, 0.35),
    S(3, 62, 0.009, 4, 7, 10, 4, 0.35),
    S(3, 68, 0.01, 5, 8, 11, 4, 0.35),
    S(3, 70, 0.01, 5, 8, 11, 4, 0.35),
  ] as StageCfg[],
  input: {
    tapMs: 180,
    tapMovePx: 12,
    totemRadius: 46,
    swapTapMs: 250,
    loupeTrigger: 60,
    loupeOffset: 120,
    loupeRadius: 64,
    loupeZoom: 1.25,
  },
  fx: {
    trauma: { light: 0.06, mid: 0.18, heavy: 0.4 },
    hitstop: { mid: 0.04, heavy: 0.09 },
    shakeMaxPx: 10,
    shakeMaxDeg: 1.2,
    traumaDecay: 1.6,
    traumaMax: 0.8,
  },
  perf: {
    particles: [200, 400, 600],
    dprMax: 2,
  },
} as const;

export type Config = typeof CONFIG;

/** 第 n 关（1 起）的配置，13+ 为无尽 */
export function stageCfg(n: number): StageCfg {
  const t = CONFIG.stages;
  if (n <= t.length) return t[Math.max(1, n) - 1]!;
  const last = t[t.length - 1]!;
  const k = n - t.length;
  return {
    ...last,
    track: (k - 1) % 4,
    vBase: last.vBase * Math.pow(CONFIG.run.endlessSpeedGrowth, k),
    quota: CONFIG.run.endlessQuota,
  };
}

export function templeOf(n: number): number {
  return n > CONFIG.stages.length ? 4 : Math.floor((n - 1) / 3);
}
