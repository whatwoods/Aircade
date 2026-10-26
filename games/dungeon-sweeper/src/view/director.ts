import type { AudioEngine } from '../audio/audio';
import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import { CONFIG, maxHpForLevel, xpToNextLevel } from '../config';
import type { Clock } from '../core/clock';
import { cubicOut, quadOut, sineInOut } from '../core/ease';
import { vibrate } from '../core/haptics';
import type { Tweens } from '../core/tween';
import { COLS, N, START_CELL, cx, cy } from '../game/board';
import type { Game } from '../game/rules';
import { type GameEvent, Kind } from '../game/types';
import type { BoardView } from './boardView';
import type { Camera } from './camera';
import type { DragonView } from './dragonView';
import { P, type Fx } from './fx';
import { FONT_CN, FONT_DECO, type Glyphs } from './glyphs';
import type { Hud } from './hud';
import type { Layout } from './layout';
import { PAL } from './palette';
import type { Overlay } from './renderer';
import type { Textures } from './textures';

/** director 需要的舞台（由 App 实现） */
export interface Stage {
  L: Layout;
  clock: Clock;
  tw: Tweens;
  cam: Camera;
  fx: Fx;
  board: BoardView;
  dragon: DragonView;
  hud: Hud;
  tex: Textures;
  gl: Glyphs;
  sfx: Sfx;
  music: Music;
  audio: AudioEngine;
  game: Game;
  ov: Overlay;
  reduced: boolean;
  tip(id: string, text: string): void;
  onSequenceEnd(won: boolean): void;
}

interface Task {
  t: number;
  fn: () => void;
}

interface XpPlan {
  to: number;
  from: number;
  maxHpFrom: number;
  maxHpTo: number;
  awake: boolean;
}

const T = CONFIG.timing;
const J = CONFIG.juice;

/**
 * 事件时间线：把 GameEvent[] 编排成带延迟的演出，并在演出时刻推进 HUD 显示值
 * （生命在出击那一刻掉，经验在光点到达时涨）。文档 §5.3 / §5.4。
 */
export class Director {
  private s: Stage;
  private tasks: Task[] = [];
  private rtasks: Task[] = [];
  /** 序列锁（屠龙 / 死亡） */
  locked = false;
  /** 胜利冲刷中：翻开的怪物格冒烟逃散 */
  private flood = false;
  private inflight = 0;

  constructor(s: Stage) {
    this.s = s;
  }

  // ------------------------------------------------------------ 调度
  at(t: number, fn: () => void): void {
    this.tasks.push({ t, fn });
  }
  atReal(t: number, fn: () => void): void {
    this.rtasks.push({ t, fn });
  }

  clear(): void {
    this.tasks.length = 0;
    this.rtasks.length = 0;
    this.locked = false;
    this.flood = false;
    this.inflight = 0;
  }

  get busy(): boolean {
    return this.tasks.length > 0 || this.rtasks.length > 0 || this.inflight > 0 || this.s.board.busy || this.locked;
  }

  update(): void {
    const w = this.s.clock.world;
    const r = this.s.clock.real;
    // 逐个执行到期任务（执行中可能追加新任务）
    for (let k = 0; k < this.tasks.length; k++) {
      const tk = this.tasks[k];
      if (tk.t <= w) {
        this.tasks.splice(k, 1);
        k--;
        tk.fn();
      }
    }
    for (let k = 0; k < this.rtasks.length; k++) {
      const tk = this.rtasks[k];
      if (tk.t <= r) {
        this.rtasks.splice(k, 1);
        k--;
        tk.fn();
      }
    }
  }

  // ------------------------------------------------------------ 坐标
  private px(i: number): number {
    const L = this.s.L;
    return L.board.x + cx(i) * L.cell + L.cell / 2;
  }
  private py(i: number): number {
    const L = this.s.L;
    return L.board.y + cy(i) * L.cell + L.cell / 2;
  }

  // ------------------------------------------------------------ 播放事件
  /**
   * 编排一组事件。delay：整体相对当前世界时间的延迟（开局连锁用）。
   * 返回是否包含战斗（用于 R12 输入锁）。
   */
  play(ev: GameEvent[], delay = 0): { fight: boolean; lethal: boolean } {
    const s = this.s;
    let cursor = s.clock.world + delay;
    let fightT0 = -1;
    let fightCell = -1;
    let hasFight = false;
    let lethal = false;
    let xpPlan: XpPlan | null = null;
    let plannedXp: { amount: number; from: number; source: string; t: number } | null = null;
    // 先扫描一遍：每段战斗/宝箱的升级计划
    const flushXp = () => {
      if (!plannedXp) return;
      this.xpOrbs(plannedXp.amount, plannedXp.from, plannedXp.t, xpPlan);
      plannedXp = null;
      xpPlan = null;
    };
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k];
      switch (e.t) {
        case 'markResult':
          s.board.mr[e.cell] = e.correct ? 1 : 2;
          break;
        case 'fight': {
          flushXp();
          if (fightT0 >= 0) cursor = Math.max(cursor, fightT0 + T.strikeAtMs + 160);
          fightT0 = cursor;
          fightCell = e.cell;
          hasFight = true;
          if (e.lethal) lethal = true;
          this.fight(e.cell, e.level, e.hpBefore, e.hpAfter, e.lethal, fightT0);
          break;
        }
        case 'xp': {
          const t = fightT0 >= 0 ? fightT0 + T.strikeAtMs + 40 : cursor + (e.source === 'chest' ? 260 : 0);
          plannedXp = { amount: e.amount, from: e.from, source: e.source, t };
          break;
        }
        case 'levelUp': {
          const plan: XpPlan = { from: e.from, to: e.to, maxHpFrom: maxHpForLevel(e.from), maxHpTo: e.maxHp, awake: false };
          if (plannedXp) xpPlan = plan;
          else {
            // 无经验光点（debug 设级）：立即演出
            this.at(cursor, () => this.levelUpFx(plan));
          }
          break;
        }
        case 'dragonAwake':
          if (xpPlan) xpPlan.awake = true;
          else this.at(cursor + 700, () => this.dragonAwakeFx());
          break;
        case 'numbers': {
          const t0 = fightT0 >= 0 ? fightT0 + T.strikeAtMs + 20 : cursor;
          for (let q = 0; q < e.cells.length; q++) {
            const i = e.cells[q];
            const b0 = e.before[q];
            const a0 = e.after[q];
            const at = t0 + q * 12;
            this.at(at, () => {
              s.board.rollNumber(i, b0, a0, s.clock.world);
              s.sfx.numberDown();
              if (a0 === 0 && b0 > 0) {
                s.sfx.zero();
                for (let m = 0; m < 3; m++) s.fx.spawn(P.Ember, this.px(i) + s.fx.rr(-4, 4), this.py(i), s.fx.rr(-30, 30), s.fx.rr(-80, -30), 600, 4, 1, -20, 0.5);
              }
            });
          }
          break;
        }
        case 'reveal': {
          const base = fightT0 >= 0 && e.origin === fightCell ? fightT0 + T.strikeAtMs + 100 : cursor;
          this.reveal(e.origin, e.cells, base, fightT0 >= 0 && e.origin === fightCell);
          break;
        }
        case 'collect':
          flushXp();
          if (e.item === 'chest') this.chest(e.cell, e.gold, e.xp, cursor);
          else this.potion(e.cell, e.heal, cursor);
          break;
        case 'potionRefused':
          s.board.shakeT0[e.cell] = s.clock.world;
          s.sfx.boop();
          s.hud.message('生命已满，留着以后用', 'normal', s.clock.real, 2200);
          break;
        case 'dragonBlocked':
          s.dragon.disturb(s.L, s.clock.real);
          s.sfx.disturb();
          vibrate(15);
          s.cam.add(0.15);
          s.hud.message('巨龙之威：需要至少 14 点生命', 'red', s.clock.real);
          s.tip('disturb', '巨龙需要生命 ≥ 14 才能挑战：先升级吧');
          break;
        case 'dragonFight':
          flushXp();
          this.dragonSequence(e.hpBefore, e.hpAfter);
          break;
        case 'fullClear': {
          const t = fightT0 >= 0 ? fightT0 + T.strikeAtMs + 700 : cursor;
          this.at(t, () => this.fullClearFx(e.bonus));
          break;
        }
        case 'mark':
          this.mark(e.cell, e.mark);
          break;
        case 'neighborhood':
          s.board.nbCell = e.cell;
          s.board.nbT0 = s.clock.real;
          break;
        case 'defeat':
          if (fightT0 < 0) this.deathSequence(e.cell, false);
          break;
        case 'victory':
        case 'dragonConfirm':
        case 'chordPreview':
          break;
      }
    }
    flushXp();
    return { fight: hasFight, lethal };
  }

  // ------------------------------------------------------------ 翻开 / 波纹
  private reveal(origin: number, cells: number[], base: number, fromKill: boolean): void {
    const s = this.s;
    const ox = cx(origin);
    const oy = cy(origin);
    const dur = s.reduced ? T.flipMs / 2 : T.flipMs;
    let maxD = 0;
    for (const i of cells) {
      const dx = cx(i) - ox;
      const dy = cy(i) - oy;
      const d = Math.hypot(dx, dy);
      if (d > maxD) maxD = d;
      const delay = Math.min(T.rippleMaxMs, T.rippleStepMs * d);
      const phi = d > 0 ? Math.atan2(dy, dx) : 0;
      s.board.scheduleFlip(i, 1, base + delay, dur, phi, origin);
      s.board.setLight(i, 0.85, base + delay, T.lightRiseMs);
    }
    const n = cells.length;
    this.at(base, () => {
      s.sfx.chainStart(n);
      if (n >= 10) vibrate(10);
      else if (n === 1) vibrate(5);
      if (n > 1) {
        const L = s.L;
        const r1 = (maxD + 1) * L.cell;
        s.fx.ring(this.px(origin), this.py(origin), L.cell * 0.4, r1, Math.min(T.rippleMaxMs, T.rippleStepMs * maxD) + 260, 0.25, 1, 0);
      }
      if (fromKill && n > 1) s.tip('zero', '数字归零：周围没有怪了，自动展开！');
    });
  }

  /** boardView 钩子：某格开始翻转 */
  onFlipStart(i: number, _origin: number): void {
    const s = this.s;
    s.sfx.chainTick();
    const x = this.px(i);
    const y = this.py(i);
    for (let k = 0; k < 2; k++) s.fx.spawn(P.Dust, x + s.fx.rr(-12, 12), y + s.fx.rr(4, 14), s.fx.rr(-25, 25), s.fx.rr(-40, -10), 700, 5, 9, 0, 1.2, 0, 0.6);
    const mr = s.board.mr[i];
    if (mr === 1) {
      s.sfx.markHit();
      s.fx.burst(P.Star, x, y, 6, 30, 90, 600, 6, 0, 20);
      const spr = s.gl.text.get('猜中', 12 * s.L.s, PAL.gold, 700, FONT_CN, { stroke: 'rgba(30,18,6,0.9)', strokeW: 3 });
      s.fx.sprText(spr, x, y - s.L.cell * 0.5, 900, 0, 18);
    }
    s.board.mr[i] = 0;
    if (this.flood && s.game.b.kind[i] === Kind.Monster && !s.game.revealed[i]) {
      for (let k = 0; k < 4; k++) s.fx.spawn(P.Smoke, x + s.fx.rr(-8, 8), y, s.fx.rr(-60, 60), s.fx.rr(-60, -20), 900, 10, 22, -10, 0.6, 0, 0.7);
    }
  }

  onFlipEnd(i: number): void {
    const s = this.s;
    const it = s.board.item[i];
    if (it === 1 && s.board.itemState[i] === 0) {
      s.sfx.chestReveal();
      for (let k = 0; k < 2; k++) s.fx.spawn(P.Spark, this.px(i) + s.fx.rr(-8, 8), this.py(i), s.fx.rr(-30, 30), s.fx.rr(-90, -40), 600, 4, 1, 120, 0.5);
      s.tip('chest', '宝箱随时可以打开：快升级又残血时开，等于免费回满！');
    } else if (it === 2 && s.board.itemState[i] === 0) {
      s.sfx.potionReveal();
      for (let k = 0; k < 3; k++) s.fx.spawn(P.Bubble, this.px(i) + s.fx.rr(-5, 5), this.py(i) + 4, s.fx.rr(-6, 6), s.fx.rr(-30, -15), 900, 3, 2, -10, 0.2);
      s.tip('potion', '血瓶随时可喝（+5 生命）；满血时不会浪费');
    }
  }

  // ------------------------------------------------------------ 战斗
  private fight(cell: number, level: number, hpBefore: number, hpAfter: number, lethal: boolean, t0: number): void {
    const s = this.s;
    const B = s.board;
    B.scheduleFlip(cell, 1, t0, T.fastFlipMs, 0, cell);
    B.numHidden[cell] = 1;
    B.setLight(cell, 0.85, t0, 300);
    const strike = t0 + T.strikeAtMs;
    const pop = B.addPop(cell, level, t0 + T.popAtMs, strike, lethal);
    const x = this.px(cell);
    const y = this.py(cell);
    // 弹出
    this.at(t0 + T.popAtMs, () => {
      s.sfx.growl(level);
      s.fx.ring(x, y, s.L.cell * 0.3, s.L.cell * (0.9 + level * 0.06), 380, 0.55, 2, 0);
      for (let k = 0; k < 2; k++) s.fx.spawn(P.Smoke, x + s.fx.rr(-8, 8), y + 6, s.fx.rr(-15, 15), s.fx.rr(-40, -20), 900, 8, 18, -10, 0.6, 0, 0.6);
      if (level === 9) for (let k = 0; k < 10; k++) s.fx.spawn(P.Purple, x + s.fx.rr(-14, 14), y + s.fx.rr(-6, 12), s.fx.rr(-12, 12), s.fx.rr(-50, -20), 800, 5, 1, -10, 0.4);
    });
    // 出击
    this.at(strike, () => {
      const L = s.L;
      const dmg = hpBefore - hpAfter;
      const ang = -0.75 + (cell % 3) * 0.3;
      s.fx.slash(x, y - L.cell * 0.3, ang, 0.8 + level * 0.06, 90, 0);
      s.sfx.slash(level);
      s.sfx.hurt();
      const tier = level <= 3 ? 0 : level <= 6 ? 1 : 2;
      if (lethal) {
        this.deathSequence(cell, true);
      } else {
        s.clock.hitstop(Math.min(J.killHitstopMax, J.killHitstopBase + J.killHitstopPerLevel * level));
        s.cam.add(J.killTraumaBase + J.killTraumaPerLevel * level);
        vibrate(tier === 0 ? 8 : tier === 1 ? 14 : [25, 20, 35]);
      }
      const ht = s.hud.hpTarget(L);
      s.fx.numText(s.gl.dmg, dmg, 8722, x, y - L.cell * 0.4, 750, 1, ht, 1);
      s.hud.damage(dmg, L, s.clock.world);
      s.ov.redT0 = s.clock.real;
      s.ov.redA = Math.min(0.35, (dmg / Math.max(1, s.hud.maxHp)) * 0.7 + 0.08);
    });
    if (lethal) return;
    // 碎裂（hitstop 结束后的第一帧）
    this.at(strike + 1, () => {
      if (pop) pop.on = false;
      s.fx.shatter(level, x, y - s.L.cell * 0.15, 1, false, 1 + level * 0.04);
      s.sfx.shatter(level);
      for (let k = 0; k < 6; k++) s.fx.spawn(P.Smoke, x + s.fx.rr(-10, 10), y + s.fx.rr(-4, 10), s.fx.rr(-30, 30), s.fx.rr(-30, -5), 1000, 8, 20, -8, 0.8, 0, 0.5);
      B.decal[cell] = level;
      B.version++;
      B.numHidden[cell] = 0;
      B.numInT0[cell] = s.clock.world;
      B.num[cell] = s.game.number[cell];
      s.hud.killed(level, s.clock.world);
      s.hud.addScore(level * CONFIG.score.perMonsterLevel, s.L, s.clock.world);
      s.hud.message(`击败 ${CONFIG.monsters.names[level]} Lv${level} · 经验 +${level * CONFIG.monsters.xpPerLevel}`, 'normal', s.clock.real, 2400);
    });
    void hpAfter;
  }

  /** 经验光点：每颗到达时 HUD +v，跨过升级线时触发升级演出 */
  private xpOrbs(amount: number, from: number, t: number, plan: XpPlan | null): void {
    const s = this.s;
    const n = Math.max(1, Math.min(9, amount));
    const per = Math.floor(amount / n);
    let rem = amount - per * n;
    let pending: XpPlan | null = plan;
    const x0 = from >= 0 ? this.px(from) : s.L.board.x + s.L.board.w / 2;
    const y0 = from >= 0 ? this.py(from) : s.L.board.y + s.L.board.h / 2;
    this.inflight++;
    this.at(t, () => {
      this.inflight--;
      for (let k = 0; k < n; k++) {
        const v = per + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        const slot = s.hud.xp + k;
        const tg = s.hud.xpTarget(s.L, slot);
        this.inflight++;
        s.fx.orb(x0, y0, tg.x, tg.y, k * T.orbStaggerMs, T.orbFlightMs, false, () => {
          this.inflight--;
          s.hud.addXp(v, s.clock.world);
          s.sfx.xp(k);
          if (pending && s.hud.xp >= s.hud.xpNeed) {
            let x = s.hud.xp;
            let lv = s.hud.level;
            while (lv < pending.to && x >= xpToNextLevel(lv)) {
              x -= xpToNextLevel(lv);
              lv++;
            }
            const p = pending;
            pending = null;
            this.levelUpFx(p);
            s.hud.xp = Math.max(0, x);
          }
        });
      }
    });
  }

  levelUpFx(p: XpPlan): void {
    const s = this.s;
    const L = s.L;
    const now = s.clock.world;
    const times = Math.max(1, p.to - p.from);
    s.clock.hitstop(J.levelUpHitstop);
    s.cam.add(J.levelUpTrauma);
    vibrate(times > 1 ? [20, 40, 20] : 20);
    const b = s.hud.badgeCenter(L);
    s.fx.burstRays(b.x, b.y, 1.1 * L.s, 1000, 1);
    s.ov.boostT0 = s.clock.real;
    const txt = times > 1 ? `LEVEL UP ×${times}` : 'LEVEL UP';
    const spr = s.gl.text.get(txt, 30 * L.s, PAL.gold, 700, FONT_DECO, { glow: 'rgba(255,181,74,0.9)', glowBlur: 12, stroke: 'rgba(40,20,4,0.95)', strokeW: 4, spacing: 0.08 });
    const cy0 = L.board.y + L.board.h * 0.4;
    s.fx.sprText(spr, L.board.x + L.board.w / 2, cy0, 1500, 1, 34, 1);
    const sub = s.gl.text.get(`生命上限 +${p.maxHpTo - p.maxHpFrom} · 生命回满`, 14 * L.s, PAL.parchment, 700, FONT_CN, { stroke: 'rgba(10,8,6,0.95)', strokeW: 3 });
    s.fx.sprText(sub, L.board.x + L.board.w / 2, cy0 + 34 * L.s, 1500, 1, 34, 1);
    s.hud.levelUp(p.to, now);
    s.board.goldT0 = now;
    s.sfx.levelUp(times);
    const n = Math.round(40 * (times > 1 ? 1.5 : 1));
    for (let k = 0; k < n; k++) s.fx.spawn(P.Spark, b.x + s.fx.rr(-20, 20), b.y + s.fx.rr(-10, 10), s.fx.rr(-90, 90), s.fx.rr(-260, -60), 1000, s.fx.rr(3, 6), 1, 160, 0.8, 1);
    for (let k = 0; k < 12; k++) s.fx.spawn(P.GoldDust, s.fx.rr(0, L.colW), L.board.y + s.fx.rr(0, L.board.h), s.fx.rr(-10, 10), s.fx.rr(-30, -10), 1400, 6, 2, 0, 0.3, 1);
    s.hud.message(`升级！等级 ${p.to} · 生命上限 ${p.maxHpTo}`, 'gold', s.clock.real, 2600);
    if (p.awake) this.at(now + 700, () => this.dragonAwakeFx());
  }

  dragonAwakeFx(): void {
    const s = this.s;
    s.dragon.awake = true;
    s.dragon.eyes = 2;
    s.hud.dragonReady = true;
    s.hud.setBase('巨龙已醒——点击龙巢挑战', 'gold');
    s.hud.message('巨龙已醒——点击龙巢挑战', 'gold', s.clock.real, 3500);
    s.sfx.awaken();
    s.music.awake = true;
    vibrate(20);
    s.cam.add(0.2);
    const r = s.dragon.lairRect(s.L);
    for (let k = 0; k < 20; k++) s.fx.spawn(P.Ember, r.x + s.fx.rr(0, r.s), r.y + s.fx.rr(r.s * 0.3, r.s), s.fx.rr(-20, 20), s.fx.rr(-70, -20), 1400, 4, 1, -20, 0.4);
  }

  private fullClearFx(bonus: number): void {
    const s = this.s;
    const L = s.L;
    s.sfx.bell();
    s.clock.hitstop(60);
    vibrate(20);
    s.ov.clearT0 = s.clock.real;
    s.hud.refill(s.clock.world);
    s.hud.addScore(bonus, L, s.clock.world);
    s.hud.message(`肃清！全部怪物已被击败 · +${bonus}`, 'gold', s.clock.real, 3200);
    for (let k = 0; k < 30; k++) s.fx.spawn(P.GoldDust, s.fx.rr(0, L.colW), L.board.y + s.fx.rr(0, L.board.h), s.fx.rr(-20, 20), s.fx.rr(-50, -10), 1500, 7, 2, 0, 0.3, 1);
    const spr = s.gl.text.get(`肃清 +${bonus}`, 26 * L.s, PAL.gold, 900, FONT_CN, { glow: 'rgba(255,181,74,0.8)', glowBlur: 10, stroke: 'rgba(40,20,4,0.95)', strokeW: 4 });
    s.fx.sprText(spr, L.board.x + L.board.w / 2, L.board.y + L.board.h * 0.5, 1600, 1, 30);
  }

  // ------------------------------------------------------------ 道具
  private chest(cell: number, gold: number, xp: number, t: number): void {
    const s = this.s;
    const B = s.board;
    this.at(t, () => {
      const L = s.L;
      const x = this.px(cell);
      const y = this.py(cell);
      B.itemState[cell] = 1;
      B.itemT0[cell] = s.clock.world;
      s.sfx.chestOpen();
      s.clock.hitstop(J.chestHitstop);
      s.cam.add(J.chestTrauma);
      vibrate(12);
      s.fx.ring(x, y, L.cell * 0.3, L.cell * 1.4, 420, 0.5, 1, 0);
      for (let k = 0; k < 16; k++) s.fx.spawn(P.Spark, x + s.fx.rr(-8, 8), y, s.fx.rr(-40, 40), s.fx.rr(-260, -120), 800, s.fx.rr(3, 5), 1, 200, 0.6);
      s.fx.numText(s.gl.gold, gold, 43, x, y - L.cell * 0.6, 1000, 0, undefined, 1);
      // 金币飞向分数
      const coins = Math.min(12, Math.max(6, Math.round(gold / 10)));
      const sp = s.hud.scorePos(L);
      let first = true;
      for (let k = 0; k < coins; k++) {
        this.inflight++;
        s.fx.orb(x, y, sp.x, sp.y, 60 + k * 30, 420, false, () => {
          this.inflight--;
          s.sfx.coin();
          if (first) {
            first = false;
            s.hud.addScore(gold, L, s.clock.world);
          }
        }, s.tex.coin, 12);
      }
      s.hud.message(`打开宝箱：金币 +${gold} · 经验 +${xp}`, 'gold', s.clock.real, 2600);
      if (xp > 0) {
        const spr = s.gl.text.get(`+${xp} 经验`, 12.5 * L.s, '#FFE9A8', 700, FONT_CN, { stroke: 'rgba(40,24,6,0.9)', strokeW: 3 });
        s.fx.sprText(spr, x, y - L.cell * 0.15, 1000, 0, 24);
      }
    });
  }

  private potion(cell: number, heal: number, t: number): void {
    const s = this.s;
    const B = s.board;
    this.at(t, () => {
      const L = s.L;
      const x = this.px(cell);
      const y = this.py(cell);
      B.itemState[cell] = 1;
      B.itemT0[cell] = s.clock.world;
      const tg = s.hud.hpTarget(L);
      const gx = s.hud.hp;
      this.inflight++;
      s.fx.orb(x, y, tg.x, tg.y, 0, 480, true, () => {
        this.inflight--;
        const g2 = s.hud.hpTarget(L);
        s.fx.burst(P.Pink, g2.x, g2.y, 14, 40, 140, 600, 6, 0, 30, 1);
        s.hud.heal(heal, s.clock.world);
        s.fx.numText(s.gl.heal, heal, 43, g2.x, g2.y + 22 * L.s, 900, 1, undefined, 0.9);
        s.sfx.drink();
        vibrate(10);
        s.cam.add(J.potionTrauma);
        B.itemState[cell] = 2;
        B.version++;
        void gx;
      }, s.tex.bottle, 22);
      s.hud.message(`饮下血瓶：生命 +${heal}`, 'mint', s.clock.real, 2200);
    });
  }

  // ------------------------------------------------------------ 标记
  private mark(cell: number, m: number): void {
    const s = this.s;
    const x = this.px(cell);
    const y = this.py(cell);
    s.board.setMark(cell, m, s.clock.world);
    if (m !== 0) {
      s.sfx.chalk();
      vibrate(6);
      for (let k = 0; k < 5; k++) s.fx.spawn(P.Chalk, x + s.fx.rr(-8, 8), y + s.fx.rr(0, 8), s.fx.rr(-20, 20), s.fx.rr(-10, 30), 600, 2.5, 1, 120, 0.5);
    } else {
      s.sfx.erase();
      for (let k = 0; k < 4; k++) s.fx.spawn(P.Chalk, x + s.fx.rr(-10, 10), y + s.fx.rr(-4, 6), s.fx.rr(-50, 50), s.fx.rr(-10, 20), 500, 2.5, 1, 120, 0.5);
    }
  }

  // ------------------------------------------------------------ 死亡
  private deathSequence(cell: number, fromFight: boolean): void {
    const s = this.s;
    this.locked = true;
    const r0 = s.clock.real;
    s.clock.hitstop(J.deathHitstop);
    s.cam.add(0.7);
    vibrate([40, 60, 80]);
    s.sfx.death();
    s.music.windSwell();
    if (!s.reduced) s.clock.slowmo(0.3, 1500);
    s.ov.deathT0 = r0;
    if (cell >= 0) {
      const x = this.px(cell);
      const y = this.py(cell);
      for (let k = 0; k < 20; k++) s.fx.spawn(P.Smoke, x + s.fx.rr(-12, 12), y + s.fx.rr(-10, 10), s.fx.rr(-50, 50), s.fx.rr(-60, -10), 1600, 10, 30, -10, 0.6, 0, 0.8);
    }
    // 烛光从死亡格向外波纹熄灭
    const w = s.clock.world;
    const ox = cell >= 0 ? cx(cell) : 4;
    const oy = cell >= 0 ? cy(cell) : 5;
    for (let i = 0; i < N; i++) s.board.extT0[i] = w + Math.hypot(cx(i) - ox, cy(i) - oy) * 26;
    this.atReal(r0 + 500, () => {
      const L = s.L;
      s.ov.bigText = s.gl.text.get('你倒下了', 44 * L.s, '#E0314A', 900, FONT_CN, { glow: 'rgba(200,40,60,0.8)', glowBlur: 14, stroke: 'rgba(20,4,6,0.95)', strokeW: 5 });
      s.ov.bigSub = s.gl.text.get('YOU FELL', 15 * L.s, '#C8283C', 700, FONT_DECO, { spacing: 0.32 });
      s.ov.bigT0 = s.clock.real;
    });
    this.atReal(r0 + (fromFight ? 2300 : 1800), () => {
      this.locked = false;
      s.onSequenceEnd(false);
    });
  }

  // ------------------------------------------------------------ 屠龙（§5.4，真实时间）
  private dragonSequence(hpBefore: number, hpAfter: number): void {
    const s = this.s;
    const D = s.dragon;
    this.locked = true;
    const r0 = s.clock.real;
    s.music.silence(1600);
    s.tw.to(s.ov.battleDim, 1, 300, s.clock.world, quadOut);
    s.hud.message('屠龙！', 'gold', r0, 4000);
    // 0.20 苏醒：战斗形态升起
    this.atReal(r0 + 200, () => {
      D.riseT0 = s.clock.world;
      D.hidden = true;
      D.eyes = 2;
      s.sfx.roar();
      s.cam.add(0.5);
      vibrate([30, 30, 50]);
      const r = D.lairRect(s.L);
      for (let k = 0; k < 30; k++) s.fx.spawn(P.Ember, r.x + s.fx.rr(0, r.s), r.y + s.fx.rr(0, r.s), s.fx.rr(-80, 80), s.fx.rr(-160, -40), 1200, 5, 1, -10, 0.5);
    });
    // 0.90 龙息
    this.atReal(r0 + 900, () => {
      const L = s.L;
      const bp = D.battlePos(L, s.clock.world);
      const ht = s.hud.hpTarget(L);
      s.sfx.fireBreath();
      s.cam.add(0.35);
      s.clock.hitstop(J.dragonBreathHitstop);
      vibrate([40, 20, 40]);
      const dx = ht.x - bp.mouthX;
      const dy = ht.y - bp.mouthY;
      const len = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < 80; k++) {
        const spd = s.fx.rr(380, 760);
        const a = Math.atan2(dy, dx) + s.fx.rr(-0.32, 0.32);
        s.fx.spawn(P.Fire, bp.mouthX, bp.mouthY, Math.cos(a) * spd, Math.sin(a) * spd, (len / spd) * 1000 * s.fx.rr(0.8, 1.15), s.fx.rr(10, 22), 34, 0, 0.6, 0, 0.9);
      }
      const dmg = hpBefore - hpAfter;
      s.hud.damage(dmg, L, s.clock.world);
      s.fx.numText(s.gl.dmg, dmg, 8722, ht.x, ht.y + 30 * L.s, 1000, 1, undefined, 1.3);
      s.tw.to(s.ov.redVig, 0.45, 120, s.clock.world, quadOut);
      s.tw.to(s.ov.redVig, 0, 900, s.clock.world, quadOut, 500);
      s.ov.redT0 = s.clock.real;
      s.ov.redA = 0.35;
    });
    // 1.80 三连斩
    for (let k = 0; k < 3; k++) {
      this.atReal(r0 + 1800 + k * 90, () => {
        const L = s.L;
        const bp = D.battlePos(L, s.clock.world);
        const angs = [-0.7, 0.7, 0.05];
        s.fx.slash(bp.x, bp.y, angs[k], 3.2 * L.s, 130, 0);
        D.whiteT0 = s.clock.world;
        s.sfx.bigSlash(k);
        s.cam.add(0.2);
        if (k === 2) s.clock.hitstop(J.dragonFinalHitstop);
      });
    }
    // 2.25 闪白
    this.atReal(r0 + 2250, () => {
      if (!s.reduced) s.ov.whiteT0 = s.clock.real;
      s.sfx.impact();
      vibrate([40, 30, 60]);
    });
    // 2.30 碎裂
    this.atReal(r0 + 2300, () => {
      const L = s.L;
      const bp = D.battlePos(L, s.clock.world);
      s.fx.shatter(13, bp.x, bp.y, bp.s, true, 1.6);
      D.shattered = true;
      s.sfx.bigShatter();
      if (!s.reduced) s.clock.slowmo(0.3, 600);
      s.cam.add(0.4);
      for (let k = 0; k < 40; k++) s.fx.spawn(P.Ember, bp.x + s.fx.rr(-40, 40), bp.y + s.fx.rr(-40, 40), s.fx.rr(-200, 200), s.fx.rr(-260, 60), 1400, 5, 1, 120, 0.6);
    });
    // 2.90 光之冲刷
    this.atReal(r0 + 2900, () => this.victoryFlood());
    // 3.60 结算
    this.atReal(r0 + 3700, () => {
      this.locked = false;
      s.onSequenceEnd(true);
    });
  }

  private victoryFlood(): void {
    const s = this.s;
    const B = s.board;
    const D = s.dragon;
    const L = s.L;
    D.slain = true;
    this.flood = true;
    s.tw.to(s.ov.battleDim, 0, 600, s.clock.world, sineInOut);
    s.tw.to(s.ov.dawn, 1, 1400, s.clock.world, cubicOut);
    s.sfx.fanfare();
    vibrate([30, 40, 30]);
    const w = s.clock.world;
    const lair = 5 * COLS + 4;
    for (let i = 0; i < N; i++) {
      if (s.game.b.kind[i] === Kind.Lair) continue;
      const d = Math.hypot(cx(i) - 4, cy(i) - 5);
      if (!B.face[i] && !B.flipping[i]) {
        const at = w + Math.min(900, d * 70);
        B.scheduleFlip(i, 1, at, T.flipMs, Math.atan2(cy(i) - 5, cx(i) - 4), lair);
      }
      B.setLight(i, 1, w + Math.min(900, d * 70), 600);
    }
    s.fx.ring(this.px(lair), this.py(lair), L.cell, L.cell * 9, 1100, 0.5, 1, 0);
    for (let k = 0; k < 60; k++)
      s.fx.spawn(P.Coin, s.fx.rr(L.board.x, L.board.x + L.board.w), L.board.y - s.fx.rr(10, 160), s.fx.rr(-30, 30), s.fx.rr(40, 160), 1800, 9, 9, 520, 0.2);
    for (let k = 0; k < 40; k++) s.fx.spawn(P.Spark, this.px(lair) + s.fx.rr(-30, 30), this.py(lair), s.fx.rr(-200, 200), s.fx.rr(-300, -60), 1200, 4, 1, 160, 0.6);
    this.atReal(s.clock.real + 1600, () => {
      this.flood = false;
    });
  }

  // ------------------------------------------------------------ 开局 / 重开
  /** 发牌 + 点燃火把 + 起点连锁 */
  intro(startEvents: GameEvent[], deal: boolean): void {
    const s = this.s;
    const w = s.clock.world;
    const end = deal ? s.board.dealEnd : w + 200;
    const ign = Math.max(w + 150, end - 380);
    this.at(ign, () => {
      s.tw.to(s.ov.brazier, 1, 450, s.clock.world, cubicOut);
      s.sfx.ignite();
      vibrate(10);
      const L = s.L;
      for (const ex of [3, 5]) {
        const fx0 = L.board.x + (ex === 3 ? 3 : 6) * L.cell + (ex === 3 ? 4.8 : -4.8) * (L.cell / 40);
        const fy0 = L.board.y + 11 * L.cell + 4;
        for (let k = 0; k < 8; k++) s.fx.spawn(P.Fire, fx0 + s.fx.rr(-3, 3), fy0, s.fx.rr(-30, 30), s.fx.rr(-140, -60), 500, s.fx.rr(6, 12), 2, -40, 0.8);
      }
    });
    this.play(startEvents, ign + 160 - w);
  }

  /** 结算 → 新局：全部格子向入口收拢翻回暗砖。返回所需世界时间（ms） */
  flipBack(): number {
    const s = this.s;
    const B = s.board;
    const w = s.clock.world;
    const ex = cx(START_CELL);
    const ey = cy(START_CELL) - 0.5;
    let maxD = 1;
    for (let i = 0; i < N; i++) if (B.face[i]) maxD = Math.max(maxD, Math.hypot(cx(i) - ex, cy(i) - ey));
    for (let i = 0; i < N; i++) {
      if (s.game.b.kind[i] === Kind.Lair) continue;
      if (!B.face[i] && !B.flipping[i]) continue;
      const d = Math.hypot(cx(i) - ex, cy(i) - ey);
      const delay = ((maxD - d) / maxD) * 300;
      B.flipping[i] = 0;
      B.scheduleFlip(i, 0, w + delay, 120, Math.atan2(ey - cy(i), ex - cx(i)), START_CELL);
      B.setLight(i, 0, w + delay, 220);
      B.setMark(i, 0, w);
    }
    for (const p of B.pops) p.on = false;
    s.tw.to(s.ov.brazier, 0, 320, w, quadOut, 120);
    s.tw.to(s.ov.dawn, 0, 400, w, quadOut);
    return 460;
  }
}
