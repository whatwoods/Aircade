/**
 * 轨道：圆角折线 → 每 2 px 采样的弧长查找表（docs §2.3）。
 * s ∈ [0, length]；s < gateLen 在闸门石拱里；s = length 是金蛇口。
 */
export interface TrackDef {
  name: string;
  /** 控制点 [x,y]，第一个是闸门，最后一个是蛇口 */
  points: ReadonlyArray<readonly [number, number]>;
  radius: number;
  /** 图腾中心 */
  totem: readonly [number, number];
  /** 石桥区间（弧长，相对于 length 的比例，构建后换算为 px） */
  tunnels: ReadonlyArray<readonly [number, number]>;
}

export interface Vec2 {
  x: number;
  y: number;
}

const STEP = 2;

export class Track {
  readonly def: TrackDef;
  readonly length: number;
  readonly gateLen = 64;
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly ang: Float32Array;
  readonly n: number;
  readonly tunnels: Array<[number, number]>;
  /** 石桥碰撞圆（x,y,r）×k */
  readonly bridgeCircles: Float32Array;
  readonly totemX: number;
  readonly totemY: number;

  constructor(def: TrackDef) {
    this.def = def;
    this.totemX = def.totem[0];
    this.totemY = def.totem[1];
    const dense = buildDense(def.points, def.radius);
    // 按弧长重采样
    const cum: number[] = [0];
    const px: number[] = [];
    const py: number[] = [];
    for (let i = 0; i < dense.length; i += 2) {
      px.push(dense[i]!);
      py.push(dense[i + 1]!);
    }
    for (let i = 1; i < px.length; i++) cum.push(cum[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!));
    const total = cum[cum.length - 1]!;
    this.length = total;
    const n = Math.floor(total / STEP) + 2;
    this.n = n;
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.ang = new Float32Array(n);
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = Math.min(total, k * STEP);
      while (j < cum.length - 2 && cum[j + 1]! < s) j++;
      const seg = cum[j + 1]! - cum[j]!;
      const t = seg > 1e-6 ? (s - cum[j]!) / seg : 0;
      this.xs[k] = px[j]! + (px[j + 1]! - px[j]!) * t;
      this.ys[k] = py[j]! + (py[j + 1]! - py[j]!) * t;
      this.ang[k] = Math.atan2(py[j + 1]! - py[j]!, px[j + 1]! - px[j]!);
    }
    this.tunnels = def.tunnels.map(([a, b]) => [a * total, b * total] as [number, number]);
    const circ: number[] = [];
    for (const [a, b] of this.tunnels) {
      for (let s = a; s <= b; s += 10) {
        const p = this.posAt(s);
        circ.push(p.x, p.y, 22);
      }
    }
    this.bridgeCircles = new Float32Array(circ);
  }

  private tmp: Vec2 = { x: 0, y: 0 };

  /** 返回复用对象（调用方应立即读取） */
  posAt(s: number, out: Vec2 = this.tmp): Vec2 {
    if (s <= 0) {
      const a = this.ang[0]!;
      out.x = this.xs[0]! + Math.cos(a) * s;
      out.y = this.ys[0]! + Math.sin(a) * s;
      return out;
    }
    if (s >= this.length) {
      const a = this.ang[this.n - 1]!;
      const d = s - this.length;
      out.x = this.xs[this.n - 1]! + Math.cos(a) * d;
      out.y = this.ys[this.n - 1]! + Math.sin(a) * d;
      return out;
    }
    const f = s / STEP;
    const k = Math.floor(f);
    const t = f - k;
    const k1 = Math.min(this.n - 1, k + 1);
    out.x = this.xs[k]! + (this.xs[k1]! - this.xs[k]!) * t;
    out.y = this.ys[k]! + (this.ys[k1]! - this.ys[k]!) * t;
    return out;
  }

  angleAt(s: number): number {
    if (s <= 0) return this.ang[0]!;
    if (s >= this.length) return this.ang[this.n - 1]!;
    return this.ang[Math.min(this.n - 1, Math.round(s / STEP))]!;
  }

  inTunnel(s: number): boolean {
    for (let i = 0; i < this.tunnels.length; i++) {
      const t = this.tunnels[i]!;
      if (s >= t[0] - 8 && s <= t[1] + 8) return true;
    }
    return false;
  }

  /** 可被击中：在闸门外、蛇口前、不在石桥下 */
  hittable(s: number): boolean {
    return s >= this.gateLen && s <= this.length && !this.inTunnel(s);
  }
}

/** 圆角折线展开为稠密点列（扁平数组） */
function buildDense(pts: ReadonlyArray<readonly [number, number]>, radius: number): number[] {
  const out: number[] = [];
  const P = pts.map(([x, y]) => ({ x, y }));
  out.push(P[0]!.x, P[0]!.y);
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1]!, b = P[i]!, c = P[i + 1]!;
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = c.x - b.x, d2y = c.y - b.y;
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    const u1x = d1x / l1, u1y = d1y / l1, u2x = d2x / l2, u2y = d2y / l2;
    const cross = u1x * u2y - u1y * u2x;
    const dot = u1x * u2x + u1y * u2y;
    const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (Math.abs(cross) < 1e-6 || theta < 1e-3) {
      out.push(b.x, b.y);
      continue;
    }
    const half = theta / 2;
    let r = radius;
    const maxT = Math.min(l1, l2) * 0.5;
    let tLen = r * Math.tan(half);
    if (tLen > maxT) {
      tLen = maxT;
      r = tLen / Math.tan(half);
    }
    const sx = b.x - u1x * tLen, sy = b.y - u1y * tLen;
    // 圆心：起点沿法线方向偏移 r
    const sign = cross > 0 ? 1 : -1;
    const nx = -u1y * sign, ny = u1x * sign;
    const cx = sx + nx * r, cy = sy + ny * r;
    const a0 = Math.atan2(sy - cy, sx - cx);
    const steps = Math.max(4, Math.ceil((theta * r) / 3));
    out.push(sx, sy);
    for (let k = 1; k <= steps; k++) {
      const a = a0 + sign * theta * (k / steps);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  const last = P[P.length - 1]!;
  out.push(last.x, last.y);
  return out;
}
