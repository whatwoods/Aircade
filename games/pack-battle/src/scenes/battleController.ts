// 战斗回放表现：冷却环、出手弹起、投射物、血条、跳字、立牌、首领阶段、结算
import { duckMusic } from '../audio/audio.ts';
import { sfx } from '../audio/sfx.ts';
import { BATTLE, ECONOMY, FX, ITEMS, TUTORIAL } from '../config.ts';
import { Spring } from '../core/spring.ts';
import { Playback } from '../game/battle/playback.ts';
import { enemyBag, enemyFor } from '../game/enemies.ts';
import { badgeCell, shapeOf } from '../game/shapes.ts';
import { computeSynergy, type SynergyResult } from '../game/synergy.ts';
import type { BattleEvent, BattleResult, EnemyDef, ItemId, ItemInst, Placed, Side } from '../game/types.ts';
import { emit } from '../render/fx/particles.ts';
import { popup } from '../render/fx/popups.ts';
import { shake, tier } from '../render/fx/shake.ts';
import { C, TAG_COLOR, drawGoldCoin } from '../render/kit.ts';
import { enemyBagRect, type BagRect, type Rect } from '../render/layout.ts';
import { drawEnemyBadge, drawPlayerBadge } from '../render/portraits.ts';
import { text } from '../render/text.ts';
import { drawStamp, showToast } from '../render/ui/widgets.ts';
import { drawFlash, drawRedVignette } from '../render/views/background.ts';
import { RING_COLOR, drawCooldownRing, drawEnemyBag } from '../render/views/bagView.ts';
import { clearProjs, drawBand, drawProjs, drawResultRibbon, launch, updateProjs, type ProjKind } from '../render/views/battleView.ts';
import { HpBar, StandeeView, drawStatus, type StatusState } from '../render/views/enemyView.ts';
import { LinkLayer } from '../render/views/linkView.ts';
import { describe } from './describe.ts';
import type { GameScene } from './gameScene.ts';
import { ItemView } from './itemView.ts';

interface Ring {
  uid: number;
  side: Side;
  /** 徽章格中心（格坐标，未加包围盒偏移） */
  bx: number;
  by: number;
  color: string;
}

interface Stamp {
  s: string;
  color: string;
  t: number;
  y: number;
  size: number;
}

const TMP = { x: 0, y: 0 };
const TMP2 = { x: 0, y: 0 };

function projKind(id: ItemId): ProjKind {
  switch (id) {
    case 'bow': return 'arrow';
    case 'thunder': return 'bolt';
    case 'slime': return 'blob';
    case 'breath': return 'fire';
    case 'boomerang': return 'spin';
    case 'ratfang': return 'fang';
    default: return 'slash';
  }
}

function fireSfx(id: ItemId): string {
  switch (id) {
    case 'bow': return 'twang';
    case 'hammer': case 'axe': return 'whoosh';
    case 'thunder': return 'zap';
    default: return 'swish';
  }
}

export class BattleController {
  gs: GameScene;
  res: BattleResult | null = null;
  pb: Playback | null = null;
  e: EnemyDef = enemyFor(1);
  eItems: Placed[] = [];
  eViews = new Map<number, ItemView>();
  eSyn: SynergyResult | null = null;
  eLinks = new LinkLayer();
  eg: BagRect = { x: 0, y: 0, w: 0, h: 0, gx: 0, gy: 0, cell: 34, frame: 12 };
  private egBase: BagRect = { x: 0, y: 0, w: 0, h: 0, gx: 0, gy: 0, cell: 34, frame: 12 };
  hpP = new HpBar();
  hpE = new HpBar();
  sP: StatusState = { poison: 0, poisonPop: 0, stun: false, enraged: false };
  sE: StatusState = { poison: 0, poisonPop: 0, stun: false, enraged: false };
  standee = new StandeeView();
  speed = 1;
  started = false;
  ended = false;
  enraged = false;
  private rings: Ring[] = [];
  private consumed = new Set<number>();
  private slowT = 0;
  firstFire = false;
  /** 玩家背包受击晃动（像素） */
  jolt = new Spring(34, 0.22, 0);
  private vignette = 0;
  /** 获得护盾：背包边框蓝色涟漪（0..1 进度，<0 不显示），[玩家, 敌人] */
  private ripple = [-1, -1];
  private flashA = 0;
  private flashColor = '#ffd27a';
  private stamps: Stamp[] = [];
  private stormBanner = -1;
  private fireSweep = -1;
  private downT = -1;
  private ribbonK = 0;
  private beat = 0;
  private stars: [number, number] = [0, 0];

  constructor(gs: GameScene) {
    this.gs = gs;
  }

  layout(): void {
    const r = enemyBagRect(this.gs.B.enemyBagArea, this.e.cols, this.e.rows);
    Object.assign(this.egBase, r);
  }

  // ---------- 生命周期 ----------

  begin(res: BattleResult): void {
    const gs = this.gs;
    const round = gs.run.round;
    this.res = res;
    this.e = enemyFor(round);
    this.eItems = enemyBag(round);
    this.layout();
    this.eSyn = computeSynergy(this.eItems, this.e.cols, this.e.rows);
    this.eLinks.clear();
    this.eLinks.sync(this.eSyn.links, false);
    this.eViews.clear();
    for (const p of this.eItems) {
      const inst: ItemInst = { uid: p.uid, id: p.id, lv: p.lv, rot: p.rot, zone: 'bag', x: p.x, y: p.y, slot: 0, value: 0, boughtStamp: 0 };
      const v = new ItemView(inst);
      v.pos.snap(p.x, p.y);
      this.eViews.set(p.uid, v);
    }
    // 冷却环 + 回放估计
    this.rings.length = 0;
    const est = new Map<number, { side: Side; est: number }>();
    const add = (side: Side, items: readonly Placed[], syn: SynergyResult): void => {
      for (const it of items) {
        const d = syn.derived.get(it.uid);
        if (!d || d.trigger !== 'cooldown' || d.cd <= 0) continue;
        const sh = shapeOf(it.id, it.rot);
        const [cx, cy] = badgeCell(sh.cells);
        this.rings.push({ uid: it.uid, side, bx: cx + 0.5, by: cy + 0.5, color: RING_COLOR[ITEMS[it.id].tag] });
        est.set(it.uid, { side, est: d.cd / Math.min(BATTLE.speedCap, d.speedMul) });
      }
    };
    add(0, gs.run.bag, gs.syn);
    add(1, this.eItems, this.eSyn);
    this.pb = new Playback(res, est);
    this.pb.speed = this.speed;
    this.hpP.reset(res.maxHp[0], res.maxHp[0]);
    this.hpE.reset(res.maxHp[1], res.maxHp[1]);
    this.sP.poison = this.sE.poison = 0;
    this.sP.stun = this.sE.stun = false;
    this.sP.enraged = this.sE.enraged = false;
    this.standee.reset(this.e.portrait);
    this.started = false;
    this.ended = false;
    this.enraged = false;
    this.consumed.clear();
    this.slowT = 0;
    this.firstFire = false;
    this.stamps.length = 0;
    this.stormBanner = -1;
    this.fireSweep = -1;
    this.downT = -1;
    this.ribbonK = 0;
    this.vignette = 0;
    this.ripple[0] = this.ripple[1] = -1;
    this.flashA = 0;
    this.beat = 0;
    clearProjs();
  }

  start(): void {
    this.started = true;
  }

  leave(): void {
    this.started = false;
    this.ended = false;
    this.res = null;
    this.pb = null;
    this.standee.visible = false;
    this.stamps.length = 0;
    this.stormBanner = -1;
    this.fireSweep = -1;
    this.downT = -1;
    this.ribbonK = 0;
    this.vignette = 0;
    this.ripple[0] = this.ripple[1] = -1;
    this.flashA = 0;
    this.enraged = false;
    this.consumed.clear();
    clearProjs();
    for (const v of this.gs.views.values()) v.gray = 0;
  }

  lowHp(): boolean {
    return !!this.pb && this.started && this.hpP.hp > 0 && this.hpP.hp <= this.hpP.max * FX.lowHpFrac;
  }

  // ---------- 坐标 ----------

  private viewOf(side: Side, uid: number): ItemView | undefined {
    return side === 0 ? this.gs.views.get(uid) : this.eViews.get(uid);
  }

  private itemCenter(side: Side, uid: number, out: { x: number; y: number }): boolean {
    const v = this.viewOf(side, uid);
    if (!v) return false;
    v.center(side === 0 ? this.gs.bagRect() : this.eg, out);
    return true;
  }

  private barCenter(side: Side, out: { x: number; y: number }): void {
    const r = side === 0 ? this.gs.B.playerHp : this.gs.B.enemyHp;
    out.x = r.x + r.w * 0.5;
    out.y = r.y + r.h / 2;
  }

  /** 受击点：敌人 = 立牌，玩家 = 血条 */
  private targetPoint(side: Side, out: { x: number; y: number }): void {
    if (side === 1) this.standee.center(this.gs.B.standee, out);
    else this.barCenter(0, out);
  }

  // ---------- 更新 ----------

  update(dt: number, _raw: number): void {
    const gs = this.gs;
    const k = gs.tr.enemy;
    // 敌人区从顶部落下（带回弹）
    const dy = -(1 - k) * 260;
    const eg = this.eg;
    Object.assign(eg, this.egBase);
    eg.y += dy;
    eg.gy += dy;
    this.hpP.update(dt);
    this.hpE.update(dt);
    this.standee.update(dt);
    for (const v of this.eViews.values()) v.update(dt);
    this.eLinks.update(dt);
    if (this.sP.poisonPop > 0) this.sP.poisonPop = Math.max(0, this.sP.poisonPop - dt);
    if (this.sE.poisonPop > 0) this.sE.poisonPop = Math.max(0, this.sE.poisonPop - dt);
    if (this.vignette > 0) this.vignette = Math.max(0, this.vignette - dt / 0.35);
    for (let i = 0; i < 2; i++) if (this.ripple[i] >= 0) this.ripple[i] = this.ripple[i] + dt / 0.5 > 1 ? -1 : this.ripple[i] + dt / 0.5;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt / 0.4);
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      this.stamps[i].t += dt;
      if (this.stamps[i].t > 1.4) this.stamps.splice(i, 1);
    }
    if (this.stormBanner >= 0) {
      this.stormBanner += dt;
      if (this.stormBanner > 1.8) this.stormBanner = -1;
    }
    if (this.fireSweep >= 0) {
      this.fireSweep += dt / 0.5;
      if (this.fireSweep < 1 && Math.random() < 0.8) emit('flame', 390 * this.fireSweep, gs.B.playerBag.y + Math.random() * gs.B.playerBag.h, 1, { speed: 40, life: 0.6, angle: -Math.PI / 2 });
      if (this.fireSweep > 1.2) this.fireSweep = -1;
    }
    const pb = this.pb;
    if (pb && this.started && !this.ended) {
      if (shake.stop <= 0) {
        let slow = 1;
        if (gs.tut.step === 5) {
          this.slowT += dt;
          if (this.slowT < TUTORIAL.slowmoSec) slow = TUTORIAL.slowmo;
        }
        pb.speed = this.speed;
        const rdt = dt * slow;
        pb.advance(rdt, this.onFire, this.onShow);
        updateProjs(rdt);
      }
      // 心跳
      if (this.lowHp()) {
        this.beat -= dt;
        if (this.beat <= 0) {
          this.beat = 0.9;
          sfx('heartbeat');
        }
      }
      if (pb.finished) {
        this.ended = true;
        gs.onBattleEnd();
      }
    } else if (!this.started) updateProjs(dt);
    // 眩晕 / 消耗 / 倒下：变灰
    const t = pb ? pb.t : 0;
    const stunP = !!pb && this.started && pb.isStunned(0, t);
    const stunE = !!pb && this.started && pb.isStunned(1, t);
    this.sP.stun = stunP;
    this.sE.stun = stunE;
    if (this.downT >= 0) this.downT += dt;
    let i = 0;
    const g = Math.min(1, dt * 12);
    for (const v of gs.views.values()) {
      if (v.zone !== 'bag') continue;
      let want = 0;
      if (pb) {
        if (this.consumed.has(v.uid)) want = 0.75;
        if (stunP) want = 1;
        if (this.downT >= 0 && this.downT > i * 0.08) want = 1;
      }
      v.gray += (want - v.gray) * g;
      i++;
    }
    for (const v of this.eViews.values()) {
      let want = 0;
      if (this.consumed.has(v.uid)) want = 0.75;
      if (stunE) want = 1;
      v.gray += (want - v.gray) * g;
    }
    this.stars[0] += dt * (stunP ? 1 : -2);
    this.stars[1] += dt * (stunE ? 1 : -2);
    this.stars[0] = Math.max(0, Math.min(1, this.stars[0]));
    this.stars[1] = Math.max(0, Math.min(1, this.stars[1]));
    if (gs.phase === 'result') this.ribbonK = Math.min(1, this.ribbonK + dt / 0.3);
  }

  step(h: number): void {
    this.jolt.step(h);
    for (const v of this.eViews.values()) v.step(h);
  }

  // ---------- 事件 ----------

  private onFire = (e: BattleEvent): void => {
    const gs = this.gs;
    const fast = this.speed >= 4;
    const dur = BATTLE.projectileTime / Math.sqrt(this.speed);
    if (e.type === 'fire' && e.uid !== undefined) {
      const side = e.side;
      const v = this.viewOf(side, e.uid);
      if (!v) return;
      v.pop = 0.22;
      v.flash = 0.09;
      v.flashMax = fast ? 0.45 : 0.75;
      if (side === 0) gs.links.flashLinks(e.links);
      else this.eLinks.flashLinks(e.links);
      const def = ITEMS[v.id];
      this.itemCenter(side, e.uid, TMP);
      const col = TAG_COLOR[def.tag];
      if (!fast) emit('spark', TMP.x, TMP.y, 5, { color: col, speed: 120, life: 0.3, size: 2 });
      if (def.tag === 'weapon') {
        sfx(fireSfx(v.id));
        this.targetPoint(side === 0 ? 1 : 0, TMP2);
        const kind = projKind(v.id);
        const arc = kind === 'arrow' ? 26 : kind === 'blob' || kind === 'spin' ? 40 : kind === 'bolt' ? 0 : 14;
        launch(kind, TMP.x, TMP.y, TMP2.x, TMP2.y, dur, col, v.id, side === 0 ? arc : -arc * 0.3, v.id === 'hammer' || v.id === 'axe' ? 1.3 : 1);
        if (side === 1) this.standee.fire();
      } else if (def.tag === 'armor') {
        this.barCenter(side, TMP2);
        launch('shield', TMP.x, TMP.y, TMP2.x - 120, TMP2.y, dur, C.shield, v.id, 20, 1);
      } else if (def.tag === 'remedy') {
        this.barCenter(side, TMP2);
        launch('leaf', TMP.x, TMP.y, TMP2.x, TMP2.y, dur, C.heal, v.id, 30, 1);
      }
      if (side === 0) this.firstFire = true;
    } else if (e.type === 'hit' && e.second && e.uid !== undefined) {
      if (this.itemCenter(e.side, e.uid, TMP)) {
        this.targetPoint(e.side === 0 ? 1 : 0, TMP2);
        launch('spin', TMP.x, TMP.y, TMP2.x, TMP2.y, dur, TAG_COLOR.weapon, 'boomerang', 40, 1);
        sfx('swish');
      }
    } else if (e.type === 'hit' && e.fire) {
      this.standee.fire();
      this.standee.roar.v += 3;
    }
  };

  private onShow = (e: BattleEvent): void => {
    const gs = this.gs;
    const res = this.res!;
    this.hpP.setHp(e.hp[0]);
    this.hpE.setHp(e.hp[1]);
    this.hpP.setShield(e.shield[0]);
    this.hpE.setShield(e.shield[1]);
    if (e.poison[0] !== this.sP.poison) this.sP.poison = e.poison[0];
    if (e.poison[1] !== this.sE.poison) this.sE.poison = e.poison[1];
    const fast = this.speed >= 4;
    switch (e.type) {
      case 'hit': {
        const tgt: Side = e.side === 0 ? 1 : 0;
        const amt = e.amount ?? 0;
        const big = amt >= res.maxHp[tgt] * FX.bigHitFrac;
        const bar = tgt === 0 ? this.hpP : this.hpE;
        this.targetPoint(tgt, TMP);
        if (e.fire) {
          // 龙炎：真实伤害，火焰扫过下半屏
          this.fireSweep = 0;
          sfx('fire');
          tier('T3');
          popup('−' + amt, TMP.x + 60, TMP.y - 18, '#ffb04a', 34, { ui: true, life: 1.1 });
          emit('flame', TMP.x, TMP.y, 24, { speed: 160, life: 0.8 });
          bar.shake = 0.25;
          this.jolt.v += 260;
          this.vignette = 1;
          break;
        }
        if (tgt === 1) {
          this.standee.hit(big);
          if (amt > 0) {
            // 立牌上的伤害数字：5 条车道左右交错、逐条上移，700ms 内不重叠
            const p = lane('h1', TMP.x + 8, TMP.y - 6, 24, 700, 1.6);
            popup(String(amt), p.x, p.y, big ? '#fff3c4' : '#ffffff', big ? 32 : fast ? 20 : 24, { life: fast ? 0.6 : 0.9, vy: -60 });
          }
          emit('ink', TMP.x, TMP.y, big ? 8 : fast ? 2 : 4, { speed: 120, life: 0.5, size: 2.4 });
          if (big) {
            sfx('bigHit');
            tier('T2');
            bar.shake = 0.25;
            emit('spark', TMP.x, TMP.y, 1, { color: '#fff3c4', speed: 0, size: 18, life: 0.25 });
          } else sfx('hit');
        } else {
          if (amt > 0) {
            const p = lane('h0', TMP.x + (Math.random() - 0.3) * 40, TMP.y - 16);
            popup('−' + amt, p.x, p.y, '#ff9a7a', big ? 30 : fast ? 18 : 22, { ui: true, life: fast ? 0.6 : 0.9, vy: -40 });
          }
          this.jolt.v += big ? 220 : 120;
          this.vignette = big ? 1 : 0.6;
          emit('ink', TMP.x, TMP.y, 3, { color: C.hp, speed: 90, life: 0.4 });
          sfx('playerHit');
          tier(big ? 'T2' : 'T1');
          if (big) bar.shake = 0.25;
        }
        if ((e.absorbed ?? 0) > 0) {
          this.barCenter(tgt, TMP2);
          const p = lane(tgt === 0 ? 'a0' : 'a1', TMP2.x - 100, buffY(tgt, TMP2.y, -14), tgt === 1 ? -14 : 14);
          popup('−' + e.absorbed, p.x, p.y, C.shieldLight, fast ? 15 : 17, { ui: true, life: 0.7, vy: buffVy(tgt, -30) });
          if (e.shield[tgt] === 0) {
            sfx('shieldBreak');
            tier('T2');
            emit('shard', TMP2.x - 120, TMP2.y, 10, { color: C.shieldLight, speed: 150, life: 0.6, ui: true });
          }
        }
        break;
      }
      case 'shield': {
        const amt = e.amount ?? 0;
        this.barCenter(e.side, TMP);
        // 4× 时小额护盾不飘字（血条护盾徽章已显示），避免满屏数字
        if (!fast || amt >= res.maxHp[e.side] * 0.08) {
          const p = lane(e.side === 0 ? 's0' : 's1', TMP.x - 110, buffY(e.side, TMP.y, -16), e.side === 1 ? -14 : 14);
          popup('+' + amt, p.x, p.y, C.shieldLight, fast ? 15 : 19, { ui: true, life: 0.8, vy: buffVy(e.side, -36) });
        }
        if (!fast) emit('shard', TMP.x - 120, TMP.y, 4, { color: C.shieldLight, speed: 70, life: 0.4, ui: true });
        sfx('shield');
        if (!fast || this.ripple[e.side] < 0) this.ripple[e.side] = 0;
        if (e.uid !== undefined) {
          const v = this.viewOf(e.side, e.uid);
          if (v && v.pop <= 0 && ITEMS[v.id].tag !== 'weapon') v.pop = 0.22;
        }
        break;
      }
      case 'heal': {
        this.barCenter(e.side, TMP);
        // 4× 时小额回复不飘字（血条绿色前沿已显示）
        if (!fast || (e.amount ?? 0) >= res.maxHp[e.side] * 0.08) {
          const p = lane(e.side === 0 ? 'l0' : 'l1', TMP.x + 40, buffY(e.side, TMP.y, -16), e.side === 1 ? -14 : 14);
          popup('+' + (e.amount ?? 0), p.x, p.y, C.healLight, fast ? 16 : 22, { ui: true, life: 0.9, vy: buffVy(e.side, -40) });
        }
        if (!fast) emit('leaf', TMP.x, TMP.y, 4, { color: C.heal, speed: 60, life: 0.7, ui: true });
        sfx('heal');
        break;
      }
      case 'overheal': {
        const bar = e.side === 0 ? this.hpP : this.hpE;
        bar.full = 0.3;
        if (!fast) {
          this.barCenter(e.side, TMP);
          popup('满', TMP.x + 120, TMP.y - 12, '#ffffff', 14, { ui: true, cn: true, life: 0.6, vy: -20 });
        }
        break;
      }
      case 'poisonApply': {
        const st = e.side === 0 ? this.sP : this.sE;
        st.poisonPop = 0.3;
        this.barCenter(e.side, TMP);
        if (!fast) emit('bubble', TMP.x + 100, TMP.y, 3, { color: C.poisonLight, speed: 40, life: 0.8, ui: true });
        sfx('bubble');
        if (e.side === 0) gs.showHint('poison');
        break;
      }
      case 'poisonTick': {
        this.barCenter(e.side, TMP);
        const p = lane(e.side === 0 ? 'p0' : 'p1', TMP.x + 70, buffY(e.side, TMP.y, -14), e.side === 1 ? -14 : 14);
        popup('−' + (e.amount ?? 0), p.x, p.y, '#c99bef', fast ? 16 : 20, { ui: true, life: 0.8, vy: buffVy(e.side, -30) });
        emit('bubble', TMP.x + 70, TMP.y, 3, { color: C.poisonLight, speed: 40, life: 0.8, ui: true });
        sfx('gulp');
        break;
      }
      case 'cleanse': {
        this.barCenter(e.side, TMP);
        popup('净化', TMP.x + 40, TMP.y - 26, C.healLight, 14, { ui: true, cn: true, life: 0.8, vy: -24 });
        break;
      }
      case 'stun': {
        sfx('stun');
        tier('T2');
        if (e.side === 1) this.standee.center(gs.B.standee, TMP);
        else this.barCenter(0, TMP);
        emit('star', TMP.x, TMP.y - 30, 5, { color: '#ffe066', speed: 60, life: 0.8 });
        break;
      }
      case 'lowHp': {
        this.barCenter(e.side, TMP);
        popup('+' + (e.amount ?? 0), TMP.x - 70, TMP.y - 34, C.healLight, 34, { ui: true, life: 1.2, vy: -50 });
        emit('bubble', TMP.x, TMP.y, 12, { color: C.healLight, speed: 140, life: 0.7, ui: true });
        sfx('potion');
        tier('T3');
        if (e.uid !== undefined) {
          const v = this.viewOf(e.side, e.uid);
          if (v) {
            v.pop = 0.22;
            v.flash = 0.12;
            this.itemCenter(e.side, e.uid, TMP2);
            emit('dust', TMP2.x, TMP2.y - 10, 1, { color: '#a8865a', speed: 160, angle: -Math.PI / 2, size: 5, life: 0.7, g: 400 });
          }
          this.consumed.add(e.uid);
        }
        break;
      }
      case 'revive': {
        this.flashColor = '#ffd27a';
        this.flashA = 0.85;
        sfx('revive');
        tier('T4');
        duckMusic(4, 0.2);
        this.barCenter(e.side, TMP);
        emit('flame', TMP.x, TMP.y, 30, { speed: 180, life: 0.9, ui: true });
        emit('confetti', TMP.x, TMP.y, 20, { color: C.goldLight, speed: 200, life: 1, ui: true });
        popup('涅槃！', 195, gs.B.band.y + gs.B.band.h / 2, C.goldLight, 34, { ui: true, cn: true, life: 1.2 });
        if (e.uid !== undefined) this.consumed.add(e.uid);
        break;
      }
      case 'phase': {
        const tr = this.e.traits[e.amount ?? 0];
        const dragon = tr && tr.kind === 'dragonRage';
        this.flashColor = '#d0402a';
        this.flashA = 0.5;
        this.enraged = true;
        this.sE.enraged = true;
        this.hpE.notchBroken = true;
        this.standee.red = 1;
        this.standee.roar.v += 5;
        this.standee.roar.x = 1.18;
        sfx('roar');
        sfx('gong', 0, 0.2);
        tier('T4');
        duckMusic(4, 0.2);
        this.stamps.push({ s: dragon ? '龙怒！' : '狂怒！', color: '#c2402c', t: 0, y: gs.B.band.y + gs.B.band.h / 2, size: 34 });
        this.standee.center(gs.B.standee, TMP);
        emit('shard', gs.B.enemyHp.x + gs.B.enemyHp.w / 2, gs.B.enemyHp.y + 10, 12, { color: '#d8c8a8', speed: 160, life: 0.7, ui: true });
        emit('steam', TMP.x, TMP.y - 40, 8, { speed: 60, life: 1 });
        break;
      }
      case 'fatigue': {
        this.barCenter(e.side, TMP);
        const p = lane(e.side === 0 ? 'f0' : 'f1', TMP.x - 40 + e.side * 10, TMP.y - 14);
        popup('−' + (e.amount ?? 0), p.x, p.y, '#e0b080', fast ? 15 : 18, { ui: true, life: 0.7, vy: -30 });
        break;
      }
      case 'storm': {
        this.stormBanner = 0;
        sfx('storm');
        tier('T2', false);
        for (let i = 0; i < 10; i++) emit('dust', i < 5 ? 0 : 390, gs.B.band.y + Math.random() * 300, 1, { color: '#cdb27a', speed: 120, angle: i < 5 ? 0 : Math.PI, life: 1.4 });
        break;
      }
      case 'end': {
        if (e.side === 0) {
          shake.stop = Math.max(shake.stop, 0.12);
          this.standee.fall();
          this.standee.center(gs.B.standee, TMP);
          emit('confetti', TMP.x, TMP.y + 40, 20, { speed: 200, life: 1.1 });
          emit('dust', TMP.x, gs.B.standee.y + gs.B.standee.h - 6, 8, { speed: 90, life: 0.8 });
          this.stamps.push({ s: '击败！', color: '#c2402c', t: 0, y: TMP.y, size: 30 });
          sfx('kill');
          sfx('victory', 0, 0.35);
          tier('T3', false);
        } else {
          this.downT = 0;
          gs.collapse.target = 1;
          this.standee.gloat = true;
          const g = gs.bagRect();
          emit('dust', g.x + g.w / 2, g.y + g.h, 10, { speed: 100, life: 0.8 });
          sfx('playerDown');
          sfx('defeat', 0, 0.4);
          tier('T4');
        }
        break;
      }
      default:
        break;
    }
  };

  /** 战斗中轻点装备：2 秒小提示（最终数值） */
  tapAt(x: number, y: number): void {
    const gs = this.gs;
    const g = gs.bagRect();
    const cx = Math.floor((x - g.gx) / g.cell);
    const cy = Math.floor((y - g.gy) / g.cell);
    const u = gs.syn.occ.get(cx, cy);
    if (u > 0) {
      const it = gs.run.bag.find((b) => b.uid === u);
      if (it) {
        const info = describe(it.id, it.lv, gs.syn.derived.get(u));
        showToast(ITEMS[it.id].name + '：' + info.effect, 195, y - 40);
      }
      return;
    }
    const eg = this.eg;
    const ex = Math.floor((x - eg.gx) / eg.cell);
    const ey = Math.floor((y - eg.gy) / eg.cell);
    if (this.eSyn) {
      const eu = this.eSyn.occ.get(ex, ey);
      if (eu > 0) {
        const it = this.eItems.find((b) => b.uid === eu);
        if (it) {
          const info = describe(it.id, it.lv, this.eSyn.derived.get(eu));
          showToast(ITEMS[it.id].name + '：' + info.effect, 195, y + 50);
        }
      }
    }
  }

  // ---------- 绘制 ----------

  private ring(ctx: CanvasRenderingContext2D, rg: Ring, g: BagRect): void {
    const pb = this.pb;
    const v = this.viewOf(rg.side, rg.uid);
    if (!v) return;
    const p = pb && this.started ? pb.progress(rg.uid) : 0;
    const since = pb && this.started ? pb.sinceFire(rg.uid) : 99;
    const flash = Math.max(0, 1 - since / (0.15 * this.speed));
    const stunned = !!pb && this.started && pb.isStunned(rg.side, pb.t);
    const x = g.gx + (v.pos.x + rg.bx) * g.cell;
    let y = g.gy + (v.pos.y + rg.by) * g.cell;
    if (v.pop > 0) y -= 6 * Math.sin(Math.PI * (1 - v.pop / 0.22)) * (g.cell / 46);
    drawCooldownRing(ctx, x, y, g.cell * 0.28, p, rg.color, flash, stunned);
  }

  /** 世界层：立牌 + 敌人背包 */
  drawEnemy(ctx: CanvasRenderingContext2D, time: number): void {
    const gs = this.gs;
    const k = gs.tr.enemy;
    if (k <= 0.01) return;
    const B = gs.B;
    const eg = this.eg;
    const dy = eg.y - this.egBase.y;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.4);
    ctx.save();
    ctx.translate(0, dy);
    this.standee.draw(ctx, B.standee, time);
    ctx.restore();
    drawEnemyBag(ctx, eg, this.e.frame, this.e.cols, this.e.rows);
    if (this.ripple[1] >= 0) drawRipple(ctx, eg, this.ripple[1]);
    for (const v of this.eViews.values()) v.draw(ctx, eg, time, true);
    this.eLinks.draw(ctx, eg, time, 0.32);
    for (const r of this.rings) if (r.side === 1) this.ring(ctx, r, eg);
    if (this.stars[1] > 0.01) this.drawStars(ctx, B.standee.x + B.standee.w / 2, B.standee.y + 20 + dy, this.stars[1], time);
    ctx.restore();
  }

  drawBand(ctx: CanvasRenderingContext2D, time: number): void {
    const gs = this.gs;
    const pb = this.pb;
    const t = pb && this.started ? pb.t : 0;
    const remain = Math.max(0, BATTLE.softLimit - t);
    drawBand(ctx, gs.B.band, gs.B.hourglass, this.ribbonK > 0 ? -Math.max(0.001, remain) : remain, t >= BATTLE.softLimit, time, gs.tr.enemy);
  }

  /** 玩家背包上层：护盾涟漪、冷却环、眩晕星 */
  drawPlayerOverlay(ctx: CanvasRenderingContext2D, g: BagRect, time: number): void {
    if (this.gs.tr.enemy <= 0.01 || !this.pb) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.gs.tr.enemy * 1.5);
    if (this.ripple[0] >= 0) drawRipple(ctx, g, this.ripple[0]);
    for (const r of this.rings) if (r.side === 0) this.ring(ctx, r, g);
    if (this.stars[0] > 0.01) this.drawStars(ctx, g.x + g.w / 2, g.y + 6, this.stars[0], time);
    ctx.restore();
  }

  private drawStars(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, time: number): void {
    ctx.save();
    ctx.globalAlpha *= a;
    for (let i = 0; i < 5; i++) {
      const ang = time * 4 + (i / 5) * Math.PI * 2;
      const x = cx + Math.cos(ang) * 34;
      const y = cy + Math.sin(ang) * 9;
      text(ctx, '★', x, y, { size: 14, color: '#ffe066', stroke: C.ink, strokeW: 2.5 });
    }
    ctx.restore();
  }

  /** 投射物、火焰、印章、横幅、缎带 */
  drawEffects(ctx: CanvasRenderingContext2D, time: number): void {
    const gs = this.gs;
    if (gs.tr.enemy <= 0.01 && !this.pb) return;
    drawProjs(ctx, time);
    const B = gs.B;
    if (this.fireSweep >= 0 && this.fireSweep <= 1.2) {
      const k = Math.min(1, this.fireSweep);
      const a = this.fireSweep > 1 ? 1 - (this.fireSweep - 1) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha *= 0.55 * a;
      ctx.globalCompositeOperation = 'lighter';
      const y0 = B.playerBag.y;
      const h = B.playerBag.h + 80;
      const x = -60 + 510 * k;
      const grd = ctx.createLinearGradient(x - 160, 0, x, 0);
      grd.addColorStop(0, 'rgba(255,120,30,0)');
      grd.addColorStop(0.7, 'rgba(255,140,40,0.7)');
      grd.addColorStop(1, 'rgba(255,220,120,0.9)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - 160, y0, 160, h);
      ctx.restore();
    }
    for (const s of this.stamps) {
      const st = Math.min(1, s.t / 0.12);
      const a = s.t > 1.1 ? Math.max(0, 1 - (s.t - 1.1) / 0.3) : 1;
      drawStamp(ctx, s.s, 195, s.y, s.size, s.color, -0.1, a, 2 - st);
    }
    if (this.stormBanner >= 0) {
      const t = this.stormBanner;
      const a = t < 0.2 ? t / 0.2 : t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.3) : 1;
      const cy = B.band.y + B.band.h / 2;
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = 'rgba(60,36,14,0.8)';
      ctx.fillRect(0, cy - 20, 390, 40);
      text(ctx, '风暴来袭', 195, cy + 1, { size: 24, weight: 900, color: '#ffd8a0', stroke: C.ink, strokeW: 4, spacing: 8 });
      ctx.restore();
    }
    if (this.ribbonK > 0 && gs.outcome) {
      drawResultRibbon(ctx, 195, B.band.y + B.band.h / 2, gs.outcome.win, this.ribbonK, time);
      if (!gs.outcome.ending) this.drawRewardLine(ctx, B.band.y + B.band.h / 2 + 38, gs.outcome.win);
    }
  }

  /** 缎带下方的金币奖励行："+2 胜利 · +1 利息"（下轮账单会照此入账） */
  private drawRewardLine(ctx: CanvasRenderingContext2D, y: number, win: boolean): void {
    const k = Math.min(1, Math.max(0, (this.ribbonK - 0.6) / 0.4));
    if (k <= 0) return;
    const run = this.gs.run;
    const interest = Math.min(ECONOMY.interestCap, Math.floor(run.savedGold / ECONOMY.interestStep));
    const parts = [win ? `+${ECONOMY.winBonus} 胜利` : `+${ECONOMY.lossBonus} 失败补偿`];
    if (interest > 0) parts.push(`+${interest} 利息`);
    if (run.pouchGold > 0) parts.push(`+${run.pouchGold} 钱袋`);
    const label = parts.join(' · ');
    let tw = 0;
    for (const ch of label) tw += ch.charCodeAt(0) > 255 ? 14 : 8;
    const w = tw + 44;
    ctx.save();
    ctx.globalAlpha *= k;
    ctx.translate(195, y + (1 - k) * -10);
    ctx.fillStyle = 'rgba(43,29,20,0.88)';
    ctx.strokeStyle = C.goldDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -12, w, 24, 12);
    ctx.fill();
    ctx.stroke();
    drawGoldCoin(ctx, -w / 2 + 16, 0, 8);
    text(ctx, label, 10, 1, { size: 14, weight: 900, color: C.goldLight });
    ctx.restore();
  }

  /** HUD 层：敌人徽章 / 名字 / 血条 / 状态；玩家徽记 / 血条 / 状态 */
  drawHud(ctx: CanvasRenderingContext2D, time: number): void {
    const gs = this.gs;
    const k = gs.tr.enemy;
    if (k <= 0.01) return;
    const B = gs.B;
    const dy = -(1 - k) * 120;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.3);
    ctx.save();
    ctx.translate(0, dy);
    drawEnemyBadge(ctx, this.e.portrait, B.enemyBadge.x + 24, B.enemyBadge.y + 24, 24);
    text(ctx, `${this.e.title}「${this.e.name}」`, B.enemyName.x, B.enemyName.y, { size: 14, weight: 900, color: C.paper, align: 'left', stroke: 'rgba(20,10,4,0.7)', strokeW: 3 });
    this.hpE.draw(ctx, B.enemyHp, { boss: !!this.e.boss, showNum: true, time, low: false });
    drawStatus(ctx, B.enemyStatus.x, B.enemyStatus.y, this.sE, time);
    ctx.restore();
    const py = (1 - k) * 80;
    ctx.translate(0, py);
    drawPlayerBadge(ctx, B.playerBadge.x + 24, B.playerBadge.y + 24, 24);
    this.hpP.draw(ctx, B.playerHp, { boss: false, showNum: true, time, low: this.lowHp() });
    drawStatus(ctx, B.playerStatus.x, B.playerStatus.y, this.sP, time);
    ctx.restore();
  }

  /** 屏幕效果：全屏闪光 + 底部红色暗角 */
  drawScreen(ctx: CanvasRenderingContext2D): void {
    if (this.flashA > 0) drawFlash(ctx, this.flashColor, this.flashA * 0.6);
    let v = this.vignette;
    if (this.lowHp()) v = Math.max(v, 0.35 + 0.25 * Math.sin(performance.now() / 160));
    if (v > 0) drawRedVignette(ctx, v);
  }

  screenFlash(color: string, a: number): void {
    this.flashColor = color;
    this.flashA = a;
  }

  /** 调试：直接结束 */
  skipToEnd(): void {
    if (!this.pb) return;
    this.started = true;
    this.pb.skipToEnd(this.onShow);
  }

  get rect(): Rect {
    return this.eg;
  }
}

/** 背包边框的钢蓝色涟漪：两道圆角框由内向外扩散并淡出 */
function drawRipple(ctx: CanvasRenderingContext2D, g: Rect, t: number): void {
  ctx.save();
  ctx.strokeStyle = C.shieldLight;
  for (let i = 0; i < 2; i++) {
    const k = t - i * 0.22;
    if (k <= 0 || k >= 1) continue;
    const e = 1 - (1 - k) * (1 - k);
    const pad = 2 + e * 12;
    ctx.globalAlpha = (1 - k) * 0.75;
    ctx.lineWidth = 3.5 - e * 2;
    ctx.beginPath();
    ctx.roundRect(g.x - pad, g.y - pad, g.w + pad * 2, g.h + pad * 2, 10 + pad * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

// 同一位置连续飘字错开（4× 时不叠成一团）
const LANE = { x: 0, y: 0 };
const laneT: Record<string, number> = {};
const laneI: Record<string, number> = {};
const LANE_DX = [0, -22, 22, -11, 11];
function lane(key: string, x: number, y: number, dy = 14, win = 380, kx = 1): { x: number; y: number } {
  const now = performance.now();
  const i = now - (laneT[key] ?? -1e9) < win ? ((laneI[key] ?? 0) + 1) % LANE_DX.length : 0;
  laneT[key] = now;
  laneI[key] = i;
  LANE.x = x + LANE_DX[i] * kx;
  LANE.y = y - i * dy;
  return LANE;
}

/** 敌方血条上方是名字：敌方的护盾/回复/中毒等跳字放到血条下方 */
function buffY(side: Side, barY: number, dy: number): number {
  return side === 1 ? barY + 30 : barY + dy;
}
/** 敌方增益跳字向下飘，不回到血条上 */
function buffVy(side: Side, vy: number): number {
  return side === 1 ? 14 : vy;
}
