// 计分与最高分
import { DIFFICULTY, SCORE } from '../config.ts';
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

// ---------- 难度解锁 ----------

/** 已解锁的最高难度（通关第 n 级解锁 n+1） */
export function unlockedTier(): number {
  return Math.max(0, Math.min(DIFFICULTY.names.length - 1, load<number>('tier', 0)));
}

export function unlockTier(cleared: number): boolean {
  const next = Math.min(DIFFICULTY.names.length - 1, cleared + 1);
  if (next <= unlockedTier()) return false;
  save('tier', next);
  return true;
}

// ---------- 每日挑战 ----------

/** 本地日期 YYYY-MM-DD */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(date: string): number {
  return Number(date.replace(/-/g, ''));
}

export interface DailyRecord {
  date: string;
  score: number;
  round: number;
  cleared: boolean;
}

/** 当天的每日挑战最好成绩（别的日期的记录视为没有） */
export function loadDaily(date: string): DailyRecord | null {
  const d = load<DailyRecord | null>('daily', null);
  return d && d.date === date && typeof d.score === 'number' ? d : null;
}

export function submitDaily(rec: DailyRecord): boolean {
  const old = loadDaily(rec.date);
  if (old && old.score >= rec.score) return false;
  save('daily', rec);
  return true;
}
