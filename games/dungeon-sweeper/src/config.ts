// ============================================================================
//  地牢扫雷 · Dungeon Sweeper — 全部玩法数值与时序常量
//  字段名与 docs/dungeon-sweeper.md §3.6 一一对应。调平衡只改这里。
// ============================================================================

export interface Band {
  min: number;
  max: number;
  pref: number;
}

export const CONFIG = {
  board: {
    cols: 9,
    rows: 12,
    lair: { x: 3, y: 4, w: 3, h: 3 },
    entrance: { x: 3, y: 10, w: 3, h: 2 },
    startCell: { x: 4, y: 11 },
    /** 开局连锁翻开格数需落在此区间，否则用 seed+k 重抽 */
    initialRevealRange: [9, 28] as [number, number],
    maxRegen: 50,
    /** 空地格成为烛台格的概率（纯视觉） */
    candleChance: 0.18,
  },

  player: {
    /** 下标 = 等级 - 1 */
    maxHpByLevel: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    xpToNext: [3, 4, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  },

  monsters: {
    /** 每级数量（等级 1..9） */
    counts: { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 2, 9: 1 } as Record<number, number>,
    /** 经验 = 等级 × xpPerLevel */
    xpPerLevel: 1,
    /** 各等级允许出现的「离龙巢切比雪夫距离」与偏好距离 */
    bands: {
      1: { min: 2, max: 5, pref: 5 },
      2: { min: 2, max: 5, pref: 4 },
      3: { min: 2, max: 5, pref: 3 },
      4: { min: 1, max: 4, pref: 3 },
      5: { min: 1, max: 4, pref: 3 },
      6: { min: 1, max: 3, pref: 2 },
      7: { min: 1, max: 3, pref: 2 },
      8: { min: 1, max: 2, pref: 1 },
      9: { min: 1, max: 1, pref: 1 },
    } as Record<number, Band>,
    bandFalloff: 0.55,
    /** 入口矩形切比雪夫距离 ≤ radius 的格子只能放 ≤ maxLevel 级的怪 */
    entranceGuard: { radius: 2, maxLevel: 2 },
    names: ['', '史莱姆', '蝙蝠', '哥布林', '骷髅兵', '宝箱怪', '石像鬼', '亡灵骑士', '蛇发女妖', '巫妖'],
  },

  items: {
    chest: {
      count: 4,
      /** 按离巨龙由远到近分配 */
      gold: [40, 60, 80, 120],
      xp: [1, 2, 2, 3],
      /** 下标 = 离龙巢距离 d */
      weightByDist: [0, 1, 1, 0.8, 0.5, 0.3],
    },
    potion: {
      count: 3,
      heal: 5,
      weightByDist: [0, 0.3, 0.8, 1, 1, 0.8],
    },
  },

  dragon: {
    level: 13,
    minHpToChallenge: 14,
    confirmIfMonstersLeft: true,
    /** 玩家达到该等级时巨龙睁开一只眼（纯视觉） */
    oneEyeAtLevel: 7,
  },

  score: {
    perMonsterLevel: 10,
    dragonBonus: 1000,
    hpLeftBonus: 30,
    timeBonusBaseSec: 600,
    timeBonusPerSec: 1,
    fullClearBonus: 300,
  },

  rules: {
    deathAtZero: true,
    fightLockMs: 420,
    lethalConfirmMs: 2000,
    chord: true,
    fullClearRefill: true,
  },

  tutorial: {
    /** 引导局总怪物数微调（底部固定布局之外的配额减少） */
    countsDelta: { 1: -2, 2: -1 } as Record<number, number>,
  },

  input: {
    longPressMs: 380,
    longPressHintMs: 120,
    tapSlopPx: 10,
    radialRadius: 78,
    radialSlotRadius: 21,
    radialPlateRadius: 104,
    radialEdgeMargin: 106,
    radialPickScale: 1.35,
  },

  /** 演出时序（ms，世界时间） */
  timing: {
    flipMs: 260,
    fastFlipMs: 120,
    rippleStepMs: 34,
    rippleMaxMs: 520,
    lightRiseMs: 500,
    numberRollMs: 220,
    popAtMs: 100,
    popMs: 160,
    strikeAtMs: 280,
    shatterDelayMs: 0,
    orbFlightMs: 450,
    orbStaggerMs: 40,
    levelUpPauseMs: 80,
    dealStaggerMs: 10,
    toastMs: 3000,
    /** 两条情境提示之间的最小间隔 */
    tipGapMs: 1500,
  },

  /** 打击感：trauma / hitstop / 震动（层级见文档 §5.1） */
  juice: {
    shakeMaxPx: 10,
    shakeMaxRotDeg: 1.2,
    shakeFreq: 22,
    traumaDecay: 1.5,
    killTraumaBase: 0.08,
    killTraumaPerLevel: 0.035,
    killHitstopBase: 30,
    killHitstopPerLevel: 10,
    killHitstopMax: 120,
    levelUpHitstop: 80,
    levelUpTrauma: 0.26,
    chestHitstop: 40,
    chestTrauma: 0.12,
    potionTrauma: 0.1,
    deathHitstop: 220,
    dragonBreathHitstop: 160,
    dragonFinalHitstop: 220,
    hapticMinGapMs: 40,
  },

  fx: {
    maxParticles: 400,
    maxShards: 160,
    maxFloatTexts: 24,
    maxOrbs: 48,
  },

  /** 自适应质量：连续 windowMs 平均帧时间 > thresholdMs 时降一档 */
  quality: {
    thresholdMs: 18,
    windowMs: 2000,
    maxDpr: 2,
  },

  /** 低血阈值：hp ≤ lowHpAbs 或 hp ≤ maxHp × lowHpFrac */
  lowHpAbs: 2,
  lowHpFrac: 0.2,
} as const;

export type Config = typeof CONFIG;

/** 等级 → 生命上限（超出表时线性外推） */
export function maxHpForLevel(level: number): number {
  const t = CONFIG.player.maxHpByLevel;
  if (level <= t.length) return t[level - 1];
  return t[t.length - 1] + (level - t.length);
}

/** 等级 → 升到下一级所需经验 */
export function xpToNextLevel(level: number): number {
  const t = CONFIG.player.xpToNext;
  if (level <= t.length) return t[level - 1];
  return t[t.length - 1] + (level - t.length);
}

/** 静态断言：经验总量足够屠龙 */
export function validateConfig(): string[] {
  const errs: string[] = [];
  let pool = 0;
  for (let l = 1; l <= 9; l++) pool += (CONFIG.monsters.counts[l] ?? 0) * l * CONFIG.monsters.xpPerLevel;
  let need = 0;
  let lv = 1;
  while (maxHpForLevel(lv) < CONFIG.dragon.minHpToChallenge) {
    need += xpToNextLevel(lv);
    lv++;
  }
  if (pool < need) errs.push(`经验池 ${pool} < 屠龙所需 ${need}`);
  return errs;
}
