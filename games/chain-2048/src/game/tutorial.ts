/**
 * 首局引导（docs §6.3）：T1 合成 → T2 连锁+金印 → T3 交换 → T4 压力。纯逻辑 + UI 回调，不碰 DOM。
 */
import type { Session } from './session.ts';

export interface TutorialUI {
  /** low = 放到底部提示条位置（链条滚入时不挡顶部轨道） */
  card(html: string | null, low?: boolean): void;
  handDrag(x0: number, y0: number, x1: number, y1: number): void;
  handTap(x: number, y: number): void;
  handOff(): void;
  highlightBall(id: number): void;
  highlightTotem(on: boolean): void;
  highlightSeal(on: boolean): void;
  /** 金蛇口闪烁 + 进度条高亮 */
  flashMouth(): void;
  /** 链条回缩的箭头提示（沿轨道） */
  shrinkArrow(): void;
  /** 打偏后复位时的视觉 */
  resetPuff(): void;
  /** 自动帮玩家发射 */
  autoFire(angle: number): void;
  done(): void;
}

type Step = 'off' | 'T1' | 'T1f' | 'T2' | 'T2f' | 'T3' | 'T3b' | 'T4';

interface Layout {
  levels: number[];
  head: number;
  cur: number;
  next: number;
  /** 目标珠下标（从链头数） */
  target: number;
}

const LAYOUT: Record<'T1' | 'T2' | 'T3', Layout> = {
  // 链头 → 链尾；轨道 A 下边（图腾右下方）
  T1: { levels: [4, 1, 3], head: 1060, cur: 1, next: 3, target: 1 },
  // 轨道 A 右边（图腾右侧）
  T2: { levels: [5, 4, 3, 2], head: 880, cur: 2, next: 2, target: 3 },
  T3: { levels: [3, 1, 4], head: 1060, cur: 2, next: 1, target: 1 },
};

const TEXT = {
  T1: '按住瞄准，松手发射<br>把 <b>2</b> 射到 <b>2</b> 旁边',
  miss: '差一点！<br>幽灵珠旁出现 <b>＝</b> 再松手',
  T1f: '相同数字 → 合成翻倍<br>链条被吸回、变短',
  T2: '合成后又相同，会接着合成<br>——打出连锁！',
  T2f: '凑出 <b>64</b> = 金印！<br>封印即消除，还会震退链条',
  T3: '手里的 <b>4</b> 没有搭档<br>点一下<b>图腾</b>换球',
  T3b: '好！现在把 <b>2</b><br>射到 <b>2</b> 旁边',
};

/** T4 文案：按实际剩余配额生成（docs §6.3；阶段 3 修正硬编码） */
export function t4Text(left: number, credited: boolean): string {
  const head = '链头进入<b>金蛇口</b>就失败';
  return credited ? `${head}<br>引导的金印已计入，再封印 <b>${left}</b> 枚过关` : `${head}<br>封印 <b>${left}</b> 枚金印就过关！`;
}

export class Tutorial {
  step: Step = 'off';
  private s: Session;
  private ui: TutorialUI;
  private t = 0;
  private fails = 0;
  private resetT = -1;
  private shotCid = -1;
  private merged = false;
  private sealed = false;
  private offs: Array<() => void> = [];
  /** 走完了 T1–T3（而非跳过） */
  private completed = false;

  constructor(s: Session, ui: TutorialUI) {
    this.s = s;
    this.ui = ui;
  }

  get active(): boolean {
    return this.step !== 'off';
  }

  /** 阶段编号（state() 用）：0 = 无 */
  get index(): number {
    return ['off', 'T1', 'T1f', 'T2', 'T2f', 'T3', 'T3b', 'T4'].indexOf(this.step);
  }

  start(): void {
    this.stop();
    const s = this.s;
    s.newRun(1);
    s.tutorial = true;
    this.completed = false;
    s.phase = 'live';
    s.failEnabled = false;
    s.ammo.locked = true;
    s.chain.spawning = false;
    const b = s.bus;
    this.offs.push(
      b.on('fired', (e) => {
        this.shotCid = e.p.cid;
        this.merged = false;
        this.ui.handOff();
        if (this.step === 'T4') this.finish();
      }),
      b.on('merged', (e) => {
        if (e.cid === this.shotCid) this.merged = true;
      }),
      b.on('sealed', () => {
        this.sealed = true;
      }),
      b.on('cascadeEnd', (e) => {
        if (e.cid !== this.shotCid) return;
        this.onShotDone(e.steps);
      }),
      b.on('miss', (e) => {
        if (e.p.cid === this.shotCid) this.onShotDone(0);
      }),
      b.on('swapped', () => {
        if (this.step === 'T3' && s.ammo.current === 1) this.enter('T3b');
        else if (this.step === 'T3b' && s.ammo.current !== 1) this.enter('T3');
      }),
    );
    this.enter('T1');
  }

  stop(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    if (this.step !== 'off') {
      this.ui.card(null);
      this.ui.handOff();
      this.ui.highlightBall(-1);
      this.ui.highlightTotem(false);
      this.ui.highlightSeal(false);
    }
    this.step = 'off';
    this.s.failEnabled = true;
    this.s.ammo.locked = false;
    this.s.tutorial = false;
  }

  /** 跳过：直接进入 T4 的正式第 1 关 */
  skip(): void {
    if (!this.active) return;
    this.completed = false;
    this.enter('T4');
    this.finish();
  }

  private layout(k: 'T1' | 'T2' | 'T3'): void {
    const s = this.s;
    const L = LAYOUT[k];
    s.chain.mode = 'frozenTutorial';
    s.chain.spawning = false;
    s.chain.freeze = 0;
    s.chain.setLevels(L.levels, L.head);
    s.ammo.current = L.cur;
    s.ammo.next = L.next;
    s.ammo.armed = false;
    s.projectiles.forEach((p) => (p.alive = false));
    this.resetT = -1;
    this.shotCid = -1;
    this.pointAt(L.target);
  }

  private pointAt(index: number): void {
    const s = this.s;
    const b = s.chain.balls[index];
    if (!b) return;
    const p = s.track.posAt(b.s);
    const tx = s.totemX, ty = s.totemY;
    // 手指停在图腾和目标之间（70%），不压住目标
    this.ui.handDrag(tx, ty, tx + (p.x - tx) * 0.7, ty + (p.y - ty) * 0.7);
    this.ui.highlightBall(b.id);
  }

  private enter(step: Step): void {
    this.step = step;
    this.t = 0;
    const s = this.s;
    this.ui.highlightTotem(false);
    this.ui.highlightBall(-1);
    switch (step) {
      case 'T1':
        this.fails = 0;
        this.layout('T1');
        this.ui.card(TEXT.T1);
        break;
      case 'T1f':
        this.ui.card(TEXT.T1f);
        this.ui.handOff();
        this.ui.shrinkArrow();
        break;
      case 'T2':
        this.fails = 0;
        this.sealed = false;
        this.layout('T2');
        this.ui.card(TEXT.T2);
        this.ui.highlightSeal(true);
        break;
      case 'T2f':
        this.ui.card(TEXT.T2f);
        this.ui.handOff();
        break;
      case 'T3':
        this.fails = 0;
        if (s.chain.balls.length !== 3 || s.ammo.current !== 2) this.layout('T3');
        this.ui.card(TEXT.T3);
        this.ui.handTap(s.totemX, s.totemY);
        this.ui.highlightTotem(true);
        this.ui.highlightBall(-1);
        break;
      case 'T3b':
        this.ui.card(TEXT.T3b);
        this.pointAt(1);
        break;
      case 'T4': {
        this.ui.highlightSeal(false);
        this.ui.handOff();
        s.ammo.locked = false;
        s.failEnabled = true;
        s.tutorial = false;
        s.startStage(1, false);
        // 完成引导：T2 的金印计入 1 枚；跳过引导不送（docs §11.7）
        const credit = this.completed ? 1 : 0;
        s.seals = credit;
        s.bus.emit('sealCount', { seals: credit, quota: s.cfg.quota });
        this.ui.card(t4Text(s.cfg.quota - credit, credit > 0), true);
        this.ui.done();
        this.ui.flashMouth();
        break;
      }
      default:
        break;
    }
  }

  private onShotDone(steps: number): void {
    const st = this.step;
    if (st !== 'T1' && st !== 'T2' && st !== 'T3' && st !== 'T3b') return;
    const okShot = st === 'T2' ? this.sealed || steps >= 4 : st === 'T3' ? false : this.merged || steps > 0;
    if (okShot) {
      if (st === 'T1') this.enter('T1f');
      else if (st === 'T2') this.later('T2f', 0.4);
      else {
        this.completed = true;
        this.enter('T4');
      }
      return;
    }
    this.fails++;
    this.ui.card(st === 'T3' ? TEXT.T3 : TEXT.miss);
    this.resetT = 0.6;
  }

  private pendingStep: Step | null = null;
  private pendingT = 0;

  private later(step: Step, d: number): void {
    this.pendingStep = step;
    this.pendingT = d;
  }

  private finish(): void {
    this.ui.done();
    // T4 卡片保留 3 s 后由 update 收起
  }

  update(dt: number): void {
    if (this.step === 'off') return;
    this.t += dt;
    if (this.pendingStep) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) {
        const p = this.pendingStep;
        this.pendingStep = null;
        this.enter(p);
      }
      return;
    }
    if (this.resetT >= 0) {
      this.resetT -= dt;
      if (this.resetT < 0) {
        const st = this.step;
        const key = st === 'T3b' ? 'T3' : (st as 'T1' | 'T2' | 'T3');
        this.ui.resetPuff();
        this.layout(key);
        if (st === 'T3b' || st === 'T3') {
          this.step = 'T3';
          this.ui.card(TEXT.T3);
          this.ui.handTap(this.s.totemX, this.s.totemY);
          this.ui.highlightTotem(true);
          this.ui.highlightBall(-1);
        } else this.ui.card(this.fails > 0 ? TEXT.miss : TEXT[key]);
        // 3 次失败：自动帮一次
        if (this.fails >= 3 && (st === 'T1' || st === 'T2')) {
          const a = this.s.angleFor(LAYOUT[st].target, 1);
          if (a !== null) this.ui.autoFire(a);
        }
      }
      return;
    }
    switch (this.step) {
      case 'T1f':
        if (this.t > 1.6) this.enter('T2');
        break;
      case 'T2f':
        if (this.t > 2.0) this.enter('T3');
        break;
      case 'T4':
        if (this.t > 3) {
          this.finish();
          this.stop();
        }
        break;
      default:
        break;
    }
  }
}
