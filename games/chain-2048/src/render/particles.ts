/** 粒子系统（池化，docs §5.5）：碎屑、金粉、尘土、光尘、萤火虫、冲击波环 */
import { Rng } from '../core/rng';

export const PK = { Shard: 0, Spark: 1, Dust: 2, Ring: 3, Gold: 4 } as const;
export type PKind = (typeof PK)[keyof typeof PK];

export interface Particle {
  alive: boolean;
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  g: number;
  /** 金粉：飞向目标 */
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

const rng = new Rng(4242);

export class Particles {
  readonly pool: Particle[] = [];
  cap = 600;
  /** 金粉到达回调计数 */
  arrived = 0;

  constructor() {
    for (let i = 0; i < 700; i++) {
      this.pool.push({ alive: false, kind: PK.Shard, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, color: '#fff', g: 0, tx: 0, ty: 0, sx: 0, sy: 0, cx: 0, cy: 0 });
    }
  }

  private alloc(): Particle | null {
    let n = 0;
    for (const p of this.pool) {
      if (!p.alive) return p;
      if (++n > this.cap) return null;
    }
    return null;
  }

  count(): number {
    let n = 0;
    for (const p of this.pool) if (p.alive) n++;
    return n;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }

  shards(x: number, y: number, color: string, n: number, speed = 160): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      const a = rng.next() * Math.PI * 2, v = speed * (0.4 + rng.next() * 0.8);
      Object.assign(p, { alive: true, kind: PK.Shard, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0, max: 0.45 + rng.next() * 0.35, size: 2 + rng.next() * 3, rot: rng.next() * 6, vr: (rng.next() - 0.5) * 18, color, g: 420 });
    }
  }

  sparks(x: number, y: number, color: string, n: number, speed = 120, life = 0.5): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      const a = rng.next() * Math.PI * 2, v = speed * (0.3 + rng.next());
      Object.assign(p, { alive: true, kind: PK.Spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: life * (0.6 + rng.next() * 0.6), size: 1.5 + rng.next() * 2.5, rot: 0, vr: 0, color, g: -10 });
    }
  }

  dust(x: number, y: number, n: number, dirX = 0, dirY = 0): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      const a = rng.next() * Math.PI * 2, v = 20 + rng.next() * 50;
      Object.assign(p, { alive: true, kind: PK.Dust, x: x + (rng.next() - 0.5) * 20, y: y + (rng.next() - 0.5) * 20, vx: Math.cos(a) * v + dirX * 60, vy: Math.sin(a) * v + dirY * 60, life: 0, max: 0.7 + rng.next() * 0.6, size: 5 + rng.next() * 8, rot: 0, vr: 0, color: 'rgba(200,190,150,', g: -12 });
    }
  }

  ring(x: number, y: number, size: number, life: number, color: string): void {
    const p = this.alloc();
    if (!p) return;
    Object.assign(p, { alive: true, kind: PK.Ring, x, y, vx: 0, vy: 0, life: 0, max: life, size, rot: 0, vr: 0, color, g: 0 });
  }

  /** 金粉：沿贝塞尔飞向 (tx,ty) */
  gold(x: number, y: number, tx: number, ty: number, n: number, color = '#FFE7A3'): void {
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      const a = rng.next() * Math.PI * 2, d = 20 + rng.next() * 60;
      Object.assign(p, {
        alive: true, kind: PK.Gold, x, y, vx: 0, vy: 0, life: -rng.next() * 0.2, max: 0.55 + rng.next() * 0.25, size: 1.5 + rng.next() * 2.5, rot: 0, vr: 0, color, g: 0,
        tx, ty, sx: x, sy: y, cx: x + Math.cos(a) * d, cy: y + Math.sin(a) * d - 40,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        if (p.kind === PK.Gold) this.arrived++;
        p.alive = false;
        continue;
      }
      if (p.kind === PK.Gold) {
        if (p.life < 0) continue;
        const t = p.life / p.max;
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        p.x = u * u * p.sx + 2 * u * e * p.cx + e * e * p.tx;
        p.y = u * u * p.sy + 2 * u * e * p.cy + e * e * p.ty;
        continue;
      }
      p.vy += p.g * dt;
      if (p.kind === PK.Dust) {
        p.vx *= Math.exp(-2 * dt);
        p.vy *= Math.exp(-2 * dt);
      } else if (p.kind === PK.Spark) {
        p.vx *= Math.exp(-3 * dt);
        p.vy *= Math.exp(-3 * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(g: CanvasRenderingContext2D, glow: HTMLCanvasElement): void {
    // 普通混合：碎屑、尘土、冲击波
    for (const p of this.pool) {
      if (!p.alive || p.life < 0) continue;
      const t = p.life / p.max;
      if (p.kind === PK.Shard) {
        g.globalAlpha = 1 - t * t;
        g.fillStyle = p.color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.beginPath();
        g.moveTo(-p.size, -p.size * 0.6);
        g.lineTo(p.size, -p.size * 0.3);
        g.lineTo(p.size * 0.2, p.size);
        g.closePath();
        g.fill();
        g.restore();
      } else if (p.kind === PK.Dust) {
        g.globalAlpha = 1;
        g.fillStyle = p.color + (0.28 * (1 - t)).toFixed(3) + ')';
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === PK.Ring) {
        const e = 1 - Math.pow(1 - t, 3);
        g.globalAlpha = (1 - t) * 0.9;
        g.strokeStyle = p.color;
        g.lineWidth = 2 + 6 * (1 - t);
        g.beginPath();
        g.arc(p.x, p.y, 10 + p.size * e, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // 加色：火花、金粉
    g.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive || p.life < 0) continue;
      if (p.kind !== PK.Spark && p.kind !== PK.Gold) continue;
      const t = p.life / p.max;
      g.globalAlpha = p.kind === PK.Gold ? 0.9 : 1 - t;
      const s = p.size * 4;
      g.drawImage(glow, p.x - s, p.y - s, s * 2, s * 2);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
