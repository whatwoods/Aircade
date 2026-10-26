// Autopilot bot for debug / balancing (docs §8 autoplay strategy).
import { config } from '../config';
import type { Card } from '../types';
import { KIND_MAIN } from './balls';
import { EVOLUTIONS } from './upgrades';
import type { Game } from './game';

const F = config.field;
const pred = { x: 0, t: 0 };

export class Autoplay {
  enabled = false;
  private hold = 0;
  private lastTarget = 195;

  decide(g: Game, dt: number): void {
    if (!this.enabled) return;
    const p = g.player;
    const half = g.stats.paddleW / 2;
    let target = this.lastTarget;
    // 1) catch the most valuable ball arriving within 0.9 s
    let best = -1;
    let bestX = 0;
    for (const b of g.balls.pool) {
      if (!b.alive || b.vy <= 0) continue;
      if (!g.balls.predict(b, pred)) continue;
      if (pred.t > 0.9) continue;
      const reach = Math.abs(pred.x - p.x) / 1400;
      if (reach > pred.t + 0.05) continue;
      const v = (1 + b.charges * 1.5) * (b.kind === KIND_MAIN ? 1.6 : 0.6) / (pred.t + 0.25);
      if (v > best) {
        best = v;
        bestX = pred.x;
      }
    }
    if (best > 0) {
      // aim the paddle so the ball goes toward the threat column
      const threat = this.threatX(g);
      const off = Math.max(-0.45, Math.min(0.45, (threat - bestX) / 260)) * half;
      target = bestX - off;
    } else {
      // 2) floor gems nearby
      let gx = -1;
      let gd = 1e9;
      for (const gm of g.gemsSys.pool) {
        if (!gm.alive || !gm.grounded) continue;
        const d = Math.abs(gm.x - p.x);
        if (d < gd && d < 160) {
          gd = d;
          gx = gm.x;
        }
      }
      target = gx >= 0 ? gx : this.threatX(g);
    }
    // 3) dodge bullets / lasers
    for (const e of g.bulletsSys.pool) {
      if (!e.alive || e.vy <= 0) continue;
      const t = (F.catchY - 10 - e.y) / e.vy;
      if (t < 0 || t > 0.7) continue;
      const ex = e.x + e.vx * t;
      if (Math.abs(ex - target) < half + 14) target = ex + (ex > target ? -(half + 22) : half + 22);
    }
    for (const l of g.bulletsSys.lasers) {
      if (!l.alive) continue;
      if (Math.abs(l.x - target) < half + 24) target = l.x + (l.x > 195 ? -(half + 40) : half + 40);
    }
    this.hold -= dt;
    this.lastTarget = target;
    p.targetX = Math.max(F.wallL + half, Math.min(F.wallR - half, target));
  }

  private threatX(g: Game): number {
    const f = g.formation;
    let bestY = -1;
    let x = 195;
    for (const b of f.bricks) {
      if (!b.alive) continue;
      let y = f.bottom(b);
      if (b.type === 'turret' || b.type === 'volatile' || b.warn) y += 40;
      if (y > bestY) {
        bestY = y;
        x = f.cx(b);
      }
    }
    if (g.boss && g.boss.state === 'fight' && bestY < 300) x = g.boss.x;
    return x;
  }

  pickCard(g: Game, cards: Card[]): number {
    let best = 0;
    let bv = -1;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]!;
      let v = 0;
      if (c.kind === 'evolution') v = 100;
      else if (c.kind === 'battery') v = g.player.hp < g.stats.maxHp * 0.5 ? 30 : 1;
      else if (c.kind === 'cache') v = 0.5;
      else {
        const id = c.id as keyof typeof g.levels;
        const lv = g.levels[id];
        v = 10 + lv * 3;
        for (const e of Object.values(EVOLUTIONS)) {
          if (e.main === id && g.levels[e.partner] > 0) v += 25;
          if (e.partner === id && g.levels[e.main] > 0 && lv < 3) v += 30;
        }
        if (id === 'fire' || id === 'blast' || id === 'multi' || id === 'power') v += 6;
        if (id === 'aegis' && g.player.hp < 5) v += 20;
        v += g.rng.next() * 4;
      }
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    return best;
  }
}
