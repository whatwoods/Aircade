import type { Grid } from '../core/grid.ts';
import { BLACK, WHITE, CRYSTAL } from '../core/pieces.ts';
import { linePaths } from '../core/rules.ts';

export interface Weights {
  clear: number; score: number; height: number; hole: number; bump: number;
  top: number; topFrom: number; pot: number; dead: number; well: number; landing: number;
  /** 斜线是否可见（新手 50% 看不见） */
  diag: boolean;
  /** 色盲：评估时完全不看颜色 */
  colorblind: boolean;
}

export interface Features { aggH: number; maxH: number; holes: number; bump: number; pot: number; dead: number; wells: number }

const POT = [0, 0, 1, 4, 12, 0];
let windowsCache: { key: string; win: Int16Array; dir: Uint8Array } | null = null;

function windows(cols: number, rows: number) {
  const key = cols + 'x' + rows;
  if (windowsCache && windowsCache.key === key) return windowsCache;
  const { paths, dirs } = linePaths(cols, rows);
  const w: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    for (let s = 0; s + 5 <= p.length; s++) {
      for (let j = 0; j < 5; j++) w.push(p[s + j]);
      d.push(dirs[i]);
    }
  }
  windowsCache = { key, win: Int16Array.from(w), dir: Uint8Array.from(d) };
  return windowsCache;
}

const heights: number[] = [];
let viable = new Uint8Array(0);

export function features(g: Grid, diag: boolean, out: Features): Features {
  const { cols, rows, cells } = g;
  g.heights(heights);
  let aggH = 0, maxH = 0, bump = 0, holes = 0, wells = 0;
  for (let x = 0; x < cols; x++) {
    const h = heights[x];
    aggH += h;
    if (h > maxH) maxH = h;
    if (x > 0) bump += Math.abs(h - heights[x - 1]);
    const top = rows - h;
    for (let y = top + 1; y < rows; y++) if (cells[y * cols + x] === 0) holes++;
    const l = x > 0 ? heights[x - 1] : 99, r = x < cols - 1 ? heights[x + 1] : 99;
    const depth = Math.min(l, r) - h;
    if (depth >= 3) wells += depth - 2;
  }
  // 五子窗口潜力与死子
  const { win, dir } = windows(cols, rows);
  if (viable.length !== cells.length) viable = new Uint8Array(cells.length);
  viable.fill(0);
  let pot = 0;
  const nW = dir.length;
  for (let wi = 0; wi < nW; wi++) {
    if (!diag && dir[wi] >= 2) continue;
    const o = wi * 5;
    let b = 0, w = 0, xx = 0;
    for (let j = 0; j < 5; j++) {
      const v = cells[win[o + j]];
      if (v === BLACK) b++; else if (v === WHITE) w++; else if (v === CRYSTAL) xx++;
    }
    if (b > 0 && w > 0) continue;
    const k = b + w + xx;
    if (b + w === 0) continue;
    pot += POT[k > 4 ? 4 : k];
    for (let j = 0; j < 5; j++) viable[win[o + j]] = 1;
  }
  let dead = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] && !viable[i]) dead++;
  out.aggH = aggH; out.maxH = maxH; out.holes = holes; out.bump = bump; out.pot = pot; out.dead = dead; out.wells = wells;
  return out;
}

const f: Features = { aggH: 0, maxH: 0, holes: 0, bump: 0, pot: 0, dead: 0, wells: 0 };

export function evaluate(g: Grid, removed: number, score: number, w: Weights): number {
  features(g, w.diag, f);
  let e = w.clear * removed + w.score * score / 100
    - w.height * f.aggH - w.hole * f.holes - w.bump * f.bump - w.well * f.wells
    - w.top * Math.max(0, f.maxH - w.topFrom) ** 2;
  if (!w.colorblind) e += w.pot * f.pot - w.dead * f.dead;
  return e;
}
