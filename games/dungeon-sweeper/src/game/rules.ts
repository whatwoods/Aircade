import { CONFIG, maxHpForLevel, xpToNextLevel } from '../config.ts';
import { type BlessId, bonusHp, chestGoldOf, chestXpOf, damageOf, isBless, killHealOf, killXpOf, potionHealOf, rollOffer } from './blessings.ts';
import { type BoardData, generateBoard, N, NEIGHBORS, START_CELL } from './board.ts';
import { type DiffId, type DiffParams, diffParams } from './difficulty.ts';
import { solveGame } from './solver.ts';
import {
  type GameEvent,
  Kind,
  type Mark,
  MARK_NONE,
  MARK_SAFE,
  MARK_UNKNOWN,
  type Phase,
  type PlayerState,
  type ScoreBreakdown,
} from './types.ts';

/**
 * 纯逻辑：不依赖 DOM / Canvas。每个操作同步结算并返回事件列表，
 * 由 view/director 编排演出。规则见文档 §3.3。
 */
export class Game {
  readonly b: BoardData;
  readonly seed: number;
  readonly isTutorial: boolean;
  readonly diff: DiffParams;
  readonly revealed = new Uint8Array(N);
  readonly collected = new Uint8Array(N);
  readonly mark = new Int8Array(N);
  /** 周围「未翻开且存活」的怪物等级和（对所有格维护） */
  readonly number = new Uint8Array(N);
  readonly alive = new Array<number>(10).fill(0);
  totalAlive = 0;

  player: PlayerState;
  phase: Phase = 'playing';
  gold = 0;
  kills = 0;
  killXp = 0;
  /** 巨龙觉醒之后击杀的等级和（龙怒加成） */
  awakeKillXp = 0;
  /** 是否有过「战斗后只剩 1 点生命」 */
  closeCall = false;
  correctMarks = 0;
  fullCleared = false;
  dragonAwake = false;
  timeMs = 0;
  breakdown: ScoreBreakdown | null = null;
  deathCell = -1;
  marksPlaced = 0;
  /** 每日挑战的日期键（YYYY-MM-DD）；普通局为 null */
  daily: string | null = null;

  // ---- 祝福（§3.10）
  /** 引导局和选盘校验关闭：选盘保证的是「不靠祝福也无需致命猜测」 */
  blessEnabled: boolean;
  blessings: BlessId[] = [];
  /** 待选次数（一次连升可能跨过两个祝福等级）与当前候选 */
  offersDue = 0;
  offer: BlessId[] | null = null;
  /** 已选次数：决定下一次候选的随机序列 */
  picks = 0;
  undyingUsed = false;
  /** 选了赏金之后击杀的等级和 */
  bountyXp = 0;
  /** 洞察得知的等级（0 = 未知） */
  readonly known = new Int8Array(N);

  constructor(seed: number, tutorial = false, board?: BoardData) {
    this.seed = seed;
    this.isTutorial = tutorial;
    this.b = board ?? pickBoard(seed, tutorial);
    this.diff = diffParams(this.b.diff);
    this.blessEnabled = !tutorial;
    const lv = 1;
    this.player = { level: lv, hp: maxHpForLevel(lv), maxHp: maxHpForLevel(lv), xp: 0 };
    for (let i = 0; i < N; i++) {
      if (this.b.kind[i] === Kind.Lair) this.revealed[i] = 1;
      if (this.b.kind[i] !== Kind.Monster) continue;
      const L = this.b.level[i];
      this.alive[L]++;
      this.totalAlive++;
      for (let k = 0; k < 8; k++) {
        const j = NEIGHBORS[i * 8 + k];
        if (j >= 0) this.number[j] += L;
      }
    }
  }

  // ---------------------------------------------------------------- queries
  get xpToNext(): number {
    return xpToNextLevel(this.player.level);
  }
  get score(): number {
    const S = CONFIG.score;
    return (
      (this.killXp + this.awakeKillXp * (S.awakeKillMult - 1)) * S.perMonsterLevel +
      this.bountyXp * (CONFIG.blessings.cards.bounty.perLevel ?? 0) +
      this.gold +
      (this.fullCleared ? S.fullClearBonus : 0)
    );
  }
  readonly has = (id: BlessId): boolean => this.blessings.includes(id);
  /** 祝福带来的生命上限增减 */
  get bonusHp(): number {
    return bonusHp(this.has);
  }
  /** 该等级的怪物实际造成的伤害（祝福修正后） */
  damageOf(level: number): number {
    return damageOf(this.has, level);
  }
  /** 已翻开的信息格（显示数字的格子） */
  isInfo(i: number): boolean {
    return this.revealed[i] === 1 && this.b.kind[i] !== Kind.Lair;
  }
  isHidden(i: number): boolean {
    return this.revealed[i] === 0;
  }
  canChallengeDragon(): boolean {
    return this.player.hp >= this.diff.minHp;
  }
  revealedCount(): number {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.revealed[i] && this.b.kind[i] !== Kind.Lair) n++;
    return n;
  }
  playableCount(): number {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.b.kind[i] !== Kind.Lair) n++;
    return n;
  }
  isLethalMark(i: number): boolean {
    const m = this.mark[i];
    return m > 0 && this.damageOf(m) >= this.player.hp;
  }
  /** 周围已翻开数字的最小值（标记轮盘的「上限」提示）；无则 -1 */
  boundAt(i: number): number {
    let best = -1;
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j < 0 || !this.isInfo(j)) continue;
      const v = this.number[j];
      if (best < 0 || v < best) best = v;
    }
    return best;
  }
  hiddenNeighbors(i: number, out: number[]): number[] {
    out.length = 0;
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j >= 0 && !this.revealed[j]) out.push(j);
    }
    return out;
  }
  /** 快开目标；不满足条件返回 null */
  chordTargets(i: number): number[] | null {
    if (!this.isInfo(i) || this.number[i] === 0) return null;
    let sum = 0;
    const targets: number[] = [];
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j < 0 || this.revealed[j]) continue;
      const m = this.mark[j];
      if (m === MARK_UNKNOWN) return null;
      if (m > 0) sum += m;
      else targets.push(j);
    }
    if (sum !== this.number[i] || targets.length === 0) return null;
    return targets;
  }

  // ---------------------------------------------------------------- actions
  start(): GameEvent[] {
    const ev: GameEvent[] = [];
    this.revealCell(START_CELL, START_CELL, ev);
    return ev;
  }

  /** 点击格子。confirmedDragon：挑战确认框已同意 */
  tap(i: number, confirmedDragon = false): GameEvent[] {
    const ev: GameEvent[] = [];
    if (this.phase !== 'playing' || this.offer) return ev;
    const kind = this.b.kind[i];
    if (kind === Kind.Lair) {
      this.tapDragon(confirmedDragon, ev);
      return ev;
    }
    if (!this.revealed[i]) {
      this.revealCell(i, i, ev);
      return ev;
    }
    if (kind === Kind.Chest && !this.collected[i]) {
      this.collected[i] = 1;
      const gold = chestGoldOf(this.has, this.b.gold[i]);
      const xp = chestXpOf(this.has, this.b.itemXp[i]);
      this.gold += gold;
      ev.push({ t: 'collect', cell: i, item: 'chest', gold, xp, heal: 0 });
      this.gainXp(xp, i, 'chest', ev);
      return ev;
    }
    if (kind === Kind.Potion && !this.collected[i]) {
      const p = this.player;
      const full = potionHealOf(this.has, this.b.heal[i]);
      if (p.hp >= p.maxHp || full <= 0) {
        ev.push({ t: 'potionRefused', cell: i, void: full <= 0 });
        return ev;
      }
      this.collected[i] = 1;
      const heal = Math.min(full, p.maxHp - p.hp);
      p.hp += heal;
      ev.push({ t: 'collect', cell: i, item: 'potion', gold: 0, xp: 0, heal });
      return ev;
    }
    // 已翻开的数字格：快开或邻域提示
    if (this.number[i] > 0) {
      const targets = CONFIG.rules.chord ? this.chordTargets(i) : null;
      if (targets && this.chordEnabled) {
        for (const j of targets) {
          if (this.phase !== 'playing') break;
          if (this.revealed[j]) continue;
          this.revealCell(j, i, ev);
        }
      } else ev.push({ t: 'neighborhood', cell: i });
    }
    return ev;
  }

  chordEnabled = true;

  setMark(i: number, m: Mark): GameEvent[] {
    if (this.phase !== 'playing' || this.revealed[i]) return [];
    const prev = this.mark[i];
    if (prev === m) return [];
    this.mark[i] = m;
    if (m !== MARK_NONE) this.marksPlaced++;
    return [{ t: 'mark', cell: i, mark: m, prev }];
  }

  // ---------------------------------------------------------------- internals
  private tapDragon(confirmed: boolean, ev: GameEvent[]): void {
    if (!this.canChallengeDragon()) {
      ev.push({ t: 'dragonBlocked' });
      return;
    }
    if (CONFIG.dragon.confirmIfMonstersLeft && this.totalAlive > 0 && !confirmed) {
      ev.push({ t: 'dragonConfirm' });
      return;
    }
    const before = this.player.hp;
    this.player.hp -= this.diff.dragonLevel;
    ev.push({ t: 'dragonFight', hpBefore: before, hpAfter: this.player.hp });
    this.phase = 'won';
    this.breakdown = this.computeBreakdown(true);
    ev.push({ t: 'victory', breakdown: this.breakdown });
  }

  /** 翻开一格（若是怪物则战斗），并处理连锁 */
  private revealCell(i: number, origin: number, ev: GameEvent[]): void {
    if (this.revealed[i]) return;
    if (this.b.kind[i] === Kind.Monster) {
      this.fight(i, ev);
      return;
    }
    const cells: number[] = [];
    this.markReveal(i, cells, ev);
    this.cascade([i], cells, ev);
    ev.push({ t: 'reveal', origin, cells });
  }

  private markReveal(i: number, cells: number[], ev: GameEvent[]): void {
    this.revealed[i] = 1;
    const known = this.known[i];
    this.known[i] = 0;
    cells.push(i);
    const m = this.mark[i];
    if (m !== MARK_NONE) {
      const isMon = this.b.kind[i] === Kind.Monster;
      const correct = m === MARK_SAFE ? !isMon : m > 0 ? isMon && this.b.level[i] === m : false;
      // 洞察给出的标记不算猜中
      if (correct && !known) this.correctMarks++;
      ev.push({ t: 'markResult', cell: i, correct, mark: m });
      this.mark[i] = MARK_NONE;
    }
  }

  /** R4：数字为 0 的已翻开信息格自动翻开所有未翻开邻格（递归） */
  private cascade(seeds: number[], cells: number[], ev: GameEvent[]): void {
    const queue = seeds.slice();
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      if (!this.isInfo(c) || this.number[c] !== 0) continue;
      for (let k = 0; k < 8; k++) {
        const j = NEIGHBORS[c * 8 + k];
        if (j < 0 || this.revealed[j]) continue;
        // number[c] === 0 保证 j 不是存活怪物
        this.markReveal(j, cells, ev);
        queue.push(j);
      }
    }
  }

  private fight(i: number, ev: GameEvent[]): void {
    const L = this.b.level[i];
    const p = this.player;
    const before = p.hp;
    p.hp -= this.damageOf(L);
    let lethal = CONFIG.rules.deathAtZero ? p.hp <= 0 : p.hp < 0;
    let undying = false;
    if (lethal && this.has('undying') && !this.undyingUsed) {
      this.undyingUsed = true;
      undying = true;
      lethal = false;
      p.hp = 1;
    }
    // 翻开（标记结果在战斗事件之前给出）
    const tmp: number[] = [];
    this.markReveal(i, tmp, ev);
    const score = L * CONFIG.score.perMonsterLevel * (this.dragonAwake ? CONFIG.score.awakeKillMult : 1);
    ev.push({
      t: 'fight',
      cell: i,
      level: L,
      hpBefore: before,
      hpAfter: Math.max(0, p.hp),
      lethal,
      score,
      rage: this.dragonAwake,
      undying,
    });
    if (lethal) {
      p.hp = 0;
      this.phase = 'lost';
      this.deathCell = i;
      this.breakdown = this.computeBreakdown(false);
      ev.push({ t: 'defeat', breakdown: this.breakdown, cell: i, level: L });
      return;
    }
    if (p.hp === 1) this.closeCall = true;
    this.kills++;
    this.killXp += L;
    if (this.dragonAwake) this.awakeKillXp += L;
    if (this.has('bounty')) this.bountyXp += L;
    this.alive[L]--;
    this.totalAlive--;
    const kh = killHealOf(this.has, L);
    if (kh > 0 && p.hp < p.maxHp) {
      const heal = Math.min(kh, p.maxHp - p.hp);
      p.hp += heal;
      ev.push({ t: 'heal', cell: i, amount: heal });
    }
    this.gainXp(killXpOf(this.has, L), i, 'monster', ev);
    // 数字更新
    const cells: number[] = [];
    const before2: number[] = [];
    const after: number[] = [];
    for (let k = 0; k < 8; k++) {
      const j = NEIGHBORS[i * 8 + k];
      if (j < 0) continue;
      const b0 = this.number[j];
      this.number[j] = b0 - L;
      if (this.isInfo(j)) {
        cells.push(j);
        before2.push(b0);
        after.push(b0 - L);
      }
    }
    if (cells.length) ev.push({ t: 'numbers', cells, before: before2, after });
    // 连锁：自身与归零的邻格
    const seeds = [i];
    for (const j of cells) if (this.number[j] === 0) seeds.push(j);
    const revealed: number[] = [];
    this.cascade(seeds, revealed, ev);
    if (revealed.length) ev.push({ t: 'reveal', origin: i, cells: revealed });
    // 肃清
    if (this.totalAlive === 0 && !this.fullCleared) {
      this.fullCleared = true;
      if (CONFIG.rules.fullClearRefill) p.hp = p.maxHp;
      ev.push({ t: 'fullClear', bonus: CONFIG.score.fullClearBonus });
    }
  }

  private gainXp(amount: number, from: number, source: 'monster' | 'chest', ev: GameEvent[]): void {
    if (amount <= 0) return;
    const p = this.player;
    ev.push({ t: 'xp', amount, from, source });
    p.xp += amount;
    const startLevel = p.level;
    while (p.xp >= xpToNextLevel(p.level)) {
      p.xp -= xpToNextLevel(p.level);
      p.level++;
    }
    if (p.level !== startLevel) {
      p.maxHp = maxHpForLevel(p.level) + this.bonusHp;
      p.hp = p.maxHp;
      ev.push({ t: 'levelUp', from: startLevel, to: p.level, maxHp: p.maxHp });
      this.checkAwake(ev);
      if (this.blessEnabled)
        for (let lv = startLevel + 1; lv <= p.level; lv++) if (this.diff.blessLevels.includes(lv)) this.offersDue++;
      if (this.offersDue > 0 && !this.offer) {
        this.offer = rollOffer(this.seed, this.picks, this.blessings);
        ev.push({ t: 'blessOffer', offer: this.offer });
      }
    }
  }

  private checkAwake(ev: GameEvent[]): void {
    if (!this.dragonAwake && this.player.maxHp >= this.diff.minHp) {
      this.dragonAwake = true;
      ev.push({ t: 'dragonAwake' });
    }
  }

  /** 从当前候选里选一个祝福；不在候选里返回 [] */
  chooseBlessing(id: BlessId): GameEvent[] {
    const ev: GameEvent[] = [];
    if (this.phase !== 'playing' || !this.offer || !this.offer.includes(id)) return ev;
    this.blessings.push(id);
    this.picks++;
    this.offersDue--;
    this.offer = null;
    const p = this.player;
    const cells: number[] = [];
    const dHp = bonusHp(this.has) - bonusHp((b) => b !== id && this.has(b));
    if (dHp) {
      p.maxHp += dHp;
      p.hp = Math.max(1, Math.min(p.maxHp, p.hp + dHp));
    }
    if (id === 'insight') {
      const cand: number[] = [];
      for (let i = 0; i < N; i++) if (this.b.kind[i] === Kind.Monster && !this.revealed[i] && !this.known[i]) cand.push(i);
      cand.sort((a, c) => this.b.level[c] - this.b.level[a] || a - c);
      for (const i of cand.slice(0, CONFIG.blessings.cards.insight.count ?? 0)) {
        this.known[i] = this.b.level[i];
        const prev = this.mark[i];
        this.mark[i] = this.b.level[i];
        cells.push(i);
        ev.push({ t: 'mark', cell: i, mark: this.mark[i], prev });
      }
    }
    ev.unshift({ t: 'bless', id, cells });
    this.checkAwake(ev);
    if (this.offersDue > 0) {
      this.offer = rollOffer(this.seed, this.picks, this.blessings);
      ev.push({ t: 'blessOffer', offer: this.offer });
    }
    return ev;
  }

  computeBreakdown(won: boolean): ScoreBreakdown {
    const S = CONFIG.score;
    const timeSec = Math.floor(this.timeMs / 1000);
    const killScore = (this.killXp - this.awakeKillXp) * S.perMonsterLevel;
    const rage = this.awakeKillXp * S.perMonsterLevel * S.awakeKillMult;
    const dragon = won ? S.dragonBonus : 0;
    const hpLeft = won ? Math.max(0, this.player.hp) : 0;
    const hpScore = hpLeft * S.hpLeftBonus;
    const timeScore = won ? Math.max(0, S.timeBonusBaseSec - timeSec) * S.timeBonusPerSec : 0;
    const fullClear = this.fullCleared ? S.fullClearBonus : 0;
    const bounty = this.bountyXp * (CONFIG.blessings.cards.bounty.perLevel ?? 0);
    return {
      kills: this.kills,
      killScore,
      rage,
      bounty,
      gold: this.gold,
      dragon,
      hpLeft,
      hpScore,
      timeSec,
      timeScore,
      fullClear,
      total: killScore + rage + bounty + this.gold + dragon + hpScore + timeScore + fullClear,
      won,
    };
  }

  // ---------------------------------------------------------------- 存档
  /** 中途存档：盘面由 seed + regen 重建，只存玩家改变过的状态 */
  toSave(): RunSave {
    const bits = (a: Uint8Array) => Array.from(a).join('');
    return {
      v: SAVE_VERSION,
      seed: this.seed,
      regen: this.b.regen,
      tutorial: this.isTutorial,
      daily: this.daily,
      revealed: bits(this.revealed),
      collected: bits(this.collected),
      mark: Array.from(this.mark),
      player: { ...this.player },
      gold: this.gold,
      kills: this.kills,
      killXp: this.killXp,
      awakeKillXp: this.awakeKillXp,
      closeCall: this.closeCall,
      diff: this.b.diff,
      correctMarks: this.correctMarks,
      fullCleared: this.fullCleared,
      dragonAwake: this.dragonAwake,
      timeMs: Math.floor(this.timeMs),
      marksPlaced: this.marksPlaced,
      blessings: this.blessings.slice(),
      offersDue: this.offersDue,
      undyingUsed: this.undyingUsed,
      bountyXp: this.bountyXp,
      known: Array.from(this.known),
    };
  }

  /** 从存档恢复；数据不符（版本、长度、盘面校验）时返回 null */
  static fromSave(s: RunSave): Game | null {
    if (!s || s.v !== SAVE_VERSION || s.revealed?.length !== N || s.collected?.length !== N || s.mark?.length !== N) return null;
    const board = generateBoard(s.seed, s.tutorial, s.regen, s.diff ?? 'normal');
    if (board.regen !== s.regen) return null;
    const g = new Game(s.seed, s.tutorial, board);
    g.daily = s.daily ?? null;
    for (let i = 0; i < N; i++) {
      g.revealed[i] = s.revealed.charCodeAt(i) === 49 || board.kind[i] === Kind.Lair ? 1 : 0;
      g.collected[i] = s.collected.charCodeAt(i) === 49 ? 1 : 0;
      g.mark[i] = g.revealed[i] ? MARK_NONE : s.mark[i] | 0;
    }
    // 由翻开状态重算数字与存活数
    g.number.fill(0);
    g.alive.fill(0);
    g.totalAlive = 0;
    for (let i = 0; i < N; i++) {
      if (board.kind[i] !== Kind.Monster || g.revealed[i]) continue;
      const L = board.level[i];
      g.alive[L]++;
      g.totalAlive++;
      for (let k = 0; k < 8; k++) {
        const j = NEIGHBORS[i * 8 + k];
        if (j >= 0) g.number[j] += L;
      }
    }
    g.player = { ...s.player };
    g.gold = s.gold;
    g.kills = s.kills;
    g.killXp = s.killXp;
    g.awakeKillXp = s.awakeKillXp ?? 0;
    g.closeCall = s.closeCall ?? false;
    g.correctMarks = s.correctMarks;
    g.fullCleared = s.fullCleared;
    g.dragonAwake = s.dragonAwake;
    g.timeMs = s.timeMs;
    g.marksPlaced = s.marksPlaced;
    g.blessings = (s.blessings ?? []).filter(isBless);
    g.picks = g.blessings.length;
    g.offersDue = Math.max(0, s.offersDue ?? 0);
    g.undyingUsed = s.undyingUsed ?? false;
    g.bountyXp = s.bountyXp ?? 0;
    if (s.known?.length === N) for (let i = 0; i < N; i++) g.known[i] = g.revealed[i] ? 0 : s.known[i] | 0;
    if (g.offersDue > 0) g.offer = rollOffer(g.seed, g.picks, g.blessings);
    return g;
  }

  // ---------------------------------------------------------------- debug
  debugAddXp(n: number): GameEvent[] {
    const ev: GameEvent[] = [];
    this.gainXp(n, -1, 'chest', ev);
    return ev;
  }
  debugSetHp(n: number): void {
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, n));
  }
  debugSetLevel(n: number): GameEvent[] {
    const p = this.player;
    const from = p.level;
    p.level = Math.max(1, Math.floor(n));
    p.maxHp = maxHpForLevel(p.level) + this.bonusHp;
    p.hp = p.maxHp;
    p.xp = 0;
    const ev: GameEvent[] = [];
    if (p.level !== from) ev.push({ t: 'levelUp', from, to: p.level, maxHp: p.maxHp });
    if (!this.dragonAwake && p.maxHp >= this.diff.minHp) {
      this.dragonAwake = true;
      ev.push({ t: 'dragonAwake' });
    }
    return ev;
  }
  /** 翻开所有非怪物格 */
  debugRevealSafe(): GameEvent[] {
    const ev: GameEvent[] = [];
    const cells: number[] = [];
    for (let i = 0; i < N; i++) {
      if (this.revealed[i] || this.b.kind[i] === Kind.Monster) continue;
      this.markReveal(i, cells, ev);
    }
    if (cells.length) ev.push({ t: 'reveal', origin: START_CELL, cells });
    return ev;
  }
  /** 依次击败全部怪物（生命不足时自动补满） */
  debugKillAll(): GameEvent[] {
    const ev: GameEvent[] = [];
    const order: number[] = [];
    for (let i = 0; i < N; i++) if (this.b.kind[i] === Kind.Monster && !this.revealed[i]) order.push(i);
    order.sort((a, c) => this.b.level[a] - this.b.level[c]);
    for (const i of order) {
      if (this.phase !== 'playing') break;
      if (this.player.hp <= this.b.level[i]) this.player.hp = Math.max(this.player.hp, this.b.level[i] + 1);
      if (this.player.hp > this.player.maxHp) this.player.maxHp = this.player.hp;
      this.revealCell(i, i, ev);
    }
    return ev;
  }
  debugFinish(won: boolean): GameEvent[] {
    if (this.phase !== 'playing') return [];
    if (won) {
      if (!this.canChallengeDragon()) this.debugSetLevel(Math.max(this.player.level, 10));
      return this.tap(this.lairCell(), true);
    }
    this.phase = 'lost';
    this.player.hp = 0;
    this.breakdown = this.computeBreakdown(false);
    let cell = -1;
    for (let i = 0; i < N; i++) if (this.b.kind[i] === Kind.Monster && !this.revealed[i]) cell = i;
    this.deathCell = cell;
    return [{ t: 'defeat', breakdown: this.breakdown, cell, level: cell >= 0 ? this.b.level[cell] : 1 }];
  }
  lairCell(): number {
    for (let i = 0; i < N; i++) if (this.b.kind[i] === Kind.Lair) return i;
    return 0;
  }
}

const SAVE_VERSION = 1;

export interface RunSave {
  v: number;
  seed: number;
  regen: number;
  tutorial: boolean;
  daily: string | null;
  /** 每格一位 '0' / '1' */
  revealed: string;
  collected: string;
  mark: number[];
  player: PlayerState;
  gold: number;
  kills: number;
  killXp: number;
  /** 以下三项后加，旧存档缺省 0 / false / normal */
  awakeKillXp?: number;
  closeCall?: boolean;
  diff?: DiffId;
  correctMarks: number;
  fullCleared: boolean;
  dragonAwake: boolean;
  timeMs: number;
  marksPlaced: number;
  /** 祝福（§3.10），旧存档缺省为空 */
  blessings?: string[];
  offersDue?: number;
  undyingUsed?: boolean;
  bountyXp?: number;
  known?: number[];
}

/**
 * 选盘：在满足开局翻开范围的候选里，取第一个「机器人无需致命猜测即可通关」的盘面。
 * 候选按 seed + k 确定性递增，同一种子永远得到同一盘面（时间预算只在极慢设备上生效）。
 */
export function pickBoard(seed: number, tutorial: boolean, budgetMs: number = CONFIG.solver.budgetMs, diff: DiffId = 'normal'): BoardData {
  const first = generateBoard(seed, tutorial, 0, diff);
  const minHp = diffParams(first.diff).minHp;
  const S = CONFIG.solver;
  if (tutorial || !S.enabled) return first;
  const t0 = performance.now();
  let b = first;
  for (let n = 0; n < S.maxTries; n++) {
    const vg = new Game(seed, false, b);
    vg.blessEnabled = false;
    const r = solveGame(vg, CONFIG.solver.maxNodes, minHp);
    if (r.won && r.deadly === 0) return b;
    if (performance.now() - t0 > budgetMs) break;
    b = generateBoard(seed, false, b.regen + 1, diff);
  }
  return first;
}
