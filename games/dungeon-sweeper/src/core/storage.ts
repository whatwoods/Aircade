const PREFIX = 'aircade.dungeon-sweeper.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export function clearAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  chord: boolean;
}

export interface Records {
  best: number;
  bestTime: number; // 秒；0 = 无
  wins: number;
  plays: number;
}

export function defaultSettings(): Settings {
  let rm = false;
  try {
    rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    rm = false;
  }
  return { sfx: true, music: true, haptics: true, reducedMotion: rm, chord: true };
}

export function loadSettings(): Settings {
  return { ...defaultSettings(), ...load<Partial<Settings>>('settings', {}) };
}

export function loadRecords(): Records {
  return { best: 0, bestTime: 0, wins: 0, plays: 0, ...load<Partial<Records>>('records', {}) };
}
