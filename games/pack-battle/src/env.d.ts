/** 版本号（vite.config.ts 从 package.json 注入） */
declare const __APP_VERSION__: string;
/** 快手 Yoola 构建（--mode yoola）；构建时求值，网页和 TapTap 包里相关分支整段被摇掉 */
declare const __YOOLA__: boolean;

interface ImportMetaEnv {
  /** TapTap 激励视频 / 插屏广告单元 ID（.env.tap，只有 TapTap 构建用） */
  readonly VITE_TAP_AD_REWARDED?: string;
  readonly VITE_TAP_AD_INTERSTITIAL?: string;
  /** TapTap 排行榜（最高分 / 每日挑战）与分享模板 ID（官方小游戏 MCP 创建） */
  readonly VITE_TAP_LB_BEST?: string;
  readonly VITE_TAP_LB_DAILY?: string;
  readonly VITE_TAP_SHARE_TEMPLATE?: string;
}
