/**
 * 构建后检查（npm run build 最后一步）：
 *  - dist 中的楷体 / Logo 字体必须覆盖当前字库与界面文字的全部字符（防止字体过期）
 *  - dist/index.html 中以打包字体显示的文字（.kai / .logo 等）必须全部在子集里
 *  - 字体体积预算：楷体 ≤ 140 KB（含卡片上的 50 余个繁体字形），Logo ≤ 15 KB
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverage, kaiCharset, logoCharset } from './build-font.ts';
import { scanHtml, type ScanResult } from './glyph-scan.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist/assets');
const files = fs.readdirSync(assets);
const kai = files.find((f) => f.startsWith('hanzi-kai') && f.endsWith('.woff2'));
const logo = files.find((f) => f.startsWith('hanzi-logo') && f.endsWith('.woff2'));
const errs: string[] = [];
if (!kai || !logo) errs.push('dist 中找不到字体文件');
else {
  const k = path.join(assets, kai);
  const l = path.join(assets, logo);
  // 构建产物 index.html 里用打包字体显示的文字也必须在子集里（静态标题页）
  const html: ScanResult = { kai: new Set(), logo: new Set(), where: new Map() };
  scanHtml(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'dist/index.html', html);
  const mk = await coverage(k, [...new Set([...kaiCharset(), ...html.kai])]);
  const ml = await coverage(l, [...new Set([...logoCharset(), ...html.logo])]);
  if (mk.length) errs.push('楷体子集缺字：' + mk.join(''));
  if (ml.length) errs.push('Logo 子集缺字：' + ml.join(''));
  const sk = fs.statSync(k).size / 1024;
  const sl = fs.statSync(l).size / 1024;
  if (sk > 140) errs.push(`楷体 ${sk.toFixed(1)} KB 超出 140 KB 预算`);
  if (sl > 15) errs.push(`Logo ${sl.toFixed(1)} KB 超出 15 KB 预算`);
  console.log(`[check-dist] 楷体 ${sk.toFixed(1)} KB，Logo ${sl.toFixed(1)} KB，字符覆盖完整`);
}
if (errs.length) {
  for (const e of errs) console.error('[check-dist] ✗ ' + e);
  process.exit(1);
}
