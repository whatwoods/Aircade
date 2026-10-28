import { Game } from '../core/game.ts';
import { secPerRow } from '../config.ts';
import type { Config } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { PERSONAS, candidates, choose, execute } from './bot.ts';
import type { PersonaId } from './bot.ts';

export interface GameResult {
  persona: PersonaId; seed: number; time: number; score: number; level: number;
  removedFive: number; removedRow: number; fives: number; pieces: number;
  firstFive: number; heightL5: number; heightL9: number; maxChain: number; inverts: number; reason: string;
}

/** 无头跑一局（第 10.3 节时间模型） */
export function runGame(cfg: Config, personaId: PersonaId, seed: number, maxMinutes = 25): GameResult {
  const persona = PERSONAS[personaId];
  const game = new Game(cfg, seed, { headless: true });
  const rng = new Rng(seed, 'bot-' + personaId);
  const diag = !(rng.next() < persona.diagBlindChance);
  let firstFive = -1, heightL5 = -1, heightL9 = -1;
  game.on('step', e => { if (e.step.kind === 'five' && firstFive < 0) firstFive = game.time; });
  game.start();
  game.update(0.01);
  const maxT = maxMinutes * 60;
  while (game.phase !== 'over' && game.time < maxT) {
    if (!game.active) { game.update(0.01); continue; }
    const spr = secPerRow(game.level, cfg);
    const cands = candidates(game, persona, rng, diag);
    if (!cands.length) { game.forceGameOver('blockout'); break; }
    // 可用时间：从出块落到目标位置 + 锁定延迟
    const best = cands[0];
    const avail = Math.max(0.05, best.dropRows * spr + cfg.lock.delayMs / 1000);
    const think = persona.think + persona.actionTime * best.actions;
    const panic = think > avail ? Math.min(1, think / avail - 1) : 0;
    const d = choose(cands, persona, rng, panic)!;
    const used = Math.min(think, avail);
    game.advanceTime(used);
    const lv = game.level;
    if (lv >= 5 && heightL5 < 0) heightL5 = 15 - game.grid.topRow();
    if (lv >= 9 && heightL9 < 0) heightL9 = 15 - game.grid.topRow();
    let steps = 0;
    const off = () => { steps++; };
    game.on('step', off);
    if (!execute(game, d, persona, rng)) { game.forceGameOver('blockout'); break; }
    game.advanceTime(steps * cfg.sim.resolveStepSec + cfg.lock.areMs / 1000);
    game.off('step', off);
  }
  const s = game.stats;
  return {
    persona: personaId, seed, time: game.time, score: game.score, level: game.level,
    removedFive: s.removedFive, removedRow: s.removedRow, fives: s.fives, pieces: s.pieces,
    firstFive, heightL5, heightL9, maxChain: s.maxChain, inverts: s.inverts, reason: game.gameOverReason || 'timeout',
  };
}

export interface Summary {
  persona: PersonaId; games: number; medTime: number; medScore: number; medLevel: number;
  fiveShare: number; firstFiveRate: number; medHL5: number; medHL9: number; deathByLevel: Record<number, number>; maxDeathShare: number; medInverts: number;
}

export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(rs: GameResult[]): Summary {
  const deaths: Record<number, number> = {};
  const buckets: Record<number, number> = {};
  let dead = 0;
  for (const r of rs) if (r.reason !== 'timeout') {
    deaths[r.level] = (deaths[r.level] ?? 0) + 1; dead++;
    const b = Math.floor(r.time / 45);
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  const rf = rs.reduce((a, r) => a + r.removedFive, 0), rr = rs.reduce((a, r) => a + r.removedRow, 0);
  const maxD = Math.max(0, ...Object.values(buckets));
  return {
    persona: rs[0].persona,
    games: rs.length,
    medTime: median(rs.map(r => r.time)),
    medScore: median(rs.map(r => r.score)),
    medLevel: median(rs.map(r => r.level)),
    fiveShare: rf / Math.max(1, rf + rr),
    firstFiveRate: rs.filter(r => r.firstFive >= 0 && r.firstFive <= 60).length / rs.length,
    medHL5: median(rs.filter(r => r.heightL5 >= 0).map(r => r.heightL5)),
    medHL9: median(rs.filter(r => r.heightL9 >= 0).map(r => r.heightL9)),
    deathByLevel: deaths,
    maxDeathShare: dead ? maxD / dead : 0,
    medInverts: median(rs.map(r => r.inverts / Math.max(1, r.pieces))),
  };
}
