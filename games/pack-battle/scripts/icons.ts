// 导出应用图标：起一个临时 Vite 开发服务器，用无头 Chrome 截 scripts/icon/ 页面，存到 public/icons/ 和快手 yoola-assets/
// 用法：pnpm icons（需要本机装有 Chrome；换了行囊图后重跑一次）
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) {
  console.error('找不到 Chrome，用 CHROME=<路径> 指定');
  process.exit(1);
}

const OUT = resolve(import.meta.dirname, '../public/icons');
mkdirSync(OUT, { recursive: true });

const KWAI = resolve(import.meta.dirname, '../yoola/package/yoola-assets');
const ICONS: { file: string; size: number; bare?: boolean }[] = [
  { file: resolve(OUT, 'icon-512.png'), size: 512 },
  { file: resolve(OUT, 'apple-touch-icon.png'), size: 180 },
  { file: resolve(OUT, 'favicon-32.png'), size: 32, bare: true },
  // 快手平台素材：220×220 PNG
  { file: resolve(KWAI, 'icon.png'), size: 220 },
];

// 独立的用户目录：否则本机已开着的 Chrome 会接管这次启动，截图不落盘
const profile = mkdtempSync(resolve(tmpdir(), 'pack-battle-icons-'));
const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'error' });
await server.listen();
try {
  for (const ic of ICONS) {
    const url = `http://localhost:5194/scripts/icon/?size=${ic.size}${ic.bare ? '&bare=1' : ''}`;
    // 必须异步：同步等待会卡住本进程里的 Vite 服务器，Chrome 永远等不到页面
    await promisify(execFile)(CHROME, [
      '--headless=new', '--default-background-color=00000000', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${ic.size},${ic.size}`,
      '--virtual-time-budget=5000', `--screenshot=${ic.file}`, url,
    ], { timeout: 60000 });
    console.log('✓', ic.file.slice(ic.file.indexOf('pack-battle/') + 12));
  }
} finally {
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
