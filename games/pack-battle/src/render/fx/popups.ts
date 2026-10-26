// 跳字池（伤害、回复、护盾、金币、标签）
import { Pool } from '../../core/pool.ts';
import { C } from '../kit.ts';
import { HAND, CN, text } from '../text.ts';

export interface Popup {
  x: number;
  y: number;
  vy: number;
  s: string;
  color: string;
  size: number;
  life: number;
  max: number;
  cn: boolean;
  ui: boolean;
  delay: number;
  /** 深色衬底 + 加粗描边（立牌白闪时也读得清） */
  heavy: boolean;
}

export const popups = new Pool<Popup>(
  () => ({ x: 0, y: 0, vy: 0, s: '', color: '#fff', size: 20, life: 0, max: 1, cn: false, ui: false, delay: 0, heavy: false }),
  40,
  20,
);

export function popup(s: string, x: number, y: number, color: string, size = 20, o: { cn?: boolean; ui?: boolean; life?: number; vy?: number; delay?: number; heavy?: boolean } = {}): void {
  const p = popups.get();
  p.s = s;
  p.x = x;
  p.y = y;
  p.color = color;
  p.size = size;
  p.max = p.life = o.life ?? 0.9;
  p.vy = o.vy ?? -38;
  p.cn = o.cn ?? false;
  p.ui = o.ui ?? false;
  p.delay = o.delay ?? 0;
  p.heavy = o.heavy ?? false;
}

export function updatePopups(dt: number): void {
  const live = popups.live;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    p.life -= dt;
    if (p.life <= 0) {
      popups.releaseAt(i);
      continue;
    }
    p.y += p.vy * dt;
    p.vy *= Math.max(0, 1 - 2.2 * dt);
  }
}

export function drawPopups(ctx: CanvasRenderingContext2D, ui: boolean): void {
  const live = popups.live;
  for (let i = 0; i < live.length; i++) {
    const p = live[i];
    if (p.ui !== ui || p.delay > 0) continue;
    const age = p.max - p.life;
    const k = age < 0.12 ? 1.45 - (age / 0.12) * 0.45 : 1;
    const a = p.life < p.max * 0.35 ? p.life / (p.max * 0.35) : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(k, k);
    if (p.heavy) {
      const w = p.s.length * p.size * 0.5 + 12;
      const h = p.size + 4;
      ctx.fillStyle = `rgba(20,10,4,${(0.55 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
    }
    text(ctx, p.s, 0, 0, {
      size: p.size,
      weight: p.cn ? 900 : 400,
      family: p.cn ? CN : HAND,
      color: p.color,
      stroke: C.ink,
      strokeW: Math.max(3, p.size * (p.heavy ? 0.28 : 0.2)),
      alpha: a,
    });
    ctx.restore();
  }
}
