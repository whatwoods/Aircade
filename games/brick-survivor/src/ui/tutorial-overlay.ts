// First-run tutorial overlay (docs §6.3): one hint bubble at a time (≤ 18 chars), tick on step completion,
// finger demo for T0, skip button. Drives the WebGL guide line (T1) and the highlighted falling ball (T3).
import type { Game } from '../game/game';
import type { TutHint } from '../game/tutorial';
import { KIND_MAIN } from '../game/balls';
import type { WorldView } from '../render/draw-world';
import { el, onTap } from './dom';
import { UI_ICONS } from './icons';

const TEXT: Record<TutHint, string> = {
  t0: '按住屏幕任意处，左右拖动',
  t1: '核心会自动发射 · 移到砖块下方',
  t2: '靠近吸取金色晶体',
  t3: '接住落下的球 → 充能，伤害提升',
  t3miss: '漏接也会自动装填',
  t4: '',
  t5: '砖块会整排下压，越过红线会扣血',
  ready: '',
  '': '',
};

export class TutorialOverlay {
  readonly root: HTMLElement;
  private hint: HTMLElement;
  private text: HTMLElement;
  private finger: HTMLElement;
  private shown: TutHint | null = null;
  private lastStep = -1;
  private timers: number[] = [];
  private guide = 0;
  onReady: () => void = () => {};

  constructor(parent: HTMLElement, onSkip: () => void) {
    const r = el('div', 'hidden', parent);
    r.id = 'tutorial';
    this.root = r;
    this.finger = el('div', 'finger', r, UI_ICONS.finger);
    this.hint = el('div', 'hint swap', r);
    const bub = el('div', 'bub chamfer', this.hint);
    const chk = el('span', 'chk', bub, UI_ICONS.check);
    void chk;
    this.text = el('span', '', bub);
    const skip = el('button', 'skip chamfer ui press', r, '<span>跳过引导 ›</span>');
    skip.dataset.testid = 'btn-skip-tutorial';
    onTap(skip, () => onSkip());
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      for (const t of this.timers) window.clearTimeout(t);
      this.timers = [];
      this.shown = null;
      this.lastStep = -1;
      this.guide = 0;
      this.hint.className = 'hint swap';
    }
  }

  private setHint(h: TutHint, completed: boolean): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    const apply = (): void => {
      this.hint.classList.remove('done');
      const txt = TEXT[h];
      if (!txt) {
        this.hint.classList.add('swap');
        return;
      }
      this.text.textContent = txt;
      this.hint.classList.toggle('mid', h === 't5');
      this.hint.classList.remove('swap');
    };
    if (completed && this.shown && TEXT[this.shown]) {
      // tick the finished hint, then swap
      this.hint.classList.add('done');
      this.timers.push(
        window.setTimeout(() => {
          this.hint.classList.add('swap');
          this.timers.push(window.setTimeout(apply, 220));
        }, 520),
      );
    } else if (this.shown && TEXT[this.shown]) {
      this.hint.classList.add('swap');
      this.timers.push(window.setTimeout(apply, 220));
    } else {
      apply();
    }
    this.shown = h;
  }

  /** per frame while the tutorial runs */
  update(g: Game, view: WorldView, realDt: number): void {
    const t = g.tut;
    if (!t) {
      view.tutorialGuide = 0;
      view.highlightBall = -1;
      return;
    }
    if (t.hint !== this.shown) {
      const completed = t.step > this.lastStep && this.lastStep >= 0;
      this.setHint(t.hint, completed);
      if (t.hint === 'ready') this.onReady();
    }
    this.lastStep = t.step;
    this.finger.classList.toggle('hidden', t.step !== 0);
    // T1 guide line fades in / out
    const want = t.step === 1 ? 1 : 0;
    this.guide += (want - this.guide) * Math.min(1, realDt * 6);
    view.tutorialGuide = this.guide < 0.01 ? 0 : this.guide;
    // T3: highlight the next falling main ball (closest to the catch line)
    let hb = -1;
    if (t.step === 3) {
      let best = -1e9;
      for (const b of g.balls.pool) {
        if (!b.alive || b.kind !== KIND_MAIN || b.vy <= 0) continue;
        if (b.y > best) {
          best = b.y;
          hb = b.id;
        }
      }
    }
    view.highlightBall = hb;
  }
}
