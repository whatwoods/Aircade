// 棋子精灵：黑曜石 / 白瓷 / 冰晶，按「尺寸 × 缩放」预渲染一次（第 4.4 节）
import { C } from './theme.ts';

export type StoneKind = 'b' | 'w' | 'x' | 'gb' | 'gw' | 'gx' | 'glow' | 'flash' | 'halo';

export class StoneArt {
  /** 逻辑直径 */
  D = 34;
  private k = 1;
  private sprites = new Map<StoneKind, HTMLCanvasElement>();
  /** 精灵逻辑尺寸 = D × PAD */
  static readonly PAD = 1.5;

  build(diameter: number, k: number): void {
    if (diameter === this.D && k === this.k && this.sprites.size) return;
    this.D = diameter; this.k = k;
    this.sprites.clear();
    for (const kind of ['b', 'w', 'x', 'gb', 'gw', 'gx', 'flash'] as StoneKind[]) this.sprites.set(kind, this.make(kind, StoneArt.PAD));
    this.sprites.set('glow', this.make('glow', 2.6));
    this.sprites.set('halo', this.make('halo', 2.0));
  }

  private make(kind: StoneKind, pad: number): HTMLCanvasElement {
    const D = this.D * this.k;
    const S = Math.ceil(D * pad);
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2, r = D / 2;
    g.translate(cx, cy);
    if (kind === 'b' || kind === 'w' || kind === 'x') {
      // 投影
      g.save();
      g.shadowColor = 'rgba(8,12,18,0.45)';
      g.shadowBlur = 4 * this.k;
      g.shadowOffsetX = 1.5 * this.k;
      g.shadowOffsetY = 2.5 * this.k;
      g.fillStyle = kind === 'x' ? 'rgba(40,70,90,0.35)' : '#000';
      g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    if (kind === 'b') {
      const gr = g.createRadialGradient(-0.32 * r, -0.38 * r, 0.04 * r, 0, 0, r * 1.05);
      gr.addColorStop(0, '#454E59');
      gr.addColorStop(0.28, '#20262E');
      gr.addColorStop(0.75, '#0D1013');
      gr.addColorStop(1, '#050607');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      // 底边冷蓝环境反射
      g.strokeStyle = 'rgba(127,219,255,0.16)';
      g.lineWidth = 0.1 * r;
      g.beginPath(); g.arc(0, 0, r * 0.84, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
      // 锐利高光
      g.save();
      g.rotate(-0.55);
      const hg = g.createRadialGradient(-0.1 * r, -0.46 * r, 0, -0.1 * r, -0.46 * r, 0.36 * r);
      hg.addColorStop(0, 'rgba(255,255,255,0.75)');
      hg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg;
      g.beginPath(); g.ellipse(-0.1 * r, -0.46 * r, 0.36 * r, 0.17 * r, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(-0.36 * r, -0.36 * r, 0.06 * r, 0, Math.PI * 2); g.fill();
      // 细边
      g.strokeStyle = 'rgba(160,180,200,0.10)';
      g.lineWidth = Math.max(1, 0.03 * r);
      g.beginPath(); g.arc(0, 0, r * 0.985, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'w') {
      const gr = g.createRadialGradient(-0.3 * r, -0.36 * r, 0.02 * r, 0, 0, r * 1.02);
      gr.addColorStop(0, '#FFFFFF');
      gr.addColorStop(0.45, '#F1F4F7');
      gr.addColorStop(0.82, '#D2D9E0');
      gr.addColorStop(1, '#A9B5C1');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      // 淡蓝反光
      g.strokeStyle = 'rgba(150,178,204,0.45)';
      g.lineWidth = 0.1 * r;
      g.beginPath(); g.arc(0, 0, r * 0.84, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      // 釉面柔光
      const hg = g.createRadialGradient(-0.3 * r, -0.4 * r, 0, -0.3 * r, -0.4 * r, 0.5 * r);
      hg.addColorStop(0, 'rgba(255,255,255,1)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg;
      g.beginPath(); g.arc(-0.3 * r, -0.4 * r, 0.5 * r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,140,160,0.25)';
      g.lineWidth = Math.max(1, 0.03 * r);
      g.beginPath(); g.arc(0, 0, r * 0.985, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'x') {
      const gr = g.createRadialGradient(-0.25 * r, -0.3 * r, 0.05 * r, 0, 0, r);
      gr.addColorStop(0, 'rgba(230,250,255,0.85)');
      gr.addColorStop(0.5, 'rgba(127,219,255,0.55)');
      gr.addColorStop(1, 'rgba(70,160,210,0.55)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      // 折射线
      g.save();
      g.beginPath(); g.arc(0, 0, r * 0.92, 0, Math.PI * 2); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = Math.max(1, 0.05 * r);
      for (let i = 0; i < 3; i++) {
        const a = -0.9 + i * 0.75;
        g.beginPath();
        g.moveTo(Math.cos(a) * -r, Math.sin(a) * -r + (i - 1) * 0.25 * r);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r + (i - 1) * 0.25 * r);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = 'rgba(216,246,255,0.95)';
      g.lineWidth = Math.max(1, 0.07 * r);
      g.beginPath(); g.arc(0, 0, r * 0.95, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.ellipse(-0.32 * r, -0.42 * r, 0.22 * r, 0.1 * r, -0.6, 0, Math.PI * 2); g.fill();
    } else if (kind === 'gb' || kind === 'gw' || kind === 'gx') {
      g.fillStyle = C.accentDim;
      g.beginPath(); g.arc(0, 0, r * 0.92, 0, Math.PI * 2); g.fill();
      g.strokeStyle = kind === 'gb' ? 'rgba(12,14,17,0.62)' : kind === 'gw' ? 'rgba(244,246,248,0.75)' : 'rgba(216,246,255,0.85)';
      g.lineWidth = Math.max(1.5, 0.13 * r);
      g.beginPath(); g.arc(0, 0, r * 0.86, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'glow') {
      const R = (D * 2.6) / 2;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, 'rgba(216,246,255,0.75)');
      gr.addColorStop(0.3, 'rgba(127,219,255,0.38)');
      gr.addColorStop(1, 'rgba(127,219,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    } else if (kind === 'halo') {
      const R = D;
      const gr = g.createRadialGradient(0, 0, r * 0.8, 0, 0, R);
      gr.addColorStop(0, 'rgba(127,219,255,0.5)');
      gr.addColorStop(1, 'rgba(127,219,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    } else if (kind === 'flash') {
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 0.14 * r;
      g.beginPath(); g.arc(0, 0, r * 0.93, 0, Math.PI * 2); g.stroke();
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)');
      gr.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    }
    return cv;
  }

  /** 以逻辑坐标绘制；size 为逻辑直径（默认 D） */
  draw(ctx: CanvasRenderingContext2D, kind: StoneKind, x: number, y: number, size = this.D, sx = 1, sy = 1): void {
    const spr = this.sprites.get(kind);
    if (!spr) return;
    const pad = kind === 'glow' ? 2.6 : kind === 'halo' ? 2.0 : StoneArt.PAD;
    const w = size * pad * sx, h = size * pad * sy;
    ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
  }
}

export function kindOf(c: number): StoneKind { return c === 1 ? 'b' : c === 2 ? 'w' : 'x'; }
export function ghostKindOf(c: number): StoneKind { return c === 1 ? 'gb' : c === 2 ? 'gw' : 'gx'; }
