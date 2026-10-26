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
  /** "average player" mode for balancing: reacts every 0.2–0.3 s, catches with ±20 u error, random cards */
  human = false;
  /** with human: the reviewer's touch bot — no aiming, no dodging, no gem chasing, always tracks the next ball */
  naive = false;
  private reactT = 0;
  private hseed = 12345;
  private hr(): number {
    this.hseed = (Math.imul(this.hseed, 1664525) + 1013904223) >>> 0;
    return this.hseed / 4294967296;
  }
  private hold = 0;
  private lastTarget = 195;
  /** danger intervals on the catch line: [lo, hi, seconds until it arrives] */
  private zones = new Float32Array(64 * 3);
  private nz = 0;

  private addZone(a: number, b: number, t: number): void {
    if (this.nz >= 64) return;
    const i = this.nz * 3;
    this.zones[i] = a;
    this.zones[i + 1] = b;
    this.zones[i + 2] = t;
    this.nz++;
  }

  /** moving from a to b would sweep through a zone that lands within 0.3 s */
  private blocked(a: number, b: number): boolean {
    for (let i = 0; i < this.nz; i++) {
      if (this.zones[i * 3 + 2]! > 0.3) continue;
      const zl = this.zones[i * 3]!;
      const zh = this.zones[i * 3 + 1]!;
      if ((a <= zl && b > zl) || (a >= zh && b < zh)) return true;
    }
    return false;
  }

  private unsafe(x: number): boolean {
    for (let i = 0; i < this.nz; i++) if (x > this.zones[i * 3]! && x < this.zones[i * 3 + 1]!) return true;
    return false;
  }

  decide(g: Game, dt: number): void {
    if (!this.enabled) return;
    const p = g.player;
    const half = g.stats.paddleW / 2;
    if (this.human) {
      this.reactT -= dt;
      if (this.reactT > 0) return;
      this.reactT = 0.2 + this.hr() * 0.1;
    }
    let target = this.lastTarget;
    // 1) catch the most valuable ball arriving within 0.9 s
    let best = -1;
    let bestX = 0;
    for (const b of g.balls.pool) {
      if (!b.alive || b.vy <= 0) continue;
      if (!g.balls.predict(b, pred)) continue;
      if (this.naive) {
        const v = 1 / (pred.t + 0.01);
        if (v > best) {
          best = v;
          bestX = pred.x;
        }
        continue;
      }
      if (pred.t > 0.9) continue;
      const reach = Math.abs(pred.x - p.x) / 1400;
      if (reach > pred.t + 0.05) continue;
      const v = (1 + b.charges * 1.5) * (b.kind === KIND_MAIN ? 1.6 : 0.6) / (pred.t + 0.25);
      if (v > best) {
        best = v;
        bestX = pred.x;
      }
    }
    if (this.naive) {
      target = best > 0 ? bestX : 195;
    } else if (best > 0) {
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
    // 3) safety first: collect the danger intervals of incoming bullets and live/telegraphed lasers on the
    //    catch line, and if the wanted spot is inside one, move to the nearest safe edge instead
    this.nz = 0;
    for (const e of g.bulletsSys.pool) {
      if (!e.alive || e.vy <= 0) continue;
      // bullets stay dangerous until they are fully below the paddle, not just past the catch line
      if (e.y > F.catchY + config.player.paddleH + e.r + 4) continue;
      const t = Math.max(0, (F.catchY - 10 - e.y) / e.vy);
      if (t > 0.8) continue;
      const ex = e.x + e.vx * t;
      const m = half + e.r + 10;
      this.addZone(ex - m, ex + m, t);
    }
    const lw = config.bosses.omega.laserW * 0.5 + half * 0.6 + 14;
    for (const l of g.bulletsSys.lasers) if (l.alive) this.addZone(l.x - lw, l.x + lw, Math.max(0, l.warnDur - l.warnT));
    if (this.naive) this.nz = 0;
    if (this.nz > 0 && (this.unsafe(target) || this.blocked(p.x, target))) {
      // nearest safe edge that can be reached without sweeping through something about to land
      const lo = F.wallL + half;
      const hi = F.wallR - half;
      let bestE = p.x;
      let bestD = 1e9;
      for (let i = 0; i < this.nz; i++) {
        for (let k = 0; k < 2; k++) {
          const e = this.zones[i * 3 + k]! + (k ? 1 : -1);
          if (e < lo || e > hi || this.unsafe(e) || this.blocked(p.x, e)) continue;
          const d = Math.abs(e - p.x) + 0.3 * Math.abs(e - target);
          if (d < bestD) {
            bestD = d;
            bestE = e;
          }
        }
      }
      target = bestE;
    }
    if (this.human) target += (this.hr() - 0.5) * 40;
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
    if (this.human) {
      for (let i = 0; i < cards.length; i++) if (cards[i]!.kind === 'evolution') return i;
      return Math.floor(this.hr() * cards.length) % cards.length;
    }
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
        if (id === 'fire' || id === 'blast' || id === 'power') v += 6;
        // more balls is the backbone of every build (3 → 9 main balls)
        if (id === 'multi') v += 18;
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
