/**
 * pnpm sim —— 用只看可见信息的机器人批量打局：各难度 × 各水平的胜率与得分、贪心曲线，并对照文档 §3.8 的目标。
 * 用法：node scripts/sim.ts [runs=150] [seed0=1] [难度=easy,normal,hard] [--raw]
 */
import { CONFIG, validateConfig } from '../src/config.ts';
import { Rng } from '../src/core/rng.ts';
import { type BoardData, generateBoard } from '../src/game/board.ts';
import { type DiffId, DIFF_IDS, diffParams } from '../src/game/difficulty.ts';
import { Game, pickBoard } from '../src/game/rules.ts';
import { type BotOpts, playBot } from '../src/game/solver.ts';

type Profile = Pick<BotOpts, 'maxNodes' | 'slip' | 'msPerAction'>;
const PROFILES: Record<string, Profile> = {
  novice: { maxNodes: 60, slip: 0.04, msPerAction: 4000 },
  skilled: { maxNodes: 600, slip: 0.012, msPerAction: 3000 },
  expert: { maxNodes: CONFIG.solver.maxNodes, slip: 0, msPerAction: 2000 },
};

/** 胜率目标（够血即屠龙），[下限, 上限] %。各档都保留「无致命猜测」保证，所以专家应接近 100% */
const TARGETS: Record<DiffId, Record<string, [number, number]>> = {
  easy: { novice: [50, 75], skilled: [85, 100], expert: [98, 100] },
  normal: { novice: [20, 40], skilled: [55, 80], expert: [98, 100] },
  hard: { novice: [0, 15], skilled: [25, 50], expert: [95, 100] },
};

interface Row {
  n: number;
  wins: number;
  deadly: number;
  winScore: number;
  hpLeft: number;
  killXp: number;
  clears: number;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 150);
const seed0 = Number(args[1] ?? 1);
const diffs = (args[2] ?? DIFF_IDS.join(',')).split(',') as DiffId[];
const withRaw = process.argv.includes('--raw');
const t0 = Date.now();

function boards(diff: DiffId, pick: boolean): BoardData[] {
  const out: BoardData[] = [];
  for (let k = 0; k < runs; k++) out.push(pick ? pickBoard(seed0 + k, false, 1e9, diff) : generateBoard(seed0 + k, false, 0, diff));
  return out;
}

function run(bs: BoardData[], prof: Profile, stopHp = 0): Row {
  const r: Row = { n: 0, wins: 0, deadly: 0, winScore: 0, hpLeft: 0, killXp: 0, clears: 0 };
  bs.forEach((b, k) => {
    const g = new Game(seed0 + k, false, b);
    const rng = new Rng((seed0 + k) * 7919 + 13);
    const res = playBot(g, { ...prof, minHp: g.diff.minHp, stopHp: Math.max(stopHp, g.diff.minHp), rand: () => rng.next() });
    r.n++;
    r.deadly += res.deadly;
    if (res.won && g.breakdown) {
      r.wins++;
      r.winScore += g.breakdown.total;
      r.hpLeft += g.breakdown.hpLeft;
      r.killXp += g.killXp;
      if (g.fullCleared) r.clears++;
    }
  });
  return r;
}

const pad = (s: string | number, w: number) => String(s).padStart(w);
const winPct = (r: Row) => (100 * r.wins) / r.n;
const line = (label: string, r: Row) => {
  const w = Math.max(1, r.wins);
  console.log(
    `${label}  ${pad(winPct(r).toFixed(1), 5)}  ${pad((r.deadly / r.n).toFixed(2), 6)}  ${pad(Math.round(r.winScore / w), 7)}  ${pad(Math.round(r.winScore / r.n), 6)}  ${pad((r.hpLeft / w).toFixed(1), 4)}  ${pad((r.killXp / w).toFixed(0), 4)}  ${pad(((100 * r.clears) / w).toFixed(0), 4)}`,
  );
};
const head = (first: string) => console.log(`${first}   win%  致命猜  胜局均分  期望分  余血  击杀  肃清%`);

const checks: string[] = validateConfig().map((e) => `[FAIL] config: ${e}`);
const ok = (c: boolean, s: string) => checks.push(`[${c ? 'ok' : 'FAIL'}] ${s}`);
console.log(`runs=${runs} seed0=${seed0}`);

for (const diff of diffs) {
  const D = diffParams(diff);
  const picked = boards(diff, true);
  console.log(`\n== ${diff}（${D.name}）巨龙 ${D.dragonLevel} 级 · ${D.minHp} 血可挑战 · 血瓶 ${D.potionCount}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  head('盘面    机器人 ');
  if (withRaw) {
    const raw = boards(diff, false);
    for (const [pName, prof] of Object.entries(PROFILES)) line(`raw     ${pName.padEnd(7)}`, run(raw, prof));
  }
  for (const [pName, prof] of Object.entries(PROFILES)) {
    const r = run(picked, prof);
    line(`picked  ${pName.padEnd(7)}`, r);
    const [lo, hi] = TARGETS[diff][pName];
    ok(winPct(r) >= lo && winPct(r) <= hi, `${diff} ${pName} 胜率 ${winPct(r).toFixed(1)}% ∈ [${lo}, ${hi}]`);
  }
  if (diff !== 'normal') continue;
  // 贪心曲线：够血后继续清到 stopHp 再屠龙（99 = 清到无路可走）。
  // 目标：专家在 +0 ~ +2 血之间期望分接近，「够血就走」不再是唯一最优解
  for (const pName of ['skilled', 'expert']) {
    console.log('');
    head(`${pName.padEnd(7)} 屠龙血量`);
    const evs: number[] = [];
    for (const stop of [D.minHp, D.minHp + 1, D.minHp + 2, D.minHp + 3, 99]) {
      const r = run(picked, PROFILES[pName], stop);
      evs.push(r.winScore / r.n);
      line(`${pName.padEnd(7)} ${pad(stop === 99 ? '清空' : stop, 6)}`, r);
    }
    if (pName === 'expert') {
      const near = evs.slice(0, 3);
      const best = Math.max(...near);
      const worst = Math.min(...near);
      ok(worst >= best * 0.85, `expert 期望分在 ${D.minHp}–${D.minHp + 2} 血之间相差 ${(100 * (1 - worst / best)).toFixed(0)}% ≤ 15%`);
    }
  }
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const c of checks) console.log(c);
if (checks.some((c) => c.startsWith('[FAIL]'))) process.exitCode = 1;
