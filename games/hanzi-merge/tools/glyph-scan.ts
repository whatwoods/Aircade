/**
 * 构建期字形扫描：找出所有「用打包字体显示」的字面量字符，供 build-font.ts 收进子集、check-dist.ts 核对。
 *
 * 扫描范围（src/ 下除 core/ data/ sim/ 外的 .ts，以及 index.html）：
 *   - 画布：glyphs.label / draw / get / drawFit、popups.float（跳字）与 seal(...) 的第一个字面量文本参数（含 'logo' 参数时归 Logo）
 *   - DOM：h(tag, cls, text) / btn(cls, text) 中 cls 或 tag 命中 styles.css 里使用 var(--kai) / var(--logo) 的选择器
 *   - index.html：class 命中上述选择器的元素文本
 * 动态拼出的文字（变量）不在此列，它们只能来自字库数据或 src/data/uiText.ts 的 KAI 常量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿·—…]/u;

export interface ScanResult {
  kai: Set<string>;
  logo: Set<string>;
  /** 字 → 首次出现位置（报错用） */
  where: Map<string, string>;
}

/** 从 styles.css 解析出使用打包字体的类名 / 标签名 */
export function fontSelectors(): { kai: Set<string>; logo: Set<string> } {
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const kai = new Set<string>();
  const logo = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    const fam = /font-family:\s*var\(--(kai|logo)\)/.exec(body);
    if (!fam) continue;
    for (const sel of m[1].split(',')) {
      const last = sel.trim().split(/\s+/).pop() ?? '';
      const cls = [...last.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
      const tag = /^([a-z][a-z0-9]*)/.exec(last)?.[1];
      const key = cls.length ? cls[cls.length - 1] : tag ? 'tag:' + tag : '';
      if (key) (fam[1] === 'kai' ? kai : logo).add(key);
    }
  }
  return { kai, logo };
}

const LIT = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\x60(?:[^\x60\\]|\\.)*\x60)`;

function literalText(lit: string): string {
  const body = lit.slice(1, -1);
  return lit[0] === '`' ? body.replace(/\$\{[^}]*\}/g, '') : body.replace(/\\./g, '');
}

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['core', 'data', 'sim', 'assets'].includes(e.name)) walk(p, out);
    } else if (e.name.endsWith('.ts')) out.push(p);
  }
}

export function scanGlyphs(): ScanResult {
  const res: ScanResult = { kai: new Set(), logo: new Set(), where: new Map() };
  const sel = fontSelectors();
  const add = (text: string, font: 'kai' | 'logo', loc: string) => {
    for (const ch of text) {
      if (!CJK.test(ch) || /\s/.test(ch)) continue;
      (font === 'logo' ? res.logo : res.kai).add(ch);
      if (!res.where.has(font + ch)) res.where.set(font + ch, loc);
    }
  };
  const fontOfClass = (cls: string, tag = ''): 'kai' | 'logo' | null => {
    const toks = cls.split(/\s+/).filter(Boolean);
    if (toks.some((t) => sel.logo.has(t)) || (tag && sel.logo.has('tag:' + tag))) return 'logo';
    if (toks.some((t) => sel.kai.has(t)) || (tag && sel.kai.has('tag:' + tag))) return 'kai';
    return null;
  };
  const files: string[] = [];
  walk(path.join(root, 'src'), files);
  const reCanvas = new RegExp(String.raw`(?:glyphs\.(?:label|draw|get|drawFit)|popups\.float|\.float)\(\s*(?:[\w.]+\s*,\s*)?` + LIT + String.raw`([^;\n]*)`, 'g');
  const reSeal = new RegExp(String.raw`\bseal\(\s*` + LIT + String.raw`([^;\n]*)`, 'g');
  const reH = new RegExp(String.raw`\bh\(\s*'(\w+)'\s*,\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g');
  const reBtn = new RegExp(String.raw`\bbtn\(\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    const loc = (i: number) => `${rel}:${src.slice(0, i).split('\n').length}`;
    for (const m of src.matchAll(reCanvas)) add(literalText(m[1]), /'logo'/.test(m[2]) ? 'logo' : 'kai', loc(m.index!));
    for (const m of src.matchAll(reSeal)) add(literalText(m[1]), /'logo'/.test(m[2]) ? 'logo' : 'kai', loc(m.index!));
    for (const m of src.matchAll(reH)) {
      const font = fontOfClass(literalText(m[2]), m[1]);
      if (font) add(literalText(m[3]), font, loc(m.index!));
    }
    for (const m of src.matchAll(reBtn)) {
      const font = fontOfClass(literalText(m[1]), 'button');
      if (font) add(literalText(m[2]), font, loc(m.index!));
    }
  }
  scanHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'index.html', res, sel);
  return res;
}

/** 扫描 HTML：class 命中打包字体选择器的元素（含其子元素文本） */
export function scanHtml(html: string, name: string, res: ScanResult, sel = fontSelectors()): void {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<(\w+)([^>]*)>/g)) {
    const cls = /class="([^"]*)"/.exec(m[2])?.[1] ?? '';
    const toks = cls.split(/\s+/);
    const font = toks.some((t) => sel.logo.has(t)) ? 'logo' : toks.some((t) => sel.kai.has(t)) ? 'kai' : null;
    if (!font) continue;
    // 找到同名闭合标签（按深度配对），取其间全部文本
    const tag = m[1];
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = m.index! + m[0].length;
    let depth = 1;
    let end = body.length;
    for (let t = re.exec(body); t; t = re.exec(body)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    const inner = body.slice(m.index! + m[0].length, end);
    const text = inner.replace(/<[^>]*>/g, '');
    for (const ch of text) {
      if (!CJK.test(ch) || /\s/.test(ch)) continue;
      (font === 'logo' ? res.logo : res.kai).add(ch);
      if (!res.where.has(font + ch)) res.where.set(font + ch, name);
    }
  }
}
