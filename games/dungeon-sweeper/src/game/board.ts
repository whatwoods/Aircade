import { CONFIG } from '../config';
import { Rng, hash01 } from '../core/rng';
import { Kind } from './types';

export const COLS = CONFIG.board.cols;
export const ROWS = CONFIG.board.rows;
export const N = COLS * ROWS;

export const idx = (x: number, y: number): number => y * COLS + x;
export const cx = (i: number): number => i % COLS;
export const cy = (i: number): number => (i / COLS) | 0;

const R = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export const inLair = (x: number, y: number): boolean => R(CONFIG.board.lair, x, y);
export const inEntrance = (x: number, y: number): boolean => R(CONFIG.board.entrance, x, y);

function rectDist(r: { x: number; y: number; w: number; h: number }, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w - 1));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h - 1));
  return Math.max(dx, dy);
}

/** 预计算邻接表：每格 8 个邻居，越界填 -1 */
export const NEIGHBORS = new Int16Array(N * 8).fill(-1);
export const LAIR_DIST = new Uint8Array(N);
export const ENT_DIST = new Uint8Array(N);
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const i = idx(x, y);
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) NEIGHBORS[i * 8 + k++] = idx(nx, ny);
      }
    }
    LAIR_DIST[i] = rectDist(CONFIG.board.lair, x, y);
    ENT_DIST[i] = rectDist(CONFIG.board.entrance, x, y);
  }
}
export const START_CELL = idx(CONFIG.board.startCell.x, CONFIG.board.startCell.y);

export interface BoardData {
  seed: number;
  regen: number;
  tutorial: boolean;
  kind: Uint8Array;
  level: Uint8Array;
  gold: Uint16Array;
  itemXp: Uint8Array;
  heal: Uint8Array;
  /** 视觉：烛台格 */
  candle: Uint8Array;
  /** 视觉：贴图变体 */
  variant: Uint8Array;
  counts: number[];
}

/**
 * 引导局底部固定布局（行 6–11）。'?' = 交给生成器；'#' = 龙巢；'E' = 入口；
 * '.' 空地；数字 = 怪物等级；P 血瓶；C 宝箱。见文档 §6.2。
 */
export const TUTORIAL_ROWS: Record<number, string> = {
  6: '??3###???',
  7: '11.....2.',
  8: '3....1.24',
  9: '..1.....3',
  10: 'P2.EEE...',
  11: '...EEE2.C',
};

function emptyBoard(seed: number, tutorial: boolean): BoardData {
  return {
    seed,
    regen: 0,
    tutorial,
    kind: new Uint8Array(N),
    level: new Uint8Array(N),
    gold: new Uint16Array(N),
    itemXp: new Uint8Array(N),
    heal: new Uint8Array(N),
    candle: new Uint8Array(N),
    variant: new Uint8Array(N),
    counts: new Array(10).fill(0),
  };
}

/** 模拟开局连锁，返回翻开格数（不含龙巢） */
export function simulateStartReveal(b: BoardData): number {
  const rev = new Uint8Array(N);
  const num = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (b.kind[i] !== Kind.Monster) continue;
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j >= 0) num[j] += b.level[i];
    }
  }
  const stack = [START_CELL];
  rev[START_CELL] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop()!;
    if (b.kind[i] === Kind.Monster || num[i] !== 0) continue;
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j < 0 || rev[j] || b.kind[j] === Kind.Lair) continue;
      rev[j] = 1;
      count++;
      stack.push(j);
    }
  }
  return count;
}

function generateOnce(seed: number, tutorial: boolean, attempt: number): BoardData {
  const rng = new Rng(seed * 7919 + attempt * 104729 + 17);
  const b = emptyBoard(seed, tutorial);
  const locked = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (inLair(cx(i), cy(i))) {
      b.kind[i] = Kind.Lair;
      locked[i] = 1;
    } else if (inEntrance(cx(i), cy(i))) locked[i] = 1;
  }
  const counts: Record<number, number> = { ...CONFIG.monsters.counts };
  let chestsLeft: number = CONFIG.items.chest.count;
  let potionsLeft: number = CONFIG.items.potion.count;

  if (tutorial) {
    for (const [l, d] of Object.entries(CONFIG.tutorial.countsDelta)) counts[+l] = Math.max(0, counts[+l] + d);
    for (const [rowS, str] of Object.entries(TUTORIAL_ROWS)) {
      const y = +rowS;
      for (let x = 0; x < COLS; x++) {
        const ch = str[x];
        const i = idx(x, y);
        if (ch === '?' || ch === '#') continue;
        locked[i] = 1;
        if (ch >= '1' && ch <= '9') {
          b.kind[i] = Kind.Monster;
          b.level[i] = +ch;
          counts[+ch] = Math.max(0, counts[+ch] - 1);
        } else if (ch === 'C') {
          b.kind[i] = Kind.Chest;
          chestsLeft--;
        } else if (ch === 'P') {
          b.kind[i] = Kind.Potion;
          potionsLeft--;
        }
      }
    }
  }

  const weights = new Float64Array(N);
  const pick = (fn: (i: number) => number): number => {
    let tot = 0;
    for (let i = 0; i < N; i++) {
      const w = locked[i] || b.kind[i] !== Kind.Empty ? 0 : fn(i);
      weights[i] = w;
      tot += w;
    }
    if (tot <= 0) return -1;
    let r = rng.next() * tot;
    for (let i = 0; i < N; i++) {
      if (weights[i] <= 0) continue;
      r -= weights[i];
      if (r <= 0) return i;
    }
    for (let i = N - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return -1;
  };

  const guard = CONFIG.monsters.entranceGuard;
  for (let L = 9; L >= 1; L--) {
    const band = CONFIG.monsters.bands[L];
    for (let k = 0; k < (counts[L] ?? 0); k++) {
      let i = pick((c) => {
        const d = LAIR_DIST[c];
        if (d < band.min || d > band.max) return 0;
        if (ENT_DIST[c] <= guard.radius && L > guard.maxLevel) return 0;
        return Math.pow(CONFIG.monsters.bandFalloff, Math.abs(d - band.pref));
      });
      if (i < 0) {
        // 兜底：放宽环带限制（仍遵守入口护卫）
        i = pick((c) => (ENT_DIST[c] <= guard.radius && L > guard.maxLevel ? 0 : 1));
      }
      if (i < 0) continue;
      b.kind[i] = Kind.Monster;
      b.level[i] = L;
    }
  }
  for (let k = 0; k < chestsLeft; k++) {
    const i = pick((c) => CONFIG.items.chest.weightByDist[LAIR_DIST[c]] ?? 0.2);
    if (i >= 0) b.kind[i] = Kind.Chest;
  }
  for (let k = 0; k < potionsLeft; k++) {
    const i = pick((c) => CONFIG.items.potion.weightByDist[LAIR_DIST[c]] ?? 0.5);
    if (i >= 0) b.kind[i] = Kind.Potion;
  }

  // 宝箱奖励：离龙越近越丰厚
  const chests: number[] = [];
  for (let i = 0; i < N; i++) if (b.kind[i] === Kind.Chest) chests.push(i);
  chests.sort((a, c) => LAIR_DIST[c] - LAIR_DIST[a] || a - c);
  const cg = CONFIG.items.chest.gold;
  const cxp = CONFIG.items.chest.xp;
  chests.forEach((i, r) => {
    b.gold[i] = cg[Math.min(r, cg.length - 1)];
    b.itemXp[i] = cxp[Math.min(r, cxp.length - 1)];
  });
  for (let i = 0; i < N; i++) if (b.kind[i] === Kind.Potion) b.heal[i] = CONFIG.items.potion.heal;

  // 视觉随机（稳定派生）
  for (let i = 0; i < N; i++) {
    b.variant[i] = Math.floor(hash01(seed, i * 3 + 1) * 12);
    if (b.kind[i] === Kind.Empty && !inEntrance(cx(i), cy(i)) && hash01(seed, i * 3 + 2) < CONFIG.board.candleChance)
      b.candle[i] = 1;
    if (b.kind[i] === Kind.Monster) b.counts[b.level[i]]++;
  }
  b.regen = attempt;
  return b;
}

export function generateBoard(seed: number, tutorial = false, startK = 0): BoardData {
  let last: BoardData | null = null;
  const [lo, hi] = CONFIG.board.initialRevealRange;
  for (let k = startK; k < startK + CONFIG.board.maxRegen; k++) {
    const b = generateOnce(seed, tutorial, k);
    last = b;
    if (tutorial) return b;
    const n = simulateStartReveal(b);
    if (n >= lo && n <= hi) return b;
  }
  return last!;
}
