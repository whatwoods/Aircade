// Boss base: parts (circle hitboxes), HP / phases, intro, crush, elemental effects, damage routing (docs §3.11).
import { config } from '../../config';
import type { BossKind } from '../../types';
import type { Ball } from '../balls';
import { KIND_SHARD, KIND_DART } from '../balls';
import type { Game } from '../game';

export const PART_CORE = 0;
export const PART_PLATE = 1; // absorbs hits (monolith plates, omega cells)
export const PART_HEAD = 2;
export const PART_SEG = 3;

const ST = config.status;

export class BossPart {
  alive = true;
  kind = PART_CORE;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  r = 10;
  hits = 0;
  maxHits = 0;
  hp = 0;
  maxHp = 0;
  flashT = 0;
  warnT = 0;
  regenT = 0;
  grow = 1;
  burnStacks = 0;
  burnT = 0;
  burnTick = 0;
  /** serpent chain links */
  next = -1;
  prev = -1;
  snake = -1;
  angle = 0;
  constructor(public readonly index: number) {}
}

export type BossState = 'warn' | 'descend' | 'fight' | 'dead';

export abstract class Boss {
  readonly parts: BossPart[] = [];
  state: BossState = 'warn';
  stateT = 0;
  fightT = 0;
  x = 195;
  y: number = config.bosses.intro.startY;
  homeX = 195;
  homeY = 200;
  hp = 1;
  maxHp = 1;
  phase = 1;
  /** HP fractions where the bar shows ticks */
  ticks: number[] = [];
  chill = 0;
  chillT = 0;
  tookDamage = false;
  vuln = 0;
  hpMult = 1;
  abstract readonly kind: BossKind;
  abstract readonly name: string;
  abstract readonly en: string;
  /** boss bodies crush overlapping bricks (serpent overrides) */
  crushes = true;

  constructor(protected g: Game) {}

  protected addPart(kind: number, r: number, hp = 0, hits = 0): BossPart {
    const p = new BossPart(this.parts.length);
    p.kind = kind;
    p.r = r;
    p.hp = p.maxHp = hp;
    p.hits = p.maxHits = hits;
    this.parts.push(p);
    return p;
  }

  speedMult(): number {
    return 1 - Math.min(ST.bossChillMax, ST.bossChillPer * this.chill);
  }

  hpFrac(): number {
    return Math.max(0, this.hp / this.maxHp);
  }

  /** intro: called during descend with eased progress 0..1 */
  protected abstract placeIntro(p: number): void;
  protected abstract fight(dt: number): void;
  /** formation behaviour once the fight begins */
  abstract beginFight(): void;

  update(dt: number): void {
    const I = config.bosses.intro;
    for (const p of this.parts) {
      p.px = p.x;
      p.py = p.y;
      if (p.flashT > 0) p.flashT -= dt;
      if (p.warnT > 0) p.warnT -= dt;
    }
    this.stateT += dt;
    if (this.state === 'warn') {
      this.placeIntro(0);
      if (this.stateT >= I.warn) {
        this.state = 'descend';
        this.stateT = 0;
        this.g.sink.emit('bossArrive', this.homeX, this.homeY, 0, 0);
      }
    } else if (this.state === 'descend') {
      const p = Math.min(1, this.stateT / I.descend);
      const e = 1 - Math.pow(1 - p, 3);
      this.placeIntro(e);
      this.crushOverlaps();
      if (p >= 1) {
        this.state = 'fight';
        this.stateT = 0;
        this.fightT = -I.attackDelay;
        this.g.sink.emit('bossArrive', this.x, this.y, 1, 0);
        this.beginFight();
        this.g.onBossFightBegin();
      }
    } else if (this.state === 'fight') {
      this.fightT += dt;
      if (this.chill > 0) {
        this.chillT -= dt;
        if (this.chillT <= 0) this.chill = 0;
      }
      this.fight(dt);
      for (const p of this.parts) {
        if (!p.alive || p.burnStacks <= 0) continue;
        p.burnT -= dt;
        p.burnTick += dt;
        if (p.burnTick >= ST.burnTick) {
          p.burnTick -= ST.burnTick;
          const f = this.g.stats.fire;
          if (f) this.applyDamage(p, p.burnStacks * f.dps * ST.burnTick * config.ball.baseDamage * this.g.stats.dmgMult, false);
        }
        if (p.burnT <= 0) p.burnStacks = 0;
      }
      if (this.crushes) this.crushOverlaps();
    }
    for (const p of this.parts) {
      if (!p.alive) continue;
      if (dt > 0) {
        p.vx = (p.x - p.px) / dt;
        p.vy = (p.y - p.py) / dt;
      }
    }
  }

  /** whether attacks may run (fight started and the attack delay elapsed) */
  protected attacking(): boolean {
    return this.state === 'fight' && this.fightT >= 0 && this.g.hostile();
  }

  crushOverlaps(): void {
    const f = this.g.formation;
    for (const p of this.parts) {
      if (!p.alive || (p.kind !== PART_CORE && p.kind !== PART_HEAD)) continue;
      if (p.y + p.r < config.field.ceilY) continue;
      const ids = this.g.scratchIds;
      const n = f.query(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r, ids);
      for (let i = 0; i < n; i++) {
        const b = f.bricks[ids[i]!]!;
        if (!b.alive) continue;
        const cx = Math.max(f.left(b), Math.min(p.x, f.right(b)));
        const cy = Math.max(f.top(b), Math.min(p.y, f.bottom(b)));
        const dx = p.x - cx;
        const dy = p.y - cy;
        if (dx * dx + dy * dy < p.r * p.r * 0.9) this.g.bricksSys.crush(b);
      }
    }
  }

  collideBall(b: Ball): void {
    if (this.state !== 'fight') return;
    const balls = this.g.balls;
    for (const p of this.parts) {
      if (!p.alive || p.grow < 0.6) continue;
      if (balls.reflectCircle(b, p.x, p.y, p.r, p.vx, p.vy)) this.hitByBall(p, b);
    }
  }

  protected hitByBall(p: BossPart, b: Ball): void {
    const g = this.g;
    const st = g.stats;
    g.addCombo(1);
    b.lastEventT = g.time;
    p.flashT = 0.05;
    const dmg = g.ballDamage(b);
    if (p.kind === PART_PLATE) {
      p.hits--;
      g.sink.emit('bossHit', p.x, p.y, -p.index - 1, 0);
      if (p.hits <= 0) this.breakPlate(p);
      g.balls.afterHit(b, 0, 1);
      return;
    }
    this.applyDamage(p, dmg, true);
    if ((b.element === 'fire' || b.element === 'nova') && st.fire) {
      p.burnStacks = Math.min(st.fire.maxStacks, p.burnStacks + 1);
      p.burnT = st.fire.dur;
    }
    if (b.element === 'ice' && st.ice) {
      this.chill = Math.min(Math.round(ST.bossChillMax / ST.bossChillPer), this.chill + 1);
      this.chillT = ST.bossChillDur;
    }
    if ((b.element === 'blast' || b.element === 'nova') && st.blast && b.blastCd <= 0 && b.kind !== KIND_SHARD && b.kind !== KIND_DART) {
      b.blastCd = ST.blastCooldown;
      const r = st.blast.radius * (st.evo.supernova ? config.evolutions.supernova.radiusMult : 1);
      g.bricksSys.explode(b.x, b.y, r, dmg * st.blast.mult, -1, 0, 0);
    }
    g.balls.afterHit(b, 0, 1);
  }

  protected breakPlate(p: BossPart): void {
    p.alive = false;
    p.regenT = this.plateRegen();
    this.g.sink.emit('bossShieldBreak', p.x, p.y, 0, 0);
  }

  protected plateRegen(): number {
    return 6;
  }

  /** explosion overlapping boss parts: damage only parts with HP */
  aoe(x: number, y: number, r: number, dmg: number): void {
    if (this.state !== 'fight') return;
    for (const p of this.parts) {
      if (!p.alive || p.kind === PART_PLATE) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const rr = r + p.r;
      if (dx * dx + dy * dy < rr * rr) this.applyDamage(p, dmg, false);
    }
  }

  applyDamage(p: BossPart, raw: number, direct: boolean): void {
    if (this.state !== 'fight' || this.hp <= 0) return;
    let d = raw * (1 + this.vuln + this.partVuln(p));
    if (p.maxHp > 0) {
      d = Math.min(d, Math.max(0, p.hp));
      p.hp -= d;
    }
    if (d <= 0) return;
    this.hp = Math.max(0, this.hp - d);
    this.g.runStats.damage += d;
    if (direct) this.g.sink.emit('bossHit', p.x, p.y, p.index, d);
    this.onDamaged(p);
    // float residue (part HPs sum to maxHp) or no damageable part left → dead
    if (this.hp <= this.maxHp * 1e-6 || !this.hasHpLeft()) this.hp = 0;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.g.onBossDefeated(this);
    }
  }

  /** false when every part carries its own HP pool and all of them are spent */
  private hasHpLeft(): boolean {
    let pooled = false;
    for (const q of this.parts) {
      if (q.maxHp <= 0) {
        if (q.alive) return true;
        continue;
      }
      pooled = true;
      if (q.alive && q.hp > 0) return true;
    }
    return !pooled;
  }

  protected partVuln(_p: BossPart): number {
    return 0;
  }
  protected onDamaged(_p: BossPart): void {}

  /** homing target: nearest alive damageable part */
  targetPart(x: number, y: number): number {
    let best = -1;
    let bd = 1e12;
    for (const p of this.parts) {
      if (!p.alive) continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) {
        bd = d;
        best = p.index;
      }
    }
    return best;
  }

  /** debug: jump HP to a fraction */
  setHpFrac(frac: number): void {
    if (this.state !== 'fight') return;
    let delta = this.hp - this.maxHp * Math.max(0, Math.min(1, frac));
    for (let i = this.parts.length - 1; i >= 0 && delta > 0.5; i--) {
      const p = this.parts[i]!;
      if (!p.alive || p.maxHp <= 0) continue;
      const take = Math.min(delta, frac <= 0 ? p.hp : Math.max(0, p.hp - 1));
      if (take <= 0) continue;
      delta -= take;
      this.applyDamage(p, take / (1 + this.vuln + this.partVuln(p)), false);
      if (this.state !== 'fight') return;
    }
  }

  center(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}
