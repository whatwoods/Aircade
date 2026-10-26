// Allocation-free bitmap text: integers / decimals with optional prefix & suffix, and pre-baked words.
import type { Batcher } from './batcher';
import type { GlyphSet, TextSprites, WordId } from './bake/text';

const buf = new Int32Array(24);
let bufN = 0;

const C_PLUS = '+'.charCodeAt(0);
const C_MINUS = '-'.charCodeAt(0);
const C_DOT = '.'.charCodeAt(0);
const C_COMMA = ','.charCodeAt(0);
export const C_TIMES = '×'.charCodeAt(0);
export const C_PCT = '%'.charCodeAt(0);
export const C_EXCL = '!'.charCodeAt(0);
export const C_SLASH = '/'.charCodeAt(0);

/** fill the char buffer: prefix, number (with `decimals` digits), optional thousands separators, suffix */
function fill(n: number, decimals: number, prefix: number, suffix: number, sep: boolean): void {
  bufN = 0;
  if (prefix) buf[bufN++] = prefix;
  if (n < 0) {
    buf[bufN++] = C_MINUS;
    n = -n;
  }
  const scale = decimals > 0 ? Math.pow(10, decimals) : 1;
  const v = Math.round(n * scale);
  let ip = Math.floor(v / scale);
  const fp = v - ip * scale;
  const start = bufN;
  let d = 0;
  do {
    if (sep && d > 0 && d % 3 === 0) buf[bufN++] = C_COMMA;
    buf[bufN++] = 48 + (ip % 10);
    ip = Math.floor(ip / 10);
    d++;
  } while (ip > 0);
  for (let i = start, j = bufN - 1; i < j; i++, j--) {
    const t = buf[i]!;
    buf[i] = buf[j]!;
    buf[j] = t;
  }
  if (decimals > 0) {
    buf[bufN++] = C_DOT;
    for (let k = decimals - 1; k >= 0; k--) buf[bufN++] = 48 + (Math.floor(fp / Math.pow(10, k)) % 10);
  }
  if (suffix) buf[bufN++] = suffix;
}

function width(set: GlyphSet, size: number, tracking: number): number {
  const s = size / set.base;
  let w = 0;
  for (let i = 0; i < bufN; i++) {
    const g = set.map[buf[i]!];
    if (g) w += g.adv * s + tracking;
  }
  return w - tracking;
}

/**
 * draw a number. align: 0 left, 0.5 centre, 1 right. `glowC` 0 skips the glow layer.
 * Returns the drawn width.
 */
export function drawNumber(
  b: Batcher, set: GlyphSet, n: number, x: number, y: number, size: number, align: number,
  c: number, glowC: number, opts = 0, prefix = 0, suffix = 0, scaleY = 1, tracking = 0,
): number {
  const decimals = opts & 3;
  const sep = (opts & 4) !== 0;
  fill(n, decimals, prefix, suffix, sep);
  const s = size / set.base;
  const w = width(set, size, tracking);
  let cx = x - w * align;
  for (let i = 0; i < bufN; i++) {
    const g = set.map[buf[i]!];
    if (!g) continue;
    const gx = cx + (g.adv * s) / 2;
    if (glowC) b.sprite(g.glow, gx, y, s, s * scaleY, 0, glowC);
    b.sprite(g.sharp, gx, y, s, s * scaleY, 0, c);
    cx += g.adv * s + tracking;
  }
  return w;
}

export const NUM_SEP = 4;
export const NUM_DEC1 = 1;

export function drawWord(b: Batcher, t: TextSprites, id: WordId, x: number, y: number, size: number, c: number, glowC: number, rot = 0, sy = 1): void {
  const w = t.words.get(id);
  if (!w) return;
  const s = size / t.wordBase;
  if (glowC) b.sprite(w.glow, x, y, s, s * sy, rot, glowC);
  b.sprite(w.sharp, x, y, s, s * sy, rot, c);
}

export function wordWidth(t: TextSprites, id: WordId, size: number): number {
  const w = t.words.get(id);
  return w ? (w.tw * size) / t.wordBase : 0;
}

export { C_PLUS };
