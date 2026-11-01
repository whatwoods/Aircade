import { CONFIG } from '../config';
import { hash32 } from '../core/rng';
import type { ScoreBreakdown } from './types';

/**
 * 每日挑战（文档 §6.9）：本地日期派生种子，同一天所有人同一盘面。
 * 每天只有一次正式机会：开局即记为已开始，可以读档继续，中途放弃不能重来。
 */
export interface DailyRec {
  score: number;
  won: boolean;
  time: number; // 秒
  done: boolean;
}

export type DailyState = 'open' | 'playing' | 'done';

export interface DailyInfo {
  key: string;
  state: DailyState;
  score: number;
  won: boolean;
}

export function todayKey(d = new Date()): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** 日期键 → 种子（与普通种子同值域） */
export function dailySeed(key: string): number {
  let h = CONFIG.daily.salt >>> 0;
  for (let i = 0; i < key.length; i++) h = hash32(h, key.charCodeAt(i));
  return h % 1000000;
}

/** 开局：占用当天的机会 */
export function beginDaily(all: Record<string, DailyRec>, key: string): void {
  all[key] = { score: 0, won: false, time: 0, done: false };
  const keys = Object.keys(all).sort();
  while (keys.length > CONFIG.daily.keepDays) delete all[keys.shift()!];
}

export function finishDaily(all: Record<string, DailyRec>, key: string, b: ScoreBreakdown): void {
  all[key] = { score: b.total, won: b.won, time: b.timeSec, done: true };
}

/** runActive：存档里是否正有这一天的每日局 */
export function dailyInfo(all: Record<string, DailyRec>, key: string, runActive: boolean): DailyInfo {
  const r = all[key];
  const state: DailyState = !r ? 'open' : !r.done && runActive ? 'playing' : 'done';
  return { key, state, score: r?.score ?? 0, won: r?.won ?? false };
}
