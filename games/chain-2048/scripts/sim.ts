/**
 * npm run sim —— 用真实轨道几何的机器人批量闯关，打印难度曲线并对照 docs §3.13 的门槛。
 * 用法：node scripts/sim.ts [runs=20] [bots=human,casual,careful,greedy,spam] [maxStage=20] [seed0=1000]
 */
import { CONFIG } from '../src/config.ts';
import type { BotKind } from '../src/game/bots.ts';
import { med, pct, report } from '../src/game/simulate.ts';

const fs = (a: number[]) => { const m = med(a); return (m >= 999 ? 'none' : m.toFixed(0)).padStart(8); };

function main() {
  const runs = Number(process.argv[2] ?? 20);
  const bots = (process.argv[3] ?? 'human,casual,careful,greedy,spam').split(',') as BotKind[];
  const maxStage = Number(process.argv[4] ?? 20);
  const seed0 = Number(process.argv[5] ?? 1000);
  const out: Record<string, ReturnType<typeof report>> = {};
  for (const k of bots) {
    const t = Date.now();
    const r = report(k, runs, maxStage, seed0);
    out[k] = r;
    const mins = r.runs.map((x) => x.minutes), stops = r.runs.map((x) => x.stop);
    console.log(`\nbot=${k} runs=${runs} lives=${CONFIG.run.lives}  run: median ${r.medMin.toFixed(1)} min (${Math.min(...mins).toFixed(1)}–${Math.max(...mins).toFixed(1)}), stopStage median ${r.medStop} (${Math.min(...stops)}–${Math.max(...stops)})  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    console.log('stage  tries clear%  time(s)  maxP   danger%  merges/shot  cascP90  seal1(s)  len@20→40s');
    for (const [n, st] of [...r.stats.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`${String(n).padStart(4)}  ${String(st.tries).padStart(5)}  ${String(Math.round((100 * st.clears) / st.tries)).padStart(5)}  ${med(st.time).toFixed(0).padStart(7)}  ${med(st.maxP).toFixed(2)}  ${(100 * med(st.danger)).toFixed(1).padStart(7)}  ${(st.merges / Math.max(1, st.shots)).toFixed(2).padStart(10)}  ${String(pct(st.casc, 0.9)).padStart(7)}  ${fs(st.firstSeal)}  ${st.len20.length ? med(st.len20) + '→' + med(st.lenEnd) : '-'}`);
    }
  }
  // CHECKS（docs §3.13）
  const checks: string[] = [];
  const ok = (c: boolean, s: string) => checks.push(`[${c ? 'ok' : 'FAIL'}] ${s}`);
  const clr = (r: ReturnType<typeof report>, n: number) => { const st = r.stats.get(n); return st ? st.clears / st.tries : 0; };
  // 只看「至少 1/4 的局能走到」的关卡：止步关之后的样本既少、也不代表该人群
  const step = (r: ReturnType<typeof report>, last = 12) => { let worst = 0, at = 0; for (let n = 1; n < last; n++) { const st = r.stats.get(n + 1); if (!st || st.tries < Math.max(6, r.runs.length / 4)) continue; const d = clr(r, n) - clr(r, n + 1); if (d > worst) { worst = d; at = n; } } return { worst, at }; };
  if (out.human) {
    const h = out.human;
    ok(h.medStop >= 10 && h.medStop <= 13, `human stop stage ${h.medStop} in 10–13`);
    ok(h.medMin >= 7 && h.medMin <= 13, `human median ${h.medMin.toFixed(1)} min in 7–13`);
    const w = step(h);
    ok(w.worst <= 0.15, `human max stage step ${(w.worst * 100).toFixed(0)}pp (at ${w.at}→${w.at + 1}) ≤ 15pp`);
    const mp: string[] = [];
    let mpOk = true;
    for (let n = 1; n <= 12; n++) { const st = h.stats.get(n); if (!st || st.tries < 6) continue; const m = med(st.maxP); mp.push(m.toFixed(2)); if (n >= 3 && (m < 0.45 || m > 0.95)) mpOk = false; if (n < 3 && m > 0.65) mpOk = false; }
    ok(mpOk, `human maxP median: stage1–2 ≤0.65, stage3+ within 0.45–0.95 (pressure, no wall): ${mp.join(' ')}`);
    const s1: string[] = [];
    let s1Ok = true;
    for (let n = 1; n <= 12; n++) { const st = h.stats.get(n); if (!st || st.tries < 6) continue; const m = med(st.firstSeal); s1.push(m >= 999 ? 'none' : m.toFixed(0)); if (m > 30) s1Ok = false; }
    ok(s1Ok, `human first seal median ≤30 s every stage: ${s1.join(' ')}`);
  }
  if (out.casual) {
    const c = out.casual;
    ok(c.medStop >= 4 && c.medStop <= 6, `casual stop stage ${c.medStop} in 4–6`);
    const w = step(c);
    ok(w.worst <= 0.25, `casual max stage step ${(w.worst * 100).toFixed(0)}pp (at ${w.at}→${w.at + 1}) ≤ 25pp`);
  }
  if (out.novice) {
    ok(out.novice.medMin >= 4.5 && out.novice.medMin <= 8, `novice median ${out.novice.medMin.toFixed(1)} min in 4.5–8`);
    ok(out.novice.medStop >= 4 && out.novice.medStop <= 6, `novice stop stage ${out.novice.medStop} in 4–6`);
    let worst = 0, at = 0;
    for (let n = 1; n < 12; n++) { const st = out.novice.stats.get(n + 1); if (!st || st.tries < 4) continue; const d = clr(out.novice, n) - clr(out.novice, n + 1); if (d > worst) { worst = d; at = n; } }
    ok(worst <= 0.25, `novice max stage step ${(worst * 100).toFixed(0)}pp (at ${at}→${at + 1}) ≤ 25pp`);
  }
  if (out.careful && out.human) ok(out.careful.medStop >= out.human.medStop, `careful(1.25s, swap, wild) reference stop ${out.careful.medStop} ≥ human ${out.human.medStop}`);
  if (out.greedy && out.careful) ok(out.careful.medStop - out.greedy.medStop >= 3, `greedy stop ${out.greedy.medStop} ≥3 stages behind careful ${out.careful.medStop}`);
  if (out.spam) ok(out.spam.medStop <= 3, `spam stop stage ${out.spam.medStop} ≤ 3`);
  console.log('\nCHECKS:\n' + checks.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
