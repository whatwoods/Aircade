// Floating numbers / words (pool of 48): pop in with overshoot, drift up, fade.
import { col } from '../render/batcher';
import type { Batcher } from '../render/batcher';
import type { TextSprites, WordId } from '../render/bake/text';
import { drawNumber, drawWord } from '../render/text';
import { ease } from '../core/ease';

const MAX = 48;
/** keep text inside the playfield: below the HUD band (ceiling 68 + drift) and off the walls */
const MIN_Y = 92;
const clampX = (x: number): number => (x < 30 ? 30 : x > 360 ? 360 : x);

export class Floater {
  alive = false;
  word: WordId | null = null;
  value = 0;
  prefix = 0;
  suffix = 0;
  x = 0;
  y = 0;
  vy = 0;
  life = 0;
  maxLife = 1;
  color = 0xffffff;
  glow = 0xffffff;
  size = 12;
  big = false;
}

export class Floaters {
  readonly pool: Floater[] = [];
  private rr = 0;
  constructor() {
    for (let i = 0; i < MAX; i++) this.pool.push(new Floater());
  }

  clear(): void {
    for (const f of this.pool) f.alive = false;
  }

  private alloc(): Floater {
    for (const f of this.pool) if (!f.alive) return f;
    const f = this.pool[this.rr]!;
    this.rr = (this.rr + 1) % MAX;
    return f;
  }

  number(x: number, y: number, v: number, color: number, size: number, life = 0.6, prefix = 0, big = false, suffix = 0): void {
    const f = this.alloc();
    f.alive = true;
    f.word = null;
    f.value = v;
    f.prefix = prefix;
    f.suffix = suffix;
    f.x = clampX(x);
    f.y = y < MIN_Y ? MIN_Y : y;
    f.vy = -38;
    f.life = f.maxLife = life;
    f.color = color;
    f.glow = color;
    f.size = size;
    f.big = big;
  }

  /** unique: restart an already-floating copy of the same word instead of stacking a second one */
  word(x: number, y: number, w: WordId, color: number, size: number, life = 0.7, unique = false): void {
    let f: Floater | null = null;
    if (unique) for (const o of this.pool) if (o.alive && o.word === w) f = o;
    if (!f) f = this.alloc();
    f.alive = true;
    f.word = w;
    f.x = clampX(x);
    f.y = y < MIN_Y ? MIN_Y : y;
    f.vy = -30;
    f.life = f.maxLife = life;
    f.color = color;
    f.glow = color;
    f.size = size;
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.alive = false;
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.exp(-3 * dt);
    }
  }

  draw(b: Batcher, t: TextSprites): void {
    for (const f of this.pool) {
      if (!f.alive) continue;
      const age = f.maxLife - f.life;
      const pop = age < 0.14 ? 0.4 + 0.6 * ease.outBack(age / 0.14) : 1;
      const fade = f.life < f.maxLife * 0.35 ? f.life / (f.maxLife * 0.35) : 1;
      const s = f.size * pop;
      if (f.word) {
        drawWord(b, t, f.word, f.x, f.y, s, col(0xffffff, fade * 0.95, 0.2), col(f.glow, fade * 0.9, 1));
      } else {
        drawNumber(b, f.big ? t.numL : t.numS, f.value, f.x, f.y, s, 0.5, col(0xffffff, fade, 0.1), col(f.glow, fade * 0.85, 1), 0, f.prefix, f.suffix);
      }
    }
  }
}
