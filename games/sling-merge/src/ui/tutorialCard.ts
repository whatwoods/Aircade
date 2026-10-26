/**
 * 引导文字卡 + 手势小手 + 情境提示气泡（docs §6.3）。卡片 pointer-events: none，不挡拖拽。
 * 每帧只比较 card.rev，变化时才改 DOM。
 */
import { CONFIG } from '../config';
import type { Game } from '../game/game';
import { HAND_SVG, ICON } from './icons';

const TIP_DUR = 2.3;

export class TutorialCard {
  private game: Game;
  private card: HTMLElement;
  private txt: HTMLElement;
  private hand: HTMLElement;
  private tipEls: HTMLElement[] = [];
  private tipT: number[] = [];
  private rev = -1;
  private visible = false;
  private handOn = false;

  constructor(root: HTMLElement, game: Game) {
    this.game = game;
    const card = document.createElement('div');
    card.id = 'tut-card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.innerHTML =
      `<span class="arrow">${ICON.arrowUp}</span><span class="txt"></span>` +
      '<span class="demo" aria-hidden="true"><span>3</span><span>2</span><span>1</span></span>';
    root.appendChild(card);
    this.card = card;
    this.txt = card.querySelector('.txt')!;
    const hand = document.createElement('div');
    hand.id = 'tut-hand';
    const P = CONFIG.layout.sling.pouch;
    hand.style.left = `${P.x}px`;
    hand.style.top = `${P.y}px`;
    hand.innerHTML = `<div class="hand-move"><div class="hand-ring"></div>${HAND_SVG}</div>`;
    root.appendChild(hand);
    this.hand = hand;
    for (let i = 0; i < 2; i++) {
      const t = document.createElement('div');
      t.className = 'tip';
      root.appendChild(t);
      this.tipEls.push(t);
      this.tipT.push(0);
    }
  }

  /** 情境提示气泡 */
  tip(text: string, x: number, y: number): void {
    const i = this.tipT[0]! <= this.tipT[1]! ? 0 : 1;
    const el = this.tipEls[i]!;
    el.textContent = text;
    const cx = Math.max(118, Math.min(272, x));
    const cy = Math.max(150, Math.min(700, y));
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    // 尾巴指向锚点
    el.style.setProperty('--tail', `${Math.max(-80, Math.min(80, x - cx))}px`);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.tipT[i] = TIP_DUR;
  }

  hideAll(): void {
    for (let i = 0; i < this.tipEls.length; i++) {
      this.tipT[i] = 0;
      this.tipEls[i]!.classList.remove('show');
    }
    this.setVisible(false);
    this.setHand(false);
  }

  private setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.card.classList.toggle('show', v);
  }

  private setHand(v: boolean): void {
    if (v === this.handOn) return;
    this.handOn = v;
    this.hand.classList.toggle('show', v);
  }

  update(realDt: number, paused: boolean): void {
    const g = this.game;
    const tu = g.tutorial;
    const show = tu.cardVisible && g.scene === 'playing' && !paused;
    const c = tu.card;
    if (c.rev !== this.rev) {
      const changed = this.txt.textContent !== c.text;
      this.rev = c.rev;
      this.txt.textContent = c.text;
      const cl = this.card.classList;
      cl.toggle('gold', c.gold);
      cl.toggle('has-arrow', c.arrow);
      cl.toggle('has-demo', c.demo);
      if (changed && this.visible) {
        cl.remove('swap');
        void this.card.offsetWidth;
        cl.add('swap');
      }
    }
    this.setVisible(show);
    this.setHand(show && c.hand && !g.sling.aiming);
    for (let i = 0; i < this.tipEls.length; i++) {
      if (this.tipT[i]! > 0 && !paused) {
        this.tipT[i] = this.tipT[i]! - realDt;
        if (this.tipT[i]! <= 0) this.tipEls[i]!.classList.remove('show');
      }
    }
  }
}
