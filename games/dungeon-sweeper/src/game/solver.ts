import { CONFIG } from '../config';
import { N, NEIGHBORS } from './board';
import type { Game } from './rules';
import { Kind } from './types';

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
    for (let v = 0; v <= b; v++) {
      if (v > 0 && used[v] >= g.alive[v]) continue;
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

/** 用机器人把一局下完（会修改传入的 Game） */
export function solveGame(g: Game, maxNodes: number = CONFIG.solver.maxNodes): SolveResult {
  MAX_NODES = maxNodes;
  g.start();
  let deadly = 0;
  let actions = 0;
  const lair = g.lairCell();
  for (let step = 0; step < 400 && g.phase === 'playing'; step++) {
    actions++;
    const p = g.player;
    if (p.hp >= CONFIG.dragon.minHpToChallenge) {
      g.tap(lair, true);
      continue;
    }
    const { count } = analyze(g);
    const xpLeft = g.xpToNext - p.xp;
    let pick = -1;
    // 1. 必定为空
    for (let a = 0; a < count && pick < 0; a++) if (possMask[frontier[a]] === 1) pick = frontier[a];
    // 2. 能升级的宝箱（未满血时）
    if (pick < 0 && p.hp < p.maxHp)
      for (let i = 0; i < N && pick < 0; i++)
        if (g.revealed[i] && !g.collected[i] && g.b.kind[i] === Kind.Chest && g.b.itemXp[i] >= xpLeft) pick = i;
    // 3. 已知、可活且能升级的怪（取最大）
    if (pick < 0) {
      let best = -1;
      for (let a = 0; a < count; a++) {
        const m = possMask[frontier[a]];
        if (!single(m)) continue;
        const v = minOf(m);
        if (v > 0 && v < p.hp && v >= xpLeft && v > best) {
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
        if (mx >= p.hp) continue;
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
        if (g.b.kind[i] === Kind.Potion && p.hp < p.maxHp) pick = i;
      }
    if (pick < 0)
      for (let i = 0; i < N && pick < 0; i++) if (g.revealed[i] && !g.collected[i] && g.b.kind[i] === Kind.Chest) pick = i;
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
      if (bs >= p.hp) deadly++;
    }
    g.tap(pick, true);
  }
  return { won: g.phase === 'won', deadly, actions };
}
