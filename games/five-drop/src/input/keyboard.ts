// 键盘：←/→（DAS/ARR）、↓ 软降、空格硬降、↑/X 顺转、Z 逆转、F/V 翻色、C/Shift 暂存、Esc/P 暂停、M 静音
import { CONFIG } from '../config.ts';

export type KeyAction = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'invert' | 'hold' | 'pause' | 'mute' | 'confirm';

const MAP: Record<string, KeyAction> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', Space: 'hard', ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw',
  KeyF: 'invert', KeyV: 'invert', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
  Enter: 'confirm', NumpadEnter: 'confirm',
};

export class Keyboard {
  private held = new Set<KeyAction>();
  private dasDir = 0;
  private dasT = 0;
  private arrT = 0;
  onPress: (a: KeyAction) => void = () => {};
  onRelease: (a: KeyAction) => void = () => {};
  onFirst: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', e => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.onFirst();
      if (e.repeat) return;
      this.held.add(a);
      if (a === 'left' || a === 'right') { this.dasDir = a === 'left' ? -1 : 1; this.dasT = 0; this.arrT = 0; }
      this.onPress(a);
    });
    window.addEventListener('keyup', e => {
      const a = MAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.held.delete(a);
      if ((a === 'left' && this.dasDir < 0) || (a === 'right' && this.dasDir > 0)) {
        this.dasDir = this.held.has('left') ? -1 : this.held.has('right') ? 1 : 0;
        this.dasT = 0;
      }
      this.onRelease(a);
    });
    window.addEventListener('blur', () => { this.held.clear(); this.dasDir = 0; });
  }

  isHeld(a: KeyAction): boolean { return this.held.has(a); }

  /** 返回本帧应额外平移的次数（DAS/ARR 自动重复） */
  update(dtMs: number): number {
    if (!this.dasDir) return 0;
    this.dasT += dtMs;
    if (this.dasT < CONFIG.input.das) return 0;
    this.arrT += dtMs;
    let n = 0;
    while (this.arrT >= CONFIG.input.arr) { this.arrT -= CONFIG.input.arr; n++; }
    return n * this.dasDir;
  }
  clear(): void { this.held.clear(); this.dasDir = 0; }
}
