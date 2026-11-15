// 快手端音频总控（顶替 src/audio/audio.ts）：不用 WebAudio，只经 KwaiMedia.Audio 播放预渲染的文件
import { settings } from '../../core/storage.ts';
import { now } from '../now.ts';
import { kw } from './kwai.ts';

export const au = { ctx: null as null, ready: true, fast: false };

export const SFX_GAIN = 0.8;
/** 音乐文件的目标音量：网页里 总线 0.35 × 文件增益 0.6 × 总音量 0.9 */
export const MUSIC_GAIN = 0.19;

export function whenReady(fn: () => void): void {
  fn();
}

/** 快手不需要手势解锁 */
export function unlockAudio(): void {}

/** 当前该不该有音乐声（music.ts 在切曲时更新） */
let musicWanted = false;
export function setMusicWanted(v: boolean): void {
  musicWanted = v;
}

export function suspendAudio(): void {
  try {
    kw().KwaiMedia.Audio.pauseBgm();
  } catch {
    /* ignore */
  }
}

export function resumeAudio(): void {
  if (!musicWanted || !settings.music) return;
  try {
    kw().KwaiMedia.Audio.resumeBgm();
  } catch {
    /* ignore */
  }
}

export function applyVolumes(): void {
  try {
    kw().KwaiMedia.Audio.setSfxVolume(settings.sfx ? SFX_GAIN : 0);
  } catch {
    /* ignore */
  }
}

// ---- 音乐压低（首领入场、凤凰复活）：用时间包络算一个 0..1 的系数，music.ts 每帧乘进音量 ----
let duckFrom = 0;
let duckSec = 0;
let duckLow = 1;

export function duckMusic(db = 4, sec = 0.2): void {
  if (!settings.music) return;
  duckFrom = now();
  duckSec = sec;
  duckLow = 10 ** (-db / 20);
}

/** 当前压低系数：0.05s 压下去，停 sec 秒，再 0.4s 回来 */
export function duckLevel(): number {
  if (duckSec === 0 && duckFrom === 0) return 1;
  const t = (now() - duckFrom) / 1000;
  if (t < 0.05) return 1 + (duckLow - 1) * (t / 0.05);
  if (t < 0.05 + duckSec) return duckLow;
  const r = (t - 0.05 - duckSec) / 0.4;
  return r >= 1 ? 1 : duckLow + (1 - duckLow) * r;
}

/** 限流：同名最短 30ms；次要音效在 4× 速度下 50% 跳过 */
const last: Record<string, number> = {};
export function gate(name: string, minor = false, minGap = 0.03): boolean {
  if (!settings.sfx) return false;
  if (minor && au.fast && Math.random() < 0.5) return false;
  const t = now() / 1000;
  const l = last[name] ?? -1;
  if (t - l < minGap) return false;
  last[name] = t;
  return true;
}
