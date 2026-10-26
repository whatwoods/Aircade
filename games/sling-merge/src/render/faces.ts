/**
 * 表情绘制（docs §4.5）：每级待机脸 + 12 种一次性/持续表情；LOD；眨眼；视线。
 * 坐标：原点 = 果心，单位逻辑 px；调用方已完成 应变 · 缩放 · 视觉旋转 变换。
 */
import { fruitDef, type EyeType, type MouthType } from '../config';
import type { Expression } from '../game/fruits';
import { sparklePath, starPath } from './util';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const INK = '#3B2340';
const BLUSH = '#FF7A9A';
const TONGUE = '#FF7A9A';
const MOUTH_IN = '#B8325A';

export interface FaceState {
  expr: Expression;
  /** 视线偏移（-1..1） */
  lookX: number;
  lookY: number;
  /** 眼睛张开度（眨眼 0.1..1） */
  open: number;
  wink: boolean;
  t: number;
  /** 腮红强度倍数 */
  blush: number;
}

const tmpState: FaceState = { expr: 'idle', lookX: 0, lookY: 0, open: 1, wink: false, t: 0, blush: 1 };

/** 小果的五官放大系数（L1/L2 更易读） */
function faceK(r: number): number {
  if (r <= 14) return 1.4;
  if (r < 24) return 1 + ((24 - r) / 10) * 0.25;
  return 1;
}

export function drawIdleFace(ctx: C, level: number, r: number): void {
  tmpState.expr = 'idle';
  tmpState.lookX = 0;
  tmpState.lookY = level === 1 ? 0.6 : 0;
  tmpState.open = 1;
  tmpState.wink = false;
  tmpState.t = 0;
  tmpState.blush = 1;
  drawFace(ctx, level, r, tmpState);
}

export function drawFace(ctx: C, level: number, r: number, s: FaceState): void {
  const def = fruitDef(level);
  const k = faceK(r);
  const lod = r < 16;
  const fy = 0.12 * r;
  const ex = 0.3 * r * Math.min(k, 1.15);
  const lx = s.lookX * 0.05 * r;
  const ly = s.lookY * 0.05 * r;
  const lw = Math.max(1.4, 0.05 * r) * (lod ? 0.9 : 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const e = s.expr;
  const king = level === 11;
  const extras = def.face.extras;

  // ── 腮红 ──
  if (!lod || extras.includes('bigBlush')) {
    const big = extras.includes('bigBlush');
    let a = (big ? 0.55 : 0.45) * s.blush;
    if (e === 'kiss') a = 0.8;
    if (e === 'dead' || e === 'sad') a *= 0.6;
    if (e === 'panic') a = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(s.t * 18));
    const a0 = ctx.globalAlpha; // 继承外层淡出（转场中的吉祥物、破裂中的果）
    ctx.globalAlpha = a0 * Math.min(1, a);
    ctx.fillStyle = e === 'panic' ? '#FF3B5C' : BLUSH;
    const bw = 0.08 * r * k * (big ? 1.25 : 1);
    const bh = 0.045 * r * k * (big ? 1.25 : 1);
    const bx = 0.47 * r * Math.min(k, 1.1);
    const by = fy + 0.14 * r;
    ctx.beginPath();
    ctx.ellipse(-bx, by, bw, bh, 0, 0, TAU);
    ctx.ellipse(bx, by, bw, bh, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = a0;
  }

  // ── 眼睛 ──
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  if (king) {
    eyesStar(ctx, r, ex, fy, lx, ly, s.open, k);
  } else {
    switch (e) {
      case 'hit':
        eyesChevron(ctx, r, ex, fy, lw, k);
        break;
      case 'dizzy':
        eyesSpiral(ctx, r, ex, fy, lw, s.t);
        break;
      case 'dead':
        eyesX(ctx, r, ex, fy, lw, k);
        break;
      case 'sad':
        eyesT(ctx, r, ex, fy, lw, k);
        break;
      case 'panic':
        eyesPanic(ctx, r, ex, fy, lx, ly, k, lw);
        break;
      case 'fuse':
        eyesHappy(ctx, r, ex, fy, lw, k);
        break;
      case 'relief':
        eyesClosed(ctx, r, ex, fy, lw, k);
        break;
      case 'sleepy':
        eyesLidded(ctx, r, ex, fy, lx, ly, 0.42 * s.open, k, lw, lod);
        break;
      case 'born':
        eyesOval(ctx, r, ex, fy, lx, ly, s.open, k * 1.22, lod, 'sparkle');
        break;
      case 'kiss':
        eyesOval(ctx, r, ex, fy, lx, ly, s.open, k * 1.08, lod, 'sparkle');
        break;
      case 'worried':
        eyesOval(ctx, r, ex, fy, lx, 0.05 * r, s.open, k * 0.95, lod, 'dots');
        break;
      default:
        idleEyes(ctx, def.face.eyes, r, ex, fy, lx, ly, s, k, lw, lod);
    }
  }

  // ── 眉毛 ──
  if (!lod) {
    const by = fy - 0.2 * r * Math.min(k, 1.1);
    const bl = 0.075 * r * k;
    ctx.lineWidth = lw * 0.9;
    ctx.strokeStyle = INK;
    if (e === 'worried') {
      brow(ctx, -ex, by, bl, 0.35);
      brow(ctx, ex, by, bl, -0.35);
    } else if (e === 'panic') {
      ctx.beginPath();
      ctx.arc(-ex, by - 0.03 * r, bl, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, by - 0.03 * r, bl, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (e === 'idle' || e === 'kiss') {
      if (extras.includes('browSassy')) {
        ctx.beginPath();
        ctx.arc(-ex, by + 0.01 * r, bl, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        brow(ctx, ex, by + 0.035 * r, bl, -0.12);
      } else if (extras.includes('browBold')) {
        ctx.lineWidth = lw * 1.7;
        brow(ctx, -ex, by + 0.01 * r, bl * 1.1, -0.28);
        brow(ctx, ex, by + 0.01 * r, bl * 1.1, 0.28);
      } else if (extras.includes('brow')) {
        brow(ctx, -ex, by, bl, 0);
        brow(ctx, ex, by, bl, 0);
      }
    }
  }

  // ── 嘴 ──
  const my = fy + 0.21 * r * Math.min(k, 1.1);
  const mw = 0.18 * r * k;
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  let m: MouthType | 'o' | 'wave' | 'kiss3' | 'O' | 'frown' | 'D' | 'zz' = def.face.mouth;
  switch (e) {
    case 'hit':
      m = 'o';
      break;
    case 'dizzy':
    case 'dead':
    case 'worried':
      m = 'wave';
      break;
    case 'kiss':
      m = 'kiss3';
      break;
    case 'born':
    case 'fuse':
      m = 'D';
      break;
    case 'panic':
      m = 'O';
      break;
    case 'sad':
      m = 'frown';
      break;
    case 'sleepy':
      m = 'zz';
      break;
    case 'relief':
      m = 'soft';
      break;
    default:
      break;
  }
  if (lod && (m === 'cat' || m === 'smile' || m === 'soft' || m === 'calm' || m === 'u')) m = 'smile';
  mouth(ctx, m, my, mw, lw, s.t);

  // ── 附加：汗滴 / 眩晕星 ──
  if (e === 'worried' || e === 'panic') {
    const sx = 0.58 * r;
    const sy = fy - 0.22 * r + (e === 'panic' ? Math.sin(s.t * 9) * 0.02 * r : 0);
    const ss = Math.max(2.4, 0.09 * r);
    ctx.fillStyle = '#9BE3F5';
    ctx.strokeStyle = '#4FB3D9';
    ctx.lineWidth = Math.max(1, 0.025 * r);
    ctx.beginPath();
    ctx.moveTo(sx, sy - ss * 1.3);
    ctx.bezierCurveTo(sx + ss * 0.4, sy - ss * 0.6, sx + ss, sy, sx + ss, sy + ss * 0.35);
    ctx.arc(sx, sy + ss * 0.35, ss, 0, Math.PI, false);
    ctx.bezierCurveTo(sx - ss, sy, sx - ss * 0.4, sy - ss * 0.6, sx, sy - ss * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(sx - ss * 0.35, sy + ss * 0.25, ss * 0.28, 0, TAU);
    ctx.fill();
  }
  if (e === 'dizzy') {
    const oy = -r * 1.02;
    for (let i = 0; i < 3; i++) {
      const a = s.t * 5 + (i * TAU) / 3;
      const x = Math.cos(a) * r * 0.55;
      const y = oy + Math.sin(a) * r * 0.16;
      const sz = Math.max(3, 0.11 * r) * (0.8 + 0.25 * Math.sin(a));
      ctx.beginPath();
      starPath(ctx, x, y, sz, sz * 0.45, 5, a);
      ctx.fillStyle = '#FFE15A';
      ctx.fill();
      ctx.strokeStyle = '#F2A100';
      ctx.lineWidth = Math.max(1, sz * 0.22);
      ctx.stroke();
    }
  }
}

function brow(ctx: C, x: number, y: number, l: number, tilt: number): void {
  // tilt > 0：外低内高（担忧）；< 0：外高内低
  const side = x < 0 ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x + side * l, y + tilt * l);
  ctx.lineTo(x - side * l, y - tilt * l);
  ctx.stroke();
}

function idleEyes(
  ctx: C, type: EyeType, r: number, ex: number, fy: number, lx: number, ly: number, s: FaceState, k: number, lw: number, lod: boolean,
): void {
  switch (type) {
    case 'dot': {
      const rr = 0.075 * r * k;
      for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
        ctx.beginPath();
        ctx.ellipse(side * ex + lx, fy + ly, rr, rr * Math.max(0.12, s.open), 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'lidded':
      eyesLidded(ctx, r, ex, fy, lx, ly, 0.62 * s.open, k, lw, lod);
      break;
    case 'dreamy':
      eyesLidded(ctx, r, ex, fy, lx, ly, 0.45 * s.open, k, lw, lod);
      break;
    case 'lash':
      eyesOval(ctx, r, ex, fy, lx, ly, s.open, k, lod, 'dots');
      if (s.open > 0.5) {
        ctx.lineWidth = lw * 0.7;
        for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
          const cx = side * ex + lx;
          const cy = fy + ly - 0.08 * r;
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + side * (0.45 + i * 0.32);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 0.07 * r, cy + Math.sin(a) * 0.07 * r);
            ctx.lineTo(cx + Math.cos(a) * 0.13 * r, cy + Math.sin(a) * 0.13 * r);
            ctx.stroke();
          }
        }
      }
      break;
    case 'sparkle':
      eyesOval(ctx, r, ex, fy, lx, ly, s.open, k * 1.05, lod, 'sparkle');
      break;
    case 'happy':
      eyesHappy(ctx, r, ex, fy, lw, k);
      break;
    case 'star':
      eyesStar(ctx, r, ex, fy, lx, ly, s.open, k);
      break;
    case 'oval':
    default:
      if (s.wink) {
        eyesOval(ctx, r, ex, fy, lx, ly, s.open, k, lod, 'dots', 1);
        ctx.lineWidth = lw;
        ctx.beginPath();
        const cx = -ex;
        ctx.moveTo(cx - 0.08 * r * k, fy + 0.01 * r);
        ctx.quadraticCurveTo(cx, fy - 0.08 * r * k, cx + 0.08 * r * k, fy + 0.01 * r);
        ctx.stroke();
      } else {
        eyesOval(ctx, r, ex, fy, lx, ly, s.open, k, lod, 'dots');
      }
  }
}

function eyesOval(
  ctx: C, r: number, ex: number, fy: number, lx: number, ly: number, open: number, k: number, lod: boolean,
  hl: 'dots' | 'sparkle', only?: 1,
): void {
  const rx = 0.08 * r * k;
  const ry = 0.11 * r * k;
  const o = Math.max(0.1, open);
  for (let si = only ? 1 : 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex + lx;
    const cy = fy + ly;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry * o, 0, 0, TAU);
    ctx.fill();
    if (lod || o < 0.55) continue;
    ctx.fillStyle = '#FFFFFF';
    if (hl === 'sparkle') {
      ctx.beginPath();
      sparklePath(ctx, cx - 0.025 * r * k, cy - 0.04 * r * k, 0.07 * r * k);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 0.03 * r * k, cy + 0.045 * r * k, 0.022 * r * k, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx - 0.03 * r * k, cy - 0.05 * r * k, 0.045 * r * k, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 0.03 * r * k, cy + 0.04 * r * k, 0.02 * r * k, 0, TAU);
      ctx.fill();
    }
  }
}

function eyesLidded(ctx: C, r: number, ex: number, fy: number, lx: number, ly: number, open: number, k: number, lw: number, lod: boolean): void {
  const rx = 0.085 * r * k;
  const ry = 0.11 * r * k;
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex + lx * 0.6;
    const cy = fy + ly * 0.6;
    const top = cy + ry - 2 * ry * open;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - rx * 1.5, top, rx * 3, ry * 3);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    if (!lod && open > 0.35) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx + 0.02 * r * k, cy + 0.035 * r * k, 0.025 * r * k, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.25, top + 0.012 * r);
    ctx.quadraticCurveTo(cx, top - 0.025 * r, cx + rx * 1.25, top + 0.012 * r);
    ctx.stroke();
  }
}

function eyesHappy(ctx: C, r: number, ex: number, fy: number, lw: number, k: number): void {
  const w = 0.085 * r * k;
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.moveTo(cx - w, fy + 0.03 * r);
    ctx.quadraticCurveTo(cx, fy - 0.1 * r * k, cx + w, fy + 0.03 * r);
  }
  ctx.stroke();
}

function eyesClosed(ctx: C, r: number, ex: number, fy: number, lw: number, k: number): void {
  const w = 0.085 * r * k;
  ctx.lineWidth = lw * 1.05;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.moveTo(cx - w, fy - 0.01 * r);
    ctx.quadraticCurveTo(cx, fy + 0.08 * r * k, cx + w, fy - 0.01 * r);
  }
  ctx.stroke();
}

function eyesChevron(ctx: C, r: number, ex: number, fy: number, lw: number, k: number): void {
  const w = 0.085 * r * k;
  const h = 0.075 * r * k;
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  // 左眼 >  右眼 <
  ctx.moveTo(-ex - w, fy - h);
  ctx.lineTo(-ex + w, fy);
  ctx.lineTo(-ex - w, fy + h);
  ctx.moveTo(ex + w, fy - h);
  ctx.lineTo(ex - w, fy);
  ctx.lineTo(ex + w, fy + h);
  ctx.stroke();
}

function eyesX(ctx: C, r: number, ex: number, fy: number, lw: number, k: number): void {
  const w = 0.075 * r * k;
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.moveTo(cx - w, fy - w);
    ctx.lineTo(cx + w, fy + w);
    ctx.moveTo(cx + w, fy - w);
    ctx.lineTo(cx - w, fy + w);
  }
  ctx.stroke();
}

function eyesT(ctx: C, r: number, ex: number, fy: number, lw: number, k: number): void {
  const w = 0.1 * r * k;
  ctx.lineWidth = lw * 1.1;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.moveTo(cx - w, fy - 0.04 * r);
    ctx.lineTo(cx + w, fy - 0.04 * r);
    ctx.moveTo(cx, fy - 0.04 * r);
    ctx.lineTo(cx, fy + 0.1 * r * k);
  }
  ctx.stroke();
  // 泪痕
  ctx.strokeStyle = 'rgba(143,211,255,0.85)';
  ctx.lineWidth = lw * 1.3;
  ctx.beginPath();
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.moveTo(cx, fy + 0.13 * r * k);
    ctx.lineTo(cx, fy + 0.26 * r * k);
  }
  ctx.stroke();
}

function eyesPanic(ctx: C, r: number, ex: number, fy: number, lx: number, ly: number, k: number, lw: number): void {
  const rr = 0.115 * r * k;
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, fy, rr, 0, TAU);
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx + lx * 0.6, fy + ly * 0.6, 0.035 * r * k, 0, TAU);
    ctx.fill();
  }
}

function eyesSpiral(ctx: C, r: number, ex: number, fy: number, lw: number, t: number): void {
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = INK;
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex;
    ctx.beginPath();
    const rot = t * 9 * side;
    const R = 0.1 * r;
    for (let i = 0; i <= 24; i++) {
      const a = rot + (i / 24) * TAU * 2;
      const rr = (i / 24) * R;
      const x = cx + Math.cos(a) * rr;
      const y = fy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function eyesStar(ctx: C, r: number, ex: number, fy: number, lx: number, ly: number, open: number, k: number): void {
  const ro = 0.135 * r * k;
  const o = Math.max(0.15, open);
  for (let si = 0; si < 2; si++) {
    const side = si * 2 - 1;
    const cx = side * ex + lx;
    const cy = fy + ly;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, o);
    ctx.beginPath();
    starPath(ctx, 0, 0, ro, ro * 0.5, 5);
    ctx.fillStyle = '#FFC93C';
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, 0.03 * r);
    ctx.strokeStyle = '#3B2340';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    sparklePath(ctx, -ro * 0.25, -ro * 0.25, ro * 0.38);
    ctx.fill();
    ctx.restore();
  }
}

function mouth(
  ctx: C, m: MouthType | 'o' | 'wave' | 'kiss3' | 'O' | 'frown' | 'D' | 'zz', my: number, w: number, lw: number, t: number,
): void {
  const h = w * 0.5;
  switch (m) {
    case 'cat': {
      const q = w * 0.26;
      ctx.beginPath();
      ctx.moveTo(-2 * q, my - q * 0.35);
      ctx.quadraticCurveTo(-q, my + q * 1.3, 0, my - q * 0.1);
      ctx.quadraticCurveTo(q, my + q * 1.3, 2 * q, my - q * 0.35);
      ctx.stroke();
      break;
    }
    case 'smile':
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, my - h * 0.15);
      ctx.quadraticCurveTo(0, my + h * 0.75, w * 0.5, my - h * 0.15);
      ctx.stroke();
      break;
    case 'soft':
    case 'calm':
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, my - h * 0.05);
      ctx.quadraticCurveTo(0, my + h * (m === 'soft' ? 0.6 : 0.45), w * 0.38, my - h * 0.05);
      ctx.stroke();
      break;
    case 'u':
      ctx.beginPath();
      ctx.moveTo(-w * 0.26, my - h * 0.2);
      ctx.quadraticCurveTo(0, my + h * 0.85, w * 0.26, my - h * 0.2);
      ctx.stroke();
      break;
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, my + h * 0.05);
      ctx.quadraticCurveTo(w * 0.05, my + h * 0.65, w * 0.5, my - h * 0.45);
      ctx.stroke();
      break;
    case 'tongue': {
      // 开口小笑 + 舌尖
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, my - h * 0.2);
      ctx.quadraticCurveTo(0, my - h * 0.05, w * 0.45, my - h * 0.2);
      ctx.quadraticCurveTo(w * 0.3, my + h * 0.95, 0, my + h * 0.95);
      ctx.quadraticCurveTo(-w * 0.3, my + h * 0.95, -w * 0.45, my - h * 0.2);
      ctx.closePath();
      ctx.fillStyle = MOUTH_IN;
      ctx.fill();
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(w * 0.08, my + h * 0.62, w * 0.2, h * 0.32, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'grin':
    case 'D':
    case 'laugh':
    case 'king':
    case 'teeth': {
      const big = m === 'laugh' || m === 'king';
      const ww = w * (big ? 0.72 : m === 'teeth' ? 0.62 : 0.55);
      const hh = h * (big ? 1.7 : m === 'D' ? 1.35 : 1.25);
      ctx.beginPath();
      ctx.moveTo(-ww, my - hh * 0.22);
      ctx.quadraticCurveTo(0, my - hh * 0.08, ww, my - hh * 0.22);
      ctx.quadraticCurveTo(ww * 0.95, my + hh * 0.95, 0, my + hh * 0.95);
      ctx.quadraticCurveTo(-ww * 0.95, my + hh * 0.95, -ww, my - hh * 0.22);
      ctx.closePath();
      ctx.fillStyle = MOUTH_IN;
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (m === 'teeth') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-ww, my - hh * 0.4, ww * 2, hh * 0.5);
        ctx.strokeStyle = 'rgba(59,35,64,0.35)';
        ctx.lineWidth = lw * 0.5;
        ctx.beginPath();
        ctx.moveTo(-ww * 0.33, my - hh * 0.2);
        ctx.lineTo(-ww * 0.33, my + hh * 0.1);
        ctx.moveTo(ww * 0.33, my - hh * 0.2);
        ctx.lineTo(ww * 0.33, my + hh * 0.1);
        ctx.stroke();
      } else {
        ctx.fillStyle = TONGUE;
        ctx.beginPath();
        ctx.ellipse(0, my + hh * 0.95, ww * 0.62, hh * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = lw * 0.85;
      ctx.strokeStyle = INK;
      ctx.stroke();
      break;
    }
    case 'o':
      ctx.fillStyle = MOUTH_IN;
      ctx.beginPath();
      ctx.ellipse(0, my + h * 0.15, w * 0.17, h * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
      break;
    case 'O':
      ctx.fillStyle = MOUTH_IN;
      ctx.beginPath();
      ctx.ellipse(0, my + h * 0.35, w * 0.26, h * 0.62 + Math.sin(t * 20) * h * 0.06, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = lw * 0.85;
      ctx.stroke();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(0, my + h * 0.72, w * 0.15, h * 0.2, 0, 0, TAU);
      ctx.fill();
      break;
    case 'wave': {
      ctx.beginPath();
      const n = 4;
      for (let i = 0; i <= n * 4; i++) {
        const x = -w * 0.45 + (i / (n * 4)) * w * 0.9;
        const y = my + h * 0.2 + Math.sin((i / (n * 4)) * TAU * 1.5) * h * 0.22;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'kiss3': {
      const q = w * 0.14;
      ctx.beginPath();
      ctx.moveTo(-q * 0.4, my - q * 1.0);
      ctx.quadraticCurveTo(q * 1.6, my - q * 1.0, q * 0.2, my);
      ctx.quadraticCurveTo(q * 1.6, my + q * 1.0, -q * 0.4, my + q * 1.0);
      ctx.stroke();
      break;
    }
    case 'frown':
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, my + h * 0.55);
      ctx.quadraticCurveTo(0, my - h * 0.35, w * 0.4, my + h * 0.55);
      ctx.stroke();
      break;
    case 'zz':
      ctx.fillStyle = MOUTH_IN;
      ctx.beginPath();
      ctx.ellipse(0, my + h * 0.2, w * 0.12, h * 0.2 * (0.8 + 0.2 * Math.sin(t * 2)), 0, 0, TAU);
      ctx.fill();
      break;
  }
}
