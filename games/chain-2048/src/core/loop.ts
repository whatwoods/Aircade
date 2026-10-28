/**
 * 主循环：rAF + 固定步长 120 Hz；hitstop、慢动作、全局 timeScale、暂停恢复斜坡。
 * 游戏时钟（受 hitstop/慢动作影响）与 UI 时钟（真实时间）分离。
 */
import { CONFIG } from '../config';
import { clamp } from './tween';

export interface FrameInfo {
  realDt: number;
  gameDt: number;
  steps: number;
}

export class Loop {
  timeScale = 1;
  paused = false;
  private resumeRamp = 1;
  private hitstop = 0;
  private slowT = 0;
  private slowDur = 0;
  private slowScale = 1;
  private slowBack = 0.25;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private pendingSteps = 0;
  uiTime = 0;
  readonly info: FrameInfo = { realDt: 0, gameDt: 0, steps: 0 };
  frameMs = 0;
  /** 帧耗时滑动样本（p95） */
  readonly samples = new Float32Array(120);
  private si = 0;
  private onFixed: (dt: number) => void;
  private onFrame: (f: FrameInfo) => void;

  constructor(onFixed: (dt: number) => void, onFrame: (f: FrameInfo) => void) {
    this.onFixed = onFixed;
    this.onFrame = onFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (!p) this.resumeRamp = 0;
  }

  resumeInstant(): void {
    this.paused = false;
    this.resumeRamp = 1;
  }

  step(frames: number): void {
    this.pendingSteps += Math.max(1, frames | 0);
  }

  addHitstop(d: number): void {
    if (d > this.hitstop) this.hitstop = Math.min(0.15, d);
  }

  slowmo(scale: number, dur: number, back = 0.25): void {
    this.slowScale = scale;
    this.slowDur = dur;
    this.slowBack = back;
    this.slowT = 0;
  }

  private get slowFactor(): number {
    if (this.slowDur <= 0) return 1;
    const t = this.slowT;
    if (t < this.slowDur) return this.slowScale;
    const k = clamp((t - this.slowDur) / this.slowBack, 0, 1);
    return this.slowScale + (1 - this.slowScale) * (k * k * (3 - 2 * k));
  }

  cancelEffects(): void {
    this.hitstop = 0;
    this.slowDur = 0;
  }

  p95(): number {
    const a = Array.from(this.samples).sort((x, y) => x - y);
    return a[Math.floor(a.length * 0.95)] ?? 0;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const t0 = performance.now();
    const realDt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.uiTime += realDt;
    const info = this.info;
    info.realDt = realDt;
    info.steps = 0;
    const fixed = CONFIG.logic.fixedDt;
    let gameDt = 0;
    if (!this.paused) {
      if (this.resumeRamp < 1) this.resumeRamp = Math.min(1, this.resumeRamp + realDt / 0.3);
      if (this.slowDur > 0) {
        this.slowT += realDt;
        if (this.slowT > this.slowDur + this.slowBack) this.slowDur = 0;
      }
      if (this.hitstop > 0) this.hitstop = Math.max(0, this.hitstop - realDt);
      else gameDt = realDt * this.timeScale * this.slowFactor * this.resumeRamp;
      this.acc += gameDt;
      const maxSteps = CONFIG.logic.maxStepsPerFrame * Math.max(1, Math.ceil(this.timeScale));
      while (this.acc >= fixed && info.steps < maxSteps) {
        this.onFixed(fixed);
        this.acc -= fixed;
        info.steps++;
        if (this.hitstop > 0) break;
      }
      if (info.steps >= maxSteps && this.acc >= fixed) this.acc = 0;
    } else if (this.pendingSteps > 0) {
      while (this.pendingSteps > 0) {
        this.onFixed(fixed);
        this.pendingSteps--;
        info.steps++;
        gameDt += fixed;
      }
    }
    info.gameDt = gameDt;
    this.onFrame(info);
    this.frameMs = performance.now() - t0;
    this.samples[this.si] = this.frameMs;
    this.si = (this.si + 1) % this.samples.length;
  };
}
