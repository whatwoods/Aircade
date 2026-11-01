// Brick damage, death, drops, statuses (burn/chill/freeze/thermal shock), explosions, turrets (docs §3.7–3.8).
import { config } from '../config';
import type { ElementId } from '../types';
import { brickTypeIndex } from '../types';
import type { Brick } from './formation';
import type { Game } from './game';

const B = config.bricks;
const S = config.status;
const EV = config.evolutions;

export const DMG_DIRECT = 1;
export const DMG_AOE = 2;
export const DMG_BURN = 4;
export const DMG_CHAIN = 8;
export const DMG_SHOCK = 16;

const enum ExKind {
  Blast = 0,
  Ring2 = 1,
  Volatile = 2,
  Nova = 3,
}

interface PendingExplosion {
  active: boolean;
  t: number;
  kind: ExKind;
  x: number;
  y: number;
  radius: number;
  dmg: number;
  exclude: number;
  col: number;
  rowAbs: number;
  cw: number;
  ch: number;
  depth: number;
}

export class BrickSystem {
  private queue: PendingExplosion[] = [];
  private stamp = 1;
  private ids = new Int32Array(200);
  /** killing-blow damage of the last kill, used by shatter/ice-shard */
  private lastKillDmg = 0;
  chainDepthMax = 0;
  private curDepth = 0;

  constructor(private g: Game) {
    for (let i = 0; i < 96; i++)
      this.queue.push({ active: false, t: 0, kind: ExKind.Blast, x: 0, y: 0, radius: 0, dmg: 0, exclude: -1, col: 0, rowAbs: 0, cw: 1, ch: 1, depth: 0 });
  }

  reset(): void {
    for (const q of this.queue) q.active = false;
    this.chainDepthMax = 0;
  }

  private enqueue(kind: ExKind, delay: number, x: number, y: number, radius: number, dmg: number, exclude: number, depth: number, b?: Brick): void {
    let slot: PendingExplosion | undefined;
    for (const q of this.queue) if (!q.active) { slot = q; break; }
    if (!slot) return;
    slot.active = true;
    slot.t = delay;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.radius = radius;
    slot.dmg = dmg;
    slot.exclude = exclude;
    slot.depth = depth;
    if (b) {
      slot.col = b.col;
      slot.rowAbs = b.rowAbs;
      slot.cw = b.cw;
      slot.ch = b.ch;
    }
  }

  /** Direct ball hit. Returns true if the brick died. */
  hitByBall(b: Brick, dmg: number, element: ElementId, charges: number, cx: number, cy: number, ballBlastReady: boolean): boolean {
    const g = this.g;
    const st = g.stats;
    const f = g.formation;
    g.addCombo(1);
    let d = dmg;
    // thermal shock: fire / nova into a frozen brick
    const isFire = element === 'fire' || element === 'nova';
    if (isFire && b.frozenT > 0) {
      d *= 1 + S.thermalShockBonus;
      b.frozenT = 0;
      b.chill = 0;
      g.addCombo(1);
      g.sink.emit('thermalShock', f.cx(b), f.cy(b), d, 0);
      g.runStats.thermal++;
    }
    const killed = this.damage(b, d, DMG_DIRECT, charges);
    if (!killed) {
      if (isFire && st.fire) this.ignite(b, 1);
      if (element === 'ice' && st.ice) this.chillHit(b);
    }
    // blast AoE at contact
    if ((element === 'blast' || element === 'nova') && st.blast && ballBlastReady) {
      const evo = st.evo.supernova && element === 'nova';
      const r = st.blast.radius * (evo ? EV.supernova.radiusMult : 1);
      const base = st.blast.chargeApplies ? dmg : dmg / (1 + config.charge.perStack * charges);
      this.explode(cx, cy, r, base * st.blast.mult, b.id, ExKind.Blast, 0);
      if (st.blast.double) this.enqueue(ExKind.Ring2, config.upgrades.blast.ringDelay, cx, cy, r * config.upgrades.blast.ringScale, base * st.blast.mult * config.upgrades.blast.ringMult, -1, 0);
    }
    return killed;
  }

  ignite(b: Brick, stacks: number): void {
    const st = this.g.stats.fire;
    if (!st || !b.alive) return;
    if (b.frozenT > 0) return;
    if (b.burnStacks === 0) b.burnTick = 0;
    const before = b.burnStacks;
    b.burnStacks = Math.min(st.maxStacks, b.burnStacks + stacks);
    b.burnT = st.dur;
    if (b.burnStacks > before) this.g.sink.emit('burn', this.g.formation.cx(b), this.g.formation.cy(b), b.burnStacks, 1);
  }

  chillHit(b: Brick): void {
    const st = this.g.stats.ice;
    if (!st || !b.alive) return;
    const f = this.g.formation;
    if (this.g.stats.evo.absoluteZero) {
      this.freeze(b, EV.absoluteZero.freezeDur);
      return;
    }
    if (b.frozenT > 0) return;
    b.chill++;
    b.chillT = S.chillDur;
    if (b.chill >= st.freezeAt) this.freeze(b, st.freezeDur);
    else this.g.sink.emit('chill', f.cx(b), f.cy(b), b.chill, st.freezeAt);
  }

  freeze(b: Brick, dur: number): void {
    const f = this.g.formation;
    const wasFrozen = b.frozenT > 0;
    b.frozenT = Math.max(b.frozenT, dur);
    b.chill = 0;
    if (b.burnStacks > 0) {
      b.burnStacks = 0;
      b.burnT = 0;
      this.g.sink.emit('thaw', f.cx(b), f.cy(b), 0, 0);
    }
    if (b.type === 'turret') b.fireT = 0;
    if (!wasFrozen) {
      this.g.sink.emit('freeze', f.cx(b), f.cy(b), b.cw, 0);
      this.g.runStats.frozen++;
    }
  }

  /**
   * Apply damage after vulnerability / shield. flags: DMG_*. Returns true on kill.
   */
  damage(b: Brick, raw: number, flags: number, charges = 0): boolean {
    if (!b.alive) return false;
    const g = this.g;
    let d = raw;
    if (b.frozenT > 0 && g.stats.ice) d *= 1 + g.stats.ice.vuln;
    if (b.shielded) d *= B.wardenShield;
    b.hp -= d;
    if (flags & (DMG_DIRECT | DMG_AOE | DMG_CHAIN)) {
      b.flashT = 0.06;
      b.popS += flags & DMG_DIRECT ? 0.06 : 0.04;
    }
    g.runStats.damage += d;
    if (flags & DMG_DIRECT) g.sink.emit('brickHit', g.formation.cx(b), g.formation.cy(b), b.col + 8 * charges, d);
    if (b.type === 'armored' && !b.armorBroken && b.hp < b.maxHp * 0.5) {
      b.armorBroken = true;
      g.sink.emit('specialBreak', g.formation.cx(b), g.formation.cy(b), -1, 0);
    }
    if (b.hp <= 0) {
      this.lastKillDmg = d;
      this.kill(b, flags);
      return true;
    }
    return false;
  }

  /** Death by damage: drops, score, on-death effects. */
  kill(b: Brick, flags: number): void {
    const depth = this.curDepth;
    const g = this.g;
    const f = g.formation;
    const st = g.stats;
    const x = f.cx(b);
    const y = f.cy(b);
    const wasBurning = b.burnStacks > 0;
    const wasFrozen = b.frozenT > 0;
    const type = b.type;
    const col = b.col;
    const rowAbs = b.rowAbs;
    const id = b.id;
    // snapshot geometry for delayed effects before removal
    f.remove(b);
    g.runStats.bricks++;
    g.addScore(config.score.brick * B[type].score * (1 + config.score.wavePct * (g.wave - 1)) * g.comboMult());
    g.gemsSys.dropForBrick(type, x, y);
    if (type === 'elite' && g.rng.chance(B.eliteHealChance)) g.gemsSys.spawnHeal(x, y);
    const ev = type === 'elite' ? 'eliteBreak' : type === 'basic' || type === 'volatile' ? 'brickBreak' : 'specialBreak';
    g.sink.emit(ev, x, y, brickTypeIndex(type), flags & DMG_BURN ? 1 : 0);

    if (type === 'volatile') {
      this.enqueue(ExKind.Volatile, B.volatileDelay, x, y, 0, B.volatileDmg * g.waves.baseHp(g.wave), id, depth + 1, b);
    }
    if (wasBurning && st.evo.supernova) {
      this.enqueue(ExKind.Nova, EV.supernova.chainDelay, x, y, EV.supernova.deathRadius, EV.supernova.deathDmg * config.ball.baseDamage * st.dmgMult, id, depth + 1);
    } else if (wasBurning && st.fire && st.fire.spread > 0) {
      this.spreadBurn(col, rowAbs, st.fire.spread);
    }
    if (wasFrozen && st.ice) {
      if (st.evo.absoluteZero) this.iceShards(x, y, this.lastKillDmg);
      else if (st.ice.shatter) this.shatter(col, rowAbs, this.lastKillDmg);
    }
  }

  /** Removal without rewards (breach / crush). */
  breachBrick(b: Brick): void {
    const g = this.g;
    const f = g.formation;
    if (b.type === 'volatile') {
      g.sink.emit('volatileBoom', f.cx(b), f.cy(b), 0, 0);
      this.enqueue(ExKind.Volatile, B.volatileDelay, f.cx(b), f.cy(b), 0, B.volatileDmg * g.waves.baseHp(g.wave), b.id, 1, b);
    }
    f.remove(b);
  }

  crush(b: Brick): void {
    const f = this.g.formation;
    this.g.sink.emit('crush', f.cx(b), f.cy(b), brickTypeIndex(b.type), 0);
    f.remove(b);
  }

  private spreadBurn(col: number, rowAbs: number, n: number): void {
    const f = this.g.formation;
    if (n >= 4) {
      const d = [1, 0, -1, 0, 0, 1, 0, -1];
      for (let i = 0; i < 4; i++) {
        const nb = f.brickAt(col + d[i * 2]!, rowAbs + d[i * 2 + 1]!);
        if (nb) this.ignite(nb, 1);
      }
      return;
    }
    // n random of the 8 neighbours
    let picked = 0;
    const start = this.g.rng.int(0, 7);
    for (let k = 0; k < 8 && picked < n; k++) {
      const i = (start + k * 3) % 8;
      const dc = [-1, 0, 1, -1, 1, -1, 0, 1][i]!;
      const dr = [1, 1, 1, 0, 0, -1, -1, -1][i]!;
      const nb = f.brickAt(col + dc, rowAbs + dr);
      if (nb && nb.burnStacks === 0) {
        this.ignite(nb, 1);
        picked++;
      }
    }
  }

  private shatter(col: number, rowAbs: number, dmg: number): void {
    const f = this.g.formation;
    const d = [1, 0, -1, 0, 0, 1, 0, -1];
    this.g.sink.emit('shatter', config.grid.x0 + (col + 0.5) * config.grid.cellW, f.cellTop(rowAbs) + 14, 0, 0);
    for (let i = 0; i < 4; i++) {
      const nb = f.brickAt(col + d[i * 2]!, rowAbs + d[i * 2 + 1]!);
      if (!nb) continue;
      const killed = this.damage(nb, dmg * config.upgrades.ice.shatterDmg, DMG_CHAIN);
      if (!killed) this.chillHit(nb);
    }
  }

  private iceShards(x: number, y: number, dmg: number): void {
    const f = this.g.formation;
    const n = EV.absoluteZero.shards;
    // pick nearest n bricks (selection without allocation)
    let count = 0;
    const s = ++this.stamp;
    for (let k = 0; k < n; k++) {
      let best: Brick | null = null;
      let bd = 1e9;
      for (const b of f.bricks) {
        if (!b.alive || b.stamp === s) continue;
        const dx = f.cx(b) - x;
        const dy = f.cy(b) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = b;
        }
      }
      if (!best) break;
      best.stamp = s;
      this.ids[count++] = best.id;
    }
    for (let i = 0; i < count; i++) {
      const b = f.bricks[this.ids[i]!]!;
      if (!b.alive) continue;
      this.g.sink.emit('iceShard', x, y, f.cx(b), f.cy(b));
      const killed = this.damage(b, dmg * EV.absoluteZero.shardDmg, DMG_CHAIN);
      if (!killed) this.freeze(b, EV.absoluteZero.freezeDur);
    }
  }

  /** Radial AoE: bricks overlapping the circle (excluding id) take dmg; boss parts too. */
  explode(x: number, y: number, r: number, dmg: number, exclude: number, kind: number, depth: number): void {
    const g = this.g;
    const f = g.formation;
    const ev = kind === ExKind.Nova ? 'novaBoom' : kind === ExKind.Volatile ? 'volatileBoom' : 'blast';
    if (kind !== ExKind.Volatile) g.sink.emit(ev, x, y, r, dmg);
    const s = ++this.stamp;
    const prevDepth = this.curDepth;
    this.curDepth = depth;
    const n = f.query(x - r, y - r, x + r, y + r, this.ids);
    for (let i = 0; i < n; i++) {
      const b = f.bricks[this.ids[i]!]!;
      if (!b.alive || b.id === exclude || b.stamp === s) continue;
      b.stamp = s;
      const cx = Math.max(f.left(b), Math.min(x, f.right(b)));
      const cy = Math.max(f.top(b), Math.min(y, f.bottom(b)));
      if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > r * r) continue;
      g.addCombo(1);
      const burning = b.burnStacks > 0;
      const killed = this.damage(b, dmg, DMG_AOE);
      if (kind === ExKind.Nova && !killed) this.ignite(b, EV.supernova.deathBurn);
      if (killed && burning && depth > this.chainDepthMax) this.chainDepthMax = depth;
    }
    this.curDepth = prevDepth;
    if (g.boss) g.boss.aoe(x, y, r, dmg);
    if (kind === ExKind.Nova && depth === EV.supernova.warmFlashAt) g.sink.emit('novaBoom', x, y, -1, depth);
  }

  private volatileBlast(q: PendingExplosion): void {
    const g = this.g;
    const f = g.formation;
    g.sink.emit('volatileBoom', q.x, q.y, 1, q.depth);
    const s = ++this.stamp;
    const prevDepth = this.curDepth;
    this.curDepth = q.depth;
    for (let r = q.rowAbs - 1; r <= q.rowAbs + q.ch; r++)
      for (let c = q.col - 1; c <= q.col + q.cw; c++) {
        const b = f.brickAt(c, r);
        if (!b || b.stamp === s) continue;
        b.stamp = s;
        g.addCombo(1);
        this.damage(b, q.dmg, DMG_AOE);
      }
    this.curDepth = prevDepth;
    if (g.boss) g.boss.aoe(q.x, q.y, config.grid.cellW * 1.2, q.dmg);
  }

  update(dt: number): void {
    const g = this.g;
    const f = g.formation;
    const st = g.stats;
    // delayed explosions
    for (const q of this.queue) {
      if (!q.active) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.active = false;
      if (q.kind === ExKind.Volatile) this.volatileBlast(q);
      else this.explode(q.x, q.y, q.radius, q.dmg, q.exclude, q.kind, q.depth);
    }
    const onScreenTop = config.field.ceilY - 2;
    for (const b of f.bricks) {
      if (!b.alive) continue;
      if (b.spawnT > 0) b.spawnT = Math.max(0, b.spawnT - dt);
      // burn
      if (b.burnStacks > 0) {
        b.burnT -= dt;
        b.burnTick += dt;
        if (b.burnTick >= S.burnTick) {
          b.burnTick -= S.burnTick;
          const fire = st.fire;
          if (fire) {
            const d = b.burnStacks * fire.dps * S.burnTick * config.ball.baseDamage * st.dmgMult;
            g.sink.emit('burn', f.cx(b), f.cy(b), b.burnStacks, 0);
            if (this.damage(b, d, DMG_BURN)) continue;
          }
        }
        if (b.burnT <= 0) b.burnStacks = 0;
      }
      if (b.chill > 0) {
        b.chillT -= dt;
        if (b.chillT <= 0) b.chill = 0;
      }
      if (b.frozenT > 0) {
        b.frozenT -= dt;
        if (b.frozenT <= 0) {
          b.frozenT = 0;
          b.chill = 0;
        }
      }
      // turret
      if (b.type === 'turret') {
        if (b.frozenT > 0 || f.top(b) < onScreenTop || g.phase === 'bossDeath' || !g.hostile()) {
          if (b.fireT > B.turretPeriod - B.turretCharge) b.fireT = 0;
          b.locked = false;
          continue;
        }
        b.fireT += dt * g.bossChillMult();
        const charging = b.fireT >= B.turretPeriod - B.turretCharge;
        if (charging && !b.locked) {
          b.aimX = g.player.x;
          b.aimY = config.field.catchY;
          if (b.fireT >= B.turretPeriod - B.turretLock) {
            b.locked = true;
            g.sink.emit('bossTelegraph', f.cx(b), f.cy(b), 0, 0);
          }
        }
        if (b.fireT >= B.turretPeriod) {
          b.fireT = 0;
          b.locked = false;
          const x = f.cx(b);
          const y = f.bottom(b);
          const dx = b.aimX - x;
          const dy = b.aimY - y;
          const len = Math.hypot(dx, dy) || 1;
          g.bulletsSys.spawn(x, y, (dx / len) * B.turretBulletSpeed, (dy / len) * B.turretBulletSpeed, B.turretBulletR, false);
          g.sink.emit('enemyShot', x, y, 0, 0);
        }
      }
    }
  }
}
