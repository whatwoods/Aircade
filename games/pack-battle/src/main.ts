// 入口：stage、字体（最多等 300ms，不阻塞）、系统初始化、主循环、失焦暂停、空闲预热
import './styles.css';
import { resumeAudio, suspendAudio, unlockAudio } from './audio/audio.ts';
import { updateMusic } from './audio/music.ts';
import { QUALITY, SHOP_POOL } from './config.ts';
import { filmClock, now } from './platform/now.ts';
import { adPlaying, initAds } from './platform/ads.ts';
import { bootOnFirstDraw, claimCanvas } from './platform/yoola/render.ts';
import { kw } from './platform/yoola/kwai.ts';
import { initTouchInput } from './platform/yoola/touch.ts';
import { cancelInput, initInput, input, setInputScale, updateInput } from './core/input.ts';
import { clock, resetClock, startLoop } from './core/loop.ts';
import { PHYS_H } from './core/spring.ts';
import type { PortraitId } from './game/types.ts';
import { setParticleCap, updateParticles } from './render/fx/particles.ts';
import { updatePopups } from './render/fx/popups.ts';
import { shake, updateShake } from './render/fx/shake.ts';
import { blot, drawBlot, updateBlot } from './render/fx/transitions.ts';
import { initKit } from './render/kit.ts';
import { warmPortrait } from './render/portraits.ts';
import { warmItem } from './render/sprites.ts';
import { initStage, resizeStage, setGameTransform, setScreenTransform, stage } from './render/stage.ts';
import { makeCanvas, textCacheEpoch } from './render/text.ts';
import { stepWidgets, updateToast } from './render/ui/widgets.ts';
import { drawBackground } from './render/views/background.ts';
import { updateTweens } from './core/tween.ts';
import { EndingScene } from './scenes/endingScene.ts';
import { GameScene } from './scenes/gameScene.ts';
import { factories, setScene, sm } from './scenes/sceneManager.ts';
import { TitleScene } from './scenes/titleScene.ts';
import { warmPanels, type Panel } from './scenes/overlays.ts';

// TapTap / 快手版不接受任何调试参数
// 快手运行时没有 URLSearchParams，必须在构造之前就短路
const params: { get(k: string): string | null } =
  import.meta.env.MODE === 'tap' || __YOOLA__ ? { get: () => null } : new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const seedParam = params.get('seed');
const urlSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) : undefined;
const roundParam = Number(params.get('round') ?? '0');
const noTut = params.get('notut') === '1';

// 快手端：先占住 2D 上下文（main.js 加载时会抢 webgl），整个启动推迟到第一次 draw
const claimed = __YOOLA__ ? claimCanvas() : null;
const canvas = claimed ? claimed.canvas : (document.getElementById('game') as HTMLCanvasElement);

function boot(): void {
  initStage(canvas, claimed?.ctx);
  initKit();
  if (__YOOLA__) initTouchInput(canvas);
  else initInput(canvas);
  setInputScale(stage.s);

  factories.title = () => new TitleScene();
  factories.game = (o) => new GameScene({ ...o, seed: o.seed ?? urlSeed, tutorial: !!o.tutorial && !noTut });
  factories.ending = (d) => new EndingScene(d);
  void initAds();

  // 字体：最多等 300ms；加载完成后让文本缓存失效（快手端字体在 platform/yoola/fonts.ts 里加载）
  if (!__YOOLA__) {
    try {
      const fonts = document.fonts;
      if (fonts && typeof fonts.load === 'function') {
        void Promise.all([fonts.load('700 56px "Kalam"'), fonts.load('400 20px "Patrick Hand"'), fonts.load('400 80px "Title Brush"')])
          .then(() => {
            stage.version++;
          })
          .catch(() => undefined);
      }
    } catch {
      /* 回退字体 */
    }
  }

  // 首次手势解锁音频（快手不需要）
  if (!__YOOLA__) {
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // 失焦 / 切后台：自动暂停、取消拖拽、挂起音频
  const hide = (): void => {
    if (adPlaying()) return;
    sm.cur?.autoPause();
    cancelInput();
    suspendAudio();
  };
  const show = (): void => {
    if (adPlaying()) return;
    resetClock();
    resumeAudio();
  };
  if (__YOOLA__) {
    // 快手：前后台切换走 KwaiBase.onHide / onShow
    kw().KwaiBase.onHide(hide);
    kw().KwaiBase.onShow(show);
  } else {
    window.addEventListener('blur', hide);
    window.addEventListener('focus', show);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      else show();
    });
    window.addEventListener('resize', () => {
      if (resizeStage()) setInputScale(stage.s);
    });
  }

  // 空闲预热：每帧 ≤ 4ms 生成装备精灵与立牌
  const warm: (() => void)[] = [];
  for (const id of SHOP_POOL) warm.push(() => warmItem(id, 1));
  for (const p of ['slime', 'goblin', 'spider', 'skeleton', 'ogre', 'rats', 'witch', 'knight', 'ranger', 'dragon'] as PortraitId[]) {
    // 立牌分 15 步生成；没做完就把自己放回队首，下一帧接着做
    const task = (): void => {
      if (!warmPortrait(p)) warm.unshift(task);
    };
    warm.push(task);
  }
  // 面板预热：弹窗的纸面、按钮、文字精灵第一次画时才真正光栅化（文字第二次用到才缓存），
  // 不预热的话会落在弹出动画的头两帧里，手机上整段动画卡一下。
  // 每帧在背景之前把一个面板画两遍，随后背景整屏盖住，看不到；DPR 或字体变化（stage.version）、
  // 文字缓存淘汰过精灵之后重来
  let panelKey = '';
  let panelQ: (() => Panel)[] = [];
  function warmPanel(ctx: CanvasRenderingContext2D): void {
    const key = stage.version + '/' + textCacheEpoch();
    if (panelKey !== key) {
      panelKey = key;
      panelQ = warmPanels(stage.H);
    }
    if (!panelQ.length || warm.length || clock.real < 1.5) return;
    const p = panelQ.shift()!();
    setGameTransform(ctx);
    p.drawBody(ctx, 0, 0);
    p.drawBody(ctx, 0, 0);
  }

  /** 弹窗底图（见 frame()） */
  let frozen: HTMLCanvasElement | null = null;
  let frozenKey = '';

  function runWarm(): void {
    const t0 = now();
    while (warm.length && (filmClock.on || now() - t0 < 4)) warm.shift()!();
  }

  // 自适应画质：连续 2 秒平均帧间隔 > 18ms 且本帧 CPU 偏高 → 粒子减半，DPR 降一档。
  // 换 DPR 要改画布尺寸、重建所有缓存，快手上会闪一下「放大再恢复」，所以只在墨渍转场盖满屏幕时换；
  // 启动预热（每帧 ≤ 4ms 生成精灵）算在帧耗时里，预热没跑完不计，免得一开局就误判
  let slowAcc = 0;
  let slowFrames = 0;
  let slowSum = 0;
  let pendingCap = 0;
  function adapt(): void {
    if (pendingCap && blot.active && blot.phase === 1 && blot.t < 0.12) {
      stage.dprCap = pendingCap;
      pendingCap = 0;
      if (resizeStage()) setInputScale(stage.s);
    }
    if (warm.length) {
      slowAcc = slowSum = 0;
      slowFrames = 0;
      return;
    }
    slowAcc += clock.raw;
    slowFrames++;
    slowSum += clock.raw;
    if (slowAcc < 2) return;
    const avg = slowSum / slowFrames;
    const cap = pendingCap || stage.dprCap;
    if (avg > 0.018 && clock.frameMs > 8 && cap > QUALITY.minDpr) {
      setParticleCap(0.5);
      pendingCap = Math.max(QUALITY.minDpr, cap - 0.5);
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
    warmPanel(ctx);
    if (s?.freezeUnder?.() && s.drawOverlays) {
      // 弹窗打开期间：背景 + 场景只画一次进离屏图，之后每帧贴图 + 画弹窗。
      // 软件光栅的手机上，标题页（暖光、摆动横幅、行囊缩放）一帧就要 6ms 以上，再叠弹窗动画掉到 30 帧
      const W = stage.canvas.width;
      const Hc = stage.canvas.height;
      const key = stage.version + '/' + W + 'x' + Hc;
      if (!frozen || frozenKey !== key) {
        if (!frozen || frozen.width !== W || frozen.height !== Hc) frozen = makeCanvas(W, Hc)[0];
        const fctx = frozen.getContext('2d')!;
        drawBackground(fctx, clock.real);
        setGameTransform(fctx);
        s.draw(fctx, false);
        frozenKey = key;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(frozen, 0, 0);
      setGameTransform(ctx);
      s.drawOverlays(ctx);
    } else {
      frozenKey = '';
      drawBackground(ctx, clock.real);
      setGameTransform(ctx);
      if (s) s.draw(ctx);
    }
    setScreenTransform(ctx);
    drawBlot(ctx);
    if (s && !input.touch) {
      const c = s.cursor(input.hx, input.hy);
      if (!__YOOLA__ && c !== lastCursor) {
        lastCursor = c;
        canvas.style.cursor = c;
      }
    }
    if (warm.length && (!s || s.name === 'title' || clock.real > 3)) runWarm();
    adapt();
  }

  if (import.meta.env.MODE !== 'tap' && !__YOOLA__ && DEBUG) {
    void import('./debug/debug.ts').then((m) => {
      m.installDebug();
      if (params.get('film') === '1') void import('./debug/film.ts').then((f) => f.installFilm());
      if (roundParam >= 1 && roundParam <= 10) {
        const api = (window as unknown as { __game: { gotoRound: (n: number, b: string) => unknown } }).__game;
        api.gotoRound(roundParam, 'mid');
      }
    });
  }

  setScene(factories.title());
  startLoop(frame);
}

if (__YOOLA__) bootOnFirstDraw(boot);
else boot();
