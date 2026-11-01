import { CONFIG } from '../config.ts';

/** 难度档（文档 §3.8）：基础数值 + config.difficulty 的覆盖 */
export type DiffId = keyof typeof CONFIG.difficulty;
export const DIFF_IDS = Object.keys(CONFIG.difficulty) as DiffId[];

export interface DiffParams {
  id: DiffId;
  name: string;
  counts: Record<number, number>;
  potionCount: number;
  dragonLevel: number;
  minHp: number;
}

export const isDiff = (x: unknown): x is DiffId => typeof x === 'string' && x in CONFIG.difficulty;

const cache = new Map<DiffId, DiffParams>();
export function diffParams(id: DiffId): DiffParams {
  let p = cache.get(id);
  if (p) return p;
  const d = CONFIG.difficulty[id];
  const counts: Record<number, number> = {};
  for (let l = 1; l <= 9; l++) counts[l] = Math.max(0, (CONFIG.monsters.counts[l] ?? 0) + (d.countsDelta[l] ?? 0));
  p = { id, name: d.name, counts, potionCount: d.potionCount, dragonLevel: d.dragonLevel, minHp: d.minHpToChallenge };
  cache.set(id, p);
  return p;
}
