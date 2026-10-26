// 形状解析与旋转
import { ITEMS } from '../config.ts';
import type { ItemId, Rot } from './types.ts';

export type Cell = [number, number];

export interface Shape {
  cells: Cell[];
  w: number;
  h: number;
  /** 号角：口格 / 尾格（旋转后） */
  mouth?: Cell;
  tail?: Cell;
}

export function parseShape(rows: string[]): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') out.push([x, y]);
  }
  return out;
}

function bounds(cells: Cell[]): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const [x, y] of cells) {
    if (x + 1 > w) w = x + 1;
    if (y + 1 > h) h = y + 1;
  }
  return { w, h };
}

/** 顺时针旋转 90°：(x,y) → (h−1−y, x) */
function rot90(cells: Cell[], h: number): Cell[] {
  return cells.map(([x, y]) => [h - 1 - y, x] as Cell);
}

const cache = new Map<string, Shape>();

export function shapeOf(id: ItemId, rot: Rot): Shape {
  const key = id + rot;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = ITEMS[id];
  let cells = parseShape(def.shape);
  let { w, h } = bounds(cells);
  let mouth: Cell | undefined = def.mouth ? [def.mouth[0], def.mouth[1]] : undefined;
  let tail: Cell | undefined = def.tail ? [def.tail[0], def.tail[1]] : undefined;
  for (let i = 0; i < rot; i++) {
    cells = rot90(cells, h);
    if (mouth) mouth = [h - 1 - mouth[1], mouth[0]];
    if (tail) tail = [h - 1 - tail[1], tail[0]];
    const nb = bounds(cells);
    w = nb.w;
    h = nb.h;
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const s: Shape = { cells, w, h, mouth, tail };
  cache.set(key, s);
  return s;
}

/** 某格在旋转前后的映射（用于拖拽中旋转时保持抓取格） */
export function rotateCellCW(c: Cell, hBefore: number): Cell {
  return [hBefore - 1 - c[1], c[0]];
}

/** 与 rot0 等价的不同朝向个数（用于 ASCII 解析匹配） */
export function cellsKey(cells: Cell[]): string {
  const s = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return s.map((c) => c[0] + ',' + c[1]).join(';');
}

/** 形状质心（格单位，格中心为 +0.5） */
export function centroid(cells: Cell[]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of cells) {
    sx += x + 0.5;
    sy += y + 0.5;
  }
  return [sx / cells.length, sy / cells.length];
}

/** 离质心最近的格（冷却环徽章格） */
export function badgeCell(cells: Cell[]): Cell {
  const [cx, cy] = centroid(cells);
  let best = cells[0];
  let bd = Infinity;
  for (const c of cells) {
    const d = (c[0] + 0.5 - cx) ** 2 + (c[1] + 0.5 - cy) ** 2;
    if (d < bd - 1e-6) {
      bd = d;
      best = c;
    }
  }
  return best;
}
