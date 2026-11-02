// TapTap 广告实现：只进 TapTap 构建（pnpm build:tap），接口见小游戏文档 tap.createRewardedVideoAd / tap.createInterstitialAd
import type { AdProvider } from './ads.ts';

type RewardedClose = { isEnded?: boolean } | undefined;

interface TapAd<C> {
  onLoad(cb: () => void): void;
  onError(cb: (err: unknown) => void): void;
  onClose(cb: (res: C) => void): void;
  show(): Promise<unknown>;
  load?(): Promise<unknown>;
}

interface TapGlobal {
  createRewardedVideoAd?(o: { adUnitId: string }): TapAd<RewardedClose>;
  createInterstitialAd?(o: { adUnitId: string }): TapAd<void>;
}

const RELOAD_MS = 30000;

/** 没有全局 tap 或没配广告单元 ID 时返回 null */
export function createTapAds(rewardedId: string, interstitialId: string): AdProvider | null {
  const tap = (globalThis as unknown as { tap?: TapGlobal }).tap;
  if (!tap || (!rewardedId && !interstitialId)) return null;

  let ready = false;
  let closeRewarded: ((ended: boolean) => void) | null = null;
  const rewarded = rewardedId && tap.createRewardedVideoAd ? tap.createRewardedVideoAd({ adUnitId: rewardedId }) : null;
  const reload = (): void => {
    setTimeout(() => void rewarded?.load?.().then(() => (ready = true)).catch(() => undefined), RELOAD_MS);
  };
  rewarded?.onLoad(() => (ready = true));
  rewarded?.onError(() => {
    ready = false;
    reload();
  });
  rewarded?.onClose((res) => {
    // 看完或关闭后素材清空，平台自动拉下一份，拉好时 onLoad 再置回
    ready = false;
    closeRewarded?.(!!res?.isEnded);
    closeRewarded = null;
  });

  let iReady = false;
  let closeInterstitial: (() => void) | null = null;
  const interstitial = interstitialId && tap.createInterstitialAd ? tap.createInterstitialAd({ adUnitId: interstitialId }) : null;
  interstitial?.onLoad(() => (iReady = true));
  interstitial?.onError(() => (iReady = false));
  interstitial?.onClose(() => {
    iReady = false;
    closeInterstitial?.();
    closeInterstitial = null;
  });

  return {
    rewardedReady: () => ready,
    showRewarded: () =>
      new Promise<boolean>((resolve) => {
        if (!rewarded) return resolve(false);
        closeRewarded = resolve;
        rewarded.show().catch(() => {
          ready = false;
          closeRewarded = null;
          reload();
          resolve(false);
        });
      }),
    interstitialReady: () => iReady,
    showInterstitial: () =>
      new Promise<void>((resolve) => {
        if (!interstitial) return resolve();
        closeInterstitial = resolve;
        interstitial.show().catch(() => {
          iReady = false;
          closeInterstitial = null;
          resolve();
        });
      }),
  };
}
