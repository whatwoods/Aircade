import { EMPTY, BLACK, WHITE, CRYSTAL } from './pieces.ts';
import type { Piece, Stone } from './pieces.ts';

/** 9×17 逻辑网格；内部行 y=0..rows-1，其中 y < hidden 为隐藏出块区。文档中的「第 r 行」= y - hidden */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly hidden: number;
  readonly cells: Uint8Array;
  version = 0;
  constructor(cols: number, visibleRows: number, hidden: number) {
    this.cols = cols;
    this.rows = visibleRows + hidden;
    this.hidden = hidden;
    this.cells = new Uint8Array(cols * this.rows);
  }
  idx(x: number, y: number): number { return y * this.cols + x; }
  get(x: number, y: number): Stone { return this.cells[y * this.cols + x] as Stone; }
  set(x: number, y: number, v: Stone): void { this.cells[y * this.cols + x] = v; this.version++; }
  inside(x: number, y: number): boolean { return x >= 0 && x < this.cols && y >= 0 && y < this.rows; }
  clear(): void { this.cells.fill(0); this.version++; }
  clone(): Grid { const g = new Grid(this.cols, this.rows - this.hidden, this.hidden); g.cells.set(this.cells); return g; }
  copyFrom(o: Grid): void { this.cells.set(o.cells); this.version++; }

  collides(p: Piece, px: number, py: number): boolean {
    for (let i = 0; i < p.cx.length; i++) {
      const x = px + p.cx[i], y = py + p.cy[i];
      if (x < 0 || x >= this.cols || y >= this.rows) return true;
      if (y < 0) continue; // 出块区上方视为空
      if (this.cells[y * this.cols + x] !== EMPTY) return true;
    }
    return false;
  }
  dropY(p: Piece, px: number, py: number): number {
    let y = py;
    while (!this.collides(p, px, y + 1)) y++;
    return y;
  }
  place(p: Piece, px: number, py: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < p.cx.length; i++) {
      const x = px + p.cx[i], y = py + p.cy[i];
      if (y < 0 || y >= this.rows) continue;
      const k = y * this.cols + x;
      this.cells[k] = p.colors[i];
      out.push(k);
    }
    this.version++;
    return out;
  }
  count(): { b: number; w: number; x: number; total: number } {
    let b = 0, w = 0, x = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c === BLACK) b++; else if (c === WHITE) w++; else if (c === CRYSTAL) x++;
    }
    return { b, w, x, total: b + w + x };
  }
  isEmpty(): boolean { for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) return false; return true; }
  hiddenOccupied(): boolean {
    for (let i = 0; i < this.hidden * this.cols; i++) if (this.cells[i]) return true;
    return false;
  }
  /** 每列高度（从底部算起的最高子所在高度，0 表示空列），只算可见区以上全部 */
  heights(out?: number[]): number[] {
    const h = out ?? new Array<number>(this.cols);
    for (let x = 0; x < this.cols; x++) {
      let v = 0;
      for (let y = 0; y < this.rows; y++) if (this.cells[y * this.cols + x]) { v = this.rows - y; break; }
      h[x] = v;
    }
    return h;
  }
  /** 可见区内最高子的行号（文档行号，0 为顶），空盘返回 rows */
  topRow(): number {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (this.cells[y * this.cols + x]) return y - this.hidden;
    }
    return this.rows - this.hidden;
  }

  /** ASCII：B W X .，从上到下；只描述可见行，行数不足时底部对齐 */
  setAscii(rows: string[]): void {
    this.cells.fill(0);
    const lines = rows.map(r => r.replace(/\s+/g, ''));
    const start = this.rows - lines.length;
    for (let i = 0; i < lines.length; i++) {
      const y = start + i;
      if (y < 0 || y >= this.rows) continue;
      const ln = lines[i];
      for (let x = 0; x < this.cols && x < ln.length; x++) {
        const ch = ln[x];
        this.cells[y * this.cols + x] = ch === 'B' ? BLACK : ch === 'W' ? WHITE : ch === 'X' ? CRYSTAL : EMPTY;
      }
    }
    this.version++;
  }
  toAscii(includeHidden = false): string[] {
    const out: string[] = [];
    for (let y = includeHidden ? 0 : this.hidden; y < this.rows; y++) {
      let s = '';
      for (let x = 0; x < this.cols; x++) {
        const c = this.cells[y * this.cols + x];
        s += c === BLACK ? 'B' : c === WHITE ? 'W' : c === CRYSTAL ? 'X' : '.';
      }
      out.push(s);
    }
    return out;
  }
}
