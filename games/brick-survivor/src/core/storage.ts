// localStorage wrapper: prefix aircade.brick-survivor., every access in try/catch (docs §6.8).
const PREFIX = 'aircade.brick-survivor.';
const memory = new Map<string, string>();

export function readRaw(key: string): string | null {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    /* private mode */
  }
  return memory.get(key) ?? null;
}

export function writeRaw(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}

export function removeKey(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function clearAll(): void {
  memory.clear();
  try {
    const ls = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  } catch {
    /* ignore */
  }
}

export interface BestRecord {
  score: number;
  wave: number;
  timeSec: number;
  victory: boolean;
  date: number;
}

export interface LifetimeStats {
  runs: number;
  bricks: number;
  maxCombo: number;
  victories: number;
}

export function readBest(): BestRecord | null {
  const b = readJson<BestRecord | null>('best', null);
  if (!b || typeof b.score !== 'number') return null;
  return b;
}
export function writeBest(b: BestRecord): void {
  writeJson('best', b);
}
export function readStats(): LifetimeStats {
  const s = readJson<Partial<LifetimeStats>>('stats', {});
  return {
    runs: s.runs ?? 0,
    bricks: s.bricks ?? 0,
    maxCombo: s.maxCombo ?? 0,
    victories: s.victories ?? 0,
  };
}
export function writeStats(s: LifetimeStats): void {
  writeJson('stats', s);
}
export function tutorialDone(): boolean {
  return readRaw('tutorialDone') === '1';
}
export function setTutorialDone(v: boolean): void {
  if (v) writeRaw('tutorialDone', '1');
  else removeKey('tutorialDone');
}
