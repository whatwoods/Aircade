import { readJson, writeJson } from './storage';
import type { QualityId } from '../types';

export interface Settings {
  sfx: boolean;
  music: boolean;
  shake: boolean;
  haptics: boolean;
  reduceFlash: boolean;
  landingHints: boolean;
  quality: 'auto' | QualityId;
}

const defaults: Settings = {
  sfx: true,
  music: true,
  shake: true,
  haptics: true,
  reduceFlash: false,
  landingHints: true,
  quality: 'auto',
};

type Listener = (s: Settings, key: keyof Settings) => void;
const listeners: Listener[] = [];

function load(): Settings {
  const raw = readJson<Partial<Settings>>('settings', {});
  const s: Settings = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof Settings)[]) {
    const v = raw[k];
    if (typeof v === typeof defaults[k]) (s as unknown as Record<string, unknown>)[k] = v;
  }
  if (!['auto', 'high', 'mid', 'low'].includes(s.quality)) s.quality = 'auto';
  return s;
}

export const settings: Settings = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  writeJson('settings', settings);
  for (const l of listeners) l(settings, key);
}

export function onSettings(l: Listener): void {
  listeners.push(l);
}

/** Persisted auto-quality starting tier for the next run (docs §2.3). */
export function readAutoTier(): QualityId {
  const q = readJson<string>('autoTier', 'high');
  return q === 'mid' || q === 'low' ? q : 'high';
}
export function writeAutoTier(q: QualityId): void {
  writeJson('autoTier', q);
}
