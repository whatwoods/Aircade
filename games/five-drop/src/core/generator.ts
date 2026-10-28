import { Rng } from './rng.ts';
import { Piece, SHAPES, BLACK, WHITE, CRYSTAL } from './pieces.ts';
import type { Stone } from './pieces.ts';
import type { Config, ShapeId } from '../config.ts';
import { colorWeightsFor } from '../config.ts';

export type ColorCat = 'pure' | 'major' | 'split';

/** 9 袋形状 + 加权颜色类别 + 防干旱 + 冰晶子（第 3.3、3.8 节） */
export class Generator {
  private shapeRng: Rng;
  private colorRng: Rng;
  private bag: ShapeId[] = [];
  private noPure = 0;
  private splitStreak = 0;
  private lastCrystal = false;
  private cfg: Config;
  constructor(cfg: Config, seed: number) {
    this.cfg = cfg;
    this.shapeRng = new Rng(seed, 'shape');
    this.colorRng = new Rng(seed, 'color');
  }
  private nextShape(): ShapeId {
    if (this.bag.length === 0) this.bag = this.shapeRng.shuffle(this.cfg.pieces.shapes.slice());
    return this.bag.pop()!;
  }
  next(level: number, balance: { b: number; w: number; total: number }): Piece {
    const shape = this.nextShape();
    const n = SHAPES[shape].cells.length;
    const r = this.colorRng;
    const wt = colorWeightsFor(level, this.cfg);
    let pure = wt.pure, major = wt.major, split = wt.split;
    if (n < 4) { major += split; split = 0; }
    let cat: ColorCat;
    const roll = r.next() * (pure + major + split);
    cat = roll < pure ? 'pure' : roll < pure + major ? 'major' : 'split';
    if (this.noPure >= this.cfg.antiDrought.forcePureAfter) cat = 'pure';
    if (cat === 'split' && this.splitStreak >= this.cfg.antiDrought.maxSplitStreak) cat = 'major';
    this.noPure = cat === 'pure' ? 0 : this.noPure + 1;
    this.splitStreak = cat === 'split' ? this.splitStreak + 1 : 0;

    const ad = this.cfg.antiDrought;
    const pBlack = Math.min(ad.colorBalanceClamp[1], Math.max(ad.colorBalanceClamp[0],
      0.5 + ad.colorBalanceGain * (balance.w - balance.b) / Math.max(10, balance.total)));
    const maj: Stone = r.next() < pBlack ? BLACK : WHITE;
    const min: Stone = maj === BLACK ? WHITE : BLACK;
    const colors: Stone[] = new Array(n).fill(maj);
    if (cat === 'major') colors[r.int(n)] = min;
    else if (cat === 'split') {
      const a = r.int(n);
      let b = r.int(n - 1); if (b >= a) b++;
      colors[a] = min; colors[b] = min;
    }
    const cr = this.cfg.crystal;
    let crystal = false;
    if (cr.enabled && level >= cr.fromLevel && !(cr.noConsecutive && this.lastCrystal)) {
      const p = level >= cr.lateLevel ? cr.lateChance : cr.chance;
      if (r.next() < p) { colors[r.int(n)] = CRYSTAL; crystal = true; }
    }
    this.lastCrystal = crystal;
    const piece = new Piece(shape, colors);
    return piece;
  }
}
