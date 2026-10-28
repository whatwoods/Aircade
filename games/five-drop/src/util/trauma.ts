// trauma 屏幕震动模型：偏移 = max × t²，噪声驱动
export class Trauma {
  t = 0;
  decay: number;
  maxPx: number;
  x = 0; y = 0; rot = 0;
  private time = 0;
  enabled = true;
  constructor(decay: number, maxPx: number) { this.decay = decay; this.maxPx = maxPx; }
  add(v: number): void { if (this.enabled) this.t = Math.min(1, this.t + v); }
  update(dt: number): void {
    this.time += dt;
    this.t = Math.max(0, this.t - this.decay * dt);
    const k = this.t * this.t;
    const tt = this.time * 37;
    this.x = this.maxPx * k * (Math.sin(tt * 1.13) * 0.6 + Math.sin(tt * 2.71 + 1.3) * 0.4);
    this.y = this.maxPx * k * (Math.sin(tt * 1.37 + 2.1) * 0.6 + Math.sin(tt * 2.39 + 0.4) * 0.4);
    this.rot = 0.012 * k * Math.sin(tt * 0.91 + 0.7);
  }
}
