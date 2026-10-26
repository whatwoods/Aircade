// 木桌背景：半分辨率木纹 + 板缝 + 木节 + 暖灯 + 暗角（按视口缓存）；战斗时远端更暗；首领红灯
import { C } from '../kit.ts';
import { hashf } from '../noise.ts';
import { LW, stage } from '../stage.ts';
import { makeCanvas } from '../text.ts';
import { woodField } from '../textures.ts';
import { drawDesktopDecor, drawCandleFlame, decorLayout } from './desktopDecor.ts';

let bg: HTMLCanvasElement | null = null;
let bgVer = -1;

/** 逻辑坐标 → CSS 像素 */
function cssX(x: number): number {
  return stage.ox + x * stage.s;
}
function cssY(y: number): number {
  return stage.oy + y * stage.s;
}

function build(): HTMLCanvasElement {
  const dpr = stage.dpr;
  const vw = stage.vw;
  const vh = stage.vh;
  const [c, ctx] = makeCanvas(vw * dpr, vh * dpr);
  // 木纹底（半分辨率，放大）
  const unit = Math.max(0.6, stage.s);
  const res = vw * vh > 600000 ? 0.75 : 1;
  const wood = woodField(vw * res, vh * res, 11, (stage.ox % (110 * unit)) * res, unit * res);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(wood, 0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 板缝：与游戏区对齐
  const plank = 110 * unit;
  for (let x = stage.ox % plank; x < vw; x += plank) {
    ctx.fillStyle = 'rgba(30,16,7,0.75)';
    ctx.fillRect(x - 1, 0, 2, vh);
    ctx.fillStyle = 'rgba(160,110,70,0.25)';
    ctx.fillRect(x + 1, 0, 1, vh);
  }
  // 横向接缝（每块木板一段）
  for (let i = 0; i * plank < vw + plank; i++) {
    const px = (stage.ox % plank) + (i - 1) * plank;
    const y = (hashf(i, 31) * 0.8 + 0.1) * vh;
    ctx.fillStyle = 'rgba(30,16,7,0.6)';
    ctx.fillRect(px, y, plank, 1.6);
    ctx.fillStyle = 'rgba(160,110,70,0.2)';
    ctx.fillRect(px, y + 1.6, plank, 1);
  }
  // 木节 1–2 个
  const knots = vw > 700 ? 3 : 2;
  for (let i = 0; i < knots; i++) {
    const kx = hashf(i * 7 + 1, 13) * vw;
    const ky = hashf(i * 7 + 2, 13) * vh;
    const rx = (10 + hashf(i, 4) * 8) * unit;
    const ry = rx * 2.2;
    for (let r = 0; r < 5; r++) {
      ctx.strokeStyle = `rgba(40,22,10,${0.5 - r * 0.08})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, rx * (1 + r * 0.45), ry * (1 + r * 0.35), 0.05, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,22,10,0.55)';
    ctx.beginPath();
    ctx.ellipse(kx, ky, rx * 0.7, ry * 0.6, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  // 桌面装饰（桌面模式两侧）
  if (stage.desktop) drawDesktopDecor(ctx);
  // 暖灯（soft-light 18%）
  const lx = cssX(LW / 2);
  const ly = cssY(300);
  const R = Math.max(vw, vh) * 0.75;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
  lg.addColorStop(0, 'rgba(255,208,138,0.9)');
  lg.addColorStop(0.5, 'rgba(255,208,138,0.35)');
  lg.addColorStop(1, 'rgba(255,208,138,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, vw, vh);
  ctx.globalCompositeOperation = 'source-over';
  const lg2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.7);
  lg2.addColorStop(0, 'rgba(255,208,138,0.12)');
  lg2.addColorStop(1, 'rgba(255,208,138,0)');
  ctx.fillStyle = lg2;
  ctx.fillRect(0, 0, vw, vh);
  // 暗角（multiply）
  ctx.globalCompositeOperation = 'multiply';
  const vg = ctx.createRadialGradient(lx, vh * 0.45, Math.min(vw, vh) * 0.35, lx, vh * 0.45, Math.hypot(vw, vh) * 0.62);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(1, 'rgba(70,45,30,1)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
  return c;
}

// 战斗远端暗化 + 首领红灯：合成进一张缓存图（量化到 1/16），每帧只画一次全屏，
// 避免背景 + 渐变 + 红灯三遍全屏填充
let shadeK = 0;
let shadeY = 0;
let lampK = 0;
let comp: HTMLCanvasElement | null = null;
let compK = -1;
let compY = -1;
let compL = -1;
let compVer = -1;

/** 由场景在 update 里设置（0 = 关闭） */
export function setBackdrop(k: number, bandY: number, lamp: number): void {
  shadeK = k;
  shadeY = bandY;
  lampK = lamp;
}

export function drawBackground(ctx: CanvasRenderingContext2D, time: number): void {
  if (!bg || bgVer !== stage.version) {
    bg = build();
    bgVer = stage.version;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const kq = Math.round(shadeK * 16) / 16;
  const lq = Math.round(lampK * 16) / 16;
  if (kq <= 0 && lq <= 0) ctx.drawImage(bg, 0, 0);
  else {
    if (!comp || comp.width !== bg.width || comp.height !== bg.height) {
      comp = makeCanvas(bg.width, bg.height)[0];
      compVer = -1;
    }
    if (kq !== compK || lq !== compL || shadeY !== compY || compVer !== bgVer) {
      const cc = comp.getContext('2d')!;
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalAlpha = 1;
      cc.globalCompositeOperation = 'source-over';
      cc.drawImage(bg, 0, 0);
      drawFarShade(cc, kq, shadeY);
      drawBossLamp(cc, lq);
      compK = kq;
      compL = lq;
      compY = shadeY;
      compVer = bgVer;
    }
    ctx.drawImage(comp, 0, 0);
  }
  if (stage.desktop && decorLayout().right) {
    ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    drawCandleFlame(ctx, time);
  }
}

/** 战斗中远端（敌人侧）桌面更暗 */
export function drawFarShade(ctx: CanvasRenderingContext2D, k: number, bandY: number): void {
  if (k <= 0.01) return;
  ctx.save();
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  const y = cssY(bandY);
  const g = ctx.createLinearGradient(0, 0, 0, y);
  g.addColorStop(0, `rgba(12,6,2,${0.42 * k})`);
  g.addColorStop(0.75, `rgba(12,6,2,${0.14 * k})`);
  g.addColorStop(1, 'rgba(12,6,2,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, stage.vw, y);
  ctx.restore();
}

let redLamp: HTMLCanvasElement | null = null;
/** 首领战：暖灯偏红（约 24%） */
export function drawBossLamp(ctx: CanvasRenderingContext2D, k: number): void {
  if (k <= 0.01) return;
  if (!redLamp) {
    const [c, g] = makeCanvas(128, 128);
    const rg = g.createRadialGradient(64, 50, 0, 64, 64, 90);
    rg.addColorStop(0, 'rgba(255,138,90,0.5)');
    rg.addColorStop(0.6, 'rgba(255,110,70,0.22)');
    rg.addColorStop(1, 'rgba(120,20,10,0.35)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    redLamp = c;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.5 * k;
  ctx.drawImage(redLamp, 0, 0, stage.canvas.width, stage.canvas.height);
  ctx.restore();
}

/** 屏幕底部红色暗角（受击 / 低血量） */
export function drawRedVignette(ctx: CanvasRenderingContext2D, k: number): void {
  if (k <= 0.01) return;
  ctx.save();
  ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
  const vw = stage.vw;
  const vh = stage.vh;
  const g = ctx.createLinearGradient(0, vh * 0.55, 0, vh);
  g.addColorStop(0, 'rgba(194,64,44,0)');
  g.addColorStop(1, `rgba(194,64,44,${0.45 * Math.min(1, k)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, vh * 0.55, vw, vh * 0.45);
  ctx.restore();
}

/** 全屏闪光（凤凰 = 暖金，阶段转换 = 红） */
export function drawFlash(ctx: CanvasRenderingContext2D, color: string, a: number): void {
  if (a <= 0.01) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, stage.canvas.width, stage.canvas.height);
  ctx.restore();
}

export { C };
