// canvas、DPR、安全区、逻辑坐标（宽 390，高 Hlog）
export const LW = 390;

export const stage = {
  canvas: null as unknown as HTMLCanvasElement,
  ctx: null as unknown as CanvasRenderingContext2D,
  dpr: 1,
  /** 自适应画质的 DPR 上限 */
  dprCap: 2,
  vw: 390,
  vh: 844,
  s: 1,
  H: 844,
  ox: 0,
  oy: 0,
  desktop: false,
  safe: { t: 0, r: 0, b: 0, l: 0 },
  /** 每次尺寸变化 +1，用于缓存失效 */
  version: 0,
};

let probe: HTMLDivElement | null = null;

function readSafe(): void {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  stage.safe.t = parseFloat(cs.paddingTop) || 0;
  stage.safe.r = parseFloat(cs.paddingRight) || 0;
  stage.safe.b = parseFloat(cs.paddingBottom) || 0;
  stage.safe.l = parseFloat(cs.paddingLeft) || 0;
}

export function initStage(canvas: HTMLCanvasElement): void {
  stage.canvas = canvas;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D 不可用');
  stage.ctx = ctx;
  resizeStage();
}

export function resizeStage(): boolean {
  readSafe();
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  let dpr = Math.min(stage.dprCap, window.devicePixelRatio || 1);
  if (vw * vh * dpr * dpr > 4.2e6) dpr = Math.max(1, Math.sqrt(4.2e6 / (vw * vh)));
  const { t, r, b, l } = stage.safe;
  const aw = vw - l - r;
  const ah = vh - t - b;
  const desktop = aw / ah > 0.75;
  let s: number;
  let H: number;
  if (desktop) {
    s = Math.min(ah / 844, 1.4);
    H = 844;
  } else {
    s = Math.min(aw / LW, ah / 760);
    H = Math.max(760, Math.min(960, ah / s));
  }
  const changed = vw !== stage.vw || vh !== stage.vh || dpr !== stage.dpr || s !== stage.s || H !== stage.H || stage.version === 0;
  stage.vw = vw;
  stage.vh = vh;
  stage.dpr = dpr;
  stage.desktop = desktop;
  stage.s = s;
  stage.H = H;
  stage.ox = l + (aw - LW * s) / 2;
  stage.oy = t + (ah - H * s) / 2;
  const cw = Math.round(vw * dpr);
  const ch = Math.round(vh * dpr);
  if (stage.canvas.width !== cw || stage.canvas.height !== ch) {
    stage.canvas.width = cw;
    stage.canvas.height = ch;
  }
  stage.canvas.style.width = vw + 'px';
  stage.canvas.style.height = vh + 'px';
  if (changed) stage.version++;
  return changed;
}

/** CSS 像素 → 逻辑坐标 */
export function toLogical(cx: number, cy: number, out: { x: number; y: number }): void {
  out.x = (cx - stage.ox) / stage.s;
  out.y = (cy - stage.oy) / stage.s;
}

/** 逻辑矩形 → CSS 像素矩形 */
export function rectCss(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const s = stage.s;
  return { x: stage.ox + x * s, y: stage.oy + y * s, w: w * s, h: h * s };
}

/** 设置"逻辑坐标"变换（含 DPR） */
export function setGameTransform(ctx: CanvasRenderingContext2D, dx = 0, dy = 0, rot = 0): void {
  const k = stage.dpr * stage.s;
  if (rot === 0) {
    ctx.setTransform(k, 0, 0, k, (stage.ox + dx) * stage.dpr, (stage.oy + dy) * stage.dpr);
  } else {
    const c = Math.cos(rot) * k;
    const sn = Math.sin(rot) * k;
    // 以游戏区中心为轴旋转
    const cx = (stage.ox + (LW * stage.s) / 2 + dx) * stage.dpr;
    const cy = (stage.oy + (stage.H * stage.s) / 2 + dy) * stage.dpr;
    const hx = LW / 2;
    const hy = stage.H / 2;
    ctx.setTransform(c, sn, -sn, c, cx - c * hx + sn * hy, cy - sn * hx - c * hy);
  }
}

export function setScreenTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
}

/** 逻辑像素对应的设备像素倍率（用于缓存精灵分辨率） */
export function pxRatio(): number {
  return stage.dpr * stage.s;
}
