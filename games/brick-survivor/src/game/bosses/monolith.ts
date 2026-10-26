// Boss 1 · MONOLITH — rides the conveyor, slams the danger line, plates, summons, prism shots (docs §3.11).
import { config } from '../../config';
import { ease } from '../../core/ease';
import { TG_CELL } from '../bullets';
import type { Game } from '../game';
import { Boss, PART_CORE, PART_PLATE } from './boss';
import type { BossPart } from './boss';

const M = config.bosses.monolith;
const F = config.field;
const G = config.grid;

export class Monolith extends Boss {
  readonly kind = 'monolith' as const;
  readonly name = '方碑';
  readonly en = 'MONOLITH';
  core: BossPart;
  plates: BossPart[] = [];
  orbit = 0;
  baseScroll = 0;
  riseOffset = 0;
  riseT = 1;
  summonT = 0;
  summonPending = false;
  summonCells: number[] = [];
  shotT = 0;
  shotA = -1;
  shotB = -1;
  shotWarn = 0;
  sway = 0;
  eyeX = 0;
  /** true while the next conveyor step will slam the danger line (telegraph) */
  slamArmed = false;

  constructor(g: Game, hpMult: number) {
    super(g);
    this.hpMult = hpMult;
    this.maxHp = this.hp = M.hp * hpMult;
    this.ticks = [M.phase2];
    this.homeY = M.homeY;
    this.core = this.addPart(PART_CORE, M.coreR, this.maxHp);
    for (let i = 0; i < M.plates; i++) this.plates.push(this.addPart(PART_PLATE, M.plateR, 0, M.plateHits));
  }

  protected override plateRegen(): number {
    return M.plateRegen;
  }

  private placePlates(): void {
    for (let i = 0; i < this.plates.length; i++) {
      const p = this.plates[i]!;
      const a = this.orbit + (i / this.plates.length) * Math.PI * 2;
      p.angle = a;
      p.x = this.x + Math.cos(a) * M.plateOrbit;
      p.y = this.y + Math.sin(a) * M.plateOrbit;
    }
    this.core.x = this.x;
    this.core.y = this.y;
  }

  protected placeIntro(p: number): void {
    this.x = 195;
    this.y = config.bosses.intro.startY + (this.homeY - config.bosses.intro.startY) * p;
    this.orbit += 0.02;
    this.placePlates();
  }

  beginFight(): void {
    const f = this.g.formation;
    f.mode = 'conveyor';
    f.fixedBeats = M.stepBeats;
    f.stepTimer = 0;
    f.armed = false;
    this.baseScroll = f.scroll;
  }

  protected fight(dt: number): void {
    const g = this.g;
    const f = g.formation;
    const sm = this.speedMult();
    const t = dt * sm;
    this.sway += t;
    this.x = 195 + M.swayAmp * Math.sin((2 * Math.PI * this.sway) / M.swayPeriod);
    if (this.riseT < 1) this.riseT = Math.min(1, this.riseT + dt / M.slamReturn);
    const rise = this.riseOffset * (1 - ease.inOutCubic(this.riseT));
    this.y = this.homeY + (f.scroll - this.baseScroll) * G.cellH + rise;
    const p2 = this.hp <= this.maxHp * M.phase2;
    if (p2 && this.phase === 1) {
      this.phase = 2;
      g.sink.emit('bossPhase', this.x, this.y, 2, 0);
    }
    this.orbit += ((p2 ? M.plateSpeed2 : M.plateSpeed) * Math.PI) / 180 * t;
    this.placePlates();
    this.eyeX += (Math.max(-1, Math.min(1, (g.player.x - this.x) / 160)) - this.eyeX) * Math.min(1, dt * 6);

    // plate regen
    for (const p of this.plates) {
      if (p.alive) {
        if (p.grow < 1) p.grow = Math.min(1, p.grow + dt / M.regenAnim);
        continue;
      }
      p.regenT -= dt;
      if (p.regenT <= 0) {
        p.alive = true;
        p.hits = p.maxHits;
        p.grow = 0;
      }
    }

    // slam telegraph: armed when the next step lands on the line
    const armed = this.slamSteps() <= 1;
    if (armed && !this.slamArmed) {
      g.sink.emit('breachWarn', this.x, F.dangerY, -1, 0);
      this.core.warnT = 0.6;
    }
    this.slamArmed = armed;
    // slam
    if (this.riseT >= 1 && this.y + M.coreR >= F.dangerY) {
      g.damagePlayer(M.slamDmg, 'slam', this.x, F.dangerY);
      g.sink.emit('slam', this.x, F.dangerY, 0, 0);
      this.riseOffset = this.y - this.homeY;
      this.riseT = 0;
      this.baseScroll = f.scroll;
    }
    if (!this.attacking()) return;

    // summon
    this.summonT += t;
    if (!this.summonPending && this.summonT >= M.summonEvery - M.summonWarn) {
      this.summonPending = true;
      this.pickSummonCells();
      for (let i = 0; i < this.summonCells.length; i += 2) {
        const c = this.summonCells[i]!;
        const r = this.summonCells[i + 1]!;
        const x = G.x0 + (c + 0.5) * G.cellW;
        const y = f.cellTop(r) + G.cellH / 2;
        g.bulletsSys.telegraph(TG_CELL, x, y, r, c, M.summonWarn, 1);
      }
      this.core.warnT = M.summonWarn;
      g.sink.emit('bossTelegraph', this.x, this.y, 1, 0);
    }
    if (this.summonPending && this.summonT >= M.summonEvery) {
      this.summonT = 0;
      this.summonPending = false;
      for (let i = 0; i < this.summonCells.length; i += 2) {
        const b = f.spawn('basic', this.summonCells[i]!, this.summonCells[i + 1]!, M.summonHp * this.hpMult);
        if (b) g.sink.emit('summon', f.cx(b), f.cy(b), 0, 0);
      }
    }

    // phase 2 prism shots
    if (this.phase === 2) {
      this.shotT += t;
      if (this.shotA < 0 && this.shotT >= M.shotEvery - M.shotWarn) {
        const alive = this.plates.filter((p) => p.alive && p.grow >= 1);
        if (alive.length > 0) {
          const a = alive[g.rng.int(0, alive.length - 1)]!;
          const b = alive.length > 1 ? alive.filter((p) => p !== a)[g.rng.int(0, alive.length - 2)]! : a;
          this.shotA = a.index;
          this.shotB = b.index;
          a.warnT = M.shotWarn;
          b.warnT = M.shotWarn;
          g.sink.emit('bossTelegraph', this.x, this.y, 2, 0);
        } else this.shotT = 0;
      }
      if (this.shotT >= M.shotEvery) {
        this.shotT = 0;
        for (const idx of [this.shotA, this.shotB]) {
          const p = this.parts[idx];
          if (!p || !p.alive) continue;
          g.bulletsSys.fan(p.x, p.y, g.player.x, F.catchY, 1, 0, M.shotSpeed);
          g.sink.emit('enemyShot', p.x, p.y, 1, 0);
          if (this.shotA === this.shotB) break;
        }
        this.shotA = this.shotB = -1;
      }
    }
  }

  /** conveyor steps left before the slam (0 = now, 99 = still rising back) */
  slamSteps(): number {
    if (this.state !== 'fight' || this.riseT < 1) return 99;
    const gap = F.dangerY - (this.homeY + (this.g.formation.scroll - this.baseScroll) * G.cellH + M.coreR);
    return gap <= 0 ? 0 : Math.ceil(gap / G.cellH - 1e-3);
  }

  private pickSummonCells(): void {
    const f = this.g.formation;
    this.summonCells.length = 0;
    const k0 = Math.floor((this.y + M.coreR - F.ceilY) / G.cellH) + 2;
    const opts: number[] = [];
    for (let k = k0; k <= k0 + 1; k++) {
      if (k < 0 || k >= G.visibleRows - 2) continue;
      const r = f.rowAbsForDisplay(k);
      for (let c = 0; c < G.cols; c++) if (!f.occupied(c, r)) opts.push(c, r);
    }
    for (let i = 0; i < M.summonCount && opts.length > 0; i++) {
      const j = this.g.rng.int(0, opts.length / 2 - 1) * 2;
      this.summonCells.push(opts[j]!, opts[j + 1]!);
      opts.splice(j, 2);
    }
  }
}
