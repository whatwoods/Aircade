/** 配方索引与合成判定（§3.5）。 */
import { BASES, RECIPES, type BaseDef, type RecipeDef } from '../data/hanzi.ts';
import type { Tile, Zone } from './types.ts';

export const BASE_MAP = new Map<string, BaseDef>(BASES.map((b) => [b.c, b]));
export const RECIPE_MAP = new Map<string, RecipeDef>(RECIPES.map((r) => [r.c, r]));

const key = (ps: string[]) => [...ps].sort().join('|');

const pairIndex = new Map<string, RecipeDef[]>();
const triIndex = new Map<string, RecipeDef>();
/** 二元组合 → 能补成哪些三部件字 */
const pendingIndex = new Map<string, RecipeDef[]>();

for (const r of RECIPES) {
  if (r.parts.length === 2) {
    const k = key(r.parts);
    pairIndex.set(k, [...(pairIndex.get(k) ?? []), r]);
  } else {
    triIndex.set(key(r.parts), r);
  }
}
for (const r of RECIPES) {
  if (r.parts.length !== 3) continue;
  const [a, b, c] = r.parts;
  for (const p of [[a, b], [a, c], [b, c]]) {
    const k = key(p);
    if (pairIndex.has(k)) continue;
    const list = pendingIndex.get(k) ?? [];
    if (!list.includes(r)) list.push(r);
    pendingIndex.set(k, list);
  }
}

const leafCache = new Map<string, string[]>();
/** 展开到基础部件 */
export function leaves(ch: string): string[] {
  const hit = leafCache.get(ch);
  if (hit) return hit;
  const r = RECIPE_MAP.get(ch);
  const out = r ? r.parts.flatMap(leaves) : [ch];
  leafCache.set(ch, out);
  return out;
}

const depthCache = new Map<string, number>();
export function depth(ch: string): number {
  const hit = depthCache.get(ch);
  if (hit !== undefined) return hit;
  const r = RECIPE_MAP.get(ch);
  const d = r ? 1 + Math.max(...r.parts.map(depth)) : 0;
  depthCache.set(ch, d);
  return d;
}

/** 所有子节点（不含自身） */
export function subNodes(ch: string): string[] {
  const r = RECIPE_MAP.get(ch);
  if (!r) return [];
  return r.parts.flatMap((p) => [p, ...subNodes(p)]);
}

export function isBase(ch: string): boolean {
  return BASE_MAP.has(ch);
}

/** A（被拖的部件）在配方 r 中相对 B 的方位 */
function relOf(r: RecipeDef, a: string): Zone {
  const i = r.parts.indexOf(a);
  if (r.s === '⿰') return i === 0 ? 'left' : 'right';
  if (r.s === '⿱') return i === 0 ? 'top' : 'bottom';
  return 'center';
}

export type MergeResult =
  | { kind: 'char'; recipe: RecipeDef; candidates: RecipeDef[] }
  | { kind: 'pending'; parts: string[]; targets: RecipeDef[] }
  | { kind: 'none' };

/** 判定：A 拖到 B 上，方位 zone（A 相对 B） */
export function resolveMerge(a: Tile, b: Tile, zone: Zone): MergeResult {
  if (a.kind === 'pending' && b.kind === 'pending') return { kind: 'none' };
  if (b.kind === 'pending' || a.kind === 'pending') {
    const pend = b.kind === 'pending' ? b : a;
    const other = b.kind === 'pending' ? a : b;
    const r = triIndex.get(key([...(pend.parts ?? []), other.ch]));
    return r ? { kind: 'char', recipe: r, candidates: [r] } : { kind: 'none' };
  }
  const cands = pairIndex.get(key([a.ch, b.ch]));
  if (cands && cands.length) {
    if (cands.length === 1) return { kind: 'char', recipe: cands[0], candidates: cands };
    const hit = cands.find((r) => relOf(r, a.ch) === zone);
    return { kind: 'char', recipe: hit ?? cands[0], candidates: cands };
  }
  const tri = pendingIndex.get(key([a.ch, b.ch]));
  if (tri && tri.length) return { kind: 'pending', parts: [b.ch, a.ch], targets: tri };
  return { kind: 'none' };
}

/** 想让 A+B 合成 target 时应落的方位 */
export function zoneFor(aCh: string, target: string): Zone {
  const r = RECIPE_MAP.get(target);
  return r ? relOf(r, aCh) : 'center';
}

export function canMergeTiles(a: Tile, b: Tile): boolean {
  return resolveMerge(a, b, 'center').kind !== 'none';
}

/** 棋盘上是否存在任意可合成的牌对 */
export function canMergeAny(board: (Tile | null)[]): boolean {
  for (let i = 0; i < board.length; i++) {
    const a = board[i];
    if (!a) continue;
    for (let j = i + 1; j < board.length; j++) {
      const b = board[j];
      if (b && canMergeTiles(a, b)) return true;
    }
  }
  return false;
}

/** 与某部件能合成的所有字（拖拽高亮用） */
export function mergeCandidates(a: Tile, b: Tile): string[] {
  const r = resolveMerge(a, b, 'center');
  if (r.kind === 'char') return r.candidates.map((x) => x.c);
  if (r.kind === 'pending') return r.targets.map((x) => x.c);
  return [];
}
