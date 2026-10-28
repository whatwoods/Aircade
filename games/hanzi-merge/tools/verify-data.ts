/**
 * 字库校对脚本。用法（Node ≥ 22.18，直接跑 TS）：
 *   node tools/verify-data.ts                      # 结构检查 + 说文核对（默认用 tools/ref/shuowen-subset.json）
 *   SW=<sw.json> IDS=<ids.txt> node tools/verify-data.ts   # 用完整说文数据 + IDS 构形核对 + 拼音核对
 * sw.json：由 shuowenjiezi/shuowen 数据整理成 {字头: 说文原文}；ids.txt：cjkvi-ids。
 * 这两份参考数据只在校对时使用，不进入产物。
 */
import fs from 'node:fs';
import { BASES, RECIPES, type RecipeDef } from '../src/data/hanzi.ts';

let errors = 0;
let warns = 0;
const err = (m: string) => { errors++; console.log('  ✗ ' + m); };
const warn = (m: string) => { warns++; console.log('  ! ' + m); };

const baseSet = new Set(BASES.map((b) => b.c));
const byChar = new Map<string, RecipeDef>();
console.log(`部件 ${BASES.length} 个，配方 ${RECIPES.length} 条`);

// 1. 唯一性
console.log('[1] 唯一性');
for (const r of RECIPES) {
  if (byChar.has(r.c)) err(`重复的字 ${r.c}`);
  if (baseSet.has(r.c)) err(`${r.c} 既是部件又是配方结果`);
  byChar.set(r.c, r);
  if (r.parts.length !== (r.s === '品' ? 3 : 2)) err(`${r.c} 部件数与结构不符`);
  if (r.t === '形声' && r.ph === undefined) warn(`${r.c} 形声字未标声旁`);
}

// 2. 可达性与深度
console.log('[2] 可达性');
const depth = new Map<string, number>();
for (const b of BASES) depth.set(b.c, 0);
let changed = true;
while (changed) {
  changed = false;
  for (const r of RECIPES) {
    if (depth.has(r.c)) continue;
    if (r.parts.every((p) => depth.has(p))) {
      depth.set(r.c, 1 + Math.max(...r.parts.map((p) => depth.get(p)!)));
      changed = true;
    }
  }
}
for (const r of RECIPES) if (!depth.has(r.c)) err(`${r.c} 不可达（部件 ${r.parts.join('+')}）`);
const used = new Set(RECIPES.flatMap((r) => r.parts));
for (const b of BASES) if (!used.has(b.c)) warn(`部件 ${b.c} 未被任何配方使用`);

// 3. 冲突：同一组部件 → 必须靠相对位置区分
console.log('[3] 同部件冲突');
const key = (ps: string[]) => [...ps].sort().join('+');
const groups = new Map<string, RecipeDef[]>();
for (const r of RECIPES) {
  const k = key(r.parts);
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
/** 关系签名：A 相对 B 的方位（A=parts[0]）。包围结构统一记为 in */
const rel = (r: RecipeDef) => (r.s === '⿰' ? 'lr' : r.s === '⿱' ? 'tb' : r.s === '品' ? 'tri' : 'in');
for (const [k, rs] of groups) {
  if (rs.length < 2) continue;
  const sigs = rs.map((r) => rel(r) + (r.parts[0] === r.parts[1] ? '' : ':' + r.parts[0]));
  if (new Set(sigs).size !== sigs.length) err(`部件 ${k} 有多个结果且位置无法区分：${rs.map((r) => r.c).join(' ')}`);
  else console.log(`  · ${k} → ${rs.map((r) => `${r.c}(${r.s}${r.parts.join('')})`).join(' / ')}  按落点方位区分`);
}

// 4. 三部件：至少有一对部件不构成二元配方，才能做出「未成字」
console.log('[4] 三部件可达');
const binary = new Set(RECIPES.filter((r) => r.parts.length === 2).map((r) => key(r.parts)));
for (const r of RECIPES.filter((x) => x.parts.length === 3)) {
  const [a, b, c] = r.parts;
  const pairs = [[a, b], [a, c], [b, c]];
  const ok = pairs.filter((p) => !binary.has(key(p)));
  if (ok.length === 0) err(`${r.c} 的任意两个部件都会先合成别的字，无法拼出`);
  else console.log(`  · ${r.c}: 可从 ${ok.map((p) => p.join('')).join('、')} 起手`);
}

// 4b. 卡片文字用系统字体渲染：只允许基本区汉字（U+4E00–9FFF），避免扩展区字在手机上显示成方框
console.log('[4b] 卡片文字字符集');
for (const x of [...RECIPES, ...BASES]) {
  const text = x.g + ('basis' in x ? x.basis : '');
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x3400 && !(cp >= 0x4e00 && cp <= 0x9fff) && !(cp >= 0x3000 && cp <= 0x303f) && !(cp >= 0xff00 && cp <= 0xffef) && cp !== 0x2026)
      err(`${x.c} 的说明含非基本区字符「${ch}」U+${cp.toString(16)}`);
  }
}

// 5–7. 外部参考核对
const SUBSET = new URL('./ref/shuowen-subset.json', import.meta.url);
const SW = process.env.SW;
const IDS = process.env.IDS;
if (SW || fs.existsSync(SUBSET)) {
  console.log('[5] 说文原文核对');
  const OpenCC = await import('opencc-js');
  const conv = OpenCC.Converter({ from: 't', to: 'cn' });
  const sw: Record<string, string> = SW
    ? JSON.parse(fs.readFileSync(SW, 'utf8'))
    : (JSON.parse(fs.readFileSync(SUBSET, 'utf8')) as { entries: Record<string, string> }).entries;
  const norm = (s: string) => conv(s).replace(/[、，。]/g, '');
  for (const r of RECIPES) {
    if (r.src !== '说文') continue;
    const head = r.tr ?? r.c;
    const text = sw[head] ?? sw[r.c];
    if (!text) { err(`${r.c}（${head}）说文无此字头`); continue; }
    if (!r.check || !norm(text).includes(norm(r.check))) err(`${r.c} 说文核对失败：期望「${r.check}」，原文「${conv(text).slice(0, 60)}」`);
    // 卡片引文逐句核对：「《说文》：」之后的句子若不在原文中，列出供人工确认（可能是解说句）
    const m = r.basis.match(/《说文》[^：]*：(.*)$/);
    if (m) {
      const loose = (s: string) => norm(s).replace(/[（）()「」“”…\s]/g, '');
      const orig = loose(text);
      for (const sent of m[1].split('。').map((x) => x.trim()).filter(Boolean)) {
        const parts = sent.split('……');
        if (!parts.every((p) => orig.includes(loose(p)))) console.log(`  ? ${r.c} 非原文句：「${sent}」`);
      }
    }
  }
}
if (IDS) {
  console.log('[6] IDS 构形核对');
  const ids = new Map<string, string>();
  for (const line of fs.readFileSync(IDS, 'utf8').split('\n')) {
    const [, ch, ...seqs] = line.split('\t');
    if (ch && seqs.length) ids.set(ch, seqs[0].replace(/\[[^\]]*\]/g, ''));
  }
  const VAR: Record<string, string> = {
    '氵': '水', '扌': '手', '亻': '人', '忄': '心', '灬': '火', '钅': '金', '王': '玉', '讠': '言', '饣': '食',
    '纟': '糸', '礻': '示', '衤': '衣', '刂': '刀', '犭': '犬', '阝': '阜', '爫': '爪', '⺮': '竹', '𥫗': '竹',
    '牜': '牛', '⺾': '艹', '龷': '艹', '⻌': '辶', '⻍': '辶', '𧾷': '足', '𠂉': '人', '月': '月', '⺶': '羊', '𦍌': '羊', '⺷': '羊',
    '⺈': '刀', '⻗': '雨', '龵': '手', '𤣩': '玉', '⺼': '肉', '𠂒': '牛',
  };
  const IDC = /[⿰-⿿]/;
  const children = (ch: string): string[] | null => {
    const s = ids.get(ch);
    if (!s || [...s].length === 1) return null;
    return [...s].filter((x) => !IDC.test(x));
  };
  /** 展开到深度 2 的所有「前沿」组合 */
  const frontiers = (ch: string, d: number): string[][] => {
    const out: string[][] = [[ch]];
    if (d === 0) return out;
    const kids = children(ch);
    if (!kids) return out;
    let acc: string[][] = [[]];
    for (const k of kids) {
      const opts = frontiers(k, d - 1);
      acc = acc.flatMap((a) => opts.map((o) => [...a, ...o]));
    }
    return [...out, ...acc];
  };
  const canon = (x: string) => VAR[x] ?? x;
  const MOON_FLESH = new Set(['肚', '肥', '肰']);
  for (const r of RECIPES) {
    const want = key(r.parts.map(canon));
    const fs2 = frontiers(r.c, 3).slice(1).map((f) => key(f.map((x) => (x === '月' && MOON_FLESH.has(r.c) ? '肉' : canon(x)))));
    if (!fs2.includes(want)) warn(`${r.c} IDS「${ids.get(r.c) ?? '?'}」与配方 ${r.parts.join('+')} 不一致（需人工确认）`);
  }
  console.log('[7] 拼音核对');
  const { pinyin } = await import('pinyin-pro');
  for (const x of [...RECIPES, ...BASES]) {
    const all = pinyin(x.c, { multiple: true, type: 'array' }) as string[];
    if (!all.includes(x.py)) warn(`${x.c} 拼音 ${x.py} 不在 pinyin-pro 候选 ${all.join('/')} 中`);
  }
}

console.log(`\n完成：${errors} 个错误，${warns} 个提醒`);
process.exit(errors ? 1 : 0);
