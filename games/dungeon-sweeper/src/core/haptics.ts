import { CONFIG } from '../config';

let enabled = true;
let last = 0;

export function setHaptics(on: boolean): void {
  enabled = on;
}

/** 震动：ms 或模式数组。不支持的平台静默忽略 */
export function vibrate(p: number | number[]): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - last < CONFIG.juice.hapticMinGapMs) return;
  last = now;
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return; // 避免浏览器「未经用户手势」干预警告
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p);
  } catch {
    /* ignore */
  }
}
