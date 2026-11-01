import { type BlessCfg, CONFIG } from '../config.ts';
import { Rng } from '../core/rng.ts';

/** 祝福（文档 §3.10）：升到 CONFIG.difficulty.*.blessLevels 时三选一，效果整局有效；多数有代价 */
export type BlessId = 'vigor' | 'leech' | 'butcher' | 'armor' | 'greed' | 'alchemy' | 'undying' | 'insight' | 'bounty' | 'berserk';

export interface BlessDef {
  id: BlessId;
  /** 印章字 */
  seal: string;
  name: string;
  gain: string;
  /** 代价；空串 = 无 */
  cost: string;
}

const C = CONFIG.blessings.cards;
const c = (id: BlessId): BlessCfg => C[id] ?? {};

/** 代价文字由通用字段生成 */
function costOf(id: BlessId): string {
  const k = c(id);
  const out: string[] = [];
  if (k.hp && k.hp < 0) out.push(`生命上限 ${k.hp}`);
  if (k.noPotion) out.push('血瓶失效');
  if (k.potionHeal && k.potionHeal < 0) out.push(`血瓶回复 ${k.potionHeal}`);
  if (k.noChestXp) out.push('宝箱不再给经验');
  if (k.goldHalf) out.push('宝箱金币减半');
  if (k.dmgAll && k.dmgAll > 0) out.push(`受到伤害 +${k.dmgAll}`);
  if (k.lowAdd) out.push(`${k.lowMax === 1 ? '1 级' : `${k.lowMax} 级及以下`}的怪物伤害 +${k.lowAdd}`);
  if (k.freeMaxLevel) out.push('它们也不给经验');
  return out.join('，');
}

const def = (id: BlessId, seal: string, name: string, gain: string): BlessDef => ({ id, seal, name, gain, cost: costOf(id) });

export const BLESSINGS: readonly BlessDef[] = [
  def('vigor', '韧', '坚韧', `生命上限 +${c('vigor').hp}`),
  def('leech', '噬', '噬血', `击杀 ${c('leech').killHealMinLevel} 级及以上的怪物回复 ${c('leech').killHeal} 生命`),
  def('butcher', '屠', '屠夫', `${c('butcher').freeMaxLevel} 级及以下的怪物不伤你`),
  def('armor', '甲', '鳞甲', `${c('armor').reduceMinLevel} 级及以上的怪物伤害 -${c('armor').reduce}`),
  def('greed', '贪', '贪婪', `宝箱经验 +${c('greed').chestXp}、金币 ×${c('greed').goldMult}`),
  def('alchemy', '药', '炼金', '血瓶回满生命'),
  def('undying', '魂', '不屈', '第一次致命伤害时留 1 生命'),
  def('berserk', '狂', '狂战', `击杀经验 +${c('berserk').killXp}`),
  def('insight', '眼', '洞察', `立刻标出最强的 ${c('insight').count} 只怪物`),
  def('bounty', '赏', '赏金', `此后击杀分每级 +${c('bounty').perLevel}`),
];

const BY_ID = new Map(BLESSINGS.map((b) => [b.id, b]));
export const blessDef = (id: BlessId): BlessDef => BY_ID.get(id)!;
export const isBless = (x: unknown): x is BlessId => typeof x === 'string' && BY_ID.has(x as BlessId);

/** 第 pick 次（从 0 起）的候选：由种子决定，同一局（含每日挑战）人人相同；已拥有的不再出现 */
export function rollOffer(seed: number, pick: number, owned: readonly BlessId[]): BlessId[] {
  const pool = BLESSINGS.map((b) => b.id).filter((id) => !owned.includes(id));
  const rng = new Rng(((seed * 31) ^ (pick * 0x9e37 + 0x51)) >>> 0);
  for (let k = pool.length - 1; k > 0; k--) {
    const j = rng.int(k + 1);
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  return pool.slice(0, CONFIG.blessings.offerCount);
}

// ---------------------------------------------------------------- 效果（规则与机器人共用）
type Has = (id: BlessId) => boolean;
const ALL = (): BlessId[] => BLESSINGS.map((b) => b.id);
const sum = (has: Has, f: (k: BlessCfg) => number | undefined): number => ALL().reduce((a, id) => a + (has(id) ? (f(c(id)) ?? 0) : 0), 0);
const any = (has: Has, f: (k: BlessCfg) => boolean | undefined): boolean => ALL().some((id) => has(id) && !!f(c(id)));

/** 生命上限增减 */
export function bonusHp(has: Has): number {
  return sum(has, (k) => k.hp);
}

const freeLevel = (has: Has): number => sum(has, (k) => k.freeMaxLevel);

/** 该等级的怪物实际造成的伤害 */
export function damageOf(has: Has, level: number): number {
  if (level <= freeLevel(has)) return 0;
  let d = level + sum(has, (k) => k.dmgAll);
  for (const id of ALL()) {
    if (!has(id)) continue;
    const k = c(id);
    if (k.reduceMinLevel && level >= k.reduceMinLevel) d -= k.reduce ?? 0;
    if (k.lowMax && level <= k.lowMax) d += k.lowAdd ?? 0;
  }
  return Math.max(0, d);
}

/** 击杀该等级怪物得到的经验 */
export function killXpOf(has: Has, level: number): number {
  if (level <= freeLevel(has)) return 0;
  return level * CONFIG.monsters.xpPerLevel + sum(has, (k) => k.killXp);
}

export function killHealOf(has: Has, level: number): number {
  return sum(has, (k) => (level >= (k.killHealMinLevel ?? 0) ? k.killHeal : 0));
}

export function chestXpOf(has: Has, base: number): number {
  if (any(has, (k) => k.noChestXp)) return 0;
  return base + sum(has, (k) => k.chestXp);
}

export function chestGoldOf(has: Has, base: number): number {
  let g = base;
  for (const id of ALL()) if (has(id) && c(id).goldMult) g *= c(id).goldMult!;
  return any(has, (k) => k.goldHalf) ? Math.round(g / 2) : g;
}

/** 血瓶回复量；Infinity = 回满，0 = 失效 */
export function potionHealOf(has: Has, base: number): number {
  if (any(has, (k) => k.noPotion)) return 0;
  if (any(has, (k) => k.potionFull)) return Infinity;
  return Math.max(0, base + sum(has, (k) => k.potionHeal));
}
