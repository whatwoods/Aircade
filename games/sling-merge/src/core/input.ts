/**
 * 指针输入 → 弹弓瞄准（docs §3.3 / §6.9）：相对拖拽、拉弓式反向、只认第一个指针、
 * pointer capture、取消规则；同时为「眼睛跟随指针」提供视线目标。
 */
import { bus } from './events';
import type { Stage } from './stage';
import type { Game } from '../game/game';

export interface InputHooks {
  /** 现在能否开始瞄准（无浮层、playing、非暂停） */
  canAim(): boolean;
  /** 首次用户手势（解锁音频） */
  onGesture(): void;
}

export class Input {
  private pt = { x: 0, y: 0 };
  private lastStep = 0;
  private wasMax = false;
  private gestured = false;

  private stage: Stage;
  private game: Game;
  private hooks: InputHooks;

  constructor(stage: Stage, game: Game, hooks: InputHooks) {
    this.stage = stage;
    this.game = game;
    this.hooks = hooks;
    const root = stage.root;
    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onCancel);
    root.addEventListener('lostpointercapture', this.onLost);
    window.addEventListener('pointermove', this.onWindowMove, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length > 1 || !(e.target as HTMLElement | null)?.closest?.('.scroll')) e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', this.gesture, { capture: true });
  }

  private readonly gesture = (): void => {
    if (this.gestured) return;
    this.gestured = true;
    this.hooks.onGesture();
  };

  private isUi(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && typeof t.closest === 'function' && !!t.closest('button, a, input, .ui-block');
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.gesture();
    const g = this.game;
    this.stage.toLogical(e.clientX, e.clientY, this.pt);
    this.look(this.pt.x, this.pt.y);
    if (this.isUi(e)) return;
    if (g.scene === 'gameover') {
      g.skipGameOver();
      return;
    }
    const s = g.sling;
    if (s.aiming) {
      // 右键或第二指：瞄准中右键视为取消
      if (e.pointerId === s.pointerId || e.button === 2) this.cancel();
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!this.hooks.canAim()) return;
    s.begin(e.pointerId, this.pt.x, this.pt.y);
    try {
      this.stage.root.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.lastStep = 0;
    this.wasMax = false;
    this.stage.root.classList.add('aiming');
    g.predDirty();
    bus.emit({ t: 'aimStart' });
    e.preventDefault();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const s = this.game.sling;
    if (!s.aiming || e.pointerId !== s.pointerId) return;
    this.stage.toLogical(e.clientX, e.clientY, this.pt);
    s.move(this.pt.x, this.pt.y);
    this.afterMove();
  };

  /** 力度跨过 25% 一档、达到满力的事件 */
  afterMove(): void {
    const s = this.game.sling;
    const step = s.valid ? Math.min(4, Math.floor(s.power * 4 + 1e-6)) : 0;
    if (step > this.lastStep && step < 4) bus.emit({ t: 'aimStep', step });
    this.lastStep = step;
    const max = s.valid && s.power >= 0.999;
    if (max && !this.wasMax) bus.emit({ t: 'aimMax' });
    this.wasMax = max;
    s.maxReached = max;
    s.powerStep = step;
  }

  private readonly onWindowMove = (e: PointerEvent): void => {
    this.stage.toLogical(e.clientX, e.clientY, this.pt);
    this.look(this.pt.x, this.pt.y);
  };

  private look(x: number, y: number): void {
    const g = this.game;
    g.lookActive = true;
    g.lookX = x;
    g.lookY = y;
  }

  private readonly onUp = (e: PointerEvent): void => {
    const g = this.game;
    const s = g.sling;
    if (!s.aiming || e.pointerId !== s.pointerId) return;
    this.stage.toLogical(e.clientX, e.clientY, this.pt);
    s.move(this.pt.x, this.pt.y);
    this.release(e.pointerId);
    if (s.valid && s.loaded !== null && this.hooks.canAim()) {
      s.end();
      g.launch();
      return;
    }
    // 装填中松手：皮兜晃一下表示「还没装好」
    const notReady = s.valid && s.loaded === null;
    s.end();
    if (notReady) s.pouchVY += 260;
    bus.emit({ t: 'aimCancel' });
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.game.sling.pointerId) return;
    this.cancel();
  };

  private readonly onLost = (e: PointerEvent): void => {
    const s = this.game.sling;
    if (s.aiming && e.pointerId === s.pointerId) {
      // 捕获丢失但仍在按住：交给 pointerup 处理；这里只在没按键时取消
      if (e.buttons === 0 && e.pointerType !== 'mouse') this.cancel();
    }
  };

  /** 取消瞄准（失焦/暂停/resize/右键/取消区松手） */
  cancel(): void {
    const s = this.game.sling;
    if (!s.aiming) return;
    this.release(s.pointerId);
    s.end();
    s.valid = false;
    bus.emit({ t: 'aimCancel' });
  }

  private release(id: number): void {
    this.stage.root.classList.remove('aiming');
    try {
      if (this.stage.root.hasPointerCapture(id)) this.stage.root.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  }
}
