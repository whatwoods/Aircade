// pnpm bot [局数=200] [起始种子=1]：贪心机器人从商店买装备、摆背包，完整打很多局，统计真实的通关率和每轮数据
// pnpm bot --blind 不偷看敌人。
// 和 pnpm balance 互补：balance 测手写的参考构筑，bot 测"按商店随机货品一路买下来"能走多远。
// 机器人的策略（每次整理阶段反复执行，直到没有更好的动作）：
//   1. 对每张买得起的商店卡：能合成就试合成；否则在背包里找加成最高的位置；背包放不下就试"卖掉一件再放"
//   2. 每个候选都对着本轮敌人真打一遍（模拟），选结果提升最大的那个
//   3. 有商店卡因为背包没位置放不下、钱又够：解锁一格（挑挨着开放格最多的）
//   4. 都没提升且钱多时刷新商店
// 轮间事件按固定优先级挑（见 pickEvent）。
// 它不会重新整理已经摆好的装备，所以比认真玩的人弱一些，可以看作"普通玩家"的下限。
import { BAG, ECONOMY, ROUNDS } from '../src/config.ts';
import { simulate } from '../src/game/battle/sim.ts';
import { enemyBag, enemyFor, playerMaxHp } from '../src/game/enemies.ts';
import { canPlace, buildOcc, DIRS, isOpen } from '../src/game/grid.ts';
import {
  applyChoice, applyResult, beginArrange, buy, smithTarget, cellPrice, mergeTargetFor, move, newRun, refresh, sell, startBattle, unlockable, unlockCell, type Dest,
} from '../src/game/run.ts';
import { computeSynergy } from '../src/game/synergy.ts';
import type { EventId, ItemInst, Placed, Rot, RunState } from '../src/game/types.ts';

const args = process.argv.slice(2);
/** --blind：不偷看敌人，只按背包强度粗估买（更像普通玩家）；默认对着本轮敌人真打来挑（接近上限） */
const BLIND = args.includes('--blind');
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const N = nums[0] ?? 200;
const SEED0 = nums[1] ?? 1;

/** 背包强度的粗估（选摆放位置用，比真打一遍快得多） */
function power(items: readonly Placed[], open: number): number {
  const syn = computeSynergy(items, BAG.cols, BAG.rows, open);
  let p = 0;
  for (const d of syn.derived.values()) {
    const rate = d.cd > 0 ? d.speedMul / d.cd : 0;
    if (d.tag === 'weapon') p += (d.dmg * d.hits + d.poison * 3) * rate + d.shieldOnHit * rate * 0.6;
    if (d.tag === 'armor') p += d.shield * rate * 0.6;
    if (d.tag === 'remedy') p += d.heal * rate * 0.8;
    p += d.startShield * 0.1 + d.reduce * 3 + d.lowHpHeal * 0.05 + d.reviveFrac * 10;
  }
  return p;
}

/** 对着本轮敌人真打：赢了 1 + 剩余生命比例，输了 = 打掉敌人生命的比例 */
function evaluate(run: RunState): number {
  if (BLIND) return power(run.bag, run.open);
  const e = enemyFor(run.round);
  const maxHp = playerMaxHp(run.round);
  const res = simulate(
    { items: run.bag, cols: BAG.cols, rows: BAG.rows, maxHp, open: run.open },
    { items: enemyBag(run.round), cols: e.cols, rows: e.rows, maxHp: e.hp, traits: e.traits },
  );
  return res.winner === 0 ? 1 + res.hpEnd[0] / maxHp : 1 - Math.max(0, res.hpEnd[1]) / e.hp;
}

/** 在背包里给一件新装备找加成最高的位置 */
function bestSpot(bag: readonly ItemInst[], open: number, id: Placed['id'], lv: Placed['lv']): Dest | null {
  const o = buildOcc(bag, BAG.cols, BAG.rows, open);
  let best: Dest | null = null;
  let bp = -1;
  const probe: Placed = { uid: -1, id, lv, rot: 0, x: 0, y: 0 };
  const list: Placed[] = [...bag, probe];
  for (let rot = 0 as Rot; rot < 4; rot = (rot + 1) as Rot) {
    for (let y = 0; y < BAG.rows; y++) {
      for (let x = 0; x < BAG.cols; x++) {
        if (!canPlace(o, id, rot, x, y)) continue;
        probe.rot = rot;
        probe.x = x;
        probe.y = y;
        const p = power(list, open);
        if (p > bp) {
          bp = p;
          best = { zone: 'bag', x, y, rot };
        }
      }
    }
  }
  return best;
}

type Action = { score: number; apply: (r: RunState) => void };

function arrange(run: RunState): void {
  for (let step = 0; step < 40; step++) {
    const base = evaluate(run);
    let best: Action | null = null;
    const consider = (apply: (r: RunState) => boolean): void => {
      const c = structuredClone(run);
      if (!apply(c)) return;
      const s = evaluate(c);
      if (!best || s > best.score) best = { score: s, apply: (r) => void apply(r) };
    };
    run.shop.forEach((slot, i) => {
      if (!slot.id || slot.price > run.gold) return;
      const id = slot.id;
      const mt = mergeTargetFor(run, id, 1);
      if (mt) consider((r) => buy(r, i, { zone: 'merge', uid: mt.uid }).ok);
      const spot = bestSpot(run.bag, run.open, id, 1);
      if (spot) consider((r) => buy(r, i, spot).ok);
      else {
        // 背包满：试着卖掉一件再放
        for (const old of run.bag) {
          consider((r) => {
            if (!sell(r, old.uid, 0)) return false;
            const sp = bestSpot(r.bag, r.open, id, 1);
            return !!sp && r.gold >= slot.price && buy(r, i, sp).ok;
          });
        }
      }
    });
    // 桌边的装备能合成就合成（★★ 拿去合成 ★★★）
    for (const it of run.stash) {
      if (!it) continue;
      const mt = mergeTargetFor(run, it.id, it.lv, it.uid);
      if (mt && mt.zone === 'bag') {
        const uid = it.uid;
        consider((r) => move(r, uid, { zone: 'merge', uid: mt.uid }).ok);
      }
    }
    const pick = best as Action | null;
    if (pick && pick.score > base + (BLIND ? 0.01 : 0.005)) {
      pick.apply(run);
      continue;
    }
    // 有放不下的卡：解锁一格
    const unfit = run.shop.filter((s) => s.id && !mergeTargetFor(run, s.id, 1) && !bestSpot(run.bag, run.open, s.id, 1));
    const cheapest = Math.min(...unfit.map((s) => s.price));
    const free = buildOcc(run.bag, BAG.cols, BAG.rows, run.open).cells.filter((c) => c === 0).length;
    if ((unfit.length && run.gold >= cellPrice(run) + cheapest) || (free <= 1 && run.gold >= cellPrice(run) + 3)) {
      const cells = unlockable(run);
      const near = ([x, y]: [number, number]): number =>
        DIRS.filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < BAG.cols && y + dy < BAG.rows && isOpen(run.open, BAG.cols, x + dx, y + dy)).length;
      cells.sort((a, b) => near(b) - near(a));
      if (cells.length && unlockCell(run, cells[0][0], cells[0][1]).ok) continue;
    }
    // 没有更好的买法：钱多就刷新
    if (run.gold >= ECONOMY.refreshCost + 5 && refresh(run)) continue;
    break;
  }
}

/** 轮间事件：缺心先回血；有贵装备就锻造；上一场赢得轻松就打精英；其余按裁缝 > 黑市 > 藏宝 */
function pickEvent(run: RunState, opts: EventId[]): EventId {
  const score = (id: EventId): number => {
    switch (id) {
      case 'rest': return run.hearts <= 1 ? 100 : 30;
      case 'smith': return (smithTarget(run)?.value ?? 0) * 4;
      case 'elite': return run.lastHpRatio > 0.6 ? 45 : 0;
      case 'tailor': return 35;
      case 'market': return run.round >= 4 ? 32 : 10;
      case 'cache': return 25;
    }
  };
  return opts.reduce((a, b) => (score(b) > score(a) ? b : a));
}
const picks = new Map<EventId, number>();

interface RoundStat {
  reach: number;
  firstWin: number;
  attempts: number;
  hpWin: number;
  wins: number;
  dur: number;
  items: number;
  cells: number;
  lv2: number;
  lv3: number;
  goldLeft: number;
  open: number;
}
const stats: RoundStat[] = Array.from({ length: ROUNDS + 1 }, () => ({
  reach: 0, firstWin: 0, attempts: 0, hpWin: 0, wins: 0, dur: 0, items: 0, cells: 0, lv2: 0, lv3: 0, goldLeft: 0, open: 0,
}));
let clears = 0;
let scoreSum = 0;
const diedAt: number[] = new Array(ROUNDS + 1).fill(0);

for (let n = 0; n < N; n++) {
  const run = newRun(SEED0 + n, false);
  let counted = 0;
  for (;;) {
    beginArrange(run);
    arrange(run);
    const st = stats[run.round];
    if (counted !== run.round) {
      counted = run.round;
      st.reach++;
    }
    st.attempts++;
    const round = run.round;
    const attempt = run.attempt;
    const res = startBattle(run);
    const out = applyResult(run, res);
    if (out.win) {
      st.wins++;
      if (attempt === 1) st.firstWin++;
      st.hpWin += res.hpEnd[0] / res.maxHp[0];
      st.dur += res.duration;
      st.items += run.bag.length;
      st.cells += buildOcc(run.bag, BAG.cols, BAG.rows).cells.filter((c) => c !== 0).length;
      st.open += BAG.start.w * BAG.start.h + run.unlocked;
      st.lv2 += run.bag.filter((i) => i.lv === 2).length;
      st.lv3 += run.bag.filter((i) => i.lv === 3).length;
      st.goldLeft += run.gold;
    }
    if (run.choice) {
      const id = pickEvent(run, run.choice);
      picks.set(id, (picks.get(id) ?? 0) + 1);
      applyChoice(run, id);
    }
    if (out.ending) {
      if (run.cleared) clears++;
      else diedAt[round]++;
      scoreSum += run.score;
      break;
    }
  }
}

const pct = (a: number, b: number): string => (b ? Math.round((a / b) * 100) + '%' : '-');
const avg = (a: number, b: number, d = 1): string => (b ? (a / b).toFixed(d) : '-');
console.log(`机器人${BLIND ? '（不看敌人）' : ''} ${N} 局（种子 ${SEED0}–${SEED0 + N - 1}）  通关 ${pct(clears, N)}  平均分 ${Math.round(scoreSum / N)}`);
console.log('轮  到达   首战胜  平均挑战  赢时剩血  用时s  件数  占格  开放  ★★   ★★★  剩金  死在这轮');
for (let r = 1; r <= ROUNDS; r++) {
  const s = stats[r];
  console.log(
    [
      String(r).padEnd(3), pct(s.reach, N).padEnd(6), pct(s.firstWin, s.reach).padEnd(7), avg(s.attempts, s.reach, 2).padEnd(9),
      pct(s.hpWin, s.wins).padEnd(9), avg(s.dur, s.wins).padEnd(6), avg(s.items, s.wins).padEnd(5), avg(s.cells, s.wins).padEnd(5), avg(s.open, s.wins).padEnd(5),
      avg(s.lv2, s.wins).padEnd(5), avg(s.lv3, s.wins, 2).padEnd(6), avg(s.goldLeft, s.wins).padEnd(5), String(diedAt[r]),
    ].join(' '),
  );
}
console.log('轮间事件选择：' + [...picks].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));
