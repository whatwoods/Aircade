/** 模拟器机器人（§5.4）：novice / diligent / oracle。直接调用 core 规则。 */
import { CONFIG } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { Game, deficits } from '../core/game.ts';
import { RECIPE_MAP, canMergeTiles, resolveMerge, subNodes, zoneFor } from '../core/recipes.ts';
import type { Action, GameState, Tile, Zone } from '../core/types.ts';

export type BotKind = 'novice' | 'diligent' | 'oracle';

const CELLS = CONFIG.board.cols * CONFIG.board.rows;

function empties(s: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (!s.board[i]) out.push(i);
  return out;
}

/** 每个「有用节点」还需要几个：目标本身和其子树节点 */
function usefulNeed(s: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of s.orders) {
    for (const n of [o.ch, ...subNodes(o.ch)]) m.set(n, (m.get(n) ?? 0) + 1);
    const r = RECIPE_MAP.get(o.ch);
    if (r && r.parts.length === 3) {
      const [a, b, c] = r.parts;
      for (const p of [[a, b], [a, c], [b, c]]) {
        const k = 'P:' + [...p].sort().join('');
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
  }
  return m;
}

function tileKey(t: Tile): string {
  return t.kind === 'pending' ? 'P:' + [...(t.parts ?? [])].sort().join('') : t.ch;
}

function boardCount(s: GameState, k: string): number {
  let n = 0;
  for (const t of s.board) if (t && tileKey(t) === k) n++;
  return n;
}

interface MergePlan { a: Tile; b: Tile; zone: Zone; result: string; score: number }

/** a 落到 b 上若能合成有用的东西，返回计划 */
function usefulMerge(s: GameState, need: Map<string, number>, a: Tile, b: Tile): MergePlan | null {
  const res = resolveMerge(a, b, 'center');
  if (res.kind === 'none') return null;
  const targets = res.kind === 'char' ? res.candidates.map((r) => r.c) : ['P:' + [...res.parts].sort().join('')];
  let best: MergePlan | null = null;
  for (const r of targets) {
    const want = need.get(r) ?? 0;
    if (want <= boardCount(s, r)) continue;
    const isOrder = s.orders.some((o) => o.ch === r);
    const sc = (isOrder ? 100 : 0) + (RECIPE_MAP.get(r)?.parts.length ?? 2);
    if (!best || sc > best.score) best = { a, b, zone: r.startsWith('P:') ? 'center' : zoneFor(a.ch, r), result: r, score: sc };
  }
  return best;
}

export function botAction(g: Game, kind: BotKind, rng: Rng): Action | null {
  return kind === 'novice' ? noviceAction(g.s, rng) : diligentAction(g.s, kind === 'oracle');
}

function diligentAction(s: GameState, oracle: boolean): Action | null {
  const need = usefulNeed(s);
  // 1. 棋盘上有用的合成（免费）
  let best: { plan: MergePlan; from: number; to: number } | null = null;
  for (let i = 0; i < CELLS; i++) {
    const a = s.board[i];
    if (!a) continue;
    for (let j = 0; j < CELLS; j++) {
      const b = s.board[j];
      if (!b || i === j) continue;
      const p = usefulMerge(s, need, a, b);
      if (p && (!best || p.score > best.plan.score)) best = { plan: p, from: i, to: j };
    }
  }
  if (best) return { t: 'drop', from: best.from, cell: best.to, zone: best.plan.zone };

  if (s.ink > 0) {
    const P = s.rack[0];
    const pt: Tile = { id: -1, kind: 'base', ch: P };
    // 2. 笔架部件直接合成有用的东西
    let rb: { plan: MergePlan; to: number } | null = null;
    for (let j = 0; j < CELLS; j++) {
      const b = s.board[j];
      if (!b) continue;
      const p = usefulMerge(s, need, pt, b);
      if (p && (!rb || p.score > rb.plan.score)) rb = { plan: p, to: j };
    }
    if (rb) return { t: 'drop', from: 'rack', cell: rb.to, zone: rb.plan.zone };
    // 3. 缺口部件 → 放下
    const defs = deficits(s, false).flat();
    const useful = defs.includes(P);
    const em = empties(s);
    const occ = 1 - em.length / CELLS;
    if (useful) {
      if (em.length) return { t: 'drop', from: 'rack', cell: em[0], zone: 'center' };
      const junk = junkCell(s, need);
      if (junk >= 0) return { t: 'discard', from: junk };
      return { t: 'discard', from: 'rack' };
    }
    // 4. 干扰部件
    if (!oracle && occ < 0.6 && em.length) return { t: 'drop', from: 'rack', cell: em[em.length - 1], zone: 'center' };
    return { t: 'discard', from: 'rack' };
  }
  // 墨尽：还能合成就随便合成看看
  return anyMerge(s, null);
}

function junkCell(s: GameState, need: Map<string, number>): number {
  let best = -1;
  let bestId = Infinity;
  for (let i = 0; i < CELLS; i++) {
    const t = s.board[i];
    if (!t) continue;
    const k = tileKey(t);
    if ((need.get(k) ?? 0) > 0) continue;
    if (t.id < bestId) {
      bestId = t.id;
      best = i;
    }
  }
  return best;
}

function anyMerge(s: GameState, rng: Rng | null): Action | null {
  const pairs: [number, number][] = [];
  for (let i = 0; i < CELLS; i++) {
    const a = s.board[i];
    if (!a) continue;
    for (let j = 0; j < CELLS; j++) {
      const b = s.board[j];
      if (b && i !== j && canMergeTiles(a, b)) pairs.push([i, j]);
    }
  }
  if (!pairs.length) return null;
  const [i, j] = rng ? rng.pick(pairs) : pairs[0];
  return { t: 'drop', from: i, cell: j, zone: 'center' };
}

const ZONES: Zone[] = ['left', 'right', 'top', 'bottom', 'center'];

/**
 * 新手选落点区域：游戏在拖拽时会显示结果预览（§8.4 预览虚影），
 * 所以新手有 60% 的概率会挪到“能出订单字”的那一侧，否则随手放。
 */
function noviceZone(s: GameState, a: Tile, b: Tile, rng: Rng): Zone {
  if (rng.next() < 0.6) {
    const want = new Set(s.orders.flatMap((o) => [o.ch, ...subNodes(o.ch)]));
    for (const z of ZONES) {
      const r = resolveMerge(a, b, z);
      if (r.kind === 'char' && want.has(r.recipe.c)) return z;
    }
  }
  return rng.pick(ZONES);
}

function noviceAction(s: GameState, rng: Rng): Action | null {
  // 有能合成的就常常顺手合成（不管有没有用）
  if (rng.next() < 0.7) {
    const m = anyMerge(s, rng);
    if (m && m.t === 'drop' && typeof m.from === 'number') return { ...m, zone: noviceZone(s, s.board[m.from]!, s.board[m.cell]!, rng) };
  }
  if (s.ink <= 0) return anyMerge(s, rng);
  const P = s.rack[0];
  const pt: Tile = { id: -1, kind: 'base', ch: P };
  const partners: number[] = [];
  for (let j = 0; j < CELLS; j++) {
    const b = s.board[j];
    if (b && canMergeTiles(pt, b)) partners.push(j);
  }
  if (partners.length && rng.next() < 0.5) {
    const cell = rng.pick(partners);
    return { t: 'drop', from: 'rack', cell, zone: noviceZone(s, pt, s.board[cell]!, rng) };
  }
  const em = empties(s);
  if (em.length) return { t: 'drop', from: 'rack', cell: rng.pick(em), zone: 'center' };
  // 满了：洗掉最早放下的牌
  let oldest = -1;
  let id = Infinity;
  for (let i = 0; i < CELLS; i++) {
    const t = s.board[i];
    if (t && t.id < id) {
      id = t.id;
      oldest = i;
    }
  }
  return oldest >= 0 ? { t: 'discard', from: oldest } : { t: 'discard', from: 'rack' };
}
