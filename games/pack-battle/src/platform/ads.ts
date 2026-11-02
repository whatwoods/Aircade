// 广告统一入口：界面和结局页只调这里；TapTap 实现只进 TapTap 构建，普通网页版没有广告，也不请求任何外部资源
import { resumeAudio, suspendAudio } from '../audio/audio.ts';
import { AD } from '../config.ts';
import { resetClock } from '../core/loop.ts';

export interface AdProvider {
  rewardedReady(): boolean;
  /** true = 完整看完 */
  showRewarded(): Promise<boolean>;
  interstitialReady(): boolean;
  showInterstitial(): Promise<void>;
}

let provider: AdProvider | null = null;
let playing = false;
/** 上一条广告结束的时刻（performance.now，-Infinity = 本次启动还没放过） */
let lastAdAt = -Infinity;

export async function initAds(): Promise<void> {
  // 判断在构建时求值，网页版里这段连同 tap.ts 一起被摇掉
  if (import.meta.env.MODE !== 'tap') return;
  const { createTapAds } = await import('./tap.ts');
  try {
    provider = createTapAds(import.meta.env.VITE_TAP_AD_REWARDED ?? '', import.meta.env.VITE_TAP_AD_INTERSTITIAL ?? '');
  } catch {
    provider = null;
  }
}

/** 调试：换成假广告 */
export function setAdProvider(p: AdProvider | null): void {
  provider = p;
  lastAdAt = -Infinity;
}

export function rewardedReady(): boolean {
  return !playing && !!provider?.rewardedReady();
}

/** 广告播放中：失焦不弹暂停，界面按钮不响应 */
export function adPlaying(): boolean {
  return playing;
}

async function play<T>(show: () => Promise<T>): Promise<T> {
  playing = true;
  suspendAudio();
  try {
    return await show();
  } finally {
    playing = false;
    lastAdAt = performance.now();
    resetClock();
    resumeAudio();
  }
}

export function showRewarded(): Promise<boolean> {
  const p = provider;
  if (!p || playing || !p.rewardedReady()) return Promise.resolve(false);
  return play(() => p.showRewarded());
}

/** 距上一条广告够久才放；不放或放完都会 resolve */
export function showInterstitial(): Promise<void> {
  const p = provider;
  if (!p || playing || !p.interstitialReady() || performance.now() - lastAdAt < AD.interstitialGapMs) return Promise.resolve();
  return play(() => p.showInterstitial());
}
