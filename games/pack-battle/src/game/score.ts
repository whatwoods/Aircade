// 计分与最高分
import { SCORE } from '../config.ts';
import { load, save } from '../core/storage.ts';

export function winScore(round: number, hpRatio: number): number {
  return SCORE.winBase * round + Math.round(SCORE.winHpBonus * round * Math.max(0, Math.min(1, hpRatio)));
}

export function clearScore(hearts: number): number {
  return SCORE.clearBonus + SCORE.heartBonus * hearts;
}

export interface BestRecord {
  score: number;
  round: number;
  cleared: boolean;
  date: number;
}

export function loadBest(): BestRecord | null {
  const b = load<BestRecord | null>('best', null);
  if (!b || typeof b.score !== 'number') return null;
  return b;
}

/** 提交成绩，返回是否破纪录 */
export function submitBest(rec: BestRecord): boolean {
  const old = loadBest();
  if (old && old.score >= rec.score) return false;
  save('best', rec);
  return true;
}
