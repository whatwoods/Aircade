import { CONFIG } from '../config';
import { backOut, clamp01 } from '../core/ease';
import { MARK_NONE, MARK_SAFE, MARK_UNKNOWN } from '../game/types';
import { type Sprite, roundRect, sprite } from './gfx';
import { drawText, FONT_CN, type Glyphs } from './glyphs';
import type { Layout } from './layout';
import { PAL } from './palette';
import type { Textures } from './textures';

export const RADIAL_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, MARK_UNKNOWN, MARK_SAFE];
/** 命中结果：≥0 槽位；CENTER 中心；PLATE 底盘空白；OUTSIDE 外部 */
export const CENTER = -1;
export const PLATE = -2;
export const OUTSIDE = -3;

/**
 * 标记轮盘（文档 §6.4）：按住滑选 + 松手点选；最近槽判定 ≤ 槽半径 × 1.35。
 */
export class Radial {
  open = false;
  mode: 'hold' | 'tap' = 'hold';
  cell = -1;
  x = 0;
  y = 0;
  cellX = 0;
  cellY = 0;
  current = MARK_NONE;
  bound = -1;
  hp = 5;
  hover = OUTSIDE;
  private t0 = -1e9;
  private closeT0 = -1e9;
  private R = 78;
  private slotR = 21;
  private plateR = 104;
  private plate: Sprite | null = null;
  private plateKey = '';
  private tex: Textures;
  private gl: Glyphs;
  private hintSpr: Sprite | null = null;
  private centerSpr: Sprite | null = null;
  onHover: ((slot: number) => void) | null = null;

  constructor(tex: Textures, gl: Glyphs) {
    this.tex = tex;
    this.gl = gl;
  }

  get visible(): boolean {
    return this.open || this.closeT0 > 0;
  }

  openAt(L: Layout, cell: number, cellX: number, cellY: number, mode: 'hold' | 'tap', current: number, bound: number, hp: number, real: number): void {
    const I = CONFIG.input;
    const s = L.s;
    this.R = I.radialRadius * s;
    this.slotR = I.radialSlotRadius * s;
    this.plateR = I.radialPlateRadius * s;
    const m = I.radialEdgeMargin * s;
    this.open = true;
    this.mode = mode;
    this.cell = cell;
    this.cellX = cellX;
    this.cellY = cellY;
    this.x = Math.max(m, Math.min(L.colW - m, cellX));
    this.y = Math.max(m + L.safeTop + 18 * s, Math.min(L.vh - m - L.safeBottom, cellY));
    this.current = current;
    this.bound = bound;
    this.hp = hp;
    this.hover = OUTSIDE;
    this.t0 = real;
    this.closeT0 = -1e9;
    this.hintSpr = bound >= 0 ? this.gl.text.get(`此格周边上限 ≤ ${bound}`, 12.5 * s, PAL.parchment, 600, FONT_CN, { stroke: 'rgba(7,8,13,0.95)', strokeW: 3 }) : null;
    this.centerSpr = current !== MARK_NONE ? this.gl.text.get('✕ 清除', 12 * s, PAL.parchment, 600) : this.gl.text.get('取消', 12 * s, PAL.ash, 600);
    this.bakePlate(L);
  }

  close(real: number): void {
    if (!this.open) return;
    this.open = false;
    this.closeT0 = real;
  }

  slotPos(k: number): [number, number] {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / RADIAL_VALUES.length;
    SP[0] = this.x + Math.cos(a) * this.R;
    SP[1] = this.y + Math.sin(a) * this.R;
    return SP;
  }

  /** 最近槽判定 */
  pick(px: number, py: number): number {
    let best = OUTSIDE;
    let bd = Infinity;
    for (let k = 0; k < RADIAL_VALUES.length; k++) {
      const [sx, sy] = this.slotPos(k);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (bd <= this.slotR * CONFIG.input.radialPickScale) return best;
    const dc = Math.hypot(px - this.x, py - this.y);
    if (dc <= this.slotR * 1.25) return CENTER;
    if (dc <= this.plateR) return PLATE;
    return OUTSIDE;
  }

  setHover(px: number, py: number): void {
    const h = this.pick(px, py);
    if (h !== this.hover) {
      this.hover = h;
      if (this.onHover && (h >= 0 || h === CENTER)) this.onHover(h);
    }
  }

  private bakePlate(L: Layout): void {
    const key = `${L.s}|${L.dpr}`;
    if (key === this.plateKey && this.plate) return;
    this.plateKey = key;
    const d = L.dpr;
    const r = this.plateR;
    this.plate = sprite((r * 2 + 8) * d, (r * 2 + 8) * d, (c, w) => {
      const m = w / 2;
      c.scale(d, d);
      const mm = m / d;
      c.shadowColor = 'rgba(0,0,0,0.8)';
      c.shadowBlur = 16;
      const g = c.createRadialGradient(mm, mm - r * 0.3, r * 0.1, mm, mm, r);
      g.addColorStop(0, 'rgba(38,43,56,0.95)');
      g.addColorStop(1, 'rgba(14,16,22,0.94)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(mm, mm, r, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(232,176,75,0.55)';
      c.lineWidth = 1.5;
      c.stroke();
      // 符文环
      c.strokeStyle = 'rgba(255,181,74,0.22)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(mm, mm, r - 7, 0, Math.PI * 2);
      c.stroke();
      for (let k = 0; k < 44; k++) {
        const a = (k / 44) * Math.PI * 2;
        const r0 = r - 10;
        const r1 = r - (k % 4 === 0 ? 4 : 7);
        c.beginPath();
        c.moveTo(mm + Math.cos(a) * r0, mm + Math.sin(a) * r0);
        c.lineTo(mm + Math.cos(a) * r1, mm + Math.sin(a) * r1);
        c.stroke();
      }
      c.strokeStyle = 'rgba(110,124,150,0.18)';
      c.beginPath();
      c.arc(mm, mm, r * 0.42, 0, Math.PI * 2);
      c.stroke();
    });
  }

  draw(ctx: CanvasRenderingContext2D, L: Layout, real: number): number {
    if (!this.visible || !this.plate) return 0;
    const d = L.dpr;
    const s = L.s;
    let k = backOut(clamp01((real - this.t0) / 140));
    let alpha = 1;
    if (!this.open) {
      const ct = (real - this.closeT0) / 120;
      if (ct >= 1) {
        this.closeT0 = -1e9;
        return 0;
      }
      alpha = 1 - ct;
      k = 1 - 0.1 * ct;
    }
    const sc = 0.6 + 0.4 * k;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = alpha;
    // 连接线 + 原格高亮
    const cs = L.cell;
    if (Math.hypot(this.cellX - this.x, this.cellY - this.y) > 4) {
      ctx.strokeStyle = 'rgba(255,210,122,0.6)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.cellX, this.cellY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, this.cellX - cs / 2 + 1, this.cellY - cs / 2 + 1, cs - 2, cs - 2, 5);
    ctx.stroke();
    // 底盘
    const pw = (this.plate.w / d) * sc;
    ctx.drawImage(this.plate.c, this.x - pw / 2, this.y - pw / 2, pw, pw);
    // 提示
    if (this.hintSpr) drawText(ctx, this.hintSpr, this.x, this.y - this.plateR * sc - 14 * s, 0.5, d);
    // 槽位
    const T = this.tex;
    for (let i = 0; i < RADIAL_VALUES.length; i++) {
      const st = clamp01((real - this.t0 - i * 10) / 120);
      if (st <= 0) continue;
      const v = RADIAL_VALUES[i];
      const [px, py] = this.slotPos(i);
      const x = this.x + (px - this.x) * sc;
      const y = this.y + (py - this.y) * sc;
      const hov = this.hover === i;
      const lethal = v > 0 && v >= this.hp;
      const r = this.slotR * (hov ? 1.18 : 1) * (0.5 + 0.5 * backOut(st));
      ctx.globalAlpha = alpha * st;
      ctx.fillStyle = lethal ? (hov ? '#4A1418' : '#2A0E12') : hov ? '#3A3424' : '#1A1E28';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lethal ? 'rgba(255,77,77,0.85)' : hov ? PAL.gold : 'rgba(110,124,150,0.55)';
      ctx.lineWidth = hov ? 2 : 1.2;
      ctx.stroke();
      if (this.current === v) {
        ctx.strokeStyle = 'rgba(220,227,234,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      const spr = v > 0 ? (lethal ? this.gl.chalkLethal[v][0] : this.gl.chalk[v][0]) : v === MARK_UNKNOWN ? this.gl.chalkQ[0] : this.gl.chalkSafe[0];
      const ss = r * 1.75;
      ctx.drawImage(spr.c, x - ss / 2, y - ss / 2 + 1, ss, ss);
      if (lethal) ctx.drawImage(T.skull.c, x + r * 0.35, y - r * 0.95, 10 * s, 10 * s);
    }
    // 中心
    ctx.globalAlpha = alpha;
    const ch = this.hover === CENTER;
    ctx.fillStyle = ch ? '#3A2A24' : '#151821';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.slotR * 1.05 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ch ? PAL.gold : 'rgba(156,142,122,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (this.centerSpr) drawText(ctx, this.centerSpr, this.x, this.y, 0.5, d, sc);
    ctx.globalAlpha = 1;
    return 16;
  }
}

const SP: [number, number] = [0, 0];
