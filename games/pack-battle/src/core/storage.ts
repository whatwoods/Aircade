// 带前缀的安全 localStorage（所有读写都包在 try/catch 里）
const PREFIX = 'aircade.pack-battle.';

export function load<T>(key: string, def: T): T {
  try {
    const s = window.localStorage.getItem(PREFIX + key);
    if (s === null) return def;
    return JSON.parse(s) as T;
  } catch {
    return def;
  }
}

export function save(key: string, v: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

export function remove(key: string): void {
  try {
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
