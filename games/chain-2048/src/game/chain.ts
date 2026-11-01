/**
 * 链条模型（docs §2.3 / §3.3 / §3.4 / §3.6）。纯逻辑，可在 Node 里运行。
 * balls[0] 是链头（最靠近蛇口），balls[n-1] 是链尾。相邻两珠 s 差 ≤ D+eps 视为同段紧贴。
 */
import { CONFIG, type StageCfg } from '../config.ts';
import type { Rng } from '../core/rng.ts';
import type { Track } from './track.ts';
import { Spawner } from './spawner.ts';

export interface Ball {
  id: number;
  level: number;
  s: number;
  /** 视觉偏移：模型跳变时累加，渲染时衰减到 0 */
  rOff: number;
  /** 视觉偏移的衰减速率（1/s） */
  rRate: number;
  /** 判定时刻（chain.time），-1 = 不需要 */
  check: number;
  /** 所属连锁 id（-1 = 环境） */
  cid: number;
  /** 该珠由连锁的第几步产生 */
  step: number;
  /** 封印倒计时（>0 表示正在封印定格） */
  sealT: number;
  /** 视觉：插入滑入（从 fromX,fromY 到槽位），剩余时间 */
  insT: number;
  fromX: number;
  fromY: number;
  /** 视觉：合成弹出计时（从 1 衰减到 0） */
  pop: number;
  /** 视觉：数字翻转（失效等），出生时间 */
  born: number;
  /** 由三合一产生 */
  triple: boolean;
}

export interface MergeEvent {
  ball: Ball;
  /** 被吞掉的珠子的轨道位置（视觉用） */
  fromS: number[];
  level: number;
  cid: number;
  step: number;
  triple: boolean;
}

export interface ChainEvents {
  inserted: { ball: Ball; merge: boolean };
  merged: MergeEvent;
  sealStart: { ball: Ball; cid: number; step: number; over: boolean };
  sealed: { s: number; level: number; cid: number; step: number; over: boolean };
  joined: { s: number; attract: boolean };
  cascadeEnd: { cid: number; steps: number };
  swallowed: { ball: Ball };
  cashed: { ball: Ball };
  levelGone: { level: number };
  pulled: { s: number; ds: number };
}

export type ChainListener = <K extends keyof ChainEvents>(k: K, p: ChainEvents[K]) => void;

let NEXT_ID = 1;

export type ChainMode = 'intro' | 'live' | 'retreat' | 'rush' | 'frozenTutorial';

export class Chain {
  readonly track: Track;
  readonly cfg: StageCfg;
  readonly balls: Ball[] = [];
  readonly spawner: Spawner;
  time = 0;
  /** 关内时间（用于 creep） */
  stageT = 0;
  freeze = 0;
  mode: ChainMode = 'intro';
  spawning = true;
  /** 调试推进倍率 */
  speedMul = 1;
  /** 退潮/吞噬计时与「点击跳过」倍率 */
  modeT = 0;
  skipMul = 1;
  /** 当前推进速度（px/s，供音效/画面） */
  speed = 0;
  /** 最近一次封印的连锁信息（回吸接合时延续） */
  private lastSeal = { cid: -1, step: 0, t: -99 };
  private emit: ChainListener;
  private readonly D = CONFIG.ball.D;
  private readonly eps = CONFIG.ball.joinEps;
  /** 每个连锁的最大步数（用于 cascadeEnd） */
  private cascadeSteps = new Map<number, number>();
  private levelCounts = new Int32Array(24);

  constructor(track: Track, cfg: StageCfg, rng: Rng, emit: ChainListener) {
    this.track = track;
    this.cfg = cfg;
    this.spawner = new Spawner(cfg, rng);
    this.emit = emit;
  }

  get L(): number {
    return this.track.length;
  }

  headS(): number {
    return this.balls.length ? this.balls[0]!.s : 0;
  }

  headProgress(): number {
    return this.balls.length ? Math.max(0, this.balls[0]!.s / this.track.length) : 0;
  }

  /** 是否与后一颗紧贴 */
  connected(i: number): boolean {
    const a = this.balls[i], b = this.balls[i + 1];
    return !!a && !!b && a.s - b.s <= this.D + this.eps;
  }

  segStart(i: number): number {
    while (i > 0 && this.connected(i - 1)) i--;
    return i;
  }

  segEnd(i: number): number {
    while (i < this.balls.length - 1 && this.connected(i)) i++;
    return i;
  }

  indexOf(id: number): number {
    for (let i = 0; i < this.balls.length; i++) if (this.balls[i]!.id === id) return i;
    return -1;
  }

  makeBall(level: number, s: number): Ball {
    return {
      id: NEXT_ID++, level, s, rOff: 0, rRate: 9, check: -1, cid: -1, step: 0, sealT: 0,
      insT: 0, fromX: 0, fromY: 0, pop: 0, born: this.time, triple: false,
    };
  }

  /** 用给定等级重建（调试/引导）。levels 从链头到链尾。 */
  setLevels(levels: number[], headS: number): void {
    this.balls.length = 0;
    for (let i = 0; i < levels.length; i++) this.balls.push(this.makeBall(levels[i]!, headS - i * this.D));
    this.recount();
  }

  recount(): void {
    this.levelCounts.fill(0);
    for (const b of this.balls) if (b.level < 24) this.levelCounts[b.level]!++;
  }

  countLevel(l: number): number {
    return l < 24 ? this.levelCounts[l]! : 0;
  }

  private shift(from: number, to: number, ds: number, rate = 9): void {
    for (let k = from; k <= to; k++) {
      const b = this.balls[k]!;
      b.s += ds;
      b.rOff -= ds;
      b.rRate = rate;
    }
  }

  /** 推进速度（docs §3.6） */
  pushSpeed(): number {
    const P = CONFIG.push;
    if (this.mode === 'intro') return P.introSpeed;
    const p = this.headProgress();
    let v = this.cfg.vBase * (1 + this.cfg.creep * this.stageT);
    if (p < P.rubberTo) v *= 1 + P.rubber * ((P.rubberTo - p) / P.rubberTo);
    if (p > P.nearFrom) v *= P.nearMul;
    return v * this.speedMul;
  }

  step(dt: number): void {
    this.time += dt;
    // 视觉偏移衰减与计时
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i]!;
      if (b.rOff !== 0) {
        b.rOff *= Math.exp(-b.rRate * dt);
        if (Math.abs(b.rOff) < 0.05) b.rOff = 0;
      }
      if (b.insT > 0) b.insT = Math.max(0, b.insT - dt);
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 5.5);
    }
    this.processSeals(dt);
    this.processChecks();

    if (this.mode === 'retreat' || this.mode === 'rush') this.modeT += dt;
    else this.modeT = 0;
    if (this.mode === 'retreat') {
      // 退潮/吞噬随时间加速，保证长链也在 ~2–3 s 内结束（docs §11）
      this.moveAll(-CONFIG.push.retreatSpeed * (1 + CONFIG.push.endAccel * this.modeT) * this.skipMul * dt);
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i]!;
        if (b.s + b.rOff < -8) {
          this.balls.splice(i, 1);
          this.emit('cashed', { ball: b });
        }
      }
      this.recount();
      return;
    }
    if (this.mode === 'rush') {
      this.moveAll(CONFIG.push.failRushSpeed * (1 + CONFIG.push.endAccel * this.modeT) * this.skipMul * dt);
      while (this.balls.length && this.balls[0]!.s >= this.L + 4) {
        const b = this.balls.shift()!;
        this.emit('swallowed', { ball: b });
      }
      this.recount();
      return;
    }
    if (this.mode === 'frozenTutorial') {
      this.speed = 0;
      return;
    }
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      this.speed = 0;
      return;
    }
    if (this.mode === 'live') this.stageT += dt;

    // 1. 尾段推进
    const v = this.pushSpeed();
    this.speed = v;
    const n = this.balls.length;
    if (n > 0) {
      const ts = this.segStart(n - 1);
      for (let k = ts; k < n; k++) this.balls[k]!.s += v * dt;
    }
    // 2. 回吸（缺口两端相同时，前段向后滑）
    this.attract(dt);
    // 3. 前向约束（推挤与接合）
    this.constrain(false);
    // 4. 入口补珠
    this.spawn();
    if (this.mode === 'intro' && this.headProgress() >= CONFIG.push.introTo) this.mode = 'live';
  }

  private moveAll(ds: number): void {
    for (let i = 0; i < this.balls.length; i++) this.balls[i]!.s += ds;
  }

  spawn(): void {
    if (!this.spawning) return;
    const D = this.D;
    let guard = 0;
    while (guard++ < 64) {
      const n = this.balls.length;
      const tailS = n ? this.balls[n - 1]!.s : D; // 空链：从 0 开始出
      if (n && tailS < D) break;
      const s = n ? tailS - D : 0;
      const b = this.makeBall(this.spawner.next(), s);
      this.balls.push(b);
      if (b.level < 24) this.levelCounts[b.level]!++;
      if (!n) break;
    }
  }

  private attract(dt: number): void {
    const D = this.D;
    const sp = CONFIG.seal.attractSpeed * dt;
    // 从链头往后找缺口
    for (let i = 0; i < this.balls.length - 1; i++) {
      const a = this.balls[i]!, b = this.balls[i + 1]!;
      if (a.s - b.s <= D + this.eps) continue;
      if (a.level !== b.level || a.sealT > 0 || b.sealT > 0) continue;
      // 前段 [segStart(i) .. i] 后退
      const st = this.segStart(i);
      const gap = a.s - b.s - D;
      const mv = Math.min(sp, gap);
      for (let k = st; k <= i; k++) this.balls[k]!.s -= mv;
      if (mv >= gap - 1e-6) {
        // 接合
        this.emit('joined', { s: b.s, attract: true });
        const useSeal = this.time - this.lastSeal.t < 4;
        b.cid = useSeal ? this.lastSeal.cid : -1;
        b.step = useSeal ? this.lastSeal.step : 0;
        this.schedule(b, CONFIG.merge.settleDelay * 0.6);
      }
    }
  }

  /** 前向约束：后面的珠子不得穿过前面的；被推上时接合 */
  constrain(fromInsert: boolean): void {
    const D = this.D;
    for (let i = this.balls.length - 2; i >= 0; i--) {
      const a = this.balls[i]!, b = this.balls[i + 1]!;
      if (a.s < b.s + D) {
        const wasGap = a.s - b.s > D + this.eps;
        const ds = b.s + D - a.s;
        a.s += ds;
        if (fromInsert) a.rOff -= ds;
        if (wasGap) {
          this.emit('joined', { s: b.s, attract: false });
          if (b.check < 0) this.schedule(b, CONFIG.merge.settleDelay * 0.6);
        }
      }
    }
  }

  private schedule(b: Ball, delay: number): void {
    const t = this.time + delay;
    b.check = b.check < 0 ? t : Math.min(b.check, t);
  }

  /** 插入（docs §3.3）。返回新珠。 */
  insertAt(targetId: number, side: 0 | 1, level: number, cid: number, fromX: number, fromY: number, wild = false): Ball | null {
    const idx = this.indexOf(targetId);
    if (idx < 0) return null;
    const t = this.balls[idx]!;
    const D = this.D;
    const lv = wild ? t.level : level;
    let nb: Ball;
    if (side === 0) {
      // 插在目标前面（链头一侧）
      const st = this.segStart(idx);
      if (idx - 1 >= st) this.shift(st, idx - 1, D);
      nb = this.makeBall(lv, t.s + D);
      this.balls.splice(idx, 0, nb);
    } else {
      const st = this.segStart(idx);
      this.shift(st, idx, D);
      nb = this.makeBall(lv, t.s - D);
      this.balls.splice(idx + 1, 0, nb);
    }
    nb.cid = cid;
    nb.step = 0;
    nb.insT = 0.09;
    nb.fromX = fromX;
    nb.fromY = fromY;
    if (lv < 24) this.levelCounts[lv]!++;
    this.constrain(true);
    this.schedule(nb, CONFIG.merge.settleDelay);
    const i2 = this.indexOf(nb.id);
    const merge = this.wouldMerge(i2);
    this.emit('inserted', { ball: nb, merge });
    return nb;
  }

  wouldMerge(i: number): boolean {
    const b = this.balls[i];
    if (!b) return false;
    const f = i > 0 && this.connected(i - 1) && this.balls[i - 1]!.level === b.level;
    const r = i < this.balls.length - 1 && this.connected(i) && this.balls[i + 1]!.level === b.level;
    return f || r;
  }

  /** 有任何待判定的珠子在链头所在段 */
  headSegmentPending(): boolean {
    if (!this.balls.length) return false;
    const e = this.segEnd(0);
    for (let i = 0; i <= e; i++) {
      const b = this.balls[i]!;
      if (b.check >= 0 || b.sealT > 0) return true;
    }
    return false;
  }

  anyPending(): boolean {
    for (const b of this.balls) if (b.check >= 0 || b.sealT > 0) return true;
    return false;
  }

  private processChecks(): void {
    let guard = 0;
    while (guard++ < 16) {
      let bi = -1;
      let bt = Infinity;
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i]!;
        if (b.check >= 0 && b.check <= this.time && b.check < bt) {
          bt = b.check;
          bi = i;
        }
      }
      if (bi < 0) return;
      this.resolveAt(bi);
    }
  }

  private stepDelay(n: number): number {
    const M = CONFIG.merge;
    return Math.max(M.stepDelayMin, M.stepDelayBase * Math.pow(M.stepDelayDecay, n - 1));
  }

  private noteStep(cid: number, step: number): void {
    if (cid < 0) return;
    const cur = this.cascadeSteps.get(cid) ?? 0;
    if (step > cur) this.cascadeSteps.set(cid, step);
  }

  /** 连锁结束（没有该 cid 的待判定珠） */
  private maybeEnd(cid: number): void {
    if (cid < 0) return;
    for (const b of this.balls) if (b.cid === cid && (b.check >= 0 || b.sealT > 0)) return;
    if (this.freeze > 0 && this.lastSeal.cid === cid) return; // 封印后可能还有回吸
    const steps = this.cascadeSteps.get(cid);
    if (steps === undefined) {
      this.emit('cascadeEnd', { cid, steps: 0 });
      return;
    }
    this.cascadeSteps.delete(cid);
    this.emit('cascadeEnd', { cid, steps });
  }

  private resolveAt(i: number): void {
    const b = this.balls[i]!;
    b.check = -1;
    if (b.sealT > 0) return;
    const fOk = i > 0 && this.connected(i - 1) && this.balls[i - 1]!.level === b.level && this.balls[i - 1]!.sealT <= 0;
    const rOk = i < this.balls.length - 1 && this.connected(i) && this.balls[i + 1]!.level === b.level && this.balls[i + 1]!.sealT <= 0;
    if (!fOk && !rOk) {
      this.maybeEnd(b.cid);
      return;
    }
    const D = this.D;
    const step = b.step + 1;
    const cid = b.cid;
    let res: Ball;
    const fromS: number[] = [];
    const oldLevel = b.level;
    if (fOk && rOk) {
      // 三合一：结果放在 R 的槽位，F、X 移除，F 之前同段后退 2 球
      const f = this.balls[i - 1]!, r = this.balls[i + 1]!;
      const st = this.segStart(i - 1);
      fromS.push(f.s, b.s);
      if (i - 2 >= st) this.shift(st, i - 2, -2 * D, 7);
      this.balls.splice(i - 1, 2);
      res = r;
      res.level = oldLevel + 2;
      res.triple = true;
      this.levelCounts[oldLevel]! -= 3;
    } else if (fOk) {
      // 与前邻合成：结果在靠尾一侧（b 的槽位），前邻移除
      const f = this.balls[i - 1]!;
      const st = this.segStart(i - 1);
      fromS.push(f.s);
      if (i - 2 >= st) this.shift(st, i - 2, -D, 8);
      this.balls.splice(i - 1, 1);
      res = b;
      res.level = oldLevel + 1;
      res.triple = false;
      this.levelCounts[oldLevel]! -= 2;
    } else {
      // 与后邻合成：结果在后邻槽位，b 移除，b 之前同段后退 1 球
      const r = this.balls[i + 1]!;
      const st = this.segStart(i);
      fromS.push(b.s);
      if (i - 1 >= st) this.shift(st, i - 1, -D, 8);
      this.balls.splice(i, 1);
      res = r;
      res.level = oldLevel + 1;
      res.triple = false;
      this.levelCounts[oldLevel]! -= 2;
    }
    if (res.level < 24) this.levelCounts[res.level]!++;
    this.pullBack(res);
    res.cid = cid;
    res.step = step;
    res.pop = 1;
    res.check = -1;
    this.noteStep(cid, step);
    this.emit('merged', { ball: res, fromS, level: res.level, cid, step, triple: res.triple });
    if (this.levelCounts[oldLevel]! <= 0) this.emit('levelGone', { level: oldLevel });
    if (res.level >= this.cfg.sealLevel) {
      res.sealT = CONFIG.seal.holdBeforeBurst;
      this.freeze = Math.max(this.freeze, CONFIG.seal.freeze);
      this.emit('sealStart', { ball: res, cid, step, over: res.level > this.cfg.sealLevel });
    } else {
      this.schedule(res, this.stepDelay(step));
    }
  }

  /**
   * 合成吸回（阶段 3）：合成所在段及其后方的整条链再后退 pullBalls 格，
   * 让「合成 = 链条变短」看得见；退进闸门的珠子回收（出生器之后会重新吐珠）。
   */
  private pullBack(res: Ball): void {
    const ds = CONFIG.merge.pullBalls * this.D;
    if (ds <= 0 || this.mode !== 'live') return;
    const i = this.balls.indexOf(res);
    if (i < 0) return;
    const st = this.segStart(i);
    this.shift(st, this.balls.length - 1, -ds, CONFIG.merge.pullRate);
    let removed = false;
    while (this.balls.length > 1) {
      const t = this.balls[this.balls.length - 1]!;
      if (t.s > -this.D * 0.5 || t.check >= 0 || t.sealT > 0 || t === res) break;
      this.balls.pop();
      removed = true;
    }
    if (removed) this.recount();
    this.emit('pulled', { s: res.s, ds });
  }

  private processSeals(dt: number): void {
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i]!;
      if (b.sealT <= 0) continue;
      b.sealT -= dt;
      if (b.sealT > 0) continue;
      // 金印碎裂：移除，后方（尾部一侧）整体震退
      const D = this.D;
      const over = b.level > this.cfg.sealLevel;
      this.balls.splice(i, 1);
      if (b.level < 24) this.levelCounts[b.level]!--;
      const knock = CONFIG.seal.knockBalls * D;
      const rate = 3 / CONFIG.seal.knockDur;
      if (i < this.balls.length && i > 0) this.shift(i, this.balls.length - 1, -knock, rate);
      this.lastSeal = { cid: b.cid, step: b.step, t: this.time };
      this.emit('sealed', { s: b.s, level: b.level, cid: b.cid, step: b.step, over });
      this.noteStep(b.cid, b.step);
      // 缺口两端相同：会在定身结束后回吸（attract 中处理）
      const a = this.balls[i - 1], c = this.balls[i];
      if (!(a && c && a.level === c.level)) this.maybeEndAfterSeal(b.cid);
      i--;
    }
  }

  private maybeEndAfterSeal(cid: number): void {
    // 封印后没有回吸：直接结束该连锁
    for (const b of this.balls) if (b.cid === cid && (b.check >= 0 || b.sealT > 0)) return;
    const steps = this.cascadeSteps.get(cid) ?? 0;
    this.cascadeSteps.delete(cid);
    this.emit('cascadeEnd', { cid, steps });
  }

  /** 等级是否在可见可击中段出现（弹药候选） */
  visibleLevels(out: Int32Array): void {
    out.fill(0);
    for (const b of this.balls) if (this.track.hittable(b.s) && b.level < out.length) out[b.level]!++;
  }

  /** 机器人与调试用：链条的数值数组 */
  values(): number[] {
    return this.balls.map((b) => 2 ** b.level);
  }
}
