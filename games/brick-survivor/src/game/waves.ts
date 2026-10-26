// Wave table lookup + row generation with patterns and special-brick limits (docs §3.6).
import { config } from '../config';
import type { BossKind, BrickType } from '../types';
import type { Game } from './game';

const W = config.waves;
const G = config.grid;

type PatternId = keyof typeof W.patterns;
const PATTERNS = Object.keys(W.patterns) as PatternId[];

export class Waves {
  pattern: PatternId = 'random';
  private hpCache = new Map<number, number>();
  constructor(private g: Game) {}

  baseHp(w: number): number {
    if (w <= 20) return Math.round(W.hpBase * Math.pow(W.hpGrowth, w - 1));
    const c = this.hpCache.get(w);
    if (c !== undefined) return c;
    const v = Math.round(this.baseHp(w - 1) * W.hpGrowth * W.endless.extraGrowth);
    this.hpCache.set(w, v);
    return v;
  }
  density(w: number): number {
    return Math.min(W.densityMax, W.densityBase + W.densityStep * (w - 1));
  }
  rows(w: number): number {
    if (w <= 20) return W.table[w - 1]?.rows ?? W.endless.rows;
    return W.endless.rows;
  }
  beats(w: number): number {
    if (w <= 20) return W.table[w - 1]?.beats ?? W.endless.beats;
    return w >= W.endless.lateFrom ? W.endless.beatsLate : W.endless.beats;
  }
  elites(w: number): number {
    if (w <= 20) return W.table[w - 1]?.elites ?? 2;
    return 2;
  }
  bossOf(w: number): BossKind | null {
    if (w <= 20) return W.table[w - 1]?.boss ?? null;
    if (w % 5 !== 0) return null;
    const order: BossKind[] = ['monolith', 'pulsar', 'serpent', 'omega'];
    return order[((w / 5 - 1) % 4 + 4) % 4] ?? 'monolith';
  }
  bossIndex(w: number): number {
    const k = this.bossOf(w);
    return k === 'monolith' ? 1 : k === 'pulsar' ? 2 : k === 'serpent' ? 3 : 4;
  }
  endlessRound(w: number): number {
    return w <= 20 ? 0 : Math.floor((w - 1) / 20);
  }

  pickPattern(w: number): void {
    const rng = this.g.rng;
    let total = 0;
    for (const p of PATTERNS) if (w >= W.patterns[p].from) total += W.patterns[p].w;
    let r = rng.next() * total;
    for (const p of PATTERNS) {
      if (w < W.patterns[p].from) continue;
      r -= W.patterns[p].w;
      if (r <= 0) {
        this.pattern = p;
        return;
      }
    }
    this.pattern = 'random';
  }

  private patternMask(rowIdx: number): number {
    const rng = this.g.rng;
    switch (this.pattern) {
      case 'checker':
        return rowIdx % 2 === 0 ? 0b1010101 : 0b0101010;
      case 'vee': {
        const k = rowIdx % 4;
        return (1 << (3 + k)) | (1 << (3 - k));
      }
      case 'walls':
        return 0b1100011;
      case 'pillars':
        return rng.chance(0.5) ? 0b0101010 : 0b1001001;
      case 'full':
        return 0b1111111;
      default:
        return 0;
    }
  }

  /** Generate one row of the current wave at rowAbs. reserved: elite columns carried between rows. */
  generateRow(rowAbs: number, rowIdx: number, rowsInWave: number, reserved: number[]): void {
    const g = this.g;
    const f = g.formation;
    const rng = g.rng;
    const w = g.wave;
    const dens = this.density(w);
    const base = this.baseHp(w);
    const jitter = 1 + rng.range(-W.hpJitter, W.hpJitter);
    const mask = this.patternMask(rowIdx);
    const structured = this.pattern !== 'random' && rng.next() < 0.8;
    let cells = 0;
    for (let c = 0; c < G.cols; c++) {
      let p = dens;
      if (structured) p = mask & (1 << c) ? Math.min(1, dens * 1.3) : dens * 0.35;
      if (rng.next() < p) cells |= 1 << c;
    }
    // at least minPerRow bricks
    let count = popcount(cells);
    let guard = 0;
    while (count < W.minPerRow && guard++ < 20) {
      cells |= 1 << rng.int(0, G.cols - 1);
      count = popcount(cells);
    }

    // elites: reserve two-wide slots on the second-to-last row, place on the last row
    const nElite = this.elites(w);
    if (nElite > 0 && rowsInWave >= 2) {
      if (rowIdx === rowsInWave - 2) {
        reserved.length = 0;
        const first = rng.int(0, 5);
        reserved.push(first);
        if (nElite > 1) {
          const opts: number[] = [];
          for (let c = 0; c <= 5; c++) if (Math.abs(c - first) >= 2) opts.push(c);
          if (opts.length) reserved.push(opts[rng.int(0, opts.length - 1)]!);
        }
        for (const c of reserved) cells &= ~(0b11 << c);
      } else if (rowIdx === rowsInWave - 1) {
        for (const c of reserved) {
          cells &= ~(0b11 << c);
          f.spawn('elite', c, rowAbs - 1, base * config.bricks.elite.hp * jitter);
        }
        reserved.length = 0;
      }
    }

    // specials
    const sp = W.special;
    let volatile = 0;
    let prism = 0;
    let warden = 0;
    let turretsOnScreen = f.countType('turret');
    let wardensOnScreen = f.countType('warden');
    const turretAllowed = (rowIdx % 2 === 0 || !this.lastRowHadTurret) && turretsOnScreen < sp.turret.onScreen;
    let turretPlaced = false;
    for (let c = 0; c < G.cols; c++) {
      if (!(cells & (1 << c))) continue;
      let type: BrickType = 'basic';
      const roll = rng.next();
      let acc = 0;
      const pt = w >= sp.turret.from ? sp.turret.base + sp.turret.perWave * (w - sp.turret.from) : 0;
      const pw = w >= sp.warden.from ? sp.warden.base : 0;
      const pa = w >= sp.armored.from ? sp.armored.base + sp.armored.perWave * (w - sp.armored.from) : 0;
      const pv = w >= sp.volatile.from ? sp.volatile.base : 0;
      const pp = w >= sp.prism.from ? sp.prism.base : 0;
      if (roll < (acc += pt) && turretAllowed && !turretPlaced && turretsOnScreen < sp.turret.onScreen) {
        type = 'turret';
        turretPlaced = true;
        turretsOnScreen++;
      } else if (roll < (acc += pw) && warden < sp.warden.perRow && wardensOnScreen < sp.warden.onScreen && !this.wardenNear(c, rowAbs)) {
        type = 'warden';
        warden++;
        wardensOnScreen++;
      } else if (roll < (acc += pa)) {
        type = 'armored';
      } else if (roll < (acc += pv) && volatile < sp.volatile.perRow) {
        type = 'volatile';
        volatile++;
      } else if (roll < (acc += pp) && prism < sp.prism.perRow) {
        type = 'prism';
        prism++;
      }
      f.spawn(type, c, rowAbs, base * config.bricks[type].hp * jitter);
    }
    this.lastRowHadTurret = turretPlaced;
  }
  private lastRowHadTurret = false;

  private wardenNear(col: number, rowAbs: number): boolean {
    const f = this.g.formation;
    for (let r = rowAbs - 1; r <= rowAbs + 1; r++)
      for (let c = col - 1; c <= col + 1; c++) {
        const b = f.brickAt(c, r);
        if (b && b.type === 'warden') return true;
      }
    return false;
  }
}

function popcount(v: number): number {
  let n = 0;
  while (v) {
    n += v & 1;
    v >>>= 1;
  }
  return n;
}
