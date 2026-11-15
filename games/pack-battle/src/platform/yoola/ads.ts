// 快手广告：只有激励视频（KwaiAd.showRewarded），插屏在这个包里不存在
import type { AdProvider } from '../ads.ts';
import { kw } from './kwai.ts';

export function createKwaiAds(): AdProvider | null {
  if (typeof kw().KwaiAd?.showRewarded !== 'function') return null;
  return {
    rewardedReady: () => true,
    showRewarded: () =>
      new Promise<boolean>((resolve) => {
        try {
          // 看完回调 onRewarded，中途关闭回调 onCancel
          kw().KwaiAd.showRewarded(() => resolve(true), () => resolve(false));
        } catch {
          resolve(false);
        }
      }),
    interstitialReady: () => false,
    showInterstitial: () => Promise.resolve(),
  };
}
