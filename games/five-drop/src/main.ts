// 启动：canvas、自适应、主循环、场景切换、输入分发
import './styles.css';
import { CONFIG } from './config.ts';
import { computeLayout } from './render/layout.ts';
import type { Layout } from './render/layout.ts';
import { toLogical, toCss } from './render/layout.ts';
import { Backdrop } from './render/scenery.ts';
import { C, fCn, fNum } from './render/theme.ts';
import { UI } from './render/ui.ts';
import { Gestures } from './input/gestures.ts';
import { Keyboard } from './input/keyboard.ts';
import type { KeyAction } from './input/keyboard.ts';
import { audio } from './audio/audio.ts';
import { PlayScene } from './scenes/play.ts';
import { TitleScene } from './scenes/title.ts';
import { Tutorial } from './scenes/tutorial.ts';
import { PauseOverlay, ResultsOverlay, SettingsOverlay, Frost } from './scenes/overlays.ts';
import type { Game } from './core/game.ts';
import { load, save, remove, loadSettings, saveSettings } from './util/storage.ts';
import type { Career, Settings } from './util/storage.ts';
import { Rng } from './core/rng.ts';
import { PERSONAS, candidates, choose, execute } from './ai/bot.ts';
import type { PersonaId } from './ai/bot.ts';
import { Game as GameCls } from './core/game.ts';
import { clamp, easeOutCubic } from './util/ease.ts';

export type SceneId = 'title' | 'play' | 'results';
export type OverlayId = 'none' | 'pause' | 'settings' | 'countdown';

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  L!: Layout;
  ui = new UI();
  backdrop = new Backdrop();
  settings: Settings = loadSettings();
  play: PlayScene;
  title = new TitleScene();
  tutorial: Tutorial;
  pause = new PauseOverlay();
  results = new ResultsOverlay();
  settingsUI = new SettingsOverlay();
  frost = new Frost();
  scene: SceneId = 'title';
  overlay: OverlayId = 'none';
  private settingsFrom: OverlayId = 'none';
  gestures: Gestures;
  keys = new Keyboard();
  best = load<number>('best', 0);
  fixedSeed: number | null = null;
  seed = 0;
  timeScale = 1;
  autoplay: PersonaId | null = null;
  private autoRng = new Rng(7, 'autoplay');
  private autoT = 0;
  private sceneT = 0;
  private resultsT = 0;
  private resizeTimer = 0;
  private last = 0;
  frameMs = 0;
  fps = 60;
  private fpsAcc = 0; private fpsN = 0;
  /** 调试：延迟执行的动作 */
  pending: { t: number; fn: () => void } | null = null;
  startLevel = 1;
  onFrame: (() => void) | null = null;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.play = new PlayScene(this.ui, this.settings, {
      onGameOver: g => this.gameOver(g),
      onPause: () => this.openPause(),
    });
    this.tutorial = new Tutorial(this.play);
    this.tutorial.onFinish = () => { save('tutorialDone', '1'); this.transition(() => this.startGame()); };
    this.play.onSpawnHook = () => { this.gestures.epoch++; this.gestures.rebase(); this.autoT = 0; };
    this.title.onStart = () => this.transition(() => this.fromTitle());
    this.title.onSettings = () => this.openSettings();
    this.title.best = this.best;
    this.pause.onResume = () => { this.overlay = 'none'; audio.setPaused(false); };
    this.pause.onRestart = () => { this.overlay = 'none'; audio.setPaused(false); if (this.tutorial.active) this.tutorial.begin(); else this.startGame(); };
    this.pause.onSettings = () => this.openSettings();
    this.pause.onTitle = () => this.transition(() => { this.overlay = 'none'; audio.setPaused(false); this.tutorial.active = false; this.toTitle(); });
    this.results.onAgain = () => this.transition(() => this.startGame());
    this.results.onTitle = () => this.transition(() => this.toTitle());
    this.settingsUI.onChange = s => this.applySettings(s);
    this.settingsUI.onClose = () => this.closeSettings();
    this.settingsUI.onTutorial = () => { this.overlay = 'none'; audio.setPaused(false); remove('tutorialDone'); this.scene = 'play'; this.tutorial.begin(); };

    this.gestures = new Gestures(this.canvas, (x, y) => toLogical(this.L, x, y), {
      uiDown: (x, y, id) => {
        if (this.ui.down(x, y, id)) return true;
        return this.overlay !== 'none' || this.scene !== 'play';
      },
      uiUp: (x, y, id) => this.ui.up(x, y, id),
      inZone: (x, y) => this.scene === 'play' && this.overlay === 'none' && !this.autoplay && this.play.zone(x, y),
      dragStart: () => this.play.dragStart(),
      dragX: dx => this.play.dragX(dx),
      dragDown: dy => this.play.dragDown(dy),
      flickDown: () => this.play.hardDrop(),
      flickUp: () => this.play.hold(),
      tap: () => this.play.rotate(1),
      twoFingerTap: () => this.play.invert(),
      release: () => {},
      firstGesture: () => this.firstGesture(),
    });
    this.keys.onFirst = () => this.firstGesture();
    this.keys.onPress = a => this.onKey(a);
    this.keys.onRelease = a => { if (a === 'soft') this.play.softDrop(false); };

    window.addEventListener('resize', () => this.scheduleResize());
    window.visualViewport?.addEventListener('resize', () => this.scheduleResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.autoPause(); audio.suspend(); }
      else audio.resume();
    });
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());

    const sp = new URLSearchParams(location.search);
    const s = sp.get('seed');
    if (s && /^\d+$/.test(s)) this.fixedSeed = Number(s) >>> 0;
    this.resize();
    this.applySettings(this.settings, false);
    this.title.enter();
  }

  private firstGesture(): void {
    if (audio.unlocked) return;
    audio.unlock();
    audio.setSfx(this.settings.sfx);
    audio.setMusic(this.settings.music);
    audio.startMusic();
  }

  applySettings(s: Settings, persist = true): void {
    this.settings = s;
    this.play.settings = s;
    audio.setSfx(s.sfx);
    audio.setMusic(s.music);
    if (persist) saveSettings(s);
  }

  scheduleResize(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.resize(), 120);
  }

  resize(): void {
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const dpr = window.devicePixelRatio || 1;
    let st = 0, sb = 0;
    try {
      const cs = getComputedStyle(document.getElementById('safe')!);
      st = parseFloat(cs.paddingTop) || 0; sb = parseFloat(cs.paddingBottom) || 0;
    } catch { /* ignore */ }
    const L = computeLayout(vw, vh, dpr, st, sb);
    this.L = L;
    this.canvas.width = Math.round(vw * L.dpr);
    this.canvas.height = Math.round(vh * L.dpr);
    this.backdrop.build(vw, vh, L.dpr, { x: L.ox, y: 0, w: 390 * L.scale, h: vh });
    this.play.setLayout(L);
    this.title.setLayout(L);
    this.tutorial.setLayout(L);
  }

  rebuildBackdrop(): void {
    const L = this.L;
    this.backdrop.build(L.vw, L.vh, L.dpr, { x: L.ox, y: 0, w: 390 * L.scale, h: L.vh });
  }

  // ---------- 转场：冰蓝细线横向展开，再上下展开成遮罩 ----------
  private transT = -1;
  private transFn: (() => void) | null = null;
  transition(fn: () => void): void {
    if (this.transT >= 0) return;
    this.transT = 0; this.transFn = fn;
    audio.sweep();
  }
  private drawTransition(ctx: CanvasRenderingContext2D): void {
    if (this.transT < 0) return;
    const half = 0.225;
    const p = this.transT < half ? this.transT / half : 1 - (this.transT - half) / half;
    const a = clamp(p / 0.4, 0, 1), b = clamp((p - 0.4) / 0.6, 0, 1);
    const H = this.L.H;
    const w = 390 * easeOutCubic(a), h = Math.max(2, H * easeOutCubic(b));
    ctx.fillStyle = C.bgDeep;
    ctx.fillRect(195 - w / 2, H / 2 - h / 2, w, h);
    ctx.fillStyle = `rgba(127,219,255,${0.9 * (1 - b * 0.7)})`;
    ctx.fillRect(195 - w / 2, H / 2 - h / 2 - 1, w, 2);
    ctx.fillRect(195 - w / 2, H / 2 + h / 2 - 1, w, 2);
  }

  // ---------- 流程 ----------
  private fromTitle(): void {
    const done = load<string>('tutorialDone', '') === '1';
    if (!done) { this.scene = 'play'; this.sceneT = 0; this.tutorial.begin(); }
    else this.startGame();
  }

  newSeed(): number {
    if (this.fixedSeed !== null) return this.fixedSeed;
    return (Math.floor(Math.random() * 0xffffffff) >>> 0) % 1000000;
  }

  startGame(level = this.startLevel): void {
    this.seed = this.newSeed();
    this.scene = 'play';
    this.overlay = 'none';
    this.sceneT = 0;
    this.tutorial.active = false;
    this.play.tutorial = false; this.play.hideTopInfo = false; this.play.highlight = '';
    this.play.hooks.onFive = undefined; this.play.hooks.onResolved = undefined;
    this.gestures.reset();
    this.keys.clear();
    this.play.start(this.seed, { startLevel: level }, this.best, level > 1 ? g => this.prefill(g, level) : undefined);
    audio.level = this.play.game.level;
    audio.setDanger(false);
    audio.setPaused(false);
  }

  /** ?level=n：用机器人打出该阶段的典型盘面 */
  prefill(g: Game, level: number): void {
    const cfg = g.cfg;
    const sim = new GameCls(cfg, g.seed, { headless: true });
    const rng = new Rng(g.seed, 'prefill');
    const per = PERSONAS.serious;
    sim.start(); sim.update(0.01);
    let n = 0;
    while (sim.phase !== 'over' && sim.level < level && n < 600) {
      n++;
      if (!sim.active) { sim.update(0.01); continue; }
      const d = choose(candidates(sim, per, rng, true), per, rng, 0);
      if (!d || !execute(sim, d, per, rng)) break;
      sim.advanceTime(1.6);
    }
    if (sim.phase !== 'over') g.grid.copyFrom(sim.grid);
  }

  toTitle(): void {
    this.scene = 'title';
    this.overlay = 'none';
    this.title.best = this.best;
    this.title.enter();
    this.gestures.reset();
    audio.setDanger(false);
  }

  private gameOver(g: Game): void {
    if (this.tutorial.active) { this.tutorial.begin(); return; }
    const newBest = g.score > this.best && g.score > 0;
    const prevBest = this.best;
    if (newBest) { this.best = g.score; save('best', this.best); }
    const c = load<Career>('stats', { games: 0, bestLine: 0, bestChain: 0, totalFives: 0 });
    c.games++; c.bestLine = Math.max(c.bestLine, g.stats.longest); c.bestChain = Math.max(c.bestChain, g.stats.maxChain); c.totalFives += g.stats.fives;
    save('stats', c);
    this.frost.capture(this.canvas);
    this.results.open({
      score: g.score, time: g.time, level: g.level, fives: g.stats.fives, longest: g.stats.longest, maxChain: g.stats.maxChain,
      maxLines: g.stats.maxLines, best: newBest ? g.score : prevBest, newBest, seed: g.seed,
    });
    this.scene = 'results';
    this.resultsT = 0;
    if (this.autoplay) this.pending = { t: 3, fn: () => { if (this.scene === 'results' && this.autoplay) this.startGame(); } };
  }

  openPause(): void {
    if (this.scene !== 'play' || this.overlay !== 'none') return;
    if (this.play.game.phase === 'over') return;
    this.frost.capture(this.canvas);
    this.overlay = 'pause';
    this.pause.open();
    this.keys.clear();
    this.play.softDrop(false);
    this.gestures.reset();
    audio.setPaused(true);
    audio.panel();
  }
  private autoPause(): void {
    if (this.overlay === 'countdown') { this.overlay = 'pause'; this.pause.open(); audio.setPaused(true); return; }
    if (this.scene === 'play' && this.overlay === 'none' && !this.autoplay) this.openPause();
  }
  resumeNow(): void {
    if (this.overlay === 'pause' || this.overlay === 'countdown') { this.overlay = 'none'; this.pause.countdown = -1; audio.setPaused(false); }
  }

  openSettings(): void {
    this.settingsFrom = this.overlay;
    this.overlay = 'settings';
    this.settingsUI.canTutorial = true;
    this.settingsUI.open();
  }
  private closeSettings(): void {
    this.overlay = this.settingsFrom === 'pause' ? 'pause' : 'none';
    if (this.overlay === 'pause') this.pause.open();
  }

  private onKey(a: KeyAction): void {
    if (a === 'mute') {
      const on = !(this.settings.sfx || this.settings.music);
      this.settings.sfx = on; this.settings.music = on;
      this.applySettings(this.settings);
      return;
    }
    if (this.overlay === 'settings') { if (a === 'pause') this.closeSettings(); return; }
    if (this.overlay === 'pause') {
      if (a === 'pause' || a === 'confirm') { if (this.pause.countdown < 0) this.pause.startCountdown(); }
      return;
    }
    if (this.scene === 'title') { if (a === 'confirm' || a === 'hard') this.transition(() => this.fromTitle()); return; }
    if (this.scene === 'results') { if ((a === 'confirm' || a === 'hard') && this.results.t > 0.6) this.transition(() => this.startGame()); return; }
    if (this.overlay === 'countdown' || this.autoplay) return;
    const p = this.play;
    switch (a) {
      case 'left': p.move(-1); break;
      case 'right': p.move(1); break;
      case 'soft': p.softDrop(true); break;
      case 'hard': p.hardDrop(); break;
      case 'cw': p.rotate(1); break;
      case 'ccw': p.rotate(-1); break;
      case 'invert': p.invert(); break;
      case 'hold': p.hold(); break;
      case 'pause': this.openPause(); break;
      default: break;
    }
  }

  // ---------- 主循环 ----------
  frame = (ts: number): void => {
    requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const raw = this.last ? (ts - this.last) / 1000 : 1 / 60;
    this.last = ts;
    const dt = Math.min(0.05, Math.max(0, raw)) * this.timeScale;
    this.fpsAcc += raw; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.update(dt);
    this.render();
    audio.update();
    this.frameMs = performance.now() - t0;
    this.onFrame?.();
  };

  private update(dt: number): void {
    this.ui.time += dt;
    this.sceneT += dt;
    this.backdrop.update(dt);
    if (this.transT >= 0) {
      this.transT += dt / Math.max(0.01, this.timeScale);
      if (this.transT >= 0.225 && this.transFn) { const f = this.transFn; this.transFn = null; f(); }
      if (this.transT >= 0.45) this.transT = -1;
    }
    if (this.pending) { this.pending.t -= dt; if (this.pending.t <= 0) { const f = this.pending.fn; this.pending = null; f(); } }
    if (this.scene === 'title') { this.title.update(dt); }
    if (this.overlay === 'settings') this.settingsUI.update(dt, this.settings);
    if (this.overlay === 'pause' || this.overlay === 'countdown') {
      this.pause.update(dt);
      if (this.overlay === 'pause' && this.pause.countdown >= 0) this.overlay = 'countdown';
    }
    if (this.scene === 'play' && this.overlay === 'none') {
      const n = this.keys.update(dt * 1000);
      if (n) { const d = n > 0 ? 1 : -1; for (let i = 0; i < Math.abs(n); i++) this.play.move(d); }
      if (this.autoplay) this.autoStep(dt);
      this.play.update(dt);
      this.tutorial.update(dt);
    }
    if (this.scene === 'results') {
      this.resultsT += dt;
      this.results.update(dt);
      this.play.view.fx.update(dt);
    }
  }

  private autoStep(dt: number): void {
    const g = this.play.game;
    if (g.phase !== 'play' || !g.active) return;
    this.autoT += dt;
    const per = PERSONAS[this.autoplay!];
    if (this.autoT < Math.min(0.5, per.think * 0.25)) return;
    this.autoT = -99;
    const d = choose(candidates(g, per, this.autoRng, true), per, this.autoRng, 0);
    if (!d || !execute(g, d, per, this.autoRng)) g.hardDrop(true);
  }

  private render(): void {
    const ctx = this.ctx, L = this.L;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const frozen = this.scene === 'results' || this.overlay === 'pause' || (this.overlay === 'settings' && this.settingsFrom === 'pause');
    this.ui.begin();
    if (frozen) {
      this.frost.draw(ctx, this.canvas.width, this.canvas.height, 1);
    } else {
      this.backdrop.draw(ctx);
    }
    ctx.setTransform(L.k, 0, 0, L.k, L.ox * L.dpr, L.oy * L.dpr);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 390, L.H); ctx.clip();
    if (this.scene === 'title') this.title.draw(ctx, this.ui);
    else if (this.scene === 'play' && !frozen) {
      this.play.draw(ctx);
      this.tutorial.draw(ctx, this.ui);
    }
    if (this.scene === 'results') {
      ctx.fillStyle = `rgba(16,20,25,${0.35 * clamp(this.resultsT / 0.3, 0, 1)})`;
      ctx.fillRect(0, 0, 390, L.H);
      this.results.draw(ctx, this.ui, L, this.play.view.art);
    }
    if (this.overlay === 'pause' || this.overlay === 'countdown') this.pause.draw(ctx, this.ui, L);
    if (this.overlay === 'settings') this.settingsUI.draw(ctx, this.ui, L, this.settings);
    this.drawTransition(ctx);
    ctx.restore();
    this.ui.end();
    this.drawSides();
  }

  /** 桌面两侧：按键说明与本局小统计 */
  private drawSides(): void {
    const L = this.L;
    const side = L.ox;
    if (side < 170) return;
    const ctx = this.ctx;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const keys = ['← →  移动', '↓  软降   空格  硬降', '↑ / X  顺转   Z  逆转', 'F  翻色   C  暂存', 'Esc  暂停   M  静音'];
    let y = L.vh - 40 - keys.length * 20;
    ctx.font = fNum(600, 11); ctx.fillStyle = C.text3;
    ctx.fillText('K E Y S', 32, y - 12);
    ctx.font = fCn(400, 12);
    for (const k of keys) { y += 20; ctx.fillText(k, 32, y); }
    if (this.scene === 'play' && !this.tutorial.active) {
      const g = this.play.game;
      const x = L.vw - 32;
      ctx.textAlign = 'right';
      ctx.font = fNum(600, 11); ctx.fillStyle = C.text3;
      ctx.fillText('T H I S   R U N', x, L.vh - 92);
      ctx.font = fCn(400, 12);
      ctx.fillText(`五连 ${g.stats.fives} · 最长 ${g.stats.longest || '-'} · 连锁 ${g.stats.maxChain || '-'}`, x, L.vh - 68);
      const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
      ctx.fillText(`时长 ${m}:${String(s).padStart(2, '0')} · 方块 ${g.stats.pieces}`, x, L.vh - 48);
    }
  }

  toCss(x: number, y: number): { x: number; y: number } { return toCss(this.L, x, y); }
}

function boot(): void {
  const app = new App();
  const sp = new URLSearchParams(location.search);
  const debug = sp.get('debug') === '1';
  const go = () => requestAnimationFrame(app.frame);
  // 字体最多等 300ms
  let started = false;
  const start = () => { if (!started) { started = true; go(); } };
  try {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (f) {
      Promise.race([
        Promise.all([f.load(`300 32px Inter`), f.load(`600 14px Inter`)]),
        new Promise(r => setTimeout(r, 300)),
      ]).then(start, start);
      f.ready.then(() => app.rebuildBackdrop(), () => {});
    } else start();
  } catch { start(); }
  if (debug) {
    void import('./debug.ts').then(m => m.installDebug(app, sp));
  } else {
    if (sp.get('notut') === '1') save('tutorialDone', '1');
  }
  void CONFIG;
}

boot();
