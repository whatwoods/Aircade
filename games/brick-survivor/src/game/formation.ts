// Ring-buffer brick grid, beat-quantised whole-row advance, breach resolution (docs §3.6, §2.4).
import { config } from '../config';
import type { BrickType } from '../types';
import { ease } from '../core/ease';
import type { Game } from './game';

const G = config.grid;
const F = config.field;
const A = config.advance;
const RING = G.ringRows;

export class Brick {
  alive = false;
  type: BrickType = 'basic';
  col = 0;
  /** lower (on-screen bottom) row index; elites also occupy rowAbs + 1 */
  rowAbs = 0;
  cw = 1;
  ch = 1;
  hp = 0;
  maxHp = 0;
  burnStacks = 0;
  burnT = 0;
  burnTick = 0;
  chill = 0;
  chillT = 0;
  frozenT = 0;
  shielded = false;
  warn = false;
  // turret
  fireT = 0;
  aimX = 0;
  aimY = 0;
  locked = false;
  // presentation springs (logic only writes impulses)
  flashT = 0;
  popX = 0;
  popY = 0;
  popV = 0;
  popS = 0;
  spawnT = 0;
  armorBroken = false;
  /** generic stamp for de-duplicating area hits within one explosion */
  stamp = 0;
  frostSeed = 0;
  constructor(public readonly id: number) {}
}

export type FormationMode = 'hold' | 'waves' | 'conveyor' | 'sideRows' | 'fixed';

export class Formation {
  readonly bricks: Brick[] = [];
  readonly grid = new Int32Array(RING * G.cols);
  aliveCount = 0;
  /** rows advanced so far; fractional while sliding. Starts at 100 so rowAbs indices stay positive. */
  scroll = 100;
  vel = 0;
  sliding = false;
  slideT = 0;
  slideBase = 100;
  stepTimer = 0;
  armed = false;
  extraBeats = 0;
  quickSteps = 0;
  mode: FormationMode = 'hold';
  fixedBeats = 6;
  // wave progression
  waveRowsLeft = 0;
  waveRowIdx = 0;
  waveRows = 0;
  gapLeft = 0;
  pendingBoss = false;
  stepsTaken = 0;
  frozenCount = 0;
  warnCount = 0;
  private reservedElites: number[] = [];
  private free: number[] = [];

  constructor(private g: Game) {
    for (let i = 0; i < config.bricks.pool; i++) {
      this.bricks.push(new Brick(i));
      this.free.push(config.bricks.pool - 1 - i);
    }
  }

  reset(): void {
    for (const b of this.bricks) b.alive = false;
    this.free.length = 0;
    for (let i = config.bricks.pool - 1; i >= 0; i--) this.free.push(i);
    this.grid.fill(0);
    this.aliveCount = 0;
    this.scroll = 100;
    this.slideBase = 100;
    this.vel = 0;
    this.sliding = false;
    this.slideT = 0;
    this.stepTimer = 0;
    this.armed = false;
    this.extraBeats = 0;
    this.quickSteps = 0;
    this.mode = 'hold';
    this.waveRowsLeft = 0;
    this.waveRowIdx = 0;
    this.waveRows = 0;
    this.gapLeft = 0;
    this.pendingBoss = false;
    this.stepsTaken = 0;
    this.frozenCount = 0;
    this.warnCount = 0;
    this.reservedElites.length = 0;
  }

  // ---------------------------------------------------------------- geometry
  cellTop(rowAbs: number): number {
    return F.ceilY + (this.scroll - rowAbs - 1) * G.cellH;
  }
  /** display row index (0 = just under the ceiling) of a rowAbs */
  displayRow(rowAbs: number): number {
    return Math.round(this.scroll) - rowAbs - 1;
  }
  rowAtY(y: number): number {
    return Math.ceil(this.scroll - 1 - (y - F.ceilY) / G.cellH);
  }
  rowAbsForDisplay(k: number): number {
    return Math.round(this.scroll) - 1 - k;
  }
  colAtX(x: number): number {
    return Math.floor((x - G.x0) / G.cellW);
  }
  left(b: Brick): number {
    return G.x0 + b.col * G.cellW + (G.cellW - G.brickW) / 2;
  }
  right(b: Brick): number {
    return G.x0 + (b.col + b.cw) * G.cellW - (G.cellW - G.brickW) / 2;
  }
  top(b: Brick): number {
    return this.cellTop(b.rowAbs + b.ch - 1) + (G.cellH - G.brickH) / 2;
  }
  bottom(b: Brick): number {
    return this.cellTop(b.rowAbs) + G.cellH - (G.cellH - G.brickH) / 2;
  }
  cx(b: Brick): number {
    return G.x0 + (b.col + b.cw * 0.5) * G.cellW;
  }
  cy(b: Brick): number {
    return (this.top(b) + this.bottom(b)) * 0.5;
  }

  private ringIndex(col: number, rowAbs: number): number {
    return (((rowAbs % RING) + RING) % RING) * G.cols + col;
  }
  /** brick id at a cell or -1 */
  idAt(col: number, rowAbs: number): number {
    if (col < 0 || col >= G.cols) return -1;
    const v = this.grid[this.ringIndex(col, rowAbs)]! - 1;
    if (v < 0) return -1;
    const b = this.bricks[v]!;
    if (!b.alive || rowAbs < b.rowAbs || rowAbs > b.rowAbs + b.ch - 1 || col < b.col || col > b.col + b.cw - 1) return -1;
    return v;
  }
  brickAt(col: number, rowAbs: number): Brick | null {
    const id = this.idAt(col, rowAbs);
    return id < 0 ? null : this.bricks[id]!;
  }
  occupied(col: number, rowAbs: number): boolean {
    return this.idAt(col, rowAbs) >= 0;
  }
  /** brick under a world point */
  brickAtPoint(x: number, y: number): Brick | null {
    const b = this.brickAt(this.colAtX(x), this.rowAtY(y));
    if (!b) return null;
    if (x < this.left(b) || x > this.right(b) || y < this.top(b) || y > this.bottom(b)) return null;
    return b;
  }

  /** unique brick ids whose cells overlap the AABB; returns count written into out */
  query(minX: number, minY: number, maxX: number, maxY: number, out: Int32Array): number {
    const c0 = Math.max(0, this.colAtX(minX));
    const c1 = Math.min(G.cols - 1, this.colAtX(maxX));
    const rTop = this.rowAtY(minY);
    const rBot = this.rowAtY(maxY);
    let n = 0;
    for (let r = rBot; r <= rTop; r++) {
      for (let c = c0; c <= c1; c++) {
        const id = this.idAt(c, r);
        if (id < 0) continue;
        let dup = false;
        for (let k = 0; k < n; k++) if (out[k] === id) { dup = true; break; }
        if (!dup && n < out.length) out[n++] = id;
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- lifetime
  spawn(type: BrickType, col: number, rowAbs: number, hp: number): Brick | null {
    const cw = type === 'elite' ? 2 : 1;
    const ch = type === 'elite' ? 2 : 1;
    if (col < 0 || col + cw > G.cols) return null;
    for (let r = rowAbs; r < rowAbs + ch; r++)
      for (let c = col; c < col + cw; c++) if (this.occupied(c, r)) return null;
    const id = this.free.pop();
    if (id === undefined) return null;
    const b = this.bricks[id]!;
    b.alive = true;
    b.type = type;
    b.col = col;
    b.rowAbs = rowAbs;
    b.cw = cw;
    b.ch = ch;
    b.hp = Math.max(1, Math.round(hp));
    b.maxHp = b.hp;
    b.burnStacks = 0;
    b.burnT = 0;
    b.burnTick = 0;
    b.chill = 0;
    b.chillT = 0;
    b.frozenT = 0;
    b.shielded = false;
    b.warn = false;
    b.fireT = this.g.rng.range(0, config.bricks.turretPeriod - config.bricks.turretCharge);
    b.locked = false;
    b.aimX = 0;
    b.aimY = 0;
    b.flashT = 0;
    b.popX = 0;
    b.popY = 0;
    b.popV = 0;
    b.popS = 0;
    b.spawnT = config.advance.spawnScale;
    b.armorBroken = false;
    b.stamp = 0;
    b.frostSeed = (id * 7919) % 97;
    for (let r = rowAbs; r < rowAbs + ch; r++)
      for (let c = col; c < col + cw; c++) this.grid[this.ringIndex(c, r)] = id + 1;
    this.aliveCount++;
    if (type === 'warden') this.recomputeShields();
    return b;
  }

  remove(b: Brick): void {
    if (!b.alive) return;
    b.alive = false;
    for (let r = b.rowAbs; r < b.rowAbs + b.ch; r++)
      for (let c = b.col; c < b.col + b.cw; c++) {
        const i = this.ringIndex(c, r);
        if (this.grid[i] === b.id + 1) this.grid[i] = 0;
      }
    this.free.push(b.id);
    this.aliveCount--;
    if (b.type === 'warden') this.recomputeShields();
  }

  recomputeShields(): void {
    for (const b of this.bricks) if (b.alive) b.shielded = false;
    for (const w of this.bricks) {
      if (!w.alive || w.type !== 'warden') continue;
      for (let r = w.rowAbs - 1; r <= w.rowAbs + 1; r++)
        for (let c = w.col - 1; c <= w.col + 1; c++) {
          const n = this.brickAt(c, r);
          if (n && n !== w) n.shielded = true;
        }
    }
  }

  countType(t: BrickType): number {
    let n = 0;
    for (const b of this.bricks) if (b.alive && b.type === t) n++;
    return n;
  }

  /** deepest display row occupied by any brick (−1 when empty) */
  lowestDisplayRow(): number {
    let m = -1;
    const s = Math.round(this.scroll);
    for (const b of this.bricks) if (b.alive) m = Math.max(m, s - b.rowAbs - 1);
    return m;
  }

  // ---------------------------------------------------------------- advance
  slowFactor(): number {
    const st = this.g.stats;
    if (!st.ice || this.frozenCount === 0) return 1;
    return 1 - Math.min(st.ice.slowCap, st.ice.slowPer * this.frozenCount);
  }

  requiredBeats(): number {
    if (this.mode === 'fixed' || this.mode === 'conveyor') return this.fixedBeats + this.extraBeats;
    if (this.mode === 'sideRows') return this.fixedBeats + this.extraBeats;
    if (this.quickSteps > 0) return 1;
    const base = this.aliveCount < A.sparseThreshold ? A.sparseBeats : this.g.waveBeats();
    return base + this.extraBeats;
  }

  /** seconds until the next advance (approximate, for HUD countdown) */
  progress(): number {
    if (this.mode === 'hold') return 0;
    const need = this.requiredBeats() * this.g.beatLen;
    return Math.min(1, this.stepTimer / need);
  }

  update(dt: number): void {
    if (this.sliding) {
      this.slideT += dt;
      const p = Math.min(1, this.slideT / A.slideTime);
      const bounce = (A.bounce / G.cellH) * Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.62) / 0.38)));
      const ns = this.slideBase + ease.inOutCubic(p) + bounce;
      this.vel = ((ns - this.scroll) * G.cellH) / dt;
      this.scroll = ns;
      if (p >= 1) {
        this.scroll = this.slideBase + 1;
        this.vel = 0;
        this.sliding = false;
        this.onSlideEnd();
      }
    } else this.vel = 0;

    // status counters
    let frozen = 0;
    for (const b of this.bricks) if (b.alive && b.frozenT > 0) frozen++;
    this.frozenCount = frozen;

    if (this.mode === 'hold') return;
    this.stepTimer += dt * this.slowFactor();
    const need = this.requiredBeats() * this.g.beatLen;
    if (!this.armed && this.stepTimer >= need - A.armEpsilon) this.armed = true;
    if (this.armed && this.g.beatCrossed && !this.sliding) this.doStep();
  }

  forceStep(): void {
    if (!this.sliding) this.doStep();
  }

  private doStep(): void {
    this.armed = false;
    this.stepTimer = 0;
    this.extraBeats = 0;
    if (this.quickSteps > 0) this.quickSteps--;
    this.stepsTaken++;
    if (this.mode === 'waves') this.waveProgress();
    else if (this.mode === 'sideRows') this.g.spawnSideRow(this.slideBaseRow());
    this.slideBase = Math.round(this.scroll);
    this.scroll = this.slideBase;
    this.sliding = true;
    this.slideT = 0;
    this.g.onAdvance();
  }

  /** rowAbs of the row that enters at the next step (sits above the ceiling) */
  slideBaseRow(): number {
    return Math.round(this.scroll);
  }

  private waveProgress(): void {
    const g = this.g;
    if (this.waveRowsLeft > 0) {
      this.spawnWaveRow();
      return;
    }
    if (this.gapLeft > 0) {
      this.gapLeft--;
      if (this.gapLeft === 0 && g.isBossWave(g.wave + 1)) this.pendingBoss = true;
      return;
    }
    // begin next normal wave
    g.beginWave(g.wave + 1);
    if (this.waveRowsLeft > 0) this.spawnWaveRow();
  }

  startWaveRows(rows: number): void {
    this.waveRows = rows;
    this.waveRowsLeft = rows;
    this.waveRowIdx = 0;
    this.gapLeft = 0;
    this.reservedElites.length = 0;
  }

  private spawnWaveRow(): void {
    const g = this.g;
    const rowAbs = this.slideBaseRow();
    if (this.waveRowIdx === 0) g.onWaveRowsBegin();
    g.waves.generateRow(rowAbs, this.waveRowIdx, this.waveRows, this.reservedElites);
    this.waveRowIdx++;
    this.waveRowsLeft--;
    if (this.waveRowsLeft === 0) this.gapLeft = config.waves.gapRows;
  }

  private onSlideEnd(): void {
    const g = this.g;
    const s = Math.round(this.scroll);
    let dmg = 0;
    let breached = 0;
    let barrier = g.player.barrierReady && !g.tutorialActive();
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const k = s - b.rowAbs - 1;
      if (k >= G.visibleRows) {
        breached++;
        const x = this.cx(b);
        if (barrier) {
          g.sink.emit('barrierBlock', x, F.dangerY, 0, 0);
        } else {
          dmg += config.bricks[b.type].breach;
          g.sink.emit('breach', x, F.dangerY, b.type === 'elite' ? 2 : 1, 0);
        }
        g.bricksSys.breachBrick(b);
      }
    }
    if (breached > 0) {
      if (barrier) {
        g.player.useBarrier();
        barrier = false;
      } else if (g.tutorialActive()) {
        g.tutorialBreach();
      } else {
        g.damagePlayer(Math.min(dmg, A.breachCapPerStep), 'breach');
        this.extraBeats = A.postBreachBeats;
      }
    }
    this.refreshWarnings();
    g.onSlideEnd();
    if (this.pendingBoss) {
      this.pendingBoss = false;
      g.startBossWave(g.wave + 1);
    }
  }

  refreshWarnings(): void {
    const s = Math.round(this.scroll);
    let n = 0;
    for (const b of this.bricks) {
      if (!b.alive) continue;
      b.warn = this.mode !== 'hold' && s - b.rowAbs - 1 >= G.visibleRows - 1;
      if (b.warn) n++;
    }
    if (n > 0 && this.warnCount === 0) this.g.sink.emit('breachWarn', 195, F.dangerY, n, 0);
    this.warnCount = n;
  }

  /** column has a brick that breaches on the next step */
  warnColumnMask(): number {
    let m = 0;
    for (const b of this.bricks) if (b.alive && b.warn) for (let c = b.col; c < b.col + b.cw; c++) m |= 1 << c;
    return m;
  }
}
