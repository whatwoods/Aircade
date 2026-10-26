/**
 * 自研圆形刚体求解器（软约束子步 + 热启动 + 松弛 + 恢复系数 + 休眠岛）。
 * 设计见 docs/sling-merge.md §2.4。坐标为逻辑像素，y 向下，浮力为 -y。
 */
import { CONFIG } from '../config';

export interface Body<T = unknown> {
  id: number;
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  w: number;
  r: number;
  r0: number;
  r1: number;
  growT: number;
  growDur: number;
  baseMass: number;
  massMul: number;
  invMass: number;
  invI: number;
  drag: number;
  wallRest: number;
  flight: boolean;
  sleeping: boolean;
  sleepTime: number;
  island: number;
  alive: boolean;
  ref: T | null;
  /** 本步接触压力（保面积应变分量），用于视觉形变 */
  pressA: number;
  pressB: number;
  touching: number;
  /** 本步首次接触（碰到水果或盖子）标记 */
  hitFruit: boolean;
  hitLid: boolean;
}

export interface Contact {
  key: number;
  a: number; // 刚体下标；墙为 -1
  b: number;
  wall: number; // -1 非墙；0 左 1 右 2 顶 3 底 4 左下角 5 右下角
  nx: number;
  ny: number;
  sep: number;
  ra: number;
  rb: number;
  normalMass: number;
  tangentMass: number;
  normalImpulse: number;
  tangentImpulse: number;
  maxNormalImpulse: number;
  relVn0: number;
  restitution: number;
  friction: number;
  wasTouching: boolean;
}

export interface ImpactRecord {
  a: number; // 刚体下标或 -1（墙）
  b: number;
  wall: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  speed: number;
}

export interface Bounds {
  L: number;
  R: number;
  T: number;
  B: number;
  cr: number;
}

const MAX_CONTACTS = 2048;
const MAX_IMPACTS = 128;
const HASH_CAP = 4096; // 2 的幂
const WALL_KEY_BASE = 1e9;

function makeContact(): Contact {
  return {
    key: 0, a: -1, b: -1, wall: -1, nx: 0, ny: 0, sep: 0, ra: 0, rb: 0,
    normalMass: 0, tangentMass: 0, normalImpulse: 0, tangentImpulse: 0, maxNormalImpulse: 0,
    relVn0: 0, restitution: 0, friction: 0, wasTouching: false,
  };
}

/** 开放寻址哈希：key → 上一步累计冲量（热启动） */
class ImpulseTable {
  keys = new Float64Array(HASH_CAP);
  normal = new Float32Array(HASH_CAP);
  tangent = new Float32Array(HASH_CAP);
  touching = new Uint8Array(HASH_CAP);
  used = new Uint8Array(HASH_CAP);

  clear(): void {
    this.used.fill(0);
  }

  private slot(key: number): number {
    const a = Math.abs(key);
    const lo = a % 1048576;
    const hi = Math.floor(a / 1048576);
    let h = Math.imul(lo | 0, 0x9e3779b1) ^ Math.imul(hi | 0, 0x85ebca77) ^ (key < 0 ? 0x27d4eb2f : 0);
    h ^= h >>> 15;
    return h & (HASH_CAP - 1);
  }

  put(key: number, n: number, t: number, touching: boolean): void {
    let i = this.slot(key);
    for (let k = 0; k < HASH_CAP; k++) {
      if (!this.used[i] || this.keys[i] === key) {
        this.used[i] = 1;
        this.keys[i] = key;
        this.normal[i] = n;
        this.tangent[i] = t;
        this.touching[i] = touching ? 1 : 0;
        return;
      }
      i = (i + 1) & (HASH_CAP - 1);
    }
  }

  find(key: number): number {
    let i = this.slot(key);
    for (let k = 0; k < HASH_CAP; k++) {
      if (!this.used[i]) return -1;
      if (this.keys[i] === key) return i;
      i = (i + 1) & (HASH_CAP - 1);
    }
    return -1;
  }
}

export class World<T = unknown> {
  bodies: Body<T>[] = [];
  contacts: Contact[] = [];
  contactCount = 0;
  impacts: ImpactRecord[] = [];
  impactCount = 0;
  bounds: Bounds;
  faults = 0;
  /** 静止判定：上一步清醒刚体数 */
  awakeCount = 0;

  private nextId = 1;
  private order: number[] = [];
  private prevTable = new ImpulseTable();
  private curTable = new ImpulseTable();
  private parent: Int32Array = new Int32Array(512);
  private islandMin: Float32Array = new Float32Array(512);
  private bodyPool: Body<T>[] = [];

  constructor(bounds?: Bounds) {
    const inner = CONFIG.layout.jar.inner;
    this.bounds = bounds ?? { L: inner.L, R: inner.R, T: inner.T, B: inner.B, cr: inner.rBottom };
    for (let i = 0; i < MAX_CONTACTS; i++) this.contacts.push(makeContact());
    for (let i = 0; i < MAX_IMPACTS; i++) this.impacts.push({ a: -1, b: -1, wall: -1, x: 0, y: 0, nx: 0, ny: 0, speed: 0 });
  }

  static massFor(r: number): number {
    return Math.pow(r / 14, CONFIG.physics.densityExp);
  }

  createBody(x: number, y: number, r: number, ref: T | null): Body<T> {
    let b = this.bodyPool.pop();
    if (!b) {
      b = {
        id: 0, index: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 0, r: 0, r0: 0, r1: 0, growT: 1, growDur: 0,
        baseMass: 1, massMul: 1, invMass: 1, invI: 1, drag: 0, wallRest: 0, flight: false, sleeping: false,
        sleepTime: 0, island: 0, alive: true, ref: null, pressA: 0, pressB: 0, touching: 0, hitFruit: false, hitLid: false,
      };
    }
    b.id = this.nextId++;
    b.x = b.px = x;
    b.y = b.py = y;
    b.vx = b.vy = b.w = 0;
    b.r = b.r0 = b.r1 = r;
    b.growT = 1;
    b.growDur = 0;
    b.massMul = 1;
    b.drag = CONFIG.physics.linearDrag;
    b.wallRest = CONFIG.physics.wallRestitution;
    b.flight = false;
    b.sleeping = false;
    b.sleepTime = 0;
    b.island = 0;
    b.alive = true;
    b.ref = ref;
    b.pressA = b.pressB = 0;
    b.touching = 0;
    b.hitFruit = b.hitLid = false;
    this.setRadius(b, r, 0);
    b.index = this.bodies.length;
    this.bodies.push(b);
    return b;
  }

  /** 设置目标半径；dur>0 时在 dur 秒内 cubicOut 长大。质量立即取最终值。 */
  setRadius(b: Body<T>, r: number, dur: number): void {
    b.r0 = b.r;
    b.r1 = r;
    if (dur > 0) {
      b.growT = 0;
      b.growDur = dur;
    } else {
      b.r = r;
      b.growT = 1;
    }
    b.baseMass = World.massFor(r);
    this.updateMass(b);
  }

  updateMass(b: Body<T>): void {
    const m = b.baseMass * b.massMul;
    b.invMass = 1 / m;
    b.invI = 1 / (0.5 * m * b.r1 * b.r1);
  }

  removeBody(b: Body<T>): void {
    b.alive = false;
  }

  clear(): void {
    for (const b of this.bodies) {
      b.alive = false;
      b.ref = null;
      this.bodyPool.push(b);
    }
    this.bodies.length = 0;
    this.contactCount = 0;
    this.impactCount = 0;
    this.prevTable.clear();
  }

  wake(b: Body<T>): void {
    if (!b.sleeping) {
      b.sleepTime = 0;
      return;
    }
    const isl = b.island;
    for (const o of this.bodies) {
      if (o.sleeping && o.island === isl) {
        o.sleeping = false;
        o.sleepTime = 0;
      }
    }
    b.sleeping = false;
    b.sleepTime = 0;
  }

  private compact(): void {
    let j = 0;
    const arr = this.bodies;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i]!;
      if (b.alive) {
        b.index = j;
        arr[j++] = b;
      } else {
        b.ref = null;
        this.bodyPool.push(b);
      }
    }
    arr.length = j;
  }

  private addContact(): Contact | null {
    if (this.contactCount >= MAX_CONTACTS) return null;
    return this.contacts[this.contactCount++]!;
  }

  private pushImpact(a: number, b: number, wall: number, x: number, y: number, nx: number, ny: number, speed: number): void {
    if (this.impactCount >= MAX_IMPACTS) return;
    const r = this.impacts[this.impactCount++]!;
    r.a = a; r.b = b; r.wall = wall; r.x = x; r.y = y; r.nx = nx; r.ny = ny; r.speed = speed;
  }

  private findContacts(dt: number): void {
    const P = CONFIG.physics;
    const bodies = this.bodies;
    const n = bodies.length;
    this.contactCount = 0;

    // 插入排序（按左边界）
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = 1; i < n; i++) {
      const v = order[i]!;
      const bv = bodies[v]!;
      const key = bv.x - bv.r;
      let j = i - 1;
      while (j >= 0) {
        const bj = bodies[order[j]!]!;
        if (bj.x - bj.r <= key) break;
        order[j + 1] = order[j]!;
        j--;
      }
      order[j + 1] = v;
    }

    const spec = P.speculative;
    for (let ii = 0; ii < n; ii++) {
      const ia = order[ii]!;
      const A = bodies[ia]!;
      const reachA = A.r + spec * 0.5 + Math.sqrt(A.vx * A.vx + A.vy * A.vy) * dt;
      const growA = A.r1 > A.r ? A.r1 - A.r : 0;
      for (let jj = ii + 1; jj < n; jj++) {
        const ib = order[jj]!;
        const B = bodies[ib]!;
        if (B.x - B.r > A.x + reachA + growA + spec + P.maxSpeed * dt + 16) break;
        const reachB = B.r + spec * 0.5 + Math.sqrt(B.vx * B.vx + B.vy * B.vy) * dt;
        const growB = B.r1 > B.r ? B.r1 - B.r : 0;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const lim = reachA + reachB + growA + growB;
        if (Math.abs(dy) > lim) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > lim * lim) continue;
        const c = this.addContact();
        if (!c) return;
        // 保证 a 的 id 更小，便于确定性
        const first = A.id < B.id ? A : B;
        const second = A.id < B.id ? B : A;
        c.a = first.index;
        c.b = second.index;
        c.wall = -1;
        c.key = this.pairKey(A, B);
        c.ra = first.r;
        c.rb = second.r;
      }
    }

    // 墙接触（每个刚体固定顺序：左 右 顶 底 左下角 右下角）
    const { L, R, T, B: Bot, cr } = this.bounds;
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      if (b.sleeping) continue;
      const reach = spec + Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt + (b.r1 > b.r ? b.r1 - b.r : 0);
      const r = b.r;
      if (b.x - r - L < reach) this.addWall(b, 0);
      if (R - (b.x + r) < reach) this.addWall(b, 1);
      if (b.y - r - T < reach) this.addWall(b, 2);
      if (Bot - (b.y + r) < reach) this.addWall(b, 3);
      if (b.r1 < cr && b.y > Bot - cr - reach) {
        if (b.x < L + cr + reach) this.addWall(b, 4);
        if (b.x > R - cr - reach) this.addWall(b, 5);
      }
    }
  }

  private pairKey(A: Body<T>, B: Body<T>): number {
    const lo = A.id < B.id ? A.id : B.id;
    const hi = A.id < B.id ? B.id : A.id;
    return lo * 1048576 + hi;
  }

  private addWall(b: Body<T>, wall: number): void {
    const c = this.addContact();
    if (!c) return;
    c.a = -1;
    c.b = b.index;
    c.wall = wall;
    c.key = -(WALL_KEY_BASE + b.id * 8 + wall);
    c.ra = 0;
    c.rb = b.r;
  }

  /** 按当前位置计算法线（a→b）与分离量 */
  private evalContact(c: Contact): void {
    const B = this.bodies[c.b]!;
    if (c.wall < 0) {
      const A = this.bodies[c.a]!;
      let dx = B.x - A.x;
      let dy = B.y - A.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6) {
        dx /= d;
        dy /= d;
      } else {
        dx = 0;
        dy = 1;
      }
      c.nx = dx;
      c.ny = dy;
      c.ra = A.r;
      c.rb = B.r;
      c.sep = d - A.r - B.r;
      return;
    }
    const { L, R, T, B: Bot, cr } = this.bounds;
    c.rb = B.r;
    switch (c.wall) {
      case 0:
        c.nx = 1; c.ny = 0; c.sep = B.x - B.r - L;
        break;
      case 1:
        c.nx = -1; c.ny = 0; c.sep = R - B.x - B.r;
        break;
      case 2:
        c.nx = 0; c.ny = 1; c.sep = B.y - B.r - T;
        break;
      case 3:
        c.nx = 0; c.ny = -1; c.sep = Bot - B.y - B.r;
        break;
      default: {
        const cx = c.wall === 4 ? L + cr : R - cr;
        const cy = Bot - cr;
        const inRegion = (c.wall === 4 ? B.x < cx : B.x > cx) && B.y > cy;
        let dx = cx - B.x;
        let dy = cy - B.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (!inRegion || d < 1e-6) {
          c.nx = 0; c.ny = -1; c.sep = 1e6;
          return;
        }
        dx /= d;
        dy /= d;
        c.nx = dx;
        c.ny = dy;
        c.sep = cr - B.r - d;
      }
    }
  }

  step(dt: number, onSubstep?: (sub: number) => boolean): void {
    const P = CONFIG.physics;
    this.compact();
    const bodies = this.bodies;
    const n = bodies.length;
    this.impactCount = 0;

    // 长大（半径插值）——在接触生成前更新
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      if (b.growT < 1) {
        b.growT = Math.min(1, b.growT + dt / b.growDur);
        const k = 1 - Math.pow(1 - b.growT, 3);
        b.r = b.r0 + (b.r1 - b.r0) * k;
        if (b.sleeping) this.wake(b);
      }
      b.px = b.x;
      b.py = b.y;
      b.pressA = b.pressB = 0;
      b.touching = 0;
      b.hitFruit = b.hitLid = false;
    }

    this.curTable.clear();
    this.findContacts(dt);
    const sub = P.substeps;
    const h = dt / sub;
    const invH = 1 / h;

    // 软约束系数
    const omega = 2 * Math.PI * P.contactHertz;
    const a1 = 2 * P.contactDampingRatio + h * omega;
    const a2 = h * omega * a1;
    const a3 = 1 / (1 + a2);
    const biasRate = omega / a1;
    const massScale = a2 * a3;
    const impulseScale = a3;
    const slop = P.linearSlop;
    const maxPush = P.maxPushSpeed;

    // 预计算 + 唤醒
    const cs = this.contacts;
    const cc = this.contactCount;
    for (let i = 0; i < cc; i++) {
      const c = cs[i]!;
      this.evalContact(c);
      const B = bodies[c.b]!;
      const A = c.a >= 0 ? bodies[c.a]! : null;
      if (A && (A.sleeping !== B.sleeping)) {
        const sleeper = A.sleeping ? A : B;
        const other = A.sleeping ? B : A;
        const rvx = B.vx - (A ? A.vx : 0);
        const rvy = B.vy - (A ? A.vy : 0);
        const vn = rvx * c.nx + rvy * c.ny;
        if (c.sep < P.speculative && (vn < -P.wakeSpeed || other.sleepTime < P.sleepTime || other.growT < 1)) {
          this.wake(sleeper);
        }
      }
    }

    for (let i = 0; i < cc; i++) {
      const c = cs[i]!;
      const B = bodies[c.b]!;
      const A = c.a >= 0 ? bodies[c.a]! : null;
      const invMa = A && !A.sleeping ? A.invMass : 0;
      const invIa = A && !A.sleeping ? A.invI : 0;
      const invMb = B.sleeping ? 0 : B.invMass;
      const invIb = B.sleeping ? 0 : B.invI;
      const kN = invMa + invMb;
      c.normalMass = kN > 0 ? 1 / kN : 0;
      const kT = kN + invIa * c.ra * c.ra + invIb * c.rb * c.rb;
      c.tangentMass = kT > 0 ? 1 / kT : 0;
      const avx = A ? A.vx : 0;
      const avy = A ? A.vy : 0;
      c.relVn0 = (B.vx - avx) * c.nx + (B.vy - avy) * c.ny;
      if (c.wall >= 0) {
        c.restitution = B.wallRest;
        c.friction = P.wallFriction;
      } else {
        c.restitution = A!.flight || B.flight ? CONFIG.shot.firstImpactRestitution : P.restitution;
        c.friction = P.friction;
      }
      const f = this.prevTable.find(c.key);
      if (f >= 0) {
        c.normalImpulse = this.prevTable.normal[f]!;
        c.tangentImpulse = this.prevTable.tangent[f]!;
        c.wasTouching = this.prevTable.touching[f] === 1;
      } else {
        c.normalImpulse = 0;
        c.tangentImpulse = 0;
        c.wasTouching = false;
      }
      c.maxNormalImpulse = 0;
    }

    const by = -P.buoyancy;
    const angDragK = P.angularDrag;
    const maxSpeed = P.maxSpeed;

    let aborted = false;
    for (let s = 0; s < sub; s++) {
      // a. 积分速度
      for (let i = 0; i < n; i++) {
        const b = bodies[i]!;
        if (b.sleeping) continue;
        const k = 1 / (1 + h * b.drag);
        b.vx = b.vx * k;
        b.vy = (b.vy + by * h) * k;
        b.w = b.w / (1 + h * angDragK);
      }
      // b. 热启动
      for (let i = 0; i < cc; i++) {
        const c = cs[i]!;
        if (c.normalMass === 0) continue;
        const B = bodies[c.b]!;
        const A = c.a >= 0 ? bodies[c.a]! : null;
        const tx = -c.ny;
        const ty = c.nx;
        const Px = c.normalImpulse * c.nx + c.tangentImpulse * tx;
        const Py = c.normalImpulse * c.ny + c.tangentImpulse * ty;
        if (A && !A.sleeping) {
          A.vx -= A.invMass * Px;
          A.vy -= A.invMass * Py;
          A.w -= A.invI * c.ra * c.tangentImpulse;
        }
        if (!B.sleeping) {
          B.vx += B.invMass * Px;
          B.vy += B.invMass * Py;
          B.w -= B.invI * c.rb * c.tangentImpulse;
        }
      }
      // c. 求解（带偏置）
      this.solve(true, invH, biasRate, massScale, impulseScale, slop, maxPush);
      // d. 积分位置
      for (let i = 0; i < n; i++) {
        const b = bodies[i]!;
        if (b.sleeping) continue;
        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > maxSpeed * maxSpeed) {
          const k = maxSpeed / Math.sqrt(sp2);
          b.vx *= k;
          b.vy *= k;
        }
        b.x += b.vx * h;
        b.y += b.vy * h;
      }
      // e. 松弛
      this.solve(false, invH, biasRate, massScale, impulseScale, slop, maxPush);
      if (onSubstep && onSubstep(s)) {
        aborted = true;
        break;
      }
    }

    if (!aborted) {
      // 恢复系数
      const thr = P.restitutionThreshold;
      for (let i = 0; i < cc; i++) {
        const c = cs[i]!;
        if (c.normalMass === 0) continue;
        if (c.relVn0 > -thr || c.maxNormalImpulse === 0) continue;
        if (c.restitution === 0) continue;
        const B = bodies[c.b]!;
        const A = c.a >= 0 ? bodies[c.a]! : null;
        const rvx = B.vx - (A ? A.vx : 0);
        const rvy = B.vy - (A ? A.vy : 0);
        const vn = rvx * c.nx + rvy * c.ny;
        const imp = -c.normalMass * (vn + c.restitution * c.relVn0);
        const newImp = Math.max(c.normalImpulse + imp, 0);
        const d = newImp - c.normalImpulse;
        c.normalImpulse = newImp;
        if (newImp > c.maxNormalImpulse) c.maxNormalImpulse = newImp;
        if (A && !A.sleeping) {
          A.vx -= A.invMass * d * c.nx;
          A.vy -= A.invMass * d * c.ny;
        }
        if (!B.sleeping) {
          B.vx += B.invMass * d * c.nx;
          B.vy += B.invMass * d * c.ny;
        }
      }
    }

    // 存储冲量 / 接触信息 / 冲击事件
    const buoy = P.buoyancy;
    for (let i = 0; i < cc; i++) {
      const c = cs[i]!;
      if (c.normalMass === 0) {
        // 双方都休眠：不求解，保留旧冲量供唤醒后热启动
        this.curTable.put(c.key, c.normalImpulse, c.tangentImpulse, c.wasTouching);
        continue;
      }
      const touching = c.maxNormalImpulse > 0 || c.sep <= slop;
      this.curTable.put(c.key, c.normalImpulse, c.tangentImpulse, touching);
      const B = bodies[c.b]!;
      const A = c.a >= 0 ? bodies[c.a]! : null;
      if (touching) {
        B.touching++;
        if (A) {
          A.touching++;
          A.hitFruit = true;
          B.hitFruit = true;
        } else if (c.wall === 2) {
          B.hitLid = true;
        }
      }
      if (c.normalImpulse > 0) {
        const c2 = c.nx * c.nx - c.ny * c.ny;
        const s2 = 2 * c.nx * c.ny;
        const pb = c.normalImpulse / ((B.baseMass * B.massMul) * buoy * h);
        B.pressA += pb * c2;
        B.pressB += pb * s2;
        if (A) {
          const pa = c.normalImpulse / ((A.baseMass * A.massMul) * buoy * h);
          A.pressA += pa * c2;
          A.pressB += pa * s2;
        }
      }
      if (c.maxNormalImpulse > 0 && !c.wasTouching && c.relVn0 < -20) {
        const px = B.x - c.nx * B.r;
        const py = B.y - c.ny * B.r;
        this.pushImpact(c.a, c.b, c.wall, px, py, c.nx, c.ny, -c.relVn0);
      }
    }
    const tmp = this.prevTable;
    this.prevTable = this.curTable;
    this.curTable = tmp;

    this.clampAndSleep(dt);
  }

  private solve(
    useBias: boolean,
    invH: number,
    biasRate: number,
    massScaleSoft: number,
    impulseScaleSoft: number,
    slop: number,
    maxPush: number,
  ): void {
    const bodies = this.bodies;
    const cs = this.contacts;
    const cc = this.contactCount;
    for (let i = 0; i < cc; i++) {
      const c = cs[i]!;
      if (c.normalMass === 0) continue;
      const B = bodies[c.b]!;
      const A = c.a >= 0 ? bodies[c.a]! : null;
      this.evalContact(c);
      const s = c.sep;
      let bias = 0;
      let mScale = 1;
      let iScale = 0;
      if (s > 0) {
        bias = s * invH;
      } else if (useBias) {
        const se = Math.min(0, s + slop);
        bias = Math.max(biasRate * se, -maxPush);
        mScale = massScaleSoft;
        iScale = impulseScaleSoft;
      }
      const aAwake = A !== null && !A.sleeping;
      const bAwake = !B.sleeping;
      const avx = A ? A.vx : 0;
      const avy = A ? A.vy : 0;
      const aw = A ? A.w : 0;
      // 法向
      const vn = (B.vx - avx) * c.nx + (B.vy - avy) * c.ny;
      let imp = -c.normalMass * mScale * (vn + bias) - iScale * c.normalImpulse;
      let newImp = c.normalImpulse + imp;
      if (newImp < 0) newImp = 0;
      imp = newImp - c.normalImpulse;
      c.normalImpulse = newImp;
      if (newImp > c.maxNormalImpulse) c.maxNormalImpulse = newImp;
      if (imp !== 0) {
        const px = imp * c.nx;
        const py = imp * c.ny;
        if (aAwake) {
          A!.vx -= A!.invMass * px;
          A!.vy -= A!.invMass * py;
        }
        if (bAwake) {
          B.vx += B.invMass * px;
          B.vy += B.invMass * py;
        }
      }
      // 切向（摩擦）
      const tx = -c.ny;
      const ty = c.nx;
      const avx2 = A ? A.vx : 0;
      const avy2 = A ? A.vy : 0;
      const vt = (B.vx - avx2) * tx + (B.vy - avy2) * ty - c.rb * B.w - c.ra * aw;
      const maxF = c.friction * c.normalImpulse;
      let timp = -c.tangentMass * vt;
      let newT = c.tangentImpulse + timp;
      if (newT > maxF) newT = maxF;
      else if (newT < -maxF) newT = -maxF;
      timp = newT - c.tangentImpulse;
      c.tangentImpulse = newT;
      if (timp !== 0) {
        const px = timp * tx;
        const py = timp * ty;
        if (aAwake) {
          A!.vx -= A!.invMass * px;
          A!.vy -= A!.invMass * py;
          A!.w -= A!.invI * c.ra * timp;
        }
        if (bAwake) {
          B.vx += B.invMass * px;
          B.vy += B.invMass * py;
          B.w -= B.invI * c.rb * timp;
        }
      }
    }
  }

  private readonly findRoot = (i: number): number => {
    const parent = this.parent;
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };

  private clampAndSleep(dt: number): void {
    const P = CONFIG.physics;
    const { L, R, T, B: Bot, cr } = this.bounds;
    const bodies = this.bodies;
    const n = bodies.length;
    const sl2 = P.sleepLinear * P.sleepLinear;
    const sa = P.sleepAngular;

    if (this.parent.length < n) {
      this.parent = new Int32Array(n * 2);
      this.islandMin = new Float32Array(n * 2);
    }
    const parent = this.parent;

    let awake = 0;
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      parent[i] = i;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy) || !Number.isFinite(b.w)) {
        this.faults++;
        b.x = (L + R) / 2;
        b.y = (T + Bot) / 2;
        b.vx = b.vy = b.w = 0;
      }
      const r = b.r;
      // 硬钳制
      if (b.x < L + r) {
        b.x = L + r;
        if (b.vx < 0) b.vx = 0;
      } else if (b.x > R - r) {
        b.x = R - r;
        if (b.vx > 0) b.vx = 0;
      }
      if (b.y < T + r) {
        b.y = T + r;
        if (b.vy < 0) b.vy = 0;
      } else if (b.y > Bot - r) {
        b.y = Bot - r;
        if (b.vy > 0) b.vy = 0;
      }
      if (r < cr && b.y > Bot - cr) {
        const cx = b.x < L + cr ? L + cr : b.x > R - cr ? R - cr : NaN;
        if (!Number.isNaN(cx)) {
          const cy = Bot - cr;
          const dx = b.x - cx;
          const dy = b.y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          const maxD = cr - r;
          if (d > maxD && d > 1e-6) {
            const ux = dx / d;
            const uy = dy / d;
            b.x = cx + ux * maxD;
            b.y = cy + uy * maxD;
            const vo = b.vx * ux + b.vy * uy;
            if (vo > 0) {
              b.vx -= vo * ux;
              b.vy -= vo * uy;
            }
          }
        }
      }
      if (!b.sleeping) {
        awake++;
        if (b.vx * b.vx + b.vy * b.vy < sl2 && Math.abs(b.w) < sa && b.growT >= 1 && !b.flight) b.sleepTime += dt;
        else b.sleepTime = 0;
      }
    }
    this.awakeCount = awake;

    // 休眠岛（并查集）
    const find = this.findRoot;
    const cs = this.contacts;
    for (let i = 0; i < this.contactCount; i++) {
      const c = cs[i]!;
      if (c.a < 0) continue;
      const linked = c.normalMass === 0 ? c.wasTouching : c.maxNormalImpulse > 0 || c.sep <= P.linearSlop * 2;
      if (linked) {
        const ra = find(c.a);
        const rb = find(c.b);
        if (ra !== rb) parent[ra] = rb;
      }
    }
    const mins = this.islandMin;
    for (let i = 0; i < n; i++) mins[i] = 1e9;
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      const root = find(i);
      const st = b.sleeping ? 1e8 : b.sleepTime;
      if (st < mins[root]!) mins[root] = st;
    }
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      const root = find(i);
      b.island = bodies[root]!.id;
      if (mins[root]! >= P.sleepTime) {
        if (!b.sleeping) {
          b.sleeping = true;
          b.vx = b.vy = b.w = 0;
        }
      } else if (b.sleeping) {
        b.sleeping = false;
      }
    }
  }
}
