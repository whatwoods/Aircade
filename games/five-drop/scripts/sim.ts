// 机器人模拟器（docs/five-drop.md 第 10.3 节）
// npm run sim                         → 跑完整验收矩阵
// npm run sim -- --persona serious --games 200 --seed 1 --fullRow majority --crystal off --invertLimit 1
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { cloneConfig } from '../src/config.ts';
import type { FullRowMode } from '../src/config.ts';
import { runGame, summarize } from '../src/ai/sim.ts';
import type { GameResult, Summary } from '../src/ai/sim.ts';
import type { PersonaId } from '../src/ai/bot.ts';

interface Scenario { name: string; persona: PersonaId; fullRow: FullRowMode; crystal: boolean; invertLimit: number }
interface Job { sc: Scenario; seeds: number[]; maxMinutes: number; over: Record<string, Record<string, unknown>> }

function makeCfg(sc: Scenario, over: Record<string, Record<string, unknown>> = {}) {
  const cfg = cloneConfig();
  for (const [k, v] of Object.entries(over)) Object.assign((cfg as unknown as Record<string, object>)[k], v);
  cfg.fullRow.mode = sc.fullRow;
  cfg.crystal.enabled = sc.crystal;
  cfg.invert.maxPerPiece = sc.invertLimit;
  return cfg;
}

if (!isMainThread) {
  const job = workerData as Job;
  const cfg = makeCfg(job.sc, job.over);
  const out: GameResult[] = [];
  for (const s of job.seeds) out.push(runGame(cfg, job.sc.persona, s, job.maxMinutes));
  parentPort!.postMessage(out);
} else {
  const args = process.argv.slice(2);
  const arg = (k: string, d: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const games = Number(arg('games', '100'));
  const seed0 = Number(arg('seed', '1'));
  const maxMinutes = Number(arg('maxMinutes', '25'));
  const persona = arg('persona', '');
  const fullRow = arg('fullRow', 'majority') as FullRowMode;
  const crystal = arg('crystal', 'on') !== 'off';
  const invertLimit = Number(arg('invertLimit', '-1'));
  const over = JSON.parse(arg('cfg', '{}')) as Record<string, Record<string, unknown>>;
  const only = arg('only', '');

  const scenarios: Scenario[] = persona
    ? [{ name: `${persona}/${fullRow}${crystal ? '' : '/无冰晶'}${invertLimit >= 0 ? '/翻色≤' + invertLimit : ''}`, persona: persona as PersonaId, fullRow, crystal, invertLimit }]
    : [
      { name: '新手 novice', persona: 'novice', fullRow: 'majority', crystal: true, invertLimit: -1 },
      { name: '认真 serious', persona: 'serious', fullRow: 'majority', crystal: true, invertLimit: -1 },
      { name: '色盲 colorblind', persona: 'colorblind', fullRow: 'majority', crystal: true, invertLimit: -1 },
      { name: '形盲 shapeblind', persona: 'shapeblind', fullRow: 'majority', crystal: true, invertLimit: -1 },
      { name: '不翻色 noinvert', persona: 'noinvert', fullRow: 'majority', crystal: true, invertLimit: -1 },
      { name: '认真·无冰晶', persona: 'serious', fullRow: 'majority', crystal: false, invertLimit: -1 },
      { name: '认真·all', persona: 'serious', fullRow: 'all', crystal: true, invertLimit: -1 },
      { name: '色盲·all', persona: 'colorblind', fullRow: 'all', crystal: true, invertLimit: -1 },
      { name: '认真·none', persona: 'serious', fullRow: 'none', crystal: true, invertLimit: -1 },
      { name: '新手·none', persona: 'novice', fullRow: 'none', crystal: true, invertLimit: -1 },
    ];

  const nW = Math.max(1, availableParallelism());
  const runScenario = (sc: Scenario): Promise<GameResult[]> => {
    const seeds = Array.from({ length: games }, (_, i) => seed0 + i);
    const chunks: number[][] = Array.from({ length: nW }, () => []);
    seeds.forEach((s, i) => chunks[i % nW].push(s));
    return Promise.all(chunks.filter(c => c.length).map(c => new Promise<GameResult[]>((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { sc, seeds: c, maxMinutes, over } satisfies Job });
      w.on('message', v => res(v as GameResult[]));
      w.on('error', rej);
    }))).then(rs => rs.flat());
  };

  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const rows: { sc: Scenario; s: Summary }[] = [];
  const t0 = Date.now();
  for (const sc of scenarios) {
    if (only && !only.split(',').some(o => sc.name.includes(o))) continue;
    const rs = await runScenario(sc);
    const s = summarize(rs);
    rows.push({ sc, s });
    const deaths = Object.entries(s.deathByLevel).map(([l, n]) => `L${l}:${n}`).join(' ');
    console.log(`${sc.name.padEnd(16)} 存活 ${fmtT(s.medTime).padStart(6)}  分 ${String(Math.round(s.medScore)).padStart(7)}  级 ${String(s.medLevel).padStart(4)}  五连占比 ${(s.fiveShare * 100).toFixed(0).padStart(3)}%  首分钟五连 ${(s.firstFiveRate * 100).toFixed(0).padStart(3)}%  高L5 ${s.medHL5}  高L9 ${s.medHL9}  死亡最集中 ${(s.maxDeathShare * 100).toFixed(0)}%  翻色/块 ${s.medInverts.toFixed(2)}  [${deaths}]`);
  }
  const get = (n: string) => rows.find(r => r.sc.name === n)?.s;
  const ser = get('认真 serious'), nov = get('新手 novice'), cb = get('色盲 colorblind'), sb = get('形盲 shapeblind'), ni = get('不翻色 noinvert'), nc = get('认真·无冰晶');
  if (ser && nov && cb && sb) {
    console.log('\n—— 验收 ——');
    const line = (name: string, v: string, ok: boolean) => console.log(`${ok ? '✓' : '✗'} ${name}: ${v}`);
    line('新手存活 3–5 分钟', fmtT(nov.medTime), nov.medTime >= 180 && nov.medTime <= 300);
    line('认真存活 9–14 分钟', fmtT(ser.medTime), ser.medTime >= 540 && ser.medTime <= 840);
    line('新手首分钟五连 ≥90%', (nov.firstFiveRate * 100).toFixed(0) + '%', nov.firstFiveRate >= 0.9);
    line('色盲/认真 存活 ≤0.55', (cb.medTime / ser.medTime).toFixed(2), cb.medTime / ser.medTime <= 0.55);
    line('色盲/认真 得分 ≤0.25', (cb.medScore / ser.medScore).toFixed(2), cb.medScore / ser.medScore <= 0.25);
    line('形盲/认真 存活 ≤0.70', (sb.medTime / ser.medTime).toFixed(2), sb.medTime / ser.medTime <= 0.7);
    line('认真五连占比 55–90%（满行 10–45%）', (ser.fiveShare * 100).toFixed(0) + '%', ser.fiveShare >= 0.55 && ser.fiveShare <= 0.9);
    line('认真死亡集中度（任一 45 秒窗口）≤35%', (ser.maxDeathShare * 100).toFixed(0) + '%', ser.maxDeathShare <= 0.35);
    line('压力上升：新手 L5 高度 ≥5；认真 L9 高度 ≥5 且高于 L5', `${nov.medHL5} / ${ser.medHL5}→${ser.medHL9}`, nov.medHL5 >= 5 && ser.medHL9 >= 5 && ser.medHL9 > ser.medHL5);
    if (ni) line('翻色有价值：不翻色/认真 存活 ≤0.85', (ni.medTime / ser.medTime).toFixed(2), ni.medTime / ser.medTime <= 0.85);
    if (nc) line('冰晶子不是必需：关闭后存活变化 ≤20%', ((1 - nc.medTime / ser.medTime) * 100).toFixed(0) + '%', Math.abs(1 - nc.medTime / ser.medTime) <= 0.2);
    const sa = get('认真·all'), ca = get('色盲·all'), sn = get('认真·none');
    if (sa && ca) line('all 模式下色盲差距缩小', `${(ca.medTime / sa.medTime).toFixed(2)} vs ${(cb.medTime / ser.medTime).toFixed(2)}`, ca.medTime / sa.medTime > cb.medTime / ser.medTime);
    if (sn) line('减压阀有用：none 模式认真存活 ≤0.85', (sn.medTime / ser.medTime).toFixed(2), sn.medTime / ser.medTime <= 0.85);
  }
  console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，每组 ${games} 局，种子 ${seed0}…${seed0 + games - 1}`);
}
