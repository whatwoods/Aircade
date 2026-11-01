/**
 * 世界时钟：hitstop（时间冻结）、慢动作、暂停。
 * 所有游戏动画使用 world 时间；震屏、UI 使用 real 时间。
 */
export class Clock {
  /** 累计世界时间（ms） */
  world = 0;
  /** 累计真实时间（ms） */
  real = 0;
  /** 本帧世界 dt（ms） */
  dt = 0;
  /** 本帧真实 dt（ms） */
  rdt = 0;
  /** 全局时间缩放（debug / ?fast） */
  scale = 1;
  private hitstopUntil = 0;
  private slowUntil = 0;
  private slowScale = 1;

  tick(realDt: number): void {
    const d = Math.min(realDt, 50);
    this.rdt = d;
    this.real += d;
    let s = this.scale;
    if (this.real < this.hitstopUntil) s = 0;
    else if (this.real < this.slowUntil) s *= this.slowScale;
    this.dt = d * s;
    this.world += this.dt;
  }

  hitstop(ms: number): void {
    if (ms <= 0) return;
    const until = this.real + ms;
    if (until > this.hitstopUntil) this.hitstopUntil = until;
  }

  slowmo(scale: number, ms: number): void {
    this.slowScale = scale;
    this.slowUntil = this.real + ms;
  }

  get frozen(): boolean {
    return this.real < this.hitstopUntil;
  }
}
