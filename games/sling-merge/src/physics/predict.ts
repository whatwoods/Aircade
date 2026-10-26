/**
 * 弹道预测：复用同一个 World 做单体预演（只有静态墙 + 弹射物），
 * 逐子步检测与水果快照的重叠，二分求精确接触点。见 docs §2.4。
 */
import { CONFIG } from '../config';
import { World, type Body } from './world';

export interface Snapshot {
  n: number;
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  level: Int8Array;
  id: Int32Array;
}

export function makeSnapshot(cap = 256): Snapshot {
  return {
    n: 0,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    r: new Float32Array(cap),
    level: new Int8Array(cap),
    id: new Int32Array(cap),
  };
}

const MAX_POINTS = 512;

export interface PredictResult {
  count: number;
  xs: Float32Array;
  ys: Float32Array;
  /** 每个点是否在第 1 次反弹之后 */
  seg: Uint8Array;
  bounceCount: number;
  bx: Float32Array;
  by: Float32Array;
  hit: number; // 快照下标，-1 无
  hitLid: boolean;
  endX: number;
  endY: number;
  ended: boolean; // 有终点幽灵圈（碰到水果或盖子）
}

export function makeResult(): PredictResult {
  return {
    count: 0,
    xs: new Float32Array(MAX_POINTS),
    ys: new Float32Array(MAX_POINTS),
    seg: new Uint8Array(MAX_POINTS),
    bounceCount: 0,
    bx: new Float32Array(8),
    by: new Float32Array(8),
    hit: -1,
    hitLid: false,
    endX: 0,
    endY: 0,
    ended: false,
  };
}

/** 把一颗刚体设为飞行态参数（预测与实际发射共用，保证一致） */
export function applyFlightParams<T>(world: World<T>, b: Body<T>): void {
  b.flight = true;
  b.drag = CONFIG.shot.flightDrag;
  b.wallRest = CONFIG.shot.flightWallRestitution;
  b.massMul = CONFIG.shot.massBoost;
  world.updateMass(b);
}

export class Predictor {
  private world = new World<null>();
  private body: Body<null> | null = null;
  private snap: Snapshot | null = null;
  private out: PredictResult | null = null;
  private r = 0;
  private prevX = 0;
  private prevY = 0;
  private tail = -1;
  private done = false;
  private readonly onSub = (): boolean => this.substep();

  run(x0: number, y0: number, vx: number, vy: number, r: number, snap: Snapshot, out: PredictResult): void {
    const P = CONFIG.preview;
    const dt = CONFIG.physics.fixedDt;
    const sub = CONFIG.physics.substeps;
    const world = this.world;
    world.clear();
    const b = world.createBody(x0, y0, r, null);
    applyFlightParams(world, b);
    b.vx = vx;
    b.vy = vy;
    this.body = b;
    this.snap = snap;
    this.out = out;
    this.r = r;

    out.count = 0;
    out.bounceCount = 0;
    out.hit = -1;
    out.hitLid = false;
    out.ended = false;
    out.endX = x0;
    out.endY = y0;
    out.xs[0] = x0;
    out.ys[0] = y0;
    out.seg[0] = 0;
    out.count = 1;

    this.prevX = x0;
    this.prevY = y0;
    this.tail = -1;
    this.done = false;
    const maxSteps = Math.ceil(P.maxTime / dt);

    for (let s = 0; s < maxSteps && !this.done; s++) {
      world.step(dt, this.onSub);
      if (this.done) break;
      for (let i = 0; i < world.impactCount; i++) {
        const im = world.impacts[i]!;
        if (im.a !== -1 || im.wall === 2) continue;
        if (out.bounceCount < out.bx.length) {
          out.bx[out.bounceCount] = im.x;
          out.by[out.bounceCount] = im.y;
        }
        out.bounceCount++;
        if (out.bounceCount >= P.maxBounces && this.tail < 0) this.tail = 0;
      }
      if (out.count >= MAX_POINTS - sub - 2) break;
    }
    if (!out.ended) {
      out.endX = out.xs[out.count - 1]!;
      out.endY = out.ys[out.count - 1]!;
    }
    this.body = null;
    this.snap = null;
    this.out = null;
  }

  private substep(): boolean {
    const b = this.body!;
    const snap = this.snap!;
    const out = this.out!;
    const P = CONFIG.preview;
    const r = this.r;
    const cx = b.x;
    const cy = b.y;
    const prevX = this.prevX;
    const prevY = this.prevY;
    let best = -1;
    let bestT = 2;
    for (let i = 0; i < snap.n; i++) {
      const rr = r + snap.r[i]!;
      const dx = cx - snap.x[i]!;
      const dy = cy - snap.y[i]!;
      if (dx * dx + dy * dy < rr * rr) {
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < P.refineIters + 4; k++) {
          const m = (lo + hi) * 0.5;
          const mx = prevX + (cx - prevX) * m - snap.x[i]!;
          const my = prevY + (cy - prevY) * m - snap.y[i]!;
          if (mx * mx + my * my < rr * rr) hi = m;
          else lo = m;
        }
        if (lo < bestT) {
          bestT = lo;
          best = i;
        }
      }
    }
    if (best >= 0) {
      out.hit = best;
      out.endX = prevX + (cx - prevX) * bestT;
      out.endY = prevY + (cy - prevY) * bestT;
      out.ended = true;
      this.push(out, out.endX, out.endY, out.bounceCount > 0);
      this.done = true;
      return true;
    }
    const T = this.world.bounds.T;
    if (cy - b.r <= T + 0.01) {
      out.hitLid = true;
      out.endX = cx;
      out.endY = T + b.r;
      out.ended = true;
      this.push(out, out.endX, out.endY, out.bounceCount > 0);
      this.done = true;
      return true;
    }
    if (this.tail >= 0) {
      this.tail += Math.hypot(cx - prevX, cy - prevY);
      if (this.tail >= P.tailAfterLastBounce) {
        this.push(out, cx, cy, true);
        this.done = true;
        return true;
      }
    }
    this.push(out, cx, cy, out.bounceCount > 0);
    this.prevX = cx;
    this.prevY = cy;
    return false;
  }

  private push(out: PredictResult, x: number, y: number, afterBounce: boolean): void {
    if (out.count >= MAX_POINTS) return;
    out.xs[out.count] = x;
    out.ys[out.count] = y;
    out.seg[out.count] = afterBounce ? 1 : 0;
    out.count++;
  }
}
