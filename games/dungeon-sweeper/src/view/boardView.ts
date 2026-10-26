import { CONFIG } from '../config';
import { backOutStrong, clamp01, cubicOut, quadInOut, smoothstep } from '../core/ease';
import { flicker } from '../core/noise';
import { COLS, N, START_CELL, cx, cy, inLair } from '../game/board';
import type { Game } from '../game/rules';
import { Kind, MARK_NONE, MARK_SAFE, MARK_UNKNOWN } from '../game/types';
import type { Fx } from './fx';
import { type Mat, makeCanvas, roundRect } from './gfx';
import type { Glyphs } from './glyphs';
import type { Layout, Rect } from './layout';
import { numberTier, PAL } from './palette';
import type { Silhouettes } from './silhouettes';
import type { Textures } from './textures';

export interface Pop {
  on: boolean;
  cell: number;
  level: number;
  t0: number;
  strike: number;
  lethal: boolean;
}

export interface BoardHooks {
  onFlipStart(i: number, origin: number): void;
  onFlipEnd(i: number): void;
}

const ROLL = CONFIG.timing.numberRollMs;

/**
 * 格子视图状态（SoA）：翻牌、波纹、光照缓动、数字滚轮、标记、道具、剪影弹出。
 * 显示值独立于逻辑真相，由 director 按时间线推进。
 */
export class BoardView {
  game!: Game;
  readonly face = new Uint8Array(N);
  readonly flipping = new Uint8Array(N);
  readonly flipStarted = new Uint8Array(N);
  readonly flipTo = new Uint8Array(N);
  readonly flipT0 = new Float64Array(N);
  readonly flipDur = new Float32Array(N);
  readonly flipPhi = new Float32Array(N);
  readonly flipOrigin = new Int16Array(N);
  readonly light = new Float32Array(N);
  readonly lightFrom = new Float32Array(N);
  readonly lightTo = new Float32Array(N);
  readonly lightT0 = new Float64Array(N);
  readonly lightDur = new Float32Array(N);
  readonly candle = new Float32Array(N);
  readonly potionGlow = new Float32Array(N);
  readonly ext = new Float32Array(N).fill(1);
  readonly extT0 = new Float64Array(N).fill(Infinity);
  readonly num = new Int16Array(N);
  readonly numPrev = new Int16Array(N);
  readonly rollT0 = new Float64Array(N).fill(-1e9);
  readonly zeroT0 = new Float64Array(N).fill(-1e9);
  readonly numInT0 = new Float64Array(N).fill(-1e9);
  readonly numHidden = new Uint8Array(N);
  readonly press = new Float32Array(N);
  readonly mark = new Int8Array(N);
  readonly markT0 = new Float64Array(N).fill(-1e9);
  readonly markPrev = new Int8Array(N);
  readonly eraseT0 = new Float64Array(N).fill(-1e9);
  readonly lethalT0 = new Float64Array(N).fill(-1e9);
  readonly decal = new Uint8Array(N);
  readonly item = new Uint8Array(N); // 0 无 1 宝箱 2 血瓶
  readonly itemState = new Uint8Array(N); // 0 在场 1 拾取中 2 消失
  readonly itemT0 = new Float64Array(N);
  readonly popT0 = new Float64Array(N).fill(-1e9);
  readonly shakeT0 = new Float64Array(N).fill(-1e9);
  readonly dealT = new Float64Array(N);
  readonly mr = new Int8Array(N); // 翻开时应用的标记结果：1 猜中 2 未中
  readonly chord = new Uint8Array(N);
  private dyn = new Uint8Array(N);
  private dynPrev = new Uint8Array(N);
  readonly pops: Pop[] = [];

  hover = -1;
  pressCell = -1;
  pressProg = -1;
  nbCell = -1;
  nbT0 = -1e9;
  goldT0 = -1e9;
  hpShown = 5;
  tutCells: number[] = [];
  tutRects: Rect[] = [];
  tutDim = 0;
  tutArrow = -1;
  radialDim = 0;
  radialCell = -1;
  hideBoard = false;
  private glintCell = -1;
  private glintT0 = 0;
  private nextGlint = 3000;

  private tex: Textures;
  private gl: Glyphs;
  private sil: Silhouettes;
  private fx: Fx;
  hooks: BoardHooks;
  private cache: HTMLCanvasElement;
  private cctx: CanvasRenderingContext2D;
  private cacheDirty = true;
  private ckCell = -1;
  private ckDpr = -1;
  private ckVer = -1;
  version = 0;

  constructor(tex: Textures, gl: Glyphs, sil: Silhouettes, fx: Fx, hooks: BoardHooks) {
    this.tex = tex;
    this.gl = gl;
    this.sil = sil;
    this.fx = fx;
    this.hooks = hooks;
    [this.cache, this.cctx] = makeCanvas(4, 4);
    for (let k = 0; k < 8; k++) this.pops.push({ on: false, cell: 0, level: 1, t0: 0, strike: 0, lethal: false });
  }

  /** 绑定新局：全部回到暗砖 */
  reset(game: Game, deal: boolean, world: number): void {
    this.game = game;
    this.face.fill(0);
    this.flipping.fill(0);
    this.flipStarted.fill(0);
    this.light.fill(0);
    this.lightFrom.fill(0);
    this.lightTo.fill(0);
    this.lightT0.fill(0);
    this.candle.fill(0);
    this.potionGlow.fill(0);
    this.ext.fill(1);
    this.extT0.fill(Infinity);
    this.num.fill(0);
    this.numHidden.fill(0);
    this.rollT0.fill(-1e9);
    this.zeroT0.fill(-1e9);
    this.numInT0.fill(-1e9);
    this.press.fill(0);
    this.mark.fill(0);
    this.markT0.fill(-1e9);
    this.eraseT0.fill(-1e9);
    this.lethalT0.fill(-1e9);
    this.decal.fill(0);
    this.item.fill(0);
    this.itemState.fill(0);
    this.popT0.fill(-1e9);
    this.shakeT0.fill(-1e9);
    this.mr.fill(0);
    this.chord.fill(0);
    for (const p of this.pops) p.on = false;
    for (let i = 0; i < N; i++) {
      const k = game.b.kind[i];
      this.item[i] = k === Kind.Chest ? 1 : k === Kind.Potion ? 2 : 0;
      if (deal) {
        const x = cx(i);
        const y = cy(i);
        this.dealT[i] = world + (11 - y) * 55 + Math.abs(x - 4) * 12 + 40;
      } else this.dealT[i] = 0;
    }
    this.goldT0 = -1e9;
    this.nbCell = -1;
    this.hideBoard = false;
    this.version++;
    this.cacheDirty = true;
  }

  get dealEnd(): number {
    let m = 0;
    for (let i = 0; i < N; i++) if (this.dealT[i] > m) m = this.dealT[i];
    return m + 220;
  }

  // ------------------------------------------------------------ scheduling API（director 调用）
  /** 安排翻开；delay 为相对 now 的毫秒 */
  scheduleFlip(i: number, toFace: number, at: number, dur: number, phi: number, origin: number): void {
    this.flipping[i] = 1;
    this.flipStarted[i] = 0;
    this.flipTo[i] = toFace;
    this.flipT0[i] = at;
    this.flipDur[i] = dur;
    this.flipPhi[i] = phi;
    this.flipOrigin[i] = origin;
    if (toFace === 1) {
      this.num[i] = this.game.number[i];
      this.numHidden[i] = 0;
    }
  }

  setLight(i: number, to: number, at: number, dur: number): void {
    this.lightFrom[i] = this.light[i];
    this.lightTo[i] = to;
    this.lightT0[i] = at;
    this.lightDur[i] = dur;
  }

  rollNumber(i: number, from: number, to: number, at: number): void {
    this.numPrev[i] = from;
    this.num[i] = to;
    this.rollT0[i] = at;
    if (to === 0 && from > 0) this.zeroT0[i] = at;
  }

  setMark(i: number, m: number, now: number): void {
    const prev = this.mark[i];
    if (prev === m) return;
    if (prev !== MARK_NONE) {
      this.markPrev[i] = prev;
      this.eraseT0[i] = now;
    }
    this.mark[i] = m;
    if (m !== MARK_NONE) this.markT0[i] = now;
  }

  addPop(cell: number, level: number, t0: number, strike: number, lethal: boolean): Pop | null {
    for (const p of this.pops)
      if (!p.on) {
        p.on = true;
        p.cell = cell;
        p.level = level;
        p.t0 = t0;
        p.strike = strike;
        p.lethal = lethal;
        return p;
      }
    return null;
  }

  popAt(cell: number): Pop | null {
    for (const p of this.pops) if (p.on && p.cell === cell) return p;
    return null;
  }

  /** 剪影当前位置（棋盘坐标） */
  popPos(L: Layout, p: Pop, world: number, out: { x: number; y: number; s: number }): void {
    const unit = this.sil.mon[p.level].unit;
    const k = clamp01((world - p.t0) / CONFIG.timing.popMs);
    out.x = L.board.x + cx(p.cell) * L.cell + L.cell / 2;
    out.y = L.board.y + cy(p.cell) * L.cell + L.cell - unit * 0.42 - 14 * cubicOut(k);
    out.s = 1;
  }

  get busy(): boolean {
    for (let i = 0; i < N; i++) if (this.flipping[i]) return true;
    for (const p of this.pops) if (p.on && !p.lethal) return true;
    return false;
  }

  isFlipping(i: number): boolean {
    return this.flipping[i] === 1;
  }

  // ------------------------------------------------------------ update
  update(world: number, real: number, dt: number): void {
    const g = this.game;
    for (let i = 0; i < N; i++) {
      if (this.flipping[i]) {
        if (!this.flipStarted[i] && world >= this.flipT0[i]) {
          this.flipStarted[i] = 1;
          if (this.flipTo[i] === 1) {
            if (this.mark[i] !== MARK_NONE) this.setMark(i, MARK_NONE, world);
            this.hooks.onFlipStart(i, this.flipOrigin[i]);
          }
        }
        if (world >= this.flipT0[i] + this.flipDur[i]) {
          this.flipping[i] = 0;
          this.face[i] = this.flipTo[i];
          if (this.face[i]) {
            this.numInT0[i] = world;
            if (this.item[i] && this.itemState[i] === 0) this.popT0[i] = world;
            this.hooks.onFlipEnd(i);
          }
        }
      }
      // 光照缓动
      if (world >= this.lightT0[i]) {
        const t = clamp01((world - this.lightT0[i]) / Math.max(1, this.lightDur[i]));
        this.light[i] = this.lightFrom[i] + (this.lightTo[i] - this.lightFrom[i]) * cubicOut(t);
      }
      // 熄灭
      if (world >= this.extT0[i]) this.ext[i] = 1 - smoothstep(this.extT0[i], this.extT0[i] + 300, world);
      // 烛台 / 血瓶光
      const lit = this.face[i] || (this.flipping[i] && this.flipStarted[i] && this.flipTo[i]);
      this.candle[i] = g.b.candle[i] && lit ? Math.min(1, this.light[i] / 0.85) : 0;
      const pot = this.item[i] === 2 && lit && this.itemState[i] !== 2 ? (this.itemState[i] === 1 ? 0 : 1) : 0;
      this.potionGlow[i] += (pot - this.potionGlow[i]) * Math.min(1, dt / 200);
      // 按压
      const pt = i === this.pressCell ? 1 : 0;
      this.press[i] += (pt - this.press[i]) * Math.min(1, dt / 50);
      if (this.press[i] < 0.01) this.press[i] = 0;
    }
    // 暗砖尘光
    if (real > this.nextGlint) {
      this.nextGlint = real + 4000 + Math.random() * 3000;
      let tries = 0;
      do {
        this.glintCell = Math.floor(Math.random() * N);
        tries++;
      } while (tries < 20 && (this.face[this.glintCell] || inLair(cx(this.glintCell), Math.floor(this.glintCell / COLS))));
      this.glintT0 = real;
    }
  }

  // ------------------------------------------------------------ helpers
  private faceShown(i: number, world: number): number {
    if (this.flipping[i] && world < this.flipT0[i]) return this.face[i];
    if (this.flipping[i]) return -1; // 翻转中
    return this.face[i];
  }

  private isDyn(i: number, world: number): boolean {
    if (this.flipping[i] && world >= this.flipT0[i]) return true;
    if (this.dealT[i] > 0 && world < this.dealT[i] + 220) return true;
    if (this.press[i] > 0) return true;
    return false;
  }

  /** 画一个格子的「已翻开」面：地面、贴花、楼梯、烛台底座（不含道具） */
  private drawFloor(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, s: number): void {
    const T = this.tex;
    const v = this.game.b.variant[i];
    ctx.drawImage(T.floor[v % 3].c, x, y, s, s);
    if (this.decal[i]) {
      const L = this.decal[i];
      const ds = s * (0.55 + 0.05 * L);
      ctx.drawImage(T.decal[(v >> 2) % 3].c, x + (s - ds) / 2, y + (s - ds) / 2, ds, ds);
    }
    if (i === START_CELL) ctx.drawImage(T.stairs.c, x, y, s, s);
    if (this.game.b.candle[i]) {
      const k = s / 40;
      // 小号矮烛，缩在左下角，不压格内数字（数字在烛台格右移让位）
      ctx.drawImage(T.candleBase.c, x + 2 * k, y + s - 11 * k, 7.5 * k, 9.6 * k);
    }
    const ex = cx(i);
    const ey = cy(i);
    if (ey === 11 && (ex === 3 || ex === 5)) {
      const k = s / 40;
      ctx.drawImage(T.torch.c, x + (ex === 3 ? 4.8 : s / k - 4.8) * k - 7 * k, y + 1 * k, 14 * k, 22 * k);
    }
  }

  private drawItem(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, s: number, world: number, real: number): void {
    const T = this.tex;
    const it = this.item[i];
    if (!it || this.itemState[i] === 2) return;
    let sc = 1;
    const pt = (world - this.popT0[i]) / 220;
    if (pt >= 0 && pt < 1) sc = 1 + 0.15 * Math.sin(pt * Math.PI) * (1 - pt * 0.3);
    let alpha = 1;
    let rot = 0;
    const sh = world - this.shakeT0[i];
    if (sh >= 0 && sh < 520) rot = Math.sin((sh / 520) * Math.PI * 4) * 0.22 * (1 - sh / 520);
    let spr = T.potion[0];
    if (it === 1) {
      const gold = this.game.b.gold[i];
      const tier = gold <= 40 ? 0 : gold <= 80 ? 1 : 2;
      let frame = 0;
      if (this.itemState[i] === 1) {
        const t = world - this.itemT0[i];
        frame = t < 60 ? 0 : t < 120 ? 1 : 2;
        if (t > 520) alpha = Math.max(0, 1 - (t - 520) / 380);
        if (t > 900) {
          this.itemState[i] = 2;
          return;
        }
      }
      spr = T.chest[tier][frame];
    } else {
      if (this.itemState[i] === 1) return;
      const f = Math.floor((real / 1000) * 5 + i) % 8;
      spr = T.potion[(f + 8) % 8];
    }
    ctx.globalAlpha = alpha;
    if (sc !== 1 || rot !== 0) {
      const ds = s * sc;
      if (rot !== 0) {
        // 以瓶底为轴摇晃
        const px = x + s / 2;
        const py = y + s * 0.88;
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        const m = this.curBase;
        ctx.transform(c, sn, -sn, c, px - c * px + sn * py, py - sn * px - c * py);
        ctx.drawImage(spr.c, x + (s - ds) / 2, y + (s - ds) / 2, ds, ds);
        if (this.inFlip) ctx.setTransform(this.flipM.a, this.flipM.b, this.flipM.c, this.flipM.d, this.flipM.e, this.flipM.f);
        else ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      } else ctx.drawImage(spr.c, x + (s - ds) / 2, y + (s - ds) / 2, ds, ds);
    } else ctx.drawImage(spr.c, x, y, s, s);
    ctx.globalAlpha = 1;
  }

  private drawHidden(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, s: number): void {
    const T = this.tex;
    const pr = this.press[i];
    const v = this.game.b.variant[i] & 3;
    if (pr > 0) {
      const dy = 2 * pr;
      ctx.drawImage(T.hidden[v].c, x, y + dy, s, s);
      ctx.globalAlpha = 0.1 * pr;
      ctx.drawImage(T.mask.c, x, y + dy, s, s);
      ctx.globalAlpha = 1;
    } else ctx.drawImage(T.hidden[v].c, x, y, s, s);
  }

  private rebuildCache(L: Layout, world: number): void {
    const d = L.dpr;
    const w = Math.round(L.board.w * d);
    const h = Math.round(L.board.h * d);
    if (this.cache.width !== w || this.cache.height !== h) {
      this.cache.width = w;
      this.cache.height = h;
    }
    const c = this.cctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(d, 0, 0, d, 0, 0);
    const s = L.cell;
    for (let i = 0; i < N; i++) {
      if (this.game.b.kind[i] === Kind.Lair) continue;
      if (this.dyn[i]) continue;
      if (this.dealT[i] > 0 && world < this.dealT[i]) continue;
      const x = cx(i) * s;
      const y = cy(i) * s;
      const f = this.faceShown(i, world);
      if (f === 1) this.drawFloor(c, i, x, y, s);
      else if (f === 0) this.drawHidden(c, i, x, y, s);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.cacheDirty = false;
  }

  // ------------------------------------------------------------ draw: 棋盘层（光照之下）
  private curBase: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private flipM: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private inFlip = false;
  drawTiles(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, world: number, real: number): number {
    if (this.hideBoard) return 0;
    this.curBase = base;
    let calls = 0;
    const s = L.cell;
    const bx = L.board.x;
    const by = L.board.y;
    // 动态集合变化或状态版本变化 → 重建静态缓存
    let changed = false;
    for (let i = 0; i < N; i++) {
      const dd = this.isDyn(i, world) ? 1 : 0;
      this.dyn[i] = dd;
      if (dd !== this.dynPrev[i]) changed = true;
      this.dynPrev[i] = dd;
    }
    if (changed || this.cacheDirty || L.cell !== this.ckCell || L.dpr !== this.ckDpr || this.version !== this.ckVer) {
      this.ckCell = L.cell;
      this.ckDpr = L.dpr;
      this.ckVer = this.version;
      this.rebuildCache(L, world);
      calls += 99;
    }
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.drawImage(this.cache, bx, by, L.board.w, L.board.h);
    calls++;
    // 动态格：发牌、按压
    for (let i = 0; i < N; i++) {
      if (!this.dyn[i] || this.game.b.kind[i] === Kind.Lair) continue;
      if (this.flipping[i] && world >= this.flipT0[i]) continue;
      const x = bx + cx(i) * s;
      const y = by + cy(i) * s;
      let a = 1;
      let ds = s;
      if (this.dealT[i] > 0) {
        const q = (world - this.dealT[i]) / 220;
        if (q < 0) continue;
        if (q < 1) {
          a = q;
          ds = s * (0.9 + 0.1 * cubicOut(q));
        }
      }
      ctx.globalAlpha = a;
      const o = (s - ds) / 2;
      if (this.face[i]) this.drawFloor(ctx, i, x + o, y + o, ds);
      else this.drawHidden(ctx, i, x + o, y + o, ds);
      calls++;
    }
    ctx.globalAlpha = 1;
    // 道具
    for (let i = 0; i < N; i++) {
      if (!this.item[i] || this.faceShown(i, world) !== 1) continue;
      this.drawItem(ctx, i, bx + cx(i) * s, by + cy(i) * s, s, world, real);
      calls++;
    }
    // 翻转中的格子（第二遍，抬升在上）
    const T = this.tex;
    for (let i = 0; i < N; i++) {
      if (!this.flipping[i] || world < this.flipT0[i]) continue;
      const p = clamp01((world - this.flipT0[i]) / this.flipDur[i]);
      const th = Math.PI * quadInOut(p);
      const c = Math.max(0.04, Math.abs(Math.cos(th)));
      const Lf = Math.sin(Math.PI * p);
      let sy = 1 + 0.12 * Lf;
      if (p > 0.8) sy += 0.04 * Math.sin(((p - 0.8) / 0.2) * Math.PI);
      const sx = c * sy;
      const phi = this.flipPhi[i];
      const co = Math.cos(phi);
      const si = Math.sin(phi);
      const a00 = co * co * sx + si * si * sy;
      const a01 = co * si * (sx - sy);
      const a11 = si * si * sx + co * co * sy;
      const x = bx + cx(i) * s;
      const y = by + cy(i) * s;
      const ccx = x + s / 2;
      const ccy = y + s / 2 - 2 * Lf;
      // 阴影
      ctx.globalAlpha = 0.4 * Lf;
      const shS = s * 1.3 * (1 + 0.12 * Lf);
      ctx.drawImage(T.tileShadow.c, ccx - shS / 2, ccy + 3 * Lf + 2 * Lf - shS / 2, shS, shS);
      ctx.globalAlpha = 1;
      ctx.transform(a00, a01, a01, a11, ccx - a00 * ccx - a01 * ccy, ccy - a01 * ccx - a11 * ccy);
      mulMat(base, a00, a01, a01, a11, ccx - a00 * ccx - a01 * ccy, ccy - a01 * ccx - a11 * ccy, this.flipM);
      this.inFlip = true;
      const front = p < 0.5;
      const showRevealed = front ? this.flipTo[i] === 0 : this.flipTo[i] === 1;
      const oy = -2 * Lf;
      if (showRevealed) {
        this.drawFloor(ctx, i, x, y + oy, s);
        if (this.item[i] && this.itemState[i] !== 2) this.drawItem(ctx, i, x, y + oy, s, world, real);
      } else this.drawHidden(ctx, i, x, y + oy, s);
      // 明暗：转离光源变暗
      ctx.globalAlpha = (1 - c) * (front ? 0.5 : 0.35);
      ctx.drawImage(T.mask.c, x, y + oy, s, s);
      ctx.globalAlpha = 1;
      this.inFlip = false;
      ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
      // 厚度条
      if (c < 0.3) {
        ctx.translate(ccx, ccy);
        ctx.rotate(phi);
        ctx.fillStyle = front && this.flipTo[i] === 1 ? '#161A24' : '#1E1712';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-1, (-s * sy) / 2 + 2, 2, s * sy - 4);
        ctx.globalAlpha = 1;
        ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
      }
      calls += 4;
    }
    return calls;
  }

  // ------------------------------------------------------------ draw: 光后层
  drawPost(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, world: number, real: number, reduced: boolean): number {
    if (this.hideBoard) return 0;
    let calls = 0;
    const s = L.cell;
    const bx = L.board.x;
    const by = L.board.y;
    const T = this.tex;
    const G = this.gl;
    const k = s / 40;
    const tSec = real / 1000;
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    for (let i = 0; i < N; i++) {
      if (this.game.b.kind[i] === Kind.Lair) continue;
      if (this.dealT[i] > 0 && world < this.dealT[i]) continue;
      const x = bx + cx(i) * s;
      const y = by + cy(i) * s;
      const f = this.faceShown(i, world);
      if (f === 1) {
        // 数字
        if (this.numHidden[i]) continue;
        const it = this.item[i] && this.itemState[i] !== 2;
        const la = 0.65 + 0.35 * Math.min(1, this.light[i]);
        const inT = (world - this.numInT0[i]) / 140;
        if (inT < 0) continue;
        const fade = inT >= 1 ? 1 : inT;
        const sc = inT >= 1 ? 1 : 1.3 - 0.3 * cubicOut(inT);
        const v = this.num[i];
        const rt = (world - this.rollT0[i]) / ROLL;
        let ncx = x + s / 2;
        let ncy = y + s / 2 - 0.5;
        if (this.game.b.candle[i]) {
          ncx += (this.num[i] >= 10 || this.numPrev[i] >= 10 ? 4 : 2.5) * k;
          ncy -= 1.5 * k;
        }
        let size = 0;
        if (it) {
          ncx = x + s - 7 * k;
          ncy = y + s - 7.5 * k;
          size = 2;
        }
        if (rt >= 0 && rt < 1) {
          const e = cubicOut(rt);
          const prev = this.numPrev[i];
          // 旧数字上滑淡出
          if (prev > 0) {
            ctx.globalAlpha = la * (1 - e);
            this.drawNum(ctx, prev, ncx, ncy - 12 * k * e, size, 1);
          }
          if (v > 0) {
            ctx.globalAlpha = la * e;
            this.drawNum(ctx, v, ncx, ncy + 12 * k * (1 - e), size, 1);
          } else if (prev > 0) {
            // 归零：缩成火星
            const z = clamp01((world - this.zeroT0[i]) / 160);
            ctx.globalAlpha = la * (1 - z);
            this.drawNum(ctx, prev, ncx, ncy, size, 1 - z);
          }
          // 金色闪光
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55 * (1 - rt);
          const gs = s * 0.9;
          ctx.drawImage(T.spark.c, ncx - gs / 2, ncy - gs / 2, gs, gs);
          ctx.globalCompositeOperation = 'source-over';
          calls += 3;
        } else if (v > 0) {
          ctx.globalAlpha = la * fade;
          this.drawNum(ctx, v, ncx, ncy, size, sc);
          calls += 2;
        } else if (!it) {
          ctx.globalAlpha = fade;
          ctx.drawImage(G.runeDot.c, x, y, s, s);
          calls++;
        }
        ctx.globalAlpha = 1;
        // 烛火
        if (this.game.b.candle[i] && this.candle[i] > 0.05) {
          calls += this.drawFlame(ctx, base, x + 5.75 * k, y + s - 9 * k, 0.4 * k, tSec, i, this.candle[i] * this.ext[i]);
        }
        // 宝箱流光
        if (this.item[i] === 1 && this.itemState[i] === 0) {
          const ph = (real * 0.00025 + i * 0.37) % 1;
          const t = (ph * 4) % 4;
          if (t < 1) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.55 * Math.sin(t * Math.PI);
            const gx = x + s * (0.15 + 0.7 * t);
            ctx.drawImage(T.spark.c, gx - 6 * k, y + s * 0.42, 12 * k, 12 * k);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            calls++;
          }
        }
      } else if (f === 0) {
        // 标记
        calls += this.drawMark(ctx, i, x, y, s, world, real);
        // 尘光
        if (i === this.glintCell) {
          const t = (real - this.glintT0) / 700;
          if (t >= 0 && t < 1) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.35 * Math.sin(t * Math.PI);
            ctx.translate(x + s * (0.1 + 0.8 * t), y + s * (0.9 - 0.8 * t));
            ctx.rotate(-0.8);
            ctx.drawImage(T.spark.c, -10 * k, -2 * k, 20 * k, 4 * k);
            ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            calls++;
          }
        }
      }
    }
    // 入口火把火焰
    for (const ex of [3, 5]) {
      const i = 11 * COLS + ex;
      if (this.faceShown(i, world) !== 1 || this.light[i] < 0.05) continue;
      const fx0 = bx + (ex === 3 ? 3 : 6) * s + (ex === 3 ? 4.8 : -4.8) * k;
      calls += this.drawFlame(ctx, base, fx0, by + 11 * s + 2 * k, 1.05 * k, tSec, ex * 7, this.ext[i] * Math.min(1, this.light[i] / 0.6));
    }
    // 升级：暗砖镀金边
    const gt = (world - this.goldT0) / 700;
    if (gt >= 0 && gt < 1) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        if (this.face[i] || this.game.b.kind[i] === Kind.Lair) continue;
        const d = Math.hypot(cx(i) - 4, cy(i) - 5);
        const local = clamp01(gt * 1.6 - d * 0.06);
        const a = Math.sin(local * Math.PI) * 0.7;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(T.goldEdge.c, bx + cx(i) * s, by + cy(i) * s, s, s);
        calls++;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // 快开预览
    for (let i = 0; i < N; i++) {
      if (!this.chord[i]) continue;
      ctx.globalAlpha = 0.65 + 0.2 * Math.sin(real * 0.012);
      ctx.drawImage(T.goldEdge.c, bx + cx(i) * s, by + cy(i) * s, s, s);
      calls++;
    }
    ctx.globalAlpha = 1;
    // 3×3 邻域框
    const nt = (real - this.nbT0) / 600;
    if (this.nbCell >= 0 && nt >= 0 && nt < 1) {
      const x0 = Math.max(0, cx(this.nbCell) - 1);
      const y0 = Math.max(0, cy(this.nbCell) - 1);
      const x1 = Math.min(COLS - 1, cx(this.nbCell) + 1);
      const y1 = Math.min(11, cy(this.nbCell) + 1);
      ctx.globalAlpha = nt < 0.15 ? nt / 0.15 : 1 - (nt - 0.15) / 0.85;
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx + x0 * s + 1.5, by + y0 * s + 1.5, (x1 - x0 + 1) * s - 3, (y1 - y0 + 1) * s - 3, 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      calls++;
    }
    // 悬停（鼠标）
    if (this.hover >= 0 && this.radialCell < 0 && this.game.b.kind[this.hover] !== Kind.Lair) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = PAL.amber;
      ctx.lineWidth = 1.2;
      roundRect(ctx, bx + cx(this.hover) * s + 2, by + cy(this.hover) * s + 2, s - 4, s - 4, 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
      calls++;
    }
    // 长按蓄力环
    if (this.pressCell >= 0 && this.pressProg >= 0) {
      const x = bx + cx(this.pressCell) * s + s / 2;
      const y = by + cy(this.pressCell) * s + s / 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PAL.chalk;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.pressProg);
      ctx.stroke();
      calls += 2;
    }
    void reduced;
    return calls;
  }

  private drawNum(ctx: CanvasRenderingContext2D, v: number, x: number, y: number, size: number, sc: number): void {
    const tier = numberTier(v);
    const font = this.gl.num[tier][size === 2 ? 2 : v >= 10 ? 1 : 0];
    font.drawInt(ctx, v, x, y, 0.5, false, sc);
  }

  /** 烛火：噪声驱动缩放与倾斜 */
  drawFlame(ctx: CanvasRenderingContext2D, base: Mat, x: number, y: number, k: number, tSec: number, seed: number, a: number): number {
    if (a <= 0.02) return 0;
    const T = this.tex;
    const n1 = flicker(tSec * 1.3, seed);
    const n2 = flicker(tSec * 2.1, seed + 5);
    const sc = (1 + 0.1 * n1) * k;
    const tilt = 0.1 * n2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * a;
    const gs = 34 * k;
    ctx.drawImage(T.flameGlow.c, x - gs / 2, y - gs / 2 - 4 * k, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(sc, sc * (1 + 0.08 * n2));
    ctx.globalAlpha = a;
    ctx.drawImage(T.flame.c, -8, -28, 16, 30);
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.globalAlpha = 1;
    // 余烬（每支每秒 0–2 粒）
    if (Math.random() < 0.02 * a) this.fx.spawn(2, x + this.fx.rr(-2, 2), y - 18 * k, this.fx.rr(-8, 8), this.fx.rr(-40, -20), 900, 3, 1, -10, 0.5);
    return 2;
  }

  private drawMark(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, s: number, world: number, real: number): number {
    const G = this.gl;
    const T = this.tex;
    let calls = 0;
    const variant = (this.game.b.variant[i] >> 3) & 1;
    // 擦除动画（左右抹去）
    const et = (world - this.eraseT0[i]) / 140;
    if (et >= 0 && et < 1 && this.markPrev[i] !== MARK_NONE) {
      const spr = this.markSprite(this.markPrev[i], variant, false);
      if (spr) {
        const sw = spr.w * (1 - et);
        ctx.globalAlpha = 1 - et * 0.5;
        if (sw > 1) ctx.drawImage(spr.c, spr.w - sw, 0, sw, spr.h, x + s * et, y, s * (1 - et), s);
        ctx.globalAlpha = 1;
        calls++;
      }
    }
    const m = this.mark[i];
    if (m === MARK_NONE) return calls;
    const lethal = m > 0 && m >= this.hpShown;
    const spr = this.markSprite(m, variant, lethal);
    if (!spr) return calls;
    let ox = 0;
    const lt = (world - this.lethalT0[i]) / 360;
    if (lt >= 0 && lt < 1) ox = Math.sin(lt * Math.PI * 6) * 2;
    const wt = clamp01((world - this.markT0[i]) / 180);
    if (lethal) {
      const pulse = 0.5 + 0.5 * Math.sin((real / 1200) * Math.PI * 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.3 * pulse + (lt >= 0 && lt < 1 ? 0.5 * (1 - lt) : 0);
      ctx.drawImage(T.redShock.c, x - s * 0.1, y - s * 0.1, s * 1.2, s * 1.2);
      ctx.globalCompositeOperation = 'source-over';
      calls++;
    }
    ctx.globalAlpha = 1;
    if (wt < 1) {
      const sw = spr.w * wt;
      if (sw > 1) ctx.drawImage(spr.c, 0, 0, sw, spr.h, x + ox, y, s * wt, s);
    } else ctx.drawImage(spr.c, x + ox, y, s, s);
    calls++;
    if (lethal && wt >= 1) {
      const k = s / 40;
      ctx.drawImage(T.skull.c, x + s - 13 * k + ox, y + 2 * k, 11 * k, 11 * k);
      calls++;
    }
    void G;
    return calls;
  }

  markSprite(m: number, variant: number, lethal: boolean) {
    const G = this.gl;
    if (m > 0) return (lethal ? G.chalkLethal : G.chalk)[m]?.[variant] ?? null;
    if (m === MARK_UNKNOWN) return G.chalkQ[variant];
    if (m === MARK_SAFE) return G.chalkSafe[variant];
    return null;
  }

  // ------------------------------------------------------------ draw: 剪影
  private tmp = { x: 0, y: 0, s: 1 };
  drawPops(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, world: number): number {
    let calls = 0;
    for (const p of this.pops) {
      if (!p.on || world < p.t0) continue;
      const sil = this.sil.mon[p.level];
      const tau = world - p.t0;
      const k = clamp01(tau / CONFIG.timing.popMs);
      this.popPos(L, p, world, this.tmp);
      let sc = 0.4 + 0.6 * backOutStrong(k);
      let sx = 1;
      let sy = 1;
      let dx = 0;
      let dy = 0;
      let rot = 0;
      let alpha = Math.min(1, k * 3);
      switch (p.level) {
        case 1: {
          const q = clamp01(tau / 240);
          sy = q < 0.3 ? 0.6 + 0.6 * (q / 0.3) : 1.2 - 0.2 * ((q - 0.3) / 0.7);
          sx = 1 / Math.sqrt(sy);
          break;
        }
        case 2:
          if (tau < 260) sx = 1 + 0.2 * Math.sin((tau / 130) * Math.PI * 2);
          break;
        case 3:
          dy = -8 * Math.sin(Math.PI * clamp01((tau - 60) / 170));
          break;
        case 4:
          if (tau < 260) dx = 2 * Math.sin(tau * 0.25);
          break;
        case 5:
          if (tau < 260) sy = 1 - 0.09 * Math.abs(Math.sin((tau * Math.PI) / 90));
          break;
        case 6:
          sx = 0.7 + 0.3 * backOutStrong(clamp01(tau / 220));
          break;
        case 7: {
          const q = cubicOut(clamp01(tau / 220));
          dy = 22 * (1 - q);
          alpha = q;
          sc = 0.9 + 0.1 * q;
          break;
        }
        case 8:
          rot = 0.07 * Math.sin(tau * 0.03);
          break;
        case 9:
          dy = -4 * Math.sin(tau * 0.012);
          break;
      }
      if (p.lethal && world > p.strike) sc *= 1 + 0.6 * cubicOut(clamp01((world - p.strike) / 600));
      const white = world >= p.strike && world < p.strike + 70;
      const size = sil.size;
      ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
      ctx.translate(this.tmp.x + dx, this.tmp.y + dy);
      if (rot) ctx.rotate(rot);
      ctx.scale(sc * sx, sc * sy);
      ctx.globalAlpha = alpha;
      ctx.drawImage((white ? sil.white : sil.normal).c, -size / 2, -size / 2, size, size);
      calls++;
      // 等级徽章
      if (k > 0.5) {
        ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
        const lx = this.tmp.x + sil.unit * 0.42;
        const ly = this.tmp.y - sil.unit * 0.38;
        const spr = this.gl.lvBadge[p.level];
        const w = spr.w / L.dpr;
        const h = spr.h / L.dpr;
        ctx.globalAlpha = Math.min(1, (k - 0.5) * 3) * (p.lethal && world > p.strike + 200 ? 0 : 1);
        ctx.fillStyle = 'rgba(10,9,16,0.85)';
        roundRect(ctx, lx - w / 2 + 2, ly - 8, w - 4, 16, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,210,122,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.drawImage(spr.c, lx - w / 2, ly - h / 2, w, h);
        calls += 2;
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    return calls;
  }

  // ------------------------------------------------------------ draw: 压暗与引导高亮
  drawDim(ctx: CanvasRenderingContext2D, base: Mat, L: Layout, real: number): number {
    const a = Math.max(this.tutDim * 0.35, this.radialDim * 0.2);
    if (a <= 0.005) return 0;
    const s = L.cell;
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.fillStyle = '#040508';
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.rect(-50, -50, L.colW + 100, L.vh + 100);
    if (this.tutDim > 0.01) {
      for (const i of this.tutCells) {
        const x = L.board.x + cx(i) * s;
        const y = L.board.y + cy(i) * s;
        ctx.rect(x + s, y, -s, s);
      }
      for (const r of this.tutRects) ctx.rect(r.x + r.w, r.y, -r.w, r.h);
    } else if (this.radialCell >= 0) {
      const x = L.board.x + cx(this.radialCell) * s;
      const y = L.board.y + cy(this.radialCell) * s;
      ctx.rect(x + s, y, -s, s);
    }
    ctx.fill('nonzero');
    ctx.globalAlpha = 1;
    let calls = 1;
    if (this.tutDim > 0.01) {
      const pulse = 0.55 + 0.45 * Math.sin((real / 1000) * Math.PI * 2 * 0.8);
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.globalAlpha = this.tutDim * pulse;
      for (const i of this.tutCells) {
        roundRect(ctx, L.board.x + cx(i) * s + 1.5, L.board.y + cy(i) * s + 1.5, s - 3, s - 3, 5);
        ctx.stroke();
      }
      for (const r of this.tutRects) {
        roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 8);
        ctx.stroke();
      }
      // 箭头
      if (this.tutArrow >= 0) {
        const x = L.board.x + cx(this.tutArrow) * s + s / 2;
        const y = L.board.y + cy(this.tutArrow) * s - 6 - 5 * Math.abs(Math.sin((real / 1000) * Math.PI * 1.6));
        ctx.globalAlpha = this.tutDim;
        ctx.fillStyle = PAL.gold;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y - 11);
        ctx.lineTo(x + 8, y - 11);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,6,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      calls += 3;
    }
    return calls;
  }
}

/** out = m · [a b c d e f]（Canvas 矩阵乘法顺序，与 ctx.transform 相同） */
function mulMat(m: Mat, a: number, b: number, c: number, d: number, e: number, f: number, out: Mat): void {
  const na = m.a * a + m.c * b;
  const nb = m.b * a + m.d * b;
  const nc = m.a * c + m.c * d;
  const nd = m.b * c + m.d * d;
  const ne = m.a * e + m.c * f + m.e;
  const nf = m.b * e + m.d * f + m.f;
  out.a = na;
  out.b = nb;
  out.c = nc;
  out.d = nd;
  out.e = ne;
  out.f = nf;
}
