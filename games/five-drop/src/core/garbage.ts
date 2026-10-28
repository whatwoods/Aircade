import { BLACK, WHITE, EMPTY } from './pieces.ts';
import type { Stone } from './pieces.ts';
import type { Grid } from './grid.ts';
import type { Rng } from './rng.ts';
import { findLines } from './rules.ts';
import type { Line } from './rules.ts';

const tmp: Line[] = [];

export function makeGarbageRow(rng: Rng, cols: number, lastGap: number, maxRun: number, gaps = 1): { row: Stone[]; gap: number } {
  let gap = rng.int(cols);
  if (gap === lastGap) gap = (gap + 1 + rng.int(cols - 1)) % cols;
  let gap2 = -1;
  if (gaps > 1) { gap2 = rng.int(cols - 1); if (gap2 >= gap) gap2++; }
  const row: Stone[] = [];
  let run = 0, prev: Stone = EMPTY;
  for (let x = 0; x < cols; x++) {
    if (x === gap || x === gap2) { row.push(EMPTY); run = 0; prev = EMPTY; continue; }
    let c: Stone = rng.next() < 0.5 ? BLACK : WHITE;
    if (c === prev && run >= maxRun) c = c === BLACK ? WHITE : BLACK;
    run = c === prev ? run + 1 : 1;
    prev = c;
    row.push(c);
  }
  return { row, gap };
}

/** 把 row 从底部推入，整盘上移 1 行；返回是否有子被推入隐藏行（失败） */
export function pushRow(g: Grid, row: Stone[]): boolean {
  const { cols, rows, cells } = g;
  cells.copyWithin(0, cols, rows * cols);
  for (let x = 0; x < cols; x++) cells[(rows - 1) * cols + x] = row[x];
  g.version++;
  return g.hiddenOccupied();
}

/** 生成并插入一行垃圾：尽量不与原有棋子组成五连（最多重试 retries 次） */
export function insertGarbage(g: Grid, rng: Rng, lastGap: number, maxRun: number, retries: number, gaps = 1): { row: Stone[]; gap: number; overflow: boolean } {
  let best = makeGarbageRow(rng, g.cols, lastGap, maxRun, gaps);
  const probe = g.clone();
  for (let i = 0; i < retries; i++) {
    probe.copyFrom(g);
    pushRow(probe, best.row);
    if (findLines(probe, tmp).length === 0) break;
    best = makeGarbageRow(rng, g.cols, lastGap, maxRun, gaps);
  }
  const overflow = pushRow(g, best.row);
  return { row: best.row, gap: best.gap, overflow };
}
