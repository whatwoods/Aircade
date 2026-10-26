// Viewport: fits the 390×844 world column into the safe area, caps DPR, keeps the DOM overlay aligned.
import { config } from '../config';

const W = config.world.width;
const H = config.world.height;

export class Viewport {
  /** CSS pixels */
  cssW = 1;
  cssH = 1;
  dpr = 1;
  dprCap = 2;
  /** world → CSS px */
  scale = 1;
  left = 0;
  top = 0;
  safeT = 0;
  safeR = 0;
  safeB = 0;
  safeL = 0;
  /** backbuffer size */
  pxW = 1;
  pxH = 1;
  version = 0;
  private probe: HTMLDivElement;
  private pending = 0;
  private listeners: (() => void)[] = [];

  constructor(private overlay: HTMLElement) {
    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(this.probe);
    const onResize = (): void => {
      if (this.pending) return;
      this.pending = window.setTimeout(() => {
        this.pending = 0;
        this.measure();
      }, 100);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.measure();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  setDprCap(cap: number): void {
    if (cap === this.dprCap) return;
    this.dprCap = cap;
    this.measure();
  }

  measure(): void {
    const cs = getComputedStyle(this.probe);
    this.safeT = parseFloat(cs.paddingTop) || 0;
    this.safeR = parseFloat(cs.paddingRight) || 0;
    this.safeB = parseFloat(cs.paddingBottom) || 0;
    this.safeL = parseFloat(cs.paddingLeft) || 0;
    this.cssW = Math.max(1, window.innerWidth);
    this.cssH = Math.max(1, window.innerHeight);
    const aw = Math.max(1, this.cssW - this.safeL - this.safeR);
    const ah = Math.max(1, this.cssH - this.safeT - this.safeB);
    this.scale = Math.min(aw / W, ah / H);
    this.left = this.safeL + (aw - W * this.scale) / 2;
    this.top = this.safeT + (ah - H * this.scale) / 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.pxW = Math.round(this.cssW * this.dpr);
    this.pxH = Math.round(this.cssH * this.dpr);
    this.overlay.style.transform = `translate(${this.left}px, ${this.top}px) scale(${this.scale})`;
    document.documentElement.style.setProperty('--ws', String(this.scale));
    document.documentElement.style.setProperty('--wl', `${this.left}px`);
    document.documentElement.style.setProperty('--wr', `${this.cssW - this.left - W * this.scale}px`);
    this.version++;
    for (const f of this.listeners) f();
  }

  /** CSS px → world */
  toWorldX(cx: number): number {
    return (cx - this.left) / this.scale;
  }
  toWorldY(cy: number): number {
    return (cy - this.top) / this.scale;
  }
  /** free CSS width beside the column on each side */
  sideWidth(): number {
    return this.left;
  }
}
