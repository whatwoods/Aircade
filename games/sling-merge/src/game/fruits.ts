import { CONFIG } from '../config';
import type { Body } from '../physics/world';

export type FruitState = 'flying' | 'active' | 'popping';

export type Expression =
  | 'idle'
  | 'hit'
  | 'dizzy'
  | 'kiss'
  | 'born'
  | 'worried'
  | 'panic'
  | 'relief'
  | 'sleepy'
  | 'sad'
  | 'dead'
  | 'fuse';

export interface FruitVis {
  /** 保面积应变 (a,b) 及其速度 */
  sa: number;
  sb: number;
  sva: number;
  svb: number;
  /** 均匀缩放弹簧 */
  scale: number;
  scaleV: number;
  angle: number;
  flash: number;
  /** 一次性表情及剩余时间 */
  expr: Expression;
  exprT: number;
  blinkT: number;
  blink: number;
  winkT: number;
  lookX: number;
  lookY: number;
  kiss: boolean;
  kissX: number;
  kissY: number;
  heartT: number;
  sweatT: number;
  idleT: number;
  zzzT: number;
  phase: number;
  /** 渲染插值位置（每帧写入） */
  rx: number;
  ry: number;
  /** 危险描边强度 */
  danger: number;
  glow: number;
  trail: number;
  /** 拖尾历史（环形缓冲） */
  tx: Float32Array;
  ty: Float32Array;
  tHead: number;
  tCount: number;
}

export interface Fruit {
  id: number;
  level: number;
  body: Body<Fruit>;
  state: FruitState;
  age: number;
  sinceFirstContact: number;
  wallBounces: number;
  overTime: number;
  bornFromMerge: boolean;
  mergedStamp: number;
  massBoostT: number;
  flightT: number;
  firstFruitContact: boolean;
  /** 被引导锁定（不可合成）等 */
  tutorialTarget: boolean;
  vis: FruitVis;
}

export const TRAIL_LEN = 10;

export function makeVis(phase: number): FruitVis {
  return {
    sa: 0, sb: 0, sva: 0, svb: 0, scale: 1, scaleV: 0, angle: 0, flash: 0,
    expr: 'idle', exprT: 0, blinkT: 2 + phase * 3, blink: 1, winkT: 4 + phase * 6,
    lookX: 0, lookY: 0, kiss: false, kissX: 0, kissY: 0, heartT: phase, sweatT: phase,
    idleT: 0, zzzT: phase * 3, phase: phase * Math.PI * 2, rx: 0, ry: 0, danger: 0, glow: 0, trail: 0,
    tx: new Float32Array(TRAIL_LEN), ty: new Float32Array(TRAIL_LEN), tHead: 0, tCount: 0,
  };
}

export function resetVis(v: FruitVis, phase: number): void {
  v.sa = v.sb = v.sva = v.svb = 0;
  v.scale = 1;
  v.scaleV = 0;
  v.angle = 0;
  v.flash = 0;
  v.expr = 'idle';
  v.exprT = 0;
  v.blinkT = 2 + phase * 3;
  v.blink = 1;
  v.winkT = 4 + phase * 6;
  v.lookX = v.lookY = 0;
  v.kiss = false;
  v.heartT = phase;
  v.sweatT = phase;
  v.idleT = 0;
  v.zzzT = phase * 3;
  v.phase = phase * Math.PI * 2;
  v.danger = 0;
  v.glow = 0;
  v.trail = 0;
  v.tHead = 0;
  v.tCount = 0;
}

/** 表情优先级（数值越大越优先） */
export const EXPR_PRIORITY: Record<Expression, number> = {
  dead: 100,
  sad: 90,
  panic: 80,
  dizzy: 70,
  hit: 60,
  fuse: 55,
  born: 50,
  kiss: 40,
  worried: 30,
  relief: 25,
  sleepy: 10,
  idle: 0,
};


/** 形变弹簧角频率：L1 6Hz → L11 3.2Hz */
export function deformOmega(level: number): number {
  const D = CONFIG.fx.deform;
  const t = (level - 1) / (CONFIG.maxLevel - 1);
  return 2 * Math.PI * (D.freqSmall + (D.freqLarge - D.freqSmall) * t);
}

/** 沿法线 (nx,ny) 压扁（amount>0 压扁，<0 拉长），踢的是应变速度 */
export function kickStrain(v: FruitVis, level: number, nx: number, ny: number, amount: number): void {
  const w = deformOmega(level);
  const c2 = nx * nx - ny * ny;
  const s2 = 2 * nx * ny;
  v.sva -= amount * c2 * w;
  v.svb -= amount * s2 * w;
}

/** 直接设定应变（沿方向拉长 amount） */
export function setStretch(v: FruitVis, dx: number, dy: number, amount: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  v.sa = amount * (nx * nx - ny * ny);
  v.sb = amount * (2 * nx * ny);
}

/** 设置一次性表情（遵守优先级） */
export function setExpr(v: FruitVis, e: Expression, t: number): void {
  if (v.exprT > 0 && EXPR_PRIORITY[v.expr] > EXPR_PRIORITY[e]) return;
  v.expr = e;
  v.exprT = t;
}
