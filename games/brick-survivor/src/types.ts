import type { FxEventId } from './config';

export type ElementId = 'none' | 'fire' | 'ice' | 'blast' | 'nova';
export type UpgradeId =
  | 'multi' | 'pierce' | 'split' | 'fire' | 'ice' | 'blast' | 'homing'
  | 'power' | 'overclock' | 'magnet' | 'wide' | 'aegis';
export type EvolutionId = 'supernova' | 'absoluteZero' | 'swarm' | 'prismEcho';
export type BrickType = 'basic' | 'armored' | 'volatile' | 'prism' | 'turret' | 'warden' | 'elite';
export type BossKind = 'monolith' | 'pulsar' | 'serpent' | 'omega';
export type SceneId =
  | 'boot' | 'title' | 'tutorial' | 'playing' | 'levelup' | 'paused' | 'bossIntro' | 'bossDeath'
  | 'gameover' | 'victory' | 'results';
export type QualityId = 'high' | 'mid' | 'low';

export const BRICK_TYPES: readonly BrickType[] = ['basic', 'armored', 'volatile', 'prism', 'turret', 'warden', 'elite'];
export const ELEMENTS: readonly ElementId[] = ['none', 'fire', 'ice', 'blast', 'nova'];
export const UPGRADE_IDS: readonly UpgradeId[] = [
  'multi', 'pierce', 'split', 'fire', 'ice', 'blast', 'homing', 'power', 'overclock', 'magnet', 'wide', 'aegis',
];
export const WEAPON_IDS: readonly UpgradeId[] = ['multi', 'pierce', 'split', 'fire', 'ice', 'blast', 'homing'];
export const MODULE_IDS: readonly UpgradeId[] = ['power', 'overclock', 'magnet', 'wide', 'aegis'];
export const EVOLUTION_IDS: readonly EvolutionId[] = ['supernova', 'absoluteZero', 'swarm', 'prismEcho'];
export const BOSS_KINDS: readonly BossKind[] = ['monolith', 'pulsar', 'serpent', 'omega'];

/** Numeric element index for compact event payloads. */
export function elementIndex(e: ElementId): number {
  return e === 'none' ? 0 : e === 'fire' ? 1 : e === 'ice' ? 2 : e === 'blast' ? 3 : 4;
}
export function brickTypeIndex(t: BrickType): number {
  return BRICK_TYPES.indexOf(t);
}

/** Presentation sink. Logic calls emit() synchronously; the headless simulator passes a no-op. */
export interface FxSink {
  emit(ev: FxEventId, x: number, y: number, a: number, b: number): void;
}

export const nullSink: FxSink = { emit() {} };

export type CardKind = 'upgrade' | 'evolution' | 'battery' | 'cache';
export interface Card {
  kind: CardKind;
  id: UpgradeId | EvolutionId | 'battery' | 'cache';
  from: number;
  to: number;
}

export interface Snapshot {
  scene: SceneId;
  wave: number;
  endless: boolean;
  time: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  score: number;
  combo: number;
  maxCombo: number;
  balls: { main: number; inFlight: number; magazine: number; shards: number; echoes: number };
  bricks: { alive: number; lowestRow: number; pressure: number };
  levels: Record<UpgradeId, number>;
  evolutions: EvolutionId[];
  boss: { kind: BossKind; hp: number; maxHp: number; phase: number } | null;
  quality: QualityId;
  fps: number;
}
