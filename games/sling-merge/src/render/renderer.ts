/**
 * 渲染总管（docs §2.5 / §4.6 / §4.8 / §5.1 / §9）：分层绘制、相机（trauma、缩放冲击）、插值、
 * 水果绘制变换 T·M·S·R（高光去掉 R）、拖尾、残影、标题吉祥物、危险/引导/预测高亮、碰撞框、质量档。
 */
import type { RendererApi } from '../app';
import { CONFIG, fruitDef } from '../config';
import type { FrameInfo, Loop } from '../core/loop';
import { rngFx } from '../core/rng';
import type { Stage, StageMetrics } from '../core/stage';
import { makeVis, type Expression, type Fruit, type FruitVis } from '../game/fruits';
import type { Game } from '../game/game';
import { Background } from './background';
import { resolveExpr, stepBlink, stepWink, updateFruitVisuals, type VisHooks } from './deform';
import { drawFace, drawIdleFace, type FaceState } from './faces';
import { Hud } from './hud';
import { Jar } from './jar';
import {
  C_GOLD, C_WHITE, P_HEART, P_SPARKLE, P_SWEAT, P_TEAR, P_ZZZ, Particles,
} from './particles';
import { candyText, Popups } from './popups';
import { SlingView, type FruitPainter } from './slingView';
import { Sprites, type Sprite } from './sprites';
import { Trajectory } from './trajectory';
import { Transition } from './transition';
import { ctx2d, hexA, makeCanvas } from './util';

const TAU = Math.PI * 2;
const W = CONFIG.layout.stageW;
const H = CONFIG.layout.stageH;
const FX = CONFIG.fx;
const DEG = Math.PI / 180;

const TRAIL_COL: string[] = [];
for (let l = 1; l <= CONFIG.maxLevel; l++) TRAIL_COL.push(hexA(fruitDef(l).colors.juice, 0.35));
const DASH = [7, 6];
const NODASH: number[] = [];

export class Renderer implements RendererApi, FruitPainter {
  hitboxes = false;
  readonly sprites = new Sprites();
  readonly particles: Particles;
  readonly popups = new Popups();
  readonly jar = new Jar();
  readonly sling = new SlingView();
  readonly traj = new Trajectory();
  readonly hud: Hud;
  readonly bg: Background;
  readonly transition = new Transition();
  private stage: Stage;
  private game: Game;
  private loop: Loop;
  private ctx: CanvasRenderingContext2D;

  // 相机
  private trauma = 0;
  shakeEnabled = true;
  private ph1 = rngFx.next() * TAU;
  private ph2 = rngFx.next() * TAU;
  private ph3 = rngFx.next() * TAU;
  private punch = 0;
  private hold = 0;
  private holdV = 0;
  private holdTarget = 0;
  private holdT = 0;
  private focusX = W / 2;
  private focusY = H / 2;
  private flashA = 0;
  private flashDecay = 0;
  private realT = 0;
  private gameT = 0;

  // 质量
  quality = 3;
  qualityLocked = false;
  private qAcc = 0;
  private qSum = 0;
  private qN = 0;
  private qGood = 0;
  private qInt = 0;
  private ivMax = 0;
  private qClock = 0;
  private qSkip = 0;
  private probeIv = 0;
  private probeFrom = 0;
  private downCool = 0;
  private downCoolDur = 30;
  private upBlock = 0;
  private upBlockDur = 30;
  onQualityChange: ((level: number) => void) | null = null;

  // 危险
  private vignette = 0;
  private dangerPhase = 0;
  private lineShow = 0;

  // 标题吉祥物
  private mascotVis: FruitVis = makeVis(0.1);
  private mascotA = 0;
  private mascotOpen = 1;

  // 王冠掉落（首个彩虹西瓜）
  crownDropId = -1;
  crownDropT = 9;

  private face: FaceState = { expr: 'idle', lookX: 0, lookY: 0, open: 1, wink: false, t: 0, blush: 1 };
  private hooks: VisHooks;
  private visDt = 0;

  constructor(stage: Stage, game: Game, loop: Loop) {
    this.stage = stage;
    this.game = game;
    this.loop = loop;
    this.ctx = stage.ctx;
    this.particles = new Particles(this.sprites);
    this.hud = new Hud(this.sprites);
    this.bg = new Background(this.sprites);
    const P = this.particles;
    this.hooks = {
      heart: (x, y) => {
        P.spawn(P_HEART, C_GOLD, x + (rngFx.next() - 0.5) * 6, y, (rngFx.next() - 0.5) * 20, -30, 0.9, 9, 1.5, -40);
      },
      zzz: (x, y, r) => {
        P.spawn(P_ZZZ, C_WHITE, x, y, 10, -14 - r * 0.1, 1.6, 10, 0.5, -6);
      },
      sweat: (x, y, r) => {
        const s = rngFx.next() < 0.5 ? -1 : 1;
        P.spawn(P_SWEAT, C_WHITE, x + s * r * 0.75, y - r * 0.35, s * (40 + rngFx.next() * 40), -60, 0.5, 6 + r * 0.05, 1, 260);
      },
      tear: (x, y, r) => {
        const s = rngFx.next() < 0.5 ? -1 : 1;
        P.spawn(P_TEAR, C_WHITE, x + s * r * 0.3, y + r * 0.2, s * 20, 10, 0.8, 5 + r * 0.04, 1, 160);
      },
      glint: (x, y, r) => {
        const a = rngFx.next() * TAU;
        const d = rngFx.next() * r * 0.8;
        P.spawn(P_SPARKLE, C_WHITE, x + Math.cos(a) * d, y + Math.sin(a) * d, 0, 0, 0.5, 9, 0, 0);
      },
    };
    this.mascotVis.lookY = 0.2;
    stage.onResize((m) => this.resize(m));
    this.resize(stage.m);
  }

  private resize(m: StageMetrics): void {
    const r = m.pxRatio;
    const rebuilt = this.sprites.setRatio(r);
    this.jar.build(r);
    this.sling.build(r);
    this.traj.build(r);
    this.bg.build(r);
    this.bg.markDirty();
    if (rebuilt) this.sprites.warm([1, 2, 3, 4, 5, 6, 7, 11]);
  }

  particleCount(): number {
    return this.particles.count;
  }

  // ───────────── 反馈接口（fx/feedback 调用） ─────────────

  addTrauma(t: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + t);
  }

  zoomPunch(z: number, x: number, y: number): void {
    if (!this.shakeEnabled || z <= 0) return;
    this.punch = Math.max(this.punch, z);
    this.focusX = x;
    this.focusY = y;
  }

  /** 镜头推近并保持（高潮慢动作） */
  zoomHold(z: number, x: number, y: number, dur: number): void {
    if (!this.shakeEnabled) return;
    this.holdTarget = z;
    this.holdT = dur;
    this.focusX = x;
    this.focusY = y;
  }

  flash(a: number, dur = 0.07): void {
    if (!this.shakeEnabled || a <= 0) return;
    this.flashA = Math.max(this.flashA, a);
    this.flashDecay = a / dur;
  }

  resetEffects(): void {
    this.trauma = 0;
    this.punch = 0;
    this.hold = 0;
    this.holdV = 0;
    this.holdTarget = 0;
    this.flashA = 0;
  }

  setQuality(level: number, lock = false): void {
    const q = Math.max(0, Math.min(3, level | 0));
    if (lock) this.qualityLocked = true;
    if (q === this.quality) return;
    this.quality = q;
    this.jar.refractionOn = q >= 3;
    this.jar.causticsOn = q >= 3;
    this.jar.bubbleCount = q === 0 ? 14 : 28;
    this.particles.mul = q <= 1 ? 0.6 : 1;
    this.bg.animate = q > 0;
    this.stage.dprCap = q >= 2 ? 2 : q === 1 ? 1.5 : 1;
    this.stage.layout();
    this.onQualityChange?.(q);
  }

  /**
   * 自动质量档（docs §9.7）：每 2 s 看一次平均 JS 帧耗时与平均帧间隔。
   * 帧间隔能反映光栅化 / 合成的开销（JS 计时看不到），但刷新率被系统限到 30Hz 时降档也没用：
   * 因此「只有间隔慢」的降档是一次探测，下个窗口间隔没改善 10% 就退回，并冷却后再试。
   * 因帧间隔降过的档，升回去前要等一段（30 s 起，每次翻倍），避免来回抖。
   */
  private autoQuality(realDt: number): void {
    if (this.qualityLocked || this.loop.paused) return;
    this.qClock += realDt;
    if (this.qSkip > 0) {
      this.qSkip -= realDt;
      return;
    }
    this.qAcc += realDt;
    this.qSum += this.loop.frameMs;
    this.qInt += realDt * 1000;
    if (realDt * 1000 > this.ivMax) this.ivMax = realDt * 1000;
    this.qN++;
    if (this.qAcc < CONFIG.quality.window) return;
    const n = Math.max(1, this.qN);
    const js = this.qSum / n;
    const iv = this.qInt / n;
    this.qAcc = 0;
    this.qSum = 0;
    this.qInt = 0;
    this.qN = 0;
    const ivMax = this.ivMax;
    this.ivMax = 0;
    const Q = CONFIG.quality;
    if (this.probeIv > 0) {
      // 探测中：间隔改善 ≥10% 就停在这一档；否则继续往下试，到底仍没改善就退回起点并冷却
      const before = this.probeIv;
      if (iv <= before * 0.9) {
        this.probeIv = 0;
      } else if (this.quality > 0 && js <= Q.downMs) {
        this.probeIv = iv;
        this.changeAuto(this.quality - 1);
        return;
      } else {
        this.probeIv = 0;
        this.downCool = this.qClock + this.downCoolDur;
        this.downCoolDur = Math.min(300, this.downCoolDur * 2);
        if (this.probeFrom > this.quality) this.changeAuto(this.probeFrom);
        return;
      }
    }
    const jsSlow = js > Q.downMs;
    // 帧间隔稳定在 ~33.3 ms 且 JS 很轻：多半是系统把刷新率限到了 30Hz（如低电量模式），降档无益
    const capped30 = Math.abs(iv - 33.33) < 1.5 && js < 8 && ivMax < 40;
    const ivSlow = iv > Q.downMs && !capped30 && this.qClock >= this.downCool;
    if ((jsSlow || ivSlow) && this.quality > 0) {
      this.qGood = 0;
      if (!jsSlow) {
        this.probeIv = iv;
        this.probeFrom = this.quality;
      }
      this.upBlock = this.qClock + this.upBlockDur;
      this.upBlockDur = Math.min(240, this.upBlockDur * 2);
      this.changeAuto(this.quality - 1);
    } else if (js < Q.upMs && iv < Q.downMs && this.quality < 3 && this.qClock >= this.upBlock) {
      this.qGood += Q.window;
      if (this.qGood >= Q.upHold) {
        this.qGood = 0;
        this.changeAuto(this.quality + 1);
      }
    } else {
      this.qGood = 0;
    }
  }

  private changeAuto(q: number): void {
    this.setQuality(q);
    // 换档会重建贴图（一帧尖峰），跳过 0.5 s 再采样
    this.qSkip = 0.5;
  }

  // ───────────── 每帧 ─────────────

  frame(info: FrameInfo, paused: boolean, deskActive: boolean): void {
    const g = this.game;
    const realDt = info.realDt;
    const visDt = info.gameDt;
    const ambDt = paused ? 0 : realDt;
    this.visDt = visDt;
    this.realT += realDt;
    this.gameT += visDt;
    if (!paused) g.updatePrediction();
    updateFruitVisuals(g, visDt, info.alpha, this.gameT, this.hooks);
    this.particles.update(visDt, ambDt);
    this.popups.update(visDt, ambDt);
    this.jar.update(ambDt);
    this.jar.flash(g.tutorial.lineFlashT);
    this.jar.bright = g.scene === 'title' ? 1 : 0;
    this.sling.update(g, ambDt);
    this.traj.update(g, ambDt);
    this.hud.update(g, ambDt);
    this.transition.update(realDt);
    this.updateCamera(realDt);
    this.updateDanger(g, ambDt);
    if (this.crownDropT < 9) this.crownDropT += visDt;
    // 吉祥物
    const mt = g.scene === 'title' ? 1 : 0;
    this.mascotA += (mt - this.mascotA) * Math.min(1, realDt * 8);
    if (this.mascotA > 0.01) {
      this.mascotOpen = stepBlink(this.mascotVis, realDt);
      const mv = this.mascotVis;
      const k = 1 - Math.exp(-6 * realDt);
      let tx = 0;
      let ty = 0.25;
      if (g.lookActive) {
        const dx = g.lookX - 195;
        const dy = g.lookY - 196;
        const d = Math.hypot(dx, dy) || 1;
        const kk = Math.min(1, d / 80);
        tx = (dx / d) * kk;
        ty = (dy / d) * kk;
      }
      mv.lookX += (tx - mv.lookX) * k;
      mv.lookY += (ty - mv.lookY) * k;
    }
    this.autoQuality(realDt);
    this.draw(paused);
    this.bg.drawDesk(this.stage.bgCtx, this.stage.bg, this.stage.m, realDt, deskActive);
    this.transition.draw(this.stage.waveCtx, this.stage.wave);
  }

  private updateCamera(dt: number): void {
    this.trauma = Math.max(0, this.trauma - FX.camera.traumaDecay * dt);
    this.punch *= Math.exp(-9 * dt);
    if (this.punch < 0.0005) this.punch = 0;
    if (this.holdT > 0) {
      this.holdT -= dt;
      if (this.holdT <= 0) this.holdTarget = 0;
    }
    // 镜头保持：临界阻尼弹簧
    const w = 2 * Math.PI * 2.2;
    const n = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (this.holdTarget - this.hold) - 2 * w * this.holdV;
      this.holdV += a * h;
      this.hold += this.holdV * h;
    }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - this.flashDecay * dt);
  }

  private updateDanger(g: Game, dt: number): void {
    const D = CONFIG.danger;
    const playing = g.scene === 'playing';
    const lvl = playing ? g.dangerLevel : 0;
    const k = Math.max(0, Math.min(1, (g.dangerMax - D.showAfter) / (D.limit - D.showAfter)));
    const hz = 1.5 + 1.5 * k;
    this.dangerPhase += dt * hz * TAU;
    const target = lvl === 2 ? 0.55 + 0.45 * Math.sin(this.dangerPhase) : 0;
    this.vignette += (target - this.vignette) * Math.min(1, dt * 10);
    const show = g.scene === 'playing' || g.scene === 'gameover' ? 1 : 0;
    this.lineShow += (show - this.lineShow) * Math.min(1, dt * 6);
  }

  private draw(paused: boolean): void {
    const ctx = this.ctx;
    const g = this.game;
    const m = this.stage.m;
    const pr = m.pxRatio;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // ── 世界层（相机） ──
    const tr = this.trauma * this.trauma;
    const t = this.realT;
    const nx = (Math.sin(TAU * 18 * t + this.ph1) + Math.sin(TAU * 23 * t + this.ph2) + Math.sin(TAU * 29 * t + this.ph3)) / 3;
    const ny = (Math.sin(TAU * 19 * t + this.ph2) + Math.sin(TAU * 25 * t + this.ph3) + Math.sin(TAU * 31 * t + this.ph1)) / 3;
    const na = (Math.sin(TAU * 17 * t + this.ph3) + Math.sin(TAU * 27 * t + this.ph1)) / 2;
    const ox = FX.camera.maxOffset * tr * nx;
    const oy = FX.camera.maxOffset * tr * ny;
    const ang = FX.camera.maxAngleDeg * DEG * tr * na;
    const z = 1 + this.punch + Math.max(0, this.hold);
    const still = ox === 0 && oy === 0 && ang === 0 && z === 1;
    // 镜头静止时：舞台底 + 罐背层（静态部分）用一张烘焙底图一次画完
    if (still) ctx.drawImage(this.ensureBase(), 0, 0, W, H);
    else this.bg.drawStage(ctx);
    ctx.save();
    if (!still) {
      const cx = W / 2;
      const cy = H / 2;
      const f = Math.min(1, (z - 1) / 0.06) * 0.3;
      const vx = cx + (this.focusX - cx) * f;
      const vy = cy + (this.focusY - cy) * f;
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(ang);
      ctx.scale(z, z);
      ctx.translate(-vx, -vy);
    }
    this.baked = still;
    this.drawWorld(ctx, g, paused);
    ctx.restore();
    // ── HUD（不震） ──
    this.hud.draw(ctx, g, this);
    this.popups.drawBanners(ctx, this.drawIcon);
    if (this.flashA > 0.003) {
      ctx.globalAlpha = Math.min(1, this.flashA);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  private base: HTMLCanvasElement | null = null;
  private baseKey = -1;
  private baked = false;
  private readonly bodySprite = (level: number): Sprite => this.sprites.fruit(level).body;

  /** 烘焙底图：舞台底 + 罐背层静态部分；像素比 / 焦散开关 / 标题提亮变化时重建 */
  private ensureBase(): HTMLCanvasElement {
    const jar = this.jar;
    const gc = this.stage.game;
    const key = gc.width * 100000 + gc.height * 10 + (jar.causticsOn ? 5 : 0) + jar.bright;
    if (this.base && key === this.baseKey) return this.base;
    this.baseKey = key;
    let c = this.base;
    if (!c || c.width !== gc.width || c.height !== gc.height) c = this.base = makeCanvas(gc.width, gc.height);
    const b = ctx2d(c);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, c.width, c.height);
    b.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    this.bg.drawStage(b);
    jar.bakeBack(b);
    return c;
  }

  private readonly drawIcon = (level: number, x: number, y: number, size: number): void => {
    const c = this.sprites.icon(level, size, drawIdleFace);
    const e = this.sprites.iconExtent(level, size);
    this.ctx.drawImage(c, x - e / 2, y - e / 2, e, e);
  };

  private drawWorld(ctx: CanvasRenderingContext2D, g: Game, paused: boolean): void {
    const jar = this.jar;
    jar.drawBack(ctx, this.realT, this.baked);
    jar.drawBubbles(ctx, this.sprites.shape('bubble'));
    this.particles.drawSplats(ctx);
    jar.drawLine(ctx, g.dangerLevel, this.realT, 1.5 + 1.5 * Math.min(1, g.dangerMax / CONFIG.danger.limit), this.lineShow);
    this.particles.drawRays(ctx, this.gameT);
    // 阴影 + 彩虹西瓜光晕
    const fr = g.fruits;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i]!;
      const v = f.vis;
      const sh = this.sprites.fruit(f.level).shadow;
      const s = v.scale * (f.body.r / f.body.r1);
      ctx.drawImage(sh.c, v.rx + 4 - sh.ax * s, v.ry + 6 - sh.ay * s, sh.w * s, sh.h * s);
      if (f.level === 11) {
        const gl = this.sprites.rainbowGlow();
        const p = 0.5 + 0.5 * Math.sin(this.gameT * TAU);
        const gs = (0.95 + 0.08 * p) * s;
        ctx.globalAlpha = 0.6 + 0.35 * p;
        ctx.drawImage(gl.c, v.rx - gl.ax * gs, v.ry - gl.ay * gs, gl.w * gs, gl.h * gs);
        ctx.globalAlpha = 1;
      }
    }
    // 弹弓（后层 + 装填果 + 前沿）
    this.sling.drawBack(ctx, g, this);
    // 拖尾
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i]!;
      if (f.vis.trail > 0 && f.vis.tCount >= 2) this.drawTrail(ctx, f);
    }
    // 水果（飞行中的最后画）
    let flying: Fruit | null = null;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i]!;
      if (f.state === 'flying') {
        flying = f;
        continue;
      }
      this.drawFruit(ctx, g, f);
    }
    if (flying) this.drawFruit(ctx, g, flying);
    // 融合残影
    this.gctx = ctx;
    this.particles.forEachGhost(this.drawGhost);
    jar.drawVignette(ctx, this.vignette);
    // 预测线
    this.traj.draw(ctx, g);
    this.particles.drawRings(ctx);
    this.particles.draw(ctx);
    jar.drawFront(ctx);
    if (jar.refractionOn) jar.drawRefraction(ctx, fr, this.bodySprite);
    // 标题吉祥物
    if (this.mascotA > 0.01) this.drawMascot(ctx);
    // 取消区提示
    const s = g.sling;
    if (s.aiming && s.cancelZone && g.scene === 'playing' && !paused) {
      const P = CONFIG.layout.sling.pouch;
      ctx.globalAlpha = 0.95;
      candyText(ctx, '松手取消', P.x, P.y - 82, 15, 'white');
      ctx.globalAlpha = 1;
    }
    this.popups.draw(ctx);
    if (this.hitboxes) this.drawHitboxes(ctx, g);
  }

  private gctx: CanvasRenderingContext2D | null = null;
  private readonly drawGhost = (level: number, x: number, y: number, s: number, a: number): void => {
    const ctx = this.gctx!;
    const fs = this.face;
    fs.expr = 'fuse';
    fs.lookX = 0;
    fs.lookY = 0;
    fs.open = 1;
    fs.wink = false;
    fs.t = this.gameT;
    fs.blush = 1.2;
    this.core(ctx, level, x, y, 0, 0, s, 0, fs, a, 0);
  };

  private drawTrail(ctx: CanvasRenderingContext2D, f: Fruit): void {
    const v = f.vis;
    const n = v.tCount;
    const r = f.body.r;
    ctx.strokeStyle = TRAIL_COL[f.level - 1]!;
    ctx.lineCap = 'round';
    let hi = v.tHead;
    let px = v.tx[hi]!;
    let py = v.ty[hi]!;
    for (let k = 1; k < n; k++) {
      const idx = (v.tHead - k + v.tx.length) % v.tx.length;
      const x = v.tx[idx]!;
      const y = v.ty[idx]!;
      const w = 1.8 * r * 0.9 * (1 - k / n) * v.trail;
      if (w > 0.5) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      px = x;
      py = y;
      hi = idx;
    }
  }

  private drawFruit(ctx: CanvasRenderingContext2D, g: Game, f: Fruit): void {
    const v = f.vis;
    const fs = this.face;
    let e: Expression = resolveExpr(f, g);
    const target = g.predictionOn && g.predictTarget === f && g.predictSame;
    if (target && e !== 'dead' && e !== 'sad' && e !== 'panic' && e !== 'dizzy' && e !== 'hit') e = 'kiss';
    fs.expr = e;
    if (target) {
      const P = CONFIG.layout.sling.pouch;
      const dx = P.x - f.body.x;
      const dy = P.y - f.body.y;
      const d = Math.hypot(dx, dy) || 1;
      fs.lookX = dx / d;
      fs.lookY = dy / d;
    } else {
      fs.lookX = v.lookX;
      fs.lookY = v.lookY;
    }
    fs.open = stepBlink(v, this.visDt);
    fs.wink = f.level === 2 && e === 'idle' ? stepWink(v, this.visDt) : false;
    fs.t = this.gameT + v.phase;
    fs.blush = 1;
    let x = v.rx;
    let y = v.ry;
    if (e === 'panic') {
      x += Math.sin(this.gameT * TAU * 20 + v.phase) * 1.5;
      y += Math.cos(this.gameT * TAU * 17 + v.phase) * 0.8;
    }
    const D = FX.deform;
    const breathe = 1 + D.breatheAmp * fruitDef(f.level).face.breatheMul * Math.sin(TAU * D.breatheHz * this.gameT + v.phase);
    const grow = f.body.r / f.body.r1;
    const sc = v.scale * breathe * grow;
    this.core(ctx, f.level, x, y, v.sa, v.sb, sc, v.angle, fs, 1, v.flash, f);
    // 高亮圈
    const r = f.body.r * v.scale;
    if (target) {
      const p = 0.5 + 0.5 * Math.sin(this.realT * 8);
      ctx.strokeStyle = 'rgba(255,240,168,0.6)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(x, y, r + 5 + p, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#FFC93C';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (f.tutorialTarget && g.tutorial.active) {
      const p = 0.5 + 0.5 * Math.sin(this.realT * 5);
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -this.realT * 20;
      ctx.strokeStyle = 'rgba(255,111,145,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 9 + p * 4, 0, TAU);
      ctx.stroke();
      ctx.setLineDash(NODASH);
      ctx.lineDashOffset = 0;
    }
  }

  /**
   * 水果核心绘制：T(x,y) · M(应变) · S(缩放) · R(角) · [配件 + 本体] → 去掉 R · [高光] → 加回 R · [表情]
   */
  private core(
    ctx: CanvasRenderingContext2D, level: number, x: number, y: number, sa: number, sb: number, sc: number,
    angle: number, fs: FaceState, alpha: number, flash: number, f: Fruit | null = null,
  ): void {
    const spr = this.sprites.fruit(level);
    const r = fruitDef(level).radius;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    const n2 = 1 - sa * sa - sb * sb;
    const nn = 1 / Math.sqrt(n2 > 0.05 ? n2 : 0.05);
    const k = nn * sc;
    ctx.transform((1 + sa) * k, sb * k, sb * k, (1 - sa) * k, 0, 0);
    if (angle !== 0) ctx.rotate(angle);
    // L9 叶冠在本体后面，待机轻摇
    if (level === 9 && spr.extra) {
      const ex = spr.extra;
      const sway = Math.sin(this.gameT * 2.1 + (f ? f.vis.phase : 0)) * 0.08;
      ctx.translate(0, -0.82 * r);
      ctx.rotate(sway);
      ctx.drawImage(ex.c, -ex.ax, -ex.ay, ex.w, ex.h);
      ctx.rotate(-sway);
      ctx.translate(0, 0.82 * r);
    }
    const b = spr.body;
    ctx.drawImage(b.c, -b.ax, -b.ay, b.w, b.h);
    if (angle !== 0) ctx.rotate(-angle);
    const gl = spr.gloss;
    ctx.drawImage(gl.c, -gl.ax, -gl.ay, gl.w, gl.h);
    if (level === 11) {
      const ring = this.sprites.rainbow();
      const ra = this.gameT * 0.6;
      ctx.rotate(ra);
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.75;
      ctx.drawImage(ring.c, -ring.ax, -ring.ay, ring.w, ring.h);
      ctx.globalAlpha = a0;
      ctx.rotate(-ra);
    }
    if (angle !== 0) ctx.rotate(angle);
    drawFace(ctx, level, r, fs);
    if (level === 11 && spr.extra) {
      const ex = spr.extra;
      let dy = 0;
      if (f && f.id === this.crownDropId && this.crownDropT < 0.65) {
        const t = this.crownDropT;
        if (t < 0.3) dy = -999;
        else {
          const kk = (t - 0.3) / 0.35;
          dy = -140 * (1 - kk) * (1 - kk) + Math.sin(kk * Math.PI) * -10 * (1 - kk);
        }
      }
      if (dy > -900 && f) {
        // 顶着盖子时王冠往头上压低，始终露在盖子下沿之下（不被盖子挡住）
        const minDy = (CONFIG.layout.jar.inner.T + 2 - y) / Math.max(0.2, sc) + 0.84 * r + ex.ay;
        if (dy < minDy) dy = Math.min(minDy, 0.45 * r);
      }
      if (dy > -900) {
        ctx.translate(0, -0.84 * r + dy);
        ctx.drawImage(ex.c, -ex.ax, -ex.ay, ex.w, ex.h);
        ctx.translate(0, 0.84 * r - dy);
      }
    }
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash) * 0.8 * alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.02, 0, TAU);
      ctx.fill();
    }
    if (f && f.vis.danger > 0.02) {
      if (angle !== 0) ctx.rotate(-angle);
      const p = 0.6 + 0.4 * Math.sin(this.gameT * TAU * 3);
      ctx.globalAlpha = f.vis.danger * p;
      ctx.strokeStyle = '#FF3B5C';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** FruitPainter：弹弓装填果、「下一个」泡泡等 */
  paint(
    ctx: CanvasRenderingContext2D, level: number, x: number, y: number, vis: FruitVis, expr: Expression,
    open: number, scale: number, alpha: number,
  ): void {
    if (alpha <= 0.01 || scale <= 0.01) return;
    const fs = this.face;
    fs.expr = expr;
    fs.lookX = vis.lookX;
    fs.lookY = vis.lookY;
    fs.open = open;
    fs.wink = false;
    fs.t = this.gameT;
    fs.blush = 1;
    const sh = this.sprites.fruit(level).shadow;
    const s = vis.scale * scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sh.c, x + 3 * scale - sh.ax * s, y + 4 * scale - sh.ay * s, sh.w * s, sh.h * s);
    ctx.globalAlpha = 1;
    this.core(ctx, level, x, y, vis.sa, vis.sb, s, vis.angle, fs, alpha, 0);
  }

  private drawMascot(ctx: CanvasRenderingContext2D): void {
    const a = this.mascotA;
    const x = 195;
    const y = 196 + Math.sin(this.realT * 1.6) * 3;
    const r = 64;
    const base = fruitDef(11).radius;
    const s = r / base;
    // 12 条白色光芒（18%），0.1 rad/s
    const ray = this.sprites.ray();
    ctx.globalAlpha = a * 0.18 * 2.2;
    for (let i = 0; i < 12; i++) {
      const an = this.realT * 0.1 + (i * TAU) / 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(an);
      const len = 170;
      ctx.drawImage(ray.c, 0, -ray.ay * (len / ray.w) * 1.4, len, ray.h * (len / ray.w) * 1.4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const gl = this.sprites.rainbowGlow();
    const p = 0.5 + 0.5 * Math.sin(this.realT * TAU);
    const gs = s * (0.95 + 0.06 * p);
    ctx.globalAlpha = a * (0.55 + 0.3 * p);
    ctx.drawImage(gl.c, x - gl.ax * gs, y - gl.ay * gs, gl.w * gs, gl.h * gs);
    ctx.globalAlpha = 1;
    const v = this.mascotVis;
    const fs = this.face;
    fs.expr = 'idle';
    fs.lookX = v.lookX;
    fs.lookY = v.lookY;
    fs.open = this.mascotOpen;
    fs.wink = false;
    fs.t = this.realT;
    fs.blush = 1;
    const br = 1 + 0.015 * Math.sin(this.realT * TAU * 0.6);
    this.core(ctx, 11, x, y, 0, 0, s * br, Math.sin(this.realT * 0.9) * 0.04, fs, a, 0);
  }

  private drawHitboxes(ctx: CanvasRenderingContext2D, g: Game): void {
    const w = g.world;
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of w.bodies) {
      if (!b.alive) continue;
      ctx.strokeStyle = b.sleeping ? 'rgba(120,120,120,0.9)' : 'rgba(0,160,255,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
      const f = b.ref;
      if (f && f.overTime > 0) {
        ctx.fillStyle = '#FF3B5C';
        ctx.fillText(f.overTime.toFixed(2), b.x, b.y);
      }
    }
    ctx.strokeStyle = 'rgba(255,0,120,0.9)';
    for (let i = 0; i < w.contactCount; i++) {
      const c = w.contacts[i]!;
      const B = w.bodies[c.b];
      if (!B) continue;
      const x = B.x - c.nx * B.r;
      const y = B.y - c.ny * B.r;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + c.nx * 10, y + c.ny * 10);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,59,92,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.layout.dangerY);
    ctx.lineTo(W, CONFIG.layout.dangerY);
    ctx.stroke();
  }
}
