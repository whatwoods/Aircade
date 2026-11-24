// 备战对比：双方用同一套口径估算 生命 / 对这个对手的每秒伤害 / 每秒防护（静态估算，不跑模拟、不给胜负）
import { AFFIX, BATTLE } from '../config.ts';
import { makeFighter, type Fighter, type FighterInput } from './battle/sim.ts';

export interface SideStats {
  hp: number;
  /** 命中（已扣对方减伤）+ 中毒 */
  dps: number;
  /** 护盾 + 治疗 + 吸血 + 减伤挡下 + 一次性保命折算 */
  guard: number;
}

/** 一次性效果（开场护盾、药水、复活）和中毒叠层按这段时长折算成每秒 */
export const STATS_WINDOW = 10;

const rate = (A: Fighter, cd: number, speedMul: number): number => Math.min(BATTLE.speedCap, speedMul + A.speedBonus) / cd;
const hitOn = (dmg: number, D: Fighter): number => Math.max(BATTLE.minHit, dmg - D.reduce);

function offense(A: Fighter, D: Fighter): number {
  let hit = 0;
  let stacks = 0;
  for (const { d } of A.units) {
    if (d.tag !== 'weapon') continue;
    const n = rate(A, d.cd, d.speedMul) * d.hits;
    hit += hitOn(d.dmg, D) * n;
    stacks += d.poison * n;
  }
  // 层数随时间线性增长、每 poisonInterval 秒按当前层数结算：窗口内平均每秒 = 叠层速度 × 窗口 / (2 × 间隔)
  return hit + (stacks * STATS_WINDOW) / (2 * BATTLE.poisonInterval);
}

function defense(S: Fighter, O: Fighter): number {
  let g = 0;
  for (const { d } of S.units) {
    const r = rate(S, d.cd, d.speedMul);
    if (d.tag === 'armor') g += d.shield * r;
    else if (d.tag === 'remedy') g += d.heal * r;
    else if (d.tag === 'weapon') g += (d.shieldOnHit + hitOn(d.dmg, O) * d.lifesteal) * r * d.hits;
  }
  for (const { d } of O.units) {
    if (d.tag !== 'weapon') continue;
    g += (d.dmg - hitOn(d.dmg, S)) * rate(O, d.cd, d.speedMul) * d.hits;
  }
  let once = 0;
  for (const d of S.starts) once += d.startShield;
  for (const d of S.potions) once += d.lowHpHeal;
  for (const d of S.phoenix) once += Math.floor(S.maxHp * Math.min(1, d.reviveFrac));
  if (S.affixes.includes('shielded')) once += Math.round(S.maxHp * AFFIX.shieldedFrac);
  g += once / STATS_WINDOW;
  if (S.affixes.includes('regen')) g += Math.max(1, Math.round(S.maxHp * AFFIX.regenFrac)) / AFFIX.regenEvery;
  return g;
}

export function compareStats(player: FighterInput, enemy: FighterInput): [SideStats, SideStats] {
  const P = makeFighter(0, player);
  const E = makeFighter(1, enemy);
  return [
    { hp: P.maxHp, dps: offense(P, E), guard: defense(P, E) },
    { hp: E.maxHp, dps: offense(E, P), guard: defense(E, P) },
  ];
}

/** 显示用：10 以下留一位小数 */
export function fmtRate(v: number): string {
  if (v <= 0) return '0';
  return v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString();
}
