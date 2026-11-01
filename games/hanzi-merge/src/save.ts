/** 本地存储（前缀 aircade.hanzi-merge.，读写都包 try/catch），§8.13 */
import { RECIPES } from './data/hanzi.ts';

const P = 'aircade.hanzi-merge.';
export let storageOk = true;

function read<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(P + k);
    return v === null ? def : (JSON.parse(v) as T);
  } catch {
    storageOk = false;
    return def;
  }
}
function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(P + k, JSON.stringify(v));
  } catch {
    storageOk = false;
  }
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  volume: number;
  pinyin: boolean;
  methodMark: boolean;
  card: 'full' | 'brief';
  reduceMotion: boolean;
  sameDeal: boolean;
}
export interface Progress {
  unlocked: number;
  levels: Record<number, { best: number; stars: number }>;
}
export interface Stats {
  merges: number;
  discards: number;
  seconds: number;
}

const defSettings: Settings = { sfx: true, music: true, volume: 0.8, pinyin: true, methodMark: true, card: 'full', reduceMotion: false, sameDeal: true };

export const save = {
  settings: { ...defSettings, ...read<Partial<Settings>>('settings', {}) } as Settings,
  progress: read<Progress>('progress', { unlocked: 1, levels: {} }),
  atlas: new Set<string>(),
  endlessBest: read<{ score: number; stage: number }>('endlessBest', { score: 0, stage: 0 }),
  tutorialDone: read<number>('tutorialDone', 0) === 1,
  tips: new Set<string>(read<string[]>('tips', [])),
  stats: read<Stats>('stats', { merges: 0, discards: 0, seconds: 0 }),
};

// 图鉴：按字库顺序的位图，base64 编码
(function loadAtlas() {
  const s = read<string>('atlas', '');
  if (!s) return;
  try {
    const bin = atob(s);
    RECIPES.forEach((r, i) => {
      if ((bin.charCodeAt(i >> 3) >> (i & 7)) & 1) save.atlas.add(r.c);
    });
  } catch {
    /* 损坏则忽略 */
  }
})();

export function saveAtlas(): void {
  const bytes = new Uint8Array(Math.ceil(RECIPES.length / 8));
  RECIPES.forEach((r, i) => {
    if (save.atlas.has(r.c)) bytes[i >> 3] |= 1 << (i & 7);
  });
  write('atlas', btoa(String.fromCharCode(...bytes)));
}
export const saveSettings = (): void => write('settings', save.settings);
export const saveProgress = (): void => write('progress', save.progress);
export const saveEndless = (): void => write('endlessBest', save.endlessBest);
export const saveStats = (): void => write('stats', save.stats);
export function setTutorialDone(v: boolean): void {
  save.tutorialDone = v;
  write('tutorialDone', v ? 1 : 0);
}
export function markTip(id: string): void {
  save.tips.add(id);
  write('tips', [...save.tips]);
}
export function resetSave(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(P)) localStorage.removeItem(k);
  } catch {
    storageOk = false;
  }
  save.settings = { ...defSettings };
  save.progress = { unlocked: 1, levels: {} };
  save.atlas.clear();
  save.endlessBest = { score: 0, stage: 0 };
  save.tutorialDone = false;
  save.tips.clear();
  save.stats = { merges: 0, discards: 0, seconds: 0 };
}
// 初次读取时探测一次可写
write('probe', 1);
