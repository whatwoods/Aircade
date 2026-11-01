import { CONFIG } from '../config.ts';
import { N, NEIGHBORS } from './board.ts';
import { type BlessId, chestXpOf, killXpOf, potionHealOf } from './blessings.ts';
import type { Game } from './rules.ts';
import { Kind } from './types.ts';

/**
 * 只看可见信息的求解机器人（生成期校验用，文档 §3.7 / §11）。
 * 约束：每个已翻开的信息格「周围暗砖等级和 = 数字」，外加全局剩余数量上限。
 * 回溯枚举前沿格的可能等级集合（节点上限），据此选择：确定安全 → 升级型宝箱 →
 * 已知且可活的升级怪 → 必活探索 → 血瓶 / 宝箱 → 被迫猜测。
 * 「被迫猜测且可能致死」记为一次致命猜测。
 */

let MAX_NODES: number = CONFIG.solver.maxNodes;

// 复用缓冲（生成期在主线程同步运行，避免大量分配）
const frontier = new Int16Array(N);
const inF = new Uint8Array(N);
const bound = new Uint8Array(N);
const val = new Int8Array(N);
const possMask = new Uint16Array(N);
const consStart = new Int16Array(N + 1);
const consCells = new Int16Array(N * 8);
const consSum = new Int16Array(N);
const consOfStart = new Int16Array(N + 1);
const consOfList = new Int16Array(N * 8);
const used = new Int16Array(10);
const comp = new Int16Array(N);
const fIndex = new Int16Array(N);

interface Analysis {
  count: number;
  capped: boolean;
}

function analyze(g: Game): Analysis {
  const kind = g.b.kind;
  // 约束
  let nc = 0;
  let ncCells = 0;
  inF.fill(0);
  let nf = 0;
  for (let i = 0; i < N; i++) {
    if (!g.revealed[i] || kind[i] === Kind.Lair) continue;
    const s0 = ncCells;
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j < 0 || g.revealed[j]) continue;
      consCells[ncCells++] = j;
      if (!inF[j]) {
        inF[j] = 1;
        fIndex[j] = nf;
        frontier[nf++] = j;
        bound[j] = 9;
      }
    }
    if (ncCells === s0) continue;
    consStart[nc] = s0;
    consSum[nc] = g.number[i];
    nc++;
  }
  consStart[nc] = ncCells;
  for (let c = 0; c < nc; c++)
    for (let p = consStart[c]; p < consStart[c + 1]; p++) {
      const j = consCells[p];
      if (consSum[c] < bound[j]) bound[j] = consSum[c];
    }
  // 每格所属约束
  let q = 0;
  for (let a = 0; a < nf; a++) {
    const cell = frontier[a];
    consOfStart[a] = q;
    for (let c = 0; c < nc; c++)
      for (let p = consStart[c]; p < consStart[c + 1]; p++)
        if (consCells[p] === cell) {
          consOfList[q++] = c;
          break;
        }
  }
  consOfStart[nf] = q;
  // 拆成互不相连的连通块（共享约束的格相连），分别回溯：搜索量从乘积降为求和
  for (let a = 0; a < nf; a++) {
    possMask[frontier[a]] = 0;
    val[frontier[a]] = -1;
    comp[a] = a;
  }
  const find = (x: number): number => {
    while (comp[x] !== x) {
      comp[x] = comp[comp[x]];
      x = comp[x];
    }
    return x;
  };
  for (let c = 0; c < nc; c++) {
    const r0 = find(fIndex[consCells[consStart[c]]]);
    for (let p = consStart[c] + 1; p < consStart[c + 1]; p++) {
      const r = find(fIndex[consCells[p]]);
      if (r !== r0) comp[r] = r0;
    }
  }
  let capped = false;
  const ok = (c: number): boolean => {
    let s = 0;
    let open = 0;
    let maxRest = 0;
    for (let p = consStart[c]; p < consStart[c + 1]; p++) {
      const j = consCells[p];
      if (val[j] >= 0) s += val[j];
      else {
        open++;
        maxRest += bound[j];
      }
    }
    if (s > consSum[c]) return false;
    if (open === 0) return s === consSum[c];
    return s + maxRest >= consSum[c];
  };
  const order: number[] = [];
  let nodes = 0;
  let compCapped = false;
  const rec = (d: number): void => {
    if (++nodes > MAX_NODES) {
      compCapped = true;
      return;
    }
    if (d === order.length) {
      for (const a of order) possMask[frontier[a]] |= 1 << val[frontier[a]];
      return;
    }
    const a = order[d];
    const cell = frontier[a];
    const b = bound[cell];
    const kv = g.known[cell];
    for (let v = 0; v <= b; v++) {
      if (v > 0 && used[v] >= g.alive[v]) continue;
      if (kv && v !== kv) continue;
      val[cell] = v;
      if (v) used[v]++;
      let good = true;
      for (let p = consOfStart[a]; p < consOfStart[a + 1]; p++)
        if (!ok(consOfList[p])) {
          good = false;
          break;
        }
      if (good) rec(d + 1);
      if (v) used[v]--;
      val[cell] = -1;
      if (compCapped) return;
    }
  };
  for (let root = 0; root < nf; root++) {
    if (find(root) !== root) continue;
    order.length = 0;
    for (let a = 0; a < nf; a++) if (find(a) === root) order.push(a);
    order.sort((x, y) => bound[frontier[x]] - bound[frontier[y]]);
    used.fill(0);
    nodes = 0;
    compCapped = false;
    rec(0);
    if (compCapped) {
      capped = true;
      for (const a of order) possMask[frontier[a]] = (1 << (bound[frontier[a]] + 1)) - 1;
    }
  }
  return { count: nf, capped };
}

const maxOf = (m: number): number => 31 - Math.clz32(m || 1);
const minOf = (m: number): number => (m ? 31 - Math.clz32(m & -m) : 0);
const single = (m: number): boolean => m !== 0 && (m & (m - 1)) === 0;

export interface SolveResult {
  won: boolean;
  /** 被迫且可能致死的猜测次数 */
  deadly: number;
  actions: number;
}

/** 机器人画像（pnpm sim 用来模拟不同水平的玩家；生成期校验用默认值） */
export interface BotOpts {
  /** 每次回溯分析的节点上限：越小推理越浅，超限的连通块只剩「上限」信息 */
  maxNodes: number;
  /** 每步随手点开一个「不一定致死」的前沿格的概率（误读数字） */
  slip: number;
  /** 每步计入的游戏时长（模拟迅捷分） */
  msPerAction?: number;
  /** 最低挑战血量（不同难度不同） */
  minHp: number;
  /** 血量 ≥ stopHp 时立刻屠龙；之前继续清图，无必活动作且够血时也屠龙（贪心程度，≥ minHp） */
  stopHp: number;
  /** slip 用的随机数 [0,1) */
  rand?: () => number;
  /** 祝福偏好（靠前的先选）；不给则从候选里随机选 */
  blessPref?: readonly BlessId[];
}

/** 模拟默认的祝福偏好：先保命、再省经验、最后要分 */
export const BLESS_PREF: readonly BlessId[] = ['leech', 'berserk', 'alchemy', 'vigor', 'undying', 'armor', 'butcher', 'greed', 'insight', 'bounty'];
/** 推理无误的玩家不缺生存：优先无代价的赏金 / 洞察，其次不动生命上限、不废血瓶的 */
export const BLESS_PREF_EXPERT: readonly BlessId[] = ['bounty', 'insight', 'alchemy', 'butcher', 'armor', 'greed', 'vigor', 'berserk', 'leech', 'undying'];

const BOT_DEFAULT: BotOpts = { maxNodes: CONFIG.solver.maxNodes, slip: 0, minHp: 0, stopHp: 0 };

/** 用默认（专家、够血即屠龙）机器人把一局下完（会修改传入的 Game） */
export function solveGame(g: Game, maxNodes: number = CONFIG.solver.maxNodes, minHp: number = g.diff.minHp): SolveResult {
  return playBot(g, { ...BOT_DEFAULT, maxNodes, minHp, stopHp: minHp });
}

export function playBot(g: Game, o: BotOpts): SolveResult {
  MAX_NODES = o.maxNodes;
  g.start();
  let deadly = 0;
  let actions = 0;
  const lair = g.lairCell();
  const rand = o.rand ?? Math.random;
  for (let step = 0; step < 400 && g.phase === 'playing'; step++) {
    actions++;
    g.timeMs += o.msPerAction ?? 0;
    if (g.offer) {
      const offer = g.offer;
      const id = o.blessPref ? (o.blessPref.find((b) => offer.includes(b)) ?? offer[0]) : offer[Math.floor(rand() * offer.length)];
      g.chooseBlessing(id);
      continue;
    }
    const p = g.player;
    const dmg = (v: number) => g.damageOf(v);
    const ready = p.hp >= o.minHp;
    if (ready && p.hp >= o.stopHp) {
      g.tap(lair, true);
      continue;
    }
    const { count } = analyze(g);
    const xpLeft = g.xpToNext - p.xp;
    let pick = -1;
    // 0. 失手：随手点开一个不一定致死的前沿格
    if (o.slip > 0 && count > 0 && rand() < o.slip) {
      const cand: number[] = [];
      for (let a = 0; a < count; a++) if (dmg(minOf(possMask[frontier[a]])) < p.hp) cand.push(frontier[a]);
      if (cand.length) pick = cand[Math.floor(rand() * cand.length)];
    }
    // 1. 必定为空
    for (let a = 0; a < count && pick < 0; a++) if (possMask[frontier[a]] === 1) pick = frontier[a];
    // 2. 能升级的宝箱（未满血时）
    if (pick < 0 && p.hp < p.maxHp)
      for (let i = 0; i < N && pick < 0; i++)
        if (g.revealed[i] && !g.collected[i] && g.b.kind[i] === Kind.Chest && chestXpOf(g.has, g.b.itemXp[i]) >= xpLeft) pick = i;
    // 3. 已知、可活且能升级的怪（取最大）
    if (pick < 0) {
      let best = -1;
      for (let a = 0; a < count; a++) {
        const m = possMask[frontier[a]];
        if (!single(m)) continue;
        const v = minOf(m);
        if (v > 0 && dmg(v) < p.hp && killXpOf(g.has, v) >= xpLeft && v > best) {
          best = v;
          pick = frontier[a];
        }
      }
    }
    // 4. 必活探索：上限最小，优先可能为 0 的
    if (pick < 0) {
      let bs = 1e9;
      for (let a = 0; a < count; a++) {
        const m = possMask[frontier[a]];
        const mx = maxOf(m);
        if (dmg(mx) >= p.hp) continue;
        const sc = mx * 2 + (m & 1 ? 0 : 1);
        if (sc < bs) {
          bs = sc;
          pick = frontier[a];
        }
      }
    }
    // 5. 血瓶 / 宝箱
    if (pick < 0)
      for (let i = 0; i < N && pick < 0; i++) {
        if (!g.revealed[i] || g.collected[i]) continue;
        if (g.b.kind[i] === Kind.Potion && p.hp < p.maxHp && potionHealOf(g.has, g.b.heal[i]) > 0) pick = i;
      }
    if (pick < 0)
      for (let i = 0; i < N && pick < 0; i++) if (g.revealed[i] && !g.collected[i] && g.b.kind[i] === Kind.Chest) pick = i;
    if (pick < 0 && ready) {
      g.tap(lair, true);
      continue;
    }
    // 6. 被迫猜测
    if (pick < 0) {
      let bs = 1e9;
      for (let a = 0; a < count; a++) {
        const m = possMask[frontier[a]];
        const sc = maxOf(m) + (m & 1 ? 0 : 5);
        if (sc < bs) {
          bs = sc;
          pick = frontier[a];
        }
      }
      if (pick < 0 || bs >= 9)
        for (let i = 0; i < N; i++)
          if (!g.revealed[i] && !inF[i]) {
            pick = i;
            bs = 9;
            break;
          }
      if (pick < 0) break;
      if (dmg(Math.min(bs, 9)) >= p.hp) deadly++;
    }
    g.tap(pick, true);
  }
  return { won: g.phase === 'won', deadly, actions };
}
