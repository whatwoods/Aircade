// Bitmap glyphs (Orbitron digits/symbols) and fixed words (Chinese + labels), each as sharp + glow frames.
// Regions are tagged 'font' so they can be re-baked when the web fonts finish loading after the timeout.
import type { Atlas, Frame } from '../atlas';
import { FONT_CJK, FONT_ORB, FONT_RAJ } from './util';

export const GLYPH_CHARS = '0123456789+-×%/.,!:xkM';

export interface Glyph {
  sharp: Frame;
  glow: Frame;
  /** advance at the set's base size (world units) */
  adv: number;
}

export interface GlyphSet {
  base: number;
  /** char code → glyph */
  map: (Glyph | undefined)[];
  height: number;
}

export const WORDS = [
  '完美', '热冲击!', '警告', '冻结', '碎冰', '屏障', '拦截', '治疗', '进化', '通关', '充能', '连锁',
  'COMBO', 'MAX', 'BOSS', 'LV', '准备好了!',
] as const;
export type WordId = (typeof WORDS)[number];

export interface Word {
  sharp: Frame;
  glow: Frame;
  /** visible text width at base size */
  tw: number;
}

export interface TextSprites {
  numS: GlyphSet;
  numL: GlyphSet;
  words: Map<WordId, Word>;
  wordBase: number;
}

function bakeGlyphSet(a: Atlas, font: string, weight: number, base: number, ppu: number): GlyphSet {
  const map: (Glyph | undefined)[] = [];
  const cellW = base * 1.0;
  const pad = base * 0.25;
  const cellH = base * 1.3;
  for (const ch of GLYPH_CHARS) {
    const code = ch.charCodeAt(0);
    const g: Glyph = { sharp: null as unknown as Frame, glow: null as unknown as Frame, adv: base * 0.7 };
    const draw = (glow: boolean) => (c: CanvasRenderingContext2D, p: number, w: number, h: number): void => {
      c.font = `${weight} ${base * p}px ${font}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const m = c.measureText(ch);
      g.adv = m.width / p + base * 0.04;
      if (ch === '.' || ch === ',' || ch === ':') g.adv = Math.max(g.adv, base * 0.32);
      c.fillStyle = '#fff';
      if (glow) {
        c.shadowColor = '#fff';
        c.shadowBlur = base * 0.28 * p;
        c.globalAlpha = 0.55;
        c.fillText(ch, w / 2, h / 2 + base * 0.04 * p);
        c.fillText(ch, w / 2, h / 2 + base * 0.04 * p);
      } else {
        c.fillText(ch, w / 2, h / 2 + base * 0.04 * p);
      }
    };
    g.sharp = a.add(cellW + pad * 2, cellH + pad * 2, ppu, (cellH + pad * 2) / 2, draw(false), 'font');
    g.glow = a.add(cellW + pad * 2, cellH + pad * 2, ppu * 0.5, (cellH + pad * 2) / 2, draw(true), 'font');
    map[code] = g;
  }
  return { base, map, height: cellH };
}

function bakeWord(a: Atlas, text: string, base: number): Word {
  const latin = /^[A-Z!]+$/.test(text);
  const font = latin ? `700 ${base}px ${FONT_RAJ}` : `900 ${base}px ${FONT_CJK}`;
  const mc = a.c;
  mc.save();
  mc.font = font;
  const tw0 = mc.measureText(text).width * (latin ? 1.25 : 1.05);
  mc.restore();
  const w = tw0 + base * 1.4;
  const h = base * 2.2;
  const word: Word = { sharp: null as unknown as Frame, glow: null as unknown as Frame, tw: tw0 };
  const draw = (glow: boolean) => (c: CanvasRenderingContext2D, p: number, wpx: number, hpx: number): void => {
    c.font = latin ? `700 ${base * p}px ${FONT_RAJ}` : `900 ${base * p}px ${FONT_CJK}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (latin && 'letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = `${base * 0.2 * p}px`;
    word.tw = c.measureText(text).width / p;
    c.fillStyle = '#fff';
    if (glow) {
      c.shadowColor = '#fff';
      c.shadowBlur = base * 0.35 * p;
      c.globalAlpha = 0.6;
      c.fillText(text, wpx / 2, hpx / 2);
      c.fillText(text, wpx / 2, hpx / 2);
    } else {
      c.lineJoin = 'round';
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = base * 0.12 * p;
      c.strokeText(text, wpx / 2, hpx / 2);
      c.fillText(text, wpx / 2, hpx / 2);
    }
  };
  word.sharp = a.add(w, h, 3, h / 2, draw(false), 'font');
  word.glow = a.add(w, h, 1.5, h / 2, draw(true), 'font');
  return word;
}

export function bakeText(a: Atlas): TextSprites {
  const numS = bakeGlyphSet(a, FONT_ORB, 700, 12, 3);
  const numL = bakeGlyphSet(a, FONT_ORB, 900, 40, 2);
  const words = new Map<WordId, Word>();
  const wordBase = 16;
  for (const w of WORDS) words.set(w, bakeWord(a, w, wordBase));
  return { numS, numL, words, wordBase };
}
