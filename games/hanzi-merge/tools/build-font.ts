/**
 * 构建期字体子集化（§2.3）。
 *   node tools/build-font.ts           字符集变化时重新生成（predev）
 *   node tools/build-font.ts --check   同上，并断言生成的字体覆盖全部字符（prebuild，失败则构建失败）
 * 源字体来自 npm 包（按 unicode-range 分片的 woff2），合并为单个 woff2：
 *   src/assets/fonts/hanzi-kai.woff2   霞鹜文楷 LXGW WenKai v1.250（OFL-1.1）
 *   src/assets/fonts/hanzi-logo.woff2  马善政 Ma Shan Zheng（OFL-1.1）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BASES, RECIPES } from '../src/data/hanzi.ts';
import { CHAPTER_NAMES } from '../src/data/levels.ts';
import { LOGO, kaiUiChars } from '../src/data/uiText.ts';
import { scanGlyphs } from './glyph-scan.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/assets/fonts');
const check = process.argv.includes('--check');

export function kaiCharset(): string[] {
  let s = '';
  for (const b of BASES) s += b.c + b.py + Object.values(b.v ?? {}).join('');
  // vv：入字后的实际字形（含 炏 这类重排形）；trad：卡片上以楷体显示的繁体
  for (const r of RECIPES) s += r.c + r.py + (r.vv ?? '') + (r.trad ?? '');
  s += kaiUiChars() + CHAPTER_NAMES.join('');
  // 源码里所有以打包楷体显示的字面量（画布 glyphs.* / seal、DOM .kai 等，见 glyph-scan.ts）
  s += [...scanGlyphs().kai].join('');
  s += ' ';
  return [...new Set([...s])].filter((c) => c.trim() !== '' || c === ' ').sort();
}
export function logoCharset(): string[] {
  return [...new Set([...LOGO, ...scanGlyphs().logo])].sort();
}

interface Face { file: string; ranges: [number, number][] }
function parseCss(css: string): Face[] {
  const dir = path.dirname(css);
  const txt = fs.readFileSync(css, 'utf8');
  return [...txt.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)[\s\S]*?unicode-range:\s*([^;}]+)/g)].map((m) => ({
    file: path.join(dir, m[1]),
    ranges: m[2].split(',').map((x) => {
      const [a, b] = x.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
    }),
  }));
}

async function build(css: string, chars: string[], out: string, family: string): Promise<void> {
  const fontkit = await import('fontkit');
  const subsetFont = (await import('subset-font')).default;
  const opentype = (await import('opentype.js')).default;
  const faces = parseCss(css);
  const byFile = new Map<string, string[]>();
  const missing: string[] = [];
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    const f = faces.find((x) => x.ranges.some(([a, b]) => cp >= a && cp <= b));
    if (!f) {
      missing.push(ch);
      continue;
    }
    byFile.set(f.file, [...(byFile.get(f.file) ?? []), ch]);
  }
  if (missing.length) throw new Error(`${family}: 源字体缺字 ${missing.map((c) => `「${c}」U+${c.codePointAt(0)!.toString(16)}`).join(' ')}`);
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 1000, path: new opentype.Path() })];
  let meta: { upm: number; asc: number; desc: number } | null = null;
  for (const [file, cs] of byFile) {
    const sfnt = await subsetFont(fs.readFileSync(file), cs.join(''), { targetFormat: 'sfnt' });
    const f = fontkit.create(sfnt) as unknown as {
      unitsPerEm: number; ascent: number; descent: number;
      glyphForCodePoint(cp: number): { advanceWidth: number; path: { commands: { command: string; args: number[] }[] } };
      hasGlyphForCodePoint(cp: number): boolean;
    };
    meta ??= { upm: f.unitsPerEm, asc: f.ascent, desc: f.descent };
    for (const ch of cs) {
      const cp = ch.codePointAt(0)!;
      if (!f.hasGlyphForCodePoint(cp)) throw new Error(`${family}: 缺字形「${ch}」`);
      const g = f.glyphForCodePoint(cp);
      const p = new opentype.Path();
      for (const c of g.path.commands) {
        const a = c.args;
        if (c.command === 'moveTo') p.moveTo(a[0], a[1]);
        else if (c.command === 'lineTo') p.lineTo(a[0], a[1]);
        else if (c.command === 'quadraticCurveTo') p.quadraticCurveTo(a[0], a[1], a[2], a[3]);
        else if (c.command === 'bezierCurveTo') p.curveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
        else if (c.command === 'closePath') p.close();
      }
      glyphs.push(new opentype.Glyph({ name: 'u' + cp.toString(16), unicode: cp, advanceWidth: g.advanceWidth, path: p }));
    }
  }
  const font = new opentype.Font({ familyName: family, styleName: 'Regular', unitsPerEm: meta!.upm, ascender: meta!.asc, descender: meta!.desc, glyphs });
  const otf = Buffer.from(font.toArrayBuffer());
  const woff2 = await subsetFont(otf, chars.join(''), { targetFormat: 'woff2' });
  fs.writeFileSync(out, woff2);
  console.log(`[font] ${path.basename(out)}: ${chars.length} 字，${(woff2.length / 1024).toFixed(1)} KB`);
}

/** 核对 woff2 是否覆盖字符集，返回缺失的字 */
export async function coverage(file: string, chars: string[]): Promise<string[]> {
  const fontkit = await import('fontkit');
  const f = fontkit.create(fs.readFileSync(file)) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
  return chars.filter((c) => c !== ' ' && !f.hasGlyphForCodePoint(c.codePointAt(0)!));
}

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const kai = kaiCharset();
  const logo = logoCharset();
  const hash = crypto.createHash('sha1').update(kai.join('') + '|' + logo.join('')).digest('hex');
  const metaFile = path.join(outDir, 'charset.json');
  let old = '';
  try {
    const j = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { hash: string; kaiChars?: string };
    old = j.kaiChars ? j.hash : '';
  } catch {
    /* 首次生成 */
  }
  const kaiOut = path.join(outDir, 'hanzi-kai.woff2');
  const logoOut = path.join(outDir, 'hanzi-logo.woff2');
  const fresh = old === hash && fs.existsSync(kaiOut) && fs.existsSync(logoOut);
  if (!fresh) {
    const kaiCss = path.join(root, 'node_modules/lxgw-wenkai-webfont/lxgwwenkai-regular.css');
    const logoCss = path.join(root, 'node_modules/@fontsource/ma-shan-zheng/400.css');
    if (!fs.existsSync(kaiCss) || !fs.existsSync(logoCss)) throw new Error('字符集已变化，但源字体包未安装：请先 npm install');
    await build(kaiCss, kai, kaiOut, 'HMKai');
    await build(logoCss, logo, logoOut, 'HMLogo');
    fs.writeFileSync(metaFile, JSON.stringify({ hash, kai: kai.length, logo: logo.length, kaiChars: kai.join(''), logoChars: logo.join('') }, null, 2) + '\n');
  } else {
    console.log('[font] 字符集未变化，跳过子集化');
  }
  if (check) {
    const m1 = await coverage(kaiOut, kai);
    const m2 = await coverage(logoOut, logo);
    if (m1.length || m2.length) throw new Error(`字体子集缺字：楷体 ${m1.join('')} / Logo ${m2.join('')}`);
    console.log(`[font] 覆盖检查通过：楷体 ${kai.length} 字，Logo ${logo.length} 字`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e: unknown) => {
    console.error('[font] ' + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  });
}
