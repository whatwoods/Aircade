// pnpm build:yoola 的主体（类型检查已在前面跑过）：
//   1. 渲染 / 复用快手版音频（scripts/yoola/audio.ts）
//   2. vite --mode yoola 打成单文件 IIFE，再用 TypeScript 降到 ES5，写进 yoola/package/gameplay/
//   3. 复制立牌图到 res/Image/、音频到 res/Audio/
//   4. 跑 Yoola devkit 的 validate-package.mjs 和 build-zip.mjs
// devkit 默认在 ~/.agents/skills/ks-yoola-devkit，可用 YOOLA_DEVKIT 指到别处。
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { build } from 'vite';
import { ensureAudio } from './yoola/audio.ts';

const root = resolve(import.meta.dirname, '..');
const game = join(root, 'yoola');
const pkg = join(game, 'package');
const devkit = process.env.YOOLA_DEVKIT ?? join(homedir(), '.agents/skills/ks-yoola-devkit/scripts');
const fail = (m: string): never => {
  console.error('✗ ' + m);
  process.exit(1);
};

if (!existsSync(join(game, 'package/game.js'))) fail('yoola/package 不存在：先用 scaffold-init.mjs 建脚手架');
if (!existsSync(join(devkit, 'validate-package.mjs'))) fail('找不到 Yoola devkit：' + devkit);

// 1. 音频
const audioDir = await ensureAudio();

// 2. 打包 + 降级
await build({ root, mode: 'yoola', logLevel: 'warn' });
const esm = readFileSync(join(root, 'dist-yoola/pack-battle.js'), 'utf8');
const r = ts.transpileModule(esm, {
  fileName: 'pack-battle.js',
  reportDiagnostics: true,
  compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES5, downlevelIteration: true, module: ts.ModuleKind.CommonJS, removeComments: true },
});
if (r.diagnostics?.length) fail('降到 ES5 失败：' + r.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; '));
const code = r.outputText;

// 包里不能有调试接口（能白拿广告奖励）、不能有 ES 模块语法
if (code.includes('__game')) fail('调试接口混进了快手包');
if (/^\s*(import|export)\s/m.test(code) || code.includes('import.meta')) fail('快手包里还有 ES 模块语法');
if (/\b(class|async|await)\s/.test(code.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, ''))) fail('快手包里还有 class / async（ES5 降级不完整）');

mkdirSync(join(pkg, 'gameplay'), { recursive: true });
writeFileSync(join(pkg, 'gameplay/pack-battle.js'), code);

// 3. 素材
const img = join(pkg, 'res/Image');
const aud = join(pkg, 'res/Audio');
for (const d of [img, aud]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
const art = join(root, 'src/assets/monsters');
for (const f of readdirSync(art)) copyFileSync(join(art, f), join(img, 'monster-' + f));
copyFileSync(join(root, 'src/assets/title/bag.webp'), join(img, 'title-bag.webp'));
for (const f of readdirSync(audioDir)) copyFileSync(join(audioDir, f), join(aud, f));
console.log(`✓ pack-battle.js ${(code.length / 1024).toFixed(0)} KB（ES5），图片 ${readdirSync(img).length}，音频 ${readdirSync(aud).length}`);

// 4. 校验 + 打 zip
let report: { passed: boolean; errors: { rule: string; message: string }[]; warnings: { rule: string; message: string }[] };
try {
  report = JSON.parse(execFileSync('node', [join(devkit, 'validate-package.mjs'), '--dir', game], { encoding: 'utf8' }));
} catch (e) {
  report = JSON.parse((e as { stdout: string }).stdout);
}
// 分享图和加载图是平台素材，要人工提供，这里不生成
const PENDING = /shareImage|loadingImage/;
const real = report.errors.filter((e) => !PENDING.test(e.message));
for (const e of report.errors) console.log(`${PENDING.test(e.message) ? '待补' : 'ERROR'}  ${e.rule}  ${e.message}`);
for (const w of report.warnings) console.log(`WARN   ${w.rule}  ${w.message}`);
if (real.length) fail('validate-package 有错误');

const zip = JSON.parse(execFileSync('node', [join(devkit, 'build-zip.mjs'), '--dir', game], { encoding: 'utf8' })) as { success: boolean; output: string; fileCount: number; skipped: string[]; sizeMiB: number };
if (!zip.success) fail('build-zip 失败');
if (zip.skipped.length) console.log('未进 zip：' + zip.skipped.join(', '));
console.log(`✓ ${zip.output}（${zip.fileCount} 个文件，${zip.sizeMiB} MiB）`);
