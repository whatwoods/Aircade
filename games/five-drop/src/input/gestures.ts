// 指针手势识别（第 6.4 节）：轴锁定、相对拖动、甩动、轻点、双指轻点
import { CONFIG } from '../config.ts';

export interface GestureHandlers {
  /** 返回 true 表示被 UI 按钮消费 */
  uiDown(x: number, y: number, id: number): boolean;
  uiUp(x: number, y: number, id: number): void;
  inZone(x: number, y: number): boolean;
  dragStart(): void;
  dragX(dxLogical: number): void;
  dragDown(dyLogical: number): void;
  flickDown(): void;
  flickUp(): void;
  tap(): void;
  twoFingerTap(): void;
  release(): void;
  firstGesture(): void;
}

interface Track {
  id: number; sx: number; sy: number; x: number; y: number; t0: number;
  axis: '' | 'h' | 'v'; ui: boolean;
  hx: Float64Array; hy: Float64Array; ht: Float64Array; hn: number; hi: number;
  epoch: number; moved: boolean;
}

export class Gestures {
  private tracks = new Map<number, Track>();
  private primary = -1;
  private secondary = -1;
  private twoFinger = false;
  /** 当前方块编号：出块前按下的指针不允许硬降 */
  epoch = 0;
  private h: GestureHandlers;
  private toLogical: (cx: number, cy: number) => { x: number; y: number };
  enabled = true;

  constructor(el: HTMLElement, toLogical: (cx: number, cy: number) => { x: number; y: number }, h: GestureHandlers) {
    this.h = h;
    this.toLogical = toLogical;
    el.addEventListener('pointerdown', e => this.down(e), { passive: false });
    el.addEventListener('pointermove', e => this.move(e), { passive: false });
    el.addEventListener('pointerup', e => this.up(e), { passive: false });
    el.addEventListener('pointercancel', e => this.cancel(e), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /** 新方块出现：把正在进行的拖动基线移到当前位置 */
  rebase(): void {
    const t = this.tracks.get(this.primary);
    if (t) { t.sx = t.x; t.sy = t.y; this.h.dragStart(); }
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.h.firstGesture();
    const p = this.toLogical(e.clientX, e.clientY);
    const tr: Track = {
      id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, t0: e.timeStamp, axis: '', ui: false,
      hx: new Float64Array(8), hy: new Float64Array(8), ht: new Float64Array(8), hn: 0, hi: 0, epoch: this.epoch, moved: false,
    };
    this.push(tr, p.x, p.y, e.timeStamp);
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (this.h.uiDown(p.x, p.y, e.pointerId)) { tr.ui = true; this.tracks.set(e.pointerId, tr); return; }
    this.tracks.set(e.pointerId, tr);
    if (!this.enabled) return;
    if (this.primary < 0) {
      if (!this.h.inZone(p.x, p.y)) return;
      this.primary = e.pointerId;
      this.twoFinger = false;
      this.twoFingerFired = false;
      this.h.dragStart();
    } else if (this.secondary < 0) {
      const pt = this.tracks.get(this.primary);
      if (pt && e.timeStamp - pt.t0 < CONFIG.input.twoFingerTapMs && !pt.moved) {
        this.secondary = e.pointerId;
        this.twoFinger = true;
      }
    }
  }

  private push(t: Track, x: number, y: number, ts: number): void {
    t.hx[t.hi] = x; t.hy[t.hi] = y; t.ht[t.hi] = ts;
    t.hi = (t.hi + 1) % 8; t.hn = Math.min(8, t.hn + 1);
  }

  private move(e: PointerEvent): void {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const p = this.toLogical(e.clientX, e.clientY);
    t.x = p.x; t.y = p.y;
    this.push(t, p.x, p.y, e.timeStamp);
    if (t.ui || e.pointerId !== this.primary || !this.enabled) return;
    const dx = p.x - t.sx, dy = p.y - t.sy;
    const lock = CONFIG.input.axisLockPx;
    if (!t.axis) {
      if (Math.hypot(dx, dy) >= lock) {
        t.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        t.moved = true;
        if (this.twoFinger) this.twoFinger = false;
      } else return;
    }
    if (t.axis === 'h') this.h.dragX(dx);
    else if (dy > 0) this.h.dragDown(dy);
  }

  private velocity(t: Track): { vy: number } {
    // 松手前 flickWindowMs 内的平均速度（逻辑 px / ms）
    const win = CONFIG.input.flickWindowMs;
    const last = (t.hi + 7) % 8;
    const tl = t.ht[last], yl = t.hy[last];
    let k = last;
    for (let i = 1; i < t.hn; i++) {
      const j = (last - i + 8) % 8;
      if (tl - t.ht[j] > win) break;
      k = j;
    }
    const dt = tl - t.ht[k];
    if (dt <= 0) return { vy: 0 };
    return { vy: (yl - t.hy[k]) / dt };
  }

  private up(e: PointerEvent): void {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const p = this.toLogical(e.clientX, e.clientY);
    t.x = p.x; t.y = p.y;
    // 抬手紧跟最后一次移动时不计入采样（否则抬手事件的零位移会拉低甩动速度）；停顿后再抬手则计入
    const lastT = t.hn ? t.ht[(t.hi + 7) % 8] : t.t0;
    if (e.timeStamp - lastT > 50 || t.hn < 2) this.push(t, p.x, p.y, e.timeStamp);
    this.tracks.delete(e.pointerId);
    if (t.ui) { this.h.uiUp(p.x, p.y, e.pointerId); return; }
    if (e.pointerId === this.secondary) {
      this.secondary = -1;
      if (this.twoFinger && !t.moved && Math.hypot(p.x - t.sx, p.y - t.sy) < CONFIG.input.tapMaxPx) {
        this.h.twoFingerTap();
        // 主指针仍按着时，它抬起时不再触发轻点
        this.twoFingerFired = this.primary >= 0;
      }
      this.twoFinger = false;
      return;
    }
    if (e.pointerId !== this.primary) return;
    this.primary = -1;
    if (!this.enabled) return;
    const dur = e.timeStamp - t.t0;
    const dist = Math.hypot(p.x - t.sx, p.y - t.sy);
    const I = CONFIG.input;
    if (this.twoFingerFired) { this.twoFingerFired = false; this.h.release(); return; }
    if (!t.axis && dist < I.tapMaxPx && dur < I.tapMaxMs) {
      if (this.secondary >= 0 && this.twoFinger) { this.h.release(); return; }
      this.h.tap();
    } else if (t.axis === 'v') {
      const { vy } = this.velocity(t);
      const dy = p.y - t.sy;
      if (vy >= I.flickVel && dy >= I.flickMinPx && t.epoch === this.epoch) this.h.flickDown();
      else if (vy <= -I.flickVel && dy <= -I.flickMinPx && t.epoch === this.epoch) this.h.flickUp();
    }
    this.h.release();
  }
  private twoFingerFired = false;

  private cancel(e: PointerEvent): void {
    const t = this.tracks.get(e.pointerId);
    this.tracks.delete(e.pointerId);
    if (t?.ui) this.h.uiUp(-999, -999, e.pointerId);
    if (e.pointerId === this.primary) { this.primary = -1; this.h.release(); }
    if (e.pointerId === this.secondary) { this.secondary = -1; this.twoFinger = false; }
  }

  reset(): void { this.tracks.clear(); this.primary = -1; this.secondary = -1; this.twoFinger = false; }
}
