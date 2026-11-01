// ============================================================================
//  地牢扫雷 · Dungeon Sweeper — 全部玩法数值与时序常量
//  字段名与 docs/dungeon-sweeper.md §3.6 一一对应。调平衡只改这里。
// ============================================================================

/** 祝福的数值字段（见 CONFIG.blessings） */
export interface BlessCfg {
  hp?: number;
  noPotion?: boolean;
  noChestXp?: boolean;
  goldHalf?: boolean;
  potionHeal?: number;
  potionFull?: boolean;
  dmgAll?: number;
  killHeal?: number;
  killHealMinLevel?: number;
  killXp?: number;
  freeMaxLevel?: number;
  reduceMinLevel?: number;
  reduce?: number;
  lowMax?: number;
  lowAdd?: number;
  chestXp?: number;
  goldMult?: number;
  count?: number;
  perLevel?: number;
}

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
      /** 数量见 difficulty.*.potionCount */
      heal: 5,
      weightByDist: [0, 0.3, 0.8, 1, 1, 0.8],
    },
  },

  /** 生成期「无致命猜测」校验（§11）：可见信息机器人下完整局，出现被迫致命猜测则按 seed+k 重抽 */
  solver: {
    enabled: true,
    /** 每次回溯分析的节点上限 */
    maxNodes: 3000,
    /** 最多校验的候选盘面数 */
    maxTries: 16,
    /** 校验总时间预算（ms）：在 Web Worker 里预取，预算宽松；超时用第一个候选 */
    budgetMs: 2500,
    /** 随机种子但 Worker 预取未就绪时的主线程兜底预算（ms） */
    fallbackMs: 60,
  },
  /** 死亡复盘：亮出剩余怪物（文档 §5.4b） */
  review: {
    /** 死亡后多久开始显出（真实时间 ms） */
    startMs: 900,
    /** 以致死格为中心，每格距离的延迟 */
    stepMs: 45,
    fadeMs: 320,
    silScale: 0.7,
    silAlpha: 1,
    /** 结算面板推迟出现，先让玩家看清全盘 */
    holdMs: 1200,
  },
  /** 每日挑战与分享（文档 §6.9） */
  daily: {
    /** 日期 → 种子的哈希盐：改它会让所有日期换图 */
    salt: 0x5eed0d5,
    /** 本地保留的每日成绩天数 */
    keepDays: 60,
  },
  /**
   * 难度档（文档 §3.8）：在上面的基础数值上覆盖。每日挑战和引导局固定用 normal。
   * 各档胜率目标与 pnpm sim 实测见文档 §3.8。
   */
  difficulty: {
    easy: { name: '学徒', countsDelta: {} as Record<number, number>, potionCount: 4, dragonLevel: 11, minHpToChallenge: 12, blessLevels: [5, 9] },
    normal: { name: '冒险者', countsDelta: {} as Record<number, number>, potionCount: 3, dragonLevel: 13, minHpToChallenge: 14, blessLevels: [6, 10] },
    hard: { name: '英雄', countsDelta: {} as Record<number, number>, potionCount: 3, dragonLevel: 15, minHpToChallenge: 16, blessLevels: [11] },
  },
  defaultDifficulty: 'normal' as 'easy' | 'normal' | 'hard',

  /**
   * 祝福（文档 §3.10）：升到 difficulty.*.blessLevels 时三选一，每种一局最多一次；引导局没有。
   * 每张的收益写在专属字段里，代价用通用字段：hp 生命上限增减、noPotion 血瓶失效、
   * noChestXp 宝箱不给经验、goldHalf 宝箱金币减半、potionHeal 血瓶回复增减、dmgAll 所有伤害增减。
   */
  blessings: {
    offerCount: 3,
    cards: {
      vigor: { hp: 2, noPotion: true },
      leech: { killHeal: 1, killHealMinLevel: 2, hp: -1 },
      butcher: { freeMaxLevel: 2 },
      armor: { reduceMinLevel: 5, reduce: 1, lowMax: 1, lowAdd: 1 },
      greed: { chestXp: 3, goldMult: 2, potionHeal: -1 },
      alchemy: { potionFull: true, goldHalf: true },
      undying: { noChestXp: true },
      insight: { count: 2 },
      bounty: { perLevel: 5 },
      berserk: { killXp: 2, dmgAll: 1, hp: -1 },
    } as Record<string, BlessCfg>,
  },

  /** 成就门槛（文档 §6.11） */
  achievements: {
    rageScore: 300,
    speedSec: 180,
    seerMarks: 10,
    dailyCount: 7,
    veteranWins: 10,
    gloryScore: 4000,
  },

  dragon: {
    confirmIfMonstersLeft: true,
    /** 玩家达到该等级时巨龙睁开一只眼（纯视觉） */
    oneEyeAtLevel: 7,
  },

  score: {
    perMonsterLevel: 10,
    dragonBonus: 1000,
    hpLeftBonus: 60,
    timeBonusBaseSec: 600,
    timeBonusPerSec: 1,
    fullClearBonus: 300,
    /** 龙怒：巨龙觉醒之后的击杀分倍率（够血之后继续清图的回报，文档 §3.9） */
    awakeKillMult: 2,
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
    /** 普通提示排队过期时间、操作触发提示过期时间、操作提示打断前一条的最短展示时间 */
    tipTtlMs: 12000,
    tipUrgentTtlMs: 2500,
    tipMinShowMs: 900,
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
  for (const [id, d] of Object.entries(CONFIG.difficulty)) {
    let pool = 0;
    for (let l = 1; l <= 9; l++) pool += Math.max(0, (CONFIG.monsters.counts[l] ?? 0) + (d.countsDelta[l] ?? 0)) * l * CONFIG.monsters.xpPerLevel;
    let need = 0;
    let lv = 1;
    while (maxHpForLevel(lv) < d.minHpToChallenge) {
      need += xpToNextLevel(lv);
      lv++;
    }
    if (pool < need) errs.push(`${id}：经验池 ${pool} < 屠龙所需 ${need}`);
    if (d.minHpToChallenge <= d.dragonLevel) errs.push(`${id}：挑战血量须大于巨龙等级`);
  }
  return errs;
}
