/**
 * 主循环（docs §2.6 / §9）：RAF + 固定步累加器；hitstop、慢动作、全局 timeScale、
 * 暂停恢复斜坡；游戏时钟（受 hitstop/慢动作影响）与 UI 时钟（真实时间）分离。
 */
import { CONFIG } from '../config';
import { clamp } from './math';

export interface FrameInfo {
  /** 真实 dt（秒，已钳制） */
  realDt: number;
  /** 本帧推进的游戏时间（hitstop 时为 0） */
  gameDt: number;
  /** 渲染插值系数 */
  alpha: number;
  /** 本帧执行的固定步数 */
  steps: number;
  now: number;
}

export class Loop {
  /** 调试/全局时间倍率 */
  timeScale = 1;
  paused = false;
  /** 暂停结束后的 0→1 斜坡 */
  private resumeRamp = 1;
  private resumeDur = 0.3;
  private hitstop = 0;
  private hsWindowStart = -1;
  private hsWindowUsed = 0;
  private slowT = 0;
  private slowDur = 0;
  private slowScale = 1;
  private slowBack = 0.25;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  uiTime = 0;
  gameTime = 0;
  /** 调试：暂停时需要步进的帧数 */
  private pendingSteps = 0;
  readonly info: FrameInfo = { realDt: 0, gameDt: 0, alpha: 0, steps: 0, now: 0 };
  frameMs = 0;
  physMs = 0;

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

  get isRunning(): boolean {
    return this.running;
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (!p) this.resumeRamp = 0;
  }

  /** 恢复时不做斜坡（例如直接开新局） */
  resumeInstant(): void {
    this.paused = false;
    this.resumeRamp = 1;
  }

  step(frames: number): void {
    this.pendingSteps += Math.max(1, frames | 0);
  }

  /** hitstop 不叠加：取较大值；每 300 ms 窗口总量 ≤ 150 ms */
  addHitstop(d: number): void {
    if (d <= 0) return;
    const F = CONFIG.fx;
    if (this.hsWindowStart < 0 || this.uiTime - this.hsWindowStart > F.hitstopWindow) {
      this.hsWindowStart = this.uiTime;
      this.hsWindowUsed = 0;
    }
    const allowed = Math.max(0, F.hitstopCap - this.hsWindowUsed);
    const want = Math.min(d, allowed + this.hitstop);
    if (want > this.hitstop) {
      this.hsWindowUsed += want - this.hitstop;
      this.hitstop = want;
    }
  }

  get inHitstop(): boolean {
    return this.hitstop > 0;
  }

  slowmo(scale: number, dur: number, easeBack: number): void {
    this.slowScale = scale;
    this.slowDur = dur;
    this.slowBack = easeBack;
    this.slowT = 0;
  }

  get slowFactor(): number {
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

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const t0 = performance.now();
    const realDt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.uiTime += realDt;
    const info = this.info;
    info.now = now;
    info.realDt = realDt;
    info.steps = 0;
    const fixed = CONFIG.physics.fixedDt;
    let gameDt = 0;
    let physMs = 0;

    if (!this.paused) {
      if (this.resumeRamp < 1) this.resumeRamp = Math.min(1, this.resumeRamp + realDt / this.resumeDur);
      if (this.slowDur > 0) {
        this.slowT += realDt;
        if (this.slowT > this.slowDur + this.slowBack) this.slowDur = 0;
      }
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - realDt);
      } else {
        gameDt = realDt * this.timeScale * this.slowFactor * this.resumeRamp;
      }
      this.acc += gameDt;
      const maxSteps = CONFIG.physics.maxStepsPerFrame;
      const p0 = performance.now();
      while (this.acc >= fixed && info.steps < maxSteps) {
        this.onFixed(fixed);
        this.acc -= fixed;
        info.steps++;
        // 本步触发了 hitstop：剩余累计时间延后处理
        if (this.hitstop > 0) break;
      }
      if (info.steps >= maxSteps && this.acc >= fixed) this.acc = 0;
      physMs = performance.now() - p0;
    } else if (this.pendingSteps > 0) {
      const p0 = performance.now();
      while (this.pendingSteps > 0) {
        this.onFixed(fixed);
        this.pendingSteps--;
        info.steps++;
        gameDt += fixed;
      }
      physMs = performance.now() - p0;
    }
    this.gameTime += gameDt;
    info.gameDt = gameDt;
    info.alpha = this.paused ? 1 : clamp(this.acc / fixed, 0, 1);
    this.onFrame(info);
    this.physMs = physMs;
    this.frameMs = performance.now() - t0;
  };
}
