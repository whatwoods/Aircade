// 背包占位、合法性、找空位、相邻图
import { shapeOf, type Cell } from './shapes.ts';
import type { Placed, Rot, ItemId } from './types.ts';

export class Occ {
  cols: number;
  rows: number;
  cells: Int32Array;
  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Int32Array(cols * rows);
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return this.cells[y * this.cols + x];
  }
  set(x: number, y: number, v: number): void {
    this.cells[y * this.cols + x] = v;
  }
}

export function buildOcc(items: readonly Placed[], cols: number, rows: number): Occ {
  const o = new Occ(cols, rows);
  for (const it of items) {
    const s = shapeOf(it.id, it.rot);
    for (const [cx, cy] of s.cells) {
      const x = it.x + cx;
      const y = it.y + cy;
      if (x >= 0 && y >= 0 && x < cols && y < rows) o.set(x, y, it.uid);
    }
  }
  return o;
}

export function canPlace(o: Occ, id: ItemId, rot: Rot, ox: number, oy: number, ignoreUid = 0): boolean {
  const s = shapeOf(id, rot);
  for (const [cx, cy] of s.cells) {
    const v = o.get(ox + cx, oy + cy);
    if (v === -1) return false;
    if (v !== 0 && v !== ignoreUid) return false;
  }
  return true;
}

/** 冲突格（用于红色斜线预览）；越界格也返回 */
export function conflictCells(o: Occ, id: ItemId, rot: Rot, ox: number, oy: number, ignoreUid = 0): Cell[] {
  const s = shapeOf(id, rot);
  const out: Cell[] = [];
  for (const [cx, cy] of s.cells) {
    const v = o.get(ox + cx, oy + cy);
    if (v === -1 || (v !== 0 && v !== ignoreUid)) out.push([ox + cx, oy + cy]);
  }
  return out;
}

/** 扫描找第一个能放下的位置（先试 4 个朝向中的给定朝向） */
export function findFit(o: Occ, id: ItemId, rot: Rot): { x: number; y: number; rot: Rot } | null {
  const rots: Rot[] = [rot, ((rot + 1) % 4) as Rot, ((rot + 2) % 4) as Rot, ((rot + 3) % 4) as Rot];
  for (const r of rots) {
    for (let y = 0; y < o.rows; y++) {
      for (let x = 0; x < o.cols; x++) if (canPlace(o, id, r, x, y)) return { x, y, rot: r };
    }
  }
  return null;
}

/** 原地旋转的平移尝试顺序 */
export const NUDGES: Cell[] = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2],
];

export function absCells(it: Placed): Cell[] {
  const s = shapeOf(it.id, it.rot);
  return s.cells.map(([x, y]) => [it.x + x, it.y + y] as Cell);
}

/** 相邻图：uid → 相邻 uid 集合 */
export function adjacency(items: readonly Placed[], o: Occ): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const it of items) m.set(it.uid, new Set());
  for (const it of items) {
    const set = m.get(it.uid)!;
    for (const [x, y] of absCells(it)) {
      for (const [dx, dy] of DIRS) {
        const v = o.get(x + dx, y + dy);
        if (v > 0 && v !== it.uid) set.add(v);
      }
    }
  }
  return m;
}

export const DIRS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 相邻空格（背包内、未被占据） */
export function emptyNeighbors(it: Placed, o: Occ): Cell[] {
  const seen = new Set<number>();
  const out: Cell[] = [];
  for (const [x, y] of absCells(it)) {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (o.get(nx, ny) === 0) {
        const k = ny * o.cols + nx;
        if (!seen.has(k)) {
          seen.add(k);
          out.push([nx, ny]);
        }
      }
    }
  }
  return out;
}

/** A、B 之间的接触格对（取离两者质心最近的一对） */
export function contactPair(a: Placed, b: Placed): [Cell, Cell] | null {
  const ca = absCells(a);
  const cb = absCells(b);
  const ma = mean(ca);
  const mb = mean(cb);
  let best: [Cell, Cell] | null = null;
  let bd = Infinity;
  for (const p of ca) {
    for (const q of cb) {
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) !== 1) continue;
      const d = (p[0] - ma[0]) ** 2 + (p[1] - ma[1]) ** 2 + (q[0] - mb[0]) ** 2 + (q[1] - mb[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = [p, q];
      }
    }
  }
  return best;
}

function mean(cs: Cell[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const c of cs) {
    x += c[0];
    y += c[1];
  }
  return [x / cs.length, y / cs.length];
}

/** 号角的线：从口格沿方向到边缘的格子 */
export function hornLine(it: Placed, cols: number, rows: number): Cell[] {
  const s = shapeOf(it.id, it.rot);
  if (!s.mouth || !s.tail) return [];
  const dx = s.mouth[0] - s.tail[0];
  const dy = s.mouth[1] - s.tail[1];
  const out: Cell[] = [];
  let x = it.x + s.mouth[0] + dx;
  let y = it.y + s.mouth[1] + dy;
  while (x >= 0 && y >= 0 && x < cols && y < rows) {
    out.push([x, y]);
    x += dx;
    y += dy;
  }
  return out;
}
