// 游戏场景：整理 + 战斗共用一张桌面；管理阶段、转场、HUD、按钮、账单、引导与覆盖层
import { duckMusic, au } from '../audio/audio.ts';
import { setMusic } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { BAG, ECONOMY, ITEMS, SHOP } from '../config.ts';
import { input, type InputHandler } from '../core/input.ts';
import { clock } from '../core/loop.ts';
import { Spring } from '../core/spring.ts';
import { settings } from '../core/storage.ts';
import { Rolling, ease } from '../core/tween.ts';
import type { ReceiptLine } from '../game/economy.ts';
import { enemyBag, enemyFor } from '../game/enemies.ts';
import {
  applyResult, beginArrange, find, hasWeapon, newRun, refresh, sellValue, startBattle, undoSell, type Outcome, type SellRecord,
} from '../game/run.ts';
import { computeSynergy, type SynergyResult } from '../game/synergy.ts';
import { hintSeen, markHint, markTutorialDone, resetTutorialFlag, HINT_TEXT, Tutorial, type HintId } from '../game/tutorial.ts';
import type { ItemInst, Rot, RunState } from '../game/types.ts';
import { drawParticles, emit } from '../render/fx/particles.ts';
import { drawPopups, popup } from '../render/fx/popups.ts';
import { shake, tier } from '../render/fx/shake.ts';
import { C, drawGoldCoin, seal } from '../render/kit.ts';
import { arrangeLayout, battleLayout, inRect, type ArrangeLayout, type BagRect, type BattleLayout, type Rect } from '../render/layout.ts';
import { LW, rectCss, setGameTransform, stage } from '../render/stage.ts';
import { drawSprite, text } from '../render/text.ts';
import { Button, drawToast, showToast, drawBubble, drawStamp, type UiEl } from '../render/ui/widgets.ts';
import { setBackdrop } from '../render/views/background.ts';
import { drawMapFlag } from '../render/views/desktopDecor.ts';
import { drawPlayerBag } from '../render/views/bagView.ts';
import { drawDetailBar, drawEnemyCard, drawGold, drawHearts, drawRoundTag, type DetailInfo, type HeartBreak } from '../render/views/hudView.ts';
import { LinkLayer, drawBowDots, drawHornWaves } from '../render/views/linkView.ts';
import { ShopView } from '../render/views/shopView.ts';
import { drawStash } from '../render/views/stashView.ts';
import { ArrangeController } from './arrangeController.ts';
import { BattleController } from './battleController.ts';
import { describe } from './describe.ts';
import { Guide } from './guide.ts';
import { HALF_PI, ItemView, stashCell } from './itemView.ts';
import { ConfirmPanel, DetailPanel, DrawerPanel, Overlays, PausePanel, RoutePanel, SettingsPanel } from './overlays.ts';
import { factories, gotoScene, type Scene } from './sceneManager.ts';

export type GPhase = 'receipt' | 'arrange' | 'toBattle' | 'battle' | 'result' | 'toArrange';

interface CoinFly {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  delay: number;
  amt: number;
  semi: number;
}

const TMPP = { x: 0, y: 0 };

export class GameScene implements Scene {
  readonly name = 'game' as const;
  run: RunState;
  L!: ArrangeLayout;
  B!: BattleLayout;
  private layVer = -1;
  views = new Map<number, ItemView>();
  syn!: SynergyResult;
  links = new LinkLayer();
  shopV = new ShopView(SHOP.slots);
  tut = new Tutorial();
  guide: Guide;
  ac: ArrangeController;
  bc: BattleController;
  ov = new Overlays();
  gold = new Rolling(0);
  score = new Rolling(0);
  phase: GPhase = 'arrange';
  /** 转场值（已缓动）：bag 0=整理位 1=战斗位；shop 0=显示 1=滑出；enemy 0=隐藏 1=显示 */
  tr = { bag: 0, shop: 0, enemy: 0, open: 1 };
  private tt = 0;
  private standeePopped = false;
  private bossIntro = -1;
  /** 正在打 / 刚打完的轮次（结算时 run.round 已前进，HUD 仍显示这一轮） */
  private battleRound = 1;
  private hintQ: HintId[] = [];
  heartBreaks: HeartBreak[] = [];
  enemyFlip = 0;
  detail: { info: DetailInfo; until: number; t: number } | null = null;
  receipt: { lines: ReceiptLine[]; t: number; shown: number; from: number; total: number } | null = null;
  stampT = -1;
  hint: { s: string; t: number } | null = null;
  undo: { rec: SellRecord; until: number; slide: number } | null = null;
  outcome: Outcome | null = null;
  collapse = new Spring(14, 0.45, 0);
  paused = false;
  time = 0;
  private coins: CoinFly[] = [];
  private bagR: BagRect = { x: 0, y: 0, w: 0, h: 0, gx: 0, gy: 0, cell: 54, frame: 16 };
  // 按钮
  pauseB: Button;
  fightB: Button;
  undoB: Button;
  skipB: Button;
  refreshB: Button;
  lockB: Button;
  speedB: Button;
  contB: Button;
  nextB: Button;
  pressed: Button | null = null;
  private pressedHud: 'round' | 'enemy' | null = null;
  private lastRefresh = 0;
  speedFlip = 1;
  handler: InputHandler;

  constructor(o: { seed?: number; tutorial?: boolean; round?: number }) {
    const seed = o.seed ?? (Date.now() % 1000000);
    this.run = newRun(seed, !!o.tutorial);
    this.pauseB = new Button('btn.pause', { x: 12, y: 8, w: 44, h: 44 }, '', 'coin', 3);
    this.pauseB.icon = 'pause';
    this.fightB = new Button('btn.fight', { x: 95, y: 732, w: 200, h: 60 }, '开战', 'plank', 5);
    this.fightB.fontSize = 24;
    this.undoB = new Button('btn.undo', { x: 16, y: 732, w: 72, h: 60 }, '↶ 撤销', 'paper', 6);
    this.undoB.fontSize = 15;
    this.undoB.visible = false;
    this.skipB = new Button('btn.skip', { x: 302, y: 742, w: 72, h: 40 }, '跳过', 'tag', 7);
    this.refreshB = new Button('btn.refresh', { x: 290, y: 553, w: 84, h: 32 }, '', 'tag', 8);
    this.lockB = new Button('btn.lock', { x: 244, y: 553, w: 40, h: 32 }, '', 'coin', 9);
    this.lockB.icon = 'unlock';
    this.speedB = new Button('btn.speed', { x: 302, y: 732, w: 72, h: 48 }, '1×', 'speed', 10);
    this.contB = new Button('btn.continue', { x: 95, y: 732, w: 200, h: 60 }, '继续 ›', 'plank', 11);
    this.contB.glyph = '✦';
    this.contB.visible = false;
    this.nextB = new Button('btn.tutNext', { x: 150, y: 470, w: 90, h: 34 }, '下一步', 'tag', 12);
    this.nextB.visible = false;
    this.ac = new ArrangeController(this);
    this.bc = new BattleController(this);
    this.guide = new Guide(this);
    this.handler = this.makeHandler();
    if (o.round && o.round > 1) {
      this.run.round = o.round;
    }
  }

  // ---------- 生命周期 ----------

  enter(): void {
    this.layout(true);
    const goldBefore = this.run.gold;
    const lines = beginArrange(this.run);
    this.recompute(false);
    this.syncViews(true);
    this.shopV.setInstant(this.run.shop);
    this.shopV.setLocked(this.run.locked);
    this.gold.set(lines.length ? goldBefore : this.run.gold, true);
    this.score.set(this.run.score, true);
    this.enemyFlip = 0;
    this.tr.open = 0;
    this.phase = 'arrange';
    if (lines.length) this.startReceipt(lines, goldBefore);
    if (this.run.tutorial && this.run.round === 1) this.tut.start();
    setMusic('arrange');
    this.speedB.label = settings.speed + '×';
    this.bc.speed = settings.speed;
  }

  exit(): void {
    this.ac.reset();
    setBackdrop(0, 0, 0);
  }

  autoPause(): void {
    if (!this.paused) this.openPause();
  }

  // ---------- 布局 ----------

  layout(force = false): void {
    if (!force && this.layVer === stage.version) return;
    this.layVer = stage.version;
    this.L = arrangeLayout(stage.H);
    this.B = battleLayout(stage.H);
    const L = this.L;
    const B = this.B;
    this.pauseB.r = L.pause;
    this.fightB.r = L.fight;
    this.undoB.r = L.undo;
    this.skipB.r = L.skip;
    this.refreshB.r = L.refresh;
    this.lockB.r = L.lock;
    this.speedB.r = B.speed;
    this.contB.r = B.cont;
    this.nextB.r = { x: 150, y: L.bubbleY - 70, w: 90, h: 34 };
    // 桌边装备的像素位置跟着布局
    for (const v of this.views.values()) {
      if (v.zone !== 'stash') continue;
      const it = find(this.run, v.uid);
      if (it && it.zone === 'stash') {
        const s = L.stash[it.slot];
        v.pos.snap(s.x + s.w / 2, s.y + s.h / 2);
      }
    }
    this.bc.layout();
  }

  /** 当前玩家背包矩形（整理位 ↔ 战斗位插值） */
  bagRect(): BagRect {
    const a = this.L.bag;
    const b = this.B.playerBag;
    const k = this.tr.bag;
    const r = this.bagR;
    r.cell = a.cell + (b.cell - a.cell) * k;
    r.frame = a.frame + (b.frame - a.frame) * k;
    r.gx = a.gx + (b.gx - a.gx) * k + this.bc.jolt.x;
    r.gy = a.gy + (b.gy - a.gy) * k;
    r.x = r.gx - r.frame;
    r.y = r.gy - r.frame;
    r.w = BAG.cols * r.cell + r.frame * 2;
    r.h = BAG.rows * r.cell + r.frame * 2;
    return r;
  }

  // ---------- 规则 → 表现同步 ----------

  /** 重新计算加成；animate=true 时连线生长 / 断开有动画与音效 */
  recompute(animate: boolean, labelNew = true): void {
    this.syn = computeSynergy(this.run.bag, BAG.cols, BAG.rows);
    const { added, removed } = this.links.sync(this.syn.links, animate);
    if (!animate) return;
    if (added.length) {
      sfx('link');
      const g = this.bagRect();
      if (labelNew) {
        for (const l of added.slice(0, 3)) {
          const mx = g.gx + ((l.a[0] + l.b[0]) / 2 + 0.5) * g.cell;
          const my = g.gy + ((l.a[1] + l.b[1]) / 2 + 0.5) * g.cell;
          popup(l.label, mx, my - 14, '#fff3c4', 15, { cn: true, life: 1.3, vy: -30, delay: 0.22 });
        }
      }
    }
    if (removed.length) {
      sfx('unlink');
      const g = this.bagRect();
      for (const l of removed.slice(0, 3)) {
        const mx = g.gx + ((l.a[0] + l.b[0]) / 2 + 0.5) * g.cell;
        const my = g.gy + ((l.a[1] + l.b[1]) / 2 + 0.5) * g.cell;
        emit('ink', mx, my, 2, { speed: 30, size: 2.2, life: 0.6, angle: Math.PI / 2 });
      }
    }
  }

  /** 让每件装备的表现状态对齐规则状态 */
  syncViews(snap: boolean): void {
    const seen = new Set<number>();
    const all: ItemInst[] = [...this.run.bag];
    for (const it of this.run.stash) if (it) all.push(it);
    for (const it of all) {
      seen.add(it.uid);
      let v = this.views.get(it.uid);
      const fresh = !v;
      if (!v) {
        v = new ItemView(it);
        this.views.set(it.uid, v);
      }
      if (v.hidden && this.ac.isDragging(it.uid)) continue;
      const zoneChanged = v.zone !== it.zone;
      v.id = it.id;
      v.lv = it.lv;
      v.zone = it.zone;
      if (v.rot !== it.rot || fresh) {
        v.rot = it.rot;
        const want = it.rot * HALF_PI;
        let d = want - (((v.ang.target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.ang.target += d;
        if (snap || fresh) v.ang.snap(v.ang.target);
      }
      if (it.zone === 'bag') {
        v.pos.tx = it.x;
        v.pos.ty = it.y;
      } else {
        const s = this.L.stash[it.slot];
        v.pos.tx = s.x + s.w / 2;
        v.pos.ty = s.y + s.h / 2;
        v.cell.target = stashCell(it.id, it.rot);
      }
      if (snap || (fresh && !zoneChanged && v.pos.x === 0 && v.pos.y === 0)) {
        v.pos.snap(v.pos.tx, v.pos.ty);
        v.cell.snap(v.cell.target);
      }
    }
    for (const uid of [...this.views.keys()]) if (!seen.has(uid)) this.views.delete(uid);
  }

  // ---------- 金币 / 提示 / 详情 ----------

  setGold(v: number): void {
    this.gold.set(v);
  }

  /** 金币从 (x,y) 飞到金币栏 */
  flyCoins(x: number, y: number, n: number, toBar = true, semi0 = 0): void {
    const g = this.L.gold;
    for (let i = 0; i < n; i++) {
      const c: CoinFly = toBar
        ? { x0: x, y0: y, x1: g.x + 22, y1: g.y + g.h / 2, t: 0, delay: i * 0.06, amt: 0, semi: semi0 + i }
        : { x0: g.x + 22, y0: g.y + g.h / 2, x1: x, y1: y, t: 0, delay: i * 0.05, amt: 0, semi: -1 };
      this.coins.push(c);
    }
  }

  showDetail(info: DetailInfo, sec: number): void {
    const keep = this.detail && this.detail.info.id === info.id && this.detail.info.lv === info.lv;
    this.detail = { info, until: clock.real + sec, t: keep && this.detail ? this.detail.t : 0 };
  }

  detailFor(it: ItemInst): DetailInfo {
    const d = it.zone === 'bag' ? this.syn.derived.get(it.uid) ?? null : null;
    const info = describe(it.id, it.lv, d);
    if (it.zone === 'stash') info.hint = '在桌边：不参战';
    else if (this.run.round <= 2) info.hint = info.adj + ' · 轻点旋转';
    return info;
  }

  showHint(id: HintId): void {
    if (hintSeen(id) || this.hintQ.includes(id)) return;
    // 引导气泡或另一条提示正在显示：排队，避免互相覆盖
    if (this.tutBubble() || this.hint) {
      this.hintQ.push(id);
      return;
    }
    markHint(id);
    this.hint = { s: HINT_TEXT[id], t: 3.4 };
  }

  private tutBubble(): boolean {
    const s = this.tut.step;
    return (s >= 1 && s <= 4) || (s === 6 && this.phase === 'arrange');
  }

  // ---------- 账单 ----------

  startReceipt(lines: ReceiptLine[], from: number): void {
    let total = 0;
    for (const l of lines) total += l.amount;
    this.receipt = { lines, t: 0, shown: 0, from, total };
    this.phase = 'receipt';
    this.gold.set(from, true);
  }

  private updateReceipt(dt: number): void {
    const r = this.receipt;
    if (!r) return;
    r.t += dt;
    const per = Math.min(0.28, 0.9 / Math.max(1, r.lines.length));
    while (r.shown < r.lines.length && r.t >= 0.35 + r.shown * per) {
      const l = r.lines[r.shown];
      const y = this.receiptY() + 52 + r.shown * 22;
      this.flyCoins(250, y, Math.min(6, Math.max(1, Math.ceil(l.amount / 2))), true, r.shown * 2);
      r.shown++;
    }
    if (r.t >= 0.35 + r.lines.length * per + 0.75) this.endReceipt();
  }

  receiptY(): number {
    const r = this.receipt;
    if (!r) return -200;
    const k = Math.min(1, r.t / 0.3);
    const out = r.shown >= r.lines.length ? Math.max(0, (r.t - (0.35 + r.lines.length * Math.min(0.28, 0.9 / Math.max(1, r.lines.length))) - 0.45) / 0.3) : 0;
    return this.L.bag.y + 30 - (1 - ease.outBack(k)) * 260 - ease.inQuad(Math.min(1, out)) * 300;
  }

  endReceipt(): void {
    if (!this.receipt) return;
    this.receipt = null;
    this.gold.set(this.run.gold);
    this.phase = 'arrange';
    if (this.run.tutorial && this.run.round === 2 && this.run.attempt === 1 && this.tut.step !== 6) this.tut.go(6);
    if (enemyFor(this.run.round).boss) this.showHint('boss');
    if (this.run.gold >= 10) this.showHint('interest');
  }

  // ---------- 开战 ----------

  tryFight(): void {
    if (this.phase !== 'arrange' || this.ac.busy()) return;
    if (this.tut.arranging && this.tut.step < 4) return;
    if (!hasWeapon(this.run)) {
      this.ov.open(new ConfirmPanel(stage.H, '背包里没有武器，敌人不会掉血。确定开战？', '开战', () => this.goBattle()));
      return;
    }
    if (this.run.stash.some((x) => x) && !hintSeen('stash')) {
      this.showHint('stash');
    }
    this.goBattle();
  }

  goBattle(): void {
    if (this.phase !== 'arrange') return;
    this.ac.reset();
    this.ov.closeAll();
    if (this.undo) this.undo = null;
    this.detail = null;
    if (this.tut.step >= 1 && this.tut.step <= 4) {
      markTutorialDone();
      this.tut.go(5);
    } else if (this.tut.step === 6) this.tut.stop();
    this.recompute(false);
    this.battleRound = this.run.round;
    const res = startBattle(this.run);
    this.bc.begin(res);
    this.phase = 'toBattle';
    this.tt = 0;
    this.standeePopped = false;
    const e = enemyFor(this.run.round);
    this.bossIntro = e.boss ? 0 : -1;
    this.stampT = 0;
    sfx('fight');
    tier('T2', false);
    emit('ink', 195, stage.H * 0.42, 6, { speed: 160, size: 3.5, life: 0.6 });
    setMusic(e.boss ? 'boss' : 'battle');
    if (e.boss) duckMusic(4, 0.4);
  }

  private updateToBattle(dt: number): void {
    this.tt += dt;
    const t = this.tt;
    this.tr.shop = ease.outCubic(Math.min(1, t / 0.36));
    this.tr.bag = ease.inOutCubic(Math.max(0, Math.min(1, (t - 0.1) / 0.52)));
    const ek = Math.max(0, Math.min(1, (t - 0.25) / 0.45));
    this.tr.enemy = ek < 1 ? ease.outBounce(ek) : 1;
    if (t >= 0.62 && !this.standeePopped) {
      this.standeePopped = true;
      this.bc.standee.popUp();
      sfx('cloth');
    }
    const boss = this.bossIntro >= 0;
    if (boss) {
      if (t >= 0.75) {
        if (this.bossIntro === 0) {
          sfx('hum');
          sfx('gong', 0, 0.35);
          tier('T3', false);
        }
        this.bossIntro = t - 0.75 + 1e-6;
      }
    }
    const startAt = boss ? 2.4 : 1.1;
    if (t >= startAt) {
      this.bossIntro = -1;
      this.phase = 'battle';
      this.bc.start();
    }
  }

  /** 战斗回放结束（由 BattleController 调用） */
  onBattleEnd(): void {
    const res = this.bc.res!;
    const out = applyResult(this.run, res);
    this.outcome = out;
    this.phase = 'result';
    this.score.set(this.run.score);
    if (out.win) {
      this.contB.label = out.ending ? '结算 ›' : '继续 ›';
      this.contB.glyph = '✦';
      if (out.gain > 0) {
        popup('+' + out.gain, 195, this.B.band.y + this.B.band.h / 2 - 30, C.goldLight, 30, { ui: true, life: 1.4, vy: -60, delay: 0.5 });
        sfx('score', 0, 0.5);
      }
    } else {
      this.contB.label = out.ending ? '结算 ›' : '再战';
      this.contB.glyph = '↻';
      this.heartBreaks.push({ i: this.run.hearts, t: 0 });
      sfx('heartBreak', 0, 0.35);
      tier('T3', false);
      this.showHint('loss');
    }
    this.contB.alpha = 0;
    this.contB.visible = true;
    this.speedB.visible = false;
  }

  continueFromResult(): void {
    if (this.phase !== 'result' || !this.outcome) return;
    const out = this.outcome;
    if (out.ending) {
      const run = this.run;
      const e = enemyFor(run.round);
      factories.ending &&
        gotoScene(() =>
          factories.ending({
            cleared: run.cleared, round: run.round, score: run.score, roundScores: run.stats.roundScores.slice(), clearBonus: out.clearBonus,
            hearts: run.hearts, seed: run.seed, bestHit: run.stats.bestHit, merges: run.stats.merges, spent: run.stats.spent,
            killer: run.cleared ? null : e.portrait, killerName: `${e.title}「${e.name}」`,
          }),
        );
      return;
    }
    this.goArrange();
  }

  private goArrange(): void {
    this.phase = 'toArrange';
    this.tt = 0;
    this.outcome = null;
    this.contB.visible = false;
    this.bc.leave();
    this.collapse.target = 0;
    for (const v of this.views.values()) v.gray = 0;
    const goldBefore = this.run.gold;
    const lines = beginArrange(this.run);
    this.pendingLines = lines;
    this.pendingFrom = goldBefore;
    this.syncViews(false);
    this.shopV.setInstant(this.run.shop);
    this.shopV.flipAll();
    this.shopV.setLocked(this.run.locked);
    this.enemyFlip = 0;
    setMusic('arrange');
  }
  private pendingLines: ReceiptLine[] = [];
  private pendingFrom = 0;

  private updateToArrange(dt: number): void {
    this.tt += dt;
    const t = this.tt;
    this.tr.enemy = 1 - Math.min(1, t / 0.3);
    this.tr.bag = 1 - ease.inOutCubic(Math.max(0, Math.min(1, (t - 0.1) / 0.52)));
    this.tr.shop = 1 - ease.outCubic(Math.max(0, Math.min(1, (t - 0.4) / 0.36)));
    if (t >= 0.8) {
      this.tr.enemy = 0;
      this.tr.bag = 0;
      this.tr.shop = 0;
      this.phase = 'arrange';
      this.recompute(false);
      if (this.pendingLines.length) this.startReceipt(this.pendingLines, this.pendingFrom);
      else this.gold.set(this.run.gold);
    }
  }

  // ---------- 暂停 ----------

  openPause(): void {
    if (this.paused) return;
    this.ac.cancel();
    this.paused = true;
    this.ov.open(
      new PausePanel(stage.H, {
        resume: () => this.resume(),
        settings: () =>
          this.ov.open(
            new SettingsPanel(stage.H, () =>
              this.ov.open(
                new ConfirmPanel(stage.H, '重看教程会从第 1 轮重新开始，确定吗？', '重新开始', () => {
                  this.ov.closeAll();
                  resetTutorialFlag();
                  gotoScene(() => factories.game({ tutorial: true }));
                }),
              ),
            ),
          ),
        restart: () => {
          this.ov.closeAll();
          gotoScene(() => factories.game({ tutorial: false }));
        },
        title: () => {
          this.ov.closeAll();
          gotoScene(() => factories.title());
        },
      }),
    );
  }

  resume(): void {
    this.ov.closeAll();
    this.paused = false;
  }

  // ---------- 更新 ----------

  update(dt: number, raw: number): void {
    this.layout();
    // 战斗远端暗化 + 首领红灯（合成进背景缓存）
    const ek = this.tr.enemy > 0.01 ? this.tr.enemy : 0;
    const br = this.phase === 'arrange' || this.phase === 'receipt' ? this.run.round : this.battleRound;
    setBackdrop(ek, this.B.band.y + this.B.band.h * 0.5, ek > 0 && enemyFor(br).boss ? ek * (this.bc.enraged ? 1 : 0.6) : 0);
    this.ov.update(raw);
    if (this.paused) {
      if (!this.ov.has(PausePanel)) this.paused = false;
      return;
    }
    this.time += dt;
    this.gold.update(dt);
    this.score.update(dt);
    this.shopV.update(dt, this.run.shop);
    for (const v of this.views.values()) v.update(dt);
    this.links.update(dt);
    this.tut.update(dt);
    this.guide.update(dt);
    if (this.tr.open < 1) this.tr.open = Math.min(1, this.tr.open + dt / 0.3);
    if (this.phase === 'arrange' || this.phase === 'receipt') this.enemyFlip = Math.min(1.2, this.enemyFlip + dt / 0.45);
    if (this.phase === 'receipt') this.updateReceipt(dt);
    else if (this.phase === 'toBattle') this.updateToBattle(dt);
    else if (this.phase === 'toArrange') this.updateToArrange(dt);
    this.ac.update(dt);
    this.bc.update(dt, raw);
    if (this.stampT >= 0) {
      this.stampT += dt;
      if (this.stampT > 0.9) this.stampT = -1;
    }
    if (this.detail) {
      this.detail.t = Math.min(1, this.detail.t + dt / 0.15);
      if (clock.real > this.detail.until && !this.ac.drag) this.detail = null;
    }
    if (this.hint) {
      this.hint.t -= dt;
      if (this.hint.t <= 0) this.hint = null;
    } else if (this.hintQ.length && !this.tutBubble()) {
      const id = this.hintQ.shift()!;
      this.showHint(id);
    }
    if (this.undo) {
      this.undo.slide = Math.min(1, this.undo.slide + dt / 0.25);
      if (clock.real > this.undo.until) this.undo = null;
    }
    this.undoB.visible = !!this.undo && this.phase === 'arrange';
    this.undoB.dx = this.undo ? -(1 - ease.outBack(this.undo.slide)) * 100 : 0;
    if (this.undo) this.undoB.sub = this.undo.rec.price + ' 金';
    for (const h of this.heartBreaks) h.t += dt;
    if (this.heartBreaks.length && this.heartBreaks[0].t > 1.3) this.heartBreaks.shift();
    // 按钮状态
    this.fightB.glow += ((hasWeapon(this.run) ? 1 : 0) - this.fightB.glow) * Math.min(1, dt * 4);
    this.fightB.enabled = this.phase === 'arrange' && !(this.tut.arranging && this.tut.step < 4);
    this.skipB.visible = this.tut.arranging;
    this.refreshB.enabled = this.run.gold >= ECONOMY.refreshCost && !(this.tut.arranging && this.tut.step < 4);
    this.lockB.icon = this.run.locked ? 'lock' : 'unlock';
    this.lockB.enabled = !(this.tut.arranging && this.tut.step < 4);
    if (this.phase === 'result') this.contB.alpha = Math.min(1, this.contB.alpha + dt / 0.3);
    this.speedB.visible = this.phase === 'battle' || this.phase === 'toBattle';
    if (this.speedFlip < 1) this.speedFlip = Math.min(1, this.speedFlip + dt / 0.18);
    // 金币飞行
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      c.t += dt / 0.42;
      if (c.t >= 1) {
        this.coins.splice(i, 1);
        if (c.semi >= 0) {
          sfx('coinUp', c.semi);
          if (this.receipt) {
            const r = this.receipt;
            const done = this.coins.filter((x) => x.semi >= 0).length;
            const shownTotal = r.lines.slice(0, r.shown).reduce((a, l) => a + l.amount, 0);
            this.gold.set(done === 0 ? r.from + shownTotal : Math.min(r.from + shownTotal, this.gold.value + 1));
          }
        }
      }
    }
    // 低血量时 HUD 心跳 / 指针样式在 main
  }

  step(h: number): void {
    if (this.paused) return;
    for (const v of this.views.values()) v.step(h);
    this.collapse.step(h);
    this.ac.step(h);
    this.bc.step(h);
  }

  // ---------- 绘制 ----------

  draw(ctx: CanvasRenderingContext2D): void {
    const H = stage.H;
    const real = clock.real;
    const time = this.time;
    const battleish = this.tr.enemy > 0.01;
    if (stage.desktop) {
      setGameTransform(ctx);
      ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
      drawMapFlag(ctx, this.run.round, time);
    }
    // ===== 世界层（全量震屏）=====
    setGameTransform(ctx, shake.x, shake.y, shake.rot);
    if (battleish) {
      this.bc.drawEnemy(ctx, time);
      this.bc.drawBand(ctx, time);
    }
    const g = this.bagRect();
    // 行囊
    const open = ease.outBack(this.tr.open);
    ctx.save();
    if (open < 1) {
      ctx.translate(195, g.y + g.h);
      ctx.scale(1, 0.85 + 0.15 * open);
      ctx.translate(-195, -(g.y + g.h));
    }
    drawPlayerBag(ctx, g, 1 - 0.1 * this.collapse.x);
    this.ac.drawUnder(ctx, g, time);
    const hide = this.ac.hiddenUid();
    for (const v of this.views.values()) if (v.zone === 'bag') v.draw(ctx, g, time, true);
    if (hide && this.ac.drag) {
      const v = this.views.get(hide);
      if (v && v.zone === 'bag') {
        ctx.save();
        ctx.globalAlpha *= 0.2;
        v.hidden = false;
        v.draw(ctx, g, time, false);
        v.hidden = true;
        ctx.restore();
      }
    }
    // 连线：整理时全亮；战斗中变暗，被用到时闪
    const dim = this.phase === 'battle' || this.phase === 'result' || this.phase === 'toBattle' ? 0.32 : 1;
    if (!this.ac.drag || !this.ac.previewing()) this.links.draw(ctx, g, time, dim, hide);
    else this.ac.drawPreviewLinks(ctx, g, time);
    // 号角 / 长弓（整理阶段）
    if (this.phase === 'arrange' || this.phase === 'receipt') {
      for (const h of this.syn.horns) {
        if (h.uid === hide) continue;
        const it = find(this.run, h.uid);
        if (!it || it.zone !== 'bag' || h.cells.length === 0) continue;
        const s = shapeMouth(it);
        if (s) drawHornWaves(ctx, g, s.mouth, s.dir, h.cells, time, 1);
      }
      const sel = this.ac.selectedBow();
      if (sel) {
        const d = this.syn.derived.get(sel);
        if (d && d.emptyCells.length) drawBowDots(ctx, g, d.emptyCells, ITEMS.bow.lv[d.lv - 1].adj ?? 0, time);
      }
    }
    this.bc.drawPlayerOverlay(ctx, g, time);
    ctx.restore();
    // 桌边 + 摊位（整理阶段）
    if (this.tr.shop < 0.99) {
      const L = this.L;
      const out = this.tr.shop;
      const dy = out * 120;
      const a = Math.max(0, 1 - out * 1.3);
      drawStash(ctx, L.stash, L.stashArea, this.ac.stashHi(), time, a, dy);
      if (a > 0.01) {
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(0, dy);
        for (const v of this.views.values()) if (v.zone === 'stash') v.draw(ctx, null, time, true);
        ctx.restore();
      }
      const sm = this.ac.sellInfo();
      this.shopV.sellK.target = sm ? 1 : 0;
      this.shopV.draw(ctx, L, this.run.shop, time, {
        gold: this.run.gold, sell: sm ? sm.price : 0, sellFull: sm ? sm.full : false,
        mergeable: (id) => this.mergeable(id), out, locked: this.run.locked, hover: this.ac.hoverCard,
      });
      if (a > 0.01) {
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(0, dy);
        this.drawRefresh(ctx, time, real);
        this.lockB.draw(ctx, time, real);
        this.fightB.draw(ctx, time, real);
        this.undoB.draw(ctx, time, real);
        if (this.undo) this.drawUndoRing(ctx, real);
        ctx.restore();
      }
    }
    if (this.speedB.visible) this.drawSpeed(ctx, time, real);
    if (this.contB.visible) this.contB.draw(ctx, time, real);
    this.bc.drawEffects(ctx, time);
    drawParticles(ctx, false);
    drawPopups(ctx, false);
    this.drawSpot(ctx, H);
    this.ac.drawTop(ctx, time);
    // ===== HUD 层（40% 震屏）=====
    setGameTransform(ctx, shake.x * 0.4, shake.y * 0.4, shake.rot * 0.4);
    this.drawHud(ctx, time, real);
    this.bc.drawHud(ctx, time);
    this.guide.draw(ctx, time, real);
    this.drawReceipt(ctx);
    this.drawStamp(ctx);
    this.drawBossIntro(ctx, time);
    this.drawHint(ctx);
    drawParticles(ctx, true);
    drawPopups(ctx, true);
    this.drawCoins(ctx);
    // 屏幕效果
    this.bc.drawScreen(ctx);
    setGameTransform(ctx);
    this.ov.draw(ctx, LW, H, time, real);
    drawToast(ctx);
  }

  /** 引导第 1、2 步：其他区域压暗 55%，只在可拿的商店卡和背包处镂空 */
  private spotA = 0;
  private drawSpot(ctx: CanvasRenderingContext2D, H: number): void {
    const t = this.tut;
    const on = this.phase === 'arrange' && t.arranging && (t.step === 1 || t.step === 2) && t.praise <= 0;
    this.spotA += ((on ? 1 : 0) - this.spotA) * Math.min(1, clock.raw * 8);
    if (this.spotA < 0.01) return;
    const want = t.step === 1 ? 'sword' : 'whetstone';
    const L = this.L;
    const g = L.bag;
    ctx.save();
    ctx.fillStyle = `rgba(20,10,4,${(0.55 * this.spotA).toFixed(3)})`;
    ctx.beginPath();
    ctx.rect(-400, -400, LW + 800, H + 800);
    const hole = (x: number, y: number, w: number, h: number, r: number): void => {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x, y, x, y + h, r);
      ctx.arcTo(x, y + h, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x + w, y, r);
      ctx.arcTo(x + w, y, x, y, r);
      ctx.closePath();
    };
    hole(g.gx - 6, g.gy - 6, BAG.cols * g.cell + 12, BAG.rows * g.cell + 12, 10);
    const i = this.run.shop.findIndex((o) => o && o.id === want);
    if (i >= 0) {
      const c = L.cards[i];
      hole(c.x - 4, c.y - 4, c.w + 8, c.h + 8, 8);
    }
    ctx.fill('evenodd');
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const L = this.L;
    this.pauseB.draw(ctx, time, real);
    drawHearts(ctx, L.hearts, this.run.hearts, this.heartBreaks, time, this.bc.lowHp());
    drawRoundTag(ctx, L.roundTag, this.phase === 'result' ? this.battleRound : this.run.round, this.run.attempt, this.score.int, this.score.flash);
    drawGold(ctx, L.gold, this.gold, this.tr.enemy > 0.5 ? 0.75 : 1);
    if (this.tr.enemy < 0.99) {
      ctx.save();
      ctx.globalAlpha *= 1 - this.tr.enemy;
      ctx.translate(0, -this.tr.enemy * 40);
      const showDetail = this.detail && this.phase !== 'toBattle';
      if (showDetail && this.detail) drawDetailBar(ctx, L.enemyCard, this.detail.info, this.detail.t);
      else drawEnemyCard(ctx, L.enemyCard, enemyFor(this.run.round), enemyBag(this.run.round), this.enemyFlip, time);
      ctx.restore();
    }
  }

  private drawRefresh(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const b = this.refreshB;
    b.label = '';
    b.draw(ctx, time, real);
    const r = b.r;
    const s = b.press.x;
    ctx.save();
    ctx.globalAlpha *= b.enabled ? 1 : 0.55;
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(s, s);
    ctx.save();
    ctx.translate(-22, 0);
    ctx.rotate((1 - this.shopV.refreshSpin) * Math.PI * 2 * (this.shopV.refreshSpin > 0 ? 1 : 0));
    text(ctx, '⟳', 0, 1, { size: 20, weight: 900, color: C.ink });
    ctx.restore();
    drawGoldCoin(ctx, 6, 0, 7);
    text(ctx, String(ECONOMY.refreshCost), 22, 1, { size: 18, family: '"Patrick Hand",sans-serif', color: C.ink });
    ctx.restore();
  }

  private drawUndoRing(ctx: CanvasRenderingContext2D, real: number): void {
    const u = this.undo!;
    const r = this.undoB.r;
    const k = Math.max(0, (u.until - real) / (ECONOMY.undoSellMs / 1000));
    ctx.save();
    ctx.translate(this.undoB.dx, 0);
    ctx.strokeStyle = C.goldLight;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(r.x + r.w - 6, r.y + 6, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpeed(ctx: CanvasRenderingContext2D, time: number, real: number): void {
    const b = this.speedB;
    const r = b.r;
    const k = this.speedFlip;
    const sx = Math.abs(Math.cos(k * Math.PI));
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.tr.enemy * 1.5);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.scale(Math.max(0.05, sx), 1);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    b.draw(ctx, time, real);
    ctx.restore();
  }

  private drawReceipt(ctx: CanvasRenderingContext2D): void {
    const r = this.receipt;
    if (!r) return;
    const y = this.receiptY();
    const h = 70 + r.lines.length * 22;
    drawSprite(ctx, receiptPaper(h), 85, y);
    text(ctx, '收 入 账 单', 195, y + 22, { size: 15, weight: 900, color: C.ink, spacing: 2 });
    for (let i = 0; i < r.shown; i++) {
      const l = r.lines[i];
      const ly = y + 52 + i * 22;
      text(ctx, l.label, 103, ly, { size: 13, weight: 700, color: C.inkSoft, align: 'left' });
      text(ctx, '+' + l.amount, 287, ly, { size: 18, family: '"Patrick Hand",sans-serif', color: C.goldDark, align: 'right' });
    }
    ctx.strokeStyle = 'rgba(43,29,20,0.4)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(100, y + h - 22);
    ctx.lineTo(290, y + h - 22);
    ctx.stroke();
    ctx.setLineDash([]);
    if (r.shown >= r.lines.length) text(ctx, '合计 +' + r.total + ' 金', 287, y + h - 9, { size: 14, weight: 900, color: C.ink, align: 'right' });
    text(ctx, '点击跳过', 103, y + h - 9, { size: 10, weight: 700, color: C.pencil, align: 'left' });
  }

  private drawStamp(ctx: CanvasRenderingContext2D): void {
    if (this.stampT < 0) return;
    const t = this.stampT;
    const s = t < 0.15 ? 2 - ease.outCubic(t / 0.15) : 1;
    const a = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.3);
    const sp = seal('战', 44, 5);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(195, stage.H * 0.42);
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    drawSprite(ctx, sp, -44, -44);
    ctx.restore();
  }

  private drawBossIntro(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.bossIntro <= 0) return;
    const t = this.bossIntro;
    const e = enemyFor(this.run.round);
    const a = t < 0.25 ? t / 0.25 : t > 1.4 ? Math.max(0, 1 - (t - 1.4) / 0.25) : 1;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(14,6,2,0.62)';
    ctx.fillRect(-400, -400, LW + 800, stage.H + 800);
    const cy = this.B.band.y + this.B.band.h / 2;
    const drop = t < 0.18 ? (1 - ease.inQuad(t / 0.18)) * -200 : 0;
    ctx.translate(0, drop);
    text(ctx, `第${e.round === 5 ? '五' : '十'}轮 · 首领`, 195, cy - 34, { size: 22, weight: 900, color: C.chalk, spacing: 6 });
    text(ctx, `${e.title} ${e.name}`, 195, cy + 10, { size: 40, weight: 900, color: C.paper, stroke: C.ink, strokeW: 6, spacing: 4 });
    if (t > 0.35) {
      const st = Math.min(1, (t - 0.35) / 0.12);
      drawStamp(ctx, '首领', 300, cy + 40, 18, C.waxLight, -0.25, 1, 2 - st);
    }
    ctx.restore();
    void time;
  }

  private drawHint(ctx: CanvasRenderingContext2D): void {
    const h = this.hint;
    if (!h) return;
    const k = Math.min(1, (3.4 - h.t) / 0.25);
    const a = h.t < 0.3 ? h.t / 0.3 : 1;
    const y = this.phase === 'arrange' || this.phase === 'receipt' ? this.L.bubbleY - 36 : this.B.band.y + this.B.band.h + (this.phase === 'result' ? 42 : 32);
    ctx.save();
    ctx.globalAlpha *= a;
    drawBubble(ctx, '💡 ' + h.s, 195, y, 330, null, k);
    ctx.restore();
  }

  private drawCoins(ctx: CanvasRenderingContext2D): void {
    for (const c of this.coins) {
      if (c.delay > 0) continue;
      const k = ease.inOutQuad(Math.min(1, c.t));
      const x = c.x0 + (c.x1 - c.x0) * k;
      const y = c.y0 + (c.y1 - c.y0) * k - Math.sin(k * Math.PI) * 50;
      drawGoldCoin(ctx, x, y, 7);
    }
  }

  mergeable(id: ItemInst['id']): boolean {
    for (const it of this.run.bag) if (it.id === id && it.lv === 1) return true;
    for (const it of this.run.stash) if (it && it.id === id && it.lv === 1) return true;
    return false;
  }

  // ---------- 输入 ----------

  private hudButtons(): Button[] {
    const out: Button[] = [this.pauseB];
    if (this.phase === 'arrange') {
      out.push(this.fightB, this.refreshB, this.lockB);
      if (this.undoB.visible) out.push(this.undoB);
      if (this.skipB.visible) out.push(this.skipB);
      if (this.nextB.visible) out.push(this.nextB);
    }
    if (this.speedB.visible && this.phase === 'battle') out.push(this.speedB);
    if (this.phase === 'result' && this.contB.visible && this.contB.alpha > 0.5) out.push(this.contB);
    return out;
  }

  private activate(b: Button): void {
    const real = clock.real;
    if (b === this.pauseB) this.openPause();
    else if (b === this.fightB) this.tryFight();
    else if (b === this.contB) this.continueFromResult();
    else if (b === this.speedB) this.cycleSpeed();
    else if (b === this.skipB) {
      markTutorialDone();
      this.tut.stop();
      showToast('已跳过引导', 195, this.L.bubbleY - 20);
    } else if (b === this.nextB) {
      if (this.tut.step === 3) this.tut.go(4);
    } else if (b === this.refreshB) {
      if (real - this.lastRefresh < 0.25) return;
      this.lastRefresh = real;
      if (refresh(this.run)) {
        this.shopV.flipAll();
        this.shopV.setLocked(false);
        this.gold.set(this.run.gold);
        sfx('shuffle');
        this.flyCoins(b.r.x + 20, b.r.y + 16, 1, false);
      } else {
        sfx('noGold');
        this.gold.flash = -0.45;
        this.showHint('sell');
      }
    } else if (b === this.lockB) {
      this.run.locked = !this.run.locked;
      this.shopV.setLocked(this.run.locked);
      sfx('lock');
      showToast(this.run.locked ? '已锁定：下轮保留这些货品' : '已解锁', 195, this.L.shop.y - 14);
    } else if (b === this.undoB) this.doUndo();
  }

  cycleSpeed(): void {
    const sp = [1, 2, 4];
    const i = sp.indexOf(this.bc.speed);
    this.setSpeed(sp[(i + 1) % sp.length]);
  }

  setSpeed(s: number): void {
    this.bc.speed = s;
    this.speedB.label = s + '×';
    this.speedFlip = 0;
    au.fast = s >= 4;
    sfx('speed', s);
  }

  doUndo(): void {
    const u = this.undo;
    if (!u || this.phase !== 'arrange') return;
    const r = undoSell(this.run, u.rec);
    if (!r.ok) {
      showToast(r.reason, 195, this.L.fight.y - 20, C.bad);
      sfx('noGold');
      return;
    }
    this.undo = null;
    this.gold.set(this.run.gold);
    sfx('undo');
    // 从摊位飞回
    const it = find(this.run, r.uid);
    if (it) {
      const v = new ItemView(it);
      this.views.set(it.uid, v);
      const L = this.L;
      const cx = L.shop.x + L.shop.w / 2;
      const cy = L.shop.y + L.shop.h / 2;
      if (it.zone === 'bag') {
        const g = this.bagRect();
        const [w, h] = v.dims();
        v.pos.snap((cx - g.gx) / g.cell - w / 2, (cy - g.gy) / g.cell - h / 2);
      } else {
        v.pos.snap(cx, cy);
        v.cell.snap(10);
      }
      v.pos.set(18, 0.75);
      v.scale.x = 0.4;
      v.squashPending = true;
    }
    this.syncViews(false);
    this.recompute(true);
  }

  private makeHandler(): InputHandler {
    return {
      down: (x, y) => {
        if (this.ov.active) {
          this.ov.top!.down(x, y);
          return;
        }
        if (this.phase === 'receipt') {
          this.endReceipt();
          return;
        }
        for (const b of this.hudButtons()) {
          if (b.enabled && b.hit(x, y)) {
            b.down();
            this.pressed = b;
            sfx('click');
            return;
          }
        }
        if (inRect(this.L.roundTag, x, y)) {
          this.pressedHud = 'round';
          return;
        }
        if (this.phase === 'arrange' && inRect(this.L.enemyCard, x, y) && !this.detail) {
          this.pressedHud = 'enemy';
          return;
        }
        if (this.phase === 'arrange') this.ac.down(x, y);
      },
      dragStart: (x, y) => {
        if (this.ov.active) {
          const t = this.ov.top!;
          if (t instanceof DetailPanel && t.o.peek) {
            t.close();
            if (this.phase === 'arrange') this.ac.dragStart(x, y);
          }
          return;
        }
        if (this.pressed || this.pressedHud) return;
        if (this.phase === 'arrange') this.ac.dragStart(x, y);
      },
      drag: (x, y) => {
        if (this.ov.active) return;
        if (this.phase === 'arrange') this.ac.dragMove(x, y);
      },
      up: (x, y, tap) => {
        if (this.ov.active) {
          const t = this.ov.top!;
          if (t instanceof DetailPanel && t.o.peek) {
            t.close();
            this.ac.cancelPress();
            return;
          }
          t.up(x, y, tap, clock.real);
          if (t instanceof PausePanel && t.closing) this.paused = false;
          return;
        }
        const b = this.pressed;
        this.pressed = null;
        if (b) {
          b.release();
          if (b.hit(x, y, 10)) this.activate(b);
          return;
        }
        const ph = this.pressedHud;
        this.pressedHud = null;
        if (ph && tap) {
          if (ph === 'round') this.ov.open(new RoutePanel(this.run.round, this.run.round - 1));
          else if (ph === 'enemy') this.ov.open(new DrawerPanel(this.L.drawer, enemyFor(this.run.round), this.run.round));
          return;
        }
        if (this.phase === 'arrange') this.ac.up(x, y, tap);
        else if (this.phase === 'battle' || this.phase === 'result') {
          if (tap) this.bc.tapAt(x, y);
        }
      },
      long: (x, y) => {
        if (this.ov.active || this.pressed) return;
        if (this.phase === 'arrange') this.ac.long(x, y);
      },
      cancel: () => {
        if (this.pressed) this.pressed.release();
        this.pressed = null;
        this.pressedHud = null;
        if (this.ov.active) this.ov.top!.cancel();
        this.ac.cancel();
      },
      rotate: () => {
        if (this.ov.active) return;
        if (this.phase === 'arrange') this.ac.rotate();
      },
      hover: (x, y) => {
        for (const b of this.hudButtons()) b.hover = b.hit(x, y);
        if (this.phase === 'arrange' && !this.ov.active) this.ac.hover(x, y);
      },
      key: (code) => {
        if (this.ov.active) {
          const t = this.ov.top!;
          t.key(code);
          if (t instanceof PausePanel && t.closing) this.paused = false;
          return;
        }
        if (code === 'Escape') {
          if (this.ac.drag) this.ac.cancel();
          else this.openPause();
        } else if (code === 'Space' || code === 'Enter') {
          if (this.phase === 'arrange') this.tryFight();
          else if (this.phase === 'result') this.continueFromResult();
          else if (this.phase === 'receipt') this.endReceipt();
        } else if (code === 'KeyR') {
          if (this.phase === 'arrange') this.ac.rotate();
        } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
          if (this.phase === 'battle' || this.phase === 'toBattle') this.setSpeed([1, 2, 4][Number(code.slice(5)) - 1]);
        }
      },
      wheel: () => {
        if (this.ov.active) return;
        if (this.phase === 'arrange') this.ac.rotate();
      },
    };
  }

  cursor(x: number, y: number): string {
    if (this.ov.active) return 'default';
    if (this.ac.drag) return 'grabbing';
    for (const b of this.hudButtons()) if (b.enabled && b.hit(x, y)) return 'pointer';
    if (this.phase === 'arrange') {
      if (inRect(this.L.enemyCard, x, y) || inRect(this.L.roundTag, x, y)) return 'pointer';
      if (this.ac.pickableAt(x, y)) return 'grab';
    }
    return 'default';
  }

  // ---------- 调试 / 测试接口 ----------

  ui(): UiEl[] {
    const out: UiEl[] = [];
    if (this.ov.active) return this.ov.els();
    for (const b of this.hudButtons()) out.push(b.el());
    if (this.phase === 'arrange') {
      const L = this.L;
      L.cards.forEach((r, i) => out.push({ id: 'shop.' + i, x: r.x, y: r.y, w: r.w, h: r.h, enabled: !!this.run.shop[i]?.id }));
      L.stash.forEach((r, i) => out.push({ id: 'stash.' + i, x: r.x, y: r.y, w: r.w, h: r.h, enabled: true }));
      out.push({ id: 'enemyCard', ...L.enemyCard, enabled: true });
    }
    out.push({ id: 'roundTag', ...this.L.roundTag, enabled: true });
    return out;
  }

  /** 逻辑矩形 → CSS 像素 */
  css(r: Rect): Rect {
    return rectCss(r.x, r.y, r.w, r.h);
  }

  itemRect(uid: number): Rect | null {
    const v = this.views.get(uid);
    if (!v) return null;
    if (v.zone === 'bag') {
      const g = this.bagRect();
      const it = find(this.run, uid);
      if (!it) return null;
      const [w, h] = v.dims();
      return { x: g.gx + it.x * g.cell, y: g.gy + it.y * g.cell, w: w * g.cell, h: h * g.cell };
    }
    v.center(null, TMPP);
    const [w, h] = v.dims();
    const c = v.cell.target;
    return { x: TMPP.x - (w * c) / 2, y: TMPP.y - (h * c) / 2, w: w * c, h: h * c };
  }

  /** 调试：全量重建视图 */
  rebuild(): void {
    this.views.clear();
    this.syncViews(true);
    this.recompute(false);
    this.gold.set(this.run.gold, true);
    this.score.set(this.run.score, true);
    this.shopV.setInstant(this.run.shop);
  }

  /** 调试：直接进入某轮整理 */
  gotoRoundDirect(n: number): void {
    this.ac.reset();
    this.ov.closeAll();
    this.paused = false;
    this.bc.leave();
    this.tr.bag = this.tr.shop = this.tr.enemy = 0;
    this.collapse.snap(0);
    this.receipt = null;
    this.outcome = null;
    this.contB.visible = false;
    this.run.round = n;
    this.run.attempt = 1;
    this.run.phase = 'result';
    this.run.lastResult = null;
    this.run.locked = false;
    beginArrange(this.run);
    this.phase = 'arrange';
    this.enemyFlip = 0;
    this.rebuild();
    this.tut.stop();
    setMusic('arrange');
  }

  sellRecord(rec: SellRecord): void {
    this.undo = { rec, until: clock.real + ECONOMY.undoSellMs / 1000, slide: 0 };
  }

  sellPriceOf(it: ItemInst): number {
    return sellValue(this.run, it);
  }

  openDetail(o: ConstructorParameters<typeof DetailPanel>[1]): void {
    this.ov.open(new DetailPanel(stage.H, o, (slot, merge) => this.ac.quickBuy(slot, merge)));
  }

  /** 输入状态（调试） */
  inputState(): { dragging: boolean } {
    return { dragging: input.dragging };
  }
}

function shapeMouth(it: ItemInst): { mouth: [number, number]; dir: [number, number] } | null {
  const def = ITEMS[it.id];
  if (!def.mouth || !def.tail) return null;
  let m: [number, number] = [def.mouth[0], def.mouth[1]];
  let t: [number, number] = [def.tail[0], def.tail[1]];
  let h = def.shape.length;
  let w = def.shape[0].length;
  for (let i = 0; i < it.rot; i++) {
    m = [h - 1 - m[1], m[0]];
    t = [h - 1 - t[1], t[0]];
    const tmp = w;
    w = h;
    h = tmp;
  }
  return { mouth: [it.x + m[0], it.y + m[1]], dir: [m[0] - t[0], m[1] - t[1]] };
}

const receiptCache = new Map<number, ReturnType<typeof receiptSprite>>();
function receiptPaper(h: number) {
  let s = receiptCache.get(h);
  if (!s || s.ver !== stage.version) {
    s = receiptSprite(h);
    receiptCache.set(h, s);
  }
  return s.sp;
}
import { paper } from '../render/kit.ts';
function receiptSprite(h: number) {
  return { sp: paper('receipt', 220, h, { seed: 61, burn: 0.7, r: 3 }), ver: stage.version };
}

export type { Rot };
