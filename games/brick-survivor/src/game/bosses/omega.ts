// Boss 4 · OMEGA — three phases: prism bulwark, judgement lasers, collapse spiral (docs §3.11).
import { config } from '../../config';
import { ease } from '../../core/ease';
import type { Game } from '../game';
import { Boss, PART_CORE, PART_PLATE } from './boss';
import type { BossPart } from './boss';

const O = config.bosses.omega;
const F = config.field;

export class Omega extends Boss {
  readonly kind = 'omega' as const;
  readonly name = '终焉之核';
  readonly en = 'OMEGA';
  core: BossPart;
  cells: BossPart[] = [];
  orbit = 0;
  aimT = 0;
  laserT = 0;
  spiralT = 0;
  spiralOn = 0;
  spiralAngle = 0;
  spiralEmit = 0;
  drift = 0;
  riseT = 0;
  glitch = 0;

  constructor(g: Game, hpMult: number) {
    super(g);
    this.hpMult = hpMult;
    this.maxHp = this.hp = O.hp * hpMult;
    this.ticks = [O.p2, O.p3];
    this.homeY = O.y;
    this.core = this.addPart(PART_CORE, O.r, this.maxHp);
    for (let i = 0; i < O.cells; i++) this.cells.push(this.addPart(PART_PLATE, O.cellR, 0, O.cellHits));
  }

  protected override plateRegen(): number {
    return O.cellRegen;
  }

  private place(): void {
    this.core.x = this.x;
    this.core.y = this.y;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      const a = this.orbit + (i / this.cells.length) * Math.PI * 2;
      c.angle = a;
      c.x = this.x + Math.cos(a) * O.orbit;
      c.y = this.y + Math.sin(a) * O.orbit;
    }
  }

  protected placeIntro(p: number): void {
    this.x = O.x;
    this.y = config.bosses.intro.startY + (O.y - config.bosses.intro.startY) * p;
    this.orbit += 0.01;
    this.place();
  }

  beginFight(): void {
    const f = this.g.formation;
    f.mode = 'sideRows';
    f.fixedBeats = O.rowBeats;
    f.stepTimer = 0;
    f.armed = false;
  }

  protected override partVuln(p: BossPart): number {
    return this.phase === 3 && p === this.core ? O.p3Vuln : 0;
  }

  protected fight(dt: number): void {
    const g = this.g;
    const t = dt * this.speedMult();
    this.drift += dt;
    this.glitch = Math.max(0, this.glitch - dt);
    const frac = this.hp / this.maxHp;
    if (this.phase === 1 && frac <= O.p2) this.enterPhase(2);
    if (this.phase === 2 && frac <= O.p3) this.enterPhase(3);
    let y = this.homeY;
    if (this.phase === 3) {
      this.riseT = Math.min(1, this.riseT + dt);
      y = O.y + (O.p3Y - O.y) * ease.inOutCubic(this.riseT);
    }
    this.x = O.x + Math.sin(this.drift * 0.7) * 6;
    this.y = y + Math.sin(this.drift * 1.1) * 5;
    const speed = this.phase === 1 ? O.speed1 : O.speed2;
    this.orbit += ((speed * Math.PI) / 180) * t;
    this.place();
    if (this.phase < 3) {
      for (const c of this.cells) {
        if (c.alive) {
          if (c.grow < 1) c.grow = Math.min(1, c.grow + dt / 0.5);
          continue;
        }
        c.regenT -= dt;
        if (c.regenT <= 0) {
          c.alive = true;
          c.hits = c.maxHits;
          c.grow = 0;
        }
      }
    }
    if (!this.attacking()) return;
    // aimed triple
    this.aimT += t;
    const aimEvery = this.phase === 1 ? O.aimEvery : O.aimEvery2;
    if (this.aimT >= aimEvery) {
      this.aimT = 0;
      g.bulletsSys.fan(this.x, this.y + O.r * 0.6, g.player.x, F.catchY, O.aimCount, O.aimSpread, O.aimSpeed);
      g.sink.emit('enemyShot', this.x, this.y, 5, 0);
    }
    // lasers
    if (this.phase >= 2) {
      this.laserT += t;
      const every = this.phase === 3 ? O.laserEvery3 : O.laserEvery;
      if (this.laserT >= every) {
        this.laserT = 0;
        const x1 = Math.max(F.wallL + 20, Math.min(F.wallR - 20, g.player.x));
        let x2 = x1;
        for (let k = 0; k < 8 && Math.abs(x2 - x1) < O.laserMinSep; k++) x2 = g.rng.range(F.wallL + 20, F.wallR - 20);
        if (Math.abs(x2 - x1) < O.laserMinSep) x2 = x1 > 195 ? x1 - O.laserMinSep - 10 : x1 + O.laserMinSep + 10;
        g.bulletsSys.laser(x1, this.y, O.laserWarn, O.laserActive);
        g.bulletsSys.laser(x2, this.y, O.laserWarn, O.laserActive);
        g.sink.emit('bossTelegraph', this.x, this.y, 4, 0);
      }
    }
    // spiral
    if (this.phase === 3) {
      this.spiralT += t;
      if (this.spiralOn <= 0 && this.spiralT >= O.spiralEvery) {
        this.spiralT = 0;
        this.spiralOn = O.spiralDur;
        g.sink.emit('bossTelegraph', this.x, this.y, 5, 0);
      }
      if (this.spiralOn > 0) {
        this.spiralOn -= t;
        this.spiralAngle += ((O.spiralRot * Math.PI) / 180) * t;
        this.spiralEmit += t;
        const gap = 1 / O.spiralRate;
        while (this.spiralEmit >= gap) {
          this.spiralEmit -= gap;
          for (let a = 0; a < O.spiralArms; a++) {
            const ang = this.spiralAngle + (a / O.spiralArms) * Math.PI * 2;
            g.bulletsSys.spawn(this.x + Math.cos(ang) * O.r, this.y + Math.sin(ang) * O.r, Math.cos(ang) * O.spiralSpeed, Math.sin(ang) * O.spiralSpeed, 6, true);
          }
        }
      }
      if (g.rng.chance(dt * 0.8)) this.glitch = 0.12;
    }
  }

  private enterPhase(p: number): void {
    const g = this.g;
    this.phase = p;
    g.sink.emit('bossPhase', this.x, this.y, p, 1);
    if (p === 3) {
      for (const c of this.cells) {
        if (c.alive) g.sink.emit('bossShieldBreak', c.x, c.y, 0, 0);
        c.alive = false;
        c.regenT = 1e9;
      }
      g.formation.fixedBeats = O.rowBeats3;
      this.riseT = 0;
      this.spiralT = O.spiralEvery - 1.5;
    }
    this.glitch = 0.3;
  }
}
