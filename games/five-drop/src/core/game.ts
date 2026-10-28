import type { Config } from '../config.ts';
import { secPerRow, garbageInterval, levelMult } from '../config.ts';
import { Grid } from './grid.ts';
import { Piece, KICKS, pieceFromSpec } from './pieces.ts';
import type { PieceSpec, Stone } from './pieces.ts';
import { Generator } from './generator.ts';
import { Rng } from './rng.ts';
import { resolveStep, resolveAll, findLines } from './rules.ts';
import type { Step, Line } from './rules.ts';
import { insertGarbage } from './garbage.ts';
import type { ShapeId } from '../config.ts';

export type Phase = 'play' | 'resolving' | 'are' | 'over' | 'idle';

export interface GameEvents {
  spawn: { piece: Piece; fromHold: boolean };
  move: { dx: number; ok: boolean };
  rotate: { dir: number; ok: boolean };
  invert: { ok: boolean };
  hold: { ok: boolean; piece: Piece | null };
  softStep: { rows: number };
  hardDrop: { piece: Piece; fromY: number; toY: number; x: number };
  land: { piece: Piece };
  lock: { piece: Piece; cells: number[]; colors: Stone[] };
  step: { step: Step; duration: number };
  resolved: { steps: Step[]; anyFive: boolean; combo: number; comboBonus: number; perfect: boolean; perfectBonus: number };
  score: { score: number; delta: number };
  levelUp: { level: number };
  garbageWarn: { remaining: number };
  garbage: { row: Stone[]; gap: number };
  danger: { on: boolean };
  gameOver: { reason: 'blockout' | 'lockout' | 'garbage' | 'forced' };
}
export type EventName = keyof GameEvents;
type Listener<K extends EventName> = (e: GameEvents[K]) => void;

export interface Preview { y: number; lines: Line[]; chain: boolean; fullRows: number[]; rowRemoved: number[] }

export interface GameOptions {
  /** 无头模式：结算不等待动画 */
  headless?: boolean;
  gravityOff?: boolean;
  noLevelTimer?: boolean;
  noGarbage?: boolean;
  /** 固定方块序列（引导用），用完后回到生成器 */
  script?: PieceSpec[];
  startLevel?: number;
}

export interface GameStats {
  fives: number; longest: number; maxChain: number; maxLines: number;
  removedFive: number; removedRow: number; pieces: number; holds: number; inverts: number; crystals: number;
}

const STEP = 1 / 120;

export class Game {
  readonly cfg: Config;
  readonly seed: number;
  readonly grid: Grid;
  readonly opts: GameOptions;
  phase: Phase = 'idle';
  active: Piece | null = null;
  holdPiece: Piece | null = null;
  holdUsed = false;
  queue: Piece[] = [];
  score = 0;
  level = 1;
  time = 0;
  levelTimeOffset = 0;
  combo = 0;
  danger = false;
  stats: GameStats = { fives: 0, longest: 0, maxChain: 0, maxLines: 0, removedFive: 0, removedRow: 0, pieces: 0, holds: 0, inverts: 0, crystals: 0 };
  gameOverReason = '';
  softDrop = false;

  private gen: Generator;
  private garbageRng: Rng;
  private listeners: { [K in EventName]?: Listener<K>[] } = {};
  private acc = 0;
  /** 真实流逝时间（不受等级计时开关影响），用于硬降防误触 */
  clock = 0;
  /** 引导用：为 true 时停在出块前（ARE）不出下一块 */
  spawnLocked = false;
  private gravAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private grounded = false;
  private spawnAt = 0;
  private waitTimer = 0;
  private k = 0;
  private steps: Step[] = [];
  private anyFive = false;
  private piecesSinceGarbage = 0;
  private lastGap = -1;
  private warned = -1;
  private invertsThisPiece = 0;
  private script: PieceSpec[];
  private previewCache: { key: string; p: Preview } | null = null;

  constructor(cfg: Config, seed: number, opts: GameOptions = {}) {
    this.cfg = cfg;
    this.seed = seed;
    this.opts = opts;
    this.grid = new Grid(cfg.board.cols, cfg.board.rows, cfg.board.hiddenRows);
    this.gen = new Generator(cfg, seed);
    this.garbageRng = new Rng(seed, 'garbage');
    this.script = (opts.script ?? []).slice();
    if (opts.startLevel && opts.startLevel > 1) this.setLevel(opts.startLevel);
  }

  on<K extends EventName>(name: K, fn: Listener<K>): void {
    const arr = (this.listeners[name] ?? (this.listeners[name] = [] as never)) as Listener<K>[];
    arr.push(fn);
  }
  off<K extends EventName>(name: K, fn: Listener<K>): void {
    const arr = this.listeners[name] as Listener<K>[] | undefined;
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  private emit<K extends EventName>(name: K, e: GameEvents[K]): void {
    const arr = this.listeners[name] as Listener<K>[] | undefined;
    if (arr) for (const fn of arr) fn(e);
  }

  // ---------- 生命周期 ----------
  start(): void {
    this.fillQueue();
    this.phase = 'are';
    this.waitTimer = 0;
  }

  setLevel(n: number): void {
    const lv = Math.max(1, Math.min(this.cfg.level.max, Math.floor(n)));
    this.time = (lv - 1) * this.cfg.level.secondsPerLevel;
    this.level = lv;
  }

  forceGameOver(reason: GameEvents['gameOver']['reason'] = 'forced'): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.gameOverReason = reason;
    this.active = null;
    this.emit('gameOver', { reason });
  }

  private balance() { return this.grid.count(); }

  private fillQueue(): void {
    while (this.queue.length < this.cfg.pieces.nextCount) {
      const sp = this.script.shift();
      this.queue.push(sp ? pieceFromSpec(sp) : this.gen.next(this.level, this.balance()));
    }
  }

  /** 引导/调试：替换后续方块 */
  setScript(specs: PieceSpec[]): void {
    this.script = specs.slice();
    this.queue.length = 0;
    this.fillQueue();
  }

  setActive(p: Piece): boolean {
    return this.spawn(p, false);
  }

  private spawn(p: Piece, fromHold: boolean): boolean {
    p.setRot(p.rot);
    const x = Math.floor((this.cfg.board.cols - p.n) / 2);
    const y = this.grid.hidden - 1 - p.bottomY();
    p.x = x; p.y = y;
    if (this.grid.collides(p, x, y)) {
      this.active = null;
      this.forceGameOver('blockout');
      return false;
    }
    if (!this.grid.collides(p, x, y + 1)) p.y = y + 1;
    this.active = p;
    this.phase = 'play';
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = this.grid.collides(p, p.x, p.y + 1);
    this.spawnAt = this.clock;
    this.invertsThisPiece = 0;
    this.previewCache = null;
    this.emit('spawn', { piece: p, fromHold });
    return true;
  }

  private spawnNext(): void {
    this.fillQueue();
    const p = this.queue.shift()!;
    this.fillQueue();
    this.holdUsed = false;
    this.spawn(p, false);
  }

  // ---------- 输入 ----------
  private afterAction(): void {
    const p = this.active!;
    const g = this.grid.collides(p, p.x, p.y + 1);
    if (g) {
      if (this.lockResets < this.cfg.lock.maxResets) { this.lockTimer = 0; this.lockResets++; }
    } else this.lockTimer = 0;
    this.grounded = g;
    this.previewCache = null;
  }

  move(dx: number): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p) return false;
    const ok = !this.grid.collides(p, p.x + dx, p.y);
    if (ok) { p.x += dx; this.afterAction(); }
    this.emit('move', { dx, ok });
    return ok;
  }

  rotate(dir: 1 | -1): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p) return false;
    const old = p.rot, ox = p.x, oy = p.y;
    p.setRot(old + dir);
    for (const [kx, ky] of KICKS) {
      if (!this.grid.collides(p, ox + kx, oy + ky)) {
        p.x = ox + kx; p.y = oy + ky;
        this.afterAction();
        this.emit('rotate', { dir, ok: true });
        return true;
      }
    }
    p.setRot(old);
    this.emit('rotate', { dir, ok: false });
    return false;
  }

  invert(): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p) return false;
    const lim = this.cfg.invert.maxPerPiece;
    if (lim >= 0 && this.invertsThisPiece >= lim) { this.emit('invert', { ok: false }); return false; }
    p.invert();
    this.invertsThisPiece++;
    this.stats.inverts++;
    this.afterAction();
    this.emit('invert', { ok: true });
    return true;
  }

  hold(): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p || !this.cfg.pieces.holdEnabled) return false;
    if (this.holdUsed) { this.emit('hold', { ok: false, piece: this.holdPiece }); return false; }
    p.setRot(0);
    const prev = this.holdPiece;
    this.holdPiece = p;
    this.holdUsed = true;
    this.stats.holds++;
    this.emit('hold', { ok: true, piece: p });
    if (prev) this.spawn(prev, true);
    else {
      this.fillQueue();
      const n = this.queue.shift()!;
      this.fillQueue();
      this.spawn(n, true);
    }
    this.holdUsed = true;
    return true;
  }

  canHardDrop(): boolean {
    return this.phase === 'play' && !!this.active && (this.clock - this.spawnAt) * 1000 >= this.cfg.lock.hardDropGuardMs;
  }

  hardDrop(force = false): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p) return false;
    if (!force && !this.canHardDrop()) return false;
    const y = this.grid.dropY(p, p.x, p.y);
    const dist = y - p.y;
    this.emit('hardDrop', { piece: p, fromY: p.y, toY: y, x: p.x });
    p.y = y;
    this.addScore(dist * this.cfg.score.hardDrop);
    this.lock();
    return true;
  }

  softDropRows(n: number): number {
    const p = this.active;
    if (this.phase !== 'play' || !p) return 0;
    let m = 0;
    while (m < n && !this.grid.collides(p, p.x, p.y + 1)) { p.y++; m++; }
    if (m > 0) {
      this.addScore(m * this.cfg.score.softDrop);
      this.gravAcc = 0;
      this.afterAction();
      this.emit('softStep', { rows: m });
    }
    return m;
  }

  /** 机器人/调试：直接放置（按框左上 x、朝向） */
  placeAt(x: number, rot: number, inv: boolean): boolean {
    const p = this.active;
    if (this.phase !== 'play' || !p) return false;
    if (inv) { p.invert(); this.stats.inverts++; }
    p.setRot(rot);
    if (this.grid.collides(p, x, p.y)) {
      // 尝试上移到出块区
      let ok = false;
      for (let y = p.y - 1; y >= -2; y--) if (!this.grid.collides(p, x, y)) { p.y = y; ok = true; break; }
      if (!ok) { if (inv) p.invert(); return false; }
    }
    p.x = x;
    return this.hardDrop(true);
  }

  // ---------- 时间推进 ----------
  update(dt: number): void {
    if (this.phase === 'over' || this.phase === 'idle') return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP);
      if ((this.phase as string) === 'over') break;
    }
  }

  advanceTime(dt: number): void {
    if (this.opts.noLevelTimer) return;
    this.time += dt;
    const lv = Math.min(this.cfg.level.max, 1 + Math.floor(this.time / this.cfg.level.secondsPerLevel));
    if (lv !== this.level) {
      this.level = lv;
      this.emit('levelUp', { level: lv });
    }
  }

  private tick(dt: number): void {
    this.clock += dt;
    this.advanceTime(dt);
    if (this.phase === 'are') {
      if (this.spawnLocked) return;
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) this.beforeSpawn();
      return;
    }
    if (this.phase === 'resolving') {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) this.nextStep();
      return;
    }
    if (this.phase !== 'play' || !this.active) return;
    const p = this.active;
    if (!this.opts.gravityOff) {
      const base = secPerRow(this.level, this.cfg);
      const rowT = this.softDrop ? Math.min(base, this.cfg.gravity.softDropSecPerRow) : base;
      this.gravAcc += dt;
      while (this.gravAcc >= rowT) {
        if (!this.grid.collides(p, p.x, p.y + 1)) {
          p.y++;
          this.gravAcc -= rowT;
          if (this.softDrop) { this.addScore(this.cfg.score.softDrop); this.emit('softStep', { rows: 1 }); }
          const g = this.grid.collides(p, p.x, p.y + 1);
          if (g && !this.grounded) this.emit('land', { piece: p });
          this.grounded = g;
          this.previewCache = null;
        } else { this.gravAcc = 0; break; }
      }
    }
    if (this.grid.collides(p, p.x, p.y + 1)) {
      this.grounded = true;
      if (!this.opts.gravityOff) {
        this.lockTimer += dt * 1000;
        if (this.lockTimer >= this.cfg.lock.delayMs || this.lockResets >= this.cfg.lock.maxResets) this.lock();
      }
    } else this.grounded = false;
  }

  /** 调试：直接加分 */
  addPoints(d: number): void { this.addScore(Math.round(d)); }

  private addScore(d: number): void {
    if (d === 0) return;
    this.score += d;
    this.emit('score', { score: this.score, delta: d });
  }

  private lock(): void {
    const p = this.active!;
    const colors = p.colors.slice();
    for (const c of colors) if (c === 3) this.stats.crystals++;
    const cells = this.grid.place(p, p.x, p.y);
    this.active = null;
    this.stats.pieces++;
    this.piecesSinceGarbage++;
    this.previewCache = null;
    this.emit('lock', { piece: p, cells, colors });
    this.k = 0;
    this.steps = [];
    this.anyFive = false;
    this.phase = 'resolving';
    this.waitTimer = 0;
    this.nextStep();
  }

  private stepDuration(s: Step): number {
    if (this.opts.headless) return 0;
    const a = this.cfg.anim;
    let clear = s.kind === 'row' ? a.fullRowMs : s.lines.length > 1 ? a.multiMs : a.fiveMs;
    let fall = 0;
    for (const m of s.moves) {
      const dist = (m.toY - m.fromY) * 38;
      const t = Math.min(a.fallMaxMs, Math.sqrt((2 * dist) / a.fallGravity) * 1000) + m.x * a.fallColStaggerMs;
      if (t > fall) fall = t;
    }
    if (s.moves.length) fall += 90;
    let total = clear + fall;
    if (s.k >= 3) total *= Math.pow(a.chainCompress, s.k - 2);
    return total / 1000;
  }

  private nextStep(): void {
    const s = resolveStep(this.grid, this.k + 1, this.level, this.cfg);
    if (s) {
      this.k++;
      this.steps.push(s);
      if (s.kind === 'five') {
        this.anyFive = true;
        this.stats.fives += s.lines.length;
        for (const l of s.lines) if (l.length > this.stats.longest) this.stats.longest = l.length;
        if (s.lines.length > this.stats.maxLines) this.stats.maxLines = s.lines.length;
        this.stats.removedFive += s.removed.length;
      } else this.stats.removedRow += s.removed.length;
      if (this.k > this.stats.maxChain) this.stats.maxChain = this.k;
      this.previewCache = null;
      const d = this.stepDuration(s);
      this.addScore(s.score);
      this.emit('step', { step: s, duration: d });
      this.waitTimer = d;
      if (d <= 0) this.nextStep();
      return;
    }
    // 结算完成
    this.combo = this.anyFive ? this.combo + 1 : 0;
    const comboBonus = this.combo >= 2 ? Math.round(this.cfg.score.comboStep * (this.combo - 1) * levelMult(this.level, this.cfg)) : 0;
    const perfect = this.steps.length > 0 && this.grid.isEmpty();
    const perfectBonus = perfect ? Math.round(this.cfg.score.perfectClear * levelMult(this.level, this.cfg)) : 0;
    this.emit('resolved', { steps: this.steps, anyFive: this.anyFive, combo: this.combo, comboBonus, perfect, perfectBonus });
    this.addScore(comboBonus + perfectBonus);
    this.updateDanger();
    if (this.grid.hiddenOccupied()) { this.forceGameOver('lockout'); return; }
    this.phase = 'are';
    this.waitTimer = this.opts.headless ? 0 : this.cfg.lock.areMs / 1000;
    if (this.opts.headless) this.beforeSpawn();
  }

  private updateDanger(): void {
    const d = this.grid.topRow() < this.cfg.danger.topRows;
    if (d !== this.danger) { this.danger = d; this.emit('danger', { on: d }); }
  }

  garbageRemaining(): number {
    if (this.opts.noGarbage) return -1;
    const iv = garbageInterval(this.level, this.cfg);
    if (!iv) return -1;
    return Math.max(0, Math.ceil(iv - this.piecesSinceGarbage - 1e-9));
  }

  private beforeSpawn(): void {
    const iv = this.opts.noGarbage ? 0 : garbageInterval(this.level, this.cfg);
    if (iv) {
      if (this.piecesSinceGarbage >= iv - 1e-9) {
        this.piecesSinceGarbage -= iv;
        if (!this.pushGarbage()) return;
      }
      const rem = Math.max(0, Math.ceil(iv - this.piecesSinceGarbage - 1e-9));
      if (rem <= this.cfg.garbage.warnPieces && rem !== this.warned) { this.warned = rem; this.emit('garbageWarn', { remaining: rem }); }
      if (rem > this.cfg.garbage.warnPieces) this.warned = -1;
    } else this.piecesSinceGarbage = 0;
    this.spawnNext();
  }

  /** 推入一行垃圾；返回 false 表示因此失败 */
  pushGarbage(): boolean {
    const r = insertGarbage(this.grid, this.garbageRng, this.lastGap, this.cfg.garbage.maxSameRun, this.cfg.garbage.retries, this.cfg.garbage.gaps);
    this.lastGap = r.gap;
    this.previewCache = null;
    this.emit('garbage', { row: r.row, gap: r.gap });
    if (r.overflow) { this.forceGameOver('garbage'); return false; }
    this.updateDanger();
    return true;
  }

  // ---------- 查询 ----------
  ghostY(): number {
    const p = this.active;
    if (!p) return 0;
    return this.grid.dropY(p, p.x, p.y);
  }

  preview(): Preview | null {
    const p = this.active;
    if (!p || this.phase !== 'play') return null;
    const gy = this.ghostY();
    const key = `${p.x},${gy},${p.rot},${p.colorString()},${this.grid.version}`;
    if (this.previewCache && this.previewCache.key === key) return this.previewCache.p;
    const g = this.grid.clone();
    g.place(p, p.x, gy);
    const lines = findLines(g, []).map(l => ({ ...l, cells: l.cells.slice() }));
    let fullRowsArr: number[] = [];
    let rowRemoved: number[] = [];
    let chain = false;
    const steps = resolveAll(g, this.level, this.cfg);
    if (steps.length > 0) {
      if (steps[0].kind === 'row') { fullRowsArr = steps[0].rows; rowRemoved = steps[0].removed; }
      chain = steps.length > 1;
    }
    const pv: Preview = { y: gy, lines, chain, fullRows: fullRowsArr, rowRemoved };
    this.previewCache = { key, p: pv };
    return pv;
  }

  nextSpecs(): { shape: ShapeId; colors: string }[] {
    return this.queue.map(q => ({ shape: q.shape, colors: q.colorString() }));
  }
}
