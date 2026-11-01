// 本地存储：统一前缀，全部 try/catch
const PREFIX = 'aircade.five-drop.';
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v == null) return fallback;
    return JSON.parse(v) as T;
  } catch { return fallback; }
}
export function save(key: string, v: unknown): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch { /* 隐私模式 */ }
}
export function remove(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export interface Settings {
  sfx: boolean; music: boolean; vibrate: boolean; ghost: boolean; preview: boolean;
  sensitivity: 'low' | 'mid' | 'high'; reduceMotion: boolean;
}
export const DEFAULT_SETTINGS: Settings = { sfx: true, music: true, vibrate: true, ghost: true, preview: true, sensitivity: 'mid', reduceMotion: false };
export function loadSettings(): Settings { return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) }; }
export function saveSettings(s: Settings): void { save('settings', s); }

export interface Career { games: number; bestLine: number; bestChain: number; totalFives: number }
