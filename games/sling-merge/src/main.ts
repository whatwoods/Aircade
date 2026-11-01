/**
 * 启动（docs §6.1 / §7）：字体注册、存档读取、舞台布局、创建各系统、开启主循环；
 * 场景流转（标题 ⇄ 游戏 ⇄ 结算，汽水浪涌转场）、暂停与自动暂停、设置、URL 参数。
 */
import './ui/styles.css';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import fredoka700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';
import type { App, QualityApi } from './app';
import { AudioEngine } from './audio/audio';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { Debug, DEBUG, urlParam } from './core/debug';
import { bus } from './core/events';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { Stage } from './core/stage';
import { loadJson, remove, saveJson, type Settings } from './core/storage';
import { Feedback } from './fx/feedback';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';

// ───────────── 字体（Fredoka 600/700，仅 latin 子集） ─────────────
function loadFonts(): void {
  try {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    const faces = [
      new FontFace('Fredoka', `url(${fredoka600}) format("woff2")`, { weight: '600', display: 'swap' }),
      new FontFace('Fredoka', `url(${fredoka700}) format("woff2")`, { weight: '700 900', display: 'swap' }),
    ];
    for (const f of faces) {
      document.fonts.add(f);
      f.load().catch(() => undefined);
    }
  } catch {
    /* 回退字体栈 */
  }
}
loadFonts();

// ───────────── 存档与参数 ─────────────
const settings = loadJson<Settings>('settings', { sfx: true, music: true, vibration: true, shake: true });
const vibrationSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const pTutorial = urlParam('tutorial');
const pScene = urlParam('scene');
const pMute = urlParam('mute') === '1';
const pQuality = urlParam('quality');

// ───────────── 系统 ─────────────
const stage = new Stage();
const game = new Game();
const audio = new AudioEngine();
audio.sfxOn = settings.sfx;
audio.musicOn = settings.music;
audio.forcedMute = pMute;
const sfx = new Sfx(audio);
const music = new Music(audio);

let hiddenStop = false;
const loop = new Loop(
  (dt) => game.fixedStep(dt),
  (f) => {
    debug.frame(f.realDt);
    feedback.update(f.realDt, f.gameDt);
    ui.update(f.realDt);
    renderer.frame(f, loop.paused, deskActive());
  },
);
const renderer = new Renderer(stage, game, loop);
const feedback = new Feedback(game, renderer, loop, sfx, music, audio);
feedback.vibration = settings.vibration && vibrationSupported;
feedback.setShake(settings.shake);
renderer.onQualityChange = () => feedback.refresh();

function deskActive(): boolean {
  try {
    return !document.hidden && document.hasFocus();
  } catch {
    return true;
  }
}

const quality: QualityApi = {
  get level() {
    return renderer.quality;
  },
  get locked() {
    return renderer.qualityLocked;
  },
  set(level: number, lock = true) {
    renderer.setQuality(level, lock);
    feedback.refresh();
  },
};
if (pQuality !== null && /^[0-3]$/.test(pQuality)) quality.set(Number(pQuality), true);

// ───────────── 场景流转 ─────────────
function tutorialFor(want: boolean): boolean {
  if (pTutorial === '1') return true;
  if (pTutorial === '0') return false;
  return want;
}

function resetLoopFx(): void {
  loop.resumeInstant();
  loop.cancelEffects();
  audio.setPausedDuck(false);
}

function withTransition(fn: () => void): void {
  if (renderer.transition.busy) return;
  input.cancel();
  sfx.transition();
  renderer.transition.start(fn);
}

function startRun(tutorial: boolean, transition: boolean): void {
  const go = (): void => {
    resetLoopFx();
    ui.onScene('playing');
    game.startRun(tutorialFor(tutorial));
  };
  if (transition) {
    ui.title.leaving();
    withTransition(go);
  } else {
    go();
  }
}

function toTitle(transition: boolean): void {
  const go = (): void => {
    resetLoopFx();
    ui.onScene('title');
    game.startTitle();
  };
  if (transition) withTransition(go);
  else go();
}

function pause(panel = true): void {
  if (loop.paused) {
    if (panel && !ui.pausePanel.isOpen && game.scene === 'playing') ui.showPause();
    return;
  }
  input.cancel();
  sfx.stopTension();
  loop.setPaused(true);
  audio.setPausedDuck(true);
  if (panel) ui.showPause();
}

function resume(): void {
  ui.hidePause();
  if (!loop.paused) return;
  loop.setPaused(false);
  audio.setPausedDuck(false);
}

// ───────────── UI ─────────────
const ui = new UI({
  game,
  sprites: renderer.sprites,
  settings,
  vibrationSupported,
  busy: () => renderer.transition.busy,
  isPaused: () => loop.paused,
  start: (t) => startRun(t, true),
  toTitle: () => toTitle(true),
  pause: () => {
    if (game.scene === 'playing') pause(true);
  },
  resume,
  changeSetting(key, on) {
    settings[key] = on;
    saveJson('settings', settings);
    if (key === 'sfx') audio.setSfx(on);
    else if (key === 'music') audio.setMusic(on);
    else if (key === 'vibration') {
      feedback.vibration = on && vibrationSupported;
      if (on) feedback.vibrate(15);
    } else if (key === 'shake') feedback.setShake(on);
  },
  replayTutorial() {
    remove('tutorialDone');
    remove('tips');
    game.tutorial.resetTips();
  },
  clearBest() {
    game.best = 0;
    remove('best');
  },
  skipTutorial() {
    game.tutorial.skip();
  },
  sfxButton: () => sfx.button(),
  sfxToggle: (on) => sfx.toggle(on),
  sfxRoll: () => sfx.roll(),
  onRecordStamp() {
    sfx.recordBell();
    renderer.hud.onBestBump();
    feedback.vibrate([20, 30, 20]);
  },
});

bus.on((e) => {
  if (e.t === 'scene' && e.scene === 'results') {
    if (!ui.results.isOpen) ui.showResults();
  } else if (e.t === 'tip') {
    ui.tip(e.text, e.x, e.y);
  } else if (e.t === 'gameOver') {
    ui.tutorial.hideAll();
  }
});

// ───────────── 输入 ─────────────
const input = new Input(stage, game, {
  canAim: () => !loop.paused && !ui.overlayOpen && !renderer.transition.busy && game.canAim(),
  onGesture: () => audio.unlock(),
});

// 音频解锁：在所有能产生用户激活的事件里尝试（触屏的 pointerdown 不算激活）
const tryUnlock = (): void => audio.unlock();
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, tryUnlock, { capture: true, passive: true });
}

// ───────────── 自动暂停（失焦 / 隐藏） ─────────────
function autoPause(): void {
  if (game.scene === 'playing' && !renderer.transition.busy) pause(true);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    autoPause();
    hiddenStop = true;
    loop.stop();
    music.setHidden(true);
    audio.suspend();
  } else if (hiddenStop) {
    hiddenStop = false;
    loop.start();
    music.setHidden(false);
    audio.resume();
  }
});
window.addEventListener('blur', autoPause);
window.addEventListener('pagehide', autoPause);

// ───────────── 调试 ─────────────
const app: App = {
  game,
  loop,
  stage,
  input,
  renderer,
  quality,
  startRun,
  toTitle,
  showResults: () => {
    if (!ui.results.isOpen) ui.showResults();
  },
  pause: (panel = true) => pause(panel),
  resume,
  isPaused: () => loop.paused,
  fps: () => debug.fps,
};
const debug = new Debug(app);

// ───────────── 启动 ─────────────
if (pScene === 'game') {
  startRun(!game.tutorialDone, false);
} else {
  ui.onScene('title');
  game.startTitle();
}
loop.start();
if (DEBUG) document.documentElement.classList.add('debug');
