import { CONFIG } from '../config.ts';
import { N } from './board.ts';
import type { Game } from './rules.ts';
import { Kind, type ScoreBreakdown } from './types.ts';

/** 成就（文档 §6.11）：结算时按本局结果和累计记录检查，已解锁的记下解锁时间 */
export interface AchCtx {
  g: Game;
  b: ScoreBreakdown;
  /** 全部难度累计屠龙次数（含本局） */
  totalWins: number;
  /** 已完成的每日挑战次数（含本局） */
  dailyDone: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  test: (c: AchCtx) => boolean;
}

const A = CONFIG.achievements;
const used = (g: Game, kind: number): number => {
  let n = 0;
  for (let i = 0; i < N; i++) if (g.collected[i] && g.b.kind[i] === kind) n++;
  return n;
};
const won = (c: AchCtx) => c.b.won;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', name: '初战告捷', desc: '第一次屠龙', test: won },
  { id: 'easy', name: '学徒出师', desc: '学徒难度屠龙', test: (c) => won(c) && c.g.diff.id === 'easy' },
  { id: 'normal', name: '冒险者', desc: '冒险者难度屠龙', test: (c) => won(c) && c.g.diff.id === 'normal' },
  { id: 'hard', name: '英雄', desc: '英雄难度屠龙', test: (c) => won(c) && c.g.diff.id === 'hard' },
  { id: 'clear', name: '肃清', desc: '清光所有怪物后屠龙', test: (c) => won(c) && c.g.fullCleared },
  { id: 'rage', name: '龙怒', desc: `一局龙怒得分 ${A.rageScore} 以上`, test: (c) => c.b.rage >= A.rageScore },
  { id: 'glory', name: '荣光', desc: `一局 ${A.gloryScore.toLocaleString('en-US')} 分`, test: (c) => c.b.total >= A.gloryScore },
  { id: 'speed', name: '迅捷', desc: `${A.speedSec / 60} 分钟内屠龙`, test: (c) => won(c) && c.b.timeSec <= A.speedSec },
  { id: 'close', name: '命悬一线', desc: '战斗后只剩 1 点生命', test: (c) => c.g.closeCall },
  { id: 'dry', name: '滴血不沾', desc: '不喝血瓶屠龙', test: (c) => won(c) && used(c.g, Kind.Potion) === 0 },
  { id: 'ascetic', name: '视金如土', desc: '不开宝箱屠龙', test: (c) => won(c) && used(c.g, Kind.Chest) === 0 },
  { id: 'seer', name: '先知', desc: `一局猜中 ${A.seerMarks} 个标记`, test: (c) => c.g.correctMarks >= A.seerMarks },
  { id: 'lich', name: '巫妖克星', desc: '击败巫妖', test: (c) => c.g.b.counts[9] > 0 && c.g.alive[9] < c.g.b.counts[9] },
  { id: 'daily', name: '每日一战', desc: '完成一次每日挑战', test: (c) => c.g.daily !== null },
  { id: 'daily7', name: '风雨无阻', desc: `完成 ${A.dailyCount} 次每日挑战`, test: (c) => c.dailyDone >= A.dailyCount },
  { id: 'veteran', name: '百战老兵', desc: `累计屠龙 ${A.veteranWins} 次`, test: (c) => c.totalWins >= A.veteranWins },
];

/** 检查并记下新解锁的成就，返回新解锁的列表 */
export function checkAchievements(have: Record<string, number>, c: AchCtx, now = Date.now()): Achievement[] {
  if (c.g.isTutorial) return [];
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (have[a.id] || !a.test(c)) continue;
    have[a.id] = now;
    out.push(a);
  }
  return out;
}
