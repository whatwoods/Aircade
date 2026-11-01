import { CONFIG } from '../config';
import { clamp, clamp01 } from '../core/math';

const DEG = Math.PI / 180;

/** 弹弓：瞄准换算、装填时间线、皮兜弹簧（docs §3.3） */
export class Slingshot {
  // 输入
  pointerId = -1;
  aiming = false;
  sx = 0;
  sy = 0;
  cx = 0;
  cy = 0;
  // 结果
  angle = 0; // 弧度，0=正上，右为正
  power = 0;
  valid = false;
  cancelZone = false;
  dirX = 0;
  dirY = -1;
  // 装填
  loaded: number | null = null;
  cooldown = 0;
  hopLevel = 0;
  hopT = -1; // <0 表示没有跳跃动画；0..1 进度
  // 视觉：皮兜偏移弹簧（相对 P）
  pouchX = 0;
  pouchY = 0;
  pouchVX = 0;
  pouchVY = 0;
  maxReached = false;
  powerStep = 0;
  /** 刚刚发射后的拉伸（视觉） */
  snapT = 0;

  reset(): void {
    this.aiming = false;
    this.pointerId = -1;
    this.valid = false;
    this.cancelZone = false;
    this.power = 0;
    this.angle = 0;
    this.loaded = null;
    this.cooldown = 0;
    this.hopT = -1;
    this.pouchX = this.pouchY = this.pouchVX = this.pouchVY = 0;
    this.maxReached = false;
    this.powerStep = 0;
  }

  begin(id: number, x: number, y: number): void {
    this.pointerId = id;
    this.aiming = true;
    this.sx = this.cx = x;
    this.sy = this.cy = y;
    this.power = 0;
    this.valid = false;
    this.cancelZone = false;
    this.maxReached = false;
    this.powerStep = 0;
    this.compute();
  }

  move(x: number, y: number): void {
    this.cx = x;
    this.cy = y;
    this.compute();
  }

  end(): void {
    this.aiming = false;
    this.pointerId = -1;
  }

  compute(): void {
    const A = CONFIG.aim;
    const dx = this.sx - this.cx;
    const dy = this.sy - this.cy;
    const len = Math.hypot(dx, dy);
    let th = len > 0.001 ? Math.atan2(dx, -dy) : 0;
    this.cancelZone = len >= A.deadzone && Math.abs(th) > A.cancelAngleDeg * DEG;
    th = clamp(th, -A.maxAngleDeg * DEG, A.maxAngleDeg * DEG);
    this.angle = th;
    this.power = clamp01((len - A.deadzone) / (A.maxPull - A.deadzone));
    this.valid = len >= A.deadzone && !this.cancelZone;
    this.dirX = Math.sin(th);
    this.dirY = -Math.cos(th);
  }

  /** 由角度/力度设置（调试或 bot） */
  setAim(angleRad: number, power: number): void {
    const A = CONFIG.aim;
    this.angle = clamp(angleRad, -A.maxAngleDeg * DEG, A.maxAngleDeg * DEG);
    this.power = clamp01(power);
    this.dirX = Math.sin(this.angle);
    this.dirY = -Math.cos(this.angle);
    this.valid = true;
    this.cancelZone = false;
  }

  static speedFor(power: number): number {
    const S = CONFIG.shot;
    return S.minSpeed + (S.maxSpeed - S.minSpeed) * Math.pow(clamp01(power), S.powerExp);
  }

  /** 视觉皮兜更新（真实/游戏 dt 皆可） */
  updateVisual(dt: number, aimingVisible: boolean): void {
    const vp = CONFIG.aim.visualPullMax;
    let tx = 0;
    let ty = 0;
    if (aimingVisible && this.valid) {
      tx = -this.dirX * this.power * vp;
      ty = -this.dirY * this.power * vp;
    }
    if (aimingVisible) {
      // 跟手：较硬的弹簧
      const k = 900;
      const c = 2 * Math.sqrt(k) * 0.9;
      this.integrate(dt, tx, ty, k, c);
    } else {
      // 松手回弹：k=400, ζ=0.25
      const k = 400 * 3.2;
      const c = 2 * Math.sqrt(k) * 0.25;
      this.integrate(dt, 0, 0, k, c);
    }
    if (this.snapT > 0) this.snapT = Math.max(0, this.snapT - dt);
  }

  private integrate(dt: number, tx: number, ty: number, k: number, c: number): void {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ax = k * (tx - this.pouchX) - c * this.pouchVX;
      const ay = k * (ty - this.pouchY) - c * this.pouchVY;
      this.pouchVX += ax * h;
      this.pouchVY += ay * h;
      this.pouchX += this.pouchVX * h;
      this.pouchY += this.pouchVY * h;
    }
  }
}
