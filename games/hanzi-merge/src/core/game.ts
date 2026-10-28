/** 一帖 / 一局书斋的状态机（§3.4–§3.11）。纯逻辑，浏览器与模拟器共用。 */
import { CONFIG } from '../config.ts';
import { RECIPES } from '../data/hanzi.ts';
import { nextRand } from './rng.ts';
import { BASE_MAP, RECIPE_MAP, canMergeAny, isBase, leaves, resolveMerge, type MergeResult } from './recipes.ts';
import type { Action, GameEvent, GameState, LevelDef, Order, Source, Tile } from './types.ts';

const CELLS = CONFIG.board.cols * CONFIG.board.rows;

export const ENDLESS_DEF: LevelDef = {
  id: 0, chapter: 0, targets: [], active: CONFIG.endless.active, decoys: [], decoyRate: CONFIG.endless.decoyStart,
  hintStart: 1, ink: CONFIG.endless.startInk, star2: 0, star3: 0,
};

function rand(s: GameState): number {
  const [v, ns] = nextRand(s.rng);
  s.rng = ns;
  return v;
}

function baseState(def: LevelDef, seed: number, known: Set<string>, mode: 'level' | 'endless'): GameState {
  return {
    mode, def, seed, rng: (seed * 2654435761) | 0 || 1,
    board: new Array<Tile | null>(CELLS).fill(null), rack: [], ink: def.ink, score: 0,
    orders: [], queue: [...def.targets], delivered: 0, total: def.targets.length,
    undoLeft: CONFIG.undo.perLevel, status: 'play', nextId: 1,
    dir: { since: {}, decoyStreak: 0, lastDecoy: '', scriptPos: 0 },
    inkOutShown: false, actions: 0, discards: 0, merges: 0, formed: [],
    stage: 1, endlessDone: 0, known,
  };
}

function newTile(s: GameState, ch: string, kind: Tile['kind'] = isBase(ch) ? 'base' : 'char', parts?: string[]): Tile {
  return parts ? { id: s.nextId++, kind, ch, parts } : { id: s.nextId++, kind, ch };
}

let orderUid = 1;
function openOrder(s: GameState, slot: number): Order | null {
  let ch: string | undefined;
  if (s.mode === 'level') ch = s.queue.shift();
  else ch = pickEndlessTarget(s);
  if (!ch) return null;
  const hint = s.mode === 'level' ? s.def.hintStart : s.stage <= 2 ? 1 : 0;
  const o: Order = { ch, hint, slot, uid: orderUid++ };
  s.orders.push(o);
  return o;
}

export function createLevel(def: LevelDef, seed: number, known: Set<string>): GameState {
  const s = baseState(def, seed, known, 'level');
  for (const [cell, ch] of def.preset ?? []) s.board[cell] = newTile(s, ch);
  for (let i = 0; i < def.active; i++) openOrder(s, i);
  fillRack(s);
  return s;
}

export function createEndless(seed: number, known: Set<string>, stage = 1): GameState {
  const s = baseState(ENDLESS_DEF, seed, known, 'endless');
  s.stage = stage;
  s.total = 0;
  for (let i = 0; i < CONFIG.endless.active; i++) openOrder(s, i);
  fillRack(s);
  return s;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    board: s.board.map((t) => (t ? { ...t, parts: t.parts ? [...t.parts] : undefined } : null)),
    rack: [...s.rack], orders: s.orders.map((o) => ({ ...o })), queue: [...s.queue],
    dir: { ...s.dir, since: { ...s.dir.since } }, formed: [...s.formed],
  };
}

// ───────────────────────── 书斋目标 ─────────────────────────
function endlessMaxTier(s: GameState): number {
  return Math.min(6, s.stage + 1);
}
export function endlessRefundBonus(s: GameState): number {
  const e = CONFIG.endless;
  return Math.max(e.refundMin, e.refundBonus - Math.floor((s.stage - 1) / e.refundDecayStages));
}
export function endlessDecoyRate(s: GameState): number {
  const e = CONFIG.endless;
  return Math.min(e.decoyMax, e.decoyStart + e.decoyStep * (s.stage - 1));
}
function pickEndlessTarget(s: GameState): string {
  const tier = endlessMaxTier(s);
  const active = new Set(s.orders.map((o) => o.ch));
  const pool = RECIPES.filter((r) => r.tier <= tier && !active.has(r.c));
  let total = 0;
  const w = pool.map((r) => {
    const x = (s.known.has(r.c) ? 1 : 2) * (r.tier >= tier - 1 ? 1.5 : 1);
    total += x;
    return x;
  });
  let roll = rand(s) * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= w[i];
    if (roll <= 0) return pool[i].c;
  }
  return pool[pool.length - 1].c;
}

// ───────────────────────── 出牌导演（§3.10） ─────────────────────────
/** 把目标展开为仍缺的基础部件，avail 为可用的牌（会被消耗） */
function cover(target: string, avail: Map<string, number>, out: string[]): void {
  const n = avail.get(target) ?? 0;
  if (n > 0) {
    avail.set(target, n - 1);
    return;
  }
  const r = RECIPE_MAP.get(target);
  if (!r) {
    out.push(target);
    return;
  }
  if (r.parts.length === 3) {
    const [a, b, c] = r.parts;
    for (const [p, q, rest] of [[a, b, c], [a, c, b], [b, c, a]]) {
      const k = 'P:' + [p, q].sort().join('');
      const m = avail.get(k) ?? 0;
      if (m > 0) {
        avail.set(k, m - 1);
        cover(rest, avail, out);
        return;
      }
    }
  }
  for (const p of r.parts) cover(p, avail, out);
}

export function availability(s: GameState, includeRack = true): Map<string, number> {
  const avail = new Map<string, number>();
  const add = (k: string) => avail.set(k, (avail.get(k) ?? 0) + 1);
  for (const t of s.board) {
    if (!t) continue;
    if (t.kind === 'pending') add('P:' + [...(t.parts ?? [])].sort().join(''));
    else add(t.ch);
  }
  if (includeRack) for (const r of s.rack) add(r);
  return avail;
}

/** 当前缺口：每个已展开目标仍缺的基础部件（按目标顺序） */
export function deficits(s: GameState, includeRack = true): string[][] {
  const avail = availability(s, includeRack);
  const sorted = [...s.orders].sort((a, b) => a.uid - b.uid);
  return sorted.map((o) => {
    const out: string[] = [];
    cover(o.ch, avail, out);
    return out;
  });
}

function decoyList(s: GameState, need: Set<string>): string[] {
  if (s.mode === 'level') return s.def.decoys;
  const tier = endlessMaxTier(s);
  const set = new Set<string>();
  for (const r of RECIPES) if (r.tier <= tier) for (const l of leaves(r.c)) if (!need.has(l)) set.add(l);
  return [...set].sort();
}

function choosePiece(s: GameState): string {
  const d = s.dir;
  if (s.def.script && d.scriptPos < s.def.script.length) return s.def.script[d.scriptPos++];
  const defs = deficits(s);
  const need = defs.flat();
  const needSet = new Set(need);
  // 保底
  for (const ch of need) if ((d.since[ch] ?? 0) >= CONFIG.director.guaranteeWindow) return ch;
  const rate = s.mode === 'level' ? s.def.decoyRate : endlessDecoyRate(s);
  const decoys = decoyList(s, needSet).filter((x) => !needSet.has(x));
  // 可解保证（§5.1）：关卡模式下，只有在“发出这张干扰后墨仍够完成剩余全部目标”时才发干扰
  let canDecoy = true;
  if (s.mode === 'level') {
    const queueNeed = s.queue.reduce((n, c) => n + leaves(c).length, 0);
    canDecoy = s.ink - s.rack.length - 1 >= need.length + queueNeed;
  }
  if (canDecoy && decoys.length && d.decoyStreak < CONFIG.director.maxDecoyStreak && rand(s) < rate) {
    const opts = decoys.length > 1 ? decoys.filter((x) => x !== d.lastDecoy) : decoys;
    const ch = opts[Math.floor(rand(s) * opts.length)];
    d.lastDecoy = ch;
    d.decoyStreak++;
    return ch;
  }
  d.decoyStreak = 0;
  if (need.length) {
    const earliest = new Set(defs[0] ?? []);
    const w = new Map<string, number>();
    for (const ch of need) w.set(ch, (w.get(ch) ?? 0) + 1);
    let total = 0;
    const entries = [...w.entries()].map(([ch, n]) => {
      const x = n * (earliest.has(ch) ? CONFIG.director.earliestOrderWeight : 1);
      total += x;
      return [ch, x] as const;
    });
    let roll = rand(s) * total;
    for (const [ch, x] of entries) {
      roll -= x;
      if (roll <= 0) return ch;
    }
    return entries[entries.length - 1][0];
  }
  // 缺口为空：从后续目标里取
  const future = s.queue.slice(0, 2).flatMap((c) => leaves(c));
  if (future.length) return future[Math.floor(rand(s) * future.length)];
  const any = s.orders.flatMap((o) => leaves(o.ch));
  if (any.length) return any[Math.floor(rand(s) * any.length)];
  return decoys[0] ?? '木';
}

function pushPiece(s: GameState): void {
  const ch = choosePiece(s);
  for (const k of Object.keys(s.dir.since)) s.dir.since[k]++;
  for (const k of leavesNeededKeys(s)) if (s.dir.since[k] === undefined) s.dir.since[k] = 1;
  s.dir.since[ch] = 0;
  s.rack.push(ch);
}
function leavesNeededKeys(s: GameState): string[] {
  return s.orders.flatMap((o) => leaves(o.ch));
}

function fillRack(s: GameState): void {
  while (s.rack.length < 1 + CONFIG.rack.preview) pushPiece(s);
}

// ───────────────────────── 动作 ─────────────────────────
function spendInk(s: GameState, ev: GameEvent[], n: number): void {
  s.ink -= n;
  ev.push({ t: 'ink', ink: s.ink, delta: -n });
}
function addScore(s: GameState, ev: GameEvent[], n: number): void {
  if (!n) return;
  s.score += n;
  ev.push({ t: 'score', score: s.score, delta: n });
}

function consumeRack(s: GameState, ev: GameEvent[]): void {
  s.rack.shift();
  fillRack(s);
  ev.push({ t: 'rack', rack: [...s.rack] });
}

function doMerge(s: GameState, ev: GameEvent[], a: Tile, b: Tile, from: Source, cell: number, res: MergeResult): void {
  if (res.kind === 'none') return;
  s.merges++;
  if (res.kind === 'pending') {
    const t = newTile(s, res.parts.join(''), 'pending', res.parts);
    s.board[cell] = t;
    ev.push({ t: 'pending', a, b, from, cell, result: t });
    return;
  }
  const ch = res.recipe.c;
  const t = newTile(s, ch, 'char');
  s.board[cell] = t;
  const lv = leaves(ch).length;
  ev.push({ t: 'merged', a, b, from, cell, result: t, recipe: ch, depth: lv });
  ev.push({ t: 'formed', ch, cell, leaves: lv });
  s.formed.push(ch);
  if (!s.orders.some((o) => o.ch === ch)) addScore(s, ev, CONFIG.score.extraPerLeaf * lv);
  if (!s.known.has(ch)) {
    s.known.add(ch);
    addScore(s, ev, CONFIG.score.discovery);
  }
}

function deliverAll(s: GameState, ev: GameEvent[]): void {
  let count = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const sorted = [...s.orders].sort((a, b) => a.uid - b.uid);
    for (const o of sorted) {
      const cell = s.board.findIndex((t) => t !== null && t.kind === 'char' && t.ch === o.ch);
      if (cell < 0) continue;
      const tile = s.board[cell]!;
      s.board[cell] = null;
      s.orders.splice(s.orders.indexOf(o), 1);
      const lv = leaves(o.ch).length;
      const pts = CONFIG.score.orderPerLeaf * lv;
      s.delivered++;
      ev.push({ t: 'delivered', tile, cell, order: o, score: pts, index: count });
      addScore(s, ev, pts);
      count++;
      if (s.mode === 'endless') {
        const refund = lv + endlessRefundBonus(s);
        s.ink += refund;
        ev.push({ t: 'ink', ink: s.ink, delta: refund });
        s.endlessDone++;
        s.total++;
        if (s.endlessDone % CONFIG.endless.ordersPerStage === 0) {
          s.stage++;
          ev.push({ t: 'stage', stage: s.stage });
        }
      }
      const no = openOrder(s, o.slot);
      if (no) ev.push({ t: 'orderOpened', order: no });
      changed = true;
      break;
    }
  }
  if (count >= 2) addScore(s, ev, CONFIG.score.multiOrder * (count - 1));
}

export function stars(s: GameState): number {
  if (s.status !== 'won') return 0;
  return s.ink >= s.def.star3 ? 3 : s.ink >= s.def.star2 ? 2 : 1;
}

function post(s: GameState, ev: GameEvent[]): void {
  deliverAll(s, ev);
  if (s.mode === 'level' && s.orders.length === 0 && s.queue.length === 0) {
    s.status = 'won';
    const bonus = s.ink * CONFIG.score.inkLeft;
    addScore(s, ev, bonus);
    ev.push({ t: 'won', inkLeft: s.ink, bonus, stars: stars(s) });
    return;
  }
  if (s.ink <= 0) {
    if (!canMergeAny(s.board)) {
      s.status = 'lost';
      ev.push({ t: 'lost' });
    } else if (!s.inkOutShown) {
      s.inkOutShown = true;
      ev.push({ t: 'inkOut' });
    }
  }
}

export function hintMax(o: Order): number {
  const r = RECIPE_MAP.get(o.ch);
  return r && r.parts.some((p) => RECIPE_MAP.has(p)) ? 3 : 2;
}
export function hintCost(s: GameState): number {
  return s.mode === 'endless' || s.def.chapter >= CONFIG.hint.costFromChapter ? CONFIG.hint.cost : 0;
}

/** 执行一个动作，原地修改状态，返回事件 */
export function apply(s: GameState, a: Action): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== 'play') return ev;
  if (a.t === 'drop') {
    if (a.from === 'rack') {
      if (s.ink <= 0) return [{ t: 'rejected', from: 'rack', cell: a.cell }];
      const tile = newTile(s, s.rack[0]);
      const target = s.board[a.cell];
      if (!target) {
        s.board[a.cell] = tile;
        ev.push({ t: 'placed', tile, cell: a.cell, from: 'rack' });
      } else {
        const res = resolveMerge(tile, target, a.zone);
        if (res.kind === 'none') return [{ t: 'rejected', from: 'rack', cell: a.cell }];
        doMerge(s, ev, tile, target, 'rack', a.cell, res);
      }
      s.actions++;
      spendInk(s, ev, 1);
      consumeRack(s, ev);
    } else {
      const from = a.from;
      if (from === a.cell) return ev;
      const t = s.board[from];
      if (!t) return ev;
      const b = s.board[a.cell];
      s.actions++;
      if (!b) {
        s.board[a.cell] = t;
        s.board[from] = null;
        ev.push({ t: 'moved', tile: t, from, to: a.cell });
      } else {
        const res = resolveMerge(t, b, a.zone);
        if (res.kind === 'none') {
          s.board[a.cell] = t;
          s.board[from] = b;
          ev.push({ t: 'swapped', a: t, b, ca: from, cb: a.cell });
        } else {
          s.board[from] = null;
          doMerge(s, ev, t, b, from, a.cell, res);
        }
      }
    }
  } else if (a.t === 'discard') {
    if (s.ink <= 0) return [{ t: 'rejected', from: a.from, cell: -1 }];
    s.actions++;
    s.discards++;
    if (a.from === 'rack') {
      ev.push({ t: 'discarded', tile: { id: -1, kind: 'base', ch: s.rack[0] }, from: 'rack' });
      spendInk(s, ev, 1);
      consumeRack(s, ev);
    } else {
      const t = s.board[a.from];
      if (!t) return [];
      s.board[a.from] = null;
      ev.push({ t: 'discarded', tile: t, from: a.from });
      spendInk(s, ev, 1);
    }
  } else if (a.t === 'hint') {
    const o = s.orders.find((x) => x.slot === a.slot);
    if (!o || o.hint >= hintMax(o)) return ev;
    const cost = hintCost(s);
    if (s.ink < cost) return ev;
    o.hint++;
    if (cost) spendInk(s, ev, cost);
    ev.push({ t: 'hint', order: { ...o } });
  } else {
    return ev;
  }
  post(s, ev);
  return ev;
}

/** 带悔笔的包装 */
export class Game {
  s: GameState;
  private snap: GameState | null = null;
  constructor(s: GameState) {
    this.s = s;
  }
  act(a: Action): GameEvent[] {
    if (a.t === 'undo') {
      if (!this.snap || this.s.undoLeft <= 0 || this.s.status !== 'play') return [];
      const left = this.s.undoLeft - 1;
      this.s = this.snap;
      this.s.undoLeft = left;
      this.snap = null;
      return [{ t: 'undo' }];
    }
    const before = cloneState(this.s);
    const ev = apply(this.s, a);
    const changed = ev.some((e) => e.t !== 'rejected');
    if (changed) this.snap = before;
    return ev;
  }
  canUndo(): boolean {
    return !!this.snap && this.s.undoLeft > 0 && this.s.status === 'play';
  }
}

export { BASE_MAP, CELLS };
