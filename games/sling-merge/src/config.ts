/**
 * 弹个大西瓜 · 全部可调数值（与 docs/sling-merge.md §3.9 字段一一对应）。
 * 坐标单位：逻辑像素（舞台 390×844，y 轴向下）；时间：秒。
 */

export type MouthType = 'cat' | 'tongue' | 'smile' | 'grin' | 'smirk' | 'soft' | 'teeth' | 'u' | 'laugh' | 'calm' | 'king';
export type EyeType = 'dot' | 'oval' | 'lidded' | 'lash' | 'dreamy' | 'sparkle' | 'happy' | 'star';
export type FaceExtra = 'brow' | 'browSassy' | 'browBold' | 'bigBlush' | 'wink' | 'sleepy';

export interface FruitColors {
  base: string;
  light: string;
  shade: string;
  outline: string;
  juice: string;
  accent: string[];
}

export interface FruitDef {
  level: number;
  key: string;
  name: string;
  radius: number;
  colors: FruitColors;
  face: { mouth: MouthType; eyes: EyeType; extras: FaceExtra[]; breatheMul: number };
}

const fruits: FruitDef[] = [
  {
    level: 1, key: 'blueberry', name: '蓝莓', radius: 17,
    colors: { base: '#7C86FF', light: '#BEC3FF', shade: '#5A62E0', outline: '#434AB8', juice: '#8C7BFF', accent: ['#3E3F9E', '#FFFFFF'] },
    face: { mouth: 'cat', eyes: 'dot', extras: ['bigBlush'], breatheMul: 1 },
  },
  {
    level: 2, key: 'cherry', name: '樱桃', radius: 22,
    colors: { base: '#FF4D6D', light: '#FF9DB0', shade: '#DB2E55', outline: '#B01F45', juice: '#FF3D68', accent: ['#6BBF59', '#84DB6E', '#4E9440'] },
    face: { mouth: 'tongue', eyes: 'oval', extras: ['wink'], breatheMul: 1 },
  },
  {
    level: 3, key: 'grape', name: '青提', radius: 27,
    colors: { base: '#9BE36E', light: '#D6F8B8', shade: '#6FC24C', outline: '#4E9C35', juice: '#B8F290', accent: ['#A9744A', '#7E5434'] },
    face: { mouth: 'smile', eyes: 'lidded', extras: [], breatheMul: 0.8 },
  },
  {
    level: 4, key: 'kumquat', name: '金桔', radius: 33,
    colors: { base: '#FFA94D', light: '#FFD7A3', shade: '#F2811F', outline: '#CB6413', juice: '#FFB648', accent: ['#5DCB6A', '#3FA851', '#F08A2C'] },
    face: { mouth: 'grin', eyes: 'oval', extras: [], breatheMul: 2 },
  },
  {
    level: 5, key: 'lemon', name: '柠檬', radius: 40,
    colors: { base: '#FFE15A', light: '#FFF5B8', shade: '#F4C21A', outline: '#D3A000', juice: '#FFF27D', accent: ['#E8C21A', '#C9DD5A'] },
    face: { mouth: 'smirk', eyes: 'oval', extras: ['browSassy'], breatheMul: 1 },
  },
  {
    level: 6, key: 'peach', name: '桃子', radius: 47,
    colors: { base: '#FFB3A0', light: '#FFE4D6', shade: '#F07A8C', outline: '#D2647A', juice: '#FFBFA8', accent: ['#6FD483', '#4DB565', '#FF8FA3'] },
    face: { mouth: 'soft', eyes: 'lash', extras: ['bigBlush'], breatheMul: 1 },
  },
  {
    level: 7, key: 'dragonfruit', name: '火龙果', radius: 55,
    colors: { base: '#FF5FB4', light: '#FFAEDA', shade: '#E23C93', outline: '#BB2A78', juice: '#FF6EC6', accent: ['#A8E05F', '#7DC23A', '#FF8FCB'] },
    face: { mouth: 'teeth', eyes: 'oval', extras: ['browBold'], breatheMul: 0.9 },
  },
  {
    level: 8, key: 'plum', name: '李子', radius: 63,
    colors: { base: '#A87BFF', light: '#D8C7FF', shade: '#8455E6', outline: '#6A3FC2', juice: '#B98FFF', accent: ['#FFFFFF', '#7E5434', '#6FD483'] },
    face: { mouth: 'u', eyes: 'dreamy', extras: ['sleepy'], breatheMul: 0.7 },
  },
  {
    level: 9, key: 'pineapple', name: '菠萝', radius: 71,
    colors: { base: '#FFC53D', light: '#FFE58F', shade: '#F0A315', outline: '#CC8600', juice: '#FFD84F', accent: ['#36C98C', '#239E6B', '#E8A21A'] },
    face: { mouth: 'laugh', eyes: 'sparkle', extras: [], breatheMul: 1.2 },
  },
  {
    level: 10, key: 'melon', name: '蜜瓜', radius: 79,
    colors: { base: '#78DCC2', light: '#C6F6E8', shade: '#45BEA0', outline: '#2D9A80', juice: '#FFB070', accent: ['#FFFFFF', '#3E9E6A', '#2E7D52'] },
    face: { mouth: 'calm', eyes: 'happy', extras: ['bigBlush'], breatheMul: 0.6 },
  },
  {
    level: 11, key: 'watermelon', name: '彩虹大西瓜', radius: 88,
    colors: { base: '#3DD681', light: '#A8F4C8', shade: '#1FA862', outline: '#13864A', juice: '#FF5C7A', accent: ['#1FA862', '#FFC93C', '#FFF0A8', '#FF6F91', '#F2A100'] },
    face: { mouth: 'king', eyes: 'star', extras: ['bigBlush'], breatheMul: 0.8 },
  },
];

export const CONFIG = {
  layout: {
    stageW: 390,
    stageH: 844,
    maxScale: 1.25,
    hud: {
      best: { x: 16, y: 14, w: 108, h: 40 },
      score: { x: 195, labelY: 14, baseY: 58, size: 38 },
      pause: { x: 330, y: 14, w: 44, h: 44 },
      chain: { x: 40, y: 68, w: 310, h: 28, iconX0: 55, iconStep: 28, iconY: 82, iconD: 20 },
    },
    jar: {
      lid: { x: 11, y: 100, w: 368, h: 22 },
      outer: { x: 15, y: 117, w: 360, h: 710, rTop: 12, rBottom: 45 },
      inner: { L: 24, R: 366, T: 126, B: 818, rTop: 10, rBottom: 36 },
    },
    dangerY: 600,
    dangerTag: { x: 30, y: 607, w: 58, h: 20 },
    sling: {
      pouch: { x: 195, y: 728 },
      forkL: { x: 153, y: 704 },
      forkR: { x: 237, y: 704 },
      stemTop: { x: 195, y: 752 },
      stemBottom: { x: 195, y: 790 },
      base: { x: 195, y: 798, w: 70, h: 26 },
    },
    next: { x: 322, y: 744, r: 30, labelY: 700 },
    combo: { x: 68, y: 744, r: 30, labelY: 700 },
    countdown: { x: 195, y: 654, size: 56, labelY: 620 },
    banner: { y: 360, w: 342, h: 70 },
    tutorialCard: { x: 45, bottom: 586, w: 300, h: 56 },
    /** 标题吉祥物（彩虹大西瓜）；标题演示时罐内水果绕开它 */
    mascot: { x: 195, y: 196, r: 64 },
    /** 标题 Logo / 副标题的「隐形托板」（胶囊：x0, y0, x1, y1, 半径）：水果簇拥在 Logo 下方 */
    titleCapsules: [
      [74, 300, 316, 300, 40],
      [137, 350, 253, 350, 17],
    ] as readonly (readonly number[])[],
  },

  physics: {
    fixedDt: 1 / 60,
    substeps: 4,
    maxStepsPerFrame: 4,
    buoyancy: 1400,
    linearDrag: 1.6,
    angularDrag: 2.5,
    densityExp: 1.6,
    friction: 0.28,
    wallFriction: 0.12,
    restitution: 0.12,
    wallRestitution: 0.3,
    restitutionThreshold: 40,
    contactHertz: 30,
    contactDampingRatio: 10,
    maxPushSpeed: 220,
    linearSlop: 0.5,
    speculative: 4,
    maxSpeed: 2000,
    sleepLinear: 8,
    sleepAngular: 0.4,
    sleepTime: 0.6,
    wakeSpeed: 30,
  },

  shot: {
    minSpeed: 380,
    maxSpeed: 1500,
    powerExp: 1.2,
    cooldown: 0.45,
    reloadDelay: 0.17,
    reloadTime: 0.28,
    flightDrag: 0.35,
    flightWallRestitution: 0.78,
    firstImpactRestitution: 0.3,
    massBoost: 2.0,
    massBoostHold: 0.25,
    flightTimeout: 2.5,
    strongImpactSpeed: 700,
  },

  aim: {
    deadzone: 16,
    maxPull: 150,
    maxAngleDeg: 75,
    cancelAngleDeg: 100,
    visualPullMax: 44,
  },

  preview: {
    maxTime: 1.5,
    maxBounces: 2,
    tailAfterLastBounce: 90,
    dotSpacing: 17,
    dotR: [4.5, 2.2] as const,
    refineIters: 4,
  },

  merge: {
    contactSlop: 1.0,
    childCooldown: 0.1,
    growTime: 0.12,
    velInherit: 0.6,
    spinInherit: 0.5,
    popKick: 90,
    blastRange: 26,
    /** 索引 = 新果等级（2..11） */
    blastDv: [0, 0, 80, 90, 100, 115, 130, 150, 170, 190, 210, 240],
    superBlastDv: 520,
    superBlastRange: 160,
    fuseTime: 0.09,
    kissGap: 18,
    /** 引导 T1：新青提射向等待青提的速度 */
    tutorialAssistSpeed: 260,
  },

  danger: {
    tolerance: 2,
    limit: 3.0,
    showAfter: 0.35,
    recoverRate: 3,
    warnDistance: 48,
    graceAfterContact: 0.8,
    clutchThreshold: 2.0,
  },

  score: {
    /** 索引 = 合成出的等级（2..11） */
    mergeBase: [0, 0, 2, 4, 8, 14, 22, 34, 50, 72, 100, 150],
    superMerge: 500,
    firstRainbow: 300,
    trickMul: 1.5,
    clutchBonus: 50,
  },

  combo: {
    window: 1.4,
    mul: [1, 1.5, 2, 2.5, 3],
    mulStep: 0.25,
    mulMax: 5,
  },

  spawn: {
    weights: [26, 26, 24, 15, 9],
    maxStart: 3,
    unlock4At: 5,
    unlock5At: 6,
    /** 加压：第 rampStart 发起，在 rampShots 发内把各级权重乘到 (1 + rampBoost) */
    rampStart: 40,
    rampShots: 100,
    rampBoost: [0, 0, 0.3, 0.8, 1.0],
    /** 救场：有水果进入预警区时，下一个以此概率直接出最低那颗果的等级（须在已解锁范围内） */
    rescueChance: 0.5,
    /** 已有水果越线（倒计时中）时的救场概率：奖励会瞄准越线果的玩家 */
    rescueChanceOver: 0.5,
    maxSameInRow: 3,
    opening: [1, 1, 2],
  },

  fruits,
  maxLevel: 11,

  fx: {
    camera: { traumaDecay: 1.5, maxOffset: 9, maxAngleDeg: 1.0 },
    hitstopCap: 0.15,
    hitstopWindow: 0.3,
    slowmo: { scale: 0.3, duration: 0.35, easeBack: 0.25 },
    tiers: [
      { trauma: 0, hitstop: 0, zoom: 0, flash: 0, vibrate: 0, particles: 6 },
      { trauma: 0.06, hitstop: 0, zoom: 0, flash: 0, vibrate: 0, particles: 14 },
      { trauma: 0.16, hitstop: 0.035, zoom: 0.012, flash: 0.08, vibrate: 10, particles: 22 },
      { trauma: 0.3, hitstop: 0.07, zoom: 0.03, flash: 0.15, vibrate: 25, particles: 36 },
      { trauma: 0.5, hitstop: 0.12, zoom: 0.06, flash: 0.4, vibrate: 0, particles: 140 },
    ],
    deform: {
      freqSmall: 6.0,
      freqLarge: 3.2,
      damping: 0.32,
      maxStrain: 0.3,
      stretchMax: 0.16,
      stretchRefSpeed: 1500,
      impactKick: 0.5,
      impactRefSpeed: 800,
      impactMinSpeed: 120,
      pressureMax: 0.07,
      pressureK: 0.025,
      breatheAmp: 0.012,
      breatheHz: 0.6,
    },
  },

  impact: { bumpSpeed: 140, dizzySpeed: 950, blastDizzySpeed: 400 },

  audio: { master: 0.8, sfx: 0.9, music: 0.32, maxVoices: 14, bumpLimitPer100ms: 6 },

  quality: { downMs: 18.5, upMs: 12, window: 2, upHold: 10 },
};

export type Config = typeof CONFIG;

export function fruitDef(level: number): FruitDef {
  return CONFIG.fruits[level - 1]!;
}
