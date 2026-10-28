/** 核心类型（纯逻辑，无 DOM）。 */

export type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type TileKind = 'base' | 'char' | 'pending';

export interface Tile {
  id: number;
  kind: TileKind;
  /** base/char：字本身；pending：部件按放入顺序拼接，如「口口」 */
  ch: string;
  /** pending 的两个部件 */
  parts?: string[];
}

export interface LevelDef {
  id: number;
  chapter: number;
  targets: string[];
  active: number;
  decoys: string[];
  decoyRate: number;
  hintStart: number;
  ink: number;
  star2: number;
  star3: number;
  script?: string[];
  preset?: [number, string][];
  tip?: string;
}

export interface Order {
  ch: string;
  hint: number;
  /** 卷轴槽位 0..2 */
  slot: number;
  /** 唯一编号，渲染用 */
  uid: number;
}

/** 拖拽来源：'rack' 或棋盘格下标 */
export type Source = 'rack' | number;

export type Action =
  | { t: 'drop'; from: Source; cell: number; zone: Zone }
  | { t: 'discard'; from: Source }
  | { t: 'hint'; slot: number }
  | { t: 'undo' };

export type GameEvent =
  | { t: 'placed'; tile: Tile; cell: number; from: Source }
  | { t: 'moved'; tile: Tile; from: number; to: number }
  | { t: 'swapped'; a: Tile; b: Tile; ca: number; cb: number }
  | { t: 'rejected'; from: Source; cell: number }
  | { t: 'merged'; a: Tile; b: Tile; from: Source; cell: number; result: Tile; recipe: string; depth: number }
  | { t: 'pending'; a: Tile; b: Tile; from: Source; cell: number; result: Tile }
  | { t: 'formed'; ch: string; cell: number; leaves: number }
  | { t: 'delivered'; tile: Tile; cell: number; order: Order; score: number; index: number }
  | { t: 'orderOpened'; order: Order }
  | { t: 'discarded'; tile: Tile; from: Source }
  | { t: 'hint'; order: Order }
  | { t: 'ink'; ink: number; delta: number }
  | { t: 'score'; score: number; delta: number }
  | { t: 'rack'; rack: string[] }
  | { t: 'undo' }
  | { t: 'inkOut' }
  | { t: 'won'; inkLeft: number; bonus: number; stars: number }
  | { t: 'lost' }
  | { t: 'stage'; stage: number };

export interface DirectorState {
  since: Record<string, number>;
  decoyStreak: number;
  lastDecoy: string;
  scriptPos: number;
}

export interface GameState {
  mode: 'level' | 'endless';
  def: LevelDef;
  seed: number;
  rng: number;
  board: (Tile | null)[];
  rack: string[];
  ink: number;
  score: number;
  orders: Order[];
  queue: string[];
  delivered: number;
  total: number;
  undoLeft: number;
  status: 'play' | 'won' | 'lost';
  nextId: number;
  dir: DirectorState;
  inkOutShown: boolean;
  actions: number;
  discards: number;
  merges: number;
  formed: string[];
  /** 无尽模式 */
  stage: number;
  endlessDone: number;
  /** 已发现的字（无尽模式偏好未收集的字） */
  known: Set<string>;
}
