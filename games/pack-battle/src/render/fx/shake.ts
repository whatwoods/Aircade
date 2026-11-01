// trauma 震屏 + hitstop + 手机震动（分级 T0–T4）
import { FX } from '../../config.ts';
import { settings } from '../../core/storage.ts';
import { noise1 } from '../noise.ts';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const shake = {
  trauma: 0,
  t: 0,
  x: 0,
  y: 0,
  rot: 0,
  /** 剩余 hitstop（秒，真实时间） */
  stop: 0,
  lastT1: -1,
  lastVib: 0,
  reduced,
};

export function addTrauma(v: number): void {
  shake.trauma = Math.min(1, shake.trauma + v);
}

export function vibrate(p: number | number[]): void {
  if (!settings.vibrate) return;
  const now = performance.now();
  if (now - shake.lastVib < FX.vibrateGapMs) return;
  shake.lastVib = now;
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(p);
  } catch {
    /* ignore */
  }
}

/** 触发一个层级的反馈；stop=false 时不做 hitstop（整理阶段） */
export function tier(t: Tier, stop = true): void {
  const d = FX.tiers[t];
  if (t === 'T1') {
    if (shake.t - shake.lastT1 < FX.t1Cooldown) {
      return;
    }
    shake.lastT1 = shake.t;
  }
  addTrauma(d.trauma);
  if (stop && d.stop > 0) shake.stop = Math.max(shake.stop, d.stop / 1000);
  const vib = d.vib;
  if (vib !== 0) vibrate(vib);
}

export function updateShake(raw: number): void {
  shake.t += raw;
  shake.trauma = Math.max(0, shake.trauma - FX.traumaDecay * raw);
  if (shake.stop > 0) shake.stop = Math.max(0, shake.stop - raw);
  let k = settings.shake ? 1 : 0;
  if (reduced) k *= 0.3;
  const tt = shake.trauma * shake.trauma * k;
  shake.x = FX.shakeMax * tt * noise1(shake.t * 22, 1);
  shake.y = FX.shakeMax * tt * noise1(shake.t * 22, 2);
  shake.rot = ((FX.shakeRotDeg * Math.PI) / 180) * tt * noise1(shake.t * 18, 3);
}
