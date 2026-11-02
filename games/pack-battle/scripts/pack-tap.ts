// pnpm build:tap 的最后一步：检查 dist-tap，打成 TapTap H5 要求的 zip（根目录只有一个游戏文件夹，index.html 在它第一层）
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadEnv } from 'vite';

const FOLDER = 'pack-battle';
const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist-tap');
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

if (!existsSync(join(dist, 'index.html'))) throw new Error('dist-tap 里没有 index.html，先运行 vite build --mode tap');

// 调试接口能白拿广告奖励，不能进包
const scripts = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
for (const f of scripts) {
  if (readFileSync(join(dist, 'assets', f), 'utf8').includes('__game')) throw new Error(`调试接口混进了 TapTap 包：${f}`);
}

const env = loadEnv('tap', root, 'VITE_TAP_');
if (!env.VITE_TAP_AD_REWARDED || !env.VITE_TAP_AD_INTERSTITIAL) console.warn('⚠ .env.tap 的广告单元 ID 没填全，这个包缺的那类广告不会出现');

const out = join(root, 'release', `${FOLDER}-tap-${version}.zip`);
mkdirSync(join(root, 'release'), { recursive: true });
rmSync(out, { force: true });
const stage = mkdtempSync(join(tmpdir(), 'pack-tap-'));
try {
  cpSync(dist, join(stage, FOLDER), { recursive: true });
  execFileSync('zip', ['-rqX', out, FOLDER, '-x', '*.DS_Store'], { cwd: stage });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`✓ ${out}`);
