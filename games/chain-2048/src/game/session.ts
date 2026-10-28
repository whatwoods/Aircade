/**
 * 一局（docs §3.1 / §3.7 / §3.8）：玉佩、关卡流程、计分、弹丸、弹药。纯逻辑，可在 Node 里运行。
 */
import { CONFIG, stageCfg, type StageCfg } from '../config.ts';
import { Bus } from '../core/events.ts';
import { Rng } from '../core/rng.ts';
import { Ammo } from './ammo.ts';
import { Chain, type Ball, type ChainEvents } from './chain.ts';
import { MUZZLE, raycastChain, sideOf, type Hit, type Projectile } from './shooter.ts';
import { Track } from './track.ts';
import { TRACKS } from './tracks.ts';

export type Phase = 'idle' | 'intro' | 'live' | 'clearing' | 'retreat' | 'summary' | 'failing' | 'over';

export interface StageSummary {
  stage: number;
  stageScore: number;
  clearBonus: number;
  cashBonus: number;
  longest: number;
}

export interface SessionEvents extends ChainEvents {
  stageStart: { stage: number; cfg: StageCfg; retry: boolean };
  fired: { p: Projectile; angle: number };
  hit: { p: Projectile; ball: Ball | null };
  miss: { p: Projectile; bridge: boolean };
  swapped: { current: number; next: number };
  reroll: { which: number };
  armed: { on: boolean };
  wildEarned: { x: number; y: number };
  wildBonus: { pts: number };
  score: { pts: number; cid: number; s: number; kind: 'merge' | 'seal' | 'cash' | 'bonus' };
  streak: { n: number; mul: number; broken: boolean };
  sealCount: { seals: number; quota: number };
  quotaReached: { stage: number };
  retreatStart: Record<string, never>;
  stageClear: StageSummary;
  failStart: Record<string, never>;
  lifeLost: { lives: number };
  runOver: { score: number; stage: number };
  cascade: { cid: number; steps: number };
  danger: { level: 0 | 1 | 2 };
  emptyBonus: { pts: number };
}

export interface RunStats {
  merges: number;
  longest: number;
  seals: number;
  shots: number;
  time: number;
  triples: number;
  seal2048: number;
}

const HALF_W = 390;
const H = 844;

export class Session {
  readonly bus = new Bus<SessionEvents>();
  rng: Rng;
  stage = 1;
  lives: number = CONFIG.run.lives;
  score = 0;
  stageScore = 0;
  seals = 0;
  phase: Phase = 'idle';
  phaseT = 0;
  track!: Track;
  chain!: Chain;
  cfg!: StageCfg;
  ammo: Ammo;
  streak = 0;
  cooldown = 0;
  readonly projectiles: Projectile[] = [];
  stats: RunStats = { merges: 0, longest: 0, seals: 0, shots: 0, time: 0, triples: 0, seal2048: 0 };
  /** 引导控制 */
  fireEnabled = true;
  failEnabled = true;
  /** 无渲染模拟：小结/重打不等待 */
  autoAdvance = false;
  dangerLevel: 0 | 1 | 2 = 0;
  private pClear = 0;
  private clearBonus = 0;
  private cashBonus = 0;
  private stageLongest = 0;
  private nextCid = 1;
  private shotCids = new Set<number>();
  private streakCounted = new Set<number>();
  private hit: Hit = { id: -2, index: -1, side: 0, x: 0, y: 0, t: 0, bx: 0, by: 0 };
  private tracks: Track[];

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.ammo = new Ammo(this.rng);
    this.tracks = TRACKS.map((d) => new Track(d));
    // 占位（idle）：保证 chain/track/cfg 始终可读
    this.cfg = stageCfg(1);
    this.track = this.tracks[0]!;
    this.chain = new Chain(this.track, this.cfg, this.rng, (k, p) => this.onChain(k, p));
  }

  get totemX(): number {
    return this.track.totemX;
  }
  get totemY(): number {
    return this.track.totemY;
  }

  newRun(stage = 1): void {
    this.lives = CONFIG.run.lives;
    this.score = 0;
    this.streak = 0;
    this.stats = { merges: 0, longest: 0, seals: 0, shots: 0, time: 0, triples: 0, seal2048: 0 };
    this.startStage(stage, false);
  }

  startStage(n: number, retry: boolean): void {
    this.stage = n;
    this.cfg = stageCfg(n);
    this.track = this.tracks[this.cfg.track]!;
    this.chain = new Chain(this.track, this.cfg, this.rng, (k, p) => this.onChain(k, p));
    this.seals = 0;
    this.stageScore = 0;
    this.stageLongest = 0;
    this.projectiles.length = 0;
    this.cooldown = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.dangerLevel = 0;
    this.ammo.locked = false;
    this.ammo.armed = false;
    this.chain.spawn();
    this.ammo.fill(this.chain);
    this.bus.emit('stageStart', { stage: n, cfg: this.cfg, retry });
  }

  canFire(): boolean {
    if (!this.fireEnabled) return false;
    if (this.phase !== 'live' && this.phase !== 'clearing') return false;
    if (this.phase === 'live' && this.chain.mode === 'intro') return false;
    if (this.phase === 'clearing') return false;
    let n = 0;
    for (const p of this.projectiles) if (p.alive) n++;
    return this.cooldown <= 0 && n < CONFIG.shot.maxInFlight;
  }

  muzzle(angle: number): { x: number; y: number } {
    return { x: this.totemX + Math.cos(angle) * MUZZLE, y: this.totemY + Math.sin(angle) * MUZZLE };
  }

  /** 预测（瞄准线）：写入 out */
  predict(angle: number, out: Hit): boolean {
    const m = this.muzzle(angle);
    return raycastChain(this.chain, m.x, m.y, angle, out);
  }

  /** 找一个能命中第 index 颗珠子指定侧的发射角（扫描 0.25°，取命中区间的中点）；打不到返回 null */
  angleFor(index: number, side: 0 | 1 | -1 = -1): number | null {
    const b = this.chain.balls[index];
    if (!b) return null;
    const h: Hit = { id: -2, index: -1, side: 0, x: 0, y: 0, t: 0, bx: 0, by: 0 };
    let run: number[] = [];
    let best: number[] = [];
    for (let k = 0; k <= 1440; k++) {
      const a = (k / 1440) * Math.PI * 2;
      const okHit = this.predict(a, h) && h.id === b.id && (side < 0 || h.side === side);
      if (okHit) run.push(a);
      if ((!okHit || k === 1440) && run.length) {
        if (run.length > best.length) best = run;
        run = [];
      }
    }
    return best.length ? best[Math.floor(best.length / 2)]! : null;
  }

  fire(angle: number): boolean {
    if (!this.canFire()) return false;
    const m = this.muzzle(angle);
    raycastChain(this.chain, m.x, m.y, angle, this.hit);
    let p = this.projectiles.find((q) => !q.alive);
    if (!p) {
      p = { alive: false, x: 0, y: 0, vx: 0, vy: 0, level: 1, wild: false, lockId: -2, lockSide: 0, cid: 0, age: 0 };
      this.projectiles.push(p);
    }
    const wild = this.ammo.armed && this.ammo.wild > 0;
    p.alive = true;
    p.x = m.x;
    p.y = m.y;
    p.vx = Math.cos(angle) * CONFIG.shot.speed;
    p.vy = Math.sin(angle) * CONFIG.shot.speed;
    p.wild = wild;
    p.level = wild ? 0 : this.ammo.take(this.chain);
    if (wild) {
      this.ammo.wild--;
      this.ammo.armed = false;
    }
    p.lockId = this.hit.id >= 0 ? this.hit.id : -2;
    p.lockSide = this.hit.side;
    p.cid = this.nextCid++;
    p.age = 0;
    this.shotCids.add(p.cid);
    this.cooldown = CONFIG.shot.cooldown;
    this.stats.shots++;
    this.bus.emit('fired', { p, angle });
    return true;
  }

  swap(): boolean {
    if (this.phase === 'over' || this.ammo.armed) return false;
    this.ammo.swap();
    this.bus.emit('swapped', { current: this.ammo.current, next: this.ammo.next });
    return true;
  }

  armWild(): boolean {
    if (this.ammo.wild <= 0) {
      this.ammo.armed = false;
      return false;
    }
    this.ammo.armed = !this.ammo.armed;
    this.bus.emit('armed', { on: this.ammo.armed });
    return true;
  }

  streakMul(): number {
    const S = CONFIG.score;
    return 1 + S.streakStep * Math.min(Math.max(0, this.streak - 1), S.streakCap);
  }

  private addScore(pts: number, cid: number, s: number, kind: 'merge' | 'seal' | 'cash' | 'bonus'): void {
    pts = Math.round(pts);
    this.score += pts;
    this.stageScore += pts;
    this.bus.emit('score', { pts, cid, s, kind });
  }

  private onChain<K extends keyof ChainEvents>(k: K, p: ChainEvents[K]): void {
    switch (k) {
      case 'merged': {
        const e = p as ChainEvents['merged'];
        this.stats.merges += e.triple ? 2 : 1;
        if (e.triple) this.stats.triples++;
        if (e.step === 1 && this.shotCids.has(e.cid) && !this.streakCounted.has(e.cid)) {
          this.streakCounted.add(e.cid);
          this.streak++;
          this.bus.emit('streak', { n: this.streak, mul: this.streakMul(), broken: false });
        }
        let pts = 2 ** e.level * e.step * this.streakMul();
        if (e.triple) pts *= CONFIG.score.tripleMul;
        this.addScore(pts, e.cid, e.ball.s, 'merge');
        if (e.step > this.stageLongest) this.stageLongest = e.step;
        if (e.step > this.stats.longest) this.stats.longest = e.step;
        break;
      }
      case 'sealed': {
        const e = p as ChainEvents['sealed'];
        let pts = 2 ** this.cfg.sealLevel * CONFIG.score.sealMul * this.streakMul();
        if (e.over) pts *= CONFIG.score.overSealMul;
        this.addScore(pts, e.cid, e.s, 'seal');
        this.seals++;
        this.stats.seals++;
        if (this.cfg.sealLevel >= 11) this.stats.seal2048++;
        this.bus.emit('sealCount', { seals: this.seals, quota: this.cfg.quota });
        if (this.phase === 'live' && this.seals >= this.cfg.quota) this.reachQuota();
        if (this.phase === 'live' && this.chain.balls.length === 0) {
          this.addScore(CONFIG.score.emptyBonus, -1, 0, 'bonus');
          this.bus.emit('emptyBonus', { pts: CONFIG.score.emptyBonus });
        }
        break;
      }
      case 'cascadeEnd': {
        const e = p as ChainEvents['cascadeEnd'];
        if (this.shotCids.has(e.cid)) {
          this.shotCids.delete(e.cid);
          this.streakCounted.delete(e.cid);
          if (e.steps <= 0) {
            if (this.streak > 0) this.bus.emit('streak', { n: 0, mul: 1, broken: true });
            this.streak = 0;
          } else if (e.steps >= CONFIG.wild.earnSteps) {
            if (this.ammo.wild < CONFIG.wild.maxHeld) {
              this.ammo.wild++;
              this.bus.emit('wildEarned', { x: 0, y: 0 });
            } else {
              this.addScore(CONFIG.wild.extraBonus, -1, 0, 'bonus');
              this.bus.emit('wildBonus', { pts: CONFIG.wild.extraBonus });
            }
          }
          this.bus.emit('cascade', { cid: e.cid, steps: e.steps });
        }
        break;
      }
      case 'levelGone': {
        const which = this.ammo.reroll(this.chain);
        if (which) this.bus.emit('reroll', { which });
        break;
      }
      case 'cashed': {
        const pts = CONFIG.score.retreatPerBall * this.stage;
        this.cashBonus += pts;
        this.addScore(pts, -1, 0, 'cash');
        break;
      }
      default:
        break;
    }
    this.bus.emit(k, p as SessionEvents[K]);
  }

  private reachQuota(): void {
    this.phase = 'clearing';
    this.phaseT = 0;
    this.pClear = this.chain.headProgress();
    this.chain.spawning = false;
    const S = CONFIG.score;
    this.clearBonus = Math.round(S.clearBase * (1 + S.clearPerStage * (this.stage - 1)) * Math.max(0, 1 - this.pClear));
    this.cashBonus = 0;
    this.bus.emit('quotaReached', { stage: this.stage });
  }

  /** 小结结束 → 下一关（自动模式） */
  private advance(): void {
    if (this.phase === 'summary') this.startStage(this.stage + 1, false);
  }

  private afterFail(): void {
    if (this.lives > 0) this.startStage(this.stage, true);
    else {
      this.phase = 'over';
      this.bus.emit('runOver', { score: this.score, stage: this.stage });
    }
  }

  step(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'over') return;
    this.phaseT += dt;
    if (this.phase === 'live' || this.phase === 'intro' || this.phase === 'clearing') this.stats.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.stepProjectiles(dt);
    this.chain.step(dt);

    switch (this.phase) {
      case 'intro':
        if (this.chain.mode !== 'intro') this.phase = 'live';
        break;
      case 'live': {
        const p = this.chain.headProgress();
        const lvl: 0 | 1 | 2 = p >= CONFIG.danger.critical ? 2 : p >= CONFIG.danger.warn ? 1 : 0;
        if (lvl !== this.dangerLevel) {
          this.dangerLevel = lvl;
          this.bus.emit('danger', { level: lvl });
        }
        if (this.failEnabled && this.chain.balls.length && this.chain.headS() >= this.track.length && !this.chain.headSegmentPending()) {
          this.phase = 'failing';
          this.phaseT = 0;
          this.chain.mode = 'rush';
          this.chain.spawning = false;
          this.projectiles.forEach((q) => (q.alive = false));
          if (this.dangerLevel) {
            this.dangerLevel = 0;
            this.bus.emit('danger', { level: 0 });
          }
          this.bus.emit('failStart', {});
        }
        break;
      }
      case 'clearing': {
        const inFlight = this.projectiles.some((q) => q.alive);
        if ((!inFlight && !this.chain.anyPending() && this.chain.freeze <= 0) || this.phaseT > CONFIG.push.clearWaitMax) {
          this.phase = 'retreat';
          this.phaseT = 0;
          this.chain.mode = 'retreat';
          this.chain.balls.forEach((b) => {
            b.check = -1;
            b.sealT = 0;
          });
          this.projectiles.forEach((q) => (q.alive = false));
          if (this.dangerLevel) {
            this.dangerLevel = 0;
            this.bus.emit('danger', { level: 0 });
          }
          this.bus.emit('retreatStart', {});
        }
        break;
      }
      case 'retreat':
        if (this.chain.balls.length === 0) {
          this.phase = 'summary';
          this.phaseT = 0;
          this.addScore(this.clearBonus, -1, 0, 'bonus');
          this.bus.emit('stageClear', {
            stage: this.stage, stageScore: this.stageScore, clearBonus: this.clearBonus, cashBonus: this.cashBonus, longest: this.stageLongest,
          });
          if (this.autoAdvance) this.advance();
        }
        break;
      case 'failing':
        if (this.chain.balls.length === 0 && this.phaseT > 0.2) {
          this.lives--;
          this.bus.emit('lifeLost', { lives: this.lives });
          // 复用 summary 阶段等待 UI（玉佩碎裂动画），用 failWait 区分
          this.phase = 'summary';
          this.failWait = true;
          this.phaseT = 0;
          if (this.autoAdvance) this.continueAfterFail();
        }
        break;
      case 'summary':
        break;
      default:
        break;
    }
  }

  /** 失败后的等待（玉佩碎裂动画） */
  failWait = false;

  continueAfterFail(): void {
    if (!this.failWait) return;
    this.failWait = false;
    this.afterFail();
  }

  /** UI：小结卡片/失败结束后继续 */
  proceed(): void {
    if (this.phase !== 'summary') return;
    if (this.failWait) this.continueAfterFail();
    else this.startStage(this.stage + 1, false);
  }

  private stepProjectiles(dt: number): void {
    const sub = CONFIG.shot.substeps * 2;
    const h = dt / sub;
    const R = CONFIG.ball.D * CONFIG.shot.hitRadiusK;
    const R2 = R * R;
    const chain = this.chain;
    const track = this.track;
    const tmp = { x: 0, y: 0 };
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      for (let k = 0; k < sub && p.alive; k++) {
        p.x += p.vx * h;
        p.y += p.vy * h;
        // 石桥
        const bc = track.bridgeCircles;
        for (let j = 0; j < bc.length; j += 3) {
          const dx = p.x - bc[j]!, dy = p.y - bc[j + 1]!;
          const r = bc[j + 2]! + CONFIG.ball.D / 2;
          if (dx * dx + dy * dy < r * r) {
            p.alive = false;
            this.breakStreak();
            this.bus.emit('miss', { p, bridge: true });
            break;
          }
        }
        if (!p.alive) break;
        let hitIdx = -1;
        let hd = R2;
        for (let i = 0; i < chain.balls.length; i++) {
          const b = chain.balls[i]!;
          if (!track.hittable(b.s)) continue;
          const q = track.posAt(b.s, tmp);
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < hd) {
            hd = d2;
            hitIdx = i;
          }
        }
        if (hitIdx >= 0) {
          const b = chain.balls[hitIdx]!;
          const q = track.posAt(b.s, tmp);
          const side = b.id === p.lockId ? p.lockSide : sideOf(chain, b.s, q.x, q.y, p.x, p.y);
          p.alive = false;
          const nb = chain.insertAt(b.id, side, p.level, p.cid, p.x, p.y, p.wild);
          this.bus.emit('hit', { p, ball: nb });
          break;
        }
        if (p.x < -40 || p.x > HALF_W + 40 || p.y < -40 || p.y > H + 40) {
          p.alive = false;
          this.shotCids.delete(p.cid);
          this.breakStreak();
          this.bus.emit('miss', { p, bridge: false });
        }
      }
    }
  }

  private breakStreak(): void {
    if (this.streak > 0) this.bus.emit('streak', { n: 0, mul: 1, broken: true });
    this.streak = 0;
  }

  // —— 调试 ——
  /** 调试：封印数 +1（走正常计数与收官判定） */
  debugSeal(): void {
    this.seals++;
    this.stats.seals++;
    this.bus.emit('sealCount', { seals: this.seals, quota: this.cfg.quota });
    if (this.phase === 'live' && this.seals >= this.cfg.quota) this.reachQuota();
  }

  forceWin(): void {
    if (this.phase !== 'live' && this.phase !== 'intro') return;
    this.seals = this.cfg.quota;
    this.bus.emit('sealCount', { seals: this.seals, quota: this.cfg.quota });
    if (this.phase === 'intro') this.phase = 'live';
    this.reachQuota();
  }

  forceLose(): void {
    if (this.phase !== 'live' && this.phase !== 'intro') return;
    this.phase = 'live';
    this.chain.mode = 'live';
    const D = CONFIG.ball.D;
    const L = this.track.length;
    this.chain.balls.forEach((b, i) => {
      b.s = L - i * D;
      b.check = -1;
      b.sealT = 0;
    });
    this.chain.freeze = 0;
    this.failEnabled = true;
  }
}
