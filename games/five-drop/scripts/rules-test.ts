// 规则场景断言（docs/five-drop.md 第 3.12 节）。运行：npm run rules
import { cloneConfig } from '../src/config.ts';
import type { Config } from '../src/config.ts';
import { Grid } from '../src/core/grid.ts';
import { resolveAll, scoreFive } from '../src/core/rules.ts';
import type { Line } from '../src/core/rules.ts';
import { pushRow } from '../src/core/garbage.ts';
import { Piece, parseColors, BLACK, WHITE } from '../src/core/pieces.ts';
import { Game } from '../src/core/game.ts';



let pass = 0, fail = 0;
function check(name: string, cond: boolean, info?: unknown): void {
  if (cond) { pass++; } else { fail++; console.log(`✗ ${name}`, info ?? ''); }
}

function grid(rows: string[]): Grid {
  const g = new Grid(9, 15, 2);
  g.setAscii(rows);
  return g;
}
function run(rows: string[], level = 1, mode: Config['fullRow']['mode'] = 'majority') {
  const cfg = cloneConfig();
  cfg.fullRow.mode = mode;
  const g = grid(rows);
  const steps = resolveAll(g, level, cfg);
  return { g, steps, cfg };
}
const vis = (g: Grid) => g.toAscii();
const at = (g: Grid, x: number, r: number) => g.get(x, r + g.hidden);

// 1 横
{
  const { steps, g } = run(['BBBBB....']);
  check('横五连 1 轮', steps.length === 1 && steps[0].kind === 'five');
  check('横五连得分 100', steps[0]?.score === 100, steps[0]?.score);
  check('横五连清空', g.isEmpty());
}
// 2 竖
{
  const { steps } = run(['W........', 'W........', 'W........', 'W........', 'W........']);
  check('竖五连', steps.length === 1 && steps[0].lines[0].dir === 1 && steps[0].removed.length === 5);
}
// 3 斜 ↘ / ↗
{
  const { steps } = run(['B........', 'WB.......', 'WWB......', 'WWWB.....', 'WBWWB....']);
  check('斜↘五连', steps.length >= 1 && steps[0].lines.some(l => l.dir === 2 && l.color === BLACK), steps.map(s => s.lines));
}
{
  const { steps } = run(['....B....', '...BW....', '..BWW....', '.BWWB....', 'BWWBW....']);
  check('斜↗五连', steps.length >= 1 && steps[0].lines.some(l => l.dir === 3 && l.color === BLACK), steps.map(s => s.lines));
}
// 4 6 连与 9 连
{
  const { steps } = run(['BBBBBB...']);
  check('6 连算一条线', steps[0].lines.length === 1 && steps[0].lines[0].length === 6);
  check('6 连得分 200', steps[0].score === 200, steps[0].score);
  const r9 = run(['WWWWWWWWW']);
  check('9 连得分 500', r9.steps[0].score === 500 && r9.steps.length === 1, r9.steps.map(s => s.score));
}
// 5 十字交叉
{
  const { steps } = run(['..B......', '..B......', '..B......', '..B......', 'BBBBB....']);
  const s = steps[0];
  check('十字：2 条线', s.lines.length === 2);
  check('十字：共享 1 子只消除一次（共 9 子）', s.removed.length === 9, s.removed.length);
  check('十字：交点 1 个', s.cross.length === 1);
  check('十字：得分 (100+100)×1.5=300', s.score === 300, s.score);
}
// 6 X 形
{
  const { steps } = run(['W...W....', '.W.W.....', '..W......', '.W.W.....', 'W...W....']);
  const s = steps[0];
  check('X 形：2 条斜线、9 子、交点 1', s.lines.length === 2 && s.removed.length === 9 && s.cross.length === 1, s);
}
// 7 冰晶子同时服务黑白
{
  const { steps, g } = run(['WWWWXBBBB']);
  const s = steps[0];
  check('冰晶子：黑白各一条线', s.lines.length === 2 && s.lines.some(l => l.color === BLACK) && s.lines.some(l => l.color === WHITE));
  check('冰晶子：全部 9 子消除', s.removed.length === 9 && g.isEmpty());
}
{
  const { steps, g } = run(['WWXBBBB..']);
  check('冰晶子：WWX 不成白线，XBBBB 成黑线', steps.length === 1 && steps[0].lines.length === 1 && steps[0].lines[0].color === BLACK && steps[0].lines[0].length === 5);
  check('冰晶子：白子保留', vis(g)[14] === 'WW.......', vis(g)[14]);
}
{
  const { steps } = run(['XXXXX....']);
  check('全冰晶段不算线', steps.length === 0);
}
// 8 满行（多数色需 ≥ minMajority=6 才退场）
{
  const { steps, g } = run(['BWBWBWBWB']);
  check('满行 5:4：未达 6，不退场', steps.length === 0 && vis(g)[14] === 'BWBWBWBWB', steps);
}
{
  const { steps, g } = run(['BBWBBWBBW']);
  check('满行 6:3：一轮 row', steps.length === 1 && steps[0].kind === 'row');
  check('满行 6:3：移除 6 黑', steps[0].removed.length === 6 && steps[0].removedColors.every(c => c === BLACK));
  check('满行 6:3：白子留在原位', vis(g)[14] === '..W..W..W', vis(g)[14]);
  check('满行 6:3：得分 90', steps[0].score === 90, steps[0].score);
}
{
  const { steps, g } = run(['BWBWBWBWB'], 1, 'majority');
  void steps; void g;
  const cfg = cloneConfig(); cfg.fullRow.minMajority = 5;
  const g5 = grid(['BWBWBWBWB']);
  const s5 = resolveAll(g5, 1, cfg);
  check('minMajority=5 时 5:4 退场 5 黑', s5[0]?.removed.length === 5 && vis(g5)[14] === '.W.W.W.W.');
}
{
  const { steps, g } = run(['BBBBWBBBB']);
  check('满行 8:1：移除 8', steps[0].removed.length === 8 && vis(g)[14] === '....W....', vis(g)[14]);
}
{
  const { steps, g } = run(['BWBWXWBWB']);
  check('满行冰晶子平局：整行清除', steps[0].kind === 'row' && steps[0].removed.length === 9 && g.isEmpty(), steps);
}
{
  const { steps } = run(['WBWBWBWBW', 'BWBWBWBWB']);
  // 两行同时满，各 5:4，未达 6：都不退场
  check('交错双满行 5:4 均不退场', steps.length === 0);
}
{
  const { steps } = run(['BWBWBWBWB'], 1, 'all');
  // all 模式不看颜色
  check('all 模式：整行清除', steps[0].removed.length === 9);
  const n = run(['BWBWBWBWB'], 1, 'none');
  check('none 模式：不处理满行', n.steps.length === 0);
}
{
  const { steps } = run(['BBBBBWBWB']);
  check('五连优先于满行', steps[0].kind === 'five' && steps.length === 1, steps.map(s => s.kind));
}
// 9 补位后连锁
{
  const { steps, g } = run(['....B....', '....W....', '....W....', '....W....', '....W....', 'BBBBW....']);
  check('连锁：2 轮', steps.length === 2, steps.map(s => s.kind));
  check('连锁：第 1 轮 100、第 2 轮 ×2=200', steps[0]?.score === 100 && steps[1]?.score === 200, steps.map(s => s.score));
  check('连锁：清盘', g.isEmpty());
}
// 10 补位填进 r* 正下方的洞；无消除列保持悬空
{
  const { steps, g } = run(['W.....B..', 'BBBBB....', '.BWBW....', 'WWBWB....']);
  check('洞：一轮', steps.length === 1, steps.length);
  check('洞：W 落入 r* 下方的洞（第 13 行）', at(g, 0, 13) === WHITE && at(g, 0, 12) === 0 && at(g, 0, 11) === 0, vis(g));
  check('无消除列保持悬空', at(g, 6, 11) === BLACK, vis(g));
}
// 11 顶线消除救命
{
  const g = new Grid(9, 15, 2);
  for (let y = 1; y <= 5; y++) g.set(0, y, WHITE);
  check('隐藏行有子', g.hiddenOccupied());
  resolveAll(g, 1, cloneConfig());
  check('顶线消除后隐藏行清空', !g.hiddenOccupied());
}
// 12 垃圾顶出
{
  const g = grid(['B........']);
  g.cells.fill(0); g.set(3, 2, BLACK); // 可见第 0 行
  check('垃圾行把子推进隐藏行 = 失败', pushRow(g, parseColors('BWBWBWBW') as never) === true);
}
// 13 计分示例（文档 3.11）
{
  const cfg = cloneConfig();
  const l5: Line = { color: BLACK, dir: 0, cells: [], length: 5 };
  const l6: Line = { color: BLACK, dir: 2, cells: [], length: 6 };
  check('示例第 1 轮 585', scoreFive([l5, l6], 1, 4, cfg) === 585, scoreFive([l5, l6], 1, 4, cfg));
  check('示例第 2 轮 260', scoreFive([l5], 2, 4, cfg) === 260);
}
// 14 旋转带颜色；O 块颜色轮转
{
  const o = new Piece('O', parseColors('BWWW'));
  o.setRot(1);
  // spawn (0,0)B (1,0)W (0,1)W (1,1)W；顺时针后 B 到 (1,0)
  check('O 旋转：B 从左上转到右上', o.cx[0] === 1 && o.cy[0] === 0, [o.cx, o.cy]);
  const i3 = new Piece('I3', parseColors('BWW'));
  i3.setRot(1);
  check('I3 [B W W] 顺转后上 B 下 W W', i3.cx[0] === 1 && i3.cy[0] === 0 && i3.cy[2] === 2, [i3.cx, i3.cy]);
  const t = new Piece('T', parseColors('BWWW'));
  t.setRot(4);
  check('转 4 次回到原位', t.cx.join() === '1,0,1,2' && t.cy.join() === '0,1,1,1');
}
// 15 引导第 3 步的盘面
{
  const g = grid(['.........', '...B.....', '..BW.....', '.BWWW....', 'BWWWW....']);
  const p = new Piece('I3', parseColors('BWW'));
  p.setRot(1);
  // 框内 x=1，放到第 4 列 → 框 x=3
  const y = g.dropY(p, 3, 0);
  g.place(p, 3, y);
  const steps = resolveAll(g, 1, cloneConfig());
  check('引导第 3 步：形成斜线五连', steps.length === 1 && steps[0].lines.length === 1 && steps[0].lines[0].dir === 3, steps.map(s => s.lines));
}
// 16 引导第 1、2 步
{
  const g = grid(['.BBBB....']);
  const p = new Piece('I3', parseColors('BBB')); p.setRot(1);
  g.place(p, 4, g.dropY(p, 4, 0));
  check('引导第 1 步：横五连', resolveAll(g, 1, cloneConfig())[0]?.kind === 'five');
  const g2 = grid(['....W....', '....W....', '....W....', '....W....']);
  const d = new Piece('D2', parseColors('WW')); d.setRot(1);
  g2.place(d, 3, g2.dropY(d, 3, 0));
  const s2 = resolveAll(g2, 1, cloneConfig());
  check('引导第 2 步：6 连竖线', s2[0]?.lines[0]?.length === 6, s2);
}
// 17 Game 流程与确定性
{
  const play = (seed: number) => {
    const g = new Game(cloneConfig(), seed, { headless: true });
    g.start();
    g.update(0.02);
    let n = 0;
    while (g.phase !== 'over' && n < 400) {
      const p = g.active!;
      if (!p) { g.update(0.02); continue; }
      g.placeAt((n * 3) % (9 - p.n + 1), n % 4, n % 3 === 0);
      g.update(0.02);
      n++;
    }
    return { score: g.score, phase: g.phase, n, time: g.time };
  };
  const a = play(7), b = play(7);
  check('同种子可复现', a.score === b.score && a.n === b.n, [a, b]);
  check('随机放置最终会失败', a.phase === 'over', a);
}
{
  const g = new Game(cloneConfig(), 3, { headless: true });
  g.start(); g.update(0.02);
  check('出块后可见', g.active !== null && g.active.y + g.active.bottomY() >= 2);
  check('出块保护期内不能硬降', g.hardDrop() === false);
  g.update(0.1); g.update(0.1);
  check('保护期后可以硬降', g.hardDrop() === true);
  g.update(0.02);
  const before = g.active;
  check('暂存成功', g.hold() === true && g.holdPiece !== null && g.active !== before);
  check('同一块不能再暂存', g.hold() === false);
}

console.log(`rules: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
