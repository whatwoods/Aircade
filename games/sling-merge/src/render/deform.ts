/**
 * 视觉状态推进（docs §4.5 / §4.6）：保面积应变弹簧、均匀缩放弹簧、视觉角回正、
 * 眨眼/眨单眼、视线、表情决议、拖尾记录。纯视觉，不影响物理。
 */
import { CONFIG } from '../config';
import { rngFx } from '../core/rng';
import { wrapAngle } from '../core/math';
import { deformOmega, EXPR_PRIORITY, TRAIL_LEN, type Expression, type Fruit, type FruitVis } from '../game/fruits';
import type { Game } from '../game/game';

const D = CONFIG.fx.deform;

export interface VisHooks {
  heart(x: number, y: number): void;
  zzz(x: number, y: number, r: number): void;
  sweat(x: number, y: number, r: number): void;
  tear(x: number, y: number, r: number): void;
  glint(x: number, y: number, r: number): void;
}

/** 应变弹簧一步（目标 ta,tb） */
export function stepStrain(v: FruitVis, level: number, ta: number, tb: number, dt: number): void {
  if (dt <= 0) return;
  const w = deformOmega(level);
  const z = D.damping;
  // 自适应子步：保证 h·ω ≤ 0.4（掉帧/大 dt 时也绝对稳定）
  const n = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const aa = w * w * (ta - v.sa) - 2 * z * w * v.sva;
    const ab = w * w * (tb - v.sb) - 2 * z * w * v.svb;
    v.sva += aa * h;
    v.svb += ab * h;
    v.sa += v.sva * h;
    v.sb += v.svb * h;
  }
  const m2 = v.sa * v.sa + v.sb * v.sb;
  const mx = D.maxStrain;
  if (m2 > mx * mx) {
    const k = mx / Math.sqrt(m2);
    v.sa *= k;
    v.sb *= k;
    v.sva *= 0.5;
    v.svb *= 0.5;
  }
}

/** 均匀缩放弹簧（5 Hz，ζ 0.3：0.7 → 1.12 → 1） */
export function stepScale(v: FruitVis, dt: number, target = 1, freq = 5, zeta = 0.3): void {
  if (dt <= 0) return;
  const w = 2 * Math.PI * freq;
  const n = Math.min(16, Math.max(1, Math.ceil(dt * w * 2.5)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = w * w * (target - v.scale) - 2 * zeta * w * v.scaleV;
    v.scaleV += a * h;
    v.scale += v.scaleV * h;
  }
  // 安全钳制（视觉量，永不发散）
  if (!(v.scale > 0)) {
    v.scale = 0;
    if (!(v.scaleV > 0)) v.scaleV = 0;
  } else if (v.scale > 2.5) {
    v.scale = 2.5;
    v.scaleV = 0;
  }
}

/** 眨眼：返回眼睛张开度 */
export function stepBlink(v: FruitVis, dt: number): number {
  v.blinkT -= dt;
  if (v.blinkT <= 0) {
    v.blinkT = 2.5 + rngFx.next() * 3;
    v.blink = 0;
  }
  if (v.blink < 0.18) {
    v.blink += dt;
    const t = v.blink;
    if (t < 0.06) return 1 - (t / 0.06) * 0.9;
    if (t < 0.1) return 0.1;
    if (t < 0.18) return 0.1 + ((t - 0.1) / 0.08) * 0.9;
  }
  return 1;
}

/** 眨单眼（樱桃）：返回是否正在眨 */
export function stepWink(v: FruitVis, dt: number): boolean {
  if (v.winkT > 0) {
    v.winkT -= dt;
    if (v.winkT <= 0) v.winkT = -0.4;
    return false;
  }
  v.winkT += dt;
  if (v.winkT >= 0) v.winkT = 4 + rngFx.next() * 6;
  return v.winkT < 0;
}

export function smoothLook(v: FruitVis, tx: number, ty: number, dt: number): void {
  const k = 1 - Math.exp(-8 * dt);
  v.lookX += (tx - v.lookX) * k;
  v.lookY += (ty - v.lookY) * k;
}

/** 决议当前表情（优先级；无闭包，避免每帧分配） */
export function resolveExpr(f: Fruit, g: Game): Expression {
  if (g.forceExpr) return g.forceExpr;
  const v = f.vis;
  let best: Expression = 'idle';
  let bp = 0;
  if (v.exprT > 0) {
    best = v.expr;
    bp = EXPR_PRIORITY[v.expr];
  }
  // 持续表情按优先级：惊恐 > 期待 > 担忧 > 犯困
  let cand: Expression = 'idle';
  const playing = g.scene === 'playing' && f.state === 'active';
  if (playing && f.overTime > 0.05) cand = 'panic';
  else if (v.kiss && f.state === 'active') cand = 'kiss';
  else if (
    playing &&
    g.dangerLevel >= 1 &&
    f.sinceFirstContact >= CONFIG.danger.graceAfterContact &&
    f.body.y + f.body.r > CONFIG.layout.dangerY - CONFIG.danger.warnDistance
  ) {
    cand = 'worried';
  }
  if (cand === 'idle' && v.idleT > 10 && f.level >= 4 && g.dangerLevel === 0 && (g.scene === 'playing' || g.scene === 'title')) {
    cand = 'sleepy';
  }
  if (EXPR_PRIORITY[cand] > bp) best = cand;
  return best;
}

const lookTmp = { x: 0, y: 0 };

/** 每帧推进所有水果的视觉状态 */
export function updateFruitVisuals(g: Game, dt: number, alpha: number, t: number, hooks: VisHooks): void {
  const fl = g.flying;
  const s = g.sling;
  // 共同视线目标
  let hasTarget = false;
  if (fl && fl.body.alive) {
    lookTmp.x = fl.body.x;
    lookTmp.y = fl.body.y;
    hasTarget = true;
  } else if (s.aiming && g.scene === 'playing') {
    lookTmp.x = s.cx;
    lookTmp.y = s.cy;
    hasTarget = true;
  } else if (g.scene === 'title' && g.lookActive) {
    lookTmp.x = g.lookX;
    lookTmp.y = g.lookY;
    hasTarget = true;
  }
  const K = D.pressureK;
  const pmax = D.pressureMax;
  for (const f of g.fruits) {
    const v = f.vis;
    const b = f.body;
    v.rx = b.px + (b.x - b.px) * alpha;
    v.ry = b.py + (b.y - b.py) * alpha;
    if (dt <= 0) continue;
    // 应变目标
    let ta = 0;
    let tb = 0;
    if (b.touching === 0) {
      const v2 = b.vx * b.vx + b.vy * b.vy;
      if (v2 > 4) {
        const sp = Math.sqrt(v2);
        const st = Math.min(sp / D.stretchRefSpeed, 1) * D.stretchMax;
        ta = (st * (b.vx * b.vx - b.vy * b.vy)) / v2;
        tb = (st * (2 * b.vx * b.vy)) / v2;
      }
    } else {
      ta = K * -b.pressA;
      tb = K * -b.pressB;
      const m2 = ta * ta + tb * tb;
      if (m2 > pmax * pmax) {
        const k = pmax / Math.sqrt(m2);
        ta *= k;
        tb *= k;
      }
    }
    stepStrain(v, f.level, ta, tb, dt);
    stepScale(v, dt, 1, f.level === 11 ? 3.6 : 5, 0.3);
    // 视觉角：跟随物理角速度，再指数回正
    v.angle = wrapAngle(v.angle + b.w * dt);
    v.angle *= Math.exp(-3 * dt);
    if (v.flash > 0) v.flash = Math.max(0, v.flash - dt / 0.12);
    if (v.exprT > 0) v.exprT -= dt;
    // 静止计时（犯困）
    if (b.sleeping || b.vx * b.vx + b.vy * b.vy < 64) v.idleT += dt;
    else v.idleT = 0;
    // 危险描边
    const dTarget = f.overTime > 0.05 ? 1 : 0;
    v.danger += (dTarget - v.danger) * Math.min(1, dt * 8);
    // 视线
    let tx: number;
    let ty: number;
    if (hasTarget && fl !== f) {
      const dx = lookTmp.x - b.x;
      const dy = lookTmp.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = Math.min(1, d / 50);
      tx = (dx / d) * k;
      ty = (dy / d) * k;
    } else if (v.kiss) {
      const dx = v.kissX - b.x;
      const dy = v.kissY - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      tx = dx / d;
      ty = dy / d;
    } else {
      tx = Math.sin(t * 0.37 + v.phase) * 0.7;
      ty = Math.cos(t * 0.29 + v.phase * 1.3) * 0.45 + (f.level === 1 ? 0.5 : 0);
    }
    smoothLook(v, tx, ty, dt);
    // 拖尾
    if (f.state === 'flying') v.trail = 1;
    else if (v.trail > 0) v.trail = Math.max(0, v.trail - dt * 3.5);
    if (v.trail > 0) {
      v.tHead = (v.tHead + 1) % TRAIL_LEN;
      v.tx[v.tHead] = v.rx;
      v.ty[v.tHead] = v.ry;
      if (v.tCount < TRAIL_LEN) v.tCount++;
    } else {
      v.tCount = 0;
    }
    // 粒子型表情附件
    const e = resolveExpr(f, g);
    const r = b.r;
    if (e === 'kiss' && v.kiss && v.kissX > b.x - 0.01) {
      v.heartT -= dt;
      if (v.heartT <= 0) {
        v.heartT = 0.6;
        hooks.heart((b.x + v.kissX) * 0.5, (b.y + v.kissY) * 0.5 - r * 0.3);
      }
    } else if (e === 'sleepy' || (e === 'idle' && f.level === 8)) {
      v.zzzT -= dt;
      if (v.zzzT <= 0) {
        v.zzzT = e === 'sleepy' ? 3 : 5.5;
        hooks.zzz(b.x + r * 0.55, b.y - r * 0.7, r);
      }
    } else if (e === 'panic') {
      v.sweatT -= dt;
      if (v.sweatT <= 0) {
        v.sweatT = 0.22;
        hooks.sweat(b.x, b.y, r);
      }
    } else if (e === 'sad') {
      v.sweatT -= dt;
      if (v.sweatT <= 0) {
        v.sweatT = 0.5 + rngFx.next() * 0.3;
        hooks.tear(b.x, b.y, r);
      }
    }
    if (f.level === 11) {
      v.glow -= dt;
      if (v.glow <= 0) {
        v.glow = 0.8;
        hooks.glint(b.x, b.y, r);
      }
    }
  }
}
