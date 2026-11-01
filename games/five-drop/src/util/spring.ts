// 数值弹簧（临界附近阻尼），用于分数、面板等
export class Spring {
  value: number;
  target: number;
  vel = 0;
  omega: number;
  zeta: number;
  constructor(v = 0, omega = 12, zeta = 0.9) {
    this.value = v; this.target = v; this.omega = omega; this.zeta = zeta;
  }
  set(v: number): void { this.value = v; this.target = v; this.vel = 0; }
  update(dt: number): number {
    const h = 1 / 240;
    let t = Math.min(dt, 0.1);
    while (t > 0) {
      const s = Math.min(h, t);
      const f = -2 * this.zeta * this.omega * this.vel - this.omega * this.omega * (this.value - this.target);
      this.vel += f * s;
      this.value += this.vel * s;
      t -= s;
    }
    if (Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.vel) < 1e-3) { this.value = this.target; this.vel = 0; }
    return this.value;
  }
}
