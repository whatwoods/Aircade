// 一局的状态与所有规则操作（纯逻辑，无 DOM）
import { BAG, ECONOMY, ITEMS, PLAYER, ROUNDS, SCORE, SHOP } from '../config.ts';
import { simulate } from './battle/sim.ts';
import { receiptFor, sellPrice, type ReceiptLine } from './economy.ts';
import { enemyBag, enemyFor, playerMaxHp } from './enemies.ts';
import { buildOcc, canPlace, findFit, NUDGES, type Occ } from './grid.ts';
import { winScore } from './score.ts';
import { rollShop } from './shop.ts';
import { shapeOf } from './shapes.ts';
import type { BattleResult, ItemId, ItemInst, Lv, Rot, RunState } from './types.ts';

export function newRun(seed: number, tutorial: boolean): RunState {
  return {
    seed, round: 1, attempt: 1, hearts: PLAYER.hearts, gold: 0, score: 0, phase: 'receipt',
    bag: [], stash: new Array<ItemInst | null>(SHOP.stashSlots).fill(null), shop: [], locked: false,
    refreshIndex: 0, phaseStamp: 0, lastResult: null, pouchGold: 0, savedGold: 0, lastHpRatio: 0,
    tutorial, cleared: false, stats: { bestHit: 0, merges: 0, spent: 0, roundScores: [], wins: 0 }, nextUid: 1,
  };
}

/** 进入整理阶段：发收入、掷商店。返回账单行 */
export function beginArrange(run: RunState): ReceiptLine[] {
  run.phaseStamp++;
  run.refreshIndex = 0;
  const lines = receiptFor(run);
  if (run.round === 1 && run.attempt === 1) run.gold = ECONOMY.startGold;
  else for (const l of lines) run.gold += l.amount;
  run.shop = run.locked && run.shop.length ? rollShop(run, run.shop) : rollShop(run);
  run.pouchGold = 0;
  run.savedGold = 0;
  run.phase = 'arrange';
  return lines;
}

export function bagOcc(run: RunState): Occ {
  return buildOcc(run.bag, BAG.cols, BAG.rows);
}

export function find(run: RunState, uid: number): ItemInst | null {
  for (const it of run.bag) if (it.uid === uid) return it;
  for (const it of run.stash) if (it && it.uid === uid) return it;
  return null;
}

function detach(run: RunState, it: ItemInst): void {
  if (it.zone === 'bag') {
    const i = run.bag.indexOf(it);
    if (i >= 0) run.bag.splice(i, 1);
  } else if (run.stash[it.slot] === it) run.stash[it.slot] = null;
}

function makeInst(run: RunState, id: ItemId, lv: Lv, value: number): ItemInst {
  return { uid: run.nextUid++, id, lv, rot: 0, zone: 'stash', x: 0, y: 0, slot: 0, value, boughtStamp: run.phaseStamp };
}

export type Dest =
  | { zone: 'bag'; x: number; y: number; rot: Rot }
  | { zone: 'stash'; slot: number; rot?: Rot }
  | { zone: 'merge'; uid: number };

export type OpResult = { ok: true; uid: number } | { ok: false; reason: string };

export function canMerge(a: { id: ItemId; lv: Lv }, b: ItemInst): 'ok' | 'level' | 'max' | 'name' {
  if (a.id !== b.id) return 'name';
  if (b.lv >= 3) return 'max';
  if (a.lv !== b.lv) return 'level';
  return 'ok';
}

function putAt(run: RunState, it: ItemInst, dest: Dest): OpResult {
  if (dest.zone === 'bag') {
    const o = bagOcc(run);
    if (!canPlace(o, it.id, dest.rot, dest.x, dest.y, it.uid)) return { ok: false, reason: '放不下' };
    detach(run, it);
    it.zone = 'bag';
    it.x = dest.x;
    it.y = dest.y;
    it.rot = dest.rot;
    run.bag.push(it);
    return { ok: true, uid: it.uid };
  }
  if (dest.zone === 'stash') {
    const cur = run.stash[dest.slot];
    if (dest.slot < 0 || dest.slot >= run.stash.length) return { ok: false, reason: '无效位置' };
    if (cur && cur !== it) {
      if (it.zone !== 'stash' || run.stash[it.slot] !== it) return { ok: false, reason: '桌边已占用' };
      // 桌边内互换
      const from = it.slot;
      run.stash[from] = cur;
      cur.slot = from;
    } else detach(run, it);
    it.zone = 'stash';
    it.slot = dest.slot;
    if (dest.rot !== undefined) it.rot = dest.rot;
    run.stash[dest.slot] = it;
    return { ok: true, uid: it.uid };
  }
  const tgt = find(run, dest.uid);
  if (!tgt || tgt === it) return { ok: false, reason: '目标不存在' };
  const m = canMerge(it, tgt);
  if (m !== 'ok') return { ok: false, reason: m === 'max' ? '已满级' : m === 'level' ? '需要同等级' : '名称不同' };
  detach(run, it);
  tgt.lv = (tgt.lv + 1) as Lv;
  tgt.value += it.value;
  if (it.boughtStamp !== tgt.boughtStamp) tgt.boughtStamp = 0;
  run.stats.merges++;
  return { ok: true, uid: tgt.uid };
}

export function move(run: RunState, uid: number, dest: Dest): OpResult {
  if (run.phase !== 'arrange') return { ok: false, reason: '只能在整理阶段操作' };
  const it = find(run, uid);
  if (!it) return { ok: false, reason: '装备不存在' };
  return putAt(run, it, dest);
}

export function buy(run: RunState, slot: number, dest: Dest): OpResult {
  if (run.phase !== 'arrange') return { ok: false, reason: '只能在整理阶段操作' };
  const s = run.shop[slot];
  if (!s || !s.id) return { ok: false, reason: '已售出' };
  if (run.gold < s.price) return { ok: false, reason: '金币不足' };
  const it = makeInst(run, s.id, 1, s.price);
  it.zone = 'stash';
  it.slot = -1;
  const r = putAt(run, it, dest);
  if (!r.ok) {
    run.nextUid--;
    return r;
  }
  run.gold -= s.price;
  run.stats.spent += s.price;
  run.shop[slot] = { id: null, price: 0 };
  return r;
}

/** 轻点购买：优先合成（背包里优先），否则放进第一个空的桌边槽 */
export function quickBuyDest(run: RunState, slot: number, merge: boolean): Dest | null {
  const s = run.shop[slot];
  if (!s || !s.id) return null;
  if (merge) {
    const t = mergeTargetFor(run, s.id, 1);
    if (t) return { zone: 'merge', uid: t.uid };
  }
  const free = run.stash.findIndex((x) => x === null);
  if (free < 0) return null;
  return { zone: 'stash', slot: free };
}

export function mergeTargetFor(run: RunState, id: ItemId, lv: Lv, exclude = 0): ItemInst | null {
  for (const it of run.bag) if (it.uid !== exclude && it.id === id && it.lv === lv && it.lv < 3) return it;
  for (const it of run.stash) if (it && it.uid !== exclude && it.id === id && it.lv === lv && it.lv < 3) return it;
  return null;
}

export interface SellRecord {
  inst: ItemInst;
  zone: 'bag' | 'stash';
  x: number;
  y: number;
  rot: Rot;
  slot: number;
  price: number;
  at: number;
}

export function sellValue(run: RunState, it: ItemInst): number {
  return sellPrice(it.value, it.boughtStamp, run.phaseStamp);
}

export function sell(run: RunState, uid: number, now: number): SellRecord | null {
  if (run.phase !== 'arrange') return null;
  const it = find(run, uid);
  if (!it) return null;
  const price = sellValue(run, it);
  const rec: SellRecord = { inst: it, zone: it.zone, x: it.x, y: it.y, rot: it.rot, slot: it.slot, price, at: now };
  detach(run, it);
  run.gold += price;
  return rec;
}

export function undoSell(run: RunState, rec: SellRecord): OpResult {
  if (run.phase !== 'arrange') return { ok: false, reason: '只能在整理阶段操作' };
  if (run.gold < rec.price) return { ok: false, reason: '金币不足' };
  const it = rec.inst;
  let r: OpResult = { ok: false, reason: '没有空位' };
  it.zone = 'stash';
  it.slot = -1;
  if (rec.zone === 'bag') r = putAt(run, it, { zone: 'bag', x: rec.x, y: rec.y, rot: rec.rot });
  else if (!run.stash[rec.slot]) r = putAt(run, it, { zone: 'stash', slot: rec.slot });
  if (!r.ok) {
    const fit = findFit(bagOcc(run), it.id, rec.rot);
    if (fit) r = putAt(run, it, { zone: 'bag', ...fit });
    else {
      const free = run.stash.findIndex((x) => x === null);
      if (free >= 0) r = putAt(run, it, { zone: 'stash', slot: free });
    }
  }
  if (r.ok) run.gold -= rec.price;
  return r;
}

/** 原地旋转（背包内会尝试小幅平移） */
export function rotateInPlace(run: RunState, uid: number): { ok: boolean; dx: number; dy: number } {
  const it = find(run, uid);
  if (!it || run.phase !== 'arrange') return { ok: false, dx: 0, dy: 0 };
  const nr = ((it.rot + 1) % 4) as Rot;
  if (it.zone === 'stash') {
    it.rot = nr;
    return { ok: true, dx: 0, dy: 0 };
  }
  const o = bagOcc(run);
  // 以质心为中心旋转：先算出旋转后让中心尽量不动的偏移
  const s0 = shapeOf(it.id, it.rot);
  const s1 = shapeOf(it.id, nr);
  const bx = it.x + Math.round((s0.w - s1.w) / 2);
  const by = it.y + Math.round((s0.h - s1.h) / 2);
  for (const [dx, dy] of NUDGES) {
    if (canPlace(o, it.id, nr, bx + dx, by + dy, it.uid)) {
      const ox = it.x;
      const oy = it.y;
      it.rot = nr;
      it.x = bx + dx;
      it.y = by + dy;
      return { ok: true, dx: it.x - ox, dy: it.y - oy };
    }
  }
  return { ok: false, dx: 0, dy: 0 };
}

export function refresh(run: RunState): boolean {
  if (run.phase !== 'arrange' || run.gold < ECONOMY.refreshCost) return false;
  run.gold -= ECONOMY.refreshCost;
  run.refreshIndex++;
  run.locked = false;
  run.shop = rollShop(run);
  return true;
}

export function hasWeapon(run: RunState): boolean {
  return run.bag.some((it) => ITEMS[it.id].tag === 'weapon');
}

export function startBattle(run: RunState): BattleResult {
  run.savedGold = run.gold;
  let pouch = 0;
  for (const it of run.bag) if (it.id === 'pouch') pouch += ITEMS.pouch.lv[it.lv - 1].gold ?? 0;
  run.pouchGold = pouch;
  const e = enemyFor(run.round);
  const res = simulate(
    { items: run.bag, cols: BAG.cols, rows: BAG.rows, maxHp: playerMaxHp(run.round) },
    { items: enemyBag(run.round), cols: e.cols, rows: e.rows, maxHp: e.hp, traits: e.traits },
  );
  run.phase = 'battle';
  return res;
}

export interface Outcome {
  win: boolean;
  gain: number;
  ending: boolean;
  clearBonus: number;
}

export function applyResult(run: RunState, res: BattleResult): Outcome {
  run.stats.bestHit = Math.max(run.stats.bestHit, res.bestHit);
  const win = res.winner === 0;
  let gain = 0;
  let ending = false;
  let clearBonus = 0;
  if (win) {
    const ratio = res.hpEnd[0] / res.maxHp[0];
    run.lastHpRatio = ratio;
    gain = winScore(run.round, ratio);
    run.score += gain;
    run.stats.roundScores.push(gain);
    run.stats.wins++;
    run.lastResult = 'win';
    if (run.round >= ROUNDS) {
      run.cleared = true;
      clearBonus = SCORE.clearBonus + SCORE.heartBonus * run.hearts;
      run.score += clearBonus;
      ending = true;
    } else {
      run.round++;
      run.attempt = 1;
    }
  } else {
    run.hearts--;
    run.lastResult = 'loss';
    run.attempt++;
    if (run.hearts <= 0) ending = true;
  }
  run.phase = ending ? 'ending' : 'result';
  return { win, gain, ending, clearBonus };
}

/** 调试：直接放置/给予 */
export function giveItem(run: RunState, id: ItemId, lv: Lv, where: 'stash' | 'bag' | { x: number; y: number; rot?: Rot }): OpResult {
  const it = makeInst(run, id, lv, ITEMS[id].price * (lv === 1 ? 1 : lv === 2 ? 2 : 4));
  it.boughtStamp = 0;
  it.slot = -1;
  let r: OpResult;
  if (where === 'stash') {
    const free = run.stash.findIndex((x) => x === null);
    r = free < 0 ? { ok: false, reason: '桌边已满' } : putAt(run, it, { zone: 'stash', slot: free });
  } else if (where === 'bag') {
    const fit = findFit(bagOcc(run), id, 0);
    r = fit ? putAt(run, it, { zone: 'bag', ...fit }) : { ok: false, reason: '背包已满' };
  } else r = putAt(run, it, { zone: 'bag', x: where.x, y: where.y, rot: where.rot ?? 0 });
  if (!r.ok) run.nextUid--;
  return r;
}
