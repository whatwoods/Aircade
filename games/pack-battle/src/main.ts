// 入口：stage、字体（最多等 300ms，不阻塞）、系统初始化、主循环、失焦暂停、空闲预热
import './styles.css';
import { resumeAudio, suspendAudio, unlockAudio } from './audio/audio.ts';
import { updateMusic } from './audio/music.ts';
import { SHOP_POOL } from './config.ts';
import { cancelInput, initInput, input, setInputScale, updateInput } from './core/input.ts';
import { clock, resetClock, startLoop } from './core/loop.ts';
import { PHYS_H } from './core/spring.ts';
import type { PortraitId } from './game/types.ts';
import { setParticleCap, updateParticles } from './render/fx/particles.ts';
import { updatePopups } from './render/fx/popups.ts';
import { shake, updateShake } from './render/fx/shake.ts';
import { drawBlot, updateBlot } from './render/fx/transitions.ts';
import { initKit } from './render/kit.ts';
import { warmPortrait } from './render/portraits.ts';
import { warmItem } from './render/sprites.ts';
import { initStage, resizeStage, setGameTransform, setScreenTransform, stage } from './render/stage.ts';
import { stepWidgets, updateToast } from './render/ui/widgets.ts';
import { drawBackground } from './render/views/background.ts';
import { updateTweens } from './core/tween.ts';
import { EndingScene } from './scenes/endingScene.ts';
import { GameScene } from './scenes/gameScene.ts';
import { factories, setScene, sm } from './scenes/sceneManager.ts';
import { TitleScene } from './scenes/titleScene.ts';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const seedParam = params.get('seed');
const urlSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) : undefined;
const roundParam = Number(params.get('round') ?? '0');
const noTut = params.get('notut') === '1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
initStage(canvas);
initKit();
initInput(canvas);
setInputScale(stage.s);

factories.title = () => new TitleScene();
factories.game = (o) => new GameScene({ ...o, seed: o.seed ?? urlSeed, tutorial: !!o.tutorial && !noTut });
factories.ending = (d) => new EndingScene(d);

// 字体：最多等 300ms；加载完成后让文本缓存失效
try {
  const fonts = document.fonts;
  if (fonts && typeof fonts.load === 'function') {
    void Promise.all([fonts.load('700 56px "Kalam"'), fonts.load('400 20px "Patrick Hand"')])
      .then(() => {
        stage.version++;
      })
      .catch(() => undefined);
  }
} catch {
  /* 回退字体 */
}

// 首次手势解锁音频
const unlock = (): void => unlockAudio();
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

// 失焦 / 切后台：自动暂停、取消拖拽、挂起音频
const hide = (): void => {
  sm.cur?.autoPause();
  cancelInput();
  suspendAudio();
};
window.addEventListener('blur', hide);
window.addEventListener('focus', () => {
  resetClock();
  resumeAudio();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
  else {
    resetClock();
    resumeAudio();
  }
});
window.addEventListener('resize', () => {
  if (resizeStage()) setInputScale(stage.s);
});

// 空闲预热：每帧 ≤ 4ms 生成装备精灵与立牌
const warm: (() => void)[] = [];
for (const id of SHOP_POOL) warm.push(() => warmItem(id, 1));
for (const p of ['slime', 'goblin', 'spider', 'skeleton', 'ogre', 'rats', 'witch', 'knight', 'ranger', 'dragon'] as PortraitId[]) {
  warm.push(() => warmPortrait(p));
}
function runWarm(): void {
  const t0 = performance.now();
  while (warm.length && performance.now() - t0 < 4) warm.shift()!();
}

// 自适应画质：连续 2 秒平均帧间隔 > 18ms 且本帧 CPU 偏高 → 降 DPR、粒子减半
let slowAcc = 0;
let slowFrames = 0;
let slowSum = 0;
function adapt(): void {
  slowAcc += clock.raw;
  slowFrames++;
  slowSum += clock.raw;
  if (slowAcc < 2) return;
  const avg = slowSum / slowFrames;
  if (avg > 0.018 && clock.frameMs > 8 && stage.dprCap > 1) {
    stage.dprCap = Math.max(1, stage.dprCap - 0.25);
    setParticleCap(0.5);
    if (resizeStage()) setInputScale(stage.s);
  }
  slowAcc = slowSum = 0;
  slowFrames = 0;
}

let lastCursor = '';
function frame(): void {
  if (resizeStage()) setInputScale(stage.s);
  updateInput();
  const raw = clock.raw;
  updateShake(raw);
  updateBlot(raw);
  updateToast(raw);
  const s = sm.cur;
  // hitstop：冻结游戏时间（UI 照常）
  const dt = shake.stop > 0 ? 0 : clock.dt;
  if (s) {
    s.update(dt, raw);
    if (dt > 0) {
      for (let i = 0; i < clock.steps; i++) {
        stepWidgets(PHYS_H);
        s.step(PHYS_H);
      }
    } else for (let i = 0; i < clock.steps; i++) stepWidgets(PHYS_H);
  }
  updateTweens(dt);
  updateParticles(dt);
  updatePopups(dt);
  updateMusic();
  const ctx = stage.ctx;
  drawBackground(ctx, clock.real);
  setGameTransform(ctx);
  if (s) s.draw(ctx);
  setScreenTransform(ctx);
  drawBlot(ctx);
  if (s && !input.touch) {
    const c = s.cursor(input.hx, input.hy);
    if (c !== lastCursor) {
      lastCursor = c;
      canvas.style.cursor = c;
    }
  }
  if (warm.length && (!s || s.name === 'title' || clock.real > 3)) runWarm();
  adapt();
}

if (DEBUG) {
  void import('./debug/debug.ts').then((m) => {
    m.installDebug();
    if (roundParam >= 1 && roundParam <= 10) {
      const api = (window as unknown as { __game: { gotoRound: (n: number, b: string) => unknown } }).__game;
      api.gotoRound(roundParam, 'mid');
    }
  });
}

setScene(factories.title());
startLoop(frame);
