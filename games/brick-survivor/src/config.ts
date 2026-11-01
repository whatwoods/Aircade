// ★ BRICK SURVIVOR — single source of truth for every gameplay number (docs/brick-survivor.md §3.15).
// Pure visual micro-constants may live next to the drawing code; gameplay values live here.

export type WaveRow = {
  rows: number;
  beats: number;
  elites: number;
  boss?: 'monolith' | 'pulsar' | 'serpent' | 'omega';
};

const waveTable: WaveRow[] = [
  { rows: 6, beats: 6, elites: 0 }, // 1
  { rows: 6, beats: 6, elites: 0 }, // 2
  { rows: 6, beats: 6, elites: 1 }, // 3
  { rows: 7, beats: 5, elites: 1 }, // 4
  { rows: 0, beats: 6, elites: 0, boss: 'monolith' }, // 5
  { rows: 7, beats: 5, elites: 1 }, // 6
  { rows: 8, beats: 5, elites: 1 }, // 7
  { rows: 8, beats: 5, elites: 1 }, // 8
  { rows: 8, beats: 5, elites: 1 }, // 9
  { rows: 0, beats: 5, elites: 0, boss: 'pulsar' }, // 10
  { rows: 9, beats: 4, elites: 1 }, // 11
  { rows: 9, beats: 4, elites: 2 }, // 12
  { rows: 10, beats: 4, elites: 2 }, // 13
  { rows: 10, beats: 4, elites: 2 }, // 14
  { rows: 0, beats: 4, elites: 0, boss: 'serpent' }, // 15
  { rows: 11, beats: 4, elites: 2 }, // 16
  { rows: 11, beats: 4, elites: 2 }, // 17
  { rows: 11, beats: 4, elites: 2 }, // 18
  { rows: 11, beats: 4, elites: 2 }, // 19
  { rows: 0, beats: 6, elites: 0, boss: 'omega' }, // 20
];

export const config = {
  world: { width: 390, height: 844 },
  field: { wallL: 8, wallR: 382, ceilY: 68, dangerY: 684, catchY: 748, floorY: 792, dropY: 864 },
  grid: { cols: 7, cellW: 52, cellH: 28, brickW: 48, brickH: 24, x0: 13, visibleRows: 22, ringRows: 40 },
  physics: { hz: 120, maxStepsPerFrame: 8, maxFrameDt: 0.1, maxSubstepDist: 3, outOfBounds: 40 },
  input: { dragGain: 1.25, keySpeed: 700, keyAccel: 7000 },
  player: {
    maxHp: 10, hpCap: 20, paddleW: 76, paddleH: 8, perfectZone: 0.25, follow: 30, maxSpeed: 2400,
    iFrames: 1.0, prismW: 24, prismH: 20, muzzleOffset: 22, lowHp: 3,
    hitboxW: 0.8, hitboxTop: 14, hitboxBottom: 8,
  },
  ball: {
    startCount: 3, maxMain: 12, fireInterval: 0.4, reloadDelay: 0.5, speed: 600, radius: 6.5, baseDamage: 10,
    spreadPatternDeg: [0, -7, 7, -3.5, 3.5], fireEnglishFactor: 0.5, fireEnglishMaxDeg: 8,
    hitCooldown: 0.06, minAngleDeg: 12, stuckTime: 30, novaScale: 1.2,
  },
  charge: { perStack: 0.25, max: 3, perfectGrants: 2 },
  catch: { maxDeg: 60, englishDegPerUps: 0.012, englishMaxDeg: 15, scoopDepth: 10, perfectHitstopGap: 0.3 },
  shard: { radius: 4, lifetime: 6, fade: 0.5, cap: 40, spreadDeg: 30, pool: 60 },
  echo: { damage: 0.6, cap: 16, perfectSpreadDeg: 20 },
  dart: { turn: 400, damage: 0.7, lifetime: 10, cap: 60, everyHits: 3, speedMult: 0.9 },
  gems: {
    popUpMin: 80, popUpMax: 160, popSide: 60, gravity: 420, terminal: 240, floorLife: 7, blinkLast: 2,
    bounce: 0.3, friction: 6, max: 250, magnetRadius: 64, magnetAccel: 2600, magnetMax: 950, collect: 14,
    small: 1, medium: 5, large: 20, healChance: 0.35, heal: 1, vacuumSpeed: 900,
  },
  xp: { base: 5, perLevel: 3 },
  levelup: { inputLockMs: 350, easeIn: 0.25, easeOut: 0.4, cardStagger: 0.07 },
  // pressure director (docs §3.16): new-row HP is scaled so the formation settles near a per-wave target depth
  // (display row, 0 = top, 21 = danger line). Range 0.7–8 so it works mid-range instead of saturating.
  pressure: {
    on: true, gainUp: 0.02, gainDown: 0.06, settleSteps: 4, min: 0.7, max: 8,
    // per-step rate limit (×1.06 up / ÷1.08 down) so it never jumps; when it relaxes, bricks already on the
    // field are eased too (remaining HP × ratio^easeExisting) so an earlier over-shoot doesn't linger as a wall
    rateUp: 0.06, rateDown: 0.08, easeExisting: 1,
    // formed builds: each evolution adds this much to new-row HP (multiplicative with the director)
    evoK: 0.3,
    // per-wave ceiling: min(max, capBase + capPerWave·(w − capFrom)), raised to capEvoBase + capPerEvo·evolutions
    // for strong builds, so the ramp into the wave-10 boss isn't a grind before any evolution
    capBase: 3, capPerWave: 0.6, capFrom: 5, capEvoBase: 3.5, capPerEvo: 1.5,
    target: [0, 5, 6, 7, 8, 8, 9, 10, 11, 9, 12, 9, 11, 13, 11, 15, 12, 14, 15, 14, 16] as readonly number[],
    endlessTarget: 16,
  },
  advance: {
    bpm: 120, slideTime: 0.32, bounce: 2, sparseThreshold: 5, sparseBeats: 2, breachCapPerStep: 4,
    postBreachBeats: 2, armEpsilon: 0.05, prefillRows: 3, prefillAfterBoss: 2, spawnScale: 0.3,
  },
  waves: {
    hpBase: 10, hpGrowth: 1.17, hpGrowthLate: 1.22, hpLateFrom: 5, densityBase: 0.52, densityStep: 0.02, densityMax: 0.85, gapRows: 1,
    hpJitter: 0.1, minPerRow: 2, table: waveTable,
    special: {
      armored: { from: 3, base: 0.08, perWave: 0.012 },
      volatile: { from: 2, base: 0.06, perWave: 0, perRow: 1 },
      prism: { from: 1, base: 0.05, perWave: 0, perRow: 1 },
      turret: { from: 6, base: 0.05, perWave: 0.004, perTwoRows: 1, onScreen: 3 },
      warden: { from: 8, base: 0.04, perWave: 0, perRow: 1, onScreen: 2 },
    },
    endless: { rows: 11, beats: 4, beatsLate: 3, lateFrom: 30, extraGrowth: 1.03, bossHpPerRound: 0.8 },
    patterns: {
      // weight and first wave of each row pattern
      random: { from: 1, w: 3 },
      checker: { from: 2, w: 1 },
      vee: { from: 4, w: 1 },
      walls: { from: 6, w: 1 },
      pillars: { from: 7, w: 1 },
      full: { from: 11, w: 0.7 },
    },
  },
  bricks: {
    basic: { hp: 1, breach: 1, xp: 1, score: 1 },
    armored: { hp: 2.5, breach: 2, xp: 2, score: 2 },
    volatile: { hp: 0.6, breach: 2, xp: 1, score: 1.5 },
    prism: { hp: 1.5, breach: 1, xp: 7, score: 1.5 },
    turret: { hp: 1.5, breach: 1, xp: 2, score: 2 },
    warden: { hp: 2, breach: 1, xp: 2, score: 2 },
    elite: { hp: 8, breach: 3, xp: 25, score: 10 },
    pool: 200,
    volatileDmg: 1.5, volatileDelay: 0.07,
    turretPeriod: 5, turretCharge: 0.8, turretLock: 0.3, turretBulletSpeed: 220, turretBulletR: 6,
    wardenShield: 0.5, eliteHealChance: 0.35,
  },
  status: {
    burnTick: 0.5, chillDur: 4, thermalShockBonus: 1.5, blastCooldown: 0.3,
    bossChillPer: 0.05, bossChillMax: 0.3, bossChillDur: 4,
  },
  upgrades: {
    weaponSlots: 4, moduleSlots: 3, weightWeapon: 1.0, weightModule: 0.8, ownedMult: 1.6,
    multi: { add: [0, 1, 2, 3, 4, 6], intervalLv3: 0.9 },
    pierce: { count: [0, 1, 2, 3, 4, 5], freeKillFrom: 3, dmgLv5: 1.3 },
    split: { chance: [0, 0.15, 0.2, 0.22, 0.26, 0.3], count: [0, 1, 1, 2, 2, 2], dmg: [0, 0.5, 0.5, 0.5, 0.5, 0.7] },
    fire: {
      dps: [0, 0.25, 0.3, 0.35, 0.4, 0.5], stacks: [0, 3, 3, 4, 4, 5], dur: [0, 3, 3, 3.5, 3.5, 4],
      spread: [0, 0, 0, 2, 2, 4],
    },
    ice: {
      freezeAt: [0, 4, 4, 3, 3, 2], freezeDur: [0, 1.5, 2, 2, 2.5, 3], vuln: [0, 0.2, 0.25, 0.3, 0.4, 0.5],
      slowPer: [0, 0.05, 0.06, 0.06, 0.07, 0.08], slowCap: [0, 0.4, 0.4, 0.45, 0.5, 0.5], shatterFrom: 3,
      shatterDmg: 0.3,
    },
    blast: { radius: [0, 36, 42, 48, 56, 64], mult: [0, 0.5, 0.6, 0.7, 0.85, 1.0], chargeFrom: 3, ringDelay: 0.15, ringScale: 1.4, ringMult: 0.5 },
    homing: {
      turn: [0, 70, 100, 130, 160, 200], cone: [0, 70, 80, 90, 100, 110], assistFrom: 3, assistY: 450,
      assistMult: 0.35, threatFrom: 5, retarget: 0.15, minDist: 30,
    },
    power: { perLv: 0.12 },
    overclock: { interval: 0.08, speed: 0.04 },
    magnet: { radius: 28, xp: 0.04 },
    wide: { width: 0.1, perfect: 0.03 },
    aegis: { hp: 2, heal: 2, barrierCd: [0, 0, 40, 40, 28, 20] },
  },
  evolutions: {
    supernova: { radiusMult: 1.2, deathRadius: 48, deathDmg: 2, deathBurn: 2, chainDelay: 0.05, warmFlashAt: 6 },
    absoluteZero: { freezeDur: 3, shards: 6, shardDmg: 0.4, slowCap: 0.7 },
    swarm: {},
    prismEcho: {},
  },
  fillers: { batteryHeal: 2, cachePerWave: 150 },
  rerolls: { start: 1, perBoss: 1 },
  combo: {
    // the window shrinks from 1.8 s (≤100) to 0.9 s (≥1000); a missed main ball halves the combo
    // hard cap 999; every new wave halves it (waveKeep) so the number keeps moving even when nothing is missed
    window: 1.8, windowMin: 0.9, shrinkFrom: 100, shrinkTo: 1000, missKeep: 0.5, cap: 999, waveKeep: 0.5,
    tiers: [10, 25, 50, 100, 250, 600], mults: [1.2, 1.5, 2.0, 2.5, 3.0, 4.0],
    milestones: [50, 100, 250, 500, 999],
  },
  score: {
    brick: 10, wavePct: 0.15, perfect: 20, intercept: 5, bossBase: 2000, noDamageMult: 1.5,
    victoryBase: 10000, victoryPerHp: 1000, victoryPar: 900, victoryPerSec: 10, endlessMult: 1.5,
  },
  bullets: { max: 120, dmg: 1, laserDmg: 2 },
  bosses: {
    intro: { warn: 2.0, descend: 1.5, startY: -120, nameCard: 1.2, attackDelay: 1.0 },
    death: { hitstopMs: 150, slowScale: 0.15, slowReal: 1.2, zoom: 1.06, explosions: 6, explodeGap: 0.03, shockDur: 0.6, rampBack: 0.5 },
    victory: { hitstopMs: 200, slowScale: 0.1, slowReal: 1.5 },
    reward: { largeGems: 3, heal: 3, rerolls: 1 },
    monolith: {
      hp: 1300, coreR: 40, plates: 6, plateR: 12, plateOrbit: 72, plateSpeed: 50, plateSpeed2: 90, plateHits: 3,
      plateRegen: 6, regenAnim: 0.5, swayAmp: 70, swayPeriod: 8, homeY: 180, slamDmg: 3, slamReturn: 1.2,
      summonEvery: 9, summonWarn: 0.8, summonCount: 3, summonHp: 19, phase2: 0.5, shotEvery: 4, shotWarn: 0.5,
      shotSpeed: 200, stepBeats: 6,
    },
    pulsar: {
      hp: 3000, r: 36, xs: [90, 195, 300], y: 200, travel: 1.6, dwell: 1.2, fanWarn: 0.6, fanCount: 4, fanSpread: 60,
      fanSpeed: 170, diveEvery: 14, diveWarn: 1.0, diveTime: 0.5, diveY: 470, ringCount: 8, ringSpeed: 160,
      hover: 1.5, hoverVuln: 0.25, returnTime: 0.8, splitAt: 0.5, childR: 26, childFan: 3, childSpeed: 1.3,
      enrage: 0.3, splitHitstopMs: 120,
    },
    serpent: {
      hp: 18000, segments: 14, headHp: 2400, headR: 18, segR: 14, spacing: 30, speed: 120, speedPerLost: 5,
      speedMax: 190, dropTime: 0.25, wreckHp: 90, reachDmg: 2, teleport: 0.6, spitEvery: 6, spitCount: 3,
      spitSpeed: 200, spitMinY: 300, startRow: 1,
    },
    omega: {
      hp: 30000, r: 48, x: 195, y: 220, cells: 10, cellR: 13, orbit: 88, speed1: 40, speed2: 70, cellHits: 3,
      cellRegen: 8, sideCols: [0, 1, 5, 6], rowBeats: 6, rowBeats3: 4, rowHp: 197, rowHpMult: 0.8,
      aimEvery: 5, aimEvery2: 6, aimCount: 3, aimSpread: 24, aimSpeed: 200, p2: 0.66, p3: 0.33,
      laserEvery: 5, laserEvery3: 7, laserWarn: 1.0, laserActive: 0.6, laserW: 34, laserMinSep: 80,
      p3Vuln: 0.3, p3Y: 150, spiralArms: 2, spiralRate: 7, spiralRot: 120, spiralSpeed: 150, spiralEvery: 6,
      spiralDur: 3, phaseHitstopMs: 120,
    },
  },
  tutorial: {
    dragNeed: 120, brickHp: 10, brickRowY: 260, gemNeed: 3, gemTimeout: 4, rowBeats: 4, readyTime: 0.8, t3Dwell: 2.2, t3OkTime: 1.4,
  },
  quality: {
    high: { dpr: 2, bloom: true, particles: 1800, trail: 14, scan: true },
    mid: { dpr: 1.5, bloom: false, particles: 1200, trail: 10, scan: true },
    low: { dpr: 1, bloom: false, particles: 700, trail: 7, scan: false },
    sampleSec: 5, p90Limit: 18.5,
  },
} as const;

export type Config = typeof config;

// ---------------------------------------------------------------------------------------------
// Juice table (docs §5.2). trauma / hitstop (ms) / particle count hint / haptic / tier.
// ---------------------------------------------------------------------------------------------
export type Juice = { trauma: number; hitstopMs: number; particles: number; haptic: number | readonly number[]; tier: number };

export const juice = {
  dragStart: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 0 },
  fire: { trauma: 0, hitstopMs: 0, particles: 2, haptic: 0, tier: 1 },
  catch: { trauma: 0.02, hitstopMs: 0, particles: 4, haptic: 0, tier: 1 },
  perfectCatch: { trauma: 0.05, hitstopMs: 30, particles: 8, haptic: 10, tier: 2 },
  miss: { trauma: 0, hitstopMs: 0, particles: 1, haptic: 0, tier: 0 },
  wallHit: { trauma: 0, hitstopMs: 0, particles: 2, haptic: 0, tier: 0 },
  brickHit: { trauma: 0, hitstopMs: 0, particles: 3, haptic: 0, tier: 1 },
  brickBreak: { trauma: 0.03, hitstopMs: 0, particles: 22, haptic: 0, tier: 2 },
  specialBreak: { trauma: 0.06, hitstopMs: 0, particles: 33, haptic: 0, tier: 2 },
  eliteBreak: { trauma: 0.25, hitstopMs: 50, particles: 60, haptic: 25, tier: 3 },
  burn: { trauma: 0, hitstopMs: 0, particles: 2, haptic: 0, tier: 0 },
  chill: { trauma: 0, hitstopMs: 0, particles: 1, haptic: 0, tier: 0 },
  freeze: { trauma: 0, hitstopMs: 0, particles: 4, haptic: 0, tier: 1 },
  thermalShock: { trauma: 0.08, hitstopMs: 0, particles: 12, haptic: 0, tier: 2 },
  blast: { trauma: 0.05, hitstopMs: 0, particles: 10, haptic: 0, tier: 2 },
  volatileBoom: { trauma: 0.2, hitstopMs: 40, particles: 30, haptic: 20, tier: 3 },
  split: { trauma: 0, hitstopMs: 0, particles: 2, haptic: 0, tier: 1 },
  pierce: { trauma: 0, hitstopMs: 0, particles: 3, haptic: 0, tier: 1 },
  homingLock: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 0 },
  gemPickup: { trauma: 0, hitstopMs: 0, particles: 1, haptic: 0, tier: 0 },
  levelUp: { trauma: 0, hitstopMs: 0, particles: 24, haptic: 15, tier: 3 },
  cardPick: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 15, tier: 2 },
  reroll: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 1 },
  evolve: { trauma: 0.2, hitstopMs: 0, particles: 60, haptic: 30, tier: 4 },
  advance: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 0 },
  breachWarn: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 1 },
  breach: { trauma: 0.45, hitstopMs: 80, particles: 20, haptic: 60, tier: 4 },
  barrierBlock: { trauma: 0.15, hitstopMs: 40, particles: 24, haptic: 20, tier: 3 },
  playerHit: { trauma: 0.35, hitstopMs: 60, particles: 12, haptic: 40, tier: 3 },
  bulletIntercept: { trauma: 0, hitstopMs: 0, particles: 4, haptic: 0, tier: 1 },
  comboTier: { trauma: 0, hitstopMs: 0, particles: 8, haptic: 0, tier: 2 },
  comboMilestone: { trauma: 0.08, hitstopMs: 0, particles: 30, haptic: 10, tier: 3 },
  comboBreak: { trauma: 0, hitstopMs: 0, particles: 12, haptic: 0, tier: 1 },
  comboDrop: { trauma: 0, hitstopMs: 0, particles: 6, haptic: 0, tier: 1 },
  tutCharge: { trauma: 0, hitstopMs: 0, particles: 10, haptic: 10, tier: 2 },
  waveStart: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 2 },
  bossWarning: { trauma: 0.1, hitstopMs: 0, particles: 0, haptic: [30, 60, 30], tier: 4 },
  bossArrive: { trauma: 0.3, hitstopMs: 0, particles: 40, haptic: 30, tier: 4 },
  bossHit: { trauma: 0, hitstopMs: 0, particles: 3, haptic: 0, tier: 1 },
  bossShieldBreak: { trauma: 0.08, hitstopMs: 0, particles: 16, haptic: 0, tier: 2 },
  bossTelegraph: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 1 },
  bossPhase: { trauma: 0.4, hitstopMs: 120, particles: 50, haptic: 40, tier: 4 },
  bossDefeat: { trauma: 0.7, hitstopMs: 150, particles: 200, haptic: [80, 40, 120], tier: 5 },
  healPickup: { trauma: 0, hitstopMs: 0, particles: 10, haptic: 10, tier: 2 },
  lowHp: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 0, tier: 1 },
  playerDeath: { trauma: 0.8, hitstopMs: 100, particles: 80, haptic: 200, tier: 5 },
  victory: { trauma: 0.7, hitstopMs: 200, particles: 300, haptic: [100, 50, 200], tier: 5 },
  newRecord: { trauma: 0, hitstopMs: 0, particles: 120, haptic: 30, tier: 4 },
  uiPress: { trauma: 0, hitstopMs: 0, particles: 0, haptic: 5, tier: 1 },
  // extra logic events (not separate rows in §5.2, they reuse the closest row's intensity)
  novaBoom: { trauma: 0.06, hitstopMs: 0, particles: 16, haptic: 0, tier: 2 },
  iceShard: { trauma: 0.03, hitstopMs: 0, particles: 6, haptic: 0, tier: 2 },
  shatter: { trauma: 0.02, hitstopMs: 0, particles: 6, haptic: 0, tier: 1 },
  enemyShot: { trauma: 0, hitstopMs: 0, particles: 3, haptic: 0, tier: 1 },
  laserFire: { trauma: 0.12, hitstopMs: 0, particles: 10, haptic: 0, tier: 2 },
  crush: { trauma: 0.02, hitstopMs: 0, particles: 10, haptic: 0, tier: 1 },
  slam: { trauma: 0.5, hitstopMs: 80, particles: 30, haptic: 60, tier: 4 },
  summon: { trauma: 0, hitstopMs: 0, particles: 8, haptic: 0, tier: 1 },
  dart: { trauma: 0, hitstopMs: 0, particles: 1, haptic: 0, tier: 0 },
  echo: { trauma: 0, hitstopMs: 0, particles: 4, haptic: 0, tier: 1 },
  thaw: { trauma: 0, hitstopMs: 0, particles: 4, haptic: 0, tier: 0 },
  barrierReady: { trauma: 0, hitstopMs: 0, particles: 8, haptic: 0, tier: 1 },
  heal: { trauma: 0, hitstopMs: 0, particles: 10, haptic: 0, tier: 2 },
} as const satisfies Record<string, Juice>;

export type FxEventId = keyof typeof juice;

export const juiceRules = {
  traumaOffset: 9, traumaRotDeg: 1.0, traumaFreq: 18, traumaDecay: 1.8, smallTierCapPerFrame: 0.12,
  hitstopMinGap: 0.15, reduceFlashCap: 0.35,
};

// Palette (docs §4.2) as 0xRRGGBB.
export const pal = {
  void: 0x05030b, deep: 0x0c0720, violet: 0x1b0f3a, grid: 0x3a2470, wall: 0x4b3d9a, danger: 0xff3355,
  uiText: 0xede9ff, uiDim: 0x8f86b8, uiStroke: 0x3b2c73, gold: 0xffc94d,
  neutral: 0xbfb3ff, fire: 0xff7a1a, fireCore: 0xffe0b0, ice: 0x2ee6ff, iceCore: 0xe8fdff,
  blast: 0xff2fd0, blastCore: 0xffd6f6, novaCore: 0xfff6e0, pierce: 0xa9c1ff, homing: 0xb6ff2e, split: 0xc77dff,
  gem: 0xffd84a, gemHi: 0xfff3b0, heal: 0x6bffb8, white: 0xffffff, multi: 0xf4f1ff,
  basic: 0x8a5cff, basicBody: 0x160d33, armored: 0x4d74ff, volatile: 0xff3355, prismBrick: 0x8a5cff,
  turret: 0x6a4bd6, warden: 0xe6e2ff, elite: 0xb07cff,
  monolith: 0xcdb8ff, monolithPlate: 0x5a4bff, pulsar: 0xff3355, serpent: 0x8a5cff,
  paddleEnd: 0xcfc4ff,
} as const;
