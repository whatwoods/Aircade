import type { ShapeId } from '../config.ts';

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const CRYSTAL = 3;
export type Stone = 0 | 1 | 2 | 3;

export interface ShapeDef { n: number; cells: [number, number][] }

export const SHAPES: Record<ShapeId, ShapeDef> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  I3: { n: 3, cells: [[0, 1], [1, 1], [2, 1]] },
  V3: { n: 2, cells: [[0, 0], [0, 1], [1, 1]] },
  // 引导专用二格块
  D2: { n: 2, cells: [[0, 0], [1, 0]] },
};

export const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];

export interface PieceSpec { shape: ShapeId; colors: Stone[]; rot?: number }

export class Piece {
  shape: ShapeId;
  n: number;
  colors: Stone[];
  rot = 0;
  x = 0;
  y = 0;
  /** 当前朝向下的格子（框内坐标）与颜色，与 colors 下标一一对应 */
  cx: number[] = [];
  cy: number[] = [];
  constructor(shape: ShapeId, colors: Stone[], rot = 0) {
    this.shape = shape;
    this.n = SHAPES[shape].n;
    this.colors = colors.slice();
    this.setRot(rot);
  }
  get size(): number { return this.colors.length; }
  setRot(r: number): void {
    this.rot = ((r % 4) + 4) % 4;
    const def = SHAPES[this.shape];
    this.cx.length = 0; this.cy.length = 0;
    for (const [x0, y0] of def.cells) {
      let x = x0, y = y0;
      for (let i = 0; i < this.rot; i++) {
        const nx = this.n - 1 - y;
        y = x; x = nx;
      }
      this.cx.push(x); this.cy.push(y);
    }
  }
  invert(): void {
    for (let i = 0; i < this.colors.length; i++) {
      const c = this.colors[i];
      if (c === BLACK) this.colors[i] = WHITE;
      else if (c === WHITE) this.colors[i] = BLACK;
    }
  }
  clone(): Piece {
    const p = new Piece(this.shape, this.colors, this.rot);
    p.x = this.x; p.y = this.y;
    return p;
  }
  spec(): PieceSpec { return { shape: this.shape, colors: this.colors.slice(), rot: this.rot }; }
  /** 最低格在框内的 y */
  bottomY(): number { let m = 0; for (const y of this.cy) if (y > m) m = y; return m; }
  minX(): number { let m = 99; for (const x of this.cx) if (x < m) m = x; return m; }
  maxX(): number { let m = -1; for (const x of this.cx) if (x > m) m = x; return m; }
  colorString(): string { return this.colors.map(c => (c === BLACK ? 'B' : c === WHITE ? 'W' : 'X')).join(''); }
}

export function parseColors(s: string): Stone[] {
  return s.split('').map(ch => (ch === 'B' ? BLACK : ch === 'W' ? WHITE : CRYSTAL) as Stone);
}

export function pieceFromSpec(spec: PieceSpec | { shape: ShapeId; colors: string; rot?: number }): Piece {
  const colors = typeof spec.colors === 'string' ? parseColors(spec.colors) : spec.colors;
  return new Piece(spec.shape, colors, spec.rot ?? 0);
}
