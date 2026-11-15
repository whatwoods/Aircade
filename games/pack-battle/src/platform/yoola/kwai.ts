// 快手 Yoola 平台全局对象的类型与取用入口。
// 平台能力只能经 package/kwaiOpenApi/kwai-*.js 的封装调用，这里只声明用到的那部分。
// 一律通过 window 取（快手运行时没有 globalThis）。

export interface KwaiGlobals {
  AIGCUtils: {
    _now(): number;
    Layout: { w: number; h: number; safeTop: number; usableH: number };
    Render?: { draw?: () => void };
  };
  KwaiStorage: { setSync(key: string, data: unknown): void; getSync(key: string): unknown; removeSync(key: string): void };
  KwaiBase: {
    onShow(cb: () => void): void;
    onHide(cb: () => void): void;
    getSystemInfo(): { windowWidth?: number; windowHeight?: number; safeArea?: { top: number; bottom: number } };
  };
  KwaiRender: {
    createOffscreenCanvas(w: number, h: number): HTMLCanvasElement;
    loadImage(o: { src: string; onSuccess?: (img: HTMLImageElement) => void; onFail?: (e: unknown) => void }): void;
    loadFont(path: string, alias?: string, onLoad?: (family: string) => void, onError?: (e: unknown) => void): string | null;
  };
  KwaiMedia: {
    Audio: {
      playBgm(src: string): void;
      pauseBgm(): void;
      resumeBgm(): void;
      stopBgm(): void;
      playSfx(src: string): void;
      setBgmVolume(v: number): void;
      setSfxVolume(v: number): void;
    };
  };
  KwaiAd: { showRewarded(onRewarded: () => void, onCancel?: () => void): void };
  KwaiDevice: { vibrateShort(type?: string): void; vibrateLong(): void };
  KwaiRepost: { shareAppMessage(o: { query?: Record<string, string>; onSuccess?: () => void; onCancel?: () => void; onFail?: (e: unknown) => void }): void };
}

export const kw = (): KwaiGlobals => window as unknown as KwaiGlobals;

/** 没有快手运行时（H5 预览）时 ks 不存在 */
export function inKwai(): boolean {
  return typeof (window as unknown as { ks?: unknown }).ks !== 'undefined';
}
