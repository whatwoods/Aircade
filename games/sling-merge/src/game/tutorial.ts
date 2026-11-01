/**
 * 首局引导（docs §6.3）：逐步脚本，全部在操作中教；外加只出现一次的情境提示。
 * 只改状态/发事件，卡片 DOM 由 ui/tutorialCard.ts 读取 card 字段渲染。
 */
import { CONFIG, fruitDef } from '../config';
import { bus } from '../core/events';
import { load, save } from '../core/storage';
import type { Fruit } from './fruits';
import type { Game } from './game';

/** 引导步骤：T0a 拉弓 / T0b 瞄准 / T0c 发射 / T0 反馈 / T1 连锁 / T2 警戒线 / T3 进阶 */
export const Step = {
  None: -1,
  Pull: 0,
  Aim: 1,
  Fire: 2,
  MergeInfo: 3,
  Chain: 4,
  Line: 5,
  Go: 6,
} as const;
export type Step = (typeof Step)[keyof typeof Step];

export interface TutorialCard {
  text: string;
  /** 卡片附件：手势小手 / 箭头指向警戒线 / 3·2·1 迷你演示 */
  hand: boolean;
  arrow: boolean;
  demo: boolean;
  gold: boolean;
  /** 卡片版本号，UI 变化时才重写 DOM */
  rev: number;
}

const TEXT = {
  pull: '按住屏幕，向下拉弹弓',
  aim: '调整方向，让预测线碰到樱桃',
  fire: '松手发射！',
  retry: '差一点～再来一次',
  merged: '相同的水果碰在一起，\n会合成更大的水果！',
  chain: '新水果还能接着合成，试试连击！',
  combo: '连击！短时间内连续合成，得分翻倍',
  comboRetry: '再试一次：让新水果碰到旁边的青提',
  comboSkip: '连击就是接连合成，开局后再试试吧',
  line: '水果越过这条线\n超过 3 秒，游戏就结束啦',
  go: '用力拉能撞散水果，还能借墙反弹。\n开始挑战吧！',
};

export const TIP = {
  bounce: 1,
  danger: 2,
} as const;

export class Tutorial {
  active = false;
  step: Step = Step.None;
  card: TutorialCard = { text: '', hand: false, arrow: false, demo: false, gold: false, rev: 0 };
  cardVisible = false;
  /** 警戒线红闪（T2），剩余秒数 */
  lineFlashT = 0;
  /** 进化链某格闪一下（等级，0 = 无） */
  chainFlashLevel = 0;
  chainFlashT = 0;
  target: Fruit | null = null;
  partner: Fruit | null = null;
  private t = 0;
  private misses = 0;
  private launchT = -1;
  private mergedInT1 = false;
  private chainTries = 0;
  private t1FirstMergeT = -1;
  private holdT = 0;
  private holdNext: Step = Step.None;
  private tipsMask = 0;

  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.tipsMask = Number(load('tips') ?? 0) | 0;
  }

  // ───────────── 生命周期 ─────────────

  start(): void {
    const g = this.game;
    this.active = true;
    this.misses = 0;
    this.launchT = -1;
    this.mergedInT1 = false;
    this.chainTries = 0;
    this.t1FirstMergeT = -1;
    this.holdT = 0;
    this.lineFlashT = 0;
    this.chainFlashT = 0;
    // T0 布置：一颗樱桃顶在盖子下 (250,145)
    const inner = CONFIG.layout.jar.inner;
    const r2 = fruitDef(2).radius;
    const cherry = g.spawnFruit(2, 250, inner.T + r2);
    cherry.tutorialTarget = true;
    this.target = cherry;
    this.partner = null;
    g.sling.loaded = 2;
    g.setNext(2);
    this.go(Step.Pull);
  }

  stop(): void {
    if (this.target) this.target.tutorialTarget = false;
    if (this.partner) this.partner.tutorialTarget = false;
    this.active = false;
    this.step = Step.None;
    this.target = null;
    this.partner = null;
    this.cardVisible = false;
    this.holdT = 0;
    this.card.rev++;
  }

  /** 玩家点「跳过引导」 */
  skip(): void {
    if (!this.active) return;
    this.game.saveTutorialDone();
    this.stop();
    bus.emit({ t: 'tutorial', step: -1 });
  }

  /** 调试：跳到某一步 */
  jump(step: number): void {
    if (!this.active) this.start();
    const s = Math.max(Step.Pull, Math.min(Step.Go, step | 0)) as Step;
    if (s >= Step.Chain) this.setupChain(true);
    this.go(s);
  }

  private go(s: Step): void {
    this.step = s;
    this.t = 0;
    const c = this.card;
    c.hand = false;
    c.arrow = false;
    c.demo = false;
    c.gold = false;
    this.cardVisible = true;
    switch (s) {
      case Step.Pull:
        c.text = TEXT.pull;
        c.hand = true;
        break;
      case Step.Aim:
        c.text = TEXT.aim;
        break;
      case Step.Fire:
        c.text = TEXT.fire;
        c.gold = true;
        break;
      case Step.MergeInfo:
        c.text = TEXT.merged;
        this.chainFlashLevel = 3;
        this.chainFlashT = 1.2;
        break;
      case Step.Chain:
        c.text = TEXT.chain;
        break;
      case Step.Line:
        c.text = TEXT.line;
        c.arrow = true;
        c.demo = true;
        this.lineFlashT = 1.8;
        break;
      case Step.Go:
        c.text = TEXT.go;
        this.game.saveTutorialDone();
        bus.emit({ t: 'banner', text: '开始挑战！', kind: 'pink' });
        break;
      default:
        this.cardVisible = false;
    }
    c.rev++;
    bus.emit({ t: 'tutorial', step: s });
  }

  private say(text: string, gold = false): void {
    const c = this.card;
    if (c.text === text && c.gold === gold) return;
    c.text = text;
    c.gold = gold;
    c.hand = false;
    c.rev++;
  }

  /** 显示一条临时文案 dur 秒，之后进入 next 步 */
  private hold(text: string, dur: number, next: Step): void {
    this.say(text);
    this.holdT = dur;
    this.holdNext = next;
  }

  // ───────────── 装填控制 ─────────────

  /** 跳进「下一个」泡泡的新果（返回 null = 正常随机） */
  forcedNext(): number | null {
    if (!this.active) return null;
    if (this.step <= Step.Chain) return 2;
    return null;
  }

  /** T1 第一次合成出青提时，返回等待中的青提（新果直奔它，冲击波不推它） */
  chainAssist(level: number): Fruit | null {
    if (!this.active || this.step !== Step.Chain || level !== 3 || this.mergedInT1) return null;
    const G = this.grape;
    return G && G.body.alive && G.state !== 'popping' ? G : null;
  }

  forcedLoad(): number | null {
    return null;
  }

  // ───────────── 事件 ─────────────

  onLaunch(): void {
    if (!this.active) return;
    this.launchT = 0;
    if (this.step === Step.Line && this.t > 0.6) this.go(Step.Go);
  }

  onMerge(level: number, combo: number): void {
    if (!this.active) return;
    const s = this.step;
    if (s <= Step.Fire) {
      if (level >= 3) {
        if (this.target) this.target.tutorialTarget = false;
        this.target = null;
        this.holdT = 0;
        this.go(Step.MergeInfo);
      }
      return;
    }
    if (s === Step.Chain) {
      if (combo >= 2) {
        this.clearPartner();
        this.hold(TEXT.combo, 2.0, Step.Line);
      } else if (!this.mergedInT1) {
        this.mergedInT1 = true;
        this.t1FirstMergeT = 0;
      }
    }
  }

  // ───────────── 帧更新（固定步） ─────────────

  update(dt: number): void {
    if (this.chainFlashT > 0) this.chainFlashT = Math.max(0, this.chainFlashT - dt);
    if (this.lineFlashT > 0) this.lineFlashT = Math.max(0, this.lineFlashT - dt);
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    if (this.launchT >= 0) this.launchT += dt;

    if (this.holdT > 0) {
      this.holdT -= dt;
      if (this.holdT <= 0) {
        this.holdT = 0;
        const n = this.holdNext;
        if (n === Step.Pull) {
          // 失败重试：回到当前的瞄准阶段文案
          this.go(g.sling.aiming ? Step.Aim : Step.Pull);
        } else {
          this.go(n);
        }
      }
      this.decorate();
      return;
    }

    switch (this.step) {
      case Step.Pull:
        if (g.sling.aiming && g.sling.power > 0.02) this.go(Step.Aim);
        else this.checkMiss();
        break;
      case Step.Aim:
        if (g.predictionOn && g.predictTarget === this.target && this.target) this.go(Step.Fire);
        else this.checkMiss();
        break;
      case Step.Fire:
        if (this.launchT < 0 && (!g.predictionOn || g.predictTarget !== this.target)) {
          // 瞄偏了：退回瞄准文案
          if (g.sling.aiming) this.go(Step.Aim);
        } else {
          this.checkMiss();
        }
        break;
      case Step.MergeInfo:
        if (this.t >= 2.2) {
          this.setupChain(false);
          this.go(Step.Chain);
        }
        break;
      case Step.Chain:
        if (this.mergedInT1 && this.t1FirstMergeT >= 0) {
          this.t1FirstMergeT += dt;
          if (this.t1FirstMergeT > 2.0) {
            this.t1FirstMergeT = -1;
            if (this.chainTries < 1) {
              // 连锁没接上：重新布置一次，用中性的文案再试
              this.chainTries++;
              this.setupChain(true);
              this.hold(TEXT.comboRetry, 1.8, Step.Chain);
            } else {
              this.clearPartner();
              this.hold(TEXT.comboSkip, 2.0, Step.Line);
            }
          }
        }
        // 兜底：伙伴不在了（比如被别的合成吃掉）又没有合成，重新布置
        if (!this.mergedInT1 && this.partner && !this.partner.body.alive) this.setupChain(true);
        break;
      case Step.Line:
        if (this.t >= 3) this.go(Step.Go);
        break;
      case Step.Go:
        if (this.t >= 2.5) {
          this.active = false;
          this.step = Step.None;
          this.cardVisible = false;
          this.card.rev++;
          bus.emit({ t: 'tutorial', step: -1 });
        }
        break;
      default:
        break;
    }
    this.decorate();
  }

  /** T0 的发射后 1.5 s 没合成 → 再来一次；3 次都失败直接进 T1 */
  private checkMiss(): void {
    if (this.launchT < 1.5) return;
    this.launchT = -1;
    this.misses++;
    if (this.misses >= 3) {
      if (this.target) this.target.tutorialTarget = false;
      this.target = null;
      this.setupChain(true);
      this.go(Step.Chain);
      return;
    }
    // 目标若被挤走，重新指定一颗樱桃
    if (!this.target || !this.target.body.alive) {
      this.target = null;
      for (const f of this.game.fruits) if (f.level === 2 && f.state === 'active') this.target = f;
      if (!this.target) {
        const r2 = fruitDef(2).radius;
        const spot = this.game.findFreeSpot(r2);
        this.target = this.game.spawnFruit(2, spot.x, spot.y);
        this.target.vis.flash = 1;
      }
      this.target.tutorialTarget = true;
    }
    bus.emit({ t: 'tutorialFail', text: TEXT.retry });
    this.hold(TEXT.retry, 1.6, Step.Pull);
  }

  /** T1 布置：确保罐顶有青提 G，并在其旁边紧贴补一颗樱桃 C */
  private setupChain(force: boolean): void {
    const g = this.game;
    const inner = CONFIG.layout.jar.inner;
    let G: Fruit | null = null;
    for (const f of g.fruits) {
      if (f.level === 3 && f.state === 'active' && (!G || f.body.y < G.body.y)) G = f;
    }
    const r3 = fruitDef(3).radius;
    const r2 = fruitDef(2).radius;
    if (!G) {
      G = g.spawnFruit(3, 250, inner.T + r3);
      G.vis.flash = 1;
    }
    if (this.partner && this.partner.body.alive && !force) return;
    const gap = r3 + r2 + 0.6;
    const left = G.body.x - gap >= inner.L + r2 + 2;
    const cx = left ? G.body.x - gap : G.body.x + gap;
    const cy = inner.T + r2;
    // 避免和已有水果重叠
    for (const f of g.fruits) {
      if (f === G) continue;
      const dx = f.body.x - cx;
      const dy = f.body.y - cy;
      const lim = f.body.r + r2;
      if (dx * dx + dy * dy < lim * lim) {
        g.world.wake(f.body);
        f.body.vy += 120;
        f.body.vx += dx >= 0 ? 80 : -80;
      }
    }
    const C = g.spawnFruit(2, cx, cy);
    C.vis.flash = 1;
    C.tutorialTarget = true;
    this.partner = C;
    this.target = C;
    g.world.wake(G.body);
    G.tutorialTarget = false;
    this.grape = G;
    this.mergedInT1 = false;
    this.t1FirstMergeT = -1;
    if (g.sling.loaded === null && g.sling.hopT < 0) g.setLoaded(2);
    else if (g.sling.loaded !== null) g.sling.loaded = 2;
    g.setNext(2);
  }

  private grape: Fruit | null = null;

  private clearPartner(): void {
    if (this.partner) this.partner.tutorialTarget = false;
    this.partner = null;
    this.target = null;
    this.grape = null;
  }

  /** 每步刷新目标的期待表情（看向弹弓 / 看向伙伴） */
  private decorate(): void {
    const P = CONFIG.layout.sling.pouch;
    const tg = this.target;
    if (tg && tg.body.alive && this.step <= Step.Fire) {
      tg.vis.kiss = true;
      tg.vis.kissX = P.x;
      tg.vis.kissY = P.y;
    }
    if (this.step === Step.Chain && this.grape && this.grape.body.alive && this.partner && this.partner.body.alive) {
      const G = this.grape;
      G.vis.kiss = true;
      G.vis.kissX = this.partner.body.x;
      G.vis.kissY = this.partner.body.y;
    }
  }

  // ───────────── 情境提示 ─────────────

  tip(id: number, text: string, x: number, y: number): void {
    if (this.tipsMask & id) return;
    this.tipsMask |= id;
    save('tips', String(this.tipsMask));
    bus.emit({ t: 'tip', id, text, x, y });
  }

  resetTips(): void {
    this.tipsMask = 0;
  }
}
