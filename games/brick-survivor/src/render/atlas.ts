// 2048² shelf-packed atlas baked with Canvas2D at startup. The canvas is kept so the texture can be
// re-uploaded after a context restore, and glyph regions can be re-baked when web fonts arrive late.
import type { GLContext } from './gl';

export interface Frame {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** full sprite size in world units (including glow padding) */
  w: number;
  h: number;
  /** reference size in world units (radius / half-height) used by spriteR */
  unit: number;
}

export type BakeFn = (c: CanvasRenderingContext2D, ppu: number, wpx: number, hpx: number) => void;

interface Entry {
  frame: Frame;
  x: number;
  y: number;
  wpx: number;
  hpx: number;
  ppu: number;
  draw: BakeFn;
  tag: string;
}

const SIZE = 2048;
const GAP = 2;

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
  texture: WebGLTexture | null = null;
  private entries: Entry[] = [];
  private shelfX = GAP;
  private shelfY = GAP;
  private shelfH = 0;
  private dirty = true;
  /** pixels used, for the debug overlay */
  usedY = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    const c = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!c) throw new Error('2d context unavailable');
    this.c = c;
  }

  /**
   * reserve + bake a region of wU × hU world units at `ppu` pixels per unit.
   * `unit` is the reference size for spriteR.
   */
  add(wU: number, hU: number, ppu: number, unit: number, draw: BakeFn, tag = ''): Frame {
    const wpx = Math.ceil(wU * ppu);
    const hpx = Math.ceil(hU * ppu);
    if (this.shelfX + wpx + GAP > SIZE) {
      this.shelfX = GAP;
      this.shelfY += this.shelfH + GAP;
      this.shelfH = 0;
    }
    if (this.shelfY + hpx + GAP > SIZE) throw new Error('atlas full');
    const x = this.shelfX;
    const y = this.shelfY;
    this.shelfX += wpx + GAP;
    if (hpx > this.shelfH) this.shelfH = hpx;
    this.usedY = this.shelfY + this.shelfH;
    const frame: Frame = {
      u0: x / SIZE,
      v0: y / SIZE,
      u1: (x + wpx) / SIZE,
      v1: (y + hpx) / SIZE,
      w: wpx / ppu,
      h: hpx / ppu,
      unit,
    };
    const e: Entry = { frame, x, y, wpx, hpx, ppu, draw, tag };
    this.entries.push(e);
    this.bakeEntry(e);
    return frame;
  }

  private bakeEntry(e: Entry): void {
    const c = this.c;
    c.save();
    c.clearRect(e.x - 1, e.y - 1, e.wpx + 2, e.hpx + 2);
    c.beginPath();
    c.rect(e.x, e.y, e.wpx, e.hpx);
    c.clip();
    c.translate(e.x, e.y);
    e.draw(c, e.ppu, e.wpx, e.hpx);
    c.restore();
    this.dirty = true;
  }

  /** re-run the bake functions of every region with this tag (late fonts) */
  rebake(tag: string): void {
    for (const e of this.entries) if (e.tag === tag) this.bakeEntry(e);
  }

  /** upload if anything changed since the last upload */
  sync(ctx: GLContext): void {
    if (!this.dirty || ctx.lost) return;
    this.dirty = false;
    const gl = ctx.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = ctx.texture(this.canvas, SIZE, SIZE, true);
  }

  /** after a context restore the old texture handle is dead */
  invalidate(): void {
    this.texture = null;
    this.dirty = true;
  }
}
