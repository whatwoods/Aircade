/**
 * 场景状态机（docs §6.1）：boot / title / playing / results；叠加层 paused / settings / tutorial。
 * 把 Session（纯逻辑）、Renderer、HUD、音频、输入和引导串起来。
 */
import { CONFIG } from './config';
import { audio } from './audio/audio';
import { music } from './audio/music';
import * as sfx from './audio/sfx';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { layoutStage, onResize, stageInfo } from './core/stage';
import { clearRecords, load, loadJson, loadNumber, save, saveJson, settings, type Stats } from './core/storage';
import { Feedback } from './fx/feedback';
import { Session } from './game/session';
import type { Hit } from './game/shooter';
import { Tutorial } from './game/tutorial';
import { rebakeNumbers } from './render/ballArt';
import { DesktopBg } from './render/desktopBg';
import { Renderer, type AimView } from './render/renderer';
import { TitleScene } from './render/titleScene';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { Transition } from './ui/transition';

export type Scene = 'boot' | 'title' | 'playing' | 'results';

const TIPS: Record<number, string> = {
  1: '从小到大的一排，打最小的那头能连到底',
  2: '两边相同，三合一，直接 ×4！',
  3: '翡翠灵珠：会变成被击中的数字，点右下角装填',
  4: '合成能把链条往回拉！',
  5: '缺口两端相同会自动吸合，连锁继续',
  6: '手指放在图腾和目标之间，看得更清楚',
};

function param(k: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
}

export class App {
  scene: Scene = 'boot';
  paused = false;
  readonly seed: number;
  readonly seeded: boolean;
  readonly session: Session;
  readonly renderer: Renderer;
  readonly hud = new Hud();
  readonly screens: Screens;
  readonly transition = new Transition();
  readonly loop: Loop;
  readonly feedback: Feedback;
  readonly tutorial: Tutorial;
  readonly title = new TitleScene();
  readonly desk: DesktopBg;
  readonly input: Input;
  readonly debug = param('debug') === '1';
  /** 自动游玩（仅 ?debug=1 经由 __game.autoplay 注入；机器人代码不进主包） */
  bot: { update(s: Session, dt: number): void } | null = null;
  best = loadNumber('best', 0);
  bestStage = loadNumber('bestStage', 0);
  stats: Stats = loadJson<Stats>('stats', { runs: 0, longestCascade: 0, totalSeals: 0, total2048: 0 });
  tips = loadNumber('tips', 0);
  private hit: Hit = { id: -2, index: -1, side: 0, x: 0, y: 0, t: 0, bx: 0, by: 0 };
  readonly aim: AimView = { active: false, angle: -Math.PI / 2, valid: false, cancel: false, touch: false, fx: 0, fy: 0, hit: this.hit, matchId: -1, hover: false };
  private summaryT = -1;
  private failT = -1;
  private overT = -1;
  private stairT = 0;
  private coverT = 0;
  private recordRun = false;
  private qualityT = 0;
  quality: 0 | 1 | 2 = 2;
  private stage0 = Math.max(1, Math.min(99, Number(param('stage') ?? 1) || 1));

  constructor() {
    const ps = param('seed');
    this.seeded = ps !== null && ps !== '' && Number.isFinite(Number(ps));
    this.seed = this.seeded ? Math.floor(Number(ps)) >>> 0 : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.session = new Session(this.seed);
    const canvas = document.getElementById('field') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.desk = new DesktopBg(document.getElementById('bg') as HTMLCanvasElement);
    this.loop = new Loop(
      (dt) => this.fixed(dt),
      (f) => this.frame(f.realDt),
    );
    this.feedback = new Feedback(this.session, this.renderer, this.loop, this.hud);
    this.hud.best = this.best;
    this.feedback.onStageClear = (e) => {
      this.summaryT = 0.5;
      this.pendingSummary = e;
    };
    this.feedback.onLifeLost = () => {
      this.failT = 1.0;
    };
    this.feedback.onRunOver = () => {
      this.overT = 0.6;
      this.saveRecords();
    };
    this.feedback.onTip = (id) => this.tip(id);
    this.session.bus.on('failStart', () => this.saveRecords());
    this.session.bus.on('stageStart', (e) => {
      this.bestStage = Math.max(this.bestStage, e.stage);
      save('bestStage', String(this.bestStage));
      this.hud.highlightSeal(false);
    });
    this.title.onMerge = (step, level) => {
      if (this.scene === 'title') sfx.chime(step, level, 0.14);
    };
    this.tutorial = new Tutorial(this.session, {
      card: (h, low) => this.hud.tutCard(h, this.aim.active, low),
      handDrag: (a, b, c, d) => this.hud.handDrag(a, b, c, d),
      handTap: (x, y) => this.hud.handTap(x, y),
      handOff: () => this.hud.handOff(),
      highlightBall: (id) => (this.renderer.hintId = id),
      highlightTotem: (on) => (this.renderer.hintTotem = on),
      highlightSeal: (on) => this.hud.highlightSeal(on),
      flashMouth: () => {
        this.renderer.mouthFlash = 1.8;
        const el = document.getElementById('progress');
        el?.animate([{ boxShadow: '0 0 0 2px #FFE7A3' }, { boxShadow: '0 0 0 1px rgba(227,178,76,0.35)' }], { duration: 600, iterations: 3 });
      },
      shrinkArrow: () => {
        const s = this.session;
        const b = s.chain.balls[0];
        if (b) {
          const p = s.track.posAt(b.s + 30);
          this.renderer.tag('◀ 链条缩短', p.x, p.y - 40, '#A8E6C8', 15);
        }
      },
      resetPuff: () => {
        const s = this.session;
        for (const b of s.chain.balls) {
          const p = s.track.posAt(b.s);
          this.renderer.particles.dust(p.x, p.y, 2);
        }
      },
      autoFire: (a) => {
        this.session.fire(a);
      },
      done: () => {
        save('tutorialDone', '1');
        document.getElementById('btn-skip-tut')?.classList.remove('show');
      },
    });
    this.screens = new Screens({
      start: () => this.startGame(false),
      howto: () => this.startGame(true),
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
      home: () => this.goHome(),
      again: () => this.again(),
      retutorial: () => {
        if (this.scene === 'title') this.startGame(true);
        else {
          this.screens.showPause(false);
          this.paused = false;
          this.loop.resumeInstant();
          this.transition.run(() => this.beginRun(true));
        }
      },
      clearRecords: () => {
        clearRecords();
        this.best = 0;
        this.bestStage = 0;
        this.tips = 0;
        this.hud.best = 0;
        this.stats = { runs: 0, longestCascade: 0, totalSeals: 0, total2048: 0 };
        if (this.scene === 'title') this.screens.showTitle(true, 0, 0);
      },
      settingsChanged: () => {
        audio.setSfx(settings.sfx);
        audio.setMusic(settings.music);
        this.feedback.applyShake();
        this.renderer.loupe = settings.loupe;
      },
      summaryNext: () => this.nextFromSummary(),
      click: () => {
        audio.unlock();
        sfx.click();
      },
    });
    document.getElementById('btn-skip-tut')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tutorial.skip();
      document.getElementById('btn-skip-tut')!.classList.remove('show');
    });
    document.getElementById('btn-pause')!.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.click();
      if (this.scene === 'playing') this.setPaused(true);
    });
    document.getElementById('btn-swap')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.playable()) this.session.swap();
    });
    document.getElementById('btn-wild')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.playable()) this.session.armWild();
    });
    const stageEl = document.getElementById('stage')!;
    this.input = new Input(stageEl, {
      enabled: () => this.playable() && !this.transition.busy,
      totem: () => ({ x: this.session.totemX, y: this.session.totemY }),
      fire: (x, y) => this.fireAt(x, y),
      swap: () => this.session.swap(),
      cancel: () => sfx.tick(),
      aimStart: () => {
        audio.unlock();
        sfx.scrape();
      },
    });
    this.renderer.loupe = settings.loupe;
    this.bindGlobal();
    onResize(() => this.resized());
  }

  private pendingSummary: { stage: number; stageScore: number; clearBonus: number; cashBonus: number; longest: number } | null = null;

  boot(): void {
    layoutStage(document.getElementById('stage')!);
    this.scene = 'title';
    this.screens.showTitle(true, this.best, this.bestStage);
    this.loop.start();
    const autostart = param('notut') === '1' || param('stage') !== null || param('tutorial') === '1';
    if (this.debug && autostart) this.startGame(param('tutorial') === '1', true);
  }

  fontsReady(): void {
    rebakeNumbers();
  }

  playable(): boolean {
    return this.scene === 'playing' && !this.paused && !this.screens.settingsOpen;
  }

  private bindGlobal(): void {
    const gesture = (): void => audio.unlock();
    window.addEventListener('pointerdown', gesture, { capture: true });
    window.addEventListener('keydown', gesture, { capture: true });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.scene === 'title') {
        if (k === 'enter' && !this.screens.settingsOpen && document.activeElement?.id !== 'btn-title-settings' && document.activeElement?.id !== 'btn-howto') {
          e.preventDefault();
          this.startGame(false);
        } else if (k === 'escape' && this.screens.settingsOpen) this.screens.closeSettings();
        return;
      }
      if (this.scene === 'results') {
        if (k === 'r' || (k === 'enter' && document.activeElement?.id !== 'btn-res-home')) {
          e.preventDefault();
          this.again();
        }
        return;
      }
      if (this.scene !== 'playing') return;
      if (k === 'escape' || k === 'p') {
        e.preventDefault();
        if (this.screens.settingsOpen) this.screens.closeSettings();
        else this.setPaused(!this.paused);
        return;
      }
      if (!this.playable()) return;
      if (k === ' ' || k === 'spacebar') {
        e.preventDefault();
        this.session.swap();
      } else if (k === 'e') this.session.armWild();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.scene === 'playing') this.setPaused(true);
        this.loop.stop();
        audio.suspend();
      } else {
        this.loop.start();
        audio.resume();
      }
    });
    window.addEventListener('blur', () => {
      if (this.scene === 'playing' && !this.debug) this.setPaused(true);
    });
    // 阻止双指缩放与长按菜单
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  private resized(): void {
    const sc = stageInfo.scale;
    this.renderer.resize(sc, stageInfo.dpr);
    this.transition.paint(sc * stageInfo.dpr);
    this.desk.resize();
    // safe-area（CSS px → 逻辑 px）
    const probe = document.getElementById('sa-probe');
    if (probe) {
      const cs = getComputedStyle(probe);
      const st = document.getElementById('stage')!;
      const top = Math.max(0, (parseFloat(cs.paddingTop) || 0) - stageInfo.top) / sc;
      const bot = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - (stageInfo.vh - stageInfo.top - 844 * sc)) / sc;
      st.style.setProperty('--sat', `${Math.min(40, top).toFixed(1)}px`);
      st.style.setProperty('--sab', `${Math.min(30, bot).toFixed(1)}px`);
    }
  }

  // ───────────── 流程 ─────────────
  startGame(tutorial: boolean, instant = false): void {
    if (this.transition.busy) return;
    audio.unlock();
    audio.setSfx(settings.sfx);
    audio.setMusic(settings.music);
    music.start(this.seed);
    music.intensity = 1;
    const tut = tutorial || (load('tutorialDone') !== '1' && param('notut') !== '1' && param('stage') === null);
    sfx.rustle();
    if (instant) this.beginRun(tut);
    else this.transition.run(() => this.beginRun(tut));
  }

  private beginRun(tutorial: boolean): void {
    this.scene = 'playing';
    this.paused = false;
    this.loop.resumeInstant();
    this.loop.cancelEffects();
    this.screens.showTitle(false, 0, 0);
    this.screens.showResults(false);
    this.screens.showSummary(false);
    this.hud.clearBanners();
    this.hud.clearHints();
    this.hud.tutCard(null);
    this.hud.handOff();
    this.renderer.particles.clear();
    this.renderer.popups.clear();
    (document.getElementById('field') as HTMLCanvasElement).classList.remove('over');
    this.summaryT = this.failT = this.overT = -1;
    this.recordRun = false;
    this.tutorial.stop();
    this.stats.runs++;
    saveJson('stats', this.stats);
    if (tutorial) {
      this.tutorial.start();
      this.hud.clearBanners();
      document.getElementById('btn-skip-tut')!.classList.add('show');
    } else {
      document.getElementById('btn-skip-tut')!.classList.remove('show');
      this.session.newRun(this.stage0);
      this.stage0 = 1;
    }
    this.hud.resetScore(this.session.score);
    this.hud.setStreak(0, 1, true);
    this.hud.setLives(this.session.lives, CONFIG.run.lives);
    this.hud.show(true, true);
    this.input.reset();
  }

  restart(): void {
    this.screens.showPause(false);
    this.paused = false;
    this.loop.resumeInstant();
    this.transition.run(() => this.beginRun(false));
  }

  again(): void {
    if (this.transition.busy) return;
    this.transition.run(() => this.beginRun(false));
  }

  goHome(): void {
    this.screens.showPause(false);
    this.screens.closeSettings();
    this.transition.run(() => {
      this.tutorial.stop();
      this.scene = 'title';
      this.paused = false;
      this.loop.resumeInstant();
      this.session.phase = 'idle';
      this.hud.show(false);
      this.hud.tutCard(null);
      this.hud.handOff();
      this.hud.clearBanners();
      this.hud.clearHints();
      this.screens.showResults(false);
      this.screens.showSummary(false);
      document.getElementById('btn-skip-tut')!.classList.remove('show');
      (document.getElementById('field') as HTMLCanvasElement).classList.remove('over');
      this.renderer.particles.clear();
      this.renderer.popups.clear();
      music.intensity = 0.4;
      this.screens.showTitle(true, this.best, this.bestStage);
    });
  }

  setPaused(p: boolean): void {
    if (this.scene !== 'playing' || p === this.paused) return;
    this.paused = p;
    this.input.reset();
    if (p) {
      const s = this.session;
      this.loop.setPaused(true);
      this.screens.showPause(true, { stage: s.stage, seal: String(2 ** s.cfg.sealLevel), seals: s.seals, quota: s.cfg.quota, score: s.score });
      sfx.grind();
    } else {
      this.screens.showPause(false);
      this.screens.closeSettings();
      this.loop.setPaused(false);
    }
  }

  private nextFromSummary(): void {
    if (this.session.phase !== 'summary' || this.session.failWait) return;
    this.screens.showSummary(false);
    this.summaryT = -1;
    this.autoNextT = 0;
    const cur = this.session.stage;
    const crossTemple = cur <= 12 && cur % 3 === 0;
    if (crossTemple) this.transition.run(() => this.session.proceed());
    else this.session.proceed();
  }

  private saveRecords(): void {
    const s = this.session;
    if (s.score > this.best) {
      this.best = s.score;
      this.recordRun = true;
      save('best', String(this.best));
    }
    this.stats.longestCascade = Math.max(this.stats.longestCascade, s.stats.longest);
    saveJson('stats', this.stats);
  }

  private showResults(): void {
    const s = this.session;
    this.saveRecords();
    this.stats.totalSeals += s.stats.seals;
    this.stats.total2048 += s.stats.seal2048;
    saveJson('stats', this.stats);
    this.scene = 'results';
    this.hud.clearBanners();
    (document.getElementById('field') as HTMLCanvasElement).classList.add('over');
    this.screens.showResults(true, {
      score: s.score, best: this.best, record: this.recordRun, stage: s.stage, longest: s.stats.longest, seals: s.stats.seals,
      merges: s.stats.merges, time: s.stats.time, seed: this.seeded ? this.seed : null,
    });
    music.intensity = 0.3;
  }

  // ───────────── 操作 ─────────────
  fireAt(x: number, y: number): boolean {
    if (!this.playable()) return false;
    const s = this.session;
    // 点击跳过：退潮/吞噬加速、小结直接继续
    if (s.phase === 'failing' || s.phase === 'retreat') {
      s.chain.skipMul = 3;
      return false;
    }
    if (s.phase === 'summary') {
      if (s.failWait) this.failT = Math.min(this.failT, 0.15);
      else if (this.autoNextT > 0) this.nextFromSummary();
      return false;
    }
    const a = Math.atan2(y - s.totemY, x - s.totemX);
    this.aim.angle = a;
    return s.fire(a);
  }

  setAutoplay(bot: { update(s: Session, dt: number): void } | null): void {
    this.bot = bot;
  }

  private tip(id: number): void {
    if (this.tutorial.active || this.scene !== 'playing') return;
    if (this.tips & (1 << id)) return;
    this.tips |= 1 << id;
    save('tips', String(this.tips));
    this.hud.hint(TIPS[id]!);
  }

  // ───────────── 循环 ─────────────
  private fixed(dt: number): void {
    if (this.scene !== 'playing') return;
    if (this.bot && this.session.phase !== 'summary') this.bot.update(this.session, dt);
    this.session.step(dt);
    this.tutorial.update(dt);
  }

  private updateAim(): void {
    const s = this.session;
    const inp = this.input;
    const a = this.aim;
    a.active = inp.active && this.playable();
    a.hover = !a.active && inp.hover && this.playable() && !inp.touch;
    a.touch = inp.touch;
    a.cancel = a.active && inp.overTotem;
    a.fx = inp.x;
    a.fy = inp.y;
    a.matchId = -1;
    a.valid = false;
    if (!(a.active || a.hover) || (s.phase !== 'live' && s.phase !== 'clearing')) return;
    const dx = inp.x - s.totemX, dy = inp.y - s.totemY;
    if (dx * dx + dy * dy > 16) a.angle = Math.atan2(dy, dx);
    a.valid = s.predict(a.angle, this.hit);
    if (!a.valid || this.hit.id < 0) return;
    const ch = s.chain;
    const i = this.hit.index;
    const t = ch.balls[i];
    if (!t) return;
    const wild = s.ammo.armed && s.ammo.wild > 0;
    const lv = wild ? t.level : s.ammo.current;
    if (t.level === lv) a.matchId = t.id;
    else if (this.hit.side === 0 && i > 0 && ch.connected(i - 1) && ch.balls[i - 1]!.level === lv) a.matchId = ch.balls[i - 1]!.id;
    else if (this.hit.side === 1 && i < ch.balls.length - 1 && ch.connected(i) && ch.balls[i + 1]!.level === lv) a.matchId = ch.balls[i + 1]!.id;
    if (a.matchId >= 0 && a.matchId !== this.feedback.lastAimMatch && a.active) sfx.tick();
    this.feedback.lastAimMatch = a.matchId;
  }

  private frame(dt: number): void {
    const s = this.session;
    if (this.scene === 'playing') {
      this.updateAim();
      if (!this.paused) {
        this.renderer.update(dt, s, this.aim);
        this.feedback.update(dt);
        this.hud.handSuppressed = this.aim.active;
        this.hud.update(dt, s.score, s.phase === 'live' || s.phase === 'clearing' ? s.chain.headProgress() : 0, s.dangerLevel >= 2 && s.phase === 'live');
        this.hud.setAmmo(s.ammo.next, s.ammo.wild, s.ammo.armed, true);
        this.hud.dimTut(this.aim.active);
        this.flowTimers(dt);
        this.contextTips(dt);
      }
      this.renderer.draw(s, this.aim, this.paused);
    } else if (this.scene === 'results') {
      this.renderer.update(dt, s, this.aim);
      this.renderer.draw(s, this.aim, true);
      if (this.screens.update(dt)) {
        sfx.gong(false);
        sfx.arpeggio(true, 6, 0.05, 0.1);
        this.renderer.particles.gold(300, 280, 300, 330, 60);
        this.renderer.addTrauma(CONFIG.fx.trauma.heavy);
      }
    } else {
      this.title.update(dt);
      this.renderer.update(dt, null, this.aim);
      this.renderer.drawTitle(this.title);
    }
    music.update(dt);
    this.desk.update(dt, !document.hidden);
    this.autoQuality(dt);
  }

  private flowTimers(dt: number): void {
    const s = this.session;
    if (this.summaryT >= 0) {
      this.summaryT -= dt;
      if (this.summaryT < 0 && this.pendingSummary) {
        this.screens.showSummary(true, this.pendingSummary);
        this.summaryT = -1;
        this.autoNextT = 2.6;
      }
    }
    if (this.autoNextT > 0) {
      this.autoNextT -= dt;
      if (this.autoNextT <= 0) this.nextFromSummary();
    }
    if (this.failT >= 0) {
      this.failT -= dt;
      if (this.failT < 0 && s.phase === 'summary' && s.failWait) s.proceed();
    }
    if (this.overT >= 0) {
      this.overT -= dt;
      if (this.overT < 0) this.showResults();
    }
  }

  private autoNextT = 0;

  private contextTips(dt: number): void {
    const s = this.session;
    if (this.tutorial.active || s.phase !== 'live') return;
    // 1. 升序阶梯（第 2 关起）
    this.stairT -= dt;
    if (s.stage >= 2 && this.stairT <= 0 && !(this.tips & 2)) {
      this.stairT = 0.5;
      const b = s.chain.balls;
      let run = 1;
      for (let i = b.length - 2; i >= 0; i--) {
        if (s.track.hittable(b[i]!.s) && s.chain.connected(i) && b[i]!.level === b[i + 1]!.level + 1) {
          if (++run >= 3) {
            this.tip(1);
            break;
          }
        } else run = 1;
      }
    }
    // 6. 手指压住命中点
    if (this.aim.active && this.aim.touch && this.hit.id >= 0 && Math.hypot(this.hit.x - this.aim.fx, this.hit.y - this.aim.fy) < 60) {
      this.coverT += dt;
      if (this.coverT > 0.6) this.tip(6);
    } else this.coverT = 0;
  }

  private autoQuality(dt: number): void {
    // 只看 JS 帧耗时；持续 2 s 偏高就降一档（docs §2.4）
    const ms = this.loop.frameMs;
    if (ms > 10 && this.quality > 0) {
      this.qualityT += dt;
      if (this.qualityT > 2) {
        this.quality = (this.quality - 1) as 0 | 1 | 2;
        this.qualityT = 0;
        this.renderer.particles.cap = [200, 400, 600][this.quality]!;
        this.renderer.lowFx = this.quality === 0;
      }
    } else this.qualityT = Math.max(0, this.qualityT - dt);
  }
}
