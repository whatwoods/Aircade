const PREFIX = 'aircade.sling-merge.';
const memory = new Map<string, string>();

export function load(key: string): string | null {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    /* 隐私模式等：回退内存 */
  }
  return memory.has(key) ? memory.get(key)! : null;
}

export function save(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}

export function remove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function loadNumber(key: string, fallback: number): number {
  const v = load(key);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadJson<T extends object>(key: string, fallback: T): T {
  const v = load(key);
  if (v === null) return { ...fallback };
  try {
    const parsed = JSON.parse(v) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

export function saveJson(key: string, value: object): void {
  save(key, JSON.stringify(value));
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  vibration: boolean;
  shake: boolean;
}

export interface Stats {
  games: number;
  bestCombo: number;
  totalMerges: number;
  rainbowCount: number;
}

export const SAVE_KEYS = ['best', 'settings', 'tutorialDone', 'discovered', 'tips', 'stats'] as const;

export function clearAll(): void {
  for (const k of SAVE_KEYS) remove(k);
}
