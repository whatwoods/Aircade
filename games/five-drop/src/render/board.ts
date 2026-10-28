// 棋盘视图：已落棋子（含补位动画）、影子、五连预告、当前方块、消除演出
import type { Game } from '../core/game.ts';
import type { Step } from '../core/rules.ts';
import type { Piece, Stone } from '../core/pieces.ts';
import { CONFIG } from '../config.ts';
import { StoneArt, kindOf, ghostKindOf } from './stones.ts';
import { Fx } from './fx.ts';
import { buildSlab, SLAB_PAD } from './scenery.ts';
import { C, fCn } from './theme.ts';
import { clamp, easeOutBack, easeOutCubic, easeInOutSine, easeOutQuad } from '../util/ease.ts';

interface Dying { on: boolean; x: number; y: number; c: Stone; t: number; at: number; mode: 0 | 1; cross: boolean }

export interface BoardRect { x: number; y: number; w: number; h: number; cell: number }

export class BoardView {
  art = new StoneArt();
  fx = new Fx();
  rect: BoardRect = { x: 24, y: 132, w: 342, h: 570, cell: 38 };
  private slab: HTMLCanvasElement | null = null;
  private k = 1;
  private cols = CONFIG.board.cols;
  private rows = CONFIG.board.rows + CONFIG.board.hiddenRows;
  private hidden = CONFIG.board.hiddenRows;
  // 每格的补位动画
  private offY = new Float32Array(this.cols * this.rows);
  private velY = new Float32Array(this.cols * this.rows);
  private delay = new Float32Array(this.cols * this.rows);
  private squash = new Float32Array(this.cols * this.rows);
  private grav = new Float32Array(this.cols * this.rows);
  private dying: Dying[] = Array.from({ length: 200 }, () => ({ on: false, x: 0, y: 0, c: 1 as Stone, t: 0, at: 0, mode: 0 as 0 | 1, cross: false }));
  // 当前方块视觉
  private pvx = 0; private pvy = 0;
  private pieceRef: Piece | null = null;
  private rotT = 1; private rotDir = 0;
  private invT = 1;
  private bumpT = 1; private bumpDx = 0;
  private shakeT = 1;
  garbageShift = 0;
  private garbageT = 1;
  private dipT = 1;
  private sweepT = 1;
  private rowBands: { y: number; t: number }[] = [];
  danger = 0;
  dangerTarget = 0;
  time = 0;
  previewAlpha = 0;
  private lastPreviewKey = '';
  /** 失败演出 */
  overT = -1;
  ghostOn = true;
  previewOn = true;
  onFallSound: (i: number) => void = () => {};
  private fallCount = 0;
  /** 引导用：目标格高亮 */
  target: { c: number; r: number } | null = null;
  targetLine: { c: number; r: number }[] | null = null;
  garbageWarn = 0;

  setRect(r: BoardRect, k: number): void {
    const changed = r.cell !== this.rect.cell || k !== this.k || !this.slab;
    this.rect = r; this.k = k;
    if (changed) {
      this.slab = buildSlab(this.cols, this.rows - this.hidden, r.cell, k);
      this.art.build(Math.round(r.cell * 0.9), k);
    }
  }

  cx(c: number): number { return this.rect.x + c * this.rect.cell + this.rect.cell / 2; }
  cy(y: number): number { return this.rect.y + (y - this.hidden) * this.rect.cell + this.rect.cell / 2; }

  reset(): void {
    this.offY.fill(0); this.velY.fill(0); this.delay.fill(0); this.squash.fill(0);
    for (const d of this.dying) d.on = false;
    this.fx.clear();
    this.pieceRef = null;
    this.garbageShift = 0; this.garbageT = 1;
    this.overT = -1;
    this.danger = 0; this.dangerTarget = 0;
    this.rowBands.length = 0;
    this.target = null; this.targetLine = null;
  }

  // ---------- 事件 ----------
  onSpawn(p: Piece): void {
    this.pieceRef = p;
    this.pvx = p.x; this.pvy = p.y;
    this.rotT = 1; this.invT = 1;
  }
  onRotate(dir: number, ok: boolean): void {
    if (ok) { this.rotT = 0; this.rotDir = dir; } else this.shakeT = 0;
  }
  onInvert(): void { this.invT = 0; }
  /** 重力落地（未锁定）：压扁 4% 回弹 */
  onLand(): void { this.landT = 0; }
  private landT = 1;
  onBump(dx: number): void { this.bumpT = 0; this.bumpDx = dx; }
  onHardDrop(p: Piece, fromY: number, toY: number): void {
    const cell = this.rect.cell;
    const xs = new Set<number>();
    for (let i = 0; i < p.cx.length; i++) xs.add(p.x + p.cx[i]);
    for (const x of xs) {
      let top = 99;
      for (let i = 0; i < p.cx.length; i++) if (p.x + p.cx[i] === x) top = Math.min(top, p.cy[i]);
      this.fx.trail(this.cx(x), this.cy(fromY + top) - cell / 2, this.cy(toY + top), cell * 0.7);
    }
    this.dipT = 0;
    this.pieceRef = null;
  }
  onLock(p: Piece, cells: number[]): void {
    for (const k of cells) {
      const x = k % this.cols, y = (k - x) / this.cols;
      this.fx.flash(this.cx(x), this.cy(y), 0.14);
    }
    void p;
    this.pieceRef = null;
  }
  onLandDust(p: Piece, rows: number): void {
    if (rows < 2) return;
    let maxY = 0;
    for (const y of p.cy) maxY = Math.max(maxY, y);
    for (let i = 0; i < p.cx.length; i++) if (p.cy[i] === maxY) this.fx.sparks(this.cx(p.x + p.cx[i]), this.cy(p.y + p.cy[i]) + this.rect.cell * 0.4, Math.min(6, 1 + (rows >> 2)), 0, 0.5);
  }

  /** 一轮结算的演出；返回线中点等信息供跳字 */
  onStep(s: Step): { mx: number; my: number }[] {
    const cell = this.rect.cell;
    const comp = s.k >= 3 ? Math.pow(CONFIG.anim.chainCompress, s.k - 2) : 1;
    const crossSet = new Set(s.cross);
    const clearMs = (s.kind === 'row' ? CONFIG.anim.fullRowMs : s.lines.length > 1 ? CONFIG.anim.multiMs : CONFIG.anim.fiveMs) * comp;
    // 被移除的棋子：先保留显示，扫光后碎裂
    for (let i = 0; i < s.removed.length; i++) {
      const k = s.removed[i];
      const x = k % this.cols, y = (k - x) / this.cols;
      const d = this.dying.find(o => !o.on) ?? this.dying[0];
      d.on = true; d.x = x; d.y = y; d.c = s.removedColors[i]; d.t = 0;
      d.mode = s.kind === 'row' ? 1 : 0;
      d.cross = crossSet.has(k);
      if (s.kind === 'five') {
        // 按到线起点的距离决定碎裂时间（光束扫过之后）
        let at = 0.12;
        for (const l of s.lines) {
          const idx = l.cells.indexOf(k);
          if (idx >= 0) { at = Math.min(at, 0.03 + 0.09 * (idx / Math.max(1, l.cells.length - 1))); }
        }
        d.at = at * comp + 0.04;
      } else d.at = (0.05 + 0.2 * (x / this.cols)) * comp;
      this.offY[k] = 0;
    }
    const mids: { mx: number; my: number }[] = [];
    if (s.kind === 'five') {
      for (const l of s.lines) {
        const a = l.cells[0], b = l.cells[l.cells.length - 1];
        const ax = this.cx(a % this.cols), ay = this.cy(Math.floor(a / this.cols));
        const bx = this.cx(b % this.cols), by = this.cy(Math.floor(b / this.cols));
        this.fx.beam(ax, ay, bx, by, l.length >= 6 ? 7 : 4, 0.42 * comp + 0.1, 0.12 * comp);
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        mids.push({ mx, my });
        this.fx.ring(mx, my, 70, 0.32, false, 3);
      }
      for (const k of s.cross) {
        const x = k % this.cols, y = (k - x) / this.cols;
        this.fx.ring(this.cx(x), this.cy(y), 48, 0.3, true, 4);
        this.fx.flash(this.cx(x), this.cy(y), 0.3, 1);
      }
    } else {
      for (const y of s.rows) {
        this.rowBands.push({ y, t: 0 });
        mids.push({ mx: this.rect.x + this.rect.w / 2, my: this.cy(y) });
      }
    }
    // 补位下落
    const g = CONFIG.anim.fallGravity / (comp * comp);
    for (const m of s.moves) {
      const k = m.toY * this.cols + m.x;
      this.offY[k] = -(m.toY - m.fromY) * cell;
      this.velY[k] = 0;
      this.grav[k] = g;
      this.delay[k] = (clearMs + m.x * CONFIG.anim.fallColStaggerMs * comp) / 1000;
    }
    this.fallCount = 0;
    return mids;
  }

  onGarbage(): void { this.garbageShift = this.rect.cell; this.garbageT = 0; }
  onLevelUp(): void { this.sweepT = 0; }

  // ---------- 更新 ----------
  update(dt: number, game: Game): void {
    this.time += dt;
    this.fx.update(dt);
    const p = game.active;
    if (p && p === this.pieceRef) {
      const a = 1 - Math.exp(-dt / 0.022);
      this.pvx += (p.x - this.pvx) * a;
      this.pvy += (p.y - this.pvy) * a;
      if (Math.abs(p.x - this.pvx) < 0.002) this.pvx = p.x;
      if (Math.abs(p.y - this.pvy) < 0.002) this.pvy = p.y;
    } else if (p) this.onSpawn(p);
    this.rotT = Math.min(1, this.rotT + dt / 0.09);
    this.landT = Math.min(1, this.landT + dt / 0.08);
    this.invT = Math.min(1, this.invT + dt / 0.24);
    this.bumpT = Math.min(1, this.bumpT + dt / 0.09);
    this.shakeT = Math.min(1, this.shakeT + dt / 0.12);
    this.dipT = Math.min(1, this.dipT + dt / 0.24);
    this.sweepT = Math.min(1, this.sweepT + dt / 0.6);
    if (this.garbageT < 1) {
      this.garbageT = Math.min(1, this.garbageT + dt / 0.22);
      this.garbageShift = this.rect.cell * (1 - easeOutBack(this.garbageT));
    }
    for (let i = 0; i < this.offY.length; i++) {
      if (this.squash[i] > 0) this.squash[i] = Math.max(0, this.squash[i] - dt / 0.08);
      if (this.offY[i] === 0) continue;
      if (this.delay[i] > 0) { this.delay[i] -= dt; continue; }
      this.velY[i] += this.grav[i] * dt;
      this.offY[i] += this.velY[i] * dt;
      if (this.offY[i] >= 0) {
        const hard = this.velY[i] > 600;
        this.offY[i] = 0; this.velY[i] = 0; this.squash[i] = 1;
        if (game.grid.cells[i]) {
          if (hard) this.fx.sparks(this.cx(i % this.cols), this.cy(Math.floor(i / this.cols)) + this.rect.cell * 0.4, 1, 0, 0.4);
          this.onFallSound(this.fallCount++);
        }
      }
    }
    for (const d of this.dying) if (d.on) {
      const before = d.t;
      d.t += dt;
      if (before < d.at && d.t >= d.at) {
        const x = this.cx(d.x), y = this.cy(d.y);
        if (d.mode === 0) this.fx.shatter(x, y, d.c === 1 ? 0 : d.c === 2 ? 1 : 2, this.art.D / 2, d.cross ? 1.3 : 1);
        else this.fx.dust(x, y, this.art.D * 0.6, Math.round(6 * this.fx.density));
      }
      if (d.t > d.at + (d.mode === 1 ? 0.3 : 0.02)) d.on = false;
    }
    for (let i = this.rowBands.length - 1; i >= 0; i--) {
      this.rowBands[i].t += dt / 0.36;
      if (this.rowBands[i].t >= 1) this.rowBands.splice(i, 1);
    }
    this.danger += (this.dangerTarget - this.danger) * (1 - Math.exp(-dt / 0.2));
    if (this.overT >= 0) this.overT += dt;
    // 预告淡入淡出
    const pv = game.phase === 'play' && this.previewOn ? game.preview() : null;
    const has = !!pv && (pv.lines.length > 0 || pv.fullRows.length > 0);
    this.previewAlpha = clamp(this.previewAlpha + (has ? dt / 0.14 : -dt / 0.1), 0, 1);
  }

  isFalling(): boolean {
    for (let i = 0; i < this.offY.length; i++) if (this.offY[i] !== 0) return true;
    return false;
  }

  /** 预告的状态 key（用于「第一次出现时叮一声」） */
  previewKey(game: Game): string {
    const pv = game.preview();
    if (!pv || !pv.lines.length) return '';
    return pv.lines.map(l => l.cells.join(',')).join('|');
  }
  checkNewPreview(game: Game): boolean {
    const k = this.previewOn ? this.previewKey(game) : '';
    const fresh = k !== '' && k !== this.lastPreviewKey;
    this.lastPreviewKey = k;
    return fresh;
  }

  // ---------- 绘制 ----------
  draw(ctx: CanvasRenderingContext2D, game: Game): void {
    const R = this.rect, cell = R.cell;
    const dip = this.dipT < 1 ? Math.sin(this.dipT * Math.PI) * 2 * (1 - this.dipT) : 0;
    let collapse = 0, overA = 1;
    if (this.overT > 0.9) { const t = clamp((this.overT - 0.9) / 0.7, 0, 1); collapse = easeOutCubic(t) * 40; overA = 1 - t * 0.6; }
    ctx.save();
    ctx.translate(0, dip + collapse);
    ctx.globalAlpha = overA;
    // 石板
    if (this.slab) ctx.drawImage(this.slab, R.x - SLAB_PAD, R.y - SLAB_PAD, R.w + SLAB_PAD * 2, R.h + SLAB_PAD * 2);
    // 升级扫光
    if (this.sweepT < 1) {
      const y = R.y + R.h * easeInOutSine(this.sweepT);
      const gr = ctx.createLinearGradient(0, y - 40, 0, y + 4);
      gr.addColorStop(0, 'rgba(127,219,255,0)');
      gr.addColorStop(1, `rgba(127,219,255,${0.22 * (1 - this.sweepT)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(R.x, Math.max(R.y, y - 40), R.w, Math.min(44, y - R.y + 4));
    }
    // 垃圾预警光带
    if (this.garbageWarn > 0) {
      const a = (0.25 + 0.25 * Math.sin(this.time * Math.PI * 2 / 0.8)) * this.garbageWarn;
      const gr = ctx.createLinearGradient(0, R.y + R.h - 26, 0, R.y + R.h);
      gr.addColorStop(0, 'rgba(127,219,255,0)');
      gr.addColorStop(1, `rgba(127,219,255,${a})`);
      ctx.fillStyle = gr;
      ctx.fillRect(R.x, R.y + R.h - 26, R.w, 26);
    }
    // 满行退场光带
    for (const b of this.rowBands) {
      const y = this.cy(b.y);
      const sx = R.x + R.w * easeOutQuad(Math.min(1, b.t / 0.55));
      ctx.fillStyle = `rgba(127,219,255,${0.3 * (1 - b.t)})`;
      ctx.fillRect(R.x, y - cell / 2, sx - R.x, cell);
      ctx.fillStyle = `rgba(216,246,255,${0.9 * (1 - b.t)})`;
      ctx.fillRect(R.x, y + cell / 2 - 2, sx - R.x, 2);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x - 6, R.y - 14, R.w + 12, R.h + 14);
    ctx.clip();
    // 已落棋子
    const grid = game.grid;
    const D = this.art.D;
    const gs = this.garbageShift;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const c = grid.cells[i];
        if (!c) continue;
        const px = this.cx(x), py = this.cy(y) + this.offY[i] + gs;
        if (py < R.y - cell) continue;
        const sq = this.squash[i];
        const sy = 1 - 0.06 * Math.sin(sq * Math.PI);
        const sx = 1 + 0.04 * Math.sin(sq * Math.PI);
        if (py < R.y) ctx.globalAlpha = overA * clamp(1 - (R.y - py) / cell, 0.2, 1);
        this.art.draw(ctx, kindOf(c), px, py + (1 - sy) * D * 0.5, D, sx, sy);
        if (c === 3) {
          ctx.globalAlpha = overA * (0.35 + 0.25 * Math.sin(this.time * Math.PI * 2 / 2.4 + x));
          this.art.draw(ctx, 'halo', px, py, D);
        }
        if (this.overT >= 0) {
          const t = clamp((this.overT - (y - this.hidden) * 0.04) / 0.3, 0, 1);
          if (t > 0) {
            ctx.globalAlpha = overA * t * 0.7;
            ctx.fillStyle = '#7A8693';
            ctx.beginPath(); ctx.arc(px, py, D / 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = overA;
      }
    }
    // 消除中的棋子（扫光前变亮、满行下沉）
    for (const d of this.dying) if (d.on) {
      const px = this.cx(d.x), py = this.cy(d.y) + gs;
      if (d.mode === 0) {
        if (d.t < d.at) {
          this.art.draw(ctx, kindOf(d.c), px, py, D);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = overA * clamp(d.t / Math.max(0.01, d.at), 0, 1) * 0.8;
          this.art.draw(ctx, 'glow', px, py, D * 0.7);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = overA;
        }
      } else {
        const t = clamp(d.t / (d.at + 0.3), 0, 1);
        ctx.globalAlpha = overA * (1 - t);
        this.art.draw(ctx, kindOf(d.c), px, py + t * 10, D * (1 - 0.2 * t));
        ctx.globalAlpha = overA;
      }
    }
    // 引导目标
    if (this.targetLine) {
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.strokeStyle = 'rgba(127,219,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.targetLine.forEach((p, i) => { const x = this.cx(p.c), y = this.cy(p.r + this.hidden); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.target) {
      const x = this.cx(this.target.c), y = this.cy(this.target.r + this.hidden);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.strokeStyle = `rgba(127,219,255,${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, D / 2 + 3 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    }
    // 影子与预告
    const p = game.active;
    if (p && game.phase === 'play') {
      const gy = game.ghostY();
      const pv = this.previewOn ? game.preview() : null;
      if (this.ghostOn && gy !== p.y) {
        for (let i = 0; i < p.cx.length; i++) {
          const x = this.cx(p.x + p.cx[i]), y = this.cy(gy + p.cy[i]) + gs;
          this.art.draw(ctx, ghostKindOf(p.colors[i]), x, y, D);
        }
      }
      if (pv && this.previewAlpha > 0) this.drawPreview(ctx, game, pv.lines, pv.fullRows, pv.rowRemoved, pv.chain, gy);
      this.drawPiece(ctx, p);
    }
    ctx.restore();
    // 特效（不裁剪，碎片可以飞出棋盘）
    this.fx.drawWorld(ctx, this.art);
    // 顶线（危险态）
    if (this.danger > 0.01) {
      const a = this.danger * (0.55 + 0.35 * Math.sin(this.time * 4));
      ctx.fillStyle = `rgba(255,123,138,${a})`;
      ctx.fillRect(R.x, R.y - 2, R.w, 2);
      const gr = ctx.createLinearGradient(0, R.y, 0, R.y + 40);
      gr.addColorStop(0, `rgba(255,123,138,${a * 0.25})`);
      gr.addColorStop(1, 'rgba(255,123,138,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(R.x, R.y, R.w, 40);
    }
    ctx.restore();
  }

  private drawPreview(ctx: CanvasRenderingContext2D, game: Game, lines: { cells: number[]; length: number }[], rows: number[], rowRemoved: number[], chain: boolean, gy: number): void {
    const a = this.previewAlpha;
    const D = this.art.D;
    const p = game.active!;
    // 满行预告
    for (const y of rows) {
      ctx.fillStyle = `rgba(127,219,255,${0.12 * a})`;
      ctx.fillRect(this.rect.x, this.cy(y) - this.rect.cell / 2, this.rect.w, this.rect.cell);
    }
    for (const k of rowRemoved) {
      const x = k % this.cols, y = (k - x) / this.cols;
      ctx.globalAlpha = 0.35 * a;
      ctx.fillStyle = '#9FB3C6';
      ctx.beginPath(); ctx.arc(this.cx(x), this.cy(y), D * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (!lines.length && !rows.length) return;
    const pieceCells = new Set<number>();
    for (let i = 0; i < p.cx.length; i++) pieceCells.add((gy + p.cy[i]) * this.cols + p.x + p.cx[i]);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lines) {
      const s = l.cells[0], e = l.cells[l.cells.length - 1];
      const ax = this.cx(s % this.cols), ay = this.cy(Math.floor(s / this.cols));
      const bx = this.cx(e % this.cols), by = this.cy(Math.floor(e / this.cols));
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 6);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(127,219,255,${0.22 * a * pulse})`;
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = `rgba(200,240,255,${0.75 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      // 流动光点
      const len = Math.hypot(bx - ax, by - ay);
      for (let j = 0; j < 3; j++) {
        const t = ((this.time * 120) / Math.max(1, len) + j / 3) % 1;
        ctx.fillStyle = `rgba(235,252,255,${0.9 * a})`;
        ctx.beginPath(); ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      for (const k of l.cells) {
        if (pieceCells.has(k)) continue;
        const x = k % this.cols, y = (k - x) / this.cols;
        ctx.strokeStyle = `rgba(127,219,255,${0.65 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.cx(x), this.cy(y), D / 2 + 1.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // 徽标
    let label = '';
    if (lines.length >= 3) label = '三线';
    else if (lines.length === 2) label = '双线';
    else if (lines.length === 1) label = lines[0].length >= 6 ? `${lines[0].length} 连` : '五连';
    else if (rows.length) label = '满行';
    if (chain) label += ' +连锁';
    if (!label) return;
    let minX = 99, maxX = -1, minY = 99;
    for (let i = 0; i < p.cx.length; i++) { minX = Math.min(minX, p.x + p.cx[i]); maxX = Math.max(maxX, p.x + p.cx[i]); minY = Math.min(minY, gy + p.cy[i]); }
    ctx.font = fCn(600, 12);
    const tw = ctx.measureText(label).width + 16;
    let bx = this.cx(maxX) + this.rect.cell / 2 + 4;
    if (bx + tw > this.rect.x + this.rect.w - 2) bx = this.cx(minX) - this.rect.cell / 2 - 4 - tw;
    bx = clamp(bx, this.rect.x + 2, this.rect.x + this.rect.w - tw - 2);
    let by = this.cy(minY) - 11;
    by = clamp(by, this.rect.y + 2, this.rect.y + this.rect.h - 24);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(16,24,32,0.78)';
    ctx.beginPath(); ctx.roundRect(bx, by, tw, 22, 11); ctx.fill();
    ctx.strokeStyle = 'rgba(127,219,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, tw - 1, 21, 10.5); ctx.stroke();
    ctx.fillStyle = C.accentCore;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + tw / 2, by + 11.5);
    ctx.globalAlpha = 1;
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: Piece): void {
    const D = this.art.D, cell = this.rect.cell;
    const rot = this.rotT < 1 ? -this.rotDir * (Math.PI / 2) * (1 - easeOutCubic(this.rotT)) : 0;
    const bump = this.bumpT < 1 ? this.bumpDx * 3 * Math.sin(this.bumpT * Math.PI) : 0;
    const shake = this.shakeT < 1 ? Math.sin(this.shakeT * Math.PI * 4) * 2 * (1 - this.shakeT) : 0;
    const ox = this.rect.x + this.pvx * cell + bump + shake;
    const oy = this.rect.y + (this.pvy - this.hidden) * cell;
    const half = (p.n * cell) / 2;
    const ccx = ox + half, ccy = oy + half;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const breath = 0.12 + 0.08 * Math.sin(this.time * Math.PI);
    for (let i = 0; i < p.cx.length; i++) {
      let x = ox + p.cx[i] * cell + cell / 2, y = oy + p.cy[i] * cell + cell / 2;
      if (rot) { const dx = x - ccx, dy = y - ccy; x = ccx + dx * cs - dy * sn; y = ccy + dx * sn + dy * cs; }
      let alpha = 1;
      if (y < this.rect.y) alpha = clamp(1 - (this.rect.y - y) / cell, 0.25, 1);
      ctx.globalAlpha = alpha * breath;
      this.art.draw(ctx, 'halo', x, y, D);
      ctx.globalAlpha = alpha;
      let c = p.colors[i];
      let sx = 1;
      if (this.invT < 1) {
        const t = clamp((this.invT * 0.24 - i * 0.025) / 0.16, 0, 1);
        sx = Math.abs(Math.cos(t * Math.PI));
        if (t < 0.5 && c !== 3) c = (c === 1 ? 2 : 1) as Stone;
        if (t > 0.3 && t < 0.7) {
          this.art.draw(ctx, kindOf(c), x, y, D, Math.max(0.05, sx), 1);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * (1 - Math.abs(t - 0.5) / 0.2) * 0.8;
          this.art.draw(ctx, 'glow', x, y, D * 0.6);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha;
          continue;
        }
      }
      const sq = this.landT < 1 ? 0.04 * Math.sin(this.landT * Math.PI) : 0;
      this.art.draw(ctx, kindOf(c), x, y + sq * D * 0.5, D, Math.max(0.05, sx) * (1 + sq), 1 - sq);
      if (c === 3) { ctx.globalAlpha = alpha * 0.5; this.art.draw(ctx, 'halo', x, y, D); }
    }
    ctx.globalAlpha = 1;
  }
}
