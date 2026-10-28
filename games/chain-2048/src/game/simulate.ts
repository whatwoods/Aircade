/**
 * 无渲染批量模拟（docs §3.13 / §8）：scripts/sim.ts 与 window.__game.simulate 共用。纯逻辑。
 */
import { CONFIG } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { Bot, type BotKind } from './bots.ts';
import { Session } from './session.ts';

export interface StageStat { tries: number; clears: number; time: number[]; maxP: number[]; danger: number[]; shots: number; merges: number; casc: number[] }
export interface RunResult { minutes: number; stop: number }

export function runOne(kind: BotKind, seed: number, stats: Map<number, StageStat>, maxStage = 20, lives: number = CONFIG.run.lives, fromStage = 1): RunResult {
  const s = new Session(seed);
  s.autoAdvance = true;
  const bot = new Bot(kind, new Rng(seed * 7 + 3));
  const dt = CONFIG.logic.fixedDt;
  let cur: StageStat | null = null;
  let t0 = 0, maxP = 0, dangerT = 0, shots0 = 0, merges0 = 0;
  let total = 0;
  const begin = () => {
    let st = stats.get(s.stage);
    if (!st) { st = { tries: 0, clears: 0, time: [], maxP: [], danger: [], shots: 0, merges: 0, casc: [] }; stats.set(s.stage, st); }
    cur = st; st.tries++; t0 = total; maxP = 0; dangerT = 0; shots0 = s.stats.shots; merges0 = s.stats.merges;
  };
  const end = (clear: boolean) => {
    if (!cur) return;
    if (clear) { cur.clears++; cur.time.push(total - t0); }
    cur.maxP.push(Math.min(1, maxP)); cur.danger.push(dangerT / Math.max(1, total - t0));
    cur.shots += s.stats.shots - shots0; cur.merges += s.stats.merges - merges0;
  };
  s.bus.on('stageStart', () => begin());
  s.bus.on('stageClear', () => end(true));
  s.bus.on('failStart', () => end(false));
  s.bus.on('cascade', (e) => { if (cur && e.steps > 0) cur.casc.push(e.steps); });
  lives = Math.max(1, lives);
  s.newRun(fromStage);
  s.lives = lives;
  while (s.phase !== 'over' && total < 60 * 60) {
    if (s.stage > maxStage) break;
    bot.update(s, dt);
    s.step(dt);
    total += dt;
    if (s.phase === 'live') {
      const p = s.chain.headProgress();
      if (p > maxP) maxP = p;
      if (p >= CONFIG.danger.warn) dangerT += dt;
    }
  }
  return { minutes: total / 60, stop: s.stage };
}

export const med = (a: number[]) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]!; };
export const pct = (a: number[], q: number) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]!; };

export function report(kind: BotKind, runs: number, maxStage: number, seed0 = 1000, lives: number = CONFIG.run.lives, fromStage = 1) {
  const stats = new Map<number, StageStat>();
  const rs: RunResult[] = [];
  for (let r = 0; r < runs; r++) rs.push(runOne(kind, seed0 + r * 101, stats, maxStage, lives, fromStage));
  return { kind, runs: rs, stats, medMin: med(rs.map((r) => r.minutes)), medStop: med(rs.map((r) => r.stop)) };
}

