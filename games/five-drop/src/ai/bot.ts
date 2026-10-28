import type { Game } from '../core/game.ts';
import { Grid } from '../core/grid.ts';
import { Piece } from '../core/pieces.ts';
import { resolveAll, resolveStep, fullRows } from '../core/rules.ts';
import type { Rng } from '../core/rng.ts';
import { evaluate } from './evaluate.ts';
import type { Weights } from './evaluate.ts';

export type PersonaId = 'novice' | 'serious' | 'colorblind' | 'shapeblind' | 'noinvert';

export interface Persona {
  id: PersonaId;
  weights: Weights;
  useHold: boolean;
  /** 每块考虑翻色的概率 */
  invertChance: number;
  /** 在前 topK 名中按 softmax(τ) 抽选；topK=1 为贪心 */
  topK: number;
  temp: number;
  misdrop: number;
  think: number;
  /** 每个操作（平移 1 格、旋转、翻色、暂存）耗时（秒） */
  actionTime: number;
  /** true：评估完整连锁后的盘面（超人）；false：只看到预告能显示的第一轮 */
  fullSight: boolean;
  /** 一局里「看不见斜线」的概率 */
  diagBlindChance: number;
}

const BASE: Weights = {
  clear: 2.0, score: 0.35, height: 0.32, hole: 3.2, bump: 0.45, top: 1.6, topFrom: 9,
  pot: 0.08, dead: 0.55, well: 0.6, landing: 0.5, diag: true, colorblind: false,
};

export const PERSONAS: Record<PersonaId, Persona> = {
  serious: { id: 'serious', weights: { ...BASE }, useHold: true, invertChance: 1, topK: 1, temp: 1, misdrop: 0, think: 1.1, actionTime: 0.12, fullSight: false, diagBlindChance: 0 },
  novice: { id: 'novice', weights: { ...BASE, pot: 0.03, dead: 0.2 }, useHold: false, invertChance: 0.5, topK: 10, temp: 4, misdrop: 0.1, think: 3.0, actionTime: 0.3, fullSight: false, diagBlindChance: 0.5 },
  colorblind: { id: 'colorblind', weights: { ...BASE, colorblind: true }, useHold: true, invertChance: 0, topK: 1, temp: 1, misdrop: 0, think: 1.1, actionTime: 0.12, fullSight: false, diagBlindChance: 0 },
  shapeblind: { id: 'shapeblind', weights: { ...BASE, hole: 0, bump: 0, well: 0, landing: 0 }, useHold: true, invertChance: 1, topK: 1, temp: 1, misdrop: 0, think: 1.1, actionTime: 0.12, fullSight: false, diagBlindChance: 0 },
  noinvert: { id: 'noinvert', weights: { ...BASE }, useHold: true, invertChance: 0, topK: 1, temp: 1, misdrop: 0, think: 1.1, actionTime: 0.12, fullSight: false, diagBlindChance: 0 },
};

export interface Decision { useHold: boolean; x: number; rot: number; inv: boolean; e: number; dropRows: number; actions: number }

const scratch = new Grid(9, 15, 2);

function tetrisClear(g: Grid): number {
  const rows = fullRows(g);
  if (!rows.length) return 0;
  const { cols, cells } = g;
  for (const y of rows) {
    cells.copyWithin(cols, 0, y * cols);
    cells.fill(0, 0, cols);
  }
  return rows.length * cols;
}

/** 枚举全部落点并打分，按分数降序返回 */
export function candidates(game: Game, persona: Persona, rng: Rng, diag: boolean): Decision[] {
  const out: Decision[] = [];
  const g = game.grid;
  const active = game.active;
  if (!active) return out;
  const pieces: { p: Piece; hold: boolean }[] = [{ p: active, hold: false }];
  if (persona.useHold && !game.holdUsed && game.cfg.pieces.holdEnabled) {
    const hp = game.holdPiece ?? game.queue[0];
    if (hp) pieces.push({ p: hp, hold: true });
  }
  const tryInv = rng.next() < persona.invertChance;
  const w = diag === persona.weights.diag ? persona.weights : { ...persona.weights, diag };
  const lim = game.cfg.invert.maxPerPiece;
  for (const { p: src, hold } of pieces) {
    const seen = new Set<string>();
    const spawnX = Math.floor((g.cols - src.n) / 2);
    const spawnY = g.hidden - src.bottomY();
    for (let inv = 0; inv < (tryInv && lim !== 0 ? 2 : 1); inv++) {
      const p = new Piece(src.shape, src.colors, 0);
      if (inv) p.invert();
      for (let rot = 0; rot < 4; rot++) {
        p.setRot(rot);
        const sig = [] as string[];
        for (let i = 0; i < p.cx.length; i++) sig.push(`${p.cx[i] - p.minX()},${p.cy[i]},${p.colors[i]}`);
        const key = sig.sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const y0 = Math.min(spawnY, g.hidden - 1 - p.bottomY() + 1);
        for (let x = -p.minX(); x + p.maxX() < g.cols; x++) {
          // 可达性：沿出块高度横移不被挡
          let ok = true;
          const step = x > spawnX ? 1 : -1;
          for (let xx = spawnX; ; xx += step) {
            if (g.collides(p, xx, y0)) { ok = false; break; }
            if (xx === x) break;
          }
          if (!ok) continue;
          const dy = g.dropY(p, x, y0);
          scratch.copyFrom(g);
          scratch.place(p, x, dy);
          let removed = 0, score = 0;
          if (w.colorblind) removed = tetrisClear(scratch);
          else if (persona.fullSight) {
            const steps = resolveAll(scratch, game.level, game.cfg);
            for (const s of steps) { removed += s.removed.length; score += s.score; }
          } else {
            const s1 = resolveStep(scratch, 1, game.level, game.cfg);
            if (s1) { removed = s1.removed.length; score = s1.score; }
          }
          let e = evaluate(scratch, removed, score, w) - w.landing * (g.rows - 1 - (dy + p.bottomY()));
          if (scratch.hiddenOccupied()) e -= 1e6;
          const actions = Math.abs(x - spawnX) + (rot === 3 ? 1 : rot) + inv + (hold ? 1 : 0);
          out.push({ useHold: hold, x, rot, inv: inv === 1, e, dropRows: dy - y0, actions });
        }
      }
    }
  }
  out.sort((a, b) => b.e - a.e);
  return out;
}

export function choose(cands: Decision[], persona: Persona, rng: Rng, panic: number): Decision | null {
  if (!cands.length) return null;
  const k = Math.min(cands.length, Math.max(persona.topK, 1 + Math.ceil(panic * 6)));
  if (k <= 1) return cands[0];
  const temp = persona.temp * (1 + panic * 2);
  const best = cands[0].e;
  let sum = 0;
  const ws: number[] = [];
  for (let i = 0; i < k; i++) { const v = Math.exp((cands[i].e - best) / temp); ws.push(v); sum += v; }
  let r = rng.next() * sum;
  for (let i = 0; i < k; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
  return cands[k - 1];
}

/** 执行决策；返回是否成功落下 */
export function execute(game: Game, d: Decision, persona: Persona, rng: Rng): boolean {
  if (d.useHold && !game.hold()) return false;
  let x = d.x;
  if (persona.misdrop > 0 && rng.next() < persona.misdrop) x += rng.next() < 0.5 ? -1 : 1;
  if (game.placeAt(x, d.rot, d.inv)) return true;
  return game.placeAt(d.x, d.rot, d.inv);
}
