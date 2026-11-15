// 带前缀的安全存储（所有读写都包在 try/catch 里）：网页走 localStorage，快手端走 KwaiStorage
import { kw } from '../platform/yoola/kwai.ts';

const PREFIX = 'aircade.pack-battle.';

export function load<T>(key: string, def: T): T {
  try {
    if (__YOOLA__) {
      // KwaiStorage 直接存取对象；没存过时各端分别返回 undefined / 空串
      const v = kw().KwaiStorage.getSync(PREFIX + key);
      return v === undefined || v === null || v === '' ? def : (v as T);
    }
    const s = window.localStorage.getItem(PREFIX + key);
    if (s === null) return def;
    return JSON.parse(s) as T;
  } catch {
    return def;
  }
}

export function save(key: string, v: unknown): void {
  try {
    if (__YOOLA__) {
      kw().KwaiStorage.setSync(PREFIX + key, v);
      return;
    }
    window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

export function remove(key: string): void {
  try {
    if (__YOOLA__) {
      kw().KwaiStorage.removeSync(PREFIX + key);
      return;
    }
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  vibrate: boolean;
  shake: boolean;
  speed: number;
}

const DEFAULTS: Settings = { sfx: true, music: true, vibrate: true, shake: true, speed: 1 };

export const settings: Settings = { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) };

export function saveSettings(): void {
  save('settings', settings);
}
