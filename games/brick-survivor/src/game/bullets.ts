// Enemy bullets, lasers and telegraph lines (docs §3.7 turret, §3.11 bosses).
import { config } from '../config';
import type { Game } from './game';

const F = config.field;

export class Bullet {
  alive = false;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  r = 6;
  blockable = false;
  age = 0;
}

export class Laser {
  alive = false;
  x = 0;
  y0 = 0;
  warnT = 0;
  warnDur = 1;
  activeT = 0;
  activeDur = 0.6;
  hit = false;
}

export const TG_LINE = 0;
export const TG_COLUMN = 1;
export const TG_CELL = 2;

export class Telegraph {
  alive = false;
  kind = TG_LINE;
  x1 = 0;
  y1 = 0;
  x2 = 0;
  y2 = 0;
  t = 0;
  dur = 1;
  w = 1;
}

export class Bullets {
  readonly pool: Bullet[] = [];
  readonly lasers: Laser[] = [];
  readonly tele: Telegraph[] = [];
  count = 0;
  constructor(private g: Game) {
    for (let i = 0; i < config.bullets.max; i++) this.pool.push(new Bullet());
    for (let i = 0; i < 6; i++) this.lasers.push(new Laser());
    for (let i = 0; i < 32; i++) this.tele.push(new Telegraph());
  }
  reset(): void {
    for (const b of this.pool) b.alive = false;
    for (const l of this.lasers) l.alive = false;
    for (const t of this.tele) t.alive = false;
    this.count = 0;
  }
  spawn(x: number, y: number, vx: number, vy: number, r: number, blockable: boolean): void {
    for (const b of this.pool) {
      if (b.alive) continue;
      b.alive = true;
      b.x = b.px = x;
      b.y = b.py = y;
      b.vx = vx;
      b.vy = vy;
      b.r = r;
      b.blockable = blockable;
      b.age = 0;
      this.count++;
      return;
    }
  }
  /** fan of n bullets centred on the direction to (tx,ty) */
  fan(x: number, y: number, tx: number, ty: number, n: number, spreadDeg: number, speed: number, r = 6): void {
    const base = Math.atan2(ty - y, tx - x);
    const sp = (spreadDeg * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? base : base - sp / 2 + (sp * i) / (n - 1);
      this.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, r, true);
    }
  }
  ring(x: number, y: number, n: number, speed: number, phase = 0): void {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      this.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 6, true);
    }
  }
  kill(b: Bullet): void {
    if (!b.alive) return;
    b.alive = false;
    this.count--;
  }
  laser(x: number, y0: number, warn: number, active: number): void {
    for (const l of this.lasers) {
      if (l.alive) continue;
      l.alive = true;
      l.x = x;
      l.y0 = y0;
      l.warnT = 0;
      l.warnDur = warn;
      l.activeT = 0;
      l.activeDur = active;
      l.hit = false;
      return;
    }
  }
  telegraph(kind: number, x1: number, y1: number, x2: number, y2: number, dur: number, w = 1): void {
    for (const t of this.tele) {
      if (t.alive) continue;
      t.alive = true;
      t.kind = kind;
      t.x1 = x1;
      t.y1 = y1;
      t.x2 = x2;
      t.y2 = y2;
      t.t = 0;
      t.dur = dur;
      t.w = w;
      return;
    }
  }
  clearAll(): void {
    for (const b of this.pool) if (b.alive) this.kill(b);
    for (const l of this.lasers) l.alive = false;
    for (const t of this.tele) t.alive = false;
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player;
    const f = g.formation;
    const half = g.stats.paddleW * 0.5 * config.player.hitboxW;
    const top = F.catchY - config.player.hitboxTop;
    const bot = F.catchY + config.player.hitboxBottom;
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > config.world.height + 20 || b.y < -40 || b.x < -20 || b.x > config.world.width + 20) {
        this.kill(b);
        continue;
      }
      if (b.blockable && b.y > F.ceilY && b.age > 0.12) {
        const br = f.brickAtPoint(b.x, b.y);
        if (br) {
          this.kill(b);
          g.sink.emit('bulletIntercept', b.x, b.y, 1, 0);
          continue;
        }
      }
      if (p.alive) {
        const cx = Math.max(p.x - half, Math.min(b.x, p.x + half));
        const cy = Math.max(top, Math.min(b.y, bot));
        const dx = b.x - cx;
        const dy = b.y - cy;
        if (dx * dx + dy * dy < b.r * b.r) {
          this.kill(b);
          g.damagePlayer(config.bullets.dmg, 'bullet', b.x, b.y);
        }
      }
    }
    for (const l of this.lasers) {
      if (!l.alive) continue;
      if (l.warnT < l.warnDur) {
        l.warnT += dt;
        if (l.warnT >= l.warnDur) g.sink.emit('laserFire', l.x, F.floorY, 0, 0);
        continue;
      }
      l.activeT += dt;
      if (!l.hit && p.alive && Math.abs(p.x - l.x) < config.bosses.omega.laserW * 0.5 + half * 0.6) {
        l.hit = true;
        g.damagePlayer(config.bullets.laserDmg, 'laser', p.x, F.catchY);
      }
      if (l.activeT >= l.activeDur) l.alive = false;
    }
    for (const t of this.tele) {
      if (!t.alive) continue;
      t.t += dt;
      if (t.t >= t.dur) t.alive = false;
    }
  }
}
