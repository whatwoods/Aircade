// Magazine, firing, element cycle, sub-stepped physics, catch/charge, shards/echoes/darts (docs §3.4–3.5, §2.4).
import { config } from '../config';
import type { ElementId } from '../types';
import { elementIndex } from '../types';
import type { Game } from './game';

const F = config.field;
const BC = config.ball;
const CC = config.catch;
const DEG = Math.PI / 180;
const MIN_SIN = Math.sin(BC.minAngleDeg * DEG);
const MIN_COS = Math.cos(BC.minAngleDeg * DEG);

export const KIND_MAIN = 0;
export const KIND_SHARD = 1;
export const KIND_ECHO = 2;
export const KIND_DART = 3;

const TRAIL_MAX = 14;
const RECENT = 6;

export class Ball {
  alive = false;
  kind = KIND_MAIN;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  speed = 600;
  r: number = BC.radius;
  element: ElementId = 'none';
  charges = 0;
  pierceLeft = 0;
  life = 0;
  age = 0;
  blastCd = 0;
  target = -1;
  retargetT = 0;
  hitsSinceDart = 0;
  lastEventT = 0;
  readonly recentIds = new Int32Array(RECENT).fill(-9);
  readonly recentT = new Float32Array(RECENT);
  recentHead = 0;
  readonly trail = new Float32Array(TRAIL_MAX * 2);
  trailHead = 0;
  trailCount = 0;
  trailDist = 0;
  catchT = 0;
  hue = 0;
  constructor(public readonly id: number) {}

  resetTrail(): void {
    this.trailHead = 0;
    this.trailCount = 0;
    this.trailDist = 0;
    this.pushTrail();
  }
  pushTrail(): void {
    this.trail[this.trailHead * 2] = this.x;
    this.trail[this.trailHead * 2 + 1] = this.y;
    this.trailHead = (this.trailHead + 1) % TRAIL_MAX;
    if (this.trailCount < TRAIL_MAX) this.trailCount++;
  }
}

export class Balls {
  readonly pool: Ball[] = [];
  owned: number = BC.startCount;
  magazine: number = BC.startCount;
  readonly reload = new Float32Array(BC.maxMain + 4);
  reloadCount = 0;
  fireT = 0;
  patternIdx = 0;
  shards = 0;
  echoes = 0;
  darts = 0;
  mainInFlight = 0;
  canFire = true;
  recovered = 0;
  stuck = 0;
  perfectHitstopT = 0;
  private ids = new Int32Array(8);

  constructor(private g: Game) {
    const n = BC.maxMain + config.shard.pool + config.echo.cap;
    for (let i = 0; i < n; i++) this.pool.push(new Ball(i));
  }

  reset(): void {
    for (const b of this.pool) b.alive = false;
    this.owned = this.g.stats.ballCount;
    this.magazine = this.owned;
    this.reloadCount = 0;
    this.fireT = 0;
    this.patternIdx = 0;
    this.shards = 0;
    this.echoes = 0;
    this.darts = 0;
    this.mainInFlight = 0;
    this.canFire = true;
  }

  /** called when Stats change; grants new main balls straight into the magazine */
  syncOwned(): void {
    const want = this.g.stats.ballCount;
    if (want > this.owned) {
      this.magazine += want - this.owned;
      this.owned = want;
    }
    for (const b of this.pool) if (b.alive) b.speed = this.speedFor(b);
  }

  private speedFor(b: Ball): number {
    const s = this.g.stats.ballSpeed;
    return b.kind === KIND_DART ? s * config.dart.speedMult : s;
  }

  private alloc(): Ball | null {
    for (const b of this.pool) if (!b.alive) return b;
    return null;
  }

  private nextElement(): ElementId {
    const cyc = this.g.elementCycle;
    if (cyc.length === 0) return 'none';
    const e = cyc[this.g.cycleIdx % cyc.length]!;
    this.g.cycleIdx++;
    return e;
  }
  peekElement(): ElementId {
    const cyc = this.g.elementCycle;
    if (cyc.length === 0) return 'none';
    return cyc[this.g.cycleIdx % cyc.length]!;
  }

  fire(): void {
    const g = this.g;
    const b = this.alloc();
    if (!b) return;
    const p = g.player;
    const spread = BC.spreadPatternDeg[this.patternIdx % BC.spreadPatternDeg.length]!;
    this.patternIdx++;
    const eng = Math.max(-BC.fireEnglishMaxDeg, Math.min(BC.fireEnglishMaxDeg, p.vx * CC.englishDegPerUps * BC.fireEnglishFactor));
    const th = (spread + eng) * DEG;
    this.init(b, KIND_MAIN, p.x, F.catchY - config.player.muzzleOffset, Math.sin(th), -Math.cos(th));
    b.element = this.nextElement();
    b.charges = 0;
    b.pierceLeft = g.stats.pierce;
    this.magazine--;
    this.mainInFlight++;
    g.player.recoil = 1;
    g.sink.emit('fire', b.x, b.y, elementIndex(b.element), 0);
  }

  private init(b: Ball, kind: number, x: number, y: number, dx: number, dy: number): void {
    b.alive = true;
    b.kind = kind;
    b.x = b.px = x;
    b.y = b.py = y;
    b.speed = kind === KIND_DART ? this.g.stats.ballSpeed * config.dart.speedMult : this.g.stats.ballSpeed;
    b.vx = dx * b.speed;
    b.vy = dy * b.speed;
    b.r = kind === KIND_SHARD || kind === KIND_DART ? config.shard.radius : BC.radius;
    b.life = kind === KIND_SHARD ? config.shard.lifetime : kind === KIND_DART ? config.dart.lifetime : 0;
    b.age = 0;
    b.blastCd = 0;
    b.target = -1;
    b.retargetT = 0;
    b.hitsSinceDart = 0;
    b.lastEventT = this.g.time;
    b.recentIds.fill(-9);
    b.recentHead = 0;
    b.charges = 0;
    b.pierceLeft = 0;
    b.catchT = 0;
    b.hue = (b.id * 47) % 360;
    b.resetTrail();
    if (kind === KIND_SHARD) this.shards++;
    else if (kind === KIND_ECHO) this.echoes++;
    else if (kind === KIND_DART) this.darts++;
  }

  private release(b: Ball): void {
    if (!b.alive) return;
    b.alive = false;
    if (b.kind === KIND_SHARD) this.shards--;
    else if (b.kind === KIND_ECHO) this.echoes--;
    else if (b.kind === KIND_DART) this.darts--;
    else this.mainInFlight--;
  }

  /** main ball missed or recovered: goes back through the reload queue */
  private recycleMain(b: Ball, delay: number): void {
    this.release(b);
    if (delay <= 0) this.magazine++;
    else this.reload[this.reloadCount++] = delay;
  }

  spawnSplit(src: Ball, nx: number, ny: number): void {
    const g = this.g;
    const st = g.stats;
    const swarm = st.evo.swarm;
    const cap = swarm ? config.dart.cap : config.shard.cap;
    for (let i = 0; i < st.splitCount; i++) {
      if (this.shards + this.darts >= cap) return;
      const b = this.alloc();
      if (!b) return;
      const base = Math.atan2(src.vy, src.vx);
      const off = (i === 0 ? 1 : -1) * config.shard.spreadDeg * DEG * (st.splitCount === 1 ? g.rng.sign() : 1);
      const a = base + off;
      this.init(b, swarm ? KIND_DART : KIND_SHARD, src.x + nx * 2, src.y + ny * 2, Math.cos(a), Math.sin(a));
      b.element = src.element;
      g.sink.emit('split', b.x, b.y, elementIndex(b.element), swarm ? 1 : 0);
    }
  }

  spawnDart(src: Ball): void {
    if (this.shards + this.darts >= config.dart.cap) return;
    const b = this.alloc();
    if (!b) return;
    const a = Math.atan2(src.vy, src.vx) + this.g.rng.range(-0.6, 0.6);
    this.init(b, KIND_DART, src.x, src.y, Math.cos(a), Math.sin(a));
    b.element = src.element;
    this.g.sink.emit('dart', b.x, b.y, elementIndex(b.element), 0);
  }

  private spawnEcho(src: Ball, angleDeg: number): void {
    if (this.echoes >= config.echo.cap) return;
    const b = this.alloc();
    if (!b) return;
    const th = angleDeg * DEG;
    this.init(b, KIND_ECHO, src.x, src.y, Math.sin(th), -Math.cos(th));
    b.element = src.element;
    b.charges = src.charges;
    b.pierceLeft = this.g.stats.pierce;
    this.g.sink.emit('echo', b.x, b.y, elementIndex(b.element), 0);
  }

  update(dt: number): void {
    const g = this.g;
    const st = g.stats;
    // reload queue
    for (let i = 0; i < this.reloadCount; ) {
      this.reload[i] = this.reload[i]! - dt;
      if (this.reload[i]! <= 0) {
        this.magazine++;
        this.reload[i] = this.reload[this.reloadCount - 1]!;
        this.reloadCount--;
      } else i++;
    }
    // firing
    this.fireT += dt;
    if (this.canFire && this.magazine > 0) {
      if (this.fireT >= st.fireInterval) {
        this.fireT = 0;
        this.fire();
      }
    } else if (this.fireT > st.fireInterval) this.fireT = st.fireInterval;
    if (this.perfectHitstopT > 0) this.perfectHitstopT -= dt;

    for (const b of this.pool) {
      if (!b.alive) continue;
      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      if (b.blastCd > 0) b.blastCd -= dt;
      if (b.catchT > 0) b.catchT -= dt;
      if (b.kind === KIND_SHARD || b.kind === KIND_DART) {
        b.life -= dt;
        if (b.life <= 0) {
          this.release(b);
          continue;
        }
      }
      this.steer(b, dt);
      this.integrate(b, dt);
      if (!b.alive) continue;
      // guards
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < F.wallL - config.physics.outOfBounds || b.x > F.wallR + config.physics.outOfBounds || b.y < F.ceilY - config.physics.outOfBounds) {
        this.recovered++;
        if (b.kind === KIND_MAIN) this.recycleMain(b, 0);
        else this.release(b);
        continue;
      }
      if (b.kind === KIND_MAIN && g.time - b.lastEventT > BC.stuckTime) {
        this.stuck++;
        b.lastEventT = g.time;
      }
      // trail sampling every 5 u
      const dx = b.x - b.px;
      const dy = b.y - b.py;
      b.trailDist += Math.sqrt(dx * dx + dy * dy);
      if (b.trailDist >= 5) {
        b.trailDist = 0;
        b.pushTrail();
      }
    }
  }

  // ------------------------------------------------------------------ homing
  private steer(b: Ball, dt: number): void {
    const g = this.g;
    const hm = g.stats.homing;
    const isDart = b.kind === KIND_DART;
    if (!hm && !isDart) return;
    if (b.kind === KIND_SHARD) return;
    const U = config.upgrades.homing;
    if (isDart || b.vy < 0) {
      b.retargetT -= dt;
      if (b.retargetT <= 0 || !g.targetAlive(b.target)) {
        const prev = b.target;
        b.target = g.findTarget(b, isDart ? 360 : hm!.cone, hm ? hm.threatFirst : false);
        b.retargetT = U.retarget;
        if (b.target !== prev && b.target !== -1 && b.kind === KIND_MAIN) {
          g.sink.emit('homingLock', g.targetX(b.target), g.targetY(b.target), 0, 0);
        }
      }
      if (b.target === -1) return;
      const tx = g.targetX(b.target);
      const ty = g.targetY(b.target);
      const dx = tx - b.x;
      const dy = ty - b.y;
      if (dx * dx + dy * dy < U.minDist * U.minDist) return;
      const rate = (isDart ? config.dart.turn : hm!.turn) * DEG * dt;
      this.turnToward(b, Math.atan2(dy, dx), rate);
      if (!isDart && b.vy > 0) this.enforceMinAngle(b);
    } else if (hm && hm.catchAssist && b.vy > 0 && b.y > U.assistY) {
      const dx = g.player.x - b.x;
      const dy = F.catchY - b.y;
      this.turnToward(b, Math.atan2(dy, dx), hm.turn * U.assistMult * DEG * dt);
      this.enforceMinAngle(b);
    }
  }

  private turnToward(b: Ball, want: number, maxTurn: number): void {
    const cur = Math.atan2(b.vy, b.vx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const a = cur + Math.max(-maxTurn, Math.min(maxTurn, d));
    b.vx = Math.cos(a) * b.speed;
    b.vy = Math.sin(a) * b.speed;
  }

  enforceMinAngle(b: Ball): void {
    const s = b.speed;
    if (Math.abs(b.vy) < s * MIN_SIN) {
      const sy = b.vy >= 0 ? 1 : -1;
      const sx = b.vx >= 0 ? 1 : -1;
      b.vy = sy * s * MIN_SIN;
      b.vx = sx * s * MIN_COS;
    } else {
      const len = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      b.vx = (b.vx / len) * s;
      b.vy = (b.vy / len) * s;
    }
  }

  // ------------------------------------------------------------------ physics
  private integrate(b: Ball, dt: number): void {
    const n = Math.max(1, Math.ceil((b.speed * dt) / config.physics.maxSubstepDist));
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      this.walls(b);
      this.bricks(b);
      if (!b.alive) return;
      if (this.g.boss) this.g.boss.collideBall(b);
      if (b.vy > 0 && this.tryCatch(b)) continue;
      if (b.y > F.dropY) {
        this.miss(b);
        return;
      }
    }
  }

  private walls(b: Ball): void {
    const g = this.g;
    if (b.x < F.wallL + b.r) {
      b.x = F.wallL + b.r;
      if (b.vx < 0) {
        b.vx = -b.vx;
        this.enforceMinAngle(b);
        g.sink.emit('wallHit', F.wallL, b.y, 0, elementIndex(b.element));
      }
    } else if (b.x > F.wallR - b.r) {
      b.x = F.wallR - b.r;
      if (b.vx > 0) {
        b.vx = -b.vx;
        this.enforceMinAngle(b);
        g.sink.emit('wallHit', F.wallR, b.y, 1, elementIndex(b.element));
      }
    }
    if (b.y < F.ceilY + b.r) {
      b.y = F.ceilY + b.r;
      if (b.vy < 0) {
        b.vy = -b.vy;
        this.enforceMinAngle(b);
        g.sink.emit('wallHit', b.x, F.ceilY, 2, elementIndex(b.element));
      }
    }
  }

  private recentlyHit(b: Ball, id: number): boolean {
    const now = this.g.time;
    for (let i = 0; i < RECENT; i++) {
      if (b.recentIds[i] === id) {
        if (now - b.recentT[i]! < BC.hitCooldown) {
          b.recentT[i] = now;
          return true;
        }
        b.recentT[i] = now;
        return false;
      }
    }
    b.recentIds[b.recentHead] = id;
    b.recentT[b.recentHead] = now;
    b.recentHead = (b.recentHead + 1) % RECENT;
    return false;
  }

  private bricks(b: Ball): void {
    const g = this.g;
    const f = g.formation;
    const r = b.r;
    const n = f.query(b.x - r, b.y - r, b.x + r, b.y + r, this.ids);
    if (n === 0) return;
    let nx = 0;
    let ny = 0;
    let contacts = 0;
    const st = g.stats;
    for (let i = 0; i < n; i++) {
      const br = f.bricks[this.ids[i]!]!;
      if (!br.alive) continue;
      const l = f.left(br);
      const rr = f.right(br);
      const t = f.top(br);
      const bt = f.bottom(br);
      const cx = b.x < l ? l : b.x > rr ? rr : b.x;
      const cy = b.y < t ? t : b.y > bt ? bt : b.y;
      let dx = b.x - cx;
      let dy = b.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      let enx: number;
      let eny: number;
      let pen: number;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        enx = dx / d;
        eny = dy / d;
        pen = r - d;
        // seam smoothing at corners
        const atX = cx === l || cx === rr;
        const atY = cy === t || cy === bt;
        if (atX && atY) {
          const dc = cx === l ? -1 : br.cw;
          const rowOfY = cy === t ? br.rowAbs + br.ch - 1 : br.rowAbs;
          const dr = cy === t ? 1 : -1;
          const sideNeighbour = f.occupied(br.col + dc, rowOfY);
          const vertNeighbour = f.occupied(cx === l ? br.col : br.col + br.cw - 1, rowOfY + dr);
          if (sideNeighbour && !vertNeighbour) {
            enx = 0;
            eny = cy === t ? -1 : 1;
            pen = cy === t ? b.y + r - t : bt - (b.y - r);
          } else if (vertNeighbour && !sideNeighbour) {
            eny = 0;
            enx = cx === l ? -1 : 1;
            pen = cx === l ? b.x + r - l : rr - (b.x - r);
          }
        }
      } else {
        const pl = b.x - l;
        const pr = rr - b.x;
        const pt = b.y - t;
        const pb = bt - b.y;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pt) {
          enx = 0;
          eny = -1;
        } else if (m === pb) {
          enx = 0;
          eny = 1;
        } else if (m === pl) {
          enx = -1;
          eny = 0;
        } else {
          enx = 1;
          eny = 0;
        }
        pen = m + r;
      }
      dx = enx;
      dy = eny;
      const vRelY = b.vy - f.vel;
      const vdotn = b.vx * enx + vRelY * eny;
      // pierce / absolute-zero pass-through
      const freePass = st.evo.absoluteZero && b.element === 'ice' && br.frozenT > 0 && b.kind !== KIND_SHARD;
      const passing = (freePass || b.pierceLeft > 0) && (b.kind === KIND_MAIN || b.kind === KIND_ECHO);
      if (passing) {
        if (!this.recentlyHit(b, br.id)) {
          const dmg = g.ballDamage(b) * st.pierceDmg;
          const ready = b.blastCd <= 0;
          const killed = g.bricksSys.hitByBall(br, dmg, b.element, b.charges, cx, cy, ready);
          if (ready && st.blast && (b.element === 'blast' || b.element === 'nova')) b.blastCd = config.status.blastCooldown;
          if (!freePass && !(killed && st.pierceFreeKill)) b.pierceLeft--;
          g.sink.emit('pierce', cx, cy, elementIndex(b.element), 0);
          this.afterHit(b, enx, eny);
        }
        continue;
      }
      // push out
      b.x += enx * (pen + 0.01);
      b.y += eny * (pen + 0.01);
      if (vdotn < 0) {
        nx += enx;
        ny += eny;
        contacts++;
        if (!this.recentlyHit(b, br.id)) {
          const dmg = g.ballDamage(b);
          const ready = b.blastCd <= 0;
          g.bricksSys.hitByBall(br, dmg, b.element, b.charges, cx, cy, ready);
          if (ready && st.blast && (b.element === 'blast' || b.element === 'nova')) b.blastCd = config.status.blastCooldown;
          br.popX += -enx * 1.5;
          br.popY += -eny * 1.5;
          this.afterHit(b, enx, eny);
        }
      }
    }
    if (contacts > 0) {
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 1e-6) {
        nx /= len;
        ny /= len;
        const uy = f.vel;
        const vd = b.vx * nx + (b.vy - uy) * ny;
        if (vd < 0) {
          b.vx -= 2 * vd * nx;
          b.vy -= 2 * vd * ny;
        }
      }
      this.enforceMinAngle(b);
    }
  }

  /** split / swarm darts after any damaging hit by a ball */
  afterHit(b: Ball, nx: number, ny: number): void {
    const g = this.g;
    const st = g.stats;
    b.lastEventT = g.time;
    if ((b.kind === KIND_MAIN || b.kind === KIND_ECHO) && st.splitChance > 0 && g.rng.chance(st.splitChance)) this.spawnSplit(b, nx, ny);
    if (st.evo.swarm && b.kind === KIND_MAIN) {
      b.hitsSinceDart++;
      if (b.hitsSinceDart >= config.dart.everyHits) {
        b.hitsSinceDart = 0;
        this.spawnDart(b);
      }
    }
  }

  /** boss part contact (circle). Returns nothing; boss handles damage via g.boss. */
  reflectCircle(b: Ball, cx: number, cy: number, cr: number, uvx: number, uvy: number): boolean {
    const dx = b.x - cx;
    const dy = b.y - cy;
    const rr = cr + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x = cx + nx * (rr + 0.01);
    b.y = cy + ny * (rr + 0.01);
    const vd = (b.vx - uvx) * nx + (b.vy - uvy) * ny;
    if (vd < 0) {
      b.vx -= 2 * vd * nx;
      b.vy -= 2 * vd * ny;
    }
    this.enforceMinAngle(b);
    return vd < 0;
  }

  private tryCatch(b: Ball): boolean {
    const g = this.g;
    const p = g.player;
    if (!p.alive) return false;
    const half = g.stats.paddleW * 0.5;
    if (b.y < F.catchY - b.r || b.y > F.catchY + CC.scoopDepth) return false;
    const dx = b.x - p.x;
    if (Math.abs(dx) > half + 0.5 * b.r) return false;
    const t = Math.max(-1, Math.min(1, dx / half));
    const eng = Math.max(-CC.englishMaxDeg, Math.min(CC.englishMaxDeg, p.vx * CC.englishDegPerUps));
    let th = t * CC.maxDeg + eng;
    const lim = 90 - BC.minAngleDeg;
    th = Math.max(-lim, Math.min(lim, th)) * DEG;
    b.vx = Math.sin(th) * b.speed;
    b.vy = -Math.cos(th) * b.speed;
    b.y = F.catchY - b.r - 0.01;
    b.lastEventT = g.time;
    b.catchT = 0.18;
    const perfect = Math.abs(dx) <= g.stats.perfectZone * g.stats.paddleW * 0.5;
    if (b.kind === KIND_MAIN) {
      b.charges = Math.min(config.charge.max, b.charges + (perfect ? config.charge.perfectGrants : 1));
      b.pierceLeft = g.stats.pierce;
      if (g.stats.evo.prismEcho) {
        if (perfect) {
          b.charges = config.charge.max;
          this.spawnEcho(b, th / DEG - config.echo.perfectSpreadDeg);
          this.spawnEcho(b, th / DEG + config.echo.perfectSpreadDeg);
        } else this.spawnEcho(b, th / DEG + (dx > 0 ? -12 : 12));
      }
    } else if (b.kind === KIND_ECHO) {
      b.pierceLeft = g.stats.pierce;
    }
    p.squash = 1;
    g.onCatch(b, perfect);
    return true;
  }

  private miss(b: Ball): void {
    const g = this.g;
    g.sink.emit('miss', b.x, F.dropY - 20, elementIndex(b.element), b.kind);
    if (b.kind === KIND_MAIN) {
      b.charges = 0;
      this.recycleMain(b, BC.reloadDelay);
      g.onMiss();
    } else this.release(b);
  }

  /** Predict x where a falling ball meets the catch line (walls only). Returns time or -1. */
  predict(b: Ball, out: { x: number; t: number }): boolean {
    if (b.vy <= 0) return false;
    const dy = F.catchY - b.r - b.y;
    if (dy < -CC.scoopDepth) return false;
    const t = Math.max(0, dy) / b.vy;
    let x = b.x + b.vx * t;
    const lo = F.wallL + b.r;
    const hi = F.wallR - b.r;
    const w = hi - lo;
    let u = (x - lo) % (2 * w);
    if (u < 0) u += 2 * w;
    x = u <= w ? lo + u : lo + 2 * w - u;
    out.x = x;
    out.t = t;
    return true;
  }

  /** bullets destroyed by balls (once per physics step) */
  interceptBullets(): void {
    const g = this.g;
    const bl = g.bulletsSys;
    if (bl.count === 0) return;
    for (const b of this.pool) {
      if (!b.alive) continue;
      for (const e of bl.pool) {
        if (!e.alive) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          bl.kill(e);
          g.addScore(config.score.intercept);
          g.runStats.intercepts++;
          g.sink.emit('bulletIntercept', e.x, e.y, 0, 0);
        }
      }
    }
  }

  countInFlight(): number {
    return this.mainInFlight;
  }
}
