// Landscape phone hint (docs §6.10 / common): on touch devices, when the viewport is landscape and shorter than
// 500 px, cover the game with 「请竖屏游玩」 and report it so the app can pause.
import { el } from './dom';
import { UI_ICONS } from './icons';

export class RotateHint {
  private root: HTMLElement;
  active = false;
  private touch = false;

  constructor() {
    try {
      this.touch = window.matchMedia('(pointer: coarse)').matches;
    } catch {
      this.touch = false;
    }
    this.root = el('div', '', document.body, `${UI_ICONS.rotate}<div class="t">请竖屏游玩</div><div class="s">旋转手机至竖屏以获得最佳体验</div>`);
    this.root.id = 'rotate';
  }

  /** returns true while the hint is shown */
  check(): boolean {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const on = this.touch && w > h && h < 500;
    if (on !== this.active) {
      this.active = on;
      this.root.classList.toggle('on', on);
    }
    return on;
  }
}
