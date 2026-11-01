/** 本地存储：前缀 aircade.chain-2048.，读写都包 try/catch（docs §6.11） */
const PREFIX = 'aircade.chain-2048.';
const memory = new Map<string, string>();

export function load(key: string): string | null {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    /* 隐私模式：回退内存 */
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
    return { ...fallback, ...(JSON.parse(v) as Partial<T>) };
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
  /** 0 关 1 弱 2 开 */
  shake: number;
  loupe: boolean;
}

export interface Stats {
  runs: number;
  longestCascade: number;
  totalSeals: number;
  total2048: number;
}

export const settings: Settings = loadJson<Settings>('settings', { sfx: true, music: true, shake: 2, loupe: true });

export function saveSettings(): void {
  saveJson('settings', settings);
}

export function clearRecords(): void {
  remove('best');
  remove('bestStage');
  remove('stats');
}
