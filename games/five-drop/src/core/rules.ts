import { BLACK, WHITE, CRYSTAL, EMPTY } from './pieces.ts';
import type { Stone } from './pieces.ts';
import type { Grid } from './grid.ts';
import type { Config, FullRowMode } from '../config.ts';
import { levelMult } from '../config.ts';

export type Dir = 0 | 1 | 2 | 3; // 0 横 →，1 竖 ↓，2 斜 ↘，3 斜 ↗
export const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

export interface Line { color: Stone; dir: Dir; cells: number[]; length: number }

export interface FallMove { x: number; fromY: number; toY: number; c: Stone }

export interface Step {
  kind: 'five' | 'row';
  k: number;
  lines: Line[];
  rows: number[];
  /** 被移除的格子下标与颜色 */
  removed: number[];
  removedColors: Stone[];
  /** 被 ≥2 条线共享的格子 */
  cross: number[];
  moves: FallMove[];
  score: number;
}

export interface PathSet { paths: Int16Array[]; dirs: Dir[] }
const pathCache = new Map<string, PathSet>();

/** 网格上所有方向的直线路径（每条直线一次），按尺寸缓存 */
export function linePaths(cols: number, rows: number): PathSet {
  const key = cols + 'x' + rows;
  let ps = pathCache.get(key);
  if (ps) return ps;
  const paths: Int16Array[] = [];
  const dirs: Dir[] = [];
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DIRS[d];
    for (let sy = 0; sy < rows; sy++) {
      for (let sx = 0; sx < cols; sx++) {
        const px = sx - dx, py = sy - dy;
        if (px >= 0 && px < cols && py >= 0 && py < rows) continue;
        const arr: number[] = [];
        let x = sx, y = sy;
        while (x >= 0 && x < cols && y >= 0 && y < rows) { arr.push(y * cols + x); x += dx; y += dy; }
        if (arr.length >= 5) { paths.push(Int16Array.from(arr)); dirs.push(d as Dir); }
      }
    }
  }
  ps = { paths, dirs };
  pathCache.set(key, ps);
  return ps;
}

/** 找出全部五连（第 3.5 节）。冰晶子对黑白都匹配；全冰晶段不算 */
export function findLines(g: Grid, out: Line[] = []): Line[] {
  out.length = 0;
  const cells = g.cells;
  const { paths, dirs } = linePaths(g.cols, g.rows);
  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    const len = path.length;
    for (let color = BLACK; color <= WHITE; color++) {
      let runStart = 0, runLen = 0, hasColor = false;
      for (let i = 0; i <= len; i++) {
        const v = i < len ? cells[path[i]] : EMPTY;
        if (v === color || v === CRYSTAL) {
          if (runLen === 0) runStart = i;
          runLen++;
          if (v === color) hasColor = true;
        } else {
          if (runLen >= 5 && hasColor) {
            const cs: number[] = [];
            for (let j = runStart; j < runStart + runLen; j++) cs.push(path[j]);
            out.push({ color: color as Stone, dir: dirs[pi], cells: cs, length: runLen });
          }
          runLen = 0; hasColor = false;
        }
      }
    }
  }
  return out;
}

export function fullRows(g: Grid): number[] {
  const out: number[] = [];
  for (let y = 0; y < g.rows; y++) {
    let full = true;
    for (let x = 0; x < g.cols; x++) if (g.cells[y * g.cols + x] === EMPTY) { full = false; break; }
    if (full) out.push(y);
  }
  return out;
}

/** 满行时要移除的格子：多数色 + 冰晶子；平局或 all 模式整行 */
export function fullRowRemoval(g: Grid, y: number, mode: FullRowMode, minMajority = 0): number[] {
  const out: number[] = [];
  let b = 0, w = 0;
  for (let x = 0; x < g.cols; x++) {
    const v = g.cells[y * g.cols + x];
    if (v === BLACK) b++; else if (v === WHITE) w++;
  }
  const all = mode === 'all' || b === w;
  const maj = b > w ? BLACK : WHITE;
  if (!all && Math.max(b, w) < minMajority) return out;
  for (let x = 0; x < g.cols; x++) {
    const v = g.cells[y * g.cols + x];
    if (all || v === maj || v === CRYSTAL) out.push(y * g.cols + x);
  }
  return out;
}

/** 补位下落（第 3.7 节）：只影响有消除的列；r* 上方的子压实到「r* 及其下方最靠上的子」之上 */
export function applyGravity(g: Grid, removed: number[], moves: FallMove[] = []): FallMove[] {
  moves.length = 0;
  const { cols, rows, cells } = g;
  for (let x = 0; x < cols; x++) {
    let rStar = -1;
    for (const k of removed) if (k % cols === x) { const y = (k - x) / cols; if (y > rStar) rStar = y; }
    if (rStar < 0) continue;
    let support = rows;
    for (let y = rStar + 1; y < rows; y++) if (cells[y * cols + x] !== EMPTY) { support = y; break; }
    let land = support - 1;
    for (let y = rStar; y >= 0; y--) {
      const v = cells[y * cols + x] as Stone;
      if (v === EMPTY) continue;
      cells[y * cols + x] = EMPTY;
      cells[land * cols + x] = v;
      if (land !== y) moves.push({ x, fromY: y, toY: land, c: v });
      land--;
    }
  }
  g.version++;
  return moves;
}

export function scoreFive(lines: Line[], k: number, level: number, cfg: Config): number {
  let base = 0;
  for (const l of lines) base += cfg.score.lineBase * (l.length - 4);
  const cross = 1 + cfg.score.crossStep * (lines.length - 1);
  return Math.round(base * cross * chainMult(k, cfg) * levelMult(level, cfg));
}

export function chainMult(k: number, cfg: Config): number {
  const t = cfg.score.chainMult;
  return t[Math.min(k, t.length) - 1];
}

export function scoreRow(removedCount: number, k: number, level: number, cfg: Config): number {
  return Math.round(cfg.score.fullRowPerStone * removedCount * chainMult(k, cfg) * levelMult(level, cfg));
}

const tmpLines: Line[] = [];

/** 执行一轮结算（会修改 g）；无事可做返回 null */
export function resolveStep(g: Grid, k: number, level: number, cfg: Config): Step | null {
  const lines = findLines(g, tmpLines);
  if (lines.length > 0) {
    const counts = new Map<number, number>();
    for (const l of lines) for (const c of l.cells) counts.set(c, (counts.get(c) ?? 0) + 1);
    const removed: number[] = [];
    const removedColors: Stone[] = [];
    const cross: number[] = [];
    for (const [c, n] of counts) {
      removed.push(c);
      removedColors.push(g.cells[c] as Stone);
      if (n >= 2) cross.push(c);
    }
    const linesCopy = lines.map(l => ({ ...l, cells: l.cells.slice() }));
    const score = scoreFive(linesCopy, k, level, cfg);
    for (const c of removed) g.cells[c] = EMPTY;
    const moves = applyGravity(g, removed, []);
    return { kind: 'five', k, lines: linesCopy, rows: [], removed, removedColors, cross, moves, score };
  }
  if (cfg.fullRow.mode === 'none') return null;
  const rows = fullRows(g);
  if (rows.length > 0) {
    const removed: number[] = [];
    const removedColors: Stone[] = [];
    for (const y of rows) for (const c of fullRowRemoval(g, y, cfg.fullRow.mode, cfg.fullRow.minMajority)) { removed.push(c); removedColors.push(g.cells[c] as Stone); }
    if (removed.length === 0) return null;
    const score = scoreRow(removed.length, k, level, cfg);
    for (const c of removed) g.cells[c] = EMPTY;
    const moves = applyGravity(g, removed, []);
    return { kind: 'row', k, lines: [], rows, removed, removedColors, cross: [], moves, score };
  }
  return null;
}

/** 完整结算直到稳定（会修改 g） */
export function resolveAll(g: Grid, level: number, cfg: Config, maxSteps = 60): Step[] {
  const steps: Step[] = [];
  for (let k = 1; k <= maxSteps; k++) {
    const s = resolveStep(g, k, level, cfg);
    if (!s) break;
    steps.push(s);
  }
  return steps;
}
