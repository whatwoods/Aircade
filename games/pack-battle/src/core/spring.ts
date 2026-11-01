// 弹簧-阻尼（半隐式欧拉），由主循环以固定 120Hz 子步推进
export const PHYS_H = 1 / 120;

export class Spring {
  x: number;
  v = 0;
  target: number;
  w: number;
  z: number;
  constructor(w: number, z: number, x = 0) {
    this.w = w;
    this.z = z;
    this.x = x;
    this.target = x;
  }
  set(w: number, z: number): this {
    this.w = w;
    this.z = z;
    return this;
  }
  step(h: number): void {
    const a = this.w * this.w * (this.target - this.x) - 2 * this.z * this.w * this.v;
    this.v += a * h;
    this.x += this.v * h;
  }
  snap(x: number): void {
    this.x = x;
    this.target = x;
    this.v = 0;
  }
  settled(eps = 0.05): boolean {
    return Math.abs(this.x - this.target) < eps && Math.abs(this.v) < eps * 4;
  }
}

/** 二维弹簧（共享参数） */
export class Spring2 {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  tx: number;
  ty: number;
  w: number;
  z: number;
  constructor(w: number, z: number, x = 0, y = 0) {
    this.w = w;
    this.z = z;
    this.x = this.tx = x;
    this.y = this.ty = y;
  }
  set(w: number, z: number): this {
    this.w = w;
    this.z = z;
    return this;
  }
  step(h: number): void {
    const k = this.w * this.w;
    const c = 2 * this.z * this.w;
    this.vx += (k * (this.tx - this.x) - c * this.vx) * h;
    this.vy += (k * (this.ty - this.y) - c * this.vy) * h;
    this.x += this.vx * h;
    this.y += this.vy * h;
  }
  snap(x: number, y: number): void {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.vx = this.vy = 0;
  }
  settled(eps = 0.3): boolean {
    return Math.abs(this.x - this.tx) < eps && Math.abs(this.y - this.ty) < eps && Math.abs(this.vx) + Math.abs(this.vy) < eps * 6;
  }
}
