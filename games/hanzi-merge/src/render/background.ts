/**
 * 背景（§6.5 / §6.7 ⑧）：宣纸、暗角、远山（3 层视差）、米字格棋盘静态层、桌面两侧装饰。
 * 静态层只在 resize 时重绘；远山预渲染，每帧只 drawImage。
 */
import { CONFIG, LAYOUT, cellXY } from '../config.ts';
import { Rng } from '../core/rng.ts';
import { makePaper } from './ink.ts';
import { seal } from './seal.ts';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class Background {
  paper = makePaper();
  private paperPat: CanvasPattern | null = null;
  /** 纸 + 暗角（整舞台） */
  private base: HTMLCanvasElement = canvas(1, 1);
  /** 棋盘格子（米字格） */
  private grid: HTMLCanvasElement = canvas(1, 1);
  private hills: HTMLCanvasElement[] = [];
  private dpr = 0;

  build(dpr: number): void {
    this.dpr = dpr;
    const W = LAYOUT.W;
    const H = LAYOUT.H;
    // 纸
    this.base = canvas(W * dpr, H * dpr);
    const g = this.base.getContext('2d')!;
    g.scale(dpr, dpr);
    this.paperPat = g.createPattern(this.paper, 'repeat');
    g.fillStyle = this.paperPat!;
    g.save();
    g.scale(0.5, 0.5); // 纹理按 2× 采样，纤维更细
    g.fillRect(0, 0, W * 2, H * 2);
    g.restore();
    const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(80,60,30,0)');
    vg.addColorStop(1, 'rgba(80,60,30,0.18)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // 远山
    this.hills = [];
    const rng = new Rng(5);
    const cols = ['rgba(169,159,146,0.16)', 'rgba(169,159,146,0.22)', 'rgba(150,140,128,0.26)'];
    for (let L = 0; L < 3; L++) {
      const hw = W + 24;
      const hh = 170;
      const c = canvas(hw * dpr, hh * dpr);
      const hg = c.getContext('2d')!;
      hg.scale(dpr, dpr);
      const pts: number[] = [];
      const N = 64;
      const amp = [44, 36, 26][L];
      const base = [62, 92, 122][L];
      const oct = [3, 7, 15, 31].map((o) => {
        const arr: number[] = [];
        for (let i = 0; i <= o; i++) arr.push(rng.next());
        return arr;
      });
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        let v = 0;
        let w = 1;
        let tw = 0;
        for (const o of oct) {
          const f = t * (o.length - 1);
          const i0 = Math.floor(f);
          const fr = f - i0;
          const s = fr * fr * (3 - 2 * fr);
          v += (o[i0] * (1 - s) + o[Math.min(o.length - 1, i0 + 1)] * s) * w;
          tw += w;
          w *= 0.5;
        }
        pts.push(base - (v / tw) * amp * 1.6 + amp * 0.3);
      }
      const grd = hg.createLinearGradient(0, 0, 0, hh);
      grd.addColorStop(0, cols[L]);
      grd.addColorStop(1, 'rgba(169,159,146,0.04)');
      hg.fillStyle = grd;
      hg.beginPath();
      hg.moveTo(0, hh);
      for (let i = 0; i <= N; i++) hg.lineTo((i / N) * hw, pts[i]);
      hg.lineTo(hw, hh);
      hg.closePath();
      hg.fill();
      // 雾带
      const fog = hg.createLinearGradient(0, base - 6, 0, base + 30);
      fog.addColorStop(0, 'rgba(248,243,232,0)');
      fog.addColorStop(0.5, 'rgba(248,243,232,0.5)');
      fog.addColorStop(1, 'rgba(248,243,232,0)');
      hg.fillStyle = fog;
      hg.fillRect(0, base - 6, hw, 36);
      this.hills.push(c);
    }
    // 米字格棋盘
    this.grid = canvas(W * dpr, H * dpr);
    const gg = this.grid.getContext('2d')!;
    gg.scale(dpr, dpr);
    const C = LAYOUT.cell;
    for (let i = 0; i < CONFIG.board.cols * CONFIG.board.rows; i++) {
      const { x, y } = cellXY(i);
      gg.fillStyle = 'rgba(248,243,232,0.72)';
      gg.fillRect(x, y, C, C);
      gg.strokeStyle = 'rgba(167,122,67,0.35)';
      gg.lineWidth = 1;
      gg.strokeRect(x + 0.5, y + 0.5, C - 1, C - 1);
      gg.save();
      gg.strokeStyle = 'rgba(184,49,42,0.16)';
      gg.setLineDash([3, 3]);
      gg.beginPath();
      gg.moveTo(x + 4, y + 4);
      gg.lineTo(x + C - 4, y + C - 4);
      gg.moveTo(x + C - 4, y + 4);
      gg.lineTo(x + 4, y + C - 4);
      gg.moveTo(x + C / 2, y + 3);
      gg.lineTo(x + C / 2, y + C - 3);
      gg.moveTo(x + 3, y + C / 2);
      gg.lineTo(x + C - 3, y + C / 2);
      gg.stroke();
      gg.restore();
    }
  }

  /** 舞台底：纸 + 远山（t 秒，视差漂移） */
  drawBase(ctx: CanvasRenderingContext2D, t: number, hillsY: number, hillsAlpha = 1, drift = true): void {
    ctx.drawImage(this.base, 0, 0, LAYOUT.W, LAYOUT.H);
    if (hillsAlpha <= 0) return;
    ctx.globalAlpha = hillsAlpha;
    for (let L = 0; L < this.hills.length; L++) {
      const c = this.hills[L];
      const off = drift ? Math.sin((t / 60) * Math.PI * 2 + L * 1.7) * (2 + L * 2) : 0;
      ctx.drawImage(c, -12 + off, hillsY, c.width / this.dpr, c.height / this.dpr);
    }
    ctx.globalAlpha = 1;
  }

  drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.grid, 0, 0, LAYOUT.W, LAYOUT.H);
  }

  /** 视口背景（舞台外的书桌）：只在 resize 时重绘 */
  drawDesk(bg: HTMLCanvasElement, stageLeft: number, stageTop: number, scale: number): void {
    const g = bg.getContext('2d')!;
    const dpr = bg.width / Math.max(1, window.innerWidth);
    const W = bg.width / dpr;
    const H = bg.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#E9E0CD');
    grd.addColorStop(1, '#DCCFB5');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const pat = g.createPattern(this.paper, 'repeat');
    if (pat) {
      g.globalAlpha = 0.35;
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(70,50,25,0)');
    vg.addColorStop(1, 'rgba(70,50,25,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    const side = stageLeft;
    if (side < 130) return;
    const sw = LAYOUT.W * scale;
    const sh = LAYOUT.H * scale;
    // 左：砚台 + 毛笔
    const lx = stageLeft / 2;
    const k = Math.min(1.3, side / 220);
    g.save();
    g.translate(lx, stageTop + sh * 0.62);
    g.scale(k, k);
    g.fillStyle = '#3a342d';
    g.beginPath();
    g.ellipse(0, 0, 58, 84, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#25211c';
    g.beginPath();
    g.ellipse(0, 12, 44, 60, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(22,19,15,0.9)';
    g.beginPath();
    g.ellipse(0, -48, 30, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.ellipse(-10, -52, 12, 5, -0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.save();
    g.translate(lx + 4 * k, stageTop + sh * 0.25);
    g.rotate(0.16);
    g.scale(k, k);
    const bg2 = g.createLinearGradient(-6, 0, 6, 0);
    bg2.addColorStop(0, '#7d5a2f');
    bg2.addColorStop(0.5, '#c79a5f');
    bg2.addColorStop(1, '#7d5a2f');
    g.fillStyle = bg2;
    g.fillRect(-6, -150, 12, 210);
    g.fillStyle = '#2e2822';
    g.fillRect(-7, -156, 14, 10);
    g.beginPath();
    g.moveTo(-7, 60);
    g.quadraticCurveTo(-9, 100, 0, 128);
    g.quadraticCurveTo(9, 100, 7, 60);
    g.closePath();
    g.fillStyle = '#16130f';
    g.fill();
    g.restore();
    // 右：淡墨竹 + 闲章
    const rx = stageLeft + sw + side / 2;
    g.save();
    g.translate(rx, stageTop + sh * 0.12);
    g.scale(k, k);
    g.strokeStyle = 'rgba(46,40,34,0.28)';
    g.lineCap = 'round';
    for (let s = 0; s < 2; s++) {
      const x0 = s * 34 - 14;
      g.lineWidth = 7 - s * 2;
      for (let j = 0; j < 6; j++) {
        g.beginPath();
        g.moveTo(x0 + j * 2, j * 78);
        g.lineTo(x0 + j * 2 + 2, j * 78 + 72);
        g.stroke();
      }
      g.fillStyle = 'rgba(46,40,34,0.22)';
      for (let j = 0; j < 5; j++) {
        const yy = 60 + j * 90 + s * 30;
        for (let q = 0; q < 3; q++) {
          g.save();
          g.translate(x0 + j * 2, yy);
          g.rotate((s ? -1 : 1) * (0.6 + q * 0.35));
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(22, -6, 48, 0);
          g.quadraticCurveTo(22, 6, 0, 0);
          g.fill();
          g.restore();
        }
      }
    }
    g.restore();
    const sc = seal('造字', 40, 'white', 'kai', 3);
    const s2 = 40 * k;
    g.globalAlpha = 0.85;
    g.drawImage(sc, rx - s2 / 2, stageTop + sh * 0.86, s2, s2 * (sc.height / sc.width));
    g.globalAlpha = 1;
  }
}
