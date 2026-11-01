// ★ 唯一的玩法数值来源。所有可调数值集中在这里。
import type { AffixId, EnemyDef, EventId, ItemDef, ItemId } from './game/types.ts';

export const BAG = {
  cols: 6,
  rows: 5,
  /** 开局开放的格子（其余锁着，整理阶段点紧挨开放区的锁格花金币解锁） */
  start: { x: 1, y: 0, w: 4, h: 4 },
  /** 第 n 次解锁的价格（下标 = 已解锁次数，超出取最后一个） */
  cellPrice: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4],
};

export const PLAYER = { hearts: 3, baseHp: 30, hpPerRound: 8 };

export const ROUNDS = 10;

export const ECONOMY = {
  startGold: 12,
  /** 第 r 轮（r≥2）整理开始时的基础收入 = 7 + ceil(r/2) */
  incomeByRound: [0, 0, 8, 9, 9, 10, 10, 11, 11, 12, 12],
  winBonus: 2,
  lossBonus: 3,
  interestStep: 10,
  interestCap: 3,
  refreshCost: 1,
  sellRatio: 0.5,
  sameRoundFullRefund: true,
  undoSellMs: 4000,
};

export const SHOP = {
  slots: 5,
  stashSlots: 5,
  /** 普通 / 精良 / 稀有 / 传说（%），下标 = 轮次 */
  rarityWeights: [
    [100, 0, 0, 0],
    [100, 0, 0, 0],
    [75, 25, 0, 0],
    [60, 35, 5, 0],
    [50, 38, 12, 0],
    [40, 40, 17, 3],
    [32, 40, 22, 6],
    [25, 38, 29, 8],
    [20, 35, 33, 12],
    [15, 33, 37, 15],
    [12, 30, 38, 20],
  ],
  ownedWeightMul: 1.6,
  maxDupPerShop: 2,
  weaponGuaranteeUntil: 3,
  /** 每张卡直接是 ★★ 的概率（下标 = 轮次），价格 ×2 */
  lv2Chance: [0, 0, 0, 0, 0, 0.1, 0.12, 0.15, 0.18, 0.2, 0.2],
};

export const BATTLE = {
  dt: 1 / 60,
  softLimit: 30,
  fatigueStep: 2,
  hardLimit: 60,
  poisonInterval: 2,
  speedCap: 3,
  minHit: 1,
  boomerangGap: 0.3,
  stunImmunity: 0.5,
  speeds: [1, 2, 4],
  projectileTime: 0.22,
  /** 结束后停留（秒，真实时间） */
  endHold: 0.6,
};

export const SCORE = { winBase: 100, winHpBonus: 40, clearBonus: 2000, heartBonus: 500 };

/** 轮间事件：赢下第 r 轮（r≥1、不是最后一轮）后从池里抽两个选一个 */
export const EVENTS = {
  /** 精英：敌人生命倍率、赢了的赏金 */
  eliteHpMul: 1.5,
  eliteGold: 10,
  /** 裁缝：免费解锁几格 */
  tailorCells: 2,
  /** 黑市：商店稀有度按"当前轮 + n"掷 */
  marketBoost: 3,
  cacheGold: 6,
};

/** 敌人词缀：第 fromRound 轮起非首领敌人带 perEnemy 个（按种子掷） */
export const AFFIX = {
  fromRound: 4,
  perEnemy: 1,
  toughHpMul: 1.25,
  swiftSpeed: 0.15,
  armoredReduce: 1,
  shieldedFrac: 0.15,
  /** 再生：每 regenEvery 秒回复 regenFrac 生命（至少 1） */
  regenEvery: 3,
  regenFrac: 0.025,
};

/** 难度：逐级叠加；通关第 n 级解锁第 n+1 级；结算时总分 +scoreBonus×级数 */
export const DIFFICULTY = {
  names: ['普通', '难度 1', '难度 2', '难度 3', '难度 4'],
  desc: ['', '首领也带词缀', '敌人生命 +15%', '敌人带 2 个词缀', '开局少 1 颗心'],
  bossAffixFrom: 1,
  hpMulFrom: 2,
  hpMul: 1.15,
  twoAffixFrom: 3,
  fewerHeartsFrom: 4,
  scoreBonus: 0.25,
  /** 每日挑战：用当天日期当种子，固定这个难度 */
  dailyTier: 2,
};

export const AFFIX_DEFS: Record<AffixId, { name: string; desc: string }> = {
  tough: { name: '坚韧', desc: '生命 +25%' },
  swift: { name: '迅捷', desc: '冷却速度 +15%' },
  armored: { name: '铁甲', desc: '每次受击伤害 -1' },
  shielded: { name: '坚盾', desc: '开场护盾 = 15% 生命' },
  regen: { name: '再生', desc: '每 3 秒回复 2.5% 生命' },
};

export const EVENT_DEFS: Record<EventId, { name: string; glyph: string }> = {
  smith: { name: '铁匠', glyph: '锻' },
  tailor: { name: '裁缝', glyph: '缝' },
  market: { name: '黑市', glyph: '市' },
  elite: { name: '精英', glyph: '战' },
  rest: { name: '营火', glyph: '歇' },
  cache: { name: '藏宝', glyph: '宝' },
};

export const TUTORIAL = {
  shop: ['sword', 'whetstone', 'buckler', 'herb', 'dagger'] as ItemId[],
  round2Guarantee: 'sword' as ItemId,
  slowmo: 0.6,
  slowmoSec: 2.5,
};

export const INPUT = {
  dragThreshold: 8,
  tapMaxMs: 250,
  longPressMs: 400,
  touchLift: 48,
  refreshDebounceMs: 250,
};

export const AUDIO = {
  /** 音乐文件（Lyria 生成，母带响度约 −16dB RMS）进音乐总线前的增益，跟程序化音乐的响度对齐 */
  musicFileLevel: 0.6,
};

export const FX = {
  shakeMax: 10,
  shakeRotDeg: 1.2,
  traumaDecay: 1.5,
  t1Cooldown: 0.15,
  vibrateGapMs: 200,
  tiers: {
    T0: { trauma: 0, stop: 0, vib: 0 as number | number[] },
    T1: { trauma: 0.12, stop: 0, vib: 6 as number | number[] },
    T2: { trauma: 0.25, stop: 30, vib: 12 as number | number[] },
    T3: { trauma: 0.45, stop: 80, vib: 25 as number | number[] },
    T4: { trauma: 0.7, stop: 160, vib: [40, 30, 60] as number | number[] },
  },
  /** 大伤害阈值（占目标最大生命） */
  bigHitFrac: 0.15,
  lowHpFrac: 0.25,
};

export const RARITY_NAMES = ['普通', '精良', '稀有', '传说'];
export const TAG_NAMES = { weapon: '武器', armor: '护具', remedy: '药物', tool: '器具' } as const;

export const ITEMS: Record<ItemId, ItemDef> = {
  // ───────── 普通 ─────────
  dagger: {
    id: 'dagger', name: '匕首', tag: 'weapon', rarity: 0, price: 3, shape: ['#'],
    trigger: 'cooldown', cd: 1.2,
    lv: [{ dmg: 2, adj: 1 }, { dmg: 4, adj: 2 }, { dmg: 8, adj: 3 }],
    adj: { kind: 'countTag', tag: 'weapon', stat: 'dmg', otherId: true },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '每相邻 1 件其他种类的武器：伤害 +{adj}' },
  },
  sword: {
    id: 'sword', name: '铁剑', tag: 'weapon', rarity: 0, price: 4, shape: ['#', '#', '#'],
    trigger: 'cooldown', cd: 2.0,
    lv: [{ dmg: 6, adj: 2 }, { dmg: 12, adj: 4 }, { dmg: 24, adj: 8 }],
    adj: { kind: 'ifTag', tag: 'armor', effect: 'shieldOnHit' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '相邻有护具：每次攻击 +{adj} 护盾' },
  },
  buckler: {
    id: 'buckler', name: '木盾', tag: 'armor', rarity: 0, price: 4, shape: ['##', '##'],
    trigger: 'cooldown', cd: 3.0,
    lv: [{ shield: 5, adj: 1 }, { shield: 10, adj: 2 }, { shield: 20, adj: 4 }],
    adj: { kind: 'countTag', tag: 'weapon', stat: 'shield' },
    text: { effect: '每 {cd} 秒获得 {shield} 护盾', adj: '每相邻 1 件武器：护盾 +{adj}' },
  },
  leather: {
    id: 'leather', name: '皮甲', tag: 'armor', rarity: 0, price: 4, shape: ['###', '.#.'],
    trigger: 'start',
    lv: [{ startShield: 8, adj: 3 }, { startShield: 16, adj: 6 }, { startShield: 32, adj: 12 }],
    adj: { kind: 'countTag', tag: 'armor', stat: 'startShield' },
    text: { effect: '战斗开始时获得 {startShield} 护盾', adj: '每相邻 1 件其他护具：护盾 +{adj}' },
  },
  herb: {
    id: 'herb', name: '草药', tag: 'remedy', rarity: 0, price: 3, shape: ['#'],
    trigger: 'cooldown', cd: 3.0,
    lv: [{ heal: 3, adj: 1 }, { heal: 6, adj: 2 }, { heal: 12, adj: 4 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'heal' },
    text: { effect: '每 {cd} 秒回复 {heal} 生命', adj: '每相邻 1 件其他药物：回复 +{adj}' },
  },
  whetstone: {
    id: 'whetstone', name: '磨刀石', tag: 'tool', rarity: 0, price: 3, shape: ['#'],
    trigger: 'passive',
    lv: [{ speed: 0.25 }, { speed: 0.4 }, { speed: 0.6 }],
    adj: { kind: 'aura', tags: ['weapon'], stat: 'speed' },
    text: { effect: '相邻武器攻速 +{speed}', adj: '只对相邻（共享边）的武器生效' },
  },
  glove: {
    id: 'glove', name: '皮手套', tag: 'tool', rarity: 0, price: 3, shape: ['#', '#'],
    trigger: 'passive',
    lv: [{ dmgBonus: 2 }, { dmgBonus: 4 }, { dmgBonus: 7 }],
    adj: { kind: 'aura', tags: ['weapon'], stat: 'dmgBonus' },
    text: { effect: '相邻武器每次伤害 +{dmgBonus}', adj: '只对相邻（共享边）的武器生效' },
  },
  pouch: {
    id: 'pouch', name: '钱袋', tag: 'tool', rarity: 0, price: 3, shape: ['#'],
    trigger: 'roundStart',
    lv: [{ gold: 1 }, { gold: 2 }, { gold: 4 }],
    adj: { kind: 'none' },
    text: { effect: '每轮整理开始时 +{gold} 金', adj: '无相邻效果' },
  },
  shuriken: {
    id: 'shuriken', name: '飞镖', tag: 'weapon', rarity: 0, price: 3, shape: ['#'],
    trigger: 'cooldown', cd: 0.9,
    lv: [{ dmg: 1, adj: 1 }, { dmg: 2, adj: 2 }, { dmg: 4, adj: 3 }],
    adj: { kind: 'countTag', tag: 'tool', stat: 'dmg' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '每相邻 1 件器具：伤害 +{adj}' },
  },
  // ───────── 精良 ─────────
  boomerang: {
    id: 'boomerang', name: '回旋镖', tag: 'weapon', rarity: 1, price: 5, shape: ['#.', '##'],
    trigger: 'cooldown', cd: 2.2,
    lv: [{ dmg: 3, hits: 2, adj: 1 }, { dmg: 6, hits: 2, adj: 2 }, { dmg: 11, hits: 2, adj: 3 }],
    adj: { kind: 'countTag', tag: 'tool', stat: 'dmg' },
    text: { effect: '每 {cd} 秒造成 2 次 {dmg} 伤害', adj: '每相邻 1 件器具：每次 +{adj}' },
  },
  axe: {
    id: 'axe', name: '战斧', tag: 'weapon', rarity: 1, price: 6, shape: ['##', '#.', '#.'],
    trigger: 'cooldown', cd: 3.0,
    lv: [{ dmg: 14 }, { dmg: 28 }, { dmg: 54 }],
    adj: { kind: 'lone', tag: 'weapon', mult: 1.5 },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '没有相邻的其他武器：伤害 ×1.5' },
  },
  kris: {
    id: 'kris', name: '蛇牙短剑', tag: 'weapon', rarity: 1, price: 6, shape: ['#.', '##', '.#'],
    trigger: 'cooldown', cd: 1.5,
    lv: [{ dmg: 3, poison: 1, adj: 1 }, { dmg: 6, poison: 2, adj: 1 }, { dmg: 11, poison: 4, adj: 2 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'poison' },
    text: { effect: '每 {cd} 秒 {dmg} 伤害 + {poison} 层中毒', adj: '每相邻 1 件药物：中毒 +{adj} 层' },
  },
  helmet: {
    id: 'helmet', name: '铁盔', tag: 'armor', rarity: 1, price: 5, shape: ['##'],
    trigger: 'passive',
    lv: [{ reduce: 1, adj: 1 }, { reduce: 2, adj: 1 }, { reduce: 3, adj: 2 }],
    adj: { kind: 'countTag', tag: 'armor', stat: 'reduce', max: 1 },
    text: { effect: '受到的每次攻击伤害 -{reduce}', adj: '相邻有其他护具：再 -{adj}（只算 1 件）' },
  },
  potion: {
    id: 'potion', name: '治疗药水', tag: 'remedy', rarity: 1, price: 5, shape: ['#', '#'],
    trigger: 'lowHp',
    lv: [{ heal: 12, adj: 4 }, { heal: 25, adj: 6 }, { heal: 50, adj: 10 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'lowHpHeal' },
    text: { effect: '生命首次低于 50% 时回复 {lowHpHeal}', adj: '每相邻 1 件其他药物：+{adj}' },
  },
  moonstone: {
    id: 'moonstone', name: '月光石', tag: 'tool', rarity: 1, price: 5, shape: ['#'],
    trigger: 'passive',
    lv: [{ boost: 0.3 }, { boost: 0.5 }, { boost: 0.8 }],
    adj: { kind: 'aura', tags: ['armor', 'remedy'], stat: 'boost' },
    text: { effect: '相邻护具、药物效果 +{boost}', adj: '增强护盾量与回复量' },
  },
  venom: {
    id: 'venom', name: '毒囊', tag: 'tool', rarity: 1, price: 5, shape: ['#'],
    trigger: 'passive',
    lv: [{ poison: 1 }, { poison: 2 }, { poison: 3 }],
    adj: { kind: 'aura', tags: ['weapon'], stat: 'poison' },
    text: { effect: '相邻武器每次命中 +{poison} 层中毒', adj: '只对相邻（共享边）的武器生效' },
  },
  thorns: {
    id: 'thorns', name: '荆棘甲', tag: 'armor', rarity: 1, price: 5, shape: ['#.', '##'],
    trigger: 'passive',
    lv: [{ thorns: 2, adj: 1 }, { thorns: 4, adj: 2 }, { thorns: 7, adj: 3 }],
    adj: { kind: 'countTag', tag: 'armor', stat: 'thorns' },
    text: { effect: '每次被攻击，反弹 {thorns} 伤害', adj: '每相邻 1 件其他护具：反弹 +{adj}' },
  },
  brew: {
    id: 'brew', name: '狂暴药剂', tag: 'remedy', rarity: 1, price: 5, shape: ['#'],
    trigger: 'lowHp',
    lv: [{ rage: 0.3 }, { rage: 0.5 }, { rage: 0.8 }],
    adj: { kind: 'none' },
    text: { effect: '生命首次低于 50% 时：全部冷却速度 +{rage}', adj: '无相邻效果' },
  },
  charm: {
    id: 'charm', name: '幸运符', tag: 'tool', rarity: 1, price: 4, shape: ['#'],
    trigger: 'roundStart',
    lv: [{ interest: 2 }, { interest: 3 }, { interest: 5 }],
    adj: { kind: 'none' },
    text: { effect: '利息上限 +{interest}', adj: '无相邻效果' },
  },
  // ───────── 稀有 ─────────
  hammer: {
    id: 'hammer', name: '战锤', tag: 'weapon', rarity: 2, price: 8, shape: ['###', '.#.'],
    trigger: 'cooldown', cd: 3.5, shieldBreak: 2,
    lv: [{ dmg: 12, adj: 3 }, { dmg: 24, adj: 5 }, { dmg: 46, adj: 9 }],
    adj: { kind: 'countTag', tag: 'weapon', stat: 'dmg' },
    text: { effect: '每 {cd} 秒 {dmg} 伤害，对护盾翻倍', adj: '每相邻 1 件其他武器：伤害 +{adj}' },
  },
  bow: {
    id: 'bow', name: '长弓', tag: 'weapon', rarity: 2, price: 8, shape: ['#', '#', '#', '#'],
    trigger: 'cooldown', cd: 3.0,
    lv: [{ dmg: 16, adj: 2 }, { dmg: 32, adj: 3 }, { dmg: 60, adj: 5 }],
    adj: { kind: 'emptyCells', stat: 'dmg' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '每有 1 个相邻空格：伤害 +{adj}' },
  },
  horn: {
    id: 'horn', name: '号角', tag: 'tool', rarity: 2, price: 7, shape: ['##'], tail: [0, 0], mouth: [1, 0],
    trigger: 'passive',
    lv: [{ speed: 0.2 }, { speed: 0.35 }, { speed: 0.55 }],
    adj: { kind: 'line', stat: 'speed' },
    text: { effect: '号口所指整条线：冷却速度 +{speed}', adj: '方向性：旋转可改变朝向' },
  },
  cauldron: {
    id: 'cauldron', name: '炼金釜', tag: 'remedy', rarity: 2, price: 8, shape: ['##', '##'],
    trigger: 'cooldown', cd: 4.0,
    lv: [{ heal: 6, cleanse: 1, adj: 2 }, { heal: 12, cleanse: 2, adj: 4 }, { heal: 24, cleanse: 4, adj: 6 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'heal' },
    text: { effect: '每 {cd} 秒回复 {heal}，解毒 {cleanse} 层', adj: '每相邻 1 件其他药物：回复 +{adj}' },
  },
  fang: {
    id: 'fang', name: '吸血獠牙', tag: 'weapon', rarity: 2, price: 8, shape: ['#', '#'],
    trigger: 'cooldown', cd: 2.2,
    lv: [{ dmg: 7, lifesteal: 0.4, adj: 0.15 }, { dmg: 14, lifesteal: 0.4, adj: 0.15 }, { dmg: 27, lifesteal: 0.5, adj: 0.2 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'lifesteal' },
    text: { effect: '每 {cd} 秒 {dmg} 伤害，吸血 {lifesteal}', adj: '每相邻 1 件药物：吸血 +{adj}' },
  },
  // ───────── 传说 ─────────
  phoenix: {
    id: 'phoenix', name: '凤凰羽毛', tag: 'remedy', rarity: 3, price: 10, shape: ['#', '#', '#'],
    trigger: 'death',
    lv: [{ reviveFrac: 0.35, adj: 0.05 }, { reviveFrac: 0.55, adj: 0.05 }, { reviveFrac: 0.8, adj: 0.05 }],
    adj: { kind: 'countTag', tag: 'remedy', stat: 'reviveFrac' },
    text: { effect: '首次倒下时以 {reviveFrac} 生命复活', adj: '每相邻 1 件其他药物：+{adj}' },
  },
  thunder: {
    id: 'thunder', name: '雷霆之杖', tag: 'weapon', rarity: 3, price: 11, shape: ['.#', '##', '#.'],
    trigger: 'cooldown', cd: 4.0,
    lv: [{ dmg: 20, stun: 0.6, adj: 2 }, { dmg: 40, stun: 0.8, adj: 4 }, { dmg: 75, stun: 1.0, adj: 6 }],
    adj: { kind: 'countTag', tag: 'any', stat: 'dmg' },
    text: { effect: '每 {cd} 秒 {dmg} 伤害，眩晕 {stun} 秒', adj: '每相邻 1 件装备：伤害 +{adj}' },
  },
  hourglass: {
    id: 'hourglass', name: '时之沙漏', tag: 'tool', rarity: 3, price: 10, shape: ['#', '#'],
    trigger: 'passive',
    lv: [{ speed: 0.3 }, { speed: 0.45 }, { speed: 0.65 }],
    adj: { kind: 'aura', tags: ['any'], stat: 'speed' },
    text: { effect: '相邻所有装备冷却速度 +{speed}', adj: '只对相邻（共享边）的装备生效' },
  },
  // ───────── 敌人专属 ─────────
  slime: {
    id: 'slime', name: '黏液块', tag: 'weapon', rarity: 0, price: 0, shape: ['#'], enemyOnly: true,
    trigger: 'cooldown', cd: 2.6,
    lv: [{ dmg: 3 }, { dmg: 6 }, { dmg: 12 }],
    adj: { kind: 'none' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '怪物部件' },
  },
  ratfang: {
    id: 'ratfang', name: '鼠牙', tag: 'weapon', rarity: 0, price: 0, shape: ['#'], enemyOnly: true,
    trigger: 'cooldown', cd: 1.0,
    lv: [{ dmg: 2 }, { dmg: 4 }, { dmg: 7 }],
    adj: { kind: 'none' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '怪物部件' },
  },
  breath: {
    id: 'breath', name: '龙息', tag: 'weapon', rarity: 3, price: 0, shape: ['##', '##'], enemyOnly: true,
    trigger: 'cooldown', cd: 5.0,
    lv: [{ dmg: 30 }, { dmg: 45 }, { dmg: 66 }],
    adj: { kind: 'none' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '古龙的炎囊' },
  },
  claw: {
    id: 'claw', name: '龙爪', tag: 'weapon', rarity: 2, price: 0, shape: ['#'], enemyOnly: true,
    trigger: 'cooldown', cd: 1.6,
    lv: [{ dmg: 8 }, { dmg: 13 }, { dmg: 22 }],
    adj: { kind: 'none' },
    text: { effect: '每 {cd} 秒造成 {dmg} 伤害', adj: '怪物部件' },
  },
  scale: {
    id: 'scale', name: '龙鳞', tag: 'armor', rarity: 3, price: 0, shape: ['#'], enemyOnly: true,
    trigger: 'start',
    lv: [{ startShield: 30, reduce: 2 }, { startShield: 45, reduce: 3 }, { startShield: 60, reduce: 4 }],
    adj: { kind: 'none' },
    text: { effect: '开场 {startShield} 护盾，受击 -{reduce}', adj: '古龙的鳞甲' },
  },
};

/** 敌人表：layout 用字母画出背包，legend 指定 字母 → "id[:lv][>方向]" */
export const ENEMIES: EnemyDef[] = [
  {
    round: 1, name: '咕噜', title: '史莱姆', hp: 26, cols: 3, rows: 2, frame: 'moss', portrait: 'slime',
    layout: ['a.b', '...'], legend: { a: 'slime', b: 'slime' }, traits: [],
    hint: '软绵绵的，放心砍。',
  },
  {
    round: 2, name: '叮当', title: '地精盗贼', hp: 44, cols: 4, rows: 3, frame: 'patch', portrait: 'goblin',
    layout: ['DE.H', '.G..', 'PG..'], legend: { D: 'dagger', E: 'dagger:2', G: 'glove', H: 'herb', P: 'pouch' }, traits: [],
    hint: '出手快，但伤害不高。',
  },
  {
    round: 3, name: '八脚', title: '毒蛛', hp: 70, cols: 4, rows: 3, frame: 'silk', portrait: 'spider',
    layout: ['K...', 'KKH.', '.KJ.'], legend: { K: 'kris', H: 'herb', J: 'herb' }, traits: [],
    hint: '中毒无视护盾——速战速决。',
  },
  {
    round: 4, name: '咔咔', title: '骷髅卫兵', hp: 120, cols: 5, rows: 3, frame: 'bone', portrait: 'skeleton',
    layout: ['SWW..', 'SWWL.', 'SMLLL'], legend: { S: 'sword:2', W: 'buckler', L: 'leather', M: 'whetstone:2' }, traits: [],
    hint: '盾很厚：战锤或中毒能破防。',
  },
  {
    round: 5, name: '大石头', title: '食人魔', hp: 240, cols: 5, rows: 4, frame: 'hide', portrait: 'ogre', boss: true,
    layout: ['AAMHJ', 'AGG..', 'ALLL.', '..L..'], legend: { A: 'axe', M: 'whetstone', G: 'glove', H: 'herb', J: 'herb', L: 'leather' },
    traits: [{ kind: 'enrage', at: 0.5, speed: 0.5 }],
    hint: '半血会狂暴，攒足护盾！',
  },
  {
    round: 6, name: '吱吱帮', title: '鼠群', hp: 170, cols: 5, rows: 4, frame: 'crate', portrait: 'rats',
    layout: ['a.c.e', 'bM.d.', '..f..', 'H.J..'],
    legend: { a: 'ratfang:2', b: 'ratfang', c: 'ratfang:2', d: 'ratfang', e: 'ratfang:2', f: 'ratfang', M: 'whetstone', H: 'herb', J: 'herb' }, traits: [],
    hint: '一大堆小伤害：铁盔、护盾能减免，输出够高也能抢先咬死它们。',
  },
  {
    round: 7, name: '苔婆婆', title: '沼泽女巫', hp: 280, cols: 6, rows: 4, frame: 'wicker', portrait: 'witch',
    layout: ['CC.K..', 'CCHKK.', '.MJ.K.', '......'],
    legend: { C: 'cauldron', K: 'kris:2', H: 'herb', J: 'herb', M: 'moonstone' }, traits: [],
    hint: '她会不停回血，爆发要够高。',
  },
  {
    round: 8, name: '铁蹄', title: '黑骑士', hp: 260, cols: 6, rows: 4, frame: 'iron', portrait: 'knight',
    layout: ['SWWLLL', 'SWW.L.', 'SII...', 'M.....'],
    legend: { S: 'sword:3', W: 'buckler:2', L: 'leather:2', I: 'helmet', M: 'whetstone:2' }, traits: [],
    hint: '每次受击减伤 2：小刀刮不动他。',
  },
  {
    round: 9, name: '夜枭', title: '暗影游侠', hp: 360, cols: 6, rows: 5, frame: 'shadow', portrait: 'ranger',
    layout: ['..B...', '..B...', 'hhB.D.', '.LB.E.', 'LLL.PP'],
    legend: { B: 'bow:2', h: 'horn>', D: 'dagger:2', E: 'dagger:2', L: 'leather:2', P: 'potion:2' }, traits: [],
    hint: '冷箭很痛，开场就要有护盾。',
  },
  {
    round: 10, name: '烬', title: '古龙', hp: 680, cols: 6, rows: 5, frame: 'gold', portrait: 'dragon', boss: true,
    layout: ['BB....', 'BBGC..', '..GD..', '......', '...X..'],
    legend: { B: 'breath', G: 'hourglass', C: 'claw', D: 'claw', X: 'scale' },
    traits: [{ kind: 'dragonRage', at: 0.5, trueDmg: 20, speed: 0.3 }],
    hint: '最终之战。龙鳞减伤 2，准备好一切。',
  },
];

export const SHOP_POOL: ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((k) => !ITEMS[k].enemyOnly);
