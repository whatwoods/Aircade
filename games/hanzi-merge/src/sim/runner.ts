/** 批量模拟与统计（浏览器 __game.simulate 与 tools/sim.ts 共用）。 */
import { CONFIG } from '../config.ts';
import { LEVELS } from '../data/levels.ts';
import { Game, createEndless, createLevel } from '../core/game.ts';
import { Rng } from '../core/rng.ts';
import type { LevelDef } from '../core/types.ts';
import { botAction, type BotKind } from './bots.ts';

export interface RunResult {
  won: boolean;
  inkLeft: number;
  actions: number;
  maxOcc: number;
  discards: number;
  newChars: number;
  delivered: number;
  stage: number;
  seconds: number;
}

export function runLevel(def: LevelDef, seed: number, bot: BotKind, maxSteps = 800): RunResult {
  const known = new Set<string>();
  const g = new Game(createLevel(def, seed, known));
  return play(g, bot, seed, maxSteps, known);
}

export function runEndless(seed: number, bot: BotKind, maxSteps = 3000): RunResult {
  const known = new Set<string>();
  const g = new Game(createEndless(seed, known));
  return play(g, bot, seed, maxSteps, known);
}

function play(g: Game, bot: BotKind, seed: number, maxSteps: number, known: Set<string>): RunResult {
  const rng = new Rng(seed * 7919 + 13);
  let maxOcc = 0;
  let steps = 0;
  while (g.s.status === 'play' && steps < maxSteps) {
    const a = botAction(g, bot, rng);
    if (!a) break;
    const ev = g.act(a);
    if (!ev.length) break;
    steps++;
    const occ = g.s.board.filter(Boolean).length;
    if (occ > maxOcc) maxOcc = occ;
  }
  const s = g.s;
  const per = bot === 'novice' ? CONFIG.sim.secPerActionNovice : CONFIG.sim.secPerActionDiligent;
  return {
    won: s.status === 'won',
    inkLeft: s.ink,
    actions: s.actions,
    maxOcc: maxOcc / (CONFIG.board.cols * CONFIG.board.rows),
    discards: s.discards,
    newChars: known.size,
    delivered: s.delivered,
    stage: s.stage,
    seconds: s.actions * per + known.size * CONFIG.sim.secPerCard,
  };
}

export const pct = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))];
};

export interface LevelStats {
  id: number;
  bot: BotKind;
  clear: number;
  inkP10: number;
  inkP50: number;
  inkP80: number;
  inkP90: number;
  actions: number;
  occP50: number;
  discards: number;
  seconds: number;
}

export function statLevel(def: LevelDef, bot: BotKind, seeds: number): LevelStats {
  const rs: RunResult[] = [];
  for (let i = 1; i <= seeds; i++) rs.push(runLevel(def, i, bot));
  const wins = rs.filter((r) => r.won);
  const ink = wins.map((r) => r.inkLeft);
  const avg = (f: (r: RunResult) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  return {
    id: def.id, bot, clear: wins.length / rs.length,
    inkP10: pct(ink, 10), inkP50: pct(ink, 50), inkP80: pct(ink, 80), inkP90: pct(ink, 90),
    actions: avg((r) => r.actions), occP50: pct(rs.map((r) => r.maxOcc), 50), discards: avg((r) => r.discards),
    seconds: pct(rs.map((r) => r.seconds), 50),
  };
}

export function simulate(opts: { levels?: number[]; seeds?: number; bots?: BotKind[] } = {}): LevelStats[] {
  const ids = opts.levels ?? LEVELS.map((l) => l.id);
  const out: LevelStats[] = [];
  for (const id of ids) {
    const def = LEVELS.find((l) => l.id === id);
    if (!def) continue;
    for (const b of opts.bots ?? (['novice', 'diligent', 'oracle'] as BotKind[])) out.push(statLevel(def, b, opts.seeds ?? 50));
  }
  return out;
}
