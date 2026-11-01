import { flicker } from '../core/noise';
import { makeCanvas, radialBlob, type Sprite } from './gfx';
import type { Layout } from './layout';
import { drawWall } from './textures';

/**
 * 桌面两侧背景（文档 §6.7）：#bg 铺满窗口，DPR 1，30fps。
 * 暗石墙 + 35% 高度处壁挂火把（光池）+ 垂链（鼠标视差 ±4px）+ 栏两侧石柱过渡。
 */
export class Bg {
  private c: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wall: HTMLCanvasElement | null = null;
  private glow: Sprite;
  private acc = 0;
  private L: Layout | null = null;
  private flame: HTMLCanvasElement;
  mx = 0;
  my = 0;
  active = false;

  constructor(c: HTMLCanvasElement) {
    this.c = c;
    this.ctx = c.getContext('2d')!;
    this.glow = radialBlob(256, '#FFB54A', 0, 1.8);
    const [f, fc] = makeCanvas(24, 44);
    const g = fc.createRadialGradient(12, 30, 1, 12, 26, 18);
    g.addColorStop(0, '#FFF0C8');
    g.addColorStop(0.35, '#FFB54A');
    g.addColorStop(0.75, 'rgba(255,122,26,0.7)');
    g.addColorStop(1, 'rgba(255,122,26,0)');
    fc.fillStyle = g;
    fc.beginPath();
    fc.moveTo(12, 2);
    fc.bezierCurveTo(22, 20, 22, 40, 12, 42);
    fc.bezierCurveTo(2, 40, 2, 20, 12, 2);
    fc.fill();
    this.flame = f;
  }

  resize(L: Layout): void {
    this.L = L;
    const w = L.vw;
    const h = L.vh;
    this.active = L.colX > 8;
    this.c.width = this.active ? w : 1;
    this.c.height = this.active ? h : 1;
    this.c.style.width = w + 'px';
    this.c.style.height = h + 'px';
    if (!this.active) {
      this.wall = null;
      return;
    }
    const [wc, wx] = makeCanvas(w, h);
    const grain = makeCanvas(64, 64)[0];
    drawWall(wx, w, h, 1, 31, grain, 0.8);
    // 石柱过渡
    const pw = Math.min(70, L.colX);
    for (const side of [0, 1]) {
      const x0 = side === 0 ? L.colX - pw : L.colX + L.colW;
      const g = wx.createLinearGradient(x0, 0, x0 + pw, 0);
      const a = side === 0 ? ['rgba(10,12,17,0)', 'rgba(26,30,40,0.95)'] : ['rgba(26,30,40,0.95)', 'rgba(10,12,17,0)'];
      g.addColorStop(0, a[0]);
      g.addColorStop(1, a[1]);
      wx.fillStyle = g;
      wx.fillRect(x0, 0, pw, h);
      wx.fillStyle = 'rgba(110,124,150,0.18)';
      wx.fillRect(side === 0 ? L.colX - 2 : L.colX + L.colW + 1, 0, 1, h);
    }
    // 暗角
    const vg = wx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    vg.addColorStop(0, 'rgba(7,8,13,0)');
    vg.addColorStop(1, 'rgba(7,8,13,0.85)');
    wx.fillStyle = vg;
    wx.fillRect(0, 0, w, h);
    this.wall = wc;
    this.acc = 1e9;
  }

  update(dtMs: number, real: number): void {
    if (!this.active || !this.wall || !this.L) return;
    this.acc += dtMs;
    if (this.acc < 33) return;
    this.acc = 0;
    const L = this.L;
    const ctx = this.ctx;
    const t = real / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.wall, 0, 0);
    const y = L.vh * 0.35;
    for (const side of [0, 1]) {
      const x = side === 0 ? L.colX * 0.5 : L.colX + L.colW + (L.vw - L.colX - L.colW) * 0.5;
      const fl = flicker(t * 1.2, side * 9 + 2);
      // 光池
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + 0.05 * fl;
      const r = Math.min(260, L.colX * 0.9) * (1 + 0.04 * fl);
      ctx.drawImage(this.glow.c, x - r, y - r - 20, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // 铁托架
      ctx.fillStyle = '#20232B';
      ctx.fillRect(x - 3, y, 6, 34);
      ctx.fillRect(x - 12, y + 30, 24, 5);
      ctx.fillStyle = '#3B2A1C';
      ctx.fillRect(x - 5, y - 4, 10, 10);
      // 火焰
      ctx.globalCompositeOperation = 'lighter';
      const sc = 1 + 0.12 * flicker(t * 2.1, side + 5);
      ctx.translate(x, y - 2);
      ctx.rotate(0.1 * flicker(t * 1.7, side + 13));
      ctx.scale(sc, sc);
      ctx.drawImage(this.flame, -12, -42, 24, 44);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      // 铁链（视差）
      const px = this.mx * 4 * (side === 0 ? 1 : -1);
      const cxs = side === 0 ? [x - L.colX * 0.3, x + L.colX * 0.28] : [x - L.colX * 0.26, x + L.colX * 0.32];
      ctx.strokeStyle = 'rgba(60,66,80,0.9)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const ccx = cxs[k] + px * (k + 1) * 0.6;
        const len = L.vh * (0.22 + k * 0.12);
        const sway = Math.sin(t * 0.6 + k + side) * 3;
        for (let yy = 0; yy < len; yy += 9) {
          ctx.beginPath();
          ctx.ellipse(ccx + (sway * yy) / len, yy, 3, 5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
}
