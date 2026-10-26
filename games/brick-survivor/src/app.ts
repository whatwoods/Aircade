// Director: scenes, the fixed-step loop (hitstop / slow-mo / level-up easing / pause), input → core sync, the
// render pipeline (background → world batch → post), quality tiers + auto-downgrade, persistence and all UI
// wiring (docs §2, §6, §9).
import { config, juiceRules, pal } from './config';
import type { FxEventId } from './config';
import { ease, clamp01 } from './core/ease';
import { Input } from './core/input';
import { randomSeed } from './core/rng';
import { settings, onSettings, readAutoTier, writeAutoTier } from './core/settings';
import { readBest, writeBest, readStats, writeStats, tutorialDone, setTutorialDone, removeKey } from './core/storage';
import type { BestRecord } from './core/storage';
import { Viewport } from './core/viewport';
import { audio } from './audio/audio';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { Game } from './game/game';
import type { QualityId, SceneId } from './types';
import type { GLContext } from './render/gl';
import type { Atlas } from './render/atlas';
import type { Sprites } from './render/sprites';
import { Batcher } from './render/batcher';
import { Post } from './render/post';
import { Background } from './render/background';
import { Camera } from './render/camera';
import { WorldView } from './render/draw-world';
import { TitleDemo } from './render/title-demo';
import { Particles } from './fx/particles';
import { Floaters } from './fx/floaters';
import { Feedback, particleFrames } from './fx/feedback';
import type { FxHost } from './fx/feedback';
import { byId, setScene, setUiSound } from './ui/dom';
import { Hud } from './ui/hud';
import { Banners } from './ui/banners';
import { LevelUpPanel } from './ui/levelup';
import { PausePanel } from './ui/pause';
import { SettingsPanel } from './ui/settings';
import { ResultsPanel } from './ui/results';
import { TutorialOverlay } from './ui/tutorial-overlay';
import { TitleScreen } from './ui/title';
import { Sweep } from './ui/transitions';
import { SidePanels } from './ui/side-panels';
import { RotateHint } from './ui/rotate-hint';

const F = config.field;
const STEP = 1 / config.physics.hz;
const TIERS: readonly QualityId[] = ['high', 'mid', 'low'];
const BOSS_COLORS = { monolith: pal.monolith, pulsar: pal.pulsar, serpent: 0xb07cff, omega: 0xffc94d } as const;

export interface AppParams {
  debug: boolean;
  seed: number | null;
  wave: number | null;
  autoplay: boolean;
  quality: QualityId | null;
  tutorial: boolean | null;
}

type Mode = 'title' | 'run' | 'results';
type LvState = 'none' | 'easeIn' | 'open' | 'easeOut';

export class App implements FxHost {
  readonly g: Game;
  readonly vp: Viewport;
  readonly input: Input;
  readonly batcher: Batcher;
  readonly post: Post;
  readonly bg: Background;
  readonly cam = new Camera();
  readonly parts = new Particles();
  readonly floats = new Floaters();
  view!: WorldView;
  fx!: Feedback;
  demo: TitleDemo;
  spr: Sprites | null = null;
  atlas: Atlas | null = null;
  // ui
  readonly title: TitleScreen;
  readonly hud: Hud;
  readonly banners: Banners;
  readonly levelup: LevelUpPanel;
  readonly pausePanel: PausePanel;
  readonly settingsPanel: SettingsPanel;
  readonly results: ResultsPanel;
  readonly tutorialOv: TutorialOverlay;
  readonly sweep = new Sweep();
  readonly sides = new SidePanels();
  readonly rotate = new RotateHint();
  readonly stage: HTMLElement;
  // state
  mode: Mode = 'title';
  scene: SceneId = 'boot';
  quality: QualityId = 'high';
  qualityLocked = false;
  paused = false;
  private resuming: (() => void) | null = null;
  private lvState: LvState = 'none';
  private lvT = 0;
  private lvScale = 1;
  private lvBusy = false;
  private hadTutorial = false;
  private endT = 0;
  private bestAtStart: BestRecord | null = null;
  // loop
  private acc = 0;
  private lastNow = -1;
  realTime = 0;
  debugMul = 1;
  private hitstopT = 0;
  private hitstopEnd = -10;
  private slowScale = 1;
  private slowT = 0;
  private slowRamp = 0;
  private slowRampT = 0;
  private dimV = 0;
  private windT = 0;
  // perf
  readonly frameMs = new Float32Array(120);
  private frameIdx = 0;
  private fpsCount = 0;
  private fpsT = 0;
  fps = 60;
  private readonly tierSamples = new Float32Array(1024);
  private tierN = 0;
  private tierT = 0;
  /** debug hook, called once per frame after render */
  debugHook: ((realDt: number) => void) | null = null;

  constructor(
    readonly ctx: GLContext,
    readonly params: AppParams,
    bake: Promise<{ atlas: Atlas; spr: Sprites }>,
  ) {
    this.stage = byId('stage');
    const world = byId('world');
    ctx.view.classList.add('view');
    this.stage.insertBefore(ctx.view, world);
    this.vp = new Viewport(world);
    this.input = new Input(this.vp, this.stage);
    this.g = new Game();
    this.batcher = new Batcher(ctx);
    this.post = new Post(ctx);
    this.bg = new Background(ctx);
    this.demo = new TitleDemo(this.parts);
    // ui (DOM order = stacking order)
    this.title = new TitleScreen({
      start: () => this.onStart(),
      settings: () => this.settingsPanel.open(() => undefined),
      tutorial: () => this.onStart(true),
    });
    this.hud = new Hud(world, () => this.openPause());
    this.banners = new Banners(world);
    this.tutorialOv = new TutorialOverlay(world, () => this.skipTutorial());
    this.tutorialOv.onReady = () => this.banners.ready();
    this.levelup = new LevelUpPanel(world, this.g);
    this.levelup.onPick = (i) => this.onPick(i);
    this.levelup.onReroll = () => this.onReroll();
    this.pausePanel = new PausePanel(world, this.g, {
      resume: () => this.resume(),
      restart: () => this.transition(() => this.startRun(false)),
      settings: () => this.settingsPanel.open(() => undefined),
      title: () => this.transition(() => this.showTitle()),
    });
    this.results = new ResultsPanel(world, this.g, {
      retry: () => this.transition(() => this.startRun(false)),
      title: () => this.transition(() => this.showTitle()),
      endless: () => this.continueEndless(),
      tick: () => sfx.tick(),
      record: () => this.fx.emit('newRecord', 195, 120, 0, 0),
    });
    this.settingsPanel = new SettingsPanel(world, {
      retutorial: () => {
        setTutorialDone(false);
        this.pausePanel.close();
        this.transition(() => this.startRun(true));
      },
      resetBest: () => {
        removeKey('best');
        this.bestAtStart = null;
        this.sides.bestScore = 0;
        this.title.setBest(null);
      },
    });
    setUiSound(() => {
      audio.unlock();
      this.fx?.emit('uiPress', 195, 422, 0, 0);
    });
    this.input.setHandlers({
      onDragStart: (x, y) => {
        if (this.mode === 'run' && !this.paused) this.fx.emit('dragStart', x, y, 0, 0);
      },
      onKey: (code) => this.onKey(code),
    });
    // audio unlock on any gesture (also re-checks iOS "interrupted")
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    window.addEventListener('keydown', () => audio.unlock(), { capture: true });
    audio.onUnlock(() => {
      if (this.mode === 'title') music.setMode('title');
      else if (music.mode !== 'off') music.restart();
    });
    // pause on blur / hidden
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    // viewport / context
    this.vp.onChange(() => this.onResize());
    ctx.onLost = () => this.autoPause();
    ctx.onRestored = () => {
      this.atlas?.invalidate();
      this.onResize();
    };
    onSettings((_s, k) => {
      if (k === 'quality') this.applyQuality(this.startTier());
      if (k === 'sfx' || k === 'music') this.title.syncSound();
    });
    // initial tier (title runs at it too)
    this.qualityLocked = params.quality !== null;
    this.applyQuality(this.startTier());
    this.onResize();
    this.title.setFoot(params.debug ? params.seed ?? 0 : null);
    this.showTitle();
    // finish wiring once the atlas is baked
    void bake.then(({ atlas, spr }) => {
      this.atlas = atlas;
      this.spr = spr;
      this.parts.frames = particleFrames(spr);
      this.view = new WorldView(this.batcher, spr, this.g, this.parts, this.floats);
      this.view.trailMax = config.quality[this.quality].trail;
      this.fx = new Feedback(this.g, this.parts, this.floats, this.cam, this.view, this.bg, this);
      this.g.sink = this.fx;
    });
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (t: number): void => this.frame(t);

  get ready(): boolean {
    return this.spr !== null;
  }

  // ================================================================ FxHost
  hitstop(ms: number, tier: number): void {
    if (this.mode !== 'run') return;
    if (tier < 4 && this.hitstopT <= 0 && this.realTime - this.hitstopEnd < juiceRules.hitstopMinGap) return;
    this.hitstopT = Math.max(this.hitstopT, Math.min(0.25, ms / 1000));
  }

  slowmo(scale: number, realDur: number, rampBack: number): void {
    this.slowScale = scale;
    this.slowT = realDur;
    this.slowRamp = rampBack;
    this.slowRampT = 0;
  }

  banner(ev: FxEventId, a: number, b: number): void {
    if (this.mode !== 'run') return;
    const g = this.g;
    switch (ev) {
      case 'waveStart':
        this.banners.wave(a, b === 1);
        break;
      case 'bossWarning':
        this.banners.warning();
        break;
      case 'bossArrive':
        if (g.boss) this.banners.nameCard(g.boss.name, g.boss.en, BOSS_COLORS[g.boss.kind]);
        break;
      case 'bossDefeat':
        this.banners.big('BOSS DOWN', 'BOSS 击破', '#ff5c7a');
        break;
      case 'victory':
        this.banners.big('VICTORY', '通关', '#ffc94d', 2.4);
        break;
      case 'evolve':
        this.banners.evolution(a);
        break;
      case 'comboMilestone':
        this.banners.combo(a);
        break;
      case 'playerDeath':
        this.banners.dead();
        break;
      default:
        break;
    }
  }

  // ================================================================ scenes
  private transition(fn: () => void): void {
    if (this.sweep.busy) return;
    this.sweep.run(fn);
  }

  private onStart(forceTutorial = false): void {
    if (this.mode !== 'title' || this.sweep.busy) return;
    audio.unlock();
    const go = (): void => {
      const tut = forceTutorial || (this.params.tutorial ?? !tutorialDone());
      this.transition(() => this.startRun(tut));
    };
    if (this.ready) {
      go();
      return;
    }
    this.title.setBusy(true);
    const wait = (): void => {
      if (this.ready) {
        this.title.setBusy(false);
        go();
      } else window.setTimeout(wait, 50);
    };
    window.setTimeout(wait, 200);
  }

  showTitle(): void {
    this.mode = 'title';
    this.paused = false;
    this.cancelResume();
    this.lvState = 'none';
    this.lvScale = 1;
    this.input.enabled = false;
    this.g.phase = 'idle';
    this.g.boss = null;
    this.hud.show(false);
    this.tutorialOv.show(false);
    this.levelup.close();
    this.pausePanel.close();
    this.results.close();
    this.banners.clear();
    this.title.setBest(readBest());
    this.title.show(true);
    this.stage.classList.remove('cross');
    this.fx?.reset();
    this.parts.clear();
    this.bg.bossTarget = 0;
    this.bg.field = 0.5;
    music.setMode(audio.unlocked ? 'title' : 'off');
    audio.setMuffle(0, 0.2);
  }

  startRun(tutorial: boolean, startWave?: number): void {
    const seed = this.params.seed ?? randomSeed();
    this.mode = 'run';
    this.paused = false;
    this.cancelResume();
    this.lvState = 'none';
    this.lvScale = 1;
    this.lvBusy = false;
    this.hitstopT = 0;
    this.slowT = 0;
    this.slowRamp = 0;
    this.slowRampT = 0;
    this.acc = 0;
    this.endT = 0;
    this.levelup.close();
    this.pausePanel.close();
    this.settingsPanel.close();
    this.results.close();
    this.banners.clear();
    this.title.show(false);
    this.g.start({ seed, tutorial, startWave });
    this.g.autoplay.enabled = this.params.debug && this.params.autoplay;
    this.hadTutorial = tutorial;
    this.bestAtStart = readBest();
    this.sides.bestScore = this.bestAtStart?.score ?? 0;
    if (this.fx) {
      this.fx.reseed(seed);
      this.fx.reset();
    }
    if (this.view) {
      this.view.highlightBall = -1;
      this.view.tutorialGuide = 0;
      this.view.showPlayer = true;
    }
    this.bg.bossTarget = 0;
    this.bg.field = 1;
    this.hud.reset();
    this.hud.show(true);
    this.tutorialOv.show(tutorial);
    this.input.reset(195);
    this.input.enabled = true;
    this.stage.classList.add('cross');
    if (!this.qualityLocked && settings.quality === 'auto') this.applyQuality(this.startTier());
    this.tierN = 0;
    this.tierT = 0;
    music.setMode('game');
    music.restart();
    music.lead = false;
    audio.setMuffle(0, 0.1);
  }

  private continueEndless(): void {
    this.results.close();
    this.g.continueEndless();
    this.mode = 'run';
    this.endT = 0;
    this.hud.show(true);
    this.input.enabled = true;
    this.stage.classList.add('cross');
    music.setMode('game');
    audio.setMuffle(0, 0.1);
  }

  skipTutorial(): void {
    if (!this.g.tut) return;
    this.g.finishTutorial();
    setTutorialDone(true);
    this.hadTutorial = false;
    this.tutorialOv.show(false);
    if (this.levelup.isOpen) {
      this.levelup.close();
      this.lvState = 'easeOut';
      this.lvT = 0;
    }
  }

  private finishRun(victory: boolean): void {
    const g = this.g;
    if (!victory) g.phase = 'over';
    this.mode = 'results';
    this.input.enabled = false;
    this.stage.classList.remove('cross');
    const prev = this.bestAtStart?.score ?? 0;
    const newRecord = g.score > prev && g.score > 0;
    if (newRecord) writeBest({ score: g.score, wave: g.wave, timeSec: Math.round(g.runTime), victory: victory || g.endless, date: Date.now() });
    const st = readStats();
    st.runs++;
    st.bricks += g.runStats.bricks;
    st.maxCombo = Math.max(st.maxCombo, g.maxCombo);
    if (victory) st.victories++;
    writeStats(st);
    if (!this.qualityLocked && settings.quality === 'auto') writeAutoTier(this.quality);
    this.hud.show(false);
    this.levelup.close();
    this.lvState = 'none';
    this.lvScale = 1;
    this.results.open({
      victory,
      endless: g.endless,
      score: g.score,
      best: Math.max(prev, newRecord ? g.score : 0),
      newRecord,
      wave: g.wave,
      time: g.runTime,
      maxCombo: g.maxCombo,
      bricks: g.runStats.bricks,
      bosses: g.runStats.bosses,
      level: g.level,
    });
    audio.setMuffle(0, 0.6);
    window.setTimeout(() => {
      if (this.mode === 'results') music.setMode('title');
    }, 900);
  }

  // ================================================================ pause
  private autoPause(): void {
    if (this.mode !== 'run') return;
    if (this.resuming) {
      this.cancelResume();
      this.pausePanel.open();
      return;
    }
    if (!this.paused) this.openPause();
  }

  openPause(): void {
    if (this.mode !== 'run' || this.paused) return;
    this.paused = true;
    this.pausePanel.open();
    audio.setMuffle(1, 0.1);
  }

  private cancelResume(): void {
    if (this.resuming) {
      this.resuming();
      this.resuming = null;
    }
  }

  /** resume with the 3·2·1 countdown (scene visible behind) */
  resume(): void {
    if (!this.paused || this.resuming) return;
    this.pausePanel.close();
    this.settingsPanel.close();
    this.resuming = this.banners.countdown(() => {
      this.resuming = null;
      this.paused = false;
      audio.setMuffle(0, 0.2);
    });
  }

  /** debug: resume immediately */
  resumeNow(): void {
    this.cancelResume();
    this.pausePanel.close();
    this.settingsPanel.close();
    this.paused = false;
    audio.setMuffle(0, 0.1);
  }

  private onKey(code: string): void {
    if (this.settingsPanel.isOpen) {
      if (code === 'Escape') this.settingsPanel.close();
      return;
    }
    if (this.mode !== 'run') return;
    if (code === 'KeyP' || code === 'Escape') {
      if (this.paused) {
        if (this.pausePanel.isOpen) this.resume();
      } else this.openPause();
      return;
    }
    if (!this.paused) this.levelup.key(code);
  }

  // ================================================================ level-up flow
  private updateLevelUp(realDt: number): void {
    const g = this.g;
    switch (this.lvState) {
      case 'none':
        if (this.mode === 'run' && !this.paused && g.canLevelUpNow() && this.ready) {
          this.lvState = 'easeIn';
          this.lvT = 0;
        }
        break;
      case 'easeIn': {
        if (!g.canLevelUpNow()) {
          this.lvState = 'easeOut';
          this.lvT = 0;
          break;
        }
        if (this.paused) break;
        this.lvT += realDt;
        const p = Math.min(1, this.lvT / config.levelup.easeIn);
        this.lvScale = 1 - ease.outQuad(p);
        if (p >= 1) {
          this.lvScale = 0;
          this.lvState = 'open';
          this.lvBusy = false;
          this.levelup.open(g.rollOffer(), g.pendingLevelUps);
        }
        break;
      }
      case 'open':
        this.lvScale = 0;
        break;
      case 'easeOut': {
        if (this.paused) break;
        this.lvT += realDt;
        const p = Math.min(1, this.lvT / config.levelup.easeOut);
        this.lvScale = Math.max(this.lvScale, ease.inQuad(p));
        if (p >= 1) {
          this.lvScale = 1;
          this.lvState = 'none';
        }
        break;
      }
    }
  }

  private onPick(i: number): void {
    if (this.lvBusy) return;
    const card = this.levelup.cards[i];
    if (!card) return;
    this.lvBusy = true;
    this.fx.emit('cardPick', 195, 600, 0, 0);
    this.g.applyCard(card);
    window.setTimeout(() => {
      this.lvBusy = false;
      if (this.mode !== 'run') return;
      if (this.g.canLevelUpNow()) {
        this.levelup.open(this.g.rollOffer(), this.g.pendingLevelUps);
      } else {
        this.levelup.close();
        this.lvState = 'easeOut';
        this.lvT = 0;
      }
    }, 300);
  }

  private onReroll(): void {
    if (this.g.rerolls <= 0) return;
    this.g.rerolls--;
    this.fx.emit('reroll', 195, 690, 0, 0);
    this.levelup.replace(this.g.rollOffer());
  }

  /** debug pickCard: bypasses the input lock */
  pickCard(i: number): void {
    this.levelup.pick(i, true);
  }

  // ================================================================ quality
  startTier(): QualityId {
    if (this.params.quality) return this.params.quality;
    if (settings.quality !== 'auto') return settings.quality;
    let t = readAutoTier();
    try {
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && (navigator.hardwareConcurrency || 8) <= 4 && t === 'high') t = 'mid';
    } catch {
      /* ignore */
    }
    return t;
  }

  applyQuality(q: QualityId): void {
    this.quality = q;
    const Q = config.quality[q];
    this.vp.setDprCap(Q.dpr);
    this.parts.setCap(Q.particles);
    this.post.enabled = Q.bloom;
    if (this.view) this.view.trailMax = Q.trail;
  }

  /** debug / settings: lock a tier */
  setQuality(q: QualityId): void {
    this.qualityLocked = true;
    this.applyQuality(q);
  }

  private sampleTier(realDt: number, flowing: boolean): void {
    if (this.qualityLocked || settings.quality !== 'auto' || !flowing || document.hidden) return;
    if (this.tierN < this.tierSamples.length) this.tierSamples[this.tierN++] = realDt * 1000;
    this.tierT += realDt;
    if (this.tierT < config.quality.sampleSec) return;
    const n = this.tierN;
    const s = this.tierSamples.subarray(0, n);
    s.sort();
    const p90 = s[Math.min(n - 1, Math.floor(n * 0.9))] ?? 0;
    this.tierN = 0;
    this.tierT = 0;
    if (p90 > config.quality.p90Limit) {
      const i = TIERS.indexOf(this.quality);
      if (i < TIERS.length - 1) this.applyQuality(TIERS[i + 1]!);
    }
  }

  private onResize(): void {
    this.ctx.resize(this.vp.pxW, this.vp.pxH);
    this.rotate.check();
    this.bg.sides = this.vp.sideWidth() > 2 ? 1 : 0;
  }

  // ================================================================ loop
  private frame(now: number): void {
    requestAnimationFrame(this.tick);
    if (this.lastNow < 0) this.lastNow = now;
    let realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (!(realDt > 0)) realDt = 0;
    if (realDt > config.physics.maxFrameDt) realDt = config.physics.maxFrameDt;
    const t0 = performance.now();
    this.update(realDt);
    this.render();
    const ms = performance.now() - t0;
    this.frameMs[this.frameIdx] = ms;
    this.frameIdx = (this.frameIdx + 1) % this.frameMs.length;
    this.fpsCount++;
    this.fpsT += realDt;
    if (this.fpsT >= 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsT);
      this.fpsCount = 0;
      this.fpsT = 0;
    }
    this.debugHook?.(realDt);
  }

  private update(realDt: number): void {
    const g = this.g;
    this.realTime += realDt;
    // hitstop (real time)
    let frozen = false;
    if (this.hitstopT > 0) {
      this.hitstopT -= realDt;
      frozen = true;
      if (this.hitstopT <= 0) this.hitstopEnd = this.realTime;
    }
    // slow motion with ramp back
    let slow = 1;
    if (this.slowT > 0) {
      this.slowT -= realDt;
      slow = this.slowScale;
    } else if (this.slowRampT < this.slowRamp) {
      this.slowRampT += realDt;
      slow = this.slowScale + (1 - this.slowScale) * clamp01(this.slowRampT / this.slowRamp);
    }
    this.updateLevelUp(realDt);
    const blocked = this.rotate.active || this.ctx.lost || !this.ready;
    const running = this.mode === 'run' && !this.paused && !blocked;
    const ts = running ? this.debugMul * slow * this.lvScale * (frozen ? 0 : 1) : 0;
    const dt = realDt * ts;
    if (this.rotate.active && this.mode === 'run' && !this.paused) this.openPause();
    // input → core
    const p = g.player;
    if (running && !g.autoplay.enabled) {
      const half = p.half();
      this.input.clamp(F.wallL + half, F.wallR - half);
      p.keyAxis = this.input.keyAxis;
      if (this.input.keyAxis === 0 && p.keyVel === 0) p.targetX = this.input.targetX;
    }
    // music beat phase-lock (gentle)
    if (running && ts === 1) {
      const mb = music.beatPhase();
      if (mb >= 0) {
        let d = mb - g.beatPhase;
        if (d > 0.5) d -= 1;
        else if (d < -0.5) d += 1;
        if (Math.abs(d) < 0.25) g.beatPhase = Math.min(0.999, Math.max(0, g.beatPhase + d * Math.min(1, realDt * 1.5)));
      }
    }
    // fixed steps
    let steps = 0;
    if (running && this.ready) {
      this.acc += dt;
      while (this.acc >= STEP && steps < config.physics.maxStepsPerFrame) {
        g.step(STEP);
        this.acc -= STEP;
        steps++;
        if (this.hitstopT > 0 && !frozen) {
          // a hitstop started inside this frame: freeze right here
          this.acc = 0;
          break;
        }
      }
      if (steps >= config.physics.maxStepsPerFrame) this.acc = 0;
      if (!g.autoplay.enabled) this.input.targetX = p.targetX;
    }
    if (this.view) this.view.alpha = running ? clamp01(this.acc / STEP) : 1;
    // presentation
    this.cam.update(realDt);
    this.bg.update(realDt);
    if (this.mode === 'title') {
      this.demo.update(realDt);
      if (this.fx) this.fx.update(realDt, realDt, false);
      this.title.update(realDt);
    } else if (this.fx && this.view) {
      this.view.update(dt, realDt);
      this.fx.update(this.mode === 'results' ? realDt : dt, realDt, this.mode === 'run');
      this.view.showPlayer = p.alive;
    }
    if (this.mode === 'run') {
      this.bg.bossTarget = g.boss || g.phase === 'bossIntro' ? 1 : 0;
      this.parts.density = (g.boss ? 0.7 : 1) * (this.quality === 'low' ? 0.6 : this.quality === 'mid' ? 0.85 : 1);
      this.hud.update(g, realDt);
      if (this.view) this.tutorialOv.update(g, this.view, realDt);
      if (this.hadTutorial && !g.tut) {
        this.hadTutorial = false;
        setTutorialDone(true);
        this.tutorialOv.show(false);
      }
      // music
      if (g.phase !== 'dying' && g.phase !== 'over') {
        const want = g.boss || g.phase === 'bossIntro' ? 'boss' : 'game';
        if (music.mode !== want && music.mode !== 'off') music.setMode(want);
        music.lead = g.wave >= 6;
        music.targetIntensity = this.view ? 0.3 + 0.7 * this.view.dangerLevel() : 0.3;
      }
      this.windT -= realDt;
      if (this.windT <= 0) {
        this.windT = 0.1;
        sfx.windLevel(running ? Math.abs(p.vx) : 0);
      }
      // end of run
      if (g.phase === 'dying' && g.deathT >= 1.4) this.finishRun(false);
      else if (g.phase === 'won') {
        this.endT += realDt;
        if (this.endT >= 1.0) this.finishRun(true);
      }
    }
    this.sides.update(g, this.mode === 'run', this.vp.sideWidth(), realDt);
    this.sampleTier(realDt, running && ts > 0 && this.lvState === 'none');
    // scene id for tests
    this.scene = this.computeScene();
    setScene(this.scene);
    // overlay dimming eased in real time
    const wantDim = this.mode === 'results' || (this.paused && !this.resuming) || this.lvState === 'open' || this.lvState === 'easeIn' ? 1 : 0;
    this.dimV += (wantDim - this.dimV) * Math.min(1, realDt * 8);
  }

  private computeScene(): SceneId {
    if (this.mode === 'title') return 'title';
    if (this.mode === 'results') return 'results';
    if (this.paused) return 'paused';
    if (this.levelup.isOpen) return 'levelup';
    switch (this.g.phase) {
      case 'tutorial':
        return 'tutorial';
      case 'bossIntro':
        return 'bossIntro';
      case 'bossDeath':
        return 'bossDeath';
      case 'dying':
      case 'over':
        return 'gameover';
      case 'victoryAnim':
      case 'won':
        return 'victory';
      default:
        return 'playing';
    }
  }

  // ================================================================ render
  private render(): void {
    const ctx = this.ctx;
    if (ctx.lost || !this.spr || !this.atlas) return;
    this.atlas.sync(ctx);
    if (!this.atlas.texture) return;
    const vp = this.vp;
    const W = ctx.width;
    const H = ctx.height;
    const dpr = vp.dpr;
    const s = vp.scale * dpr;
    const flip = ctx.flipY ? -1 : 1;
    const postOn = this.post.begin();
    const pf = postOn ? 1 : flip;
    const cam = this.cam;
    const ox = cam.ox;
    const oy = cam.oy + cam.nudge;
    // background follows the shake (whole screen moves), not zoom/rotation
    const bg = this.bg;
    bg.flip = pf;
    bg.w = W;
    bg.h = H;
    bg.draw(this.realTime, (vp.left + ox * vp.scale) * dpr, (vp.top + oy * vp.scale) * dpr, s);
    // world matrix: rotate/zoom about the camera focus, then shake, then the viewport fit
    const c = Math.cos(cam.rot) * cam.zoom;
    const sn = Math.sin(cam.rot) * cam.zoom;
    const fx = cam.focusX;
    const fy = cam.focusY;
    const kx = (2 * s) / W;
    const bx = (2 * vp.left * dpr) / W - 1;
    const ky = ((-2 * s) / H) * pf;
    const by = pf * (1 - (2 * vp.top * dpr) / H);
    const cx = -c * fx + sn * fy + fx + ox;
    const cy = -sn * fx - c * fy + fy + oy;
    const b = this.batcher;
    b.resetStats();
    b.setMatrix(kx * c, ky * sn, -kx * sn, ky * c, kx * cx + bx, ky * cy + by);
    b.setTexture(this.atlas.texture);
    if (this.mode === 'title') {
      this.demo.draw(b, this.spr);
      this.parts.draw(b, false, this.realTime);
      this.parts.draw(b, true, this.realTime);
    } else if (this.view) {
      this.view.draw();
    }
    b.flush();
    // post parameters
    const P = this.post;
    const fxs = this.fx;
    P.time = this.realTime;
    P.scan = config.quality[this.quality].scan ? 0.06 : 0;
    P.scanOff = 0;
    P.grain = this.quality === 'high' ? 0.02 : 0;
    if (fxs) {
      P.flashR = fxs.flashR;
      P.flashG = fxs.flashG;
      P.flashB = fxs.flashB;
      P.flashA = fxs.flashA;
      P.ca = this.quality === 'high' && !settings.reduceFlash ? fxs.ca * 6 : 0;
      const run = this.mode !== 'title';
      const red = run ? clamp01(fxs.vigRed + 0.45 * fxs.lowHpPulse() + 0.7 * fxs.warnPulse + (this.g.boss ? 0.12 : 0)) : 0;
      P.vig = 0.5 + 0.35 * red;
      P.vigR = red;
      P.vigG = red * 0.04;
      P.vigB = red * 0.1;
      P.desat = Math.max(fxs.desat, (this.quality === 'high' ? 0.4 : 0) * this.dimV);
      P.dim = 0.3 * this.dimV;
      let sr = -1;
      let ss = 0;
      if (run && this.g.shockR >= 0) {
        sr = this.g.shockR;
        ss = 1 - Math.min(1, sr / 900);
      } else if (fxs.shockT >= 0) {
        const pr = fxs.shockT / fxs.shockDur;
        sr = pr * 900;
        ss = 1 - pr;
      }
      P.shockS = sr >= 0 && this.quality === 'high' && !settings.reduceFlash ? ss : 0;
      P.shockR = (sr * s) / H;
      P.shockX = ((vp.left + fxs.shockX * vp.scale) * dpr) / W;
      P.shockY = 1 - ((vp.top + fxs.shockY * vp.scale) * dpr) / H;
    } else {
      P.flashA = 0;
      P.ca = 0;
      P.vig = 0.5;
      P.vigR = P.vigG = P.vigB = 0;
      P.desat = 0;
      P.dim = 0;
      P.shockS = 0;
    }
    P.end(flip);
    ctx.present();
  }
}
