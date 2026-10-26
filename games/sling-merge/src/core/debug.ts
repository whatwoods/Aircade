/**
 * ?debug=1：FPS/耗时浮层、window.__game API、调试快捷键（docs §8）。
 */
import type { App } from '../app';
import { CONFIG, fruitDef } from '../config';
import { baseSeed, rngFx, rngGame } from './rng';
import { clearAll, save } from './storage';
import { bus } from './events';
import type { Expression, Fruit } from '../game/fruits';

const DEG = Math.PI / 180;

export const DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
})();

export function urlParam(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

interface FruitSnap {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  state: string;
  overTime: number;
  sleeping: boolean;
}

export class Debug {
  private el: HTMLElement | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsVal = 60;
  private frameSum = 0;
  private frameMax = 0;
  private physSum = 0;
  private frameAvg = 0;
  private frameMaxShown = 0;
  private physAvg = 0;
  private mouse = { x: 195, y: 300 };
  private chainLeft = 0;
  private seed = baseSeed;

  private app: App;

  constructor(app: App) {
    this.app = app;
    // fps 计数始终运行（state().fps 需要），浮层只在 debug 下显示
    if (!DEBUG) return;
    const el = document.createElement('div');
    el.id = 'debug';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this.el = el;
    (window as unknown as { __game: unknown }).__game = this.api();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', (e) => {
      app.stage.toLogical(e.clientX, e.clientY, this.mouse);
    });
    bus.on((e) => {
      if (e.t === 'merge' && this.chainLeft > 0 && e.newId > 0) {
        this.chainLeft--;
        const nf = app.game.fruitById(e.newId);
        if (nf) this.placePartner(nf);
      }
    });
  }

  get fps(): number {
    return this.fpsVal;
  }

  frame(realDt: number): void {
    const loop = this.app.loop;
    this.fpsAcc += realDt;
    this.fpsFrames++;
    this.frameSum += loop.frameMs;
    this.physSum += loop.physMs;
    if (loop.frameMs > this.frameMax) this.frameMax = loop.frameMs;
    if (this.fpsAcc >= 0.5) {
      this.fpsVal = this.fpsFrames / this.fpsAcc;
      this.frameAvg = this.frameSum / this.fpsFrames;
      this.physAvg = this.physSum / this.fpsFrames;
      this.frameMaxShown = this.frameMax;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.frameSum = 0;
      this.physSum = 0;
      this.frameMax = 0;
      if (this.el) this.renderOverlay();
    }
  }

  private renderOverlay(): void {
    const g = this.app.game;
    const w = g.world;
    let asleep = 0;
    for (const b of w.bodies) if (b.sleeping && b.alive) asleep++;
    const total = w.bodies.length;
    this.el!.textContent =
      `FPS ${this.fpsVal.toFixed(0)}  frame ${this.frameAvg.toFixed(2)}/${this.frameMaxShown.toFixed(1)}ms\n` +
      `phys ${this.physAvg.toFixed(2)}ms  bodies ${total - asleep}/${asleep}z  contacts ${w.contactCount}\n` +
      `particles ${this.app.renderer.particleCount()}  danger ${g.dangerMax.toFixed(2)}  faults ${w.faults}\n` +
      `seed ${this.seed}  q${this.app.quality.level}${this.app.quality.locked ? 'L' : ''}  ${g.scene}`;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const app = this.app;
    const g = app.game;
    const k = e.key.toLowerCase();
    const idx = '1234567890-'.indexOf(e.key);
    if (idx >= 0 && !e.ctrlKey && !e.metaKey) {
      const lv = idx + 1;
      const r = fruitDef(lv).radius;
      const inner = CONFIG.layout.jar.inner;
      const x = Math.min(inner.R - r, Math.max(inner.L + r, this.mouse.x));
      const y = Math.min(inner.B - r, Math.max(inner.T + r, this.mouse.y));
      g.spawnFruit(lv, x, y);
      return;
    }
    if (k === 'h') app.renderer.hitboxes = !app.renderer.hitboxes;
    else if (k === 'n' && app.isPaused()) app.loop.step(1);
    else if (k === 'g') g.gameOver(g.dangerCulprit ?? this.lowest());
    else if (k === 'm') this.mergeLevel(10);
  };

  private lowest(): Fruit | null {
    let best: Fruit | null = null;
    for (const f of this.app.game.fruits) if (!best || f.body.y + f.body.r > best.body.y + best.body.r) best = f;
    return best;
  }

  private snapFruits(): FruitSnap[] {
    const out: FruitSnap[] = [];
    for (const f of this.app.game.fruits) {
      const b = f.body;
      out.push({
        id: f.id, level: f.level, x: +b.x.toFixed(2), y: +b.y.toFixed(2), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2),
        r: +b.r.toFixed(2), state: f.state, overTime: +f.overTime.toFixed(3), sleeping: b.sleeping,
      });
    }
    return out;
  }

  /** 同步推进固定步（不经过 RAF） */
  private sim(steps: number): void {
    const g = this.app.game;
    const dt = CONFIG.physics.fixedDt;
    for (let i = 0; i < steps; i++) g.fixedStep(dt);
  }

  private mergeLevel(level: number, x?: number, y?: number): number {
    const g = this.app.game;
    if (g.scene !== 'playing' && g.scene !== 'title') this.app.startRun(false, false);
    const lv = Math.max(1, Math.min(CONFIG.maxLevel, level | 0));
    const r = fruitDef(lv).radius;
    const inner = CONFIG.layout.jar.inner;
    const cx = Math.min(inner.R - 2 * r, Math.max(inner.L + 2 * r, x ?? 195));
    const cy = Math.min(inner.B - r, Math.max(inner.T + r, y ?? inner.T + r + 40));
    const a = g.spawnFruit(lv, cx - r, cy);
    const b = g.spawnFruit(lv, cx + r, cy);
    if (lv >= CONFIG.maxLevel) {
      g.superMerge(a, b);
      return -1;
    }
    const nf = g.merge(a, b);
    return nf.id;
  }

  private placePartner(nf: Fruit): void {
    const g = this.app.game;
    const lv = nf.level;
    if (lv >= CONFIG.maxLevel) return;
    const r = fruitDef(lv).radius;
    const inner = CONFIG.layout.jar.inner;
    const nb = nf.body;
    // 选一侧空间更大的方向
    const right = nb.x < (inner.L + inner.R) / 2;
    const d = nb.r1 + r + 0.4;
    let px = nb.x + (right ? d : -d);
    let py = nb.y;
    if (px > inner.R - r || px < inner.L + r) {
      px = nb.x;
      py = nb.y + d;
    }
    px = Math.min(inner.R - r, Math.max(inner.L + r, px));
    py = Math.min(inner.B - r, Math.max(inner.T + r, py));
    g.spawnFruit(lv, px, py);
  }

  private aimAt(angleDeg: number, power: number): void {
    const s = this.app.game.sling;
    s.setAim(angleDeg * DEG, power);
  }

  api(): Record<string, unknown> {
    const app = this.app;
    const g = app.game;
    const self = this;
    return {
      state: () => ({
        scene: g.scene,
        paused: app.isPaused(),
        score: g.run.score,
        best: g.best,
        combo: g.run.combo,
        maxCombo: g.run.maxCombo,
        current: g.sling.loaded,
        next: g.run.next,
        cooldown: +g.sling.cooldown.toFixed(3),
        dangerMax: +g.dangerMax.toFixed(3),
        dangerLevel: g.dangerLevel,
        tutorialStep: g.tutorial.active ? g.tutorial.step : -1,
        tutorialText: g.tutorial.cardVisible ? g.tutorial.card.text : '',
        highestLevel: g.run.highestLevel,
        shots: g.run.shots,
        merges: g.run.merges,
        faults: g.world.faults,
        quality: app.quality.level,
        fruits: self.snapFruits(),
        fps: +self.fpsVal.toFixed(1),
      }),
      start: (opts?: { seed?: number; tutorial?: boolean }) => {
        if (opts && typeof opts.seed === 'number') {
          rngGame.reseed(opts.seed);
          rngFx.reseed(opts.seed + 1);
          self.seed = opts.seed;
        }
        app.startRun(!!(opts && opts.tutorial), false);
        return true;
      },
      goto: (scene: string) => {
        if (scene === 'title') app.toTitle(false);
        else if (scene === 'game' || scene === 'playing') app.startRun(false, false);
        else if (scene === 'results') {
          if (g.scene !== 'playing') app.startRun(false, false);
          g.gameOver(null);
          g.skipGameOver();
          self.sim(30);
          app.showResults();
        }
        return g.scene;
      },
      pause: () => app.pause(),
      resume: () => app.resume(),
      step: (frames = 1) => {
        if (!app.isPaused()) app.pause(false);
        self.sim(Math.max(1, frames | 0));
        return g.scene;
      },
      setTimeScale: (s: number) => {
        app.loop.timeScale = Math.min(4, Math.max(0.1, s));
        return app.loop.timeScale;
      },
      spawn: (level: number, x?: number, y?: number) => {
        const lv = Math.max(1, Math.min(CONFIG.maxLevel, level | 0));
        const r = fruitDef(lv).radius;
        const inner = CONFIG.layout.jar.inner;
        let px = x;
        let py = y;
        if (px === undefined || py === undefined) {
          const spot = g.findFreeSpot(r);
          px = px ?? spot.x;
          py = py ?? spot.y;
        }
        px = Math.min(inner.R - r, Math.max(inner.L + r, px));
        py = Math.min(inner.B - r, Math.max(inner.T + r, py));
        return g.spawnFruit(lv, px, py).id;
      },
      clear: () => {
        g.clearFruits();
        return true;
      },
      setCurrent: (level: number) => {
        g.setLoaded(Math.max(1, Math.min(CONFIG.maxLevel, level | 0)));
        return g.sling.loaded;
      },
      setNext: (level: number) => {
        g.setNext(Math.max(1, Math.min(CONFIG.maxLevel, level | 0)));
        return g.run.next;
      },
      shoot: (angleDeg: number, power: number) => {
        if (g.scene !== 'playing') return null;
        if (g.sling.loaded === null) g.setLoaded(g.run.next);
        self.aimAt(angleDeg, power);
        const f = g.launch();
        return f ? f.id : null;
      },
      predict: (angleDeg: number, power: number) => {
        if (g.sling.loaded === null) g.setLoaded(g.run.next);
        const s = g.sling;
        const was = s.aiming;
        self.aimAt(angleDeg, power);
        s.aiming = true;
        g.predDirty();
        g.updatePrediction();
        s.aiming = was;
        const pr = g.prediction;
        const points: [number, number][] = [];
        for (let i = 0; i < pr.count; i++) points.push([+pr.xs[i]!.toFixed(2), +pr.ys[i]!.toFixed(2)]);
        const bounces: [number, number][] = [];
        for (let i = 0; i < Math.min(pr.bounceCount, pr.bx.length); i++) bounces.push([+pr.bx[i]!.toFixed(2), +pr.by[i]!.toFixed(2)]);
        const t = g.predictTarget;
        return {
          points,
          bounces,
          hit: t ? { id: t.id, level: t.level, x: +t.body.x.toFixed(2), y: +t.body.y.toFixed(2) } : null,
          hitLid: pr.hitLid,
          end: [+pr.endX.toFixed(2), +pr.endY.toFixed(2)],
        };
      },
      verifyPrediction: (angleDeg: number, power: number) => self.verify(angleDeg, power),
      merge: (level: number, x?: number, y?: number) => self.mergeLevel(level, x, y),
      chain: (n: number) => {
        if (g.scene !== 'playing') app.startRun(false, false);
        self.chainLeft = Math.max(0, Math.min(10, (n | 0) - 1));
        const id = self.mergeLevel(1);
        return id;
      },
      showcase: () => {
        if (g.scene !== 'playing') app.startRun(false, false);
        g.clearFruits();
        g.noDanger = true;
        const spots: [number, number, number][] = [
          [11, 104, 212], [10, 284, 214],
          [9, 90, 378], [8, 208, 382], [7, 314, 392],
          [6, 72, 530], [5, 172, 532], [4, 262, 534], [3, 334, 536],
          [2, 140, 648], [1, 250, 652],
        ];
        for (const [lv, x, y] of spots) g.spawnFruit(lv, x, y);
        g.freezePhysics = true;
        g.sling.loaded = null;
        g.sling.cooldown = 99;
        return spots.length;
      },
      unfreeze: () => {
        g.freezePhysics = false;
        g.sling.cooldown = 0;
        return true;
      },
      expr: (name: string | null) => {
        g.forceExpr = (name && name !== 'none' ? name : null) as Expression | null;
        return g.forceExpr;
      },
      fillToLine: (opts?: { cross?: boolean }) => self.fill(!!(opts && opts.cross)),
      triggerDanger: () => self.fill(true),
      gameOver: () => {
        if (g.scene !== 'playing') return false;
        g.gameOver(g.dangerCulprit ?? self.lowest());
        return true;
      },
      addScore: (n: number) => {
        g.run.score += n | 0;
        return g.run.score;
      },
      setCombo: (n: number) => {
        g.run.combo = Math.max(0, n | 0);
        g.run.comboTimer = CONFIG.combo.window;
        if (g.run.combo > g.run.maxCombo) g.run.maxCombo = g.run.combo;
        return g.run.combo;
      },
      setBest: (n: number) => {
        g.best = Math.max(0, n | 0);
        save('best', String(g.best));
        return g.best;
      },
      discover: (level: number) => {
        g.discovered = Math.max(5, Math.min(CONFIG.maxLevel, level | 0));
        save('discovered', String(g.discovered));
        return g.discovered;
      },
      resetSave: () => {
        clearAll();
        g.best = 0;
        g.discovered = 5;
        g.tutorial.resetTips();
        return true;
      },
      tutorial: (step?: number) => {
        if (step === undefined) {
          app.startRun(true, false);
        } else {
          if (g.scene !== 'playing') app.startRun(true, false);
          g.tutorial.jump(step);
        }
        return g.tutorial.step;
      },
      hitboxes: (on?: boolean) => {
        app.renderer.hitboxes = on === undefined ? !app.renderer.hitboxes : on;
        return app.renderer.hitboxes;
      },
      quality: (level: number) => {
        app.quality.set(level, true);
        return app.quality.level;
      },
      stress: (n: number) => self.stress(n),
      /** 额外：开关合成（性能测试用，摆满 150 果） */
      setMerges: (on: boolean) => {
        g.mergesEnabled = on !== false;
        return g.mergesEnabled;
      },
      autoplay: (on: boolean) => {
        g.autoplay = on !== false;
        return g.autoplay;
      },
      config: CONFIG,
    };
  }

  // ───────────── 验收工具 ─────────────

  private verify(angleDeg: number, power: number): { maxError: number; compared: number; predicted: number; hit: boolean } {
    const app = this.app;
    const g = app.game;
    if (g.scene !== 'playing') app.startRun(false, false);
    if (!app.isPaused()) app.pause(false);
    if (g.sling.loaded === null) g.setLoaded(g.run.next);
    // 预测
    this.aimAt(angleDeg, power);
    const s = g.sling;
    s.aiming = true;
    g.predDirty();
    g.updatePrediction();
    s.aiming = false;
    const pr = g.prediction;
    const n = pr.count;
    const px = Array.from(pr.xs.subarray(0, n));
    const py = Array.from(pr.ys.subarray(0, n));
    // 预测点 i（i ≥ 1）= 第 i 个子步之后的位置；最后一点是二分接触点（不比较）
    const comparable = pr.ended ? n - 2 : n - 1;
    const f = g.launch();
    if (!f) return { maxError: -1, compared: 0, predicted: n, hit: false };
    let sub = 0;
    let maxErr = 0;
    let compared = 0;
    let contact = false;
    g.substepProbe = () => {
      if (contact || !f.body.alive) return false;
      sub++;
      if (sub <= comparable) {
        const ex = f.body.x - px[sub]!;
        const ey = f.body.y - py[sub]!;
        const e = Math.sqrt(ex * ex + ey * ey);
        if (e > maxErr) maxErr = e;
        compared++;
      }
      return false;
    };
    const dt = CONFIG.physics.fixedDt;
    for (let i = 0; i < 200 && sub < comparable; i++) {
      g.fixedStep(dt);
      if (!f.body.alive || f.state !== 'flying') {
        contact = true;
        break;
      }
    }
    g.substepProbe = undefined;
    return { maxError: +maxErr.toFixed(5), compared, predicted: n, hit: pr.ended };
  }

  private fill(cross: boolean): { count: number; asleep: number; crossing: boolean } {
    const app = this.app;
    const g = app.game;
    if (g.scene !== 'playing') app.startRun(false, false);
    if (g.tutorial.active) g.tutorial.skip();
    const inner = CONFIG.layout.jar.inner;
    const line = CONFIG.layout.dangerY;
    const target = line - 10;
    const fx = rngGame;
    for (let iter = 0; iter < 260; iter++) {
      // 找局部堆叠底部最高（y 最小）的列
      let bestX = 195;
      let bestBottom = 1e9;
      for (let k = 0; k < 18; k++) {
        const x = inner.L + 16 + (k + 0.5) * ((inner.R - inner.L - 32) / 18);
        let bottom = inner.T;
        for (const f of g.fruits) {
          const dx = Math.abs(f.body.x - x);
          if (dx < f.body.r) {
            const b = f.body.y + Math.sqrt(f.body.r * f.body.r - dx * dx);
            if (b > bottom) bottom = b;
          }
        }
        if (bottom < bestBottom) {
          bestBottom = bottom;
          bestX = x;
        }
      }
      const room = target - bestBottom;
      if (room < 28) break;
      let maxLv = 5;
      while (maxLv > 1 && fruitDef(maxLv).radius * 2 > room) maxLv--;
      const lv = 1 + Math.floor(fx.next() * maxLv);
      const r = fruitDef(lv).radius;
      const x = Math.min(inner.R - r, Math.max(inner.L + r, bestX + (fx.next() - 0.5) * 8));
      g.spawnFruit(lv, x, bestBottom + r + 1);
      this.sim(12);
    }
    this.sim(90);
    // 越线的果
    let crossing = false;
    if (cross) {
      let bottom = 0;
      let bx = 195;
      for (const f of g.fruits) {
        if (f.body.y + f.body.r > bottom) {
          bottom = f.body.y + f.body.r;
          bx = f.body.x;
        }
      }
      // 选一个和附近水果都不同级的，免得一碰就合成掉、不越线
      let lv = 4;
      for (const cand of [4, 3, 5, 2, 1]) {
        const cr = fruitDef(cand).radius;
        const cx = Math.min(inner.R - cr, Math.max(inner.L + cr, bx));
        let clash = false;
        for (const f of g.fruits) {
          if (f.level === cand && Math.hypot(f.body.x - cx, f.body.y - bottom) < f.body.r + cr * 2 + 40) clash = true;
        }
        if (!clash) {
          lv = cand;
          break;
        }
      }
      const r = fruitDef(lv).radius;
      const nf = g.spawnFruit(lv, Math.min(inner.R - r, Math.max(inner.L + r, bx)), Math.max(bottom + r + 1, line + r + 6));
      nf.sinceFirstContact = CONFIG.danger.graceAfterContact;
      crossing = true;
    }
    let asleep = 0;
    for (const b of g.world.bodies) if (b.sleeping) asleep++;
    return { count: g.fruits.length, asleep, crossing };
  }

  private stress(n: number): { shots: number; faults: number; outOfBounds: number; bodies: number; physMsAvg: number; physMsMax: number } {
    const app = this.app;
    const g = app.game;
    if (g.scene !== 'playing') app.startRun(false, false);
    if (g.tutorial.active) g.tutorial.skip();
    const wasPaused = app.isPaused();
    if (!wasPaused) app.pause(false);
    g.noDanger = true;
    const inner = CONFIG.layout.jar.inner;
    const dt = CONFIG.physics.fixedDt;
    let oob = 0;
    let tSum = 0;
    let tMax = 0;
    let steps = 0;
    const faults0 = g.world.faults;
    for (let i = 0; i < n; i++) {
      g.setLoaded(1 + Math.floor(rngGame.next() * 5));
      g.sling.setAim((rngGame.next() * 2 - 1) * CONFIG.aim.maxAngleDeg * DEG, 1);
      g.launch();
      for (let k = 0; k < 6; k++) {
        const t0 = performance.now();
        g.fixedStep(dt);
        const t = performance.now() - t0;
        tSum += t;
        steps++;
        if (t > tMax) tMax = t;
        for (const b of g.world.bodies) {
          if (!b.alive) continue;
          if (
            !Number.isFinite(b.x) || !Number.isFinite(b.y) ||
            b.x < inner.L + b.r - 0.5 || b.x > inner.R - b.r + 0.5 ||
            b.y < inner.T + b.r - 0.5 || b.y > inner.B - b.r + 0.5
          ) {
            oob++;
          }
        }
      }
    }
    this.sim(120);
    if (!wasPaused) app.resume();
    return {
      shots: n,
      faults: g.world.faults - faults0,
      outOfBounds: oob,
      bodies: g.fruits.length,
      physMsAvg: +(tSum / Math.max(1, steps)).toFixed(3),
      physMsMax: +tMax.toFixed(3),
    };
  }
}

