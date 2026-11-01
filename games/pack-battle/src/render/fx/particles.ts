// 粒子池：纸屑、灰尘、火花、叶、气泡、星、金币、墨点、碎片、余烬、火焰、蒸汽
import { frand, frange } from '../../core/rng.ts';
import { Pool } from '../../core/pool.ts';
import { C } from '../kit.ts';
import { makeCanvas } from '../text.ts';

export type PKind = 'confetti' | 'dust' | 'spark' | 'leaf' | 'bubble' | 'star' | 'coin' | 'ink' | 'shard' | 'ember' | 'flame' | 'steam' | 'mote';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  alpha: number;
  /** 屏幕层（不随震屏） */
  ui: boolean;
}

export const particles = new Pool<Particle>(
  () => ({ kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, color: '#fff', alpha: 1, ui: false }),
  400,
  160,
);

let capScale = 1;
export function setParticleCap(k: number): void {
  capScale = k;
}

let glow: HTMLCanvasElement | null = null;
function glowSprite(): HTMLCanvasElement {
  if (!glow) {
    const [c, ctx] = makeCanvas(32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    glow = c;
  }
  return glow;
}

const tinted = new Map<string, HTMLCanvasElement>();
export function glowOf(color: string): HTMLCanvasElement {
  let c = tinted.get(color);
  if (!c) {
    const [cv, ctx] = makeCanvas(32, 32);
    ctx.drawImage(glowSprite(), 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 32, 32);
    // 白色芯
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 6);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tinted.set(color, (c = cv));
  }
  return c;
}

const CONFETTI = ['#c2402c', '#e2a533', '#4f7fa8', '#6f9d3c', '#f0e3c2', '#7e4fa0'];

export function emit(kind: PKind, x: number, y: number, n: number, o: { color?: string; speed?: number; spread?: number; angle?: number; size?: number; life?: number; g?: number; ui?: boolean } = {}): void {
  const cnt = Math.max(1, Math.round(n * capScale));
  for (let i = 0; i < cnt; i++) {
    const p = particles.get();
    p.kind = kind;
    p.x = x + frange(-1, 1) * (o.spread ?? 0);
    p.y = y + frange(-1, 1) * (o.spread ?? 0) * 0.6;
    const sp = (o.speed ?? 120) * frange(0.45, 1.1);
    const ang = o.angle !== undefined ? o.angle + frange(-0.6, 0.6) : frand() * Math.PI * 2;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.g = o.g ?? 0;
    p.drag = 2;
    p.max = p.life = (o.life ?? 0.8) * frange(0.7, 1.2);
    p.size = (o.size ?? 3) * frange(0.7, 1.3);
    p.rot = frand() * Math.PI * 2;
    p.vr = frange(-8, 8);
    p.color = o.color ?? '#fff';
    p.alpha = 1;
    p.ui = o.ui ?? false;
    switch (kind) {
      case 'confetti':
        p.color = o.color ?? CONFETTI[Math.floor(frand() * CONFETTI.length)];
        p.g = o.g ?? 380;
        p.drag = 1.6;
        break;
      case 'dust':
        p.color = o.color ?? 'rgba(220,200,170,1)';
        p.drag = 3;
        p.g = o.g ?? -10;
        break;
      case 'ink':
        p.color = o.color ?? C.ink;
        p.g = o.g ?? 420;
        p.drag = 1.2;
        break;
      case 'coin':
        p.color = C.gold;
        p.g = o.g ?? 520;
        p.drag = 0.6;
        p.vr = frange(-14, 14);
        break;
      case 'leaf':
        p.color = o.color ?? C.heal;
        p.g = o.g ?? -40;
        p.drag = 2.4;
        break;
      case 'bubble':
        p.color = o.color ?? C.poisonLight;
        p.g = o.g ?? -60;
        p.drag = 2;
        break;
      case 'ember':
      case 'flame':
        p.color = o.color ?? (frand() < 0.5 ? '#ff9a3a' : '#ffd36b');
        p.g = o.g ?? -80;
        p.drag = 1.8;
        break;
      case 'steam':
        p.color = o.color ?? 'rgba(235,235,230,1)';
        p.g = o.g ?? -50;
        p.drag = 1.5;
        break;
      case 'mote':
        p.color = o.color ?? '#ffd08a';
        p.drag = 0.2;
        break;
      default:
        break;
    }
  }
}

export function updateParticles(dt: number): void {
  const live = particles.live;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.releaseAt(i);
      continue;
    }
    const dk = Math.max(0, 1 - p.drag * dt);
    p.vx *= dk;
    p.vy = p.vy * dk + p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.kind === 'leaf' || p.kind === 'confetti') p.vx += Math.sin(p.life * 7 + p.rot) * 30 * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, ui: boolean): void {
  const live = particles.live;
  for (let i = 0; i < live.length; i++) {
    const p = live[i];
    if (p.ui !== ui) continue;
    const t = p.life / p.max;
    const a = Math.min(1, t * 2.5) * p.alpha;
    switch (p.kind) {
      case 'spark':
      case 'ember':
      case 'flame':
      case 'mote':
      case 'star': {
        const s = p.size * (p.kind === 'flame' ? 2.2 + (1 - t) * 2 : p.kind === 'mote' ? 1.6 : 2.4) * (p.kind === 'star' ? 1 : 0.6 + t * 0.4);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (p.kind === 'mote' ? 0.35 : 0.9);
        ctx.drawImage(glowOf(p.color), p.x - s, p.y - s, s * 2, s * 2);
        ctx.globalCompositeOperation = 'source-over';
        if (p.kind === 'star') {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const r = p.size;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const rr = k % 2 === 0 ? r : r * 0.4;
            const ang = (k / 8) * Math.PI * 2;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'confetti':
      case 'shard': {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const w = p.size * (p.kind === 'shard' ? 1.2 : 1.6);
        ctx.scale(1, Math.abs(Math.sin(p.rot * 1.3)) * 0.8 + 0.2);
        if (p.kind === 'shard') {
          ctx.beginPath();
          ctx.moveTo(-w, -w * 0.4);
          ctx.lineTo(w, 0);
          ctx.lineTo(-w * 0.3, w * 0.6);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(-w, -w * 0.6, w * 2, w * 1.2);
        ctx.restore();
        break;
      }
      case 'coin': {
        ctx.globalAlpha = a;
        const sx = Math.abs(Math.cos(p.rot));
        ctx.fillStyle = C.goldDark;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 0.8, p.size * sx + 0.5, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.goldLight;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * sx + 0.3, p.size * 0.92, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'leaf': {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'bubble': {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.3;
        ctx.fill();
        break;
      }
      case 'steam':
      case 'dust': {
        ctx.globalAlpha = a * (p.kind === 'dust' ? 0.45 : 0.35);
        ctx.fillStyle = p.color;
        const r = p.size * (1 + (1 - t) * 1.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ink': {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.4), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}
