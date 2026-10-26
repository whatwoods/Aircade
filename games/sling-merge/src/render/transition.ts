/**
 * 汽水浪涌转场（docs §6.8）：粉色渐变波浪（正弦边，振幅 14，两层相位不同）+ 上升气泡。
 * 前半 0.35 s cubicIn 从底部涨满全屏（此刻切换场景），后半 0.35 s cubicOut 冲出屏幕。
 * 画在 #wave（舞台最上层，pointer-events: none）。
 */
import { CONFIG } from '../config';
import { ease } from '../core/math';
import { rngFx } from '../core/rng';

const W = CONFIG.layout.stageW;
const H = CONFIG.layout.stageH;
const HALF = 0.35;
const NB = 22;

export class Transition {
  active = false;
  private t = 0;
  private mid: (() => void) | null = null;
  private midDone = false;
  private cleared = true;
  private grad: CanvasGradient | null = null;
  private gradCtx: CanvasRenderingContext2D | null = null;
  private bx = new Float32Array(NB);
  private by = new Float32Array(NB);
  private br = new Float32Array(NB);
  private bs = new Float32Array(NB);

  get busy(): boolean {
    return this.active;
  }

  start(onMid: () => void): void {
    this.active = true;
    this.t = 0;
    this.mid = onMid;
    this.midDone = false;
    for (let i = 0; i < NB; i++) {
      this.bx[i] = rngFx.next() * W;
      this.by[i] = rngFx.next() * 300;
      this.br[i] = 3 + rngFx.next() * 9;
      this.bs[i] = 0.6 + rngFx.next() * 0.8;
    }
  }

  update(realDt: number): void {
    if (!this.active) return;
    this.t += realDt;
    if (!this.midDone && this.t >= HALF) {
      this.midDone = true;
      const m = this.mid;
      this.mid = null;
      m?.();
    }
    if (this.t >= HALF * 2) this.active = false;
  }

  draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    if (!this.active) {
      if (!this.cleared) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.cleared = true;
      }
      return;
    }
    this.cleared = false;
    const k = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (!this.grad || this.gradCtx !== ctx) {
      this.grad = ctx.createLinearGradient(0, 0, 0, H);
      this.grad.addColorStop(0, '#FF8FB1');
      this.grad.addColorStop(1, '#FFC2D4');
      this.gradCtx = ctx;
    }
    const t = this.t;
    // 前沿（顶边）与后沿（底边）
    let top: number;
    let bottom: number;
    if (t < HALF) {
      top = H + 40 - (H + 80) * ease.cubicIn(t / HALF);
      bottom = H + 60;
    } else {
      top = -40;
      bottom = H + 60 - (H + 120) * ease.cubicOut((t - HALF) / HALF);
    }
    const ph = t * 9;
    // 后层（浅，略超前）
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFD3E0';
    this.body(ctx, top - 16, bottom - 10, ph + 1.7, 1.2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.grad;
    this.body(ctx, top, bottom, ph, 1);
    // 前沿白色泡沫线
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const y = top + Math.sin(x * 0.028 + ph) * 14 + 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 气泡
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < NB; i++) {
      const y = top + 30 + this.by[i]! + (H - 300) * (1 - Math.min(1, t * this.bs[i]!));
      if (y < top + 10 || y > bottom - 10) continue;
      ctx.beginPath();
      ctx.arc(this.bx[i]! + Math.sin(t * 6 + i) * 6, y, this.br[i]!, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private body(ctx: CanvasRenderingContext2D, top: number, bottom: number, ph: number, f: number): void {
    ctx.beginPath();
    ctx.moveTo(0, top);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, top + Math.sin(x * 0.028 * f + ph) * 14);
    if (bottom < H + 40) {
      for (let x = W; x >= 0; x -= 10) ctx.lineTo(x, bottom + Math.sin(x * 0.024 * f - ph) * 14);
    } else {
      ctx.lineTo(W, H + 80);
      ctx.lineTo(0, H + 80);
    }
    ctx.closePath();
    ctx.fill();
  }
}
