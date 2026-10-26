// Run state + logic-level flow (waves, bosses, level-ups, death/victory). Pure logic: no DOM / GL.
import { config } from '../config';
import { Rng } from '../core/rng';
import type { BossKind, Card, ElementId, EvolutionId, FxSink, Snapshot, UpgradeId } from '../types';
import { nullSink, UPGRADE_IDS, WEAPON_IDS, MODULE_IDS } from '../types';
import { Autoplay } from './autoplay';
import { Ball, Balls, KIND_DART, KIND_ECHO, KIND_SHARD } from './balls';
import { BrickSystem, DMG_AOE } from './bricks';
import { Bullets } from './bullets';
import { Formation } from './formation';
import { Gems, GEM_LARGE } from './gems';
import { rollOffer } from './offers';
import { Player } from './player';
import { Tutorial } from './tutorial';
import { computeStats, emptyLevels, EVOLUTIONS } from './upgrades';
import type { Stats } from './upgrades';
import { Waves } from './waves';
import type { Boss } from './bosses/boss';
import { Monolith } from './bosses/monolith';
import { Pulsar } from './bosses/pulsar';
import { Serpent } from './bosses/serpent';
import { Omega } from './bosses/omega';

export type Phase = 'idle' | 'tutorial' | 'wave' | 'bossIntro' | 'boss' | 'bossDeath' | 'dying' | 'over' | 'victoryAnim' | 'won';
export type DamageSource = 'breach' | 'bullet' | 'laser' | 'slam' | 'serpent';

export interface RunOptions {
  seed: number;
  tutorial: boolean;
  startWave?: number;
}

export interface RunStats {
  bricks: number;
  bosses: number;
  perfect: number;
  catches: number;
  dmgTaken: number;
  damage: number;
  gems: number;
  intercepts: number;
  thermal: number;
  frozen: number;
  maxComboTier: number;
  evolutions: number;
}

const F = config.field;
const DEATH = config.bosses.death;

export class Game {
  rng: Rng;
  seed = 1;
  sink: FxSink = nullSink;
  time = 0;
  runTime = 0;
  beatLen = 60 / config.advance.bpm;
  beatPhase = 0;
  beatCrossed = false;
  beatCount = 0;
  phase: Phase = 'idle';
  wave = 1;
  endless = false;
  readonly formation: Formation;
  readonly waves: Waves;
  readonly bricksSys: BrickSystem;
  readonly balls: Balls;
  readonly gemsSys: Gems;
  readonly bulletsSys: Bullets;
  readonly player: Player;
  readonly autoplay = new Autoplay();
  boss: Boss | null = null;
  levels: Record<UpgradeId, number> = emptyLevels();
  evolutions = new Set<EvolutionId>();
  stats: Stats;
  elementCycle: ElementId[] = [];
  cycleIdx = 0;
  xp = 0;
  level = 1;
  pendingLevelUps = 0;
  levelUpsTaken = 0;
  offersMade = 0;
  rerolls: number = config.rerolls.start;
  forcedCards: UpgradeId[] | null = null;
  score = 0;
  combo = 0;
  comboT = 0;
  comboTier = -1;
  maxCombo = 0;
  god = false;
  tut: Tutorial | null = null;
  runStats: RunStats = Game.emptyRunStats();
  readonly scratchIds = new Int32Array(64);
  deathT = 0;
  bossDeathT = 0;
  bossDeathX = 195;
  bossDeathY = 200;
  bossDeathKind: BossKind = 'monolith';
  shockR = -1;
  private bossRewarded = false;
  private bossExplosions = 0;
  private bossFinal = false;
  victoryT = 0;
  victoryReached = false;
  lowestRowSum = 0;
  lowestRowN = 0;
  /** pressure director HP multiplier for newly spawned wave rows */
  pressure = 1;
  /** formation step count when the current post-boss settle window began */
  pressureFrom = 0;
  waveStartTime = 0;
  waveTimes: number[] = [];
  bossStartTime = 0;
  bossDamageAtStart = 0;
  lastBreachT = -10;

  static emptyRunStats(): RunStats {
    return { bricks: 0, bosses: 0, perfect: 0, catches: 0, dmgTaken: 0, damage: 0, gems: 0, intercepts: 0, thermal: 0, frozen: 0, maxComboTier: 0, evolutions: 0 };
  }

  constructor(sink?: FxSink) {
    if (sink) this.sink = sink;
    this.rng = new Rng(1);
    this.stats = computeStats(this.levels, this.evolutions);
    this.formation = new Formation(this);
    this.waves = new Waves(this);
    this.bricksSys = new BrickSystem(this);
    this.balls = new Balls(this);
    this.gemsSys = new Gems(this);
    this.bulletsSys = new Bullets(this);
    this.player = new Player(this);
  }

  // ================================================================== run lifecycle
  start(opts: RunOptions): void {
    this.seed = opts.seed;
    this.rng.reseed(opts.seed);
    this.time = 0;
    this.runTime = 0;
    this.beatPhase = 0;
    this.beatCount = 0;
    this.beatCrossed = false;
    this.wave = 1;
    this.endless = false;
    this.boss = null;
    this.levels = emptyLevels();
    this.evolutions.clear();
    this.recomputeStats();
    this.elementCycle = [];
    this.cycleIdx = 0;
    this.xp = 0;
    this.level = 1;
    this.pendingLevelUps = 0;
    this.levelUpsTaken = 0;
    this.offersMade = 0;
    this.rerolls = config.rerolls.start;
    this.forcedCards = null;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboTier = -1;
    this.maxCombo = 0;
    this.runStats = Game.emptyRunStats();
    this.deathT = 0;
    this.shockR = -1;
    this.victoryT = 0;
    this.victoryReached = false;
    this.lowestRowSum = 0;
    this.lowestRowN = 0;
    this.pressure = 1;
    this.waveTimes = [];
    this.formation.reset();
    this.bricksSys.reset();
    this.player.reset();
    this.balls.reset();
    this.gemsSys.reset();
    this.bulletsSys.reset();
    if (opts.tutorial) {
      this.phase = 'tutorial';
      this.tut = new Tutorial(this);
      this.tut.start();
    } else {
      this.tut = null;
      const w = opts.startWave ?? 1;
      this.phase = 'wave';
      if (w > 1) this.wave = w - 1;
      this.startFromWave(w);
    }
  }

  private startFromWave(w: number): void {
    const f = this.formation;
    f.mode = 'waves';
    if (this.isBossWave(w)) {
      this.wave = w - 1;
      this.startBossWave(w);
      return;
    }
    this.beginWave(w);
    f.quickSteps = w === 1 ? config.advance.prefillRows : config.advance.prefillAfterBoss;
    this.pressureFrom = f.stepsTaken;
    f.stepTimer = 0;
  }

  finishTutorial(): void {
    if (!this.tut) return;
    this.tut.done = true;
    this.tut = null;
    this.formation.mode = 'hold';
    for (const b of this.formation.bricks) if (b.alive) this.formation.remove(b);
    this.balls.canFire = true;
    this.phase = 'wave';
    this.wave = 1;
    this.runTime = 0;
    this.startFromWave(1);
  }

  tutorialActive(): boolean {
    return this.tut !== null;
  }
  tutorialBreach(): void {
    this.sink.emit('breachWarn', 195, F.dangerY, -1, 0);
    this.tut?.onBreach();
  }

  isBossWave(w: number): boolean {
    return this.waves.bossOf(w) !== null;
  }
  waveBeats(): number {
    return this.waves.beats(this.wave);
  }

  /** begins a normal wave: rows queued; banner fires when its first row enters */
  beginWave(w: number): void {
    this.wave = w;
    if (w > 1 && this.combo > 0) this.cutCombo(config.combo.waveKeep);
    if (w > 20) this.endless = true;
    this.waves.pickPattern(w);
    this.formation.mode = 'waves';
    this.formation.startWaveRows(this.waves.rows(w));
    this.waveStartTime = this.runTime;
  }

  onWaveRowsBegin(): void {
    this.sink.emit('waveStart', 195, 330, this.wave, this.endless ? 1 : 0);
  }

  startBossWave(w: number): void {
    this.wave = w;
    if (w > 20) this.endless = true;
    const kind = this.waves.bossOf(w) ?? 'monolith';
    this.spawnBoss(kind);
  }

  spawnBoss(kind: BossKind): void {
    const round = this.waves.endlessRound(this.wave);
    const mult = 1 + config.waves.endless.bossHpPerRound * round;
    this.bulletsSys.clearAll();
    this.boss = kind === 'monolith' ? new Monolith(this, mult) : kind === 'pulsar' ? new Pulsar(this, mult) : kind === 'serpent' ? new Serpent(this, mult) : new Omega(this, mult);
    this.phase = 'bossIntro';
    this.formation.mode = 'hold';
    this.formation.waveRowsLeft = 0;
    this.formation.gapLeft = 0;
    this.formation.pendingBoss = false;
    this.bossStartTime = this.runTime;
    this.bossDamageAtStart = this.runStats.dmgTaken;
    this.sink.emit('bossWarning', 195, 330, this.waves.bossIndex(this.wave), 0);
  }

  onBossFightBegin(): void {
    this.phase = 'boss';
  }

  onBossDefeated(b: Boss): void {
    this.phase = 'bossDeath';
    this.bossDeathT = 0;
    this.bossDeathX = b.x;
    this.bossDeathY = b.y;
    this.bossDeathKind = b.kind;
    this.bossRewarded = false;
    this.bossExplosions = 0;
    this.bossFinal = false;
    this.shockR = -1;
    this.bulletsSys.clearAll();
    this.runStats.bosses++;
    const idx = this.waves.bossIndex(this.wave);
    const noDmg = this.runStats.dmgTaken === this.bossDamageAtStart;
    this.addScore(config.score.bossBase * idx * (noDmg ? config.score.noDamageMult : 1), true);
    const victory = b.kind === 'omega' && this.wave === 20 && !this.endless;
    this.sink.emit(victory ? 'victory' : 'bossDefeat', b.x, b.y, -1, idx);
    if (victory) {
      this.phase = 'victoryAnim';
      this.victoryT = 0;
    }
  }

  spawnSideRow(rowAbs: number): void {
    const O = config.bosses.omega;
    const round = this.waves.endlessRound(this.wave);
    const hp = O.rowHp * O.rowHpMult * (1 + config.waves.endless.bossHpPerRound * round);
    for (const c of O.sideCols) if (this.rng.chance(config.waves.densityMax)) this.formation.spawn(this.rng.chance(0.12) ? 'armored' : 'basic', c, rowAbs, this.rng.chance(0.12) ? hp * 2.5 : hp);
  }

  onAdvance(): void {
    this.sink.emit('advance', 195, F.dangerY, this.formation.stepsTaken, 0);
  }

  onSlideEnd(): void {
    const lr = this.formation.lowestDisplayRow();
    this.lowestRowSum += Math.max(0, lr);
    this.lowestRowN++;
    const P = config.pressure;
    if (P.on && this.phase === 'wave' && this.tut === null && this.formation.mode === 'waves' && this.formation.quickSteps === 0) {
      const target = P.target[this.wave] ?? P.endlessTarget;
      const err = target - Math.max(0, lr);
      // slow to tighten, quick to relax; ignore the first few steps after a boss while the field refills
      if (err < 0 || this.formation.stepsTaken - this.pressureFrom >= P.settleSteps) {
        const cap = Math.min(P.max, Math.max(P.capBase + P.capPerWave * (this.wave - P.capFrom), P.capEvoBase + P.capPerEvo * this.evolutions.size));
        const want = Math.max(P.min, Math.min(cap, this.pressure * Math.exp((err > 0 ? P.gainUp : P.gainDown) * err)));
        const r = Math.max(1 / (1 + P.rateDown), Math.min(1 + P.rateUp, want / this.pressure));
        if (r < 1) {
          const k = Math.pow(r, P.easeExisting);
          for (const b of this.formation.bricks) {
            if (!b.alive) continue;
            b.hp = Math.max(1, b.hp * k);
            b.maxHp = Math.max(1, b.maxHp * k);
          }
        }
        this.pressure *= r;
      }
    }
  }

  hostile(): boolean {
    return (this.phase === 'wave' || this.phase === 'boss' || this.phase === 'bossIntro') && this.tut === null;
  }

  canLevelUpNow(): boolean {
    return this.pendingLevelUps > 0 && (this.phase === 'wave' || this.phase === 'boss' || this.phase === 'bossIntro' || this.phase === 'tutorial');
  }

  // ================================================================== fixed step
  step(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'over' || this.phase === 'won') return;
    this.time += dt;
    if (this.phase === 'wave' || this.phase === 'boss' || this.phase === 'bossIntro') this.runTime += dt;
    // beat clock
    this.beatPhase += dt / this.beatLen;
    this.beatCrossed = false;
    if (this.beatPhase >= 1) {
      this.beatPhase -= Math.floor(this.beatPhase);
      this.beatCount++;
      this.beatCrossed = true;
    }
    this.autoplay.decide(this, dt);
    this.player.update(dt);
    this.formation.update(dt);
    this.bricksSys.update(dt);
    if (this.boss) {
      this.boss.update(dt);
      if (this.boss && this.boss.state === 'fight' && this.phase === 'bossIntro') this.phase = 'boss';
    }
    this.balls.update(dt);
    this.balls.interceptBullets();
    this.bulletsSys.update(dt);
    this.gemsSys.update(dt);
    if (this.gemsSys.vacuum && this.gemsSys.count === 0) this.gemsSys.vacuum = false;
    // combo window
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.breakCombo(false);
    }
    if (this.tut) this.tut.update(dt);
    if (this.phase === 'bossDeath') this.updateBossDeath(dt);
    else if (this.phase === 'victoryAnim') this.updateVictory(dt);
    else if (this.phase === 'dying') {
      this.deathT += dt;
    }
  }

  private updateBossDeath(dt: number): void {
    this.bossDeathT += dt;
    const t = this.bossDeathT;
    while (this.bossExplosions < DEATH.explosions && t >= this.bossExplosions * DEATH.explodeGap) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(8, 40);
      this.sink.emit('bossDefeat', this.bossDeathX + Math.cos(a) * r, this.bossDeathY + Math.sin(a) * r, 1, this.bossExplosions);
      this.bossExplosions++;
    }
    const finalT = DEATH.explosions * DEATH.explodeGap;
    if (!this.bossFinal && t >= finalT) {
      this.bossFinal = true;
      this.boss = null;
      this.sink.emit('bossDefeat', this.bossDeathX, this.bossDeathY, 2, 0);
      this.shockR = 0;
    }
    if (this.bossFinal) this.updateShock(t - finalT);
    if (this.bossFinal && t >= finalT + DEATH.shockDur && !this.bossRewarded) {
      this.bossRewarded = true;
      this.shockR = -1;
      this.grantBossReward();
      // next wave
      const next = this.wave + 1;
      this.phase = 'wave';
      if (this.isBossWave(next)) {
        this.startBossWave(next);
      } else {
        this.beginWave(next);
        this.formation.quickSteps = config.advance.prefillAfterBoss;
        this.pressureFrom = this.formation.stepsTaken;
        this.formation.stepTimer = 0;
        this.formation.armed = false;
      }
    }
  }

  private updateShock(t: number): void {
    const p = Math.min(1, t / DEATH.shockDur);
    this.shockR = p * 900;
    const f = this.formation;
    for (const b of f.bricks) {
      if (!b.alive) continue;
      const dx = f.cx(b) - this.bossDeathX;
      const dy = f.cy(b) - this.bossDeathY;
      if (dx * dx + dy * dy <= this.shockR * this.shockR) {
        this.addCombo(1);
        this.bricksSys.damage(b, b.hp + 1, DMG_AOE);
      }
    }
  }

  private grantBossReward(): void {
    const R = config.bosses.reward;
    for (let i = 0; i < R.largeGems; i++) this.gemsSys.spawn(GEM_LARGE, config.gems.large, this.bossDeathX + (i - 1) * 18, this.bossDeathY);
    this.gemsSys.vacuum = true;
    this.heal(R.heal);
    this.rerolls += R.rerolls;
    this.pendingLevelUps++;
    this.waveTimes.push(this.runTime - this.bossStartTime);
  }

  private updateVictory(dt: number): void {
    this.victoryT += dt;
    if (this.shockR < 0 && this.victoryT >= 0.12) {
      this.shockR = 0;
      this.boss = null;
      this.sink.emit('victory', this.bossDeathX, this.bossDeathY, 2, 0);
    }
    if (this.shockR >= 0) this.updateShock(this.victoryT - 0.12);
    if (this.victoryT >= 1.0 && !this.victoryReached) {
      this.victoryReached = true;
      const S = config.score;
      this.addScore(S.victoryBase + this.player.hp * S.victoryPerHp + Math.max(0, S.victoryPar - this.runTime) * S.victoryPerSec, true);
      this.phase = 'won';
      this.shockR = -1;
    }
  }

  continueEndless(): void {
    this.endless = true;
    this.phase = 'wave';
    this.victoryReached = false;
    this.player.alive = true;
    this.beginWave(21);
    this.formation.quickSteps = config.advance.prefillAfterBoss;
    this.pressureFrom = this.formation.stepsTaken;
  }

  // ================================================================== player
  damagePlayer(n: number, src: DamageSource, x: number = this.player.x, y: number = F.catchY): void {
    const p = this.player;
    if (this.god || !p.alive || this.tut) return;
    if (this.phase === 'dying' || this.phase === 'over' || this.phase === 'bossDeath' || this.phase === 'victoryAnim' || this.phase === 'won') return;
    const timed = src === 'bullet' || src === 'laser';
    if (timed && p.iFramesT > 0) return;
    p.hp = Math.max(0, p.hp - n);
    this.runStats.dmgTaken += n;
    if (timed) p.iFramesT = config.player.iFrames;
    p.hitT = 0.3;
    this.breakCombo(true);
    if (src === 'breach') this.lastBreachT = this.time;
    else this.sink.emit('playerHit', x, y, n, src === 'laser' ? 1 : 0);
    if (p.hp <= 0) this.die();
  }

  die(): void {
    if (this.phase === 'dying' || this.phase === 'over') return;
    this.player.alive = false;
    this.phase = 'dying';
    this.deathT = 0;
    this.formation.mode = 'hold';
    this.balls.canFire = false;
    this.sink.emit('playerDeath', this.player.x, F.catchY, 0, 0);
  }

  heal(n: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + n);
    if (p.hp > before) this.sink.emit('heal', p.x, F.catchY, p.hp - before, 0);
  }

  // ================================================================== xp / score / combo
  xpToNext(): number {
    return config.xp.base + config.xp.perLevel * (this.level - 1);
  }
  addXp(v: number): void {
    this.xp += v;
    let need = this.xpToNext();
    while (this.xp >= need) {
      this.xp -= need;
      this.level++;
      this.pendingLevelUps++;
      this.sink.emit('levelUp', this.player.x, F.catchY, this.level, 0);
      need = this.xpToNext();
    }
  }

  addScore(v: number, flat = false): void {
    void flat;
    this.score += Math.round(v * (this.endless ? config.score.endlessMult : 1));
  }

  comboMult(): number {
    return this.comboTier >= 0 ? config.combo.mults[this.comboTier]! : 1;
  }

  comboWindow(): number {
    const C = config.combo;
    const t = Math.max(0, Math.min(1, (this.combo - C.shrinkFrom) / (C.shrinkTo - C.shrinkFrom)));
    return C.window - (C.window - C.windowMin) * t;
  }

  private tierOf(c: number): number {
    const tiers = config.combo.tiers;
    let tier = -1;
    for (let i = 0; i < tiers.length; i++) if (c >= tiers[i]!) tier = i;
    return tier;
  }

  addCombo(n: number): void {
    if (this.tut && this.tut.step < 1) return;
    const before = this.combo;
    this.combo = Math.min(config.combo.cap, this.combo + n);
    this.comboT = this.comboWindow();
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const tiers = config.combo.tiers;
    let tier = -1;
    for (let i = 0; i < tiers.length; i++) if (this.combo >= tiers[i]!) tier = i;
    if (tier > this.comboTier) {
      this.comboTier = tier;
      if (tier > this.runStats.maxComboTier) this.runStats.maxComboTier = tier;
      this.sink.emit('comboTier', 372, 520, tier, this.combo);
    }
    for (const m of config.combo.milestones) {
      if (before < m && this.combo >= m) this.sink.emit('comboMilestone', 195, 330, m, 0);
    }
  }

  breakCombo(byDamage: boolean): void {
    if (this.combo >= config.combo.tiers[0]!) this.sink.emit('comboBreak', 372, 520, this.combo, byDamage ? 1 : 0);
    this.combo = 0;
    this.comboT = 0;
    this.comboTier = -1;
  }

  // ================================================================== balls
  ballDamage(b: Ball): number {
    const kindMult = b.kind === KIND_SHARD ? this.stats.shardDmg : b.kind === KIND_ECHO ? config.echo.damage : b.kind === KIND_DART ? config.dart.damage : 1;
    return config.ball.baseDamage * this.stats.dmgMult * (1 + config.charge.perStack * b.charges) * kindMult;
  }

  onCatch(b: Ball, perfect: boolean): void {
    this.runStats.catches++;
    if (perfect) {
      this.runStats.perfect++;
      this.addScore(config.score.perfect * this.comboMult());
      this.sink.emit('perfectCatch', b.x, F.catchY, b.charges, b.kind);
    } else this.sink.emit('catch', b.x, F.catchY, b.charges, b.kind);
    this.tut?.onCatch();
  }
  onMiss(): void {
    this.tut?.onMiss();
    // a dropped main ball costs half the combo (and the tier with it)
    this.cutCombo(config.combo.missKeep);
  }

  /** keep a fraction of the combo; below the first tier it breaks */
  cutCombo(keep: number): void {
    if (this.combo <= 0) return;
    const kept = Math.floor(this.combo * keep);
    if (kept < config.combo.tiers[0]!) {
      this.breakCombo(false);
      return;
    }
    const lost = this.combo - kept;
    this.combo = kept;
    this.comboTier = this.tierOf(kept);
    this.comboT = Math.min(this.comboT, this.comboWindow());
    this.sink.emit('comboDrop', 372, 505, lost, kept);
  }

  bossChillMult(): number {
    return 1;
  }

  // homing targets: >=0 brick id, <=-2 boss part (-2-index)
  targetAlive(t: number): boolean {
    if (t >= 0) {
      const b = this.formation.bricks[t];
      return !!b && b.alive;
    }
    if (t <= -2 && this.boss) {
      const p = this.boss.parts[-2 - t];
      return !!p && p.alive && this.boss.state === 'fight';
    }
    return false;
  }
  targetX(t: number): number {
    if (t >= 0) return this.formation.cx(this.formation.bricks[t]!);
    return this.boss?.parts[-2 - t]?.x ?? 195;
  }
  targetY(t: number): number {
    if (t >= 0) return this.formation.cy(this.formation.bricks[t]!);
    return this.boss?.parts[-2 - t]?.y ?? 200;
  }
  findTarget(b: Ball, coneDeg: number, threatFirst: boolean): number {
    const f = this.formation;
    const half = (coneDeg * Math.PI) / 360;
    const cosHalf = Math.cos(half);
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    let best = -1;
    let bestV = -1e12;
    for (const br of f.bricks) {
      if (!br.alive) continue;
      const ty = f.cy(br);
      if (ty < F.ceilY) continue;
      const dx = f.cx(br) - b.x;
      const dy = ty - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (coneDeg < 360 && (dx * ux + dy * uy) / d < cosHalf) continue;
      const v = threatFirst ? ty * 2 - d * 0.3 : -d;
      if (v > bestV) {
        bestV = v;
        best = br.id;
      }
    }
    if (this.boss && this.boss.state === 'fight') {
      for (const p of this.boss.parts) {
        if (!p.alive) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (coneDeg < 360 && (dx * ux + dy * uy) / d < cosHalf) continue;
        const v = threatFirst ? p.y * 2 - d * 0.3 + 200 : -d + 60;
        if (v > bestV) {
          bestV = v;
          best = -2 - p.index;
        }
      }
    }
    return best;
  }

  // ================================================================== upgrades
  recomputeStats(): void {
    this.stats = computeStats(this.levels, this.evolutions, this.stats);
    if (this.balls) this.balls.syncOwned();
    if (this.player && this.player.hp > this.stats.maxHp) this.player.hp = this.stats.maxHp;
  }

  rollOffer(): Card[] {
    if (this.forcedCards) {
      const cards = this.forcedCards.map((id) => ({ kind: 'upgrade' as const, id, from: this.levels[id], to: this.levels[id] + 1 }));
      this.forcedCards = null;
      this.offersMade++;
      return cards;
    }
    return rollOffer(this);
  }

  /** consume one pending level-up by applying a card */
  applyCard(c: Card): void {
    if (this.pendingLevelUps > 0) this.pendingLevelUps--;
    this.levelUpsTaken++;
    if (c.kind === 'battery') this.heal(config.fillers.batteryHeal);
    else if (c.kind === 'cache') this.addScore(config.fillers.cachePerWave * this.wave);
    else if (c.kind === 'evolution') this.evolve(c.id as EvolutionId);
    else this.setLevel(c.id as UpgradeId, c.to);
  }

  setLevel(id: UpgradeId, lv: number): void {
    const before = this.levels[id];
    this.levels[id] = Math.max(0, Math.min(5, lv));
    if (before === 0 && this.levels[id] > 0 && (id === 'fire' || id === 'ice' || id === 'blast')) {
      if (id === 'ice' || !this.evolutions.has('supernova')) this.elementCycle.push(id);
    }
    if (id === 'aegis' && this.levels[id] > before) {
      this.recomputeStats();
      this.heal(config.upgrades.aegis.heal * (this.levels[id] - before));
      if (before < 2 && this.levels[id] >= 2) this.player.barrierT = 0;
    }
    this.recomputeStats();
  }

  evolve(id: EvolutionId): void {
    if (this.evolutions.has(id)) return;
    const e = EVOLUTIONS[id];
    if (this.levels[e.main] < 5) this.setLevel(e.main, 5);
    if (this.levels[e.partner] < 3) this.setLevel(e.partner, 3);
    this.evolutions.add(id);
    this.runStats.evolutions++;
    if (id === 'supernova') {
      const i = this.elementCycle.findIndex((x) => x === 'fire' || x === 'blast');
      const filtered = this.elementCycle.filter((x) => x !== 'fire' && x !== 'blast');
      filtered.splice(Math.max(0, Math.min(i, filtered.length)), 0, 'nova');
      this.elementCycle = filtered;
      for (const b of this.balls.pool) if (b.alive && (b.element === 'fire' || b.element === 'blast')) b.element = 'nova';
    }
    this.recomputeStats();
    this.sink.emit('evolve', this.player.x, F.catchY, Object.keys(EVOLUTIONS).indexOf(id), 0);
  }

  weaponSlotsUsed(): number {
    let n = 0;
    for (const id of WEAPON_IDS) if (this.levels[id] > 0) n++;
    return n;
  }
  moduleSlotsUsed(): number {
    let n = 0;
    for (const id of MODULE_IDS) if (this.levels[id] > 0) n++;
    return n;
  }

  // ================================================================== snapshot
  snapshot(scene: Snapshot['scene'], quality: Snapshot['quality'], fps: number): Snapshot {
    const levels = {} as Record<UpgradeId, number>;
    for (const id of UPGRADE_IDS) levels[id] = this.levels[id];
    return {
      scene,
      wave: this.wave,
      endless: this.endless,
      time: Math.round(this.runTime * 10) / 10,
      hp: this.player.hp,
      maxHp: this.stats.maxHp,
      level: this.level,
      xp: Math.round(this.xp * 10) / 10,
      xpToNext: this.xpToNext(),
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      balls: {
        main: this.balls.owned,
        inFlight: this.balls.mainInFlight,
        magazine: this.balls.magazine,
        shards: this.balls.shards + this.balls.darts,
        echoes: this.balls.echoes,
      },
      bricks: { alive: this.formation.aliveCount, lowestRow: this.formation.lowestDisplayRow(), pressure: Math.round(this.pressure * 100) / 100 },
      levels,
      evolutions: [...this.evolutions],
      boss: this.boss ? { kind: this.boss.kind, hp: Math.round(this.boss.hp), maxHp: Math.round(this.boss.maxHp), phase: this.boss.phase } : null,
      quality,
      fps,
    };
  }
}
