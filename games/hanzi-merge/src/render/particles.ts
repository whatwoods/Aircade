/** 对象池粒子（§10）：墨点溅射、墨渍、朱色碎屑、纸屑、环境墨点。无每帧分配。 */
import { CONFIG } from '../config.ts';
import { INK } from './glyphs.ts';

/** 粒子种类：Drop 飞溅墨点（落下变墨渍）/ Stain 墨渍（1.5 s 褪去）/ Confetti 朱色碎屑 / Mote 环境墨点 / Mist 水雾（洗笔） */
export const PK = { Drop: 0, Stain: 1, Confetti: 2, Mote: 3, Mist: 4 } as const;
export type PK = (typeof PK)[keyof typeof PK];

interface P {
  on: boolean;
  k: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
}

export class Particles {
  private pool: P[] = [];
  scale = 1;
  private blooms: HTMLCanvasElement[];
  constructor(blooms: HTMLCanvasElement[]) {
    this.blooms = blooms;
    for (let i = 0; i < CONFIG.fx.maxParticles; i++) {
      this.pool.push({ on: false, k: PK.Drop, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0 });
    }
  }

  spawn(k: PK, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.on) continue;
      p.on = true;
      p.k = k;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.max = life;
      p.size = size;
      p.rot = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 8;
      return;
    }
  }

  /** 墨点向外溅射 n 颗 */
  splash(x: number, y: number, n: number, speed: number): void {
    const m = Math.max(1, Math.round(n * this.scale));
    for (let i = 0; i < m; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.7);
      this.spawn(PK.Drop, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.22 + Math.random() * 0.12, 1.6 + Math.random() * 2.6);
    }
  }

  confetti(x: number, y: number, n: number, speed: number): void {
    const m = Math.max(1, Math.round(n * this.scale));
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = speed * (0.5 + Math.random() * 0.8);
      this.spawn(PK.Confetti, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.6, 2 + Math.random() * 3);
    }
  }

  mist(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      this.spawn(PK.Mist, x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 12, 0.9 + Math.random() * 0.4, 16 + Math.random() * 14);
    }
  }

  clear(): void {
    for (const p of this.pool) p.on = false;
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        if (p.k === PK.Drop) {
          // 落到纸上留墨渍
          p.k = PK.Stain;
          p.life = 1.5;
          p.max = 1.5;
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.on = false;
        continue;
      }
      if (p.k === PK.Drop) {
        p.vx *= 1 - 6 * dt;
        p.vy *= 1 - 6 * dt;
      } else if (p.k === PK.Confetti) {
        p.vy += 520 * dt;
        p.vx *= 1 - 1.5 * dt;
        p.rot += p.vr * dt;
      } else if (p.k === PK.Mist) {
        p.vx *= 1 - 2 * dt;
        p.vy *= 1 - 2 * dt;
        p.size += 18 * dt;
      } else if (p.k === PK.Mote) {
        p.vx += Math.sin(p.life * 0.7 + p.rot) * 2 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, kinds: 'paper' | 'air'): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      const t = p.life / p.max;
      if (kinds === 'paper' ? p.k !== PK.Stain && p.k !== PK.Mote : p.k === PK.Stain || p.k === PK.Mote) continue;
      if (p.k === PK.Drop || p.k === PK.Stain) {
        const a = p.k === PK.Stain ? 0.55 * Math.min(1, t * 2) : 0.85;
        const b = this.blooms[i % this.blooms.length];
        const s = p.size * (p.k === PK.Stain ? 2.4 : 2.0);
        ctx.globalAlpha = a;
        ctx.drawImage(b, p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.k === PK.Confetti) {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = i % 3 === 0 ? INK.redHi : INK.red;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else if (p.k === PK.Mist) {
        ctx.globalAlpha = 0.35 * t;
        const b = this.blooms[i % this.blooms.length];
        ctx.drawImage(b, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.k === PK.Mote) {
        ctx.globalAlpha = 0.18 * Math.sin(Math.PI * (1 - t));
        const b = this.blooms[i % this.blooms.length];
        ctx.drawImage(b, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  count(): number {
    let n = 0;
    for (const p of this.pool) if (p.on) n++;
    return n;
  }
}
