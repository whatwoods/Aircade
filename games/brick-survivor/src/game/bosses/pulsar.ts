// Boss 2 · PULSAR — waypoint patrol, aimed fans, dive + ring, splits into twin stars (docs §3.11).
import { config } from '../../config';
import { ease } from '../../core/ease';
import { TG_COLUMN, TG_LINE } from '../bullets';
import type { Game } from '../game';
import { Boss, PART_CORE } from './boss';
import type { BossPart } from './boss';

const P = config.bosses.pulsar;
const F = config.field;

type StarState = 'travel' | 'dwell' | 'diveWarn' | 'dive' | 'hover' | 'return';

class Star {
  state: StarState = 'dwell';
  t = 0;
  wp = 1;
  fromX = 195;
  toX = 195;
  fromY: number = P.y;
  fired = false;
  warned = false;
  dir = 1;
  constructor(public part: BossPart) {}
}

export class Pulsar extends Boss {
  readonly kind = 'pulsar' as const;
  readonly name = '脉冲星';
  readonly en = 'PULSAR';
  stars: Star[] = [];
  diveT = 0;
  split = false;
  enraged = false;
  pulse = 0;

  constructor(g: Game, hpMult: number) {
    super(g);
    this.hpMult = hpMult;
    this.maxHp = this.hp = P.hp * hpMult;
    this.ticks = [P.splitAt];
    this.homeY = P.y;
    const core = this.addPart(PART_CORE, P.r, this.maxHp);
    this.stars.push(new Star(core));
  }

  protected placeIntro(p: number): void {
    this.x = 195;
    this.y = config.bosses.intro.startY + (P.y - config.bosses.intro.startY) * p;
    const s = this.stars[0]!;
    s.part.x = this.x;
    s.part.y = this.y;
  }

  beginFight(): void {
    this.g.formation.mode = 'hold';
    const s = this.stars[0]!;
    s.state = 'dwell';
    s.t = 0;
    s.wp = 1;
  }

  protected override partVuln(p: BossPart): number {
    for (const s of this.stars) if (s.part === p && s.state === 'hover') return P.hoverVuln;
    return 0;
  }

  private timeMult(): number {
    let m = this.split ? 1 / P.childSpeed : 1;
    if (this.enraged) m *= 1 - P.enrage;
    return m;
  }

  protected fight(dt: number): void {
    const g = this.g;
    const t = dt * this.speedMult();
    this.pulse += dt;
    if (!this.split && this.hp <= this.maxHp * P.splitAt) this.doSplit();
    if (!this.split) this.diveT += t;
    const tm = this.timeMult();
    for (const s of this.stars) {
      if (!s.part.alive) continue;
      s.t += t;
      const part = s.part;
      switch (s.state) {
        case 'travel': {
          const dur = P.travel * tm;
          const p = Math.min(1, s.t / dur);
          part.x = s.fromX + (s.toX - s.fromX) * ease.inOutSine(p);
          part.y = P.y + Math.sin(this.pulse * 1.3 + part.index) * 4;
          if (p >= 1) this.enter(s, 'dwell');
          break;
        }
        case 'dwell': {
          part.y = P.y + Math.sin(this.pulse * 1.3 + part.index) * 4;
          const warn = P.fanWarn;
          if (!s.warned && this.attacking()) {
            s.warned = true;
            const n = this.split ? P.childFan : P.fanCount;
            const base = Math.atan2(F.catchY - part.y, g.player.x - part.x);
            const sp = (P.fanSpread * Math.PI) / 180;
            for (let i = 0; i < n; i++) {
              const a = base - sp / 2 + (sp * i) / (n - 1);
              g.bulletsSys.telegraph(TG_LINE, part.x, part.y, part.x + Math.cos(a) * 900, part.y + Math.sin(a) * 900, warn, 1);
            }
            part.warnT = warn;
            g.sink.emit('bossTelegraph', part.x, part.y, 0, 0);
          }
          if (s.warned && !s.fired && s.t >= warn) {
            s.fired = true;
            const n = this.split ? P.childFan : P.fanCount;
            g.bulletsSys.fan(part.x, part.y, g.player.x, F.catchY, n, P.fanSpread, P.fanSpeed);
            g.sink.emit('enemyShot', part.x, part.y, 2, 0);
          }
          if (s.t >= P.dwell * tm + (s.warned ? 0 : 0)) {
            if (!this.split && this.diveT >= P.diveEvery && this.attacking()) {
              this.enter(s, 'diveWarn');
              g.bulletsSys.telegraph(TG_COLUMN, part.x, part.y, part.x, F.floorY, P.diveWarn, P.r * 2);
              g.sink.emit('bossTelegraph', part.x, part.y, 3, 0);
            } else this.nextWaypoint(s);
          }
          break;
        }
        case 'diveWarn':
          part.x += Math.sin(this.pulse * 40) * 0.6;
          if (s.t >= P.diveWarn) {
            s.fromY = part.y;
            this.enter(s, 'dive');
          }
          break;
        case 'dive': {
          const p = Math.min(1, s.t / P.diveTime);
          part.y = s.fromY + (P.diveY - s.fromY) * ease.inQuad(p);
          if (p >= 1) {
            g.bulletsSys.ring(part.x, part.y, P.ringCount, P.ringSpeed, this.pulse);
            g.sink.emit('enemyShot', part.x, part.y, 3, 0);
            g.sink.emit('bossArrive', part.x, part.y, 2, 0);
            this.enter(s, 'hover');
          }
          break;
        }
        case 'hover':
          part.y = P.diveY + Math.sin(this.pulse * 6) * 3;
          if (s.t >= P.hover) {
            s.fromY = part.y;
            this.enter(s, 'return');
          }
          break;
        case 'return': {
          const p = Math.min(1, s.t / P.returnTime);
          part.y = s.fromY + (P.y - s.fromY) * ease.inOutCubic(p);
          if (p >= 1) {
            this.diveT = 0;
            this.nextWaypoint(s);
          }
          break;
        }
      }
    }
    // anchor for camera / bar
    let ax = 0;
    let ay = 0;
    let n = 0;
    for (const s of this.stars) {
      if (!s.part.alive) continue;
      ax += s.part.x;
      ay += s.part.y;
      n++;
    }
    if (n > 0) {
      this.x = ax / n;
      this.y = ay / n;
    }
  }

  private enter(s: Star, st: StarState): void {
    s.state = st;
    s.t = 0;
    s.fired = false;
    s.warned = false;
  }

  private nextWaypoint(s: Star): void {
    const xs = P.xs;
    let nw = s.wp + s.dir;
    if (nw < 0 || nw >= xs.length) {
      s.dir = -s.dir;
      nw = s.wp + s.dir;
    }
    s.fromX = s.part.x;
    s.toX = xs[nw]!;
    s.wp = nw;
    this.enter(s, 'travel');
  }

  private doSplit(): void {
    const g = this.g;
    this.split = true;
    this.phase = 2;
    const main = this.stars[0]!.part;
    main.alive = false;
    const half = this.hp / 2;
    const a = this.addPart(PART_CORE, P.childR, half);
    const b = this.addPart(PART_CORE, P.childR, half);
    a.x = main.x - 20;
    b.x = main.x + 20;
    a.y = b.y = main.y;
    a.px = a.x;
    b.px = b.x;
    a.py = b.py = a.y;
    const sa = new Star(a);
    const sb = new Star(b);
    sa.wp = 0;
    sb.wp = 2;
    sa.dir = 1;
    sb.dir = -1;
    sa.fromX = a.x;
    sa.toX = P.xs[0]!;
    sb.fromX = b.x;
    sb.toX = P.xs[2]!;
    sa.state = 'travel';
    sb.state = 'travel';
    sb.t = -P.travel * 0.5;
    this.stars = [sa, sb];
    g.sink.emit('bossPhase', main.x, main.y, 2, 1);
  }

  protected override onDamaged(p: BossPart): void {
    if (!this.split || p.hp > 0 || !p.alive) return;
    p.alive = false;
    this.g.sink.emit('bossShieldBreak', p.x, p.y, 1, 0);
    if (this.hp > 0 && !this.enraged) {
      this.enraged = true;
      this.g.sink.emit('bossPhase', p.x, p.y, 3, 0);
    }
  }
}
