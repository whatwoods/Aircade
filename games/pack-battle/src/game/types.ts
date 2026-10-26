// 核心类型（纯数据，无 DOM 依赖，可在 node 中运行）

export type Tag = 'weapon' | 'armor' | 'remedy' | 'tool';
export type Rarity = 0 | 1 | 2 | 3;
export type Trigger = 'cooldown' | 'start' | 'passive' | 'lowHp' | 'death' | 'roundStart';
export type Rot = 0 | 1 | 2 | 3;
export type Lv = 1 | 2 | 3;
export type Side = 0 | 1;

export type ItemId =
  | 'dagger' | 'sword' | 'buckler' | 'leather' | 'herb' | 'whetstone' | 'glove' | 'pouch'
  | 'boomerang' | 'axe' | 'kris' | 'helmet' | 'potion' | 'moonstone'
  | 'hammer' | 'bow' | 'horn' | 'cauldron'
  | 'phoenix' | 'thunder' | 'hourglass'
  | 'slime' | 'ratfang' | 'breath' | 'claw' | 'scale';

export interface LevelStats {
  dmg?: number;
  hits?: number;
  shield?: number;
  heal?: number;
  poison?: number;
  cleanse?: number;
  stun?: number;
  reduce?: number;
  speed?: number;
  dmgBonus?: number;
  boost?: number;
  gold?: number;
  reviveFrac?: number;
  startShield?: number;
  /** 相邻规则每单位数值 */
  adj?: number;
}

export type AdjStat = 'dmg' | 'shield' | 'heal' | 'poison' | 'reduce' | 'reviveFrac' | 'startShield' | 'lowHpHeal';

export type AdjRule =
  | { kind: 'countTag'; tag: Tag | 'any'; stat: AdjStat }
  | { kind: 'ifTag'; tag: Tag; effect: 'shieldOnHit' }
  | { kind: 'lone'; tag: Tag; mult: number }
  | { kind: 'emptyCells'; stat: 'dmg' }
  | { kind: 'aura'; tags: (Tag | 'any')[]; stat: 'speed' | 'dmgBonus' | 'boost' }
  | { kind: 'line'; stat: 'speed' }
  | { kind: 'none' };

export interface ItemDef {
  id: ItemId;
  name: string;
  tag: Tag;
  rarity: Rarity;
  price: number;
  /** rot0 形状，'#' 为占格 */
  shape: string[];
  /** 号角：口格（rot0 坐标） */
  mouth?: [number, number];
  /** 号角：尾格（rot0 坐标） */
  tail?: [number, number];
  trigger: Trigger;
  cd?: number;
  /** 对护盾伤害倍率（战锤 = 2） */
  shieldBreak?: number;
  lv: [LevelStats, LevelStats, LevelStats];
  adj: AdjRule;
  enemyOnly?: boolean;
  text: { effect: string; adj: string };
}

export interface ItemInst {
  uid: number;
  id: ItemId;
  lv: Lv;
  rot: Rot;
  zone: 'bag' | 'stash';
  x: number;
  y: number;
  slot: number;
  /** 投入的总金币（含合成消耗的副本） */
  value: number;
  /** 购买时的整理阶段编号（同阶段全额退款） */
  boughtStamp: number;
}

export interface Placed {
  uid: number;
  id: ItemId;
  lv: Lv;
  rot: Rot;
  x: number;
  y: number;
}

export interface ShopSlot {
  id: ItemId | null;
  price: number;
}

export type Phase = 'receipt' | 'arrange' | 'toBattle' | 'battle' | 'result' | 'ending';

export interface RunStats {
  bestHit: number;
  merges: number;
  spent: number;
  roundScores: number[];
  wins: number;
}

export interface RunState {
  seed: number;
  round: number;
  attempt: number;
  hearts: number;
  gold: number;
  score: number;
  phase: Phase;
  bag: ItemInst[];
  stash: (ItemInst | null)[];
  shop: ShopSlot[];
  locked: boolean;
  refreshIndex: number;
  /** 第几个整理阶段（全局递增，用于全额退款判断） */
  phaseStamp: number;
  lastResult: 'win' | 'loss' | null;
  /** 开战时背包里钱袋的产出，下轮整理时发放 */
  pouchGold: number;
  /** 开战时手中金币（用于利息） */
  savedGold: number;
  lastHpRatio: number;
  tutorial: boolean;
  cleared: boolean;
  stats: RunStats;
  nextUid: number;
}

export type LinkKind = 'speed' | 'dmg' | 'shield' | 'heal' | 'poison' | 'boost' | 'hourglass' | 'reduce';

export interface Link {
  id: number;
  from: number;
  to: number;
  kind: LinkKind;
  /** 反向（to→from）的加成种类；无则为 null */
  backKind: LinkKind | null;
  /** 接触格（网格坐标，格中心 = +0.5） */
  a: [number, number];
  b: [number, number];
  label: string;
}

export interface Derived {
  uid: number;
  id: ItemId;
  lv: Lv;
  tag: Tag;
  trigger: Trigger;
  cd: number;
  speedMul: number;
  dmg: number;
  hits: number;
  shield: number;
  shieldOnHit: number;
  heal: number;
  poison: number;
  cleanse: number;
  stun: number;
  reduce: number;
  reviveFrac: number;
  startShield: number;
  lowHpHeal: number;
  gold: number;
  shieldBreak: number;
  /** 光环类数值（用于详情显示） */
  auraSpeed: number;
  auraDmg: number;
  auraBoost: number;
  /** 本件受到的加成来源明细 */
  sources: { uid: number; label: string }[];
  /** 本件受益的连线 id（战斗中触发时闪烁） */
  linkIds: number[];
  /** 长弓相邻空格 */
  emptyCells: [number, number][];
}

export type TraitDef =
  | { kind: 'enrage'; at: number; speed: number }
  | { kind: 'dragonRage'; at: number; trueDmg: number; speed: number };

export type FrameStyle =
  | 'moss' | 'patch' | 'silk' | 'bone' | 'hide' | 'crate' | 'wicker' | 'iron' | 'shadow' | 'gold';

export type PortraitId =
  | 'slime' | 'goblin' | 'spider' | 'skeleton' | 'ogre' | 'rats' | 'witch' | 'knight' | 'ranger' | 'dragon';

export interface EnemyDef {
  round: number;
  name: string;
  title: string;
  hp: number;
  cols: number;
  rows: number;
  frame: FrameStyle;
  /** ASCII 背包布局 + 图例（见 enemies.ts parseBag） */
  layout: string[];
  legend: Record<string, string>;
  traits: TraitDef[];
  hint: string;
  portrait: PortraitId;
  boss?: boolean;
}

export type BattleEventType =
  | 'start' | 'fire' | 'hit' | 'shield' | 'heal' | 'poisonApply' | 'poisonTick' | 'cleanse'
  | 'stun' | 'lowHp' | 'revive' | 'phase' | 'fatigue' | 'storm' | 'end' | 'overheal';

export interface BattleEvent {
  t: number;
  type: BattleEventType;
  /** 事件发起方（hit：攻击方；heal/shield：受益方；poisonTick/fatigue：受伤方） */
  side: Side;
  uid?: number;
  amount?: number;
  absorbed?: number;
  /** 第二下（回旋镖） */
  second?: boolean;
  /** 龙炎 */
  fire?: boolean;
  hp: [number, number];
  shield: [number, number];
  poison: [number, number];
  links?: number[];
}

export interface BattleResult {
  winner: Side;
  duration: number;
  events: BattleEvent[];
  hpEnd: [number, number];
  maxHp: [number, number];
  bestHit: number;
}
