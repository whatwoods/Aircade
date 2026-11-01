// XP crystals and heal chips: pop, gravity, floor slide, blink, magnet, merge (docs §3.9).
import { config } from '../config';
import type { BrickType } from '../types';
import type { Game } from './game';

const GM = config.gems;
const F = config.field;

export const GEM_SMALL = 0;
export const GEM_MEDIUM = 1;
export const GEM_LARGE = 2;
export const GEM_HEAL = 3;

export class Gem {
  alive = false;
  kind = GEM_SMALL;
  value = 1;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  grounded = false;
  floorT = 0;
  magnet = false;
  age = 0;
  spin = 0;
  constructor(public readonly id: number) {}
}

export class Gems {
  readonly pool: Gem[] = [];
  count = 0;
  vacuum = false;
  pickupChain = 0;
  pickupChainT = 0;
  constructor(private g: Game) {
    for (let i = 0; i < GM.max + 16; i++) this.pool.push(new Gem(i));
  }

  reset(): void {
    for (const gm of this.pool) gm.alive = false;
    this.count = 0;
    this.vacuum = false;
  }

  private radiusOf(kind: number): number {
    return kind === GEM_LARGE ? 12 : kind === GEM_MEDIUM ? 8 : kind === GEM_HEAL ? 9 : 5;
  }

  spawn(kind: number, value: number, x: number, y: number): void {
    const g = this.g;
    const rng = g.rng;
    if (kind !== GEM_HEAL && this.count >= GM.max) {
      // merge into nearest existing gem
      let best: Gem | null = null;
      let bd = 1e12;
      for (const gm of this.pool) {
        if (!gm.alive || gm.kind === GEM_HEAL) continue;
        const d = (gm.x - x) * (gm.x - x) + (gm.y - y) * (gm.y - y);
        if (d < bd) {
          bd = d;
          best = gm;
        }
      }
      if (best) {
        best.value += value;
        best.kind = best.value >= GM.large ? GEM_LARGE : best.value >= GM.medium ? GEM_MEDIUM : GEM_SMALL;
        return;
      }
    }
    let slot: Gem | null = null;
    for (const gm of this.pool) if (!gm.alive) { slot = gm; break; }
    if (!slot) return;
    slot.alive = true;
    slot.kind = kind;
    slot.value = value;
    slot.x = slot.px = x;
    slot.y = slot.py = y;
    slot.vx = rng.range(-GM.popSide, GM.popSide);
    slot.vy = -rng.range(GM.popUpMin, GM.popUpMax);
    slot.grounded = false;
    slot.floorT = 0;
    slot.magnet = false;
    slot.age = 0;
    slot.spin = rng.range(0, Math.PI * 2);
    if (kind !== GEM_HEAL) this.count++;
  }

  dropForBrick(type: BrickType, x: number, y: number): void {
    const xp = config.bricks[type].xp;
    let rest = xp;
    if (rest >= GM.large) {
      this.spawn(GEM_LARGE, GM.large, x, y);
      rest -= GM.large;
    }
    while (rest >= GM.medium) {
      this.spawn(GEM_MEDIUM, GM.medium, x, y);
      rest -= GM.medium;
    }
    while (rest > 0) {
      this.spawn(GEM_SMALL, GM.small, x, y);
      rest -= GM.small;
    }
  }

  spawnHeal(x: number, y: number): void {
    this.spawn(GEM_HEAL, GM.heal, x, y);
  }

  private collect(gm: Gem): void {
    const g = this.g;
    gm.alive = false;
    if (gm.kind === GEM_HEAL) {
      g.heal(gm.value);
      g.sink.emit('healPickup', gm.x, gm.y, gm.value, 0);
      return;
    }
    this.count--;
    this.pickupChain = this.pickupChainT > 0 ? this.pickupChain + 1 : 0;
    this.pickupChainT = 0.3;
    g.addXp(gm.value * g.stats.xpMult);
    g.runStats.gems++;
    g.sink.emit('gemPickup', gm.x, gm.y, gm.kind, this.pickupChain);
  }

  update(dt: number): void {
    const g = this.g;
    const px = g.player.x;
    const py = F.catchY;
    const mr = g.stats.magnetR;
    const alive = g.player.alive;
    if (this.pickupChainT > 0) this.pickupChainT -= dt;
    for (const gm of this.pool) {
      if (!gm.alive) continue;
      gm.px = gm.x;
      gm.py = gm.y;
      gm.age += dt;
      gm.spin += dt * (gm.grounded ? 0.6 : 2.2);
      const dx = px - gm.x;
      const dy = py - gm.y;
      const d2 = dx * dx + dy * dy;
      if (alive && (this.vacuum || d2 < mr * mr)) gm.magnet = true;
      if (gm.magnet && alive) {
        const d = Math.sqrt(d2) || 1;
        if (d <= GM.collect) {
          this.collect(gm);
          continue;
        }
        const acc = this.vacuum ? GM.magnetAccel * 1.6 : GM.magnetAccel;
        gm.vx += (dx / d) * acc * dt;
        gm.vy += (dy / d) * acc * dt;
        // damp tangential drift so gems home in instead of orbiting
        const along = (gm.vx * dx + gm.vy * dy) / d;
        const tx = gm.vx - (along * dx) / d;
        const ty = gm.vy - (along * dy) / d;
        gm.vx -= tx * Math.min(1, 6 * dt);
        gm.vy -= ty * Math.min(1, 6 * dt);
        const sp = Math.sqrt(gm.vx * gm.vx + gm.vy * gm.vy);
        const max = this.vacuum ? GM.magnetMax * 1.4 : GM.magnetMax;
        if (sp > max) {
          gm.vx = (gm.vx / sp) * max;
          gm.vy = (gm.vy / sp) * max;
        }
        gm.grounded = false;
        gm.x += gm.vx * dt;
        gm.y += gm.vy * dt;
        // guard against overshoot
        const ndx = px - gm.x;
        const ndy = py - gm.y;
        if (ndx * ndx + ndy * ndy <= GM.collect * GM.collect || ndx * dx + ndy * dy < 0) this.collect(gm);
        continue;
      }
      const r = this.radiusOf(gm.kind);
      if (!gm.grounded) {
        gm.vy = Math.min(GM.terminal, gm.vy + GM.gravity * dt);
        gm.x += gm.vx * dt;
        gm.y += gm.vy * dt;
        if (gm.x < F.wallL + r) {
          gm.x = F.wallL + r;
          gm.vx = Math.abs(gm.vx) * 0.6;
        } else if (gm.x > F.wallR - r) {
          gm.x = F.wallR - r;
          gm.vx = -Math.abs(gm.vx) * 0.6;
        }
        if (gm.y > F.floorY - r) {
          gm.y = F.floorY - r;
          if (gm.vy > 40) gm.vy = -gm.vy * GM.bounce;
          else {
            gm.vy = 0;
            gm.grounded = true;
          }
        }
      } else {
        gm.vx -= gm.vx * Math.min(1, GM.friction * dt);
        gm.x += gm.vx * dt;
        gm.x = Math.max(F.wallL + r, Math.min(F.wallR - r, gm.x));
        gm.floorT += dt;
        if (gm.floorT >= GM.floorLife) {
          gm.alive = false;
          if (gm.kind !== GEM_HEAL) this.count--;
        }
      }
    }
  }
}
