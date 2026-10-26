/**
 * 局状态机与核心规则：发射、合成、连锁、计分、警戒线、失败、标题演示。
 * 只改状态并发出事件；画面/音频/UI 订阅事件（docs §3、§7）。
 */
import { CONFIG, fruitDef } from '../config';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import { rngFx, rngGame } from '../core/rng';
import { load, loadJson, loadNumber, save, saveJson, type Stats } from '../core/storage';
import { applyFlightParams, makeResult, makeSnapshot, Predictor } from '../physics/predict';
import { World } from '../physics/world';
import { kickStrain, makeVis, resetVis, setExpr, setStretch, type Expression, type Fruit } from './fruits';
import { Slingshot } from './slingshot';
import { Spawner } from './spawner';
import { TIP, Tutorial } from './tutorial';

export type Scene = 'boot' | 'title' | 'playing' | 'gameover' | 'results';

export interface RunState {
  score: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  shots: number;
  merges: number;
  time: number;
  highestLevel: number;
  rainbowMade: boolean;
  recordToastShown: boolean;
  bestAtStart: number;
  next: number;
  newRecord: boolean;
}

function makeRun(): RunState {
  return {
    score: 0, combo: 0, comboTimer: 0, maxCombo: 0, shots: 0, merges: 0, time: 0, highestLevel: 1,
    rainbowMade: false, recordToastShown: false, bestAtStart: 0, next: 1, newRecord: false,
  };
}

export class Game {
  world = new World<Fruit>();
  fruits: Fruit[] = [];
  private pool: Fruit[] = [];
  run: RunState = makeRun();
  spawner = new Spawner();
  sling = new Slingshot();
  tutorial: Tutorial;
  scene: Scene = 'boot';
  stepId = 0;
  time = 0;

  // 预测
  predictor = new Predictor();
  snapshot = makeSnapshot();
  prediction = makeResult();
  predictionOn = false;
  predictTarget: Fruit | null = null;
  predictSame = false;
  private predAngle = 99;
  private predPower = -1;
  private predLevel = -1;
  private bounceFrames = 0;
  private snapFruits: Fruit[] = [];

  // 存档
  best = 0;
  discovered = 5;
  stats: Stats;

  // 危险
  dangerLevel: 0 | 1 | 2 = 0;
  dangerMax = 0;
  dangerCulprit: Fruit | null = null;
  private lastTick = 0;

  // 失败序列
  overT = 0;
  culprit: Fruit | null = null;
  private popOrder: Fruit[] = [];
  private popIdx = 0;
  private popTimer = 0;
  private popInterval = 0.04;
  resultsReady = false;

  // 标题演示
  private nudgeT = 0;

  // 视线目标
  lookActive = false;
  lookX = 195;
  lookY = 700;
  flying: Fruit | null = null;

  // 调试
  noDanger = false;
  mergesEnabled = true;
  /** 展示模式：冻结物理（showcase） */
  freezePhysics = false;
  /** 调试：强制所有水果的表情 */
  forceExpr: Expression | null = null;
  /** 调试：bot 自动玩（P2） */
  autoplay = false;
  /** 调试：每个子步回调（verifyPrediction） */
  substepProbe: ((sub: number) => boolean) | undefined = undefined;

  private nextFruitId = 1;
  private kissTick = 0;

  constructor() {
    this.tutorial = new Tutorial(this);
    this.best = loadNumber('best', 0);
    this.discovered = Math.max(5, loadNumber('discovered', 5));
    this.stats = loadJson<Stats>('stats', { games: 0, bestCombo: 0, totalMerges: 0, rainbowCount: 0 });
  }

  // ───────────── 水果生命周期 ─────────────

  spawnFruit(level: number, x: number, y: number, growFrom = 0): Fruit {
    const def = fruitDef(level);
    const body = this.world.createBody(x, y, growFrom > 0 ? growFrom : def.radius, null);
    if (growFrom > 0) this.world.setRadius(body, def.radius, CONFIG.merge.growTime);
    let f = this.pool.pop();
    const phase = rngFx.next();
    if (!f) {
      f = {
        id: 0, level, body, state: 'active', age: 0, sinceFirstContact: 0, wallBounces: 0, overTime: 0,
        bornFromMerge: false, mergedStamp: -1, massBoostT: 0, flightT: 0, firstFruitContact: true,
        tutorialTarget: false, vis: makeVis(phase),
      };
    } else {
      resetVis(f.vis, phase);
    }
    f.id = this.nextFruitId++;
    f.level = level;
    f.body = body;
    f.state = 'active';
    f.age = 0;
    f.sinceFirstContact = CONFIG.danger.graceAfterContact;
    f.wallBounces = 0;
    f.overTime = 0;
    f.bornFromMerge = false;
    f.mergedStamp = -1;
    f.massBoostT = 0;
    f.flightT = 0;
    f.firstFruitContact = true;
    f.tutorialTarget = false;
    f.vis.rx = x;
    f.vis.ry = y;
    body.ref = f;
    this.fruits.push(f);
    if (level > this.run.highestLevel && this.scene === 'playing') this.run.highestLevel = level;
    return f;
  }

  removeFruit(f: Fruit): void {
    const i = this.fruits.indexOf(f);
    if (i >= 0) this.fruits.splice(i, 1);
    this.world.removeBody(f.body);
    f.body.ref = null;
    if (this.flying === f) this.flying = null;
    if (this.predictTarget === f) this.predictTarget = null;
    if (this.dangerCulprit === f) this.dangerCulprit = null;
    this.pool.push(f);
  }

  clearFruits(): void {
    while (this.fruits.length) this.removeFruit(this.fruits[this.fruits.length - 1]!);
    this.world.clear();
    this.flying = null;
  }

  fruitById(id: number): Fruit | null {
    for (const f of this.fruits) if (f.id === id) return f;
    return null;
  }

  // ───────────── 场景 ─────────────

  startTitle(): void {
    this.scene = 'title';
    this.freezePhysics = false;
    this.forceExpr = null;
    this.clearFruits();
    this.sling.reset();
    this.run = makeRun();
    this.dangerLevel = 0;
    this.dangerMax = 0;
    this.tutorial.stop();
    this.mergesEnabled = false;
    const inner = CONFIG.layout.jar.inner;
    const levels = [7, 6, 5, 4, 3, 2, 1];
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i]!;
      const r = fruitDef(lv).radius;
      const x = clamp(inner.L + 40 + rngFx.next() * (inner.R - inner.L - 80), inner.L + r, inner.R - r);
      const y = 420 + i * 50;
      const f = this.spawnFruit(lv, x, y);
      f.body.vx = (rngFx.next() - 0.5) * 60;
    }
    this.nudgeT = 1.2;
    bus.emit({ t: 'scene', scene: 'title' });
  }

  startRun(withTutorial: boolean): void {
    this.scene = 'playing';
    this.freezePhysics = false;
    this.forceExpr = null;
    this.clearFruits();
    this.sling.reset();
    this.run = makeRun();
    this.run.bestAtStart = this.best;
    this.dangerLevel = 0;
    this.dangerMax = 0;
    this.dangerCulprit = null;
    this.lastTick = 0;
    this.culprit = null;
    this.resultsReady = false;
    this.mergesEnabled = true;
    this.noDanger = false;
    this.time = 0;
    this.spawner.reset(withTutorial ? [] : CONFIG.spawn.opening);
    if (withTutorial) {
      this.tutorial.start();
    } else {
      this.tutorial.stop();
      this.sling.loaded = this.spawner.roll(1);
      this.run.next = this.spawner.roll(1);
    }
    bus.emit({ t: 'scene', scene: 'playing' });
    bus.emit({ t: 'reload', level: this.sling.loaded ?? 1 });
  }

  // ───────────── 发射 ─────────────

  canAim(): boolean {
    return this.scene === 'playing';
  }

  /** 由当前 sling 角度/力度发射 */
  launch(): Fruit | null {
    const s = this.sling;
    if (this.scene !== 'playing' || s.loaded === null || !s.valid) return null;
    const level = s.loaded;
    const P = CONFIG.layout.sling.pouch;
    const speed = Slingshot.speedFor(s.power);
    const f = this.spawnFruit(level, P.x, P.y);
    f.state = 'flying';
    f.sinceFirstContact = -1;
    f.firstFruitContact = false;
    applyFlightParams(this.world, f.body);
    f.body.vx = s.dirX * speed;
    f.body.vy = s.dirY * speed;
    setStretch(f.vis, s.dirX, s.dirY, 0.25);
    f.vis.trail = 1;
    this.flying = f;
    s.loaded = null;
    s.cooldown = CONFIG.shot.cooldown;
    s.hopT = -1;
    s.snapT = 0.4;
    this.run.shots++;
    this.predictionOn = false;
    bus.emit({ t: 'launch', level, angle: s.angle, power: s.power, x: P.x, y: P.y, dx: s.dirX, dy: s.dirY });
    this.tutorial.onLaunch();
    return f;
  }

  setLoaded(level: number): void {
    this.sling.loaded = level;
    this.sling.cooldown = 0;
    this.sling.hopT = -1;
    this.predDirty();
  }

  setNext(level: number): void {
    this.run.next = level;
    bus.emit({ t: 'nextChanged', level });
  }

  private updateReload(dt: number): void {
    const s = this.sling;
    if (s.loaded !== null) return;
    if (s.cooldown <= 0 && s.hopT < 0) {
      // 引导中无下一个时也要能补弹
      s.hopLevel = this.run.next;
      s.hopT = 0;
    }
    if (s.cooldown > 0) {
      const before = s.cooldown;
      s.cooldown -= dt;
      const S = CONFIG.shot;
      const hopStart = S.cooldown - S.reloadDelay;
      if (before > hopStart - S.reloadTime && s.hopT < 0 && S.cooldown - s.cooldown >= S.reloadDelay) {
        s.hopLevel = this.run.next;
        s.hopT = 0;
        const forced = this.tutorial.forcedNext();
        this.run.next = forced ?? this.spawner.roll(this.run.highestLevel, this.run.shots, this.rescueLevel());
        bus.emit({ t: 'nextChanged', level: this.run.next });
        bus.emit({ t: 'hop', level: s.hopLevel });
      }
    }
    if (s.hopT >= 0) {
      s.hopT = Math.min(1, s.hopT + dt / CONFIG.shot.reloadTime);
      if (s.hopT >= 1 && s.cooldown <= 0) {
        const forcedLoad = this.tutorial.forcedLoad();
        s.loaded = forcedLoad ?? s.hopLevel;
        s.hopT = -1;
        s.cooldown = 0;
        this.predDirty();
        bus.emit({ t: 'reload', level: s.loaded });
      }
    }
  }

  // ───────────── 预测 ─────────────

  predDirty(): void {
    this.predAngle = 99;
  }

  updatePrediction(): void {
    const s = this.sling;
    const show = this.scene === 'playing' && s.aiming && s.valid && s.loaded !== null;
    this.predictionOn = show;
    if (!show) {
      this.predictTarget = null;
      this.predictSame = false;
      this.bounceFrames = 0;
      return;
    }
    // 情境提示：反弹预测稳定显示约 0.3 s 后才提示（拖动途中一闪而过的不算）
    const pr0 = this.prediction;
    if (pr0.bounceCount > 0) {
      if (++this.bounceFrames === 18) this.tutorial.tip(TIP.bounce, '预测线会算上墙壁反弹', pr0.bx[0]!, pr0.by[0]!);
    } else {
      this.bounceFrames = 0;
    }
    const moving = this.world.awakeCount > (this.flying ? 1 : 0);
    if (
      !moving &&
      Math.abs(s.angle - this.predAngle) < 0.2 * (Math.PI / 180) &&
      Math.abs(s.power - this.predPower) < 0.005 &&
      this.predLevel === s.loaded
    ) {
      return;
    }
    this.predAngle = s.angle;
    this.predPower = s.power;
    this.predLevel = s.loaded!;
    this.buildSnapshot();
    const P = CONFIG.layout.sling.pouch;
    const speed = Slingshot.speedFor(s.power);
    const r = fruitDef(s.loaded!).radius;
    this.predictor.run(P.x, P.y, s.dirX * speed, s.dirY * speed, r, this.snapshot, this.prediction);
    const hit = this.prediction.hit;
    this.predictTarget = hit >= 0 ? this.snapFruits[hit] ?? null : null;
    this.predictSame = this.predictTarget !== null && this.predictTarget.level === s.loaded;
  }

  private buildSnapshot(): void {
    const sn = this.snapshot;
    sn.n = 0;
    this.snapFruits.length = 0;
    for (const f of this.fruits) {
      if (f.state === 'popping') continue;
      if (sn.n >= sn.x.length) break;
      sn.x[sn.n] = f.body.x;
      sn.y[sn.n] = f.body.y;
      sn.r[sn.n] = f.body.r1;
      sn.level[sn.n] = f.level;
      sn.id[sn.n] = f.id;
      this.snapFruits.push(f);
      sn.n++;
    }
  }

  // ───────────── 固定步 ─────────────

  fixedStep(dt: number): void {
    if (this.scene === 'boot' || this.scene === 'results') {
      if (this.scene === 'results' && this.fruits.length) this.world.step(dt);
      return;
    }
    if (this.scene === 'gameover') {
      this.updateGameOver(dt);
      return;
    }
    this.stepId++;
    this.time += dt;
    if (this.freezePhysics) {
      for (const f of this.fruits) f.age += dt;
      return;
    }
    this.world.step(dt, this.substepProbe);
    this.processImpacts();
    if (this.mergesEnabled) this.processMerges();
    this.updateFruits(dt);
    if (this.scene === 'title') {
      this.updateTitle(dt);
      return;
    }
    this.run.time += dt;
    // 连击窗口
    if (this.run.combo > 0) {
      this.run.comboTimer -= dt;
      if (this.run.comboTimer <= 0) {
        bus.emit({ t: 'comboEnd', combo: this.run.combo });
        this.run.combo = 0;
        this.run.comboTimer = 0;
      }
    }
    this.updateReload(dt);
    this.updateDanger(dt);
    if ((this.kissTick++ & 3) === 0) this.updateKiss();
    this.tutorial.update(dt);
  }

  private processImpacts(): void {
    const w = this.world;
    const bodies = w.bodies;
    for (let i = 0; i < w.impactCount; i++) {
      const im = w.impacts[i]!;
      const B = bodies[im.b];
      if (!B || !B.alive) continue;
      const fb = B.ref;
      if (!fb) continue;
      const sp = im.speed;
      const D = CONFIG.fx.deform;
      const kick = sp < D.impactMinSpeed ? 0 : D.impactKick * Math.min(sp / D.impactRefSpeed, 1.2);
      if (im.a === -1) {
        if (kick > 0) kickStrain(fb.vis, fb.level, im.nx, im.ny, kick);
        if (im.wall !== 2 && fb.state === 'flying') {
          fb.wallBounces++;
          bus.emit({ t: 'wallBounce', x: im.x, y: im.y, speed: sp, nx: im.nx, ny: im.ny, id: fb.id, level: fb.level });
        } else if (sp > CONFIG.impact.bumpSpeed) {
          bus.emit({ t: 'bump', x: im.x, y: im.y, speed: sp * 0.6, level: fb.level });
        }
        continue;
      }
      const A = bodies[im.a];
      if (!A || !A.alive || !A.ref) continue;
      const fa = A.ref;
      if (kick > 0) {
        kickStrain(fa.vis, fa.level, im.nx, im.ny, kick);
        kickStrain(fb.vis, fb.level, im.nx, im.ny, kick);
      }
      const first = (fa.state === 'flying' && !fa.firstFruitContact) || (fb.state === 'flying' && !fb.firstFruitContact);
      const IP = CONFIG.impact;
      if (sp >= IP.bumpSpeed) {
        const e = sp >= IP.dizzySpeed ? 'dizzy' : 'hit';
        const t = e === 'dizzy' ? 0.9 : 0.35;
        // 弹射物自己不晕，被撞的晕
        if (!(fa.state === 'flying')) setExpr(fa.vis, e, t);
        if (!(fb.state === 'flying')) setExpr(fb.vis, e, t);
        fa.vis.idleT = fb.vis.idleT = 0;
      }
      if (first) {
        const strong = sp >= CONFIG.shot.strongImpactSpeed;
        if (strong) {
          if (fa.state !== 'flying') fa.vis.flash = 1;
          if (fb.state !== 'flying') fb.vis.flash = 1;
        }
        bus.emit({ t: 'impact', a: fa.id, b: fb.id, x: im.x, y: im.y, speed: sp, first: true, strong });
      } else if (sp >= IP.bumpSpeed) {
        bus.emit({ t: 'bump', x: im.x, y: im.y, speed: sp, level: Math.max(fa.level, fb.level) });
      }
    }
  }

  private processMerges(): void {
    const w = this.world;
    const cs = w.contacts;
    const bodies = w.bodies;
    const slop = CONFIG.merge.contactSlop;
    const cool = CONFIG.merge.childCooldown;
    for (let i = 0; i < w.contactCount; i++) {
      const c = cs[i]!;
      if (c.wall >= 0 || c.a < 0) continue;
      if (c.sep > slop && c.maxNormalImpulse <= 0) continue;
      const A = bodies[c.a]!;
      const B = bodies[c.b]!;
      if (!A.alive || !B.alive) continue;
      const fa = A.ref;
      const fb = B.ref;
      if (!fa || !fb) continue;
      if (fa.level !== fb.level) continue;
      if (fa.mergedStamp === this.stepId || fb.mergedStamp === this.stepId) continue;
      if (fa.state === 'popping' || fb.state === 'popping') continue;
      if ((fa.bornFromMerge && fa.age < cool) || (fb.bornFromMerge && fb.age < cool)) continue;
      if (fa.level >= CONFIG.maxLevel) this.superMerge(fa, fb);
      else this.merge(fa, fb);
    }
  }

  private isTrick(f: Fruit): boolean {
    return f.state === 'flying' && !f.firstFruitContact && f.wallBounces >= 1;
  }

  merge(fa: Fruit, fb: Fruit): Fruit {
    const M = CONFIG.merge;
    const inner = CONFIG.layout.jar.inner;
    const A = fa.body;
    const B = fb.body;
    const L = fa.level + 1;
    const def = fruitDef(L);
    const nr = def.radius;
    let mx = (A.x + B.x) * 0.5;
    let my = (A.y + B.y) * 0.5;
    mx = clamp(mx, inner.L + nr, inner.R - nr);
    my = clamp(my, inner.T + nr, inner.B - nr);
    const vx = ((A.vx + B.vx) * 0.5) * M.velInherit;
    const vy = ((A.vy + B.vy) * 0.5) * M.velInherit + M.popKick;
    const wv = ((A.w + B.w) * 0.5) * M.spinInherit;
    const trick = this.isTrick(fa) || this.isTrick(fb);
    const clutch = fa.overTime >= CONFIG.danger.clutchThreshold || fb.overTime >= CONFIG.danger.clutchThreshold;
    const parentR = A.r1;
    const ax = A.x, ay = A.y, bx = B.x, by = B.y;
    const sa = (fa.vis.sa + fb.vis.sa) * 0.5;
    const sb = (fa.vis.sb + fb.vis.sb) * 0.5;
    fa.mergedStamp = fb.mergedStamp = this.stepId;
    this.removeFruit(fa);
    this.removeFruit(fb);
    const nf = this.spawnFruit(L, mx, my, parentR);
    nf.mergedStamp = this.stepId;
    nf.bornFromMerge = true;
    nf.body.vx = vx;
    nf.body.vy = vy;
    nf.body.w = wv;
    nf.vis.scale = 0.7;
    nf.vis.scaleV = 0;
    nf.vis.flash = 1;
    setExpr(nf.vis, 'born', 0.6);
    // 引导 T1：新青提直奔等待中的青提，且冲击波不推开它，保证新手看到两级连锁
    const assist = this.tutorial.chainAssist(L);
    if (assist) {
      const ab = assist.body;
      const dx = ab.x - mx;
      const dy = ab.y - my;
      const d = Math.max(1e-3, Math.hypot(dx, dy));
      nf.body.vx = (dx / d) * M.tutorialAssistSpeed;
      nf.body.vy = (dy / d) * M.tutorialAssistSpeed;
      nf.age = M.childCooldown; // 一碰到就能合成，不受出生冷却影响
      this.world.wake(ab);
    }
    this.blast(mx, my, nr, M.blastDv[L] ?? 100, M.blastRange, World.massFor(nr), nf, assist);

    const firstOfRun = L > this.run.highestLevel;
    if (L > this.run.highestLevel) this.run.highestLevel = L;
    let discovery = false;
    if (L > this.discovered && this.scene === 'playing') {
      this.discovered = L;
      save('discovered', String(L));
      discovery = L >= 6;
    }
    const firstRainbow = L === CONFIG.maxLevel && !this.run.rainbowMade && this.scene === 'playing';
    if (L === CONFIG.maxLevel) {
      this.run.rainbowMade = true;
      this.stats.rainbowCount++;
    }
    const gained = this.addMergeScore(L, false, trick, clutch, firstRainbow);
    bus.emit({
      t: 'merge', level: L, x: mx, y: my, combo: this.run.combo, gained, trick, clutch, superMerge: false,
      firstOfRun, discovery, firstRainbow, newR: nr, newId: nf.id, ax, ay, bx, by, parentLevel: L - 1, parentR, sa, sb,
    });
    if (clutch) bus.emit({ t: 'clutch', x: mx, y: my });
    this.tutorial.onMerge(L, this.run.combo);
    this.predDirty();
    return nf;
  }

  superMerge(fa: Fruit, fb: Fruit): void {
    const M = CONFIG.merge;
    const A = fa.body;
    const B = fb.body;
    const mx = (A.x + B.x) * 0.5;
    const my = (A.y + B.y) * 0.5;
    const ax = A.x, ay = A.y, bx = B.x, by = B.y;
    const parentR = A.r1;
    const clutch = fa.overTime >= CONFIG.danger.clutchThreshold || fb.overTime >= CONFIG.danger.clutchThreshold;
    fa.mergedStamp = fb.mergedStamp = this.stepId;
    this.removeFruit(fa);
    this.removeFruit(fb);
    this.blast(mx, my, 0, M.superBlastDv, M.superBlastRange, World.massFor(fruitDef(CONFIG.maxLevel).radius), null, null);
    const gained = this.addMergeScore(CONFIG.maxLevel, true, false, clutch, false);
    bus.emit({
      t: 'merge', level: CONFIG.maxLevel, x: mx, y: my, combo: this.run.combo, gained, trick: false, clutch,
      superMerge: true, firstOfRun: false, discovery: false, firstRainbow: false, newR: parentR, newId: -1,
      ax, ay, bx, by, parentLevel: CONFIG.maxLevel, parentR, sa: 0, sb: 0,
    });
    this.tutorial.onMerge(CONFIG.maxLevel, this.run.combo);
    this.predDirty();
  }

  private blast(x: number, y: number, r: number, dv: number, range: number, mNew: number, except: Fruit | null, except2: Fruit | null): void {
    for (const f of this.fruits) {
      if (f === except || f === except2 || f.state === 'popping') continue;
      const b = f.body;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      const surf = d - r - b.r;
      if (surf > range) continue;
      const fall = clamp(1 - Math.max(0, surf) / range, 0, 1);
      const ratio = Math.sqrt(clamp(mNew / b.baseMass, 0.5, 2));
      const k = dv * fall * ratio;
      const ux = d > 1e-4 ? dx / d : 0;
      const uy = d > 1e-4 ? dy / d : 1;
      this.world.wake(b);
      b.vx += ux * k;
      b.vy += uy * k;
      kickStrain(f.vis, f.level, ux, uy, 0.18 * fall);
      if (k >= CONFIG.impact.blastDizzySpeed) setExpr(f.vis, 'dizzy', 0.9);
      else if (k > 60) setExpr(f.vis, 'hit', 0.35);
    }
  }

  comboMul(c: number): number {
    const C = CONFIG.combo;
    if (c <= 0) return 1;
    if (c <= C.mul.length) return C.mul[c - 1]!;
    return Math.min(C.mulMax, C.mul[C.mul.length - 1]! + C.mulStep * (c - C.mul.length));
  }

  private addMergeScore(level: number, isSuper: boolean, trick: boolean, clutch: boolean, firstRainbow: boolean): number {
    const r = this.run;
    if (r.comboTimer > 0 && r.combo > 0) r.combo++;
    else r.combo = 1;
    r.comboTimer = CONFIG.combo.window;
    if (r.combo > r.maxCombo) r.maxCombo = r.combo;
    r.merges++;
    const S = CONFIG.score;
    const base = isSuper ? S.superMerge : S.mergeBase[level] ?? 0;
    let gained = Math.round(base * this.comboMul(r.combo) * (trick ? S.trickMul : 1));
    if (clutch) gained += S.clutchBonus;
    if (firstRainbow) gained += S.firstRainbow;
    if (this.scene !== 'playing') return gained;
    r.score += gained;
    if (!r.recordToastShown && r.bestAtStart > 0 && r.score > r.bestAtStart) {
      r.recordToastShown = true;
      bus.emit({ t: 'newBest' });
    }
    return gained;
  }

  private updateFruits(dt: number): void {
    const S = CONFIG.shot;
    const P = CONFIG.physics;
    for (const f of this.fruits) {
      f.age += dt;
      const b = f.body;
      if (f.sinceFirstContact >= 0) f.sinceFirstContact += dt;
      if (f.state === 'flying') {
        f.flightT += dt;
        if (b.hitFruit || b.hitLid || f.flightT > S.flightTimeout) {
          f.state = 'active';
          b.flight = false;
          b.drag = P.linearDrag;
          b.wallRest = P.wallRestitution;
          f.massBoostT = S.massBoostHold;
          f.sinceFirstContact = 0;
          f.firstFruitContact = true;
          f.vis.trail = 0;
          if (this.flying === f) this.flying = null;
        }
      } else if (b.hitFruit) {
        f.firstFruitContact = true;
      }
      if (f.massBoostT > 0) {
        f.massBoostT = Math.max(0, f.massBoostT - dt);
        b.massMul = 1 + (S.massBoost - 1) * (f.massBoostT / S.massBoostHold);
        this.world.updateMass(b);
      }
    }
  }

  private updateKiss(): void {
    const gap = CONFIG.merge.kissGap;
    const fr = this.fruits;
    for (const f of fr) f.vis.kiss = false;
    for (let i = 0; i < fr.length; i++) {
      const a = fr[i]!;
      if (a.state !== 'active') continue;
      for (let j = i + 1; j < fr.length; j++) {
        const b = fr[j]!;
        if (b.level !== a.level || b.state !== 'active') continue;
        const dx = b.body.x - a.body.x;
        const dy = b.body.y - a.body.y;
        const lim = a.body.r + b.body.r + gap;
        if (dx * dx + dy * dy > lim * lim) continue;
        a.vis.kiss = true;
        a.vis.kissX = b.body.x;
        a.vis.kissY = b.body.y;
        b.vis.kiss = true;
        b.vis.kissX = a.body.x;
        b.vis.kissY = a.body.y;
      }
    }
  }

  // ───────────── 警戒线 ─────────────

  /** 预警 / 危险中：返回最该被救的那颗果的等级（越线最久的，否则最低的），否则 0 */
  private rescueLevel(): number {
    if (this.dangerLevel === 0) return 0;
    if (this.dangerCulprit && this.dangerMax > 0) return this.dangerCulprit.level;
    let low: Fruit | null = null;
    for (const f of this.fruits) {
      if (f.state !== 'active') continue;
      if (!low || f.body.y + f.body.r > low.body.y + low.body.r) low = f;
    }
    return low ? low.level : 0;
  }

  private updateDanger(dt: number): void {
    const D = CONFIG.danger;
    const line = CONFIG.layout.dangerY;
    let maxOver = 0;
    let culprit: Fruit | null = null;
    let warn = false;
    const allowOver = !this.noDanger && !this.tutorial.active;
    for (const f of this.fruits) {
      if (f.state !== 'active') {
        f.overTime = 0;
        continue;
      }
      const bottom = f.body.y + f.body.r;
      const eligible = f.sinceFirstContact >= D.graceAfterContact;
      if (eligible && allowOver && bottom > line + D.tolerance) f.overTime += dt;
      else f.overTime = Math.max(0, f.overTime - dt * D.recoverRate);
      if (eligible && bottom > line - D.warnDistance) warn = true;
      if (f.overTime > maxOver) {
        maxOver = f.overTime;
        culprit = f;
      }
    }
    this.dangerMax = maxOver;
    this.dangerCulprit = culprit;
    const lvl: 0 | 1 | 2 = maxOver >= D.showAfter ? 2 : warn ? 1 : 0;
    if (lvl !== this.dangerLevel) {
      const prev = this.dangerLevel;
      this.dangerLevel = lvl;
      bus.emit({ t: 'danger', level: lvl });
      if (prev === 2 && lvl < 2) bus.emit({ t: 'dangerClear' });
      if (lvl === 2) {
        this.lastTick = 0;
        // 气泡指向越线的那颗果（放在倒计时下方会挡住数字）
        const cx = culprit ? culprit.body.x : 195;
        const cy = culprit ? culprit.body.y - culprit.body.r - 4 : line - 60;
        this.tutorial.tip(TIP.danger, '快！合成越线的水果就能解除危险', cx, cy);
      }
    }
    if (lvl === 2) {
      const left = Math.max(1, Math.ceil(D.limit - maxOver));
      if (left !== this.lastTick) {
        this.lastTick = left;
        bus.emit({ t: 'dangerTick', left });
      }
    }
    if (maxOver >= D.limit && culprit) this.gameOver(culprit);
  }

  // ───────────── 失败 ─────────────

  gameOver(culprit: Fruit | null): void {
    if (this.scene !== 'playing') return;
    this.scene = 'gameover';
    this.culprit = culprit ?? this.fruits[0] ?? null;
    this.overT = 0;
    this.sling.end();
    // 补弹跳跃进行到一半：直接落进皮兜，免得停在半空
    if (this.sling.hopT >= 0) {
      this.sling.loaded = this.sling.hopLevel;
      this.sling.hopT = -1;
    }
    this.predictionOn = false;
    this.tutorial.stop();
    for (const f of this.fruits) {
      setExpr(f.vis, f === this.culprit ? 'dead' : 'sad', 99);
      f.vis.expr = f === this.culprit ? 'dead' : 'sad';
      f.vis.exprT = 99;
    }
    // 破裂顺序：自下而上
    this.popOrder.length = 0;
    for (const f of this.fruits) this.popOrder.push(f);
    this.popOrder.sort((a, b) => b.body.y + b.body.r - (a.body.y + a.body.r));
    this.popIdx = 0;
    this.popTimer = 0.55;
    this.popInterval = Math.min(0.04, 1.2 / Math.max(1, this.popOrder.length));
    // 结算存档
    const r = this.run;
    r.newRecord = r.score > this.best;
    if (r.newRecord) {
      this.best = r.score;
      save('best', String(this.best));
    }
    this.stats.games++;
    this.stats.totalMerges += r.merges;
    if (r.maxCombo > this.stats.bestCombo) this.stats.bestCombo = r.maxCombo;
    saveJson('stats', this.stats);
    bus.emit({ t: 'gameOver', culprit: this.culprit ? this.culprit.id : -1 });
  }

  private updateGameOver(dt: number): void {
    this.overT += dt;
    if (this.popTimer > 0) {
      this.popTimer -= dt;
      return;
    }
    this.popTimer = this.popInterval;
    if (this.popIdx < this.popOrder.length) {
      const f = this.popOrder[this.popIdx]!;
      if (f.body.alive) {
        bus.emit({ t: 'pop', x: f.body.x, y: f.body.y, level: f.level, r: f.body.r, index: this.popIdx });
        this.removeFruit(f);
      }
      this.popIdx++;
      if (this.popIdx === 1) {
        // 皮兜与下一个也破裂
        const P = CONFIG.layout.sling.pouch;
        if (this.sling.loaded !== null) {
          bus.emit({ t: 'pop', x: P.x, y: P.y, level: this.sling.loaded, r: fruitDef(this.sling.loaded).radius, index: 0 });
          this.sling.loaded = null;
        }
      }
    } else if (!this.resultsReady && this.overT > 0.4) {
      this.resultsReady = true;
      this.scene = 'results';
      bus.emit({ t: 'scene', scene: 'results' });
    }
  }

  /** 点击跳过破裂动画 */
  skipGameOver(): void {
    if (this.scene !== 'gameover') return;
    while (this.popIdx < this.popOrder.length) {
      const f = this.popOrder[this.popIdx++]!;
      if (f.body.alive) {
        if (this.popIdx < 12) bus.emit({ t: 'pop', x: f.body.x, y: f.body.y, level: f.level, r: f.body.r, index: this.popIdx });
        this.removeFruit(f);
      }
    }
    this.sling.loaded = null;
    this.popTimer = 0;
    this.overT = Math.max(this.overT, 0.4);
  }

  // ───────────── 标题演示 ─────────────

  private updateTitle(dt: number): void {
    // 吉祥物占据罐顶中央：水果绕开它（位置投影 + 去掉向内速度），自然簇拥在两侧和下方
    const M = CONFIG.layout.mascot;
    for (const f of this.fruits) {
      const b = f.body;
      const dx = b.x - M.x;
      const dy = b.y - M.y;
      const min = b.r + M.r + 3;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1;
      const nx = d2 > 0 ? dx / d : 0;
      const ny = d2 > 0 ? dy / d : 1;
      b.x = M.x + nx * min;
      b.y = M.y + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= vn * nx * 1.15;
        b.vy -= vn * ny * 1.15;
      }
      if (b.sleeping) this.world.wake(b);
    }
    const caps = CONFIG.layout.titleCapsules;
    for (const f of this.fruits) {
      const b = f.body;
      for (let k = 0; k < caps.length; k++) {
        const c = caps[k]!;
        const x0 = c[0]!;
        const y0 = c[1]!;
        const sx = c[2]! - x0;
        const sy = c[3]! - y0;
        const t = clamp(((b.x - x0) * sx + (b.y - y0) * sy) / (sx * sx + sy * sy || 1), 0, 1);
        const qx = x0 + sx * t;
        const qy = y0 + sy * t;
        const dx = b.x - qx;
        const dy = b.y - qy;
        const min = b.r + c[4]! + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0;
        const ny = d > 1e-6 ? dy / d : 1;
        b.x = qx + nx * min;
        b.y = qy + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= vn * nx * 1.1;
          b.vy -= vn * ny * 1.1;
        }
        if (b.sleeping) this.world.wake(b);
      }
    }
    this.nudgeT -= dt;
    if (this.nudgeT <= 0 && this.fruits.length) {
      this.nudgeT = 1.1 + rngFx.next() * 1.2;
      const f = this.fruits[Math.floor(rngFx.next() * this.fruits.length)]!;
      this.world.wake(f.body);
      f.body.vx += (rngFx.next() - 0.5) * 220;
      f.body.vy += 90 + rngFx.next() * 120;
      kickStrain(f.vis, f.level, 0, 1, 0.05);
    }
  }

  // ───────────── 调试/工具 ─────────────

  /** 找罐顶附近的空位 */
  findFreeSpot(r: number): { x: number; y: number } {
    const inner = CONFIG.layout.jar.inner;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = inner.L + r + rngGame.next() * (inner.R - inner.L - 2 * r);
      for (let y = inner.T + r; y < CONFIG.layout.dangerY - r; y += 6) {
        let ok = true;
        for (const f of this.fruits) {
          const dx = f.body.x - x;
          const dy = f.body.y - y;
          const lim = f.body.r + r + 1;
          if (dx * dx + dy * dy < lim * lim) {
            ok = false;
            break;
          }
        }
        if (ok) return { x, y };
      }
    }
    return { x: 195, y: inner.T + r };
  }

  saveTutorialDone(): void {
    save('tutorialDone', '1');
  }

  get tutorialDone(): boolean {
    return load('tutorialDone') === '1';
  }
}
