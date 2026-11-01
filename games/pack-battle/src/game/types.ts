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
  | 'shuriken' | 'venom' | 'thorns' | 'fang' | 'brew' | 'charm'
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
  /** 被攻击时反弹的伤害 */
  thorns?: number;
  /** 打进生命的伤害按此比例回血 */
  lifesteal?: number;
  /** 低血时全部冷却速度加成 */
  rage?: number;
  /** 利息上限加成 */
  interest?: number;
  /** 相邻规则每单位数值 */
  adj?: number;
}

export type AdjStat = 'dmg' | 'shield' | 'heal' | 'poison' | 'reduce' | 'reviveFrac' | 'startShield' | 'lowHpHeal' | 'thorns' | 'lifesteal';

export type AdjRule =
  | { kind: 'countTag'; tag: Tag | 'any'; stat: AdjStat; /** 只算不同种类的装备 */ otherId?: boolean; /** 最多计几件 */ max?: number }
  | { kind: 'ifTag'; tag: Tag; effect: 'shieldOnHit' }
  | { kind: 'lone'; tag: Tag; mult: number }
  | { kind: 'emptyCells'; stat: 'dmg' }
  | { kind: 'aura'; tags: (Tag | 'any')[]; stat: 'speed' | 'dmgBonus' | 'boost' | 'poison' }
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
  /** 后期商店会直接卖 ★★（缺省 = 1） */
  lv?: Lv;
}

/** 轮间事件 */
export type EventId = 'smith' | 'tailor' | 'market' | 'elite' | 'rest' | 'cache';

export type Phase = 'receipt' | 'arrange' | 'toBattle' | 'battle' | 'result' | 'ending';

export interface RunStats {
  bestHit: number;
  merges: number;
  spent: number;
  /** 按轮次下标（第 r 轮在 r−1），没赢过的轮为空 */
  roundScores: (number | null)[];
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
  /** 开战时背包里幸运符加的利息上限，下轮整理时用 */
  charmCap?: number;
  lastHpRatio: number;
  tutorial: boolean;
  cleared: boolean;
  stats: RunStats;
  nextUid: number;
  /** 背包开放格的位掩码（见 grid.ts isOpen） */
  open: number;
  /** 已花钱解锁的格数 */
  unlocked: number;
  /** 赢下一轮后待选的两个轮间事件（选完清空） */
  choice: EventId[] | null;
  /** 裁缝送的免费解锁次数 */
  freeCells: number;
  /** 黑市：本轮整理的商店按更高轮次掷稀有度 */
  market: boolean;
  /** 精英：本轮敌人生命加成，赢了多给金币 */
  elite: boolean;
  /** 精英赏金，下次整理时发放 */
  eliteGold: number;
  /** 难度等级（0 = 普通） */
  tier: number;
  /** 每日挑战的日期（YYYY-MM-DD），普通局为空 */
  daily?: string;
  /** 结算时的难度加成分 */
  tierBonus: number;
  /** 被调试接口改过：不存档、不计最高分 */
  debug?: boolean;
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
  thorns: number;
  lifesteal: number;
  rage: number;
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

/** 敌人词缀（开局静态生效） */
export type AffixId = 'tough' | 'swift' | 'armored' | 'shielded' | 'regen';

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
  /** 本局这个敌人带的词缀（由 runEnemy 填） */
  affixes?: AffixId[];
}

export type BattleEventType =
  | 'start' | 'fire' | 'hit' | 'shield' | 'heal' | 'poisonApply' | 'poisonTick' | 'cleanse'
  | 'stun' | 'lowHp' | 'revive' | 'phase' | 'fatigue' | 'storm' | 'end' | 'overheal'
  /** 减伤装备挡下的伤害（只给战报用，回放忽略） */
  | 'block';

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
  /** 荆棘甲反伤 */
  thorn?: boolean;
  /** 狂暴药剂（lowHp 事件：加速而不是回血） */
  rage?: boolean;
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
