export const Kind = {
  Empty: 0,
  Monster: 1,
  Chest: 2,
  Potion: 3,
  Lair: 4,
} as const;
export type KindT = (typeof Kind)[keyof typeof Kind];

/** 标记：0 无；1–9 数字；-1 = ?；-2 = ○ 安全 */
export type Mark = number;
export const MARK_NONE = 0;
export const MARK_UNKNOWN = -1;
export const MARK_SAFE = -2;

export type Phase = 'playing' | 'won' | 'lost';

export interface PlayerState {
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
}

export interface ScoreBreakdown {
  kills: number;
  killScore: number;
  gold: number;
  dragon: number;
  hpLeft: number;
  hpScore: number;
  timeSec: number;
  timeScore: number;
  fullClear: number;
  total: number;
  won: boolean;
}

export type GameEvent =
  | { t: 'reveal'; origin: number; cells: number[] }
  | {
      t: 'fight';
      cell: number;
      level: number;
      hpBefore: number;
      hpAfter: number;
      lethal: boolean;
    }
  | { t: 'xp'; amount: number; from: number; source: 'monster' | 'chest' }
  | { t: 'levelUp'; from: number; to: number; maxHp: number }
  | { t: 'numbers'; cells: number[]; before: number[]; after: number[] }
  | { t: 'collect'; cell: number; item: 'chest' | 'potion'; gold: number; xp: number; heal: number }
  | { t: 'potionRefused'; cell: number }
  | { t: 'dragonBlocked' }
  | { t: 'dragonConfirm' }
  | { t: 'dragonAwake' }
  | { t: 'dragonFight'; hpBefore: number; hpAfter: number }
  | { t: 'fullClear'; bonus: number }
  | { t: 'mark'; cell: number; mark: Mark; prev: Mark }
  | { t: 'markResult'; cell: number; correct: boolean; mark: Mark }
  | { t: 'neighborhood'; cell: number }
  | { t: 'chordPreview'; cell: number; cells: number[] }
  | { t: 'victory'; breakdown: ScoreBreakdown }
  | { t: 'defeat'; breakdown: ScoreBreakdown; cell: number; level: number };
