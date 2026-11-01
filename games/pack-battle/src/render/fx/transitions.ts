// 墨渍转场：带噪声边缘的圆从一点扩散盖满全屏，再收回
import { ease } from '../../core/tween.ts';
import { noise1 } from '../noise.ts';
import { stage } from '../stage.ts';

const N = 48;
const pts = new Float32Array(N * 2);

export const blot = {
  active: false,
  t: 0,
  dur: 0.45,
  phase: 0 as 0 | 1,
  cx: 0.5,
  cy: 0.5,
  mid: null as (() => void) | null,
  seed: 1,
};

export function inkTransition(mid: () => void, cx = 0.5, cy = 0.5): void {
  blot.active = true;
  blot.t = 0;
  blot.phase = 0;
  blot.mid = mid;
  blot.cx = cx;
  blot.cy = cy;
  blot.seed = (blot.seed + 7) % 97;
}

export function updateBlot(raw: number): void {
  if (!blot.active) return;
  blot.t += raw;
  if (blot.phase === 0 && blot.t >= blot.dur) {
    blot.phase = 1;
    blot.t = 0;
    const m = blot.mid;
    blot.mid = null;
    if (m) m();
  } else if (blot.phase === 1 && blot.t >= blot.dur) {
    blot.active = false;
  }
}

/** 屏幕空间绘制（调用前设好 DPR 变换） */
export function drawBlot(ctx: CanvasRenderingContext2D): void {
  if (!blot.active) return;
  const k = Math.min(1, blot.t / blot.dur);
  const p = blot.phase === 0 ? ease.inCubic(k) : 1 - ease.outCubic(k);
  const W = stage.vw;
  const H = stage.vh;
  const cx = W * blot.cx;
  const cy = H * blot.cy;
  const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.25 * p;
  if (R <= 0.5) return;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (1 + 0.1 * noise1(i * 0.6, blot.seed) + 0.05 * noise1(i * 2.1, blot.seed + 3));
    pts[i * 2] = cx + Math.cos(a) * r;
    pts[i * 2 + 1] = cy + Math.sin(a) * r;
  }
  ctx.fillStyle = '#2b1d14';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < N; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  ctx.closePath();
  ctx.fill();
  // 飞溅墨点
  if (p > 0.15 && p < 0.95) {
    for (let i = 0; i < 7; i++) {
      const a = noise1(i * 3.3, blot.seed + 9) * Math.PI * 2 + i;
      const r = R * (1.08 + 0.12 * Math.abs(noise1(i * 1.7, blot.seed)));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4 + 10 * p * Math.abs(noise1(i, 4)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
