/**
 * 模拟器：node tools/sim.ts [--seeds 200] [--calibrate] [--levels 1,2,3]
 * 输出 sim-report.md（游戏目录下）。--calibrate 会为每帖搜索墨量并打印建议值（ink/star2/star3）。
 */
import fs from 'node:fs';
import { CONFIG } from '../src/config.ts';
import { LEVELS } from '../src/data/levels.ts';
import { leaves } from '../src/core/recipes.ts';
import { pct, runEndless, statLevel, type LevelStats } from '../src/sim/runner.ts';
import type { LevelDef } from '../src/core/types.ts';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(arg('--seeds') ?? CONFIG.sim.seeds);
const only = arg('--levels')?.split(',').map(Number);
const calibrate = args.includes('--calibrate');

/** 新手通关率目标带（§5.4） */
function noviceBand(def: LevelDef): [number, number] {
  const c = def.chapter;
  if (c === 1) return [0.85, 1];
  if (c === 2) return [0.7, 0.9];
  if (c <= 4) return [0.55, 0.85];
  return [0.4, 0.75];
}
/** 校准时追求的新手通关率：卷内递减，每卷首帖回升 */
function noviceTarget(def: LevelDef): number {
  const [lo, hi] = noviceBand(def);
  const k = (def.id - 1) % 5; // 0..4
  return hi - (hi - lo) * (0.15 + 0.17 * k);
}

const minPieces = (def: LevelDef) => def.targets.flatMap((t) => leaves(t)).length;

function evalLevel(def: LevelDef, n: number) {
  return { nov: statLevel(def, 'novice', n), dil: statLevel(def, 'diligent', n), ora: statLevel(def, 'oracle', n) };
}

const levels = LEVELS.filter((l) => !only || only.includes(l.id));
const rows: { def: LevelDef; nov: LevelStats; dil: LevelStats; ora: LevelStats }[] = [];

for (const base of levels) {
  let def = { ...base };
  if (calibrate) {
    const lo = minPieces(def);
    const cands: { ink: number; gap: number; ok: boolean }[] = [];
    // 导演的可解保证会在墨≈最少部件数时停发干扰（关卡反而变容易），所以从“最少部件 + 20% 余量”起搜
    const start = def.chapter === 1 ? lo : lo + Math.max(2, Math.round(lo * 0.2));
    for (let ink = start; ink <= lo * 2 + 8 && def.id !== 1; ink++) {
      const d = { ...def, ink };
      const dil = statLevel(d, 'diligent', Math.min(seeds, 120));
      if (dil.clear < CONFIG.sim.diligentMinClear) continue;
      const nov = statLevel(d, 'novice', Math.min(seeds, 120));
      // 第 3 卷起要求认真玩家剩墨中位数 ≤ 30%（墨要“紧”）
      const [blo, bhi] = noviceBand(d);
      const ok = (def.chapter < 3 || dil.inkP50 <= ink * 0.3 + 0.5) && nov.clear >= blo + 0.02 && nov.clear <= bhi - 0.02;
      cands.push({ ink, gap: Math.abs(nov.clear - noviceTarget(d)), ok });
      if (cands.length > 18) break;
    }
    // 在误差相近（≤ 0.04）的候选里取墨最少的，避免新手通关率对墨不敏感时墨量膨胀
    const pool = cands.some((c) => c.ok) ? cands.filter((c) => c.ok) : cands;
    const bestGap = Math.min(...pool.map((c) => c.gap));
    const pick = pool.find((c) => c.gap <= bestGap + 0.04);
    if (pick) def = { ...def, ink: pick.ink };
  }
  const r = evalLevel(def, seeds);
  if (calibrate) {
    // 三星 = 认真玩家前 20%（P80），二星 = 认真玩家中位（P50）：第一卷也要打得好才满星（§5.2）
    def.star3 = Math.max(2, Math.round(r.dil.inkP80));
    def.star2 = Math.max(1, Math.min(def.star3 - 1, Math.round(r.dil.inkP50)));
  }
  rows.push({ def, ...r });
  console.log(`L${def.id} ink=${def.ink} nov=${(r.nov.clear * 100).toFixed(0)}% dil=${(r.dil.clear * 100).toFixed(0)}% ora=${(r.ora.clear * 100).toFixed(0)}% dilInkP50=${r.dil.inkP50} t=${r.dil.seconds.toFixed(0)}s star2=${def.star2} star3=${def.star3}`);
}

// 验收
const fails: string[] = [];
let md = `# 造字记 模拟器报告\n\n种子数 ${seeds}；机器人：新手 / 认真 / 上限。时长 = 认真机器人预估中位数（操作数 × ${CONFIG.sim.secPerActionDiligent}s + 新字卡 × ${CONFIG.sim.secPerCard}s）。\n\n`;
md += '| 帖 | 卷 | 墨 | 最少部件 | 新手通关 | 认真通关 | 上限通关 | 认真剩墨 P50/P80 | 峰值占用 P50 认真/新手 | 认真洗笔 | 时长 | star2 | star3 | 检查 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
let prevNov = -1;
let prevChapter = 0;
for (const { def, nov, dil, ora } of rows) {
  const bad: string[] = [];
  const [lo, hi] = noviceBand(def);
  if (ora.clear < 0.995) bad.push('上限未全通');
  if (dil.clear < CONFIG.sim.diligentMinClear) bad.push('认真<97%');
  // 卷首喘息帖（第 2 卷起每卷第一帖）只设下限：它本来就该比卷内其他帖宽松
  const opener = def.chapter > 1 && (def.id - 1) % 5 === 0;
  if (nov.clear < lo - 0.03 || (!opener && nov.clear > hi + 0.03)) bad.push('新手越界');
  // 卷首喘息：新手通关率是本卷最高，且认真剩墨 P50 ≥ 墨的 15%（不再是全卷最紧的一帖）
  if (opener) {
    const rest = rows.filter((x) => x.def.chapter === def.chapter && x.def.id !== def.id);
    if (rest.some((x) => x.nov.clear > nov.clear) || dil.inkP50 < def.ink * 0.15) bad.push('卷首不宽松');
  }
  if (prevNov >= 0 && prevNov - nov.clear > 0.2) bad.push('成墙');
  if (def.chapter >= 3 && dil.inkP50 > def.ink * 0.3 + 0.5) bad.push('剩墨过多');
  // 每卷第一帖新手通关率 ≥ 上一卷最后一帖（喘息帖）
  if (prevChapter && def.chapter !== prevChapter && nov.clear < prevNov) bad.push('卷首未回升');
  // 时长窗口（认真预估，含新字卡；§5.4 修订值）
  const [tlo, thi] = def.chapter === 1 ? [15, 70] : [30, 200];
  if (dil.seconds < tlo || dil.seconds > thi) bad.push('时长越界');
  // 盘面要真的用起来（§5.4，4×4 盘）：第 4 卷起认真玩家峰值占用中位 ≥ 30%（≥ 5 格）
  if (def.chapter >= 4 && dil.occP50 < 0.3) bad.push('盘面过空');
  prevNov = nov.clear;
  prevChapter = def.chapter;
  if (bad.length) fails.push(`L${def.id}: ${bad.join('、')}`);
  md += `| ${bad.length ? '✗ ' : ''}L${def.id} | ${def.chapter} | ${def.ink} | ${minPieces(def)} | ${(nov.clear * 100).toFixed(0)}% | ${(dil.clear * 100).toFixed(0)}% | ${(ora.clear * 100).toFixed(0)}% | ${dil.inkP50}/${dil.inkP80} | ${(dil.occP50 * 100).toFixed(0)}% / ${(nov.occP50 * 100).toFixed(0)}% | ${dil.discards.toFixed(1)} | ${dil.seconds.toFixed(0)}s | ${def.star2} | ${def.star3} | ${bad.join('、') || '✓'} |\n`;
}

if (!only) {
  const er = { novice: [] as number[], diligent: [] as number[] };
  const stages: number[] = [];
  const nstages: number[] = [];
  for (let i = 1; i <= Math.min(seeds, 100); i++) {
    const n = runEndless(i, 'novice');
    er.novice.push(n.seconds / 60);
    nstages.push(n.stage);
    const d = runEndless(i, 'diligent');
    er.diligent.push(d.seconds / 60);
    stages.push(d.stage);
  }
  md += `\n## 书斋（无尽）\n\n| 机器人 | 时长 P10 | P50 | P90 | 到达章 P50 |\n|---|---|---|---|---|\n`;
  md += `| 新手 | ${pct(er.novice, 10).toFixed(1)} 分 | ${pct(er.novice, 50).toFixed(1)} 分 | ${pct(er.novice, 90).toFixed(1)} 分 | ${pct(nstages, 50)} |\n`;
  md += `| 认真 | ${pct(er.diligent, 10).toFixed(1)} 分 | ${pct(er.diligent, 50).toFixed(1)} 分 | ${pct(er.diligent, 90).toFixed(1)} 分 | ${pct(stages, 50)} |\n`;
  // 无尽验收（§5.4 修订值）：认真中位 6–10 分钟；新手中位 ≤ 12 分钟且到达章 < 认真；两者 P90 ≤ 18 分钟
  const dP50 = pct(er.diligent, 50);
  if (dP50 < 6 || dP50 > 10) fails.push(`书斋：认真中位 ${dP50.toFixed(1)} 分不在 6–10`);
  if (pct(er.novice, 50) > 12) fails.push('书斋：新手中位 > 12 分');
  if (pct(nstages, 50) >= pct(stages, 50)) fails.push('书斋：新手到达章不低于认真');
  if (pct(er.novice, 90) > 18 || pct(er.diligent, 90) > 18) fails.push('书斋：P90 > 18 分');
  console.log(`endless novice P50 ${pct(er.novice, 50).toFixed(1)}min diligent P50 ${pct(er.diligent, 50).toFixed(1)}min P90 ${pct(er.diligent, 90).toFixed(1)} stage ${pct(stages, 50)}`);
}
md += `\n## 验收\n\n${fails.length ? fails.map((f) => '- ✗ ' + f).join('\n') : '全部通过 ✓'}\n`;
fs.writeFileSync(new URL('../sim-report.md', import.meta.url), md);
if (calibrate) {
  console.log('\n建议值（粘贴到 levels.ts）：');
  for (const { def } of rows) console.log(`  L${def.id}: ink: ${def.ink}, star2: ${def.star2}, star3: ${def.star3}`);
}
console.log(fails.length ? `\n${fails.length} 项未达标` : '\n全部通过');
