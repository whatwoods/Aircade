/**
 * DOM 浮层管理（docs §6）：标题 / 暂停 / 设置 / 结算 / 引导卡片 / 游戏中按钮（暂停、跳过引导）；
 * 焦点与键盘（Esc/P 暂停，Enter 开始/继续/确认，R 再来一局）；按钮音效委托。
 */
import type { Settings } from '../core/storage';
import type { Game } from '../game/game';
import type { Sprites } from '../render/sprites';
import { ICON } from './icons';
import { PausePanel } from './pause';
import { ResultsPanel } from './results';
import { SettingsPanel } from './settings';
import { TitleScreen } from './title';
import { TutorialCard } from './tutorialCard';

export interface UiHost {
  game: Game;
  sprites: Sprites;
  settings: Settings;
  vibrationSupported: boolean;
  /** 转场进行中（按钮暂不响应） */
  busy(): boolean;
  isPaused(): boolean;
  start(tutorial: boolean): void;
  toTitle(): void;
  pause(): void;
  resume(): void;
  changeSetting(key: keyof Settings, on: boolean): void;
  replayTutorial(): void;
  clearBest(): void;
  skipTutorial(): void;
  sfxButton(): void;
  sfxToggle(on: boolean): void;
  sfxRoll(): void;
  onRecordStamp(): void;
}

export class UI {
  readonly root: HTMLElement;
  readonly title: TitleScreen;
  readonly pausePanel: PausePanel;
  readonly settingsPanel: SettingsPanel;
  readonly results: ResultsPanel;
  readonly tutorial: TutorialCard;
  private host: UiHost;
  private btnPause: HTMLButtonElement;
  private btnSkip: HTMLButtonElement;
  private pauseShown = false;
  private skipShown = false;
  /** 下一局强制引导（标题「玩法」/ 设置「重看」） */
  forceTutorial = false;

  constructor(host: UiHost) {
    this.host = host;
    const h = host;
    this.root = document.getElementById('ui')!;
    const root = this.root;
    const guard = (f: () => void) => () => {
      if (!h.busy()) f();
    };

    this.title = new TitleScreen({
      start: guard(() => h.start(this.forceTutorial || !h.game.tutorialDone)),
      settings: guard(() => this.openSettings()),
      howto: guard(() => h.start(true)),
    });

    // 游戏中按钮
    this.btnPause = document.createElement('button');
    this.btnPause.type = 'button';
    this.btnPause.id = 'btn-pause';
    this.btnPause.className = 'hud-btn hidden';
    this.btnPause.setAttribute('aria-label', '暂停');
    this.btnPause.innerHTML = ICON.pause;
    this.btnPause.addEventListener('click', guard(() => h.pause()));
    this.btnSkip = document.createElement('button');
    this.btnSkip.type = 'button';
    this.btnSkip.id = 'btn-skip';
    this.btnSkip.className = 'hud-btn hidden';
    this.btnSkip.innerHTML = `<span>跳过引导</span>${ICON.skip}`;
    this.btnSkip.addEventListener('click', () => h.skipTutorial());
    root.append(this.btnPause, this.btnSkip);

    this.tutorial = new TutorialCard(root, h.game);

    this.pausePanel = new PausePanel(root, h.game, h.sprites, {
      resume: guard(() => h.resume()),
      restart: guard(() => h.start(this.forceTutorial || !h.game.tutorialDone)),
      settings: guard(() => this.openSettings()),
      home: guard(() => h.toTitle()),
    });
    this.results = new ResultsPanel(root, h.game, h.sprites, {
      again: guard(() => h.start(this.forceTutorial || !h.game.tutorialDone)),
      home: guard(() => h.toTitle()),
      roll: () => h.sfxRoll(),
      record: () => h.onRecordStamp(),
    });
    this.settingsPanel = new SettingsPanel(root, h.settings, h.vibrationSupported, {
      change: (k, on) => {
        h.changeSetting(k, on);
        h.sfxToggle(on);
      },
      replayTutorial: () => {
        this.forceTutorial = true;
        h.replayTutorial();
      },
      clearBest: () => {
        h.clearBest();
        this.title.setBest(0);
      },
      done: () => this.closeSettings(),
      click: () => undefined,
    });

    // 按钮音效（开关除外，开关有自己的音）
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      const b = t?.closest?.('button');
      if (b && !b.classList.contains('tog')) h.sfxButton();
    });
    // 结算：点击分数跳过滚动
    this.results.el.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('button')) this.results.finish();
    });
    window.addEventListener('keydown', this.onKey);
    // iOS :active 需要 touchstart 监听
    document.addEventListener('touchstart', () => undefined, { passive: true });
  }

  get overlayOpen(): boolean {
    return this.pausePanel.isOpen || this.settingsPanel.isOpen || this.results.isOpen;
  }

  // ───────────── 浮层 ─────────────

  showPause(): void {
    this.pausePanel.open();
  }

  hidePause(): void {
    if (this.settingsPanel.isOpen) this.settingsPanel.hide();
    this.pausePanel.hide();
  }

  openSettings(): void {
    this.settingsPanel.open();
  }

  closeSettings(): void {
    this.settingsPanel.hide();
    // 焦点还给下层
    const back = this.pausePanel.isOpen ? this.pausePanel.btnContinue : this.title.visible ? this.title.btnStart : null;
    if (back) {
      try {
        back.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  showResults(): void {
    this.results.open();
  }

  /** 场景切换（转场中点调用） */
  onScene(scene: string): void {
    const stage = document.getElementById('stage');
    stage?.classList.toggle('playing', scene === 'playing');
    if (scene === 'title') {
      this.title.show(this.host.game.best);
      this.pausePanel.hide(true);
      this.settingsPanel.hide(true);
      this.results.close(true);
      this.tutorial.hideAll();
    } else if (scene === 'playing') {
      this.title.hide();
      this.pausePanel.hide(true);
      this.settingsPanel.hide(true);
      this.results.close(true);
      this.tutorial.hideAll();
    }
    if (scene === 'playing') this.forceTutorial = false;
  }

  tip(text: string, x: number, y: number): void {
    this.tutorial.tip(text, x, y);
  }

  // ───────────── 每帧 ─────────────

  update(realDt: number): void {
    const g = this.host.game;
    const paused = this.host.isPaused();
    const playing = g.scene === 'playing';
    const showPause = playing && !this.results.isOpen;
    if (showPause !== this.pauseShown) {
      this.pauseShown = showPause;
      this.btnPause.classList.toggle('hidden', !showPause);
    }
    const showSkip = playing && g.tutorial.active;
    if (showSkip !== this.skipShown) {
      this.skipShown = showSkip;
      this.btnSkip.classList.toggle('hidden', !showSkip);
    }
    this.tutorial.update(realDt, paused || this.overlayOpen);
    this.settingsPanel.update(realDt);
    this.results.update(realDt);
  }

  // ───────────── 键盘 ─────────────

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const h = this.host;
    const g = h.game;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'Escape' || lower === 'p') {
      if (this.settingsPanel.isOpen) {
        this.closeSettings();
        e.preventDefault();
        return;
      }
      if (h.busy()) return;
      if (g.scene === 'playing') {
        if (h.isPaused()) h.resume();
        else h.pause();
        e.preventDefault();
      }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      // 焦点在按钮上时交给浏览器原生触发，避免重复
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae.tagName === 'BUTTON' && this.root.contains(ae)) return;
      if (k === ' ') return;
      if (h.busy()) return;
      e.preventDefault();
      if (this.settingsPanel.isOpen) this.closeSettings();
      else if (this.results.isOpen) h.start(this.forceTutorial || !g.tutorialDone);
      else if (this.pausePanel.isOpen) h.resume();
      else if (g.scene === 'title') h.start(this.forceTutorial || !g.tutorialDone);
      return;
    }
    if (lower === 'r' && this.results.isOpen && !h.busy()) {
      e.preventDefault();
      h.start(this.forceTutorial || !g.tutorialDone);
    }
  };
}

