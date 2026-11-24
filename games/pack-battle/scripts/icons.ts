// 导出应用图标：终版图标 marketing/icon/icon.png（1024，不入库）→ 各尺寸 PNG
//   public/icons/：favicon-32、apple-touch-icon（180）、icon-512（分享卡片）
//   yoola/package/yoola-assets/icon.png：快手平台素材 220
// 用法：pnpm icons（macOS 自带 sips 缩放；换了终版图标后重跑）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SRC = resolve(root, 'marketing/icon/icon.png');
if (!existsSync(SRC)) {
  console.error('找不到终版图标：' + relative(root, SRC));
  process.exit(1);
}

const OUT: { file: string; size: number }[] = [
  { file: 'public/icons/icon-512.png', size: 512 },
  { file: 'public/icons/apple-touch-icon.png', size: 180 },
  { file: 'public/icons/favicon-32.png', size: 32 },
  { file: 'yoola/package/yoola-assets/icon.png', size: 220 },
];

for (const o of OUT) {
  const file = resolve(root, o.file);
  mkdirSync(dirname(file), { recursive: true });
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(o.size), String(o.size), SRC, '--out', file], { stdio: 'ignore' });
  console.log('✓', o.file);
}
