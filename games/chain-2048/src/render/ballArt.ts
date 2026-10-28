/**
 * 珠子三层精灵（docs §2.4 / §4.2）：本体纹理（随滚动旋转）、光影层（固定）、数字层（始终正立）。
 */
import { Rng } from '../core/rng';
import { FONT_NUM, LEVELS, label, levelStyle } from './palette';

export const BALL_R = 20;
const PAD = 8;
export const SPR = (BALL_R + PAD) * 2;

export interface BallSprites {
  body: HTMLCanvasElement;
  shade: HTMLCanvasElement;
  num: HTMLCanvasElement;
}

let bakeScale = 2;
let sprites: BallSprites[] = [];
let shadeCommon: HTMLCanvasElement | null = null;
let glowGold: HTMLCanvasElement | null = null;
let ringGold: HTMLCanvasElement | null = null;
let rays: HTMLCanvasElement | null = null;

function mk(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * bakeScale);
  const g = c.getContext('2d')!;
  g.scale(bakeScale, bakeScale);
  return [c, g];
}

export function getBakeScale(): number {
  return bakeScale;
}

export function bakeBalls(scale: number): void {
  bakeScale = Math.max(1, Math.min(4, scale));
  shadeCommon = bakeShade(false);
  sprites = LEVELS.map((_, l) => ({ body: bakeBody(Math.max(1, l)), shade: shadeCommon!, num: bakeNum(Math.max(1, l)) }));
  // 透光材质用另一张光影
  const trans = bakeShade(true);
  for (const l of [4, 7, 8, 12]) if (sprites[l]) sprites[l]!.shade = trans;
  glowGold = bakeGlow('rgba(255,215,120,', 34);
  ringGold = bakeRing();
  rays = bakeRays();
}

/** 只重烘数字（字体就绪后） */
export function rebakeNumbers(): void {
  for (let l = 1; l < sprites.length; l++) sprites[l]!.num = bakeNum(l);
}

export function ballSprites(level: number): BallSprites {
  return sprites[Math.max(1, Math.min(sprites.length - 1, level))]!;
}

export function glowSprite(): HTMLCanvasElement {
  return glowGold!;
}
export function ringSprite(): HTMLCanvasElement {
  return ringGold!;
}
export function raysSprite(): HTMLCanvasElement {
  return rays!;
}

function bakeBody(l: number): HTMLCanvasElement {
  const st = levelStyle(l);
  const [c, g] = mk(SPR);
  const cx = SPR / 2, cy = SPR / 2, r = BALL_R;
  const rng = new Rng(l * 977 + 13);
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  const grad = g.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, r);
  grad.addColorStop(0, st.light);
  grad.addColorStop(0.45, st.base);
  grad.addColorStop(1, st.dark);
  g.fillStyle = grad;
  g.fillRect(0, 0, SPR, SPR);
  if (l === 12) {
    const cg = g.createConicGradient(0, cx, cy);
    ['#FFB3C8', '#FFE1A0', '#B8F0C8', '#A8D8FF', '#D8B8FF', '#FFB3C8'].forEach((col, i) => cg.addColorStop(i / 5, col));
    g.globalAlpha = 0.85;
    g.fillStyle = cg;
    g.fillRect(0, 0, SPR, SPR);
    g.globalAlpha = 1;
  }
  // 材质纹理
  switch (l) {
    case 1: // 砂岩：细颗粒 + 一道刻线
      for (let i = 0; i < 140; i++) {
        g.fillStyle = rng.chance(0.5) ? 'rgba(90,60,30,0.22)' : 'rgba(255,250,230,0.3)';
        g.fillRect(cx - r + rng.next() * 2 * r, cy - r + rng.next() * 2 * r, 0.8, 0.8);
      }
      g.strokeStyle = 'rgba(90,60,30,0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(cx, cy, r - 3, -0.6, 0.9);
      g.stroke();
      break;
    case 2: // 赭陶：一圈压印点纹
      g.fillStyle = 'rgba(60,20,5,0.4)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), i === 0 ? 1.9 : 1.3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 3: // 青金石：金色星点
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(255,${200 + rng.int(0, 40)},110,${0.5 + rng.next() * 0.5})`;
        const a = rng.next() * Math.PI * 2, d = rng.next() * r;
        g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.1, 1.1);
      }
      g.strokeStyle = 'rgba(255,220,140,0.5)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(cx - r, cy + 6);
      g.quadraticCurveTo(cx, cy - 2, cx + r, cy + 9);
      g.stroke();
      break;
    case 4: // 翡翠：云絮
    case 7: // 孔雀石：同心条带
      if (l === 4) {
        for (let i = 0; i < 6; i++) {
          g.fillStyle = `rgba(200,255,225,${0.08 + rng.next() * 0.1})`;
          g.beginPath();
          g.ellipse(cx - r + rng.next() * 2 * r, cy - r + rng.next() * 2 * r, 4 + rng.next() * 7, 2 + rng.next() * 3, rng.next() * 3, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = k % 2 ? 'rgba(0,40,36,0.35)' : 'rgba(170,255,240,0.25)';
          g.lineWidth = 1.6;
          g.beginPath();
          g.arc(cx + 9, cy + 7, 5 + k * 5, 0, Math.PI * 2);
          g.stroke();
        }
      }
      break;
    case 5: // 紫晶：刻面
      g.strokeStyle = 'rgba(255,240,255,0.35)';
      g.lineWidth = 0.9;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.stroke();
      }
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        g.lineTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
      }
      g.stroke();
      break;
    case 6: // 朱砂：回纹刻环
      g.strokeStyle = 'rgba(255,220,190,0.45)';
      g.lineWidth = 1.1;
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2;
        const a1 = a0 + Math.PI / 10;
        const r1 = r - 2.5, r2 = r - 6;
        g.beginPath();
        g.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1);
        g.lineTo(cx + Math.cos(a0) * r2, cy + Math.sin(a0) * r2);
        g.lineTo(cx + Math.cos(a1) * r2, cy + Math.sin(a1) * r2);
        g.lineTo(cx + Math.cos(a1) * (r1 - 1.5), cy + Math.sin(a1) * (r1 - 1.5));
        g.stroke();
      }
      break;
    case 8: // 琥珀：气泡
      for (let i = 0; i < 7; i++) {
        const x = cx - r + rng.next() * 2 * r, y = cy - r + rng.next() * 2 * r, rr = 0.8 + rng.next() * 2;
        g.strokeStyle = 'rgba(255,240,200,0.55)';
        g.lineWidth = 0.6;
        g.beginPath();
        g.arc(x, y, rr, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 9: // 黑曜石：金色裂纹
      g.strokeStyle = 'rgba(240,190,90,0.85)';
      g.lineWidth = 0.9;
      for (let k = 0; k < 4; k++) {
        let x = cx + (rng.next() - 0.5) * 10, y = cy + (rng.next() - 0.5) * 10;
        g.beginPath();
        g.moveTo(x, y);
        let a = rng.next() * Math.PI * 2;
        for (let s = 0; s < 6; s++) {
          a += (rng.next() - 0.5) * 1.2;
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case 10: // 鎏金：金属条带
      for (let k = -3; k <= 3; k++) {
        g.fillStyle = k % 2 ? 'rgba(255,250,220,0.22)' : 'rgba(120,70,10,0.18)';
        g.fillRect(cx - r, cy + k * 6 - 1.5, 2 * r, 3);
      }
      break;
    case 11: // 日轮：放射纹
      g.strokeStyle = 'rgba(230,150,40,0.35)';
      g.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.stroke();
      }
      break;
    default:
      break;
  }
  // 内盘（数字底座）：轻微凹陷感
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r - 1.2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  return c;
}

function bakeShade(translucent: boolean): HTMLCanvasElement {
  const [c, g] = mk(SPR);
  const cx = SPR / 2, cy = SPR / 2, r = BALL_R;
  // 接触阴影（画在球外下方）
  const sh = g.createRadialGradient(cx + 1.5, cy + 4, r * 0.6, cx + 1.5, cy + 4, r + 5);
  sh.addColorStop(0, 'rgba(10,25,18,0.45)');
  sh.addColorStop(1, 'rgba(10,25,18,0)');
  g.fillStyle = sh;
  g.globalCompositeOperation = 'source-over';
  g.beginPath();
  g.arc(cx + 1.5, cy + 4, r + 5, 0, Math.PI * 2);
  g.fill();
  // 挖掉球体本身（阴影只在外面）
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  // 暗部（左下）—— 夕照来自右上
  const dk = g.createRadialGradient(cx + 7, cy - 8, r * 0.3, cx + 2, cy - 2, r * 1.25);
  dk.addColorStop(0, 'rgba(0,0,0,0)');
  dk.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  dk.addColorStop(1, 'rgba(8,16,10,0.5)');
  g.fillStyle = dk;
  g.fillRect(0, 0, SPR, SPR);
  if (translucent) {
    // 内部透光月牙（亮在暗部一侧）
    const tg = g.createRadialGradient(cx - 6, cy + 8, 1, cx - 6, cy + 8, r * 0.75);
    tg.addColorStop(0, 'rgba(255,255,220,0.35)');
    tg.addColorStop(1, 'rgba(255,255,220,0)');
    g.fillStyle = tg;
    g.fillRect(0, 0, SPR, SPR);
  }
  // 暖色边缘环境光（右上）
  g.strokeStyle = 'rgba(255,200,140,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r - 1, -1.6, 0.2);
  g.stroke();
  // 主高光
  const hl = g.createRadialGradient(cx + 6, cy - 9, 0.5, cx + 6, cy - 9, 8);
  hl.addColorStop(0, 'rgba(255,255,245,0.85)');
  hl.addColorStop(0.4, 'rgba(255,250,230,0.3)');
  hl.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, SPR, SPR);
  // 底部反光
  g.strokeStyle = 'rgba(180,255,210,0.18)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, r - 2.5, 1.9, 2.9);
  g.stroke();
  g.restore();
  // 外描边
  g.strokeStyle = 'rgba(10,20,14,0.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, r - 0.3, 0, Math.PI * 2);
  g.stroke();
  return c;
}

const NUM_SIZES = [0, 23, 21, 19, 16, 14];

export function numFontSize(text: string): number {
  return NUM_SIZES[Math.min(5, text.length)]!;
}

function bakeNum(l: number): HTMLCanvasElement {
  const st = levelStyle(l);
  const [c, g] = mk(SPR);
  const t = label(l);
  const fs = numFontSize(t);
  g.font = `800 ${fs}px ${FONT_NUM}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cx = SPR / 2, cy = SPR / 2 + 0.5;
  // 收窄超宽文本
  const w = g.measureText(t).width;
  const maxW = 30;
  g.save();
  g.translate(cx, cy);
  if (w > maxW) g.scale(maxW / w, 1);
  g.lineJoin = 'round';
  if (st.lightText) {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(10,12,8,0.55)';
    g.strokeText(t, 0, 0.8);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillText(t, 0, 1.2);
  } else {
    g.lineWidth = 2.4;
    g.strokeStyle = 'rgba(255,250,235,0.55)';
    g.strokeText(t, 0, 0.6);
  }
  g.fillStyle = st.text;
  g.fillText(t, 0, 0);
  g.restore();
  return c;
}

function bakeGlow(rgbaPrefix: string, r: number): HTMLCanvasElement {
  const [c, g] = mk(r * 2);
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, rgbaPrefix + '0.9)');
  gr.addColorStop(0.35, rgbaPrefix + '0.45)');
  gr.addColorStop(1, rgbaPrefix + '0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

function bakeRing(): HTMLCanvasElement {
  const S2 = 60;
  const [c, g] = mk(S2);
  g.strokeStyle = 'rgba(255,220,120,0.95)';
  g.lineWidth = 2;
  g.shadowColor = 'rgba(255,200,90,0.9)';
  g.shadowBlur = 6 * bakeScale;
  g.beginPath();
  g.arc(S2 / 2, S2 / 2, 23.5, 0, Math.PI * 2);
  g.stroke();
  return c;
}

function bakeRays(): HTMLCanvasElement {
  const S2 = 80;
  const [c, g] = mk(S2);
  const cx = S2 / 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const gr = g.createLinearGradient(cx, cx, cx + Math.cos(a) * 38, cx + Math.sin(a) * 38);
    gr.addColorStop(0, 'rgba(255,230,150,0.9)');
    gr.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx + Math.cos(a - 0.12) * 18, cx + Math.sin(a - 0.12) * 18);
    g.lineTo(cx + Math.cos(a) * 38, cx + Math.sin(a) * 38);
    g.lineTo(cx + Math.cos(a + 0.12) * 18, cx + Math.sin(a + 0.12) * 18);
    g.closePath();
    g.fill();
  }
  return c;
}
