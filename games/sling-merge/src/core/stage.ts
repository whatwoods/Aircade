/**
 * 舞台布局（docs §2.5 / §6.9）：视口 − 安全区 → 390×844 等比 contain，居中；
 * #stage 用 CSS transform 缩放，内部 DOM 与画布都使用逻辑像素坐标。
 */
import { CONFIG } from '../config';

export interface StageMetrics {
  /** CSS px / 逻辑 px */
  scale: number;
  left: number;
  top: number;
  vw: number;
  vh: number;
  dpr: number;
  /** 画布背板：逻辑 px → 设备像素 */
  pxRatio: number;
  card: boolean;
}

type Listener = (m: StageMetrics) => void;

export class Stage {
  readonly root: HTMLElement;
  readonly game: HTMLCanvasElement;
  readonly bg: HTMLCanvasElement;
  readonly wave: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly bgCtx: CanvasRenderingContext2D;
  readonly waveCtx: CanvasRenderingContext2D;
  m: StageMetrics = { scale: 1, left: 0, top: 0, vw: 390, vh: 844, dpr: 1, pxRatio: 1, card: false };
  /** 质量档对 DPR 的上限 */
  dprCap = 2;
  private probe: HTMLElement;
  private listeners: Listener[] = [];
  private pending = false;

  constructor() {
    this.root = document.getElementById('stage')!;
    this.game = document.getElementById('game') as HTMLCanvasElement;
    this.bg = document.getElementById('bg') as HTMLCanvasElement;
    this.wave = document.getElementById('wave') as HTMLCanvasElement;
    this.ctx = this.game.getContext('2d', { alpha: false })!;
    this.bgCtx = this.bg.getContext('2d', { alpha: false })!;
    this.waveCtx = this.wave.getContext('2d')!;
    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(this.probe);
    const onResize = (): void => {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.layout();
      });
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.layout();
  }

  onResize(l: Listener): void {
    this.listeners.push(l);
  }

  layout(): void {
    const L = CONFIG.layout;
    const vv = window.visualViewport;
    const vw = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const vh = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const cs = getComputedStyle(this.probe);
    const st = parseFloat(cs.paddingTop) || 0;
    const sr = parseFloat(cs.paddingRight) || 0;
    const sb = parseFloat(cs.paddingBottom) || 0;
    const sl = parseFloat(cs.paddingLeft) || 0;
    const aw = Math.max(100, vw - sl - sr);
    const ah = Math.max(100, vh - st - sb);
    let scale = Math.min(aw / L.stageW, ah / L.stageH, L.maxScale);
    // 让舞台宽度对齐到整数像素，避免发丝缝
    scale = Math.floor(scale * L.stageW) / L.stageW;
    const w = L.stageW * scale;
    const h = L.stageH * scale;
    const left = Math.round(sl + (aw - w) / 2);
    const top = Math.round(st + (ah - h) / 2);
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const card = vw - w > 24;
    const m = this.m;
    m.scale = scale;
    m.left = left;
    m.top = top;
    m.vw = vw;
    m.vh = vh;
    m.dpr = dpr;
    m.pxRatio = scale * dpr;
    m.card = card;

    const rs = this.root.style;
    rs.width = `${L.stageW}px`;
    rs.height = `${L.stageH}px`;
    rs.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    this.root.classList.toggle('card', card);

    const gw = Math.round(L.stageW * m.pxRatio);
    const gh = Math.round(L.stageH * m.pxRatio);
    if (this.game.width !== gw || this.game.height !== gh) {
      this.game.width = gw;
      this.game.height = gh;
    }
    const waveDpr = Math.min(dpr, 1.5) * scale;
    const ww = Math.round(L.stageW * waveDpr);
    const wh = Math.round(L.stageH * waveDpr);
    if (this.wave.width !== ww || this.wave.height !== wh) {
      this.wave.width = ww;
      this.wave.height = wh;
    }
    const bdpr = Math.min(dpr, 1.5);
    const bw = Math.round(vw * bdpr);
    const bh = Math.round(vh * bdpr);
    if (this.bg.width !== bw || this.bg.height !== bh) {
      this.bg.width = bw;
      this.bg.height = bh;
    }
    this.bg.style.width = `${vw}px`;
    this.bg.style.height = `${vh}px`;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    for (const l of this.listeners) l(m);
  }

  /** 客户端坐标 → 逻辑坐标（写入 out） */
  toLogical(clientX: number, clientY: number, out: { x: number; y: number }): void {
    out.x = (clientX - this.m.left) / this.m.scale;
    out.y = (clientY - this.m.top) / this.m.scale;
  }
}
