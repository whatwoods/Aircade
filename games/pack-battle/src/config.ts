// ★ 唯一的玩法数值来源。所有可调数值集中在这里。
import type { EnemyDef, ItemDef, ItemId } from './game/types.ts';

export const BAG = { cols: 6, rows: 5 };

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
    text: { effect: '每轮整理开始时 +{gold} 金', adj: '开战时须放在背包内' },
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
    adj: { kind: 'countTag', tag: 'armor', stat: 'reduce' },
    text: { effect: '受到的每次攻击伤害 -{reduce}', adj: '每相邻 1 件其他护具：再 -{adj}' },
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
    round: 6, name: '吱吱帮', title: '鼠群', hp: 180, cols: 5, rows: 4, frame: 'crate', portrait: 'rats',
    layout: ['.a...', 'bMc.e', '.d.f.', 'H.J..'],
    legend: { a: 'ratfang', b: 'ratfang', c: 'ratfang', d: 'ratfang', e: 'ratfang', f: 'ratfang', M: 'whetstone', N: 'whetstone', H: 'herb', J: 'herb' }, traits: [],
    hint: '一大堆小伤害：铁盔能大幅减免。',
  },
  {
    round: 7, name: '苔婆婆', title: '沼泽女巫', hp: 280, cols: 6, rows: 4, frame: 'wicker', portrait: 'witch',
    layout: ['CC.K..', 'CCHKK.', '.MJ.K.', '......'],
    legend: { C: 'cauldron', K: 'kris:2', H: 'herb', J: 'herb', M: 'moonstone' }, traits: [],
    hint: '她会不停回血，爆发要够高。',
  },
  {
    round: 8, name: '铁蹄', title: '黑骑士', hp: 300, cols: 6, rows: 4, frame: 'iron', portrait: 'knight',
    layout: ['SWWLLL', 'SWW.L.', 'SII...', 'M.....'],
    legend: { S: 'sword:3', W: 'buckler:2', L: 'leather:2', I: 'helmet', M: 'whetstone:2' }, traits: [],
    hint: '每次受击减伤 2：小刀刮不动他。',
  },
  {
    round: 9, name: '夜枭', title: '暗影游侠', hp: 360, cols: 6, rows: 5, frame: 'shadow', portrait: 'ranger',
    layout: ['..B...', '..B...', 'hhB.D.', '.LB.E.', 'LLL.PP'],
    legend: { B: 'bow:2', h: 'horn>', D: 'dagger:2', E: 'dagger', L: 'leather:2', P: 'potion:2' }, traits: [],
    hint: '冷箭很痛，开场就要有护盾。',
  },
  {
    round: 10, name: '烬', title: '古龙', hp: 620, cols: 6, rows: 5, frame: 'gold', portrait: 'dragon', boss: true,
    layout: ['BB....', 'BBGC..', '..GD..', '......', '...X..'],
    legend: { B: 'breath', G: 'hourglass', C: 'claw', D: 'claw', X: 'scale' },
    traits: [{ kind: 'dragonRage', at: 0.5, trueDmg: 20, speed: 0.3 }],
    hint: '最终之战。龙鳞减伤 2，准备好一切。',
  },
];

export const SHOP_POOL: ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((k) => !ITEMS[k].enemyOnly);
