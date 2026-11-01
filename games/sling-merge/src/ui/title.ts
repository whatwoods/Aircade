/**
 * 标题页（docs §4.8 ① / §6.2）：静态 DOM（index.html）在 JS 加载前就可见、可点；
 * 这里只接管按钮行为和最高分显示。吉祥物、罐内水果、气泡由画布绘制。
 */
import { formatScore } from '../core/math';

export interface TitleActions {
  start(): void;
  settings(): void;
  howto(): void;
}

export class TitleScreen {
  readonly el: HTMLElement;
  readonly btnStart: HTMLButtonElement;
  private bestNum: HTMLElement;
  private bestRow: HTMLElement;
  visible = true;

  constructor(act: TitleActions) {
    this.el = document.getElementById('title')!;
    this.btnStart = document.getElementById('btn-start') as HTMLButtonElement;
    this.bestNum = document.getElementById('title-best-num')!;
    this.bestRow = document.getElementById('title-best')!;
    this.btnStart.addEventListener('click', () => act.start());
    document.getElementById('btn-title-settings')!.addEventListener('click', () => act.settings());
    document.getElementById('btn-howto')!.addEventListener('click', () => act.howto());
  }

  setBest(best: number): void {
    this.bestNum.textContent = formatScore(best);
    this.bestRow.style.visibility = best > 0 ? 'visible' : 'hidden';
  }

  show(best: number): void {
    this.setBest(best);
    this.visible = true;
    this.el.classList.remove('leaving');
    this.el.classList.add('show');
  }

  hide(): void {
    this.visible = false;
    this.el.classList.remove('show');
  }

  /** 转场前半段：停止呼吸动画，避免与浪涌抢戏 */
  leaving(): void {
    this.el.classList.add('leaving');
  }
}
