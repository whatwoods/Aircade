/** 舞台：等比缩放 390×844 逻辑画布、DPR（上限 2）、安全区（§8.12）。 */
import { LAYOUT } from '../config.ts';

export class Stage {
  readonly el = document.getElementById('stage') as HTMLDivElement;
  readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  readonly bg = document.getElementById('bg') as HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** 逻辑像素 → CSS 像素 */
  scale = 1;
  /** 画布像素 / 逻辑像素 */
  dpr = 1;
  left = 0;
  top = 0;
  safeTop = 0;
  safeBottom = 0;
  onResize: (() => void) | null = null;
  private probe: HTMLDivElement;
  private timer = 0;

  constructor() {
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(this.probe);
    this.layout();
    const deb = () => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.layout(), 100);
    };
    window.addEventListener('resize', deb);
    window.addEventListener('orientationchange', deb);
  }

  layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cs = getComputedStyle(this.probe);
    const st = parseFloat(cs.paddingTop) || 0;
    const sb = parseFloat(cs.paddingBottom) || 0;
    // 安全区：竖屏手机上舞台缩小让出刘海与底部横条
    const s = Math.min(vw / LAYOUT.W, (vh - st - sb) / LAYOUT.H);
    this.scale = s;
    this.left = Math.round((vw - LAYOUT.W * s) / 2);
    this.top = Math.round(st + (vh - st - sb - LAYOUT.H * s) / 2);
    this.safeTop = 0;
    this.safeBottom = 0;
    this.el.style.transform = `translate(${this.left}px,${this.top}px) scale(${s})`;
    // 舞台已经避开安全区，DOM 内不再额外加
    this.el.style.setProperty('--safe-top', '0px');
    this.el.style.setProperty('--safe-bottom', '0px');
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * s);
    this.dpr = Math.max(1, dpr);
    const w = Math.round(LAYOUT.W * this.dpr);
    const h = Math.round(LAYOUT.H * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const bdpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(vw * bdpr);
    const bh = Math.round(vh * bdpr);
    if (this.bg.width !== bw || this.bg.height !== bh) {
      this.bg.width = bw;
      this.bg.height = bh;
    }
    this.onResize?.();
  }

  /** 屏幕坐标（clientX/Y）→ 逻辑坐标 */
  toLogical(cx: number, cy: number, out: { x: number; y: number }): void {
    out.x = (cx - this.left) / this.scale;
    out.y = (cy - this.top) / this.scale;
  }
}
