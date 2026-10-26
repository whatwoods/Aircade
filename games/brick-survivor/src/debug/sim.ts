// Headless batch simulation with the autoplay bot (docs §8 simulate, §3.16): no rendering, null sink, runs in
// ~25 ms slices so the page stays responsive.
import { Game } from '../game/game';

export interface SimOptions {
  runs: number;
  seed?: number;
  maxWave?: number;
  /** kept for API compatibility; the simulation always runs as fast as it can */
  speed?: number;
}

export interface SimReport {
  runs: number;
  seeds: number[];
  /** average seconds spent in each wave (index = wave number) */
  waveAvgSec: number[];
  /** average lowest brick display row when the formation settles (0 = top, 21 = danger line) */
  avgLowestRow: number;
  avgDamageTaken: number;
  avgHits: number;
  /** wave number → deaths in that wave */
  deathWaves: Record<number, number>;
  victoryRate: number;
  avgLevel: number;
  avgRunSec: number;
  elapsedMs: number;
}

const DT = 1 / 120;
const MAX_STEPS = 120 * 60 * 25;

export function simulate(opts: SimOptions): Promise<SimReport> {
  const runs = Math.max(1, Math.min(200, Math.floor(opts.runs || 1)));
  const maxWave = Math.max(1, Math.min(40, Math.floor(opts.maxWave ?? 20)));
  const base = (opts.seed ?? 1) >>> 0;
  const t0 = performance.now();
  const waveSum: number[] = [];
  const waveCnt: number[] = [];
  const deathWaves: Record<number, number> = {};
  const seeds: number[] = [];
  let lowSum = 0;
  let lowN = 0;
  let dmg = 0;
  let hits = 0;
  let wins = 0;
  let lvl = 0;
  let time = 0;
  return new Promise((resolve) => {
    let run = 0;
    let g: Game | null = null;
    let steps = 0;
    let lastWave = 0;
    let waveT = 0;
    const startRun = (): void => {
      const seed = (base + run * 7919) >>> 0;
      seeds.push(seed);
      g = new Game();
      g.start({ seed, tutorial: false });
      g.autoplay.enabled = true;
      steps = 0;
      lastWave = g.wave;
      waveT = 0;
    };
    const endRun = (gm: Game): void => {
      if (gm.phase === 'dying' || gm.phase === 'over') deathWaves[gm.wave] = (deathWaves[gm.wave] ?? 0) + 1;
      if (gm.phase === 'won' || gm.phase === 'victoryAnim' || gm.victoryReached) wins++;
      lowSum += gm.lowestRowSum;
      lowN += gm.lowestRowN;
      dmg += gm.runStats.dmgTaken;
      hits += gm.runStats.dmgTaken > 0 ? 1 : 0;
      lvl += gm.level;
      time += gm.runTime;
      run++;
      g = null;
    };
    const slice = (): void => {
      const until = performance.now() + 25;
      while (performance.now() < until) {
        if (!g) {
          if (run >= runs) {
            const waveAvgSec: number[] = [];
            for (let w = 0; w < waveSum.length; w++) waveAvgSec[w] = waveCnt[w] ? Math.round((waveSum[w]! / waveCnt[w]!) * 10) / 10 : 0;
            resolve({
              runs,
              seeds,
              waveAvgSec,
              avgLowestRow: lowN ? Math.round((lowSum / lowN) * 100) / 100 : 0,
              avgDamageTaken: Math.round((dmg / runs) * 100) / 100,
              avgHits: Math.round((hits / runs) * 100) / 100,
              deathWaves,
              victoryRate: Math.round((wins / runs) * 1000) / 1000,
              avgLevel: Math.round((lvl / runs) * 10) / 10,
              avgRunSec: Math.round(time / runs),
              elapsedMs: Math.round(performance.now() - t0),
            });
            return;
          }
          startRun();
        }
        const gm = g as unknown as Game;
        for (let k = 0; k < 240; k++) {
          gm.step(DT);
          steps++;
          while (gm.canLevelUpNow()) {
            const cards = gm.rollOffer();
            gm.applyCard(cards[gm.autoplay.pickCard(gm, cards)]!);
          }
          if (gm.wave !== lastWave) {
            waveSum[lastWave] = (waveSum[lastWave] ?? 0) + (gm.runTime - waveT);
            waveCnt[lastWave] = (waveCnt[lastWave] ?? 0) + 1;
            lastWave = gm.wave;
            waveT = gm.runTime;
          }
          if (gm.phase === 'dying' || gm.phase === 'won' || gm.wave > maxWave || steps >= MAX_STEPS) {
            endRun(gm);
            break;
          }
        }
      }
      window.setTimeout(slice, 0);
    };
    slice();
  });
}
