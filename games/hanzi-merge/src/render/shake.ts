/** 震屏（trauma²）与命中停顿（§7.1）。只作用于舞台画布。 */
import { CONFIG } from '../config.ts';

export class Shake {
  trauma = 0;
  hitstop = 0;
  x = 0;
  y = 0;
  rot = 0;
  /** 设置「减弱动效」：震屏 ×0、停顿 ×0.5 */
  reduced = false;
  private t = 0;

  add(tr: number): void {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + tr);
  }
  stop(ms: number): void {
    this.hitstop = Math.max(this.hitstop, (this.reduced ? ms * 0.5 : ms) / 1000);
  }

  /** 返回本帧的「游戏时间」倍率（停顿时为 0） */
  update(dt: number): number {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - CONFIG.fx.traumaDecay * dt);
    const k = this.trauma * this.trauma;
    const m = CONFIG.fx.maxShake * k;
    this.x = m * (Math.sin(this.t * 61.3) * 0.6 + Math.sin(this.t * 97.1) * 0.4);
    this.y = m * (Math.sin(this.t * 71.7 + 1.3) * 0.6 + Math.sin(this.t * 89.9 + 0.4) * 0.4);
    this.rot = ((CONFIG.fx.shakeRot * Math.PI) / 180) * k * Math.sin(this.t * 53.1 + 2.1);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return 0;
    }
    return 1;
  }
}
