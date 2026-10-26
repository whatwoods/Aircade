import { AudioEngine } from './audio/audio';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { CONFIG } from './config';
import { Clock } from './core/clock';
import { cubicOut, quadOut } from './core/ease';
import { setHaptics, vibrate } from './core/haptics';
import { Input, type InputHandler } from './core/input';
import { Loop } from './core/loop';
import { randomSeed } from './core/rng';
import { clearAll, load, loadRecords, loadSettings, type Records, save, type Settings } from './core/storage';
import { Tweens } from './core/tween';
import { LAIR_DIST, N, cx, cy } from './game/board';
import { Game } from './game/rules';
import { commitRecords } from './game/score';
import { type TutStep, Tutorial } from './game/tutorial';
import { type GameEvent, Kind, MARK_NONE, MARK_SAFE, MARK_UNKNOWN } from './game/types';
import { type Action, Screens } from './ui/screens';
import { Bg } from './view/bg';
import { BoardView } from './view/boardView';
import { Camera } from './view/camera';
import { Director, type Stage } from './view/director';
import { DragonView } from './view/dragonView';
import { P, Fx } from './view/fx';
import { Glyphs } from './view/glyphs';
import { Hud } from './view/hud';
import { cellAt, computeLayout, type Layout, type Rect } from './view/layout';
import { Lighting } from './view/lighting';
import { CENTER, OUTSIDE, PLATE, RADIAL_VALUES, Radial } from './view/radial';
import { Overlay, type Pointer, Renderer } from './view/renderer';
import { Silhouettes } from './view/silhouettes';
import { Textures } from './view/textures';

export type AppState = 'title' | 'intro' | 'playing' | 'paused' | 'result';

export interface AppOptions {
  seed: number | null;
  debug: boolean;
  tutorial: boolean | null;
  mute: boolean;
  fast: boolean;
}

/**
 * 顶层：状态机 title / intro / playing / paused / result，串联输入、逻辑、演出、渲染、音频与 DOM。
 */
export class App implements Stage, InputHandler {
  // ---- 子系统
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  L!: Layout;
  readonly clock = new Clock();
  readonly tw = new Tweens(256);
  readonly cam = new Camera();
  readonly tex = new Textures();
  readonly gl = new Glyphs();
  readonly sil = new Silhouettes();
  readonly fx: Fx;
  readonly lighting = new Lighting();
  readonly board: BoardView;
  readonly dragon: DragonView;
  readonly hud: Hud;
  readonly radial: Radial;
  readonly ov = new Overlay();
  readonly renderer: Renderer;
  readonly director: Director;
  readonly audio = new AudioEngine();
  readonly sfx: Sfx;
  readonly music: Music;
  readonly screens: Screens;
  readonly input: Input;
  readonly bg: Bg;
  readonly loop: Loop;
  readonly tut = new Tutorial();
  game!: Game;
  settings: Settings;
  records: Records;
  tips: Record<string, boolean>;
  private tipQueue: { id: string; text: string }[] = [];
  private nextTipAt = 0;
  /** 本局玩家是否已做过第一次操作（之前不弹情境提示） */
  private userActed = false;
  opts: AppOptions;
  state: AppState = 'title';
  reduced = false;
  // ---- 运行时
  private timerOn = false;
  private lockUntil = 0;
  private lethalCell = -1;
  private lethalUntil = 0;
  private introT0 = 0;
  private tutNeedApply = false;
  private tutEyes = false;
  private tutDimTarget = 0;
  private hoverX = -1;
  private hoverY = -1;
  private mouseInside = false;
  private pressing = false;
  private downCell = -1;
  private chordCell = -1;
  private lowHp = false;
  private heartT = 0;
  private dangerT = 0;
  private soundHinted = true;
  private ptr: Pointer = { x: -1, y: -1, strength: 0, radius: 1.1 };
  private resizeTimer = 0;
  private safeProbe: HTMLElement;
  /** 帧耗时（ms）环形缓冲 */
  readonly perfBuf = new Float32Array(120);
  perfIdx = 0;
  private qualAcc = 0;
  private qualN = 0;
  private qualSum = 0;
  quality = 0;
  onFrame: ((dt: number) => void) | null = null;

  constructor(opts: AppOptions) {
    this.opts = opts;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.safeProbe = document.getElementById('safe-probe')!;
    this.settings = loadSettings();
    this.records = loadRecords();
    this.tips = load<Record<string, boolean>>('tips', {});
    this.fx = new Fx(this.tex, this.sil);
    this.board = new BoardView(this.tex, this.gl, this.sil, this.fx, {
      onFlipStart: (i, o) => this.director.onFlipStart(i, o),
      onFlipEnd: (i) => this.director.onFlipEnd(i),
    });
    this.dragon = new DragonView(this.tex, this.sil, this.fx);
    this.hud = new Hud(this.tw, this.tex, this.gl, this.sil, this.fx);
    this.radial = new Radial(this.tex, this.gl);
    this.radial.onHover = (k) => {
      if (k >= 0) {
        this.sfx.radialHover(k);
        vibrate(3);
      }
    };
    this.renderer = new Renderer({
      ctx: this.ctx,
      tex: this.tex,
      gl: this.gl,
      lighting: this.lighting,
      board: this.board,
      dragon: this.dragon,
      hud: this.hud,
      fx: this.fx,
      radial: this.radial,
      cam: this.cam,
      clock: this.clock,
      ov: this.ov,
    });
    this.director = new Director(this);
    this.sfx = new Sfx(this.audio);
    this.music = new Music(this.audio);
    this.audio.onReady = () => this.music.start();
    this.screens = new Screens(document.getElementById('ui')!);
    this.screens.onAction = (a) => this.action(a);
    this.screens.onButton = () => this.sfx.button();
    this.screens.onRowTick = (i) => this.sfx.rowTick(i);
    this.screens.onCountTick = () => this.sfx.scoreTick();
    this.screens.onRecord = () => this.recordFx();
    this.bg = new Bg(document.getElementById('bg') as HTMLCanvasElement);
    this.input = new Input(this.canvas, this);
    this.loop = new Loop((dt) => this.frame(dt));
    this.applySettings();
    if (opts.mute) this.audio.setMuted(true);
    if (opts.fast) this.clock.scale = 3;
    // 游戏实例（标题页背景也需要一个）
    this.game = new Game(opts.seed ?? randomSeed(), false);
    this.board.reset(this.game, false, 0);
    this.layout();
    this.bindGlobal();
    this.screens.showTitle(this.records, true);
    this.loop.start();
  }

  // ================================================================== 布局
  private safeInsets(): [number, number] {
    const cs = getComputedStyle(this.safeProbe);
    return [parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0];
  }

  layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const [st, sb] = this.safeInsets();
    const L = computeLayout(vw, vh, st, sb, CONFIG.quality.maxDpr * (this.quality >= 3 ? 0.75 : 1));
    this.L = L;
    const c = this.canvas;
    c.width = Math.round(L.colW * L.dpr);
    c.height = Math.round(L.vh * L.dpr);
    c.style.width = L.colW + 'px';
    c.style.height = L.vh + 'px';
    c.style.left = L.colX + 'px';
    this.tex.bakeTiles(L.cell, L.dpr);
    this.tex.bakeWall(L);
    this.tex.bakeBackdrop(L);
    this.gl.bake(L.cell, L.s, L.dpr);
    this.sil.bake(L.cell, L.dpr);
    this.hud.invalidate();
    this.board.version++;
    this.bg.resize(L);
    this.input.updateRect();
    this.screens.place(L.colX, L.colW, L.vh, L.pause, L.scoreLine.y + L.scoreLine.h / 2, L.boardOuter.y, L.boardOuter.y + L.boardOuter.h, L.safeBottom);
    if (this.radial.open) this.closeRadial();
  }

  /** 字体迟到时重烘字形 */
  rebakeGlyphs(): void {
    this.gl.bake(this.L.cell, this.L.s, this.L.dpr);
    this.hud.invalidate();
  }

  private bindGlobal(): void {
    const unlock = () => {
      this.audio.unlock();
      if (this.soundHinted) {
        this.soundHinted = false;
        this.screens.hideSoundHint();
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('resize', () => this.queueResize());
    window.addEventListener('orientationchange', () => this.queueResize());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.autoPause();
        this.audio.suspend();
        if (this.state !== 'paused') this.loop.stop();
      } else {
        this.audio.resume();
        if (this.state !== 'paused') this.loop.start();
      }
    });
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('mousemove', (e) => {
      this.bg.mx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      this.bg.my = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    });
  }

  private queueResize(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.layout(), 150);
  }

  // ================================================================== 主循环
  private frame(dt: number): void {
    const t0 = performance.now();
    const C = this.clock;
    C.tick(dt);
    const real = C.real;
    const world = C.world;
    const inGame = this.state !== 'title';
    this.input.update(t0);
    if (inGame) {
      if (this.state === 'intro' && real - this.introT0 > 300) this.state = 'playing';
      this.director.update();
      this.tutUpdate();
      this.board.pressProg = this.downCell >= 0 && !this.radial.open ? this.input.pressProgress(t0) : -1;
      if (this.board.pressProg > 0 && this.board.pressProg < 0.2) this.sfx.charge();
      this.board.update(world, real, C.dt);
      this.dragon.update(this.L, real);
      this.gameTick(C.rdt);
    }
    this.tw.update(world);
    this.fx.update(C.dt);
    this.cam.update(real, C.rdt);
    this.music.update();
    // 压暗缓动
    const k = Math.min(1, C.rdt / 120);
    this.board.tutDim += (this.tutDimTarget - this.board.tutDim) * k;
    this.board.radialDim += ((this.radial.open ? 1 : 0) - this.board.radialDim) * k;
    this.updatePointer();
    this.renderer.reduced = this.reduced;
    this.renderer.draw(this.L, inGame ? this.game : null, this.ptr);
    if (!inGame) this.screens.setGlow(this.renderer.titleGlow);
    this.bg.update(C.rdt, real);
    const work = performance.now() - t0;
    this.perfBuf[this.perfIdx] = work;
    this.perfIdx = (this.perfIdx + 1) % this.perfBuf.length;
    this.adaptQuality(work, C.rdt);
    if (this.onFrame) this.onFrame(dt);
  }

  private adaptQuality(work: number, rdt: number): void {
    this.qualAcc += rdt;
    this.qualSum += work;
    this.qualN++;
    if (this.qualAcc < CONFIG.quality.windowMs) return;
    const avg = this.qualSum / Math.max(1, this.qualN);
    this.qualAcc = this.qualSum = this.qualN = 0;
    if (avg <= CONFIG.quality.thresholdMs || this.quality >= 3) return;
    this.quality++;
    if (this.quality === 1) this.ov.fog = false;
    else if (this.quality === 2) this.fx.capScale = 0.5;
    else this.layout();
  }

  private gameTick(rdt: number): void {
    const g = this.game;
    const hud = this.hud;
    // 计时（R11）
    if (this.state === 'playing' && this.timerOn && !this.tut.active && g.phase === 'playing') g.timeMs += rdt;
    hud.timeSec = Math.floor(g.timeMs / 1000);
    this.board.hpShown = hud.hp;
    // 巨龙显露
    if (!this.dragon.hidden && this.dragon.riseT0 < 0)
      this.dragon.eyes = this.dragon.awake || this.tutEyes ? 2 : hud.level >= CONFIG.dragon.oneEyeAtLevel ? 1 : 0;
    // 低血
    // 低血以逻辑生命为准（显示值在升级演出里会先掉后灌满，不能用来判定）；视觉还要等显示值也跟上
    const P = g.player;
    const lowReal = g.phase === 'playing' && P.hp > 0 && (P.hp <= CONFIG.lowHpAbs || P.hp <= P.maxHp * CONFIG.lowHpFrac);
    const low = lowReal && hud.hp > 0 && (hud.hp <= CONFIG.lowHpAbs || hud.hp <= hud.maxHp * CONFIG.lowHpFrac);
    if (low && !this.lowHp) {
      vibrate([6, 60, 6, 60, 6]);
      this.tip('lowhp', '生命垂危！喝血瓶、开宝箱，或去打能让你升级的怪（升级回满血）');
    }
    this.tipUpdate();
    this.lowHp = low;
    hud.lowHp = low;
    this.ov.lowHp = low;
    if (low && this.state === 'playing') {
      this.heartT -= rdt;
      if (this.heartT <= 0) {
        this.heartT = 900;
        this.sfx.heartbeat();
      }
    }
    // 紧张度
    this.dangerT -= rdt;
    if (this.dangerT <= 0) {
      this.dangerT = 500;
      let near = 9;
      for (let i = 0; i < N; i++) if (g.revealed[i] && g.b.kind[i] !== Kind.Lair && LAIR_DIST[i] < near) near = LAIR_DIST[i];
      const prox = Math.max(0, (3 - near) / 2);
      this.music.danger = g.phase === 'playing' ? Math.min(1, (hud.level >= 7 ? 0.4 : 0) + (low ? 0.45 : 0) + 0.3 * prox) : 0;
      if (g.marksPlaced >= 3 && this.settings.chord) this.tip('chord', '数字快开：周围标记之和等于数字时，点数字可一次翻开其余暗砖');
    }
  }

  private updatePointer(): void {
    const L = this.L;
    const p = this.ptr;
    let px = -1;
    let py = -1;
    if (this.pressing) {
      px = this.input.pressX;
      py = this.input.pressY;
    } else if (this.mouseInside) {
      px = this.hoverX;
      py = this.hoverY;
    }
    if (px < 0 || this.state === 'title') {
      p.strength += (0 - p.strength) * 0.15;
      return;
    }
    const tx = (px - L.board.x) / L.cell;
    const ty = (py - L.board.y) / L.cell;
    if (p.x < 0) {
      p.x = tx;
      p.y = ty;
    }
    p.x += (tx - p.x) * 0.35;
    p.y += (ty - p.y) * 0.35;
    const target = this.pressing ? 0.5 : 0.35;
    p.strength += (target - p.strength) * 0.2;
    p.radius += ((this.pressing ? 1.4 : 1.1) - p.radius) * 0.2;
  }

  // ================================================================== 流程
  /** 标题 → 游戏 */
  startFromTitle(forceTutorial = false): void {
    if (this.state !== 'title') return;
    const done = load<boolean>('tutorial', false);
    let tutorial = forceTutorial || !done;
    if (this.opts.tutorial !== null && !forceTutorial) tutorial = this.opts.tutorial;
    this.screens.hideTitle();
    this.renderer.mode = 'game';
    const w = this.clock.world;
    this.tw.set(this.ov.boardAlpha, 0);
    this.tw.set(this.ov.dive, 0);
    this.tw.to(this.ov.boardAlpha, 1, 500, w, cubicOut, 100);
    this.tw.to(this.ov.dive, 1, 500, w, cubicOut);
    this.tw.set(this.hud.slide, 0);
    this.tw.to(this.hud.slide, 1, 450, w, cubicOut, 350);
    this.music.title = false;
    this.newGame(tutorial, true);
  }

  /** 开新局（同一场景内） */
  newGame(tutorial: boolean, deal: boolean): void {
    const seed = this.opts.seed ?? randomSeed();
    this.game = new Game(seed, tutorial);
    this.game.chordEnabled = this.settings.chord;
    this.director.clear();
    this.fx.clear();
    this.ov.reset();
    this.ov.brazier.v = 0;
    this.tw.set(this.ov.dragonAlpha, deal ? 1 : 0);
    if (!deal) this.tw.to(this.ov.dragonAlpha, 1, 600, this.clock.world, quadOut);
    this.board.reset(this.game, deal, this.clock.world);
    this.dragon.reset();
    const p = this.game.player;
    this.hud.sync(p.level, p.hp, p.xp, 0, this.game.alive);
    this.hud.dragonReady = false;
    this.hud.setBase('巨龙沉睡中 · 需 14 点生命', 'normal');
    this.hud.clearMessage();
    this.hud.showHint = this.records.plays < 3;
    this.hud.hidden = false;
    this.tw.set(this.hud.bars, 0);
    this.tw.to(this.hud.bars, 1, 600, this.clock.world, cubicOut, deal ? 600 : 200);
    this.music.awake = false;
    this.music.title = false;
    this.timerOn = false;
    this.lockUntil = 0;
    this.lethalCell = -1;
    this.userActed = false;
    this.tipQueue.length = 0;
    this.lowHp = false;
    this.tutEyes = false;
    this.closeRadial();
    this.state = 'intro';
    this.introT0 = this.clock.real;
    this.screens.showPauseBtn(true);
    this.director.intro(this.game.start(), deal);
    if (tutorial) {
      this.tut.start(this.clock.real);
      this.tut.waiting = true;
      this.tutNeedApply = true;
      this.tut.stepT0 = this.clock.real + 900;
    } else {
      this.tut.stop();
      this.clearTutVisual();
      this.timerOn = true;
    }
  }

  /** 结算 → 新局：翻回暗砖后重开 */
  replay(): void {
    if (this.state !== 'result') return;
    this.screens.hideResult();
    this.state = 'intro';
    this.introT0 = this.clock.real + 600;
    const ms = this.director.flipBack();
    this.tw.to(this.ov.dragonAlpha, 0, 250, this.clock.world, quadOut);
    this.director.at(this.clock.world + ms, () => this.newGame(false, false));
  }

  backToTitle(): void {
    this.screens.closeModal();
    this.screens.hideResult();
    this.screens.hideBubble();
    this.screens.fadeTo(true);
    this.loop.start();
    window.setTimeout(() => {
      this.state = 'title';
      this.renderer.mode = 'title';
      this.tut.stop();
      this.clearTutVisual();
      this.director.clear();
      this.fx.clear();
      this.canvas.classList.remove('blur');
      this.audio.musicFilter(18000);
      this.screens.showPauseBtn(false);
      this.screens.showTitle(this.records, false);
      this.music.title = true;
      this.music.danger = 0;
      this.screens.fadeTo(false);
    }, 320);
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'intro') return;
    if (this.director.locked) return;
    this.closeRadial();
    this.state = 'paused';
    this.input.reset();
    this.pressing = false;
    this.downCell = -1;
    this.board.pressCell = -1;
    this.sfx.pause();
    this.audio.musicFilter(500);
    this.canvas.classList.add('blur');
    this.screens.showPause(this.game.seed, this.game.b.regen, this.settings);
    this.screens.showPauseBtn(false);
    // 画一帧后停止 RAF（暂停时画布不重绘）
    window.setTimeout(() => {
      if (this.state === 'paused') this.loop.stop();
    }, 220);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.screens.closeModal();
    this.canvas.classList.remove('blur');
    this.audio.musicFilter(18000);
    this.screens.showPauseBtn(true);
    this.state = 'playing';
    this.loop.start();
  }

  private autoPause(): void {
    if ((this.state === 'playing' || this.state === 'intro') && !this.screens.modalOpen) this.pause();
  }

  onSequenceEnd(won: boolean): void {
    const g = this.game;
    const b = g.breakdown ?? g.computeBreakdown(won);
    const r = commitRecords(this.records, b);
    this.state = 'result';
    this.ov.bigOutT0 = this.clock.real;
    this.screens.showPauseBtn(false);
    this.lowHp = false;
    this.ov.lowHp = false;
    this.screens.showResult({
      b,
      prevBest: r.prevBest,
      newBest: r.newBest,
      level: g.player.level,
      explored: Math.round((g.revealedCount() / Math.max(1, g.playableCount())) * 100),
      marks: g.correctMarks,
    });
  }

  private recordFx(): void {
    const L = this.L;
    this.sfx.record();
    vibrate([20, 30, 20]);
    for (let r = 0; r < 2; r++)
      this.director.atReal(this.clock.real + r * 350, () => {
        for (let k = 0; k < 25; k++) this.fx.spawn(P.GoldDust, L.colW / 2 + this.fx.rr(-60, 60), L.vh * 0.35, this.fx.rr(-220, 220), this.fx.rr(-260, -40), 1400, 7, 2, 300, 0.4, 1);
      });
  }

  // ================================================================== 动作
  private action(a: Action): void {
    switch (a) {
      case 'start':
        this.startFromTitle();
        break;
      case 'howto':
        this.startFromTitle(true);
        break;
      case 'settings':
        this.screens.showSettings(this.settings, this.state === 'title' ? 'title' : 'pause');
        break;
      case 'close-settings':
        if (this.screens.settingsReturn === 'pause' && this.state === 'paused') this.screens.showPause(this.game.seed, this.game.b.regen, this.settings);
        else this.screens.closeModal();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        void this.screens.dialog('重新开始？', '本局进度将会丢失', '重新开始', '取消').then((ok) => {
          if (!ok) {
            this.screens.showPause(this.game.seed, this.game.b.regen, this.settings);
            return;
          }
          this.canvas.classList.remove('blur');
          this.audio.musicFilter(18000);
          this.loop.start();
          this.newGame(false, true);
        });
        break;
      case 'title':
        this.backToTitle();
        break;
      case 'replay':
        this.replay();
        break;
      case 'skip':
        this.finishTutorial();
        break;
      case 'tutgo':
        this.finishTutorial();
        break;
      case 'rewatch':
        save('tutorial', false);
        this.tips = {};
        save('tips', this.tips);
        this.screens.closeModal();
        if (this.state === 'title') this.startFromTitle(true);
        else {
          this.canvas.classList.remove('blur');
          this.audio.musicFilter(18000);
          this.loop.start();
          this.newGame(true, true);
        }
        break;
      case 'clear':
        void this.screens.dialog('清除全部记录？', '最高分、通关次数、引导与提示状态都会被清除', '清除', '取消').then((ok) => {
          if (ok) {
            clearAll();
            this.records = loadRecords();
            this.tips = {};
            save('settings', this.settings);
            this.screens.toast('记录已清除');
          }
          this.screens.showSettings(this.settings, this.state === 'title' ? 'title' : 'pause');
        });
        break;
      default:
        if (a.startsWith('toggle:')) this.toggle(a.slice(7) as keyof Settings);
    }
  }

  private toggle(k: keyof Settings): void {
    this.settings[k] = !this.settings[k];
    save('settings', this.settings);
    this.applySettings();
    this.screens.setToggle(k, this.settings[k]);
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio.setSfx(s.sfx);
    this.audio.setMusic(s.music);
    setHaptics(s.haptics);
    this.reduced = s.reducedMotion;
    this.cam.reduced = s.reducedMotion;
    if (this.game) this.game.chordEnabled = s.chord;
  }

  /** 情境提示：排队，同一时刻只显示一条；引导期间和玩家首次操作前暂缓 */
  tip(id: string, text: string): void {
    if (this.tips[id]) return;
    for (const q of this.tipQueue) if (q.id === id) return;
    this.tipQueue.push({ id, text });
  }

  private tipUpdate(): void {
    if (!this.tipQueue.length) return;
    const real = this.clock.real;
    if (real < this.nextTipAt || this.state !== 'playing' || !this.userActed) return;
    if (this.tut.active) return;
    if (this.director.locked || this.screens.modalOpen) return;
    const q = this.tipQueue.shift()!;
    this.tips[q.id] = true;
    save('tips', this.tips);
    this.screens.toast(q.text, CONFIG.timing.toastMs);
    this.nextTipAt = real + CONFIG.timing.toastMs + CONFIG.timing.tipGapMs;
  }

  // ================================================================== 引导
  private tutUpdate(): void {
    const t = this.tut;
    if (!t.active) return;
    const real = this.clock.real;
    const s = t.cur;
    if (!s) return;
    if (t.waiting) {
      if (this.director.busy || real < t.stepT0 + 350) return;
      if (this.tutNeedApply) {
        this.tutNeedApply = false;
        t.waiting = false;
        t.stepT0 = real;
        this.applyTut(s);
      } else this.advanceTut();
    } else if (s.action === 'auto' && real - t.stepT0 >= s.ms) this.advanceTut();
  }

  private advanceTut(): void {
    const n = this.tut.next(this.clock.real);
    if (n) this.applyTut(n);
    else this.finishTutorial();
  }

  private applyTut(s: TutStep): void {
    const L = this.L;
    this.board.tutCells = s.cells;
    this.board.tutArrow = s.arrow;
    const rects: Rect[] = [];
    for (const h of s.hud) {
      if (h === 'badge') rects.push(L.badge);
      else if (h === 'hp') rects.push(L.hp);
      else {
        const r = this.dragon.lairRect(L);
        rects.push({ x: r.x, y: r.y, w: r.s, h: r.s });
      }
    }
    this.board.tutRects = rects;
    this.tutDimTarget = s.cells.length || rects.length ? 1 : 0;
    this.tutEyes = s.id === '4';
    if (this.tutEyes) {
      this.dragon.disturb(L, this.clock.real);
      this.sfx.disturb();
    }
    this.screens.showBubble(s.text, s.action === 'button', true);
    this.sfx.radialHover(6);
  }

  private clearTutVisual(): void {
    this.board.tutCells = [];
    this.board.tutRects = [];
    this.board.tutArrow = -1;
    this.tutDimTarget = 0;
    this.tutEyes = false;
    this.screens.hideBubble();
  }

  finishTutorial(): void {
    if (!this.tut.active && !this.game.isTutorial) return;
    this.tut.stop();
    this.clearTutVisual();
    save('tutorial', true);
    this.timerOn = true;
    this.hud.message('冒险开始！推理数字，击败巨龙', 'gold', this.clock.real, 2400);
  }

  /** 引导：完成目标操作 */
  private tutDone(): void {
    this.tut.waiting = true;
    this.tut.stepT0 = this.clock.real;
  }

  // ================================================================== 输入
  private canAct(): boolean {
    return (this.state === 'playing' || (this.state === 'intro' && this.clock.real - this.introT0 > 300)) && !this.director.locked && !this.screens.modalOpen;
  }

  onDown(x: number, y: number, mouse: boolean): void {
    this.pressing = true;
    if (!mouse) {
      this.hoverX = x;
      this.hoverY = y;
    }
    if (this.radial.open) {
      if (this.radial.mode === 'tap') this.radial.setHover(x, y);
      return;
    }
    if (!this.canAct()) return;
    const c = cellAt(this.L, x, y);
    this.downCell = c;
    if (c < 0) return;
    const g = this.game;
    if (!g.revealed[c] && g.b.kind[c] !== Kind.Lair) this.board.pressCell = c;
    else if (g.isInfo(c) && g.number[c] > 0 && this.settings.chord && !this.tut.active) {
      const tg = g.chordTargets(c);
      if (tg) {
        this.chordCell = c;
        for (const j of tg) this.board.chord[j] = 1;
      }
    }
  }

  onMove(x: number, y: number, down: boolean, mouse: boolean): void {
    if (mouse) {
      this.mouseInside = true;
      this.hoverX = x;
      this.hoverY = y;
      const c = cellAt(this.L, x, y);
      this.board.hover = this.state === 'playing' ? c : -1;
    }
    if (this.radial.open) {
      if (down || this.radial.mode === 'tap') this.radial.setHover(x, y);
      return;
    }
    if (down) {
      const c = cellAt(this.L, x, y);
      if (c !== this.downCell) {
        this.board.pressCell = -1;
        this.clearChord();
      }
    }
  }

  onUp(x: number, y: number, moved: boolean, longFired: boolean, cancelled: boolean): void {
    this.pressing = false;
    this.board.pressCell = -1;
    this.downCell = -1;
    this.clearChord();
    if (!this.radial.open || this.radial.mode !== 'hold') return;
    if (cancelled) {
      this.closeRadial();
      return;
    }
    if (longFired && !moved) {
      // 松手点选模式
      this.radial.mode = 'tap';
      return;
    }
    this.pickRadial(this.radial.pick(x, y), true);
  }

  onTap(x: number, y: number, _mouse: boolean): void {
    if (this.radial.open) {
      if (this.radial.mode === 'tap') this.pickRadial(this.radial.pick(x, y), false);
      return;
    }
    const c = cellAt(this.L, x, y);
    this.tapCell(c);
  }

  onLongPress(x: number, y: number): void {
    if (!this.canAct() || this.radial.open) return;
    const c = cellAt(this.L, x, y);
    this.board.pressCell = -1;
    this.clearChord();
    if (c < 0) return;
    this.longPressCell(c, 'hold');
  }

  onContext(x: number, y: number): void {
    if (this.radial.open) {
      this.closeRadial();
      return;
    }
    if (!this.canAct()) return;
    const c = cellAt(this.L, x, y);
    if (c >= 0) this.longPressCell(c, 'tap');
  }

  onLeave(): void {
    this.mouseInside = false;
    this.board.hover = -1;
  }

  onWheel(x: number, y: number, dir: number): void {
    if (!this.canAct() || this.radial.open || this.tut.active) return;
    const c = cellAt(this.L, x, y);
    const g = this.game;
    if (c < 0 || g.revealed[c] || g.b.kind[c] === Kind.Lair) return;
    const cur = g.mark[c] > 0 ? g.mark[c] : 0;
    const next = (cur + dir + 10) % 10;
    this.applyMark(c, next);
  }

  private clearChord(): void {
    if (this.chordCell < 0) return;
    this.chordCell = -1;
    this.board.chord.fill(0);
  }

  /** 长按 / 右键 */
  longPressCell(c: number, mode: 'hold' | 'tap'): void {
    const g = this.game;
    const L = this.L;
    const real = this.clock.real;
    const kind = g.b.kind[c];
    if (this.tut.active && !this.tut.allowLongPress(c)) {
      if (!this.tut.waiting) this.screens.shakeBubble(this.tut.cur?.wrong);
      return;
    }
    if (kind === Kind.Lair) {
      this.hud.message('巨龙 Lv13 · 需生命 14', 'gold', real, 2400);
      this.sfx.radialOpen();
      return;
    }
    if (!g.revealed[c]) {
      const x = L.board.x + cx(c) * L.cell + L.cell / 2;
      const y = L.board.y + cy(c) * L.cell + L.cell / 2;
      this.radial.openAt(L, c, x, y, mode, g.mark[c], g.boundAt(c), this.hud.hp, real);
      this.board.radialCell = c;
      this.sfx.radialOpen();
      vibrate(8);
      return;
    }
    if (kind === Kind.Chest && !g.collected[c]) {
      this.hud.message(`宝箱：金币 ${g.b.gold[c]} · 经验 ${g.b.itemXp[c]}（点击打开）`, 'gold', real, 2600);
      this.sfx.radialOpen();
      return;
    }
    if (kind === Kind.Potion && !g.collected[c]) {
      this.hud.message(`血瓶：回复 ${g.b.heal[c]} 生命（点击饮用）`, 'mint', real, 2600);
      this.sfx.radialOpen();
      return;
    }
    this.board.nbCell = c;
    this.board.nbT0 = real;
  }

  private pickRadial(k: number, hold: boolean): void {
    const cell = this.radial.cell;
    if (k >= 0) {
      this.applyMark(cell, RADIAL_VALUES[k]);
      this.closeRadial();
    } else if (k === CENTER) {
      if (this.game.mark[cell] !== MARK_NONE) this.applyMark(cell, MARK_NONE);
      this.closeRadial();
    } else if (k === PLATE && !hold) {
      // 点在底盘空白处：保持打开
    } else if (k === OUTSIDE || k === PLATE) this.closeRadial();
  }

  closeRadial(): void {
    if (this.radial.open) this.radial.close(this.clock.real);
    this.board.radialCell = -1;
  }

  applyMark(cell: number, m: number): void {
    this.userActed = true;
    const g = this.game;
    if (cell < 0 || g.revealed[cell]) return;
    const ev = g.setMark(cell, m);
    if (ev.length) this.director.play(ev);
    if (this.tut.active) {
      const s = this.tut.cur;
      if (s && s.action === 'mark' && cell === s.target) {
        if (m === s.mark) this.tutDone();
        else this.screens.shakeBubble(s.wrong);
      }
    }
  }

  tapCell(c: number): void {
    this.userActed = true;
    if (c < 0 || !this.canAct()) return;
    const g = this.game;
    const real = this.clock.real;
    const world = this.clock.world;
    if (real < this.lockUntil) return;
    if (this.tut.active && !this.tut.allowTap(c)) {
      if (!this.tut.waiting) {
        this.screens.shakeBubble(this.tut.cur?.wrong);
        this.sfx.boop();
      }
      return;
    }
    if (this.board.flipping[c]) return;
    const kind = g.b.kind[c];
    if (kind === Kind.Lair) {
      const ev = g.tap(c);
      if (ev.length && ev[0].t === 'dragonConfirm') {
        this.confirmDragon(c);
        return;
      }
      this.playEvents(ev);
      return;
    }
    if (!g.revealed[c]) {
      if (g.isLethalMark(c) && !(this.lethalCell === c && real < this.lethalUntil)) {
        this.lethalCell = c;
        this.lethalUntil = real + CONFIG.rules.lethalConfirmMs;
        this.board.lethalT0[c] = world;
        this.sfx.warn();
        vibrate(15);
        this.hud.message('致命！再点一次硬闯', 'red', real, CONFIG.rules.lethalConfirmMs);
        return;
      }
      this.lethalCell = -1;
      if (this.board.dealT[c] > world - 220) {
        this.board.dealT[c] = world - 220;
        this.board.version++;
      }
    }
    const ev = g.tap(c);
    this.playEvents(ev);
    if (this.tut.active && this.tut.cur?.action === 'tap' && c === this.tut.cur.target) this.tutDone();
  }

  private async confirmDragon(c: number): Promise<void> {
    const ok = await this.screens.dialog('现在挑战巨龙？', '剩余怪物的分数将无法获得', '挑战', '再等等');
    if (!ok || this.game.phase !== 'playing') return;
    this.playEvents(this.game.tap(c, true));
  }

  playEvents(ev: GameEvent[]): void {
    if (!ev.length) return;
    const r = this.director.play(ev);
    if (r.fight) this.lockUntil = this.clock.real + CONFIG.rules.fightLockMs;
    if (this.state === 'intro') this.state = 'playing';
    if (!this.tut.active) this.timerOn = true;
  }

  // ================================================================== 键盘
  private key(e: KeyboardEvent): void {
    const k = e.key;
    if (this.screens.dialogOpen) {
      if (k === 'Escape') this.screens.resolveDialog(false);
      else if (k === 'Enter') this.screens.resolveDialog(true);
      return;
    }
    if (k === 'm' || k === 'M') {
      this.audio.setMuted(!this.audio.muted);
      if (this.state !== 'title') this.hud.message(this.audio.muted ? '已静音（M）' : '声音已开启（M）', 'normal', this.clock.real, 1400);
      return;
    }
    if (this.state === 'title') {
      if (k === 'Enter' || k === ' ') {
        if (!this.screens.modalOpen) this.startFromTitle();
        e.preventDefault();
      } else if (k === 'Escape' && this.screens.modalOpen) this.screens.closeModal();
      return;
    }
    if (this.state === 'result') {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        this.sfx.button();
        this.replay();
      }
      return;
    }
    if (this.state === 'paused') {
      if (k === 'Escape' || k === 'p' || k === 'P') this.resume();
      return;
    }
    if (k === 'Escape') {
      if (this.radial.open) this.closeRadial();
      else this.pause();
      return;
    }
    if (k === 'p' || k === 'P') {
      this.pause();
      return;
    }
    const c = this.board.hover;
    if (c < 0 || !this.canAct() || this.game.revealed[c] || this.game.b.kind[c] === Kind.Lair) return;
    if (this.tut.active && !this.tut.allowLongPress(c)) return;
    if (k >= '1' && k <= '9') this.applyMark(c, +k);
    else if (k === '0' || k === 'Backspace') this.applyMark(c, MARK_NONE);
    else if (k === 'q' || k === 'Q') this.applyMark(c, MARK_UNKNOWN);
    else if (k === 's' || k === 'S') this.applyMark(c, MARK_SAFE);
  }
}
