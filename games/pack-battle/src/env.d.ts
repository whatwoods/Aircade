/** 版本号（vite.config.ts 从 package.json 注入） */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** TapTap 激励视频 / 插屏广告单元 ID（.env.tap，只有 TapTap 构建用） */
  readonly VITE_TAP_AD_REWARDED?: string;
  readonly VITE_TAP_AD_INTERSTITIAL?: string;
}
