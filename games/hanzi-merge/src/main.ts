/**
 * 启动与场景管理（§8.1）：字体加载（3 s 内必可玩：标题按钮在 HTML 里，字体未就绪时用系统楷体兜底）、
 * 舞台缩放、主循环（rAF，dt 上限 50 ms）、自动暂停、键盘、音频解锁、URL 参数（§9.1）。
 */
import './styles.css';
import { LEVELS } from './data/levels.ts';
import { AudioEngine } from './audio/audio.ts';
import { Music } from './audio/music.ts';
import { Play, type PlayHost, type ResultInfo } from './play.ts';
import { Pointer } from './input/pointer.ts';
import { Stage } from './render/stage.ts';
import { glyphs, waitFonts } from './render/glyphs.ts';
import { save, setTutorialDone } from './save.ts';
import { Card } from './ui/card.ts';
import { Screens, type UiHost } from './ui/screens.ts';
import { TitleDemo } from './ui/titleDemo.ts';
import { $ } from './ui/dom.ts';

const params = new URLSearchParams(location.search);
const num = (k: string): number | undefined => {
  const v = params.get(k);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
};
const P = {
  debug: params.get('debug') === '1',
  seed: num('seed'),
  level: num('level'),
  endless: params.get('endless') === '1',
  tutorial: params.get('tutorial'),
  mute: params.get('mute') === '1',
  brief: params.get('card') === 'brief',
};

type Scene = 'title' | 'play';

export class App {
  readonly stage = new Stage();
  readonly audio = new AudioEngine();
  readonly music = new Music(this.audio);
  readonly pointer = new Pointer(this.stage);
  readonly play: Play;
  readonly screens: Screens;
  readonly card: Card;
  readonly demo = new TitleDemo($('title-demo') as HTMLCanvasElement);
  scene: Scene = 'title';
  /** 帧回调（debug 浮层用） */
  onFrame: ((dt: number, ms: number) => void) | null = null;
  private last = 0;
  private titleT = 0;
  private resumeTimer = 0;
  private fontsReady = false;
  private slowT = 0;

  constructor() {
    const uiHost: UiHost = {
      startLevel: (id) => this.startLevel(id),
      startEndless: () => this.startEndless(),
      resume: () => this.resume(),
      restart: () => this.restart(),
      toTitle: () => this.toTitle(),
      nextLevel: () => this.startLevel(Math.min(LEVELS.length, this.play.def.id + 1)),
      openCard: (ch) => this.card.show(ch, '', () => undefined, true),
      settingsChanged: () => this.applySettings(),
      replayTutorial: () => {
        setTutorialDone(false);
        this.startLevel(1, true);
      },
      skipTutorial: () => this.play.skipTutorial(),
      click: () => this.audio.wood(0.14),
    };
    this.screens = new Screens(uiHost);
    this.card = new Card(this.screens.ui);
    this.card.onSound = () => this.audio.paper(0.2);
    const host: PlayHost = {
      showCard: (ch, note, done) => {
        this.pointer.cancel();
        if (save.settings.card === 'brief' || this.play.cardForcedBrief) {
          this.card.showBrief(ch);
          done();
        } else this.card.show(ch, note, done);
      },
      showBrief: (ch) => this.card.showBrief(ch),
      showResult: (r) => this.showResult(r),
      tip: (t, ms, strong) => this.screens.tip(t, ms, strong),
      clearTip: () => this.screens.clearTip(),
      showSkip: (on) => this.screens.showSkip(on),
      pause: () => this.pause(),
    };
    this.play = new Play(host, this.audio, this.music);
    this.play.cardForcedBrief = P.brief;
    this.pointer.handler = this.play.input;
    this.audio.forcedMute = P.mute;
    this.applySettings();
    this.screens.setWipeSprite(this.play.blooms[0]);

    this.rebuild();
    this.stage.onResize = () => this.rebuild();
    this.bindTitle();
    this.bindGlobal();
  }

  /** DPR / 尺寸变化：重建字形与背景缓存、重绘书桌 */
  private rebuild(): void {
    const d = this.stage.dpr;
    if (glyphs.dpr !== d || !this.fontsReady) glyphs.reset(d);
    this.play.bg.build(d);
    this.play.reveal.setDpr(d);
    this.play.bg.drawDesk(this.stage.bg, this.stage.left, this.stage.top, this.stage.scale);
    this.demo.setDpr(d);
  }

  async loadFonts(): Promise<void> {
    const ok = await waitFonts(2500);
    this.fontsReady = true;
    glyphs.reset(this.stage.dpr);
    this.play.bg.drawDesk(this.stage.bg, this.stage.left, this.stage.top, this.stage.scale);
    if (!ok) {
      // 兜底：迟到的字体也要换上
      document.fonts?.addEventListener?.('loadingdone', () => glyphs.reset(this.stage.dpr), { once: true });
    }
  }

  applySettings(): void {
    const st = save.settings;
    this.audio.sfxOn = st.sfx;
    this.audio.musicOn = st.music;
    this.audio.volume = st.volume;
    this.audio.apply();
    this.play.setSettings();
    document.documentElement.classList.toggle('reduce-motion', st.reduceMotion);
  }

  // ───────── 标题 ─────────
  private bindTitle(): void {
    const start = () => {
      this.gesture();
      this.audio.wood(0.2);
      if (!save.tutorialDone && P.tutorial !== '0') this.startLevel(1, true);
      else this.startLevel(this.nextUnfinished(), P.tutorial === '0' ? false : undefined);
    };
    $('btn-start').addEventListener('click', start);
    $('btn-select').addEventListener('click', () => {
      this.gesture();
      this.audio.wood(0.14);
      this.screens.showSelect(() => this.screens.close('select'));
    });
    $('btn-endless').addEventListener('click', () => {
      this.gesture();
      this.audio.wood(0.14);
      this.startEndless();
    });
    $('btn-atlas').addEventListener('click', () => {
      this.gesture();
      this.audio.wood(0.14);
      this.screens.showAtlas(() => this.screens.close('atlas'));
    });
    $('btn-settings').addEventListener('click', () => {
      this.gesture();
      this.audio.wood(0.14);
      this.screens.showSettings(() => this.screens.close('settings'));
    });
    this.screens.showTitle();
    const w = window as unknown as { __hmEarlyStart?: boolean };
    if (w.__hmEarlyStart && !P.level && !P.endless) {
      w.__hmEarlyStart = false;
      start();
    }
  }

  /** 最近未完成的一帖 */
  private nextUnfinished(): number {
    for (let i = 1; i <= Math.min(LEVELS.length, save.progress.unlocked); i++) if (!save.progress.levels[i]) return i;
    return Math.min(LEVELS.length, save.progress.unlocked);
  }

  private gesture(): void {
    this.audio.unlock();
    if (this.scene === 'play' && this.play.game && !this.play.paused && !this.play.over) this.music.start();
  }

  // ───────── 场景切换 ─────────
  startLevel(id: number, tutorial?: boolean, seed?: number): void {
    this.screens.wipe(() => {
      this.enterPlay();
      this.play.startLevel(id, seed ?? P.seed, tutorial);
      this.music.start();
    });
  }

  startEndless(stage = 1, seed?: number): void {
    this.screens.wipe(() => {
      this.enterPlay();
      this.play.startEndless(seed ?? P.seed, stage);
      this.music.start();
    });
  }

  enterPlay(): void {
    this.pointer.cancel();
    this.screens.closeAll();
    this.screens.hideTitle();
    this.screens.showHud();
    this.card.close(true);
    this.scene = 'play';
    this.pointer.enabled = true;
  }

  toTitle(): void {
    this.screens.wipe(() => {
      this.pointer.cancel();
      this.music.stop(0.6);
      this.play.game = null;
      this.scene = 'title';
      this.screens.clearTip();
      this.screens.showSkip(false);
      this.card.close(true);
      this.screens.showTitle();
    });
  }

  restart(): void {
    this.screens.wipe(() => {
      this.enterPlay();
      this.play.retry();
      this.music.start();
    });
  }

  // ───────── 暂停 ─────────
  pause(): void {
    if (this.scene !== 'play' || !this.play.game || this.play.paused || this.play.over || this.screens.wiping()) return;
    this.pointer.cancel();
    this.play.cancelDrag();
    this.play.paused = true;
    this.music.stop(0.4);
    this.audio.paper(0.15);
    this.screens.showPause(
      this.play.mode === 'endless',
      () => this.screens.showAtlas(() => this.screens.close('atlas')),
      () => this.screens.showSettings(() => this.screens.close('settings')),
    );
  }

  resume(): void {
    this.screens.close('pause');
    this.screens.close('select');
    this.audio.wood(0.14);
    this.pointer.enabled = false;
    clearTimeout(this.resumeTimer);
    // 继续后 200 ms 再恢复输入（防点击穿透，§8.7）
    this.resumeTimer = window.setTimeout(() => {
      this.play.paused = false;
      this.pointer.enabled = true;
      this.music.start();
    }, 200);
  }

  private showResult(r: ResultInfo): void {
    this.screens.clearTip();
    this.screens.showSkip(false);
    this.screens.showResult(r);
    if (r.record) {
      this.play.particles.confetti(195, 330, 40, 420);
      this.play.particles.confetti(110, 360, 16, 320);
      this.play.particles.confetti(280, 360, 16, 320);
    }
  }

  // ───────── 全局事件 ─────────
  private bindGlobal(): void {
    const autoPause = () => {
      if (this.scene === 'play') this.pause();
    };
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        autoPause();
        this.audio.suspend();
      } else this.audio.resume();
    });
    const unlock = () => this.gesture();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener(
      'touchmove',
      (e) => {
        const t = e.target as HTMLElement | null;
        if (!t?.closest('.list')) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') {
        if (this.card.isOpen()) this.card.close(false);
        else if (this.scene === 'play' && this.play.paused && this.screens.isOpen('pause')) this.resume();
        else this.pause();
        return;
      }
      if (this.scene !== 'play' || this.play.paused || this.play.over || this.card.isOpen()) return;
      if (k === 'z') this.play.undo();
      else if (k === 'h' && this.play.game) {
        const os = this.play.s.orders;
        if (os.length) this.play.hint(os.reduce((m, o) => Math.min(m, o.slot), 9));
      }
    });
  }

  // ───────── 主循环 ─────────
  frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const ctx = this.stage.ctx;
    const dpr = this.stage.dpr;
    this.screens.update(dt);
    if (this.scene === 'play' && this.play.game) {
      this.pointer.update();
      this.play.dragPos.x = this.pointer.x;
      this.play.dragPos.y = this.pointer.y;
      this.play.update(dt);
      this.music.tension = this.play.s.ink <= 3 ? 1 : 0;
      this.music.update(dt);
      this.play.draw(ctx, dpr);
    } else {
      this.titleT += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.play.bg.drawBase(ctx, this.titleT, 640, 1, !save.settings.reduceMotion);
      if ($('title').classList.contains('show')) this.demo.update(dt, save.settings.reduceMotion);
    }
    // 低端机降级：帧间隔连续 2 s > 20 ms
    if (!this.play.lowPower && this.scene === 'play' && !document.hidden) {
      this.slowT = dt > 0.02 ? this.slowT + dt : 0;
      if (this.slowT > 2) {
        this.play.lowPower = true;
        this.play.setSettings();
      }
    }
    this.onFrame?.(dt, performance.now() - t0);
  };

  boot(): void {
    requestAnimationFrame(this.frame);
    const tut = P.tutorial === '1' ? true : P.tutorial === '0' ? false : undefined;
    if (P.level) this.startLevel(Math.max(1, Math.min(LEVELS.length, P.level)), tut);
    else if (P.endless) this.startEndless(1);
    else if (P.tutorial === '1') this.startLevel(1, true);
  }
}

const app = new App();
void app.loadFonts();
app.boot();
if (P.debug) void import('./debug.ts').then((m) => m.installDebug(app));
