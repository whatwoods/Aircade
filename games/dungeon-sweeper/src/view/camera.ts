import { CONFIG } from '../config';
import { noise1 } from '../core/noise';

/** trauma 震屏（文档 §5.1）：只作用于棋盘层 */
export class Camera {
  trauma = 0;
  x = 0;
  y = 0;
  rot = 0;
  reduced = false;

  add(t: number): void {
    this.trauma = Math.min(1, this.trauma + t);
  }

  update(realMs: number, dtMs: number): void {
    const J = CONFIG.juice;
    this.trauma = Math.max(0, this.trauma - (J.traumaDecay * dtMs) / 1000);
    const t2 = this.trauma * this.trauma * (this.reduced ? 0.25 : 1);
    if (t2 <= 0.0001) {
      this.x = this.y = this.rot = 0;
      return;
    }
    const tt = (realMs / 1000) * J.shakeFreq;
    this.x = J.shakeMaxPx * t2 * noise1(tt + 11.3);
    this.y = J.shakeMaxPx * t2 * noise1(tt + 47.9);
    this.rot = this.reduced ? 0 : ((J.shakeMaxRotDeg * Math.PI) / 180) * t2 * noise1(tt + 91.1);
  }
}
