// 3:4 封面：node scripts/trailer/cover.ts → marketing/trailer/cover-3x4.png / .jpg
// 底图和字标来自 shoot.ts 的 cover34 镜头（实机渲染）
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = join(ROOT, 'marketing/trailer/raw');
const data = (f: string): string => 'data:image/png;base64,' + readFileSync(join(RAW, f)).toString('base64');

// 坐标按 1080×1440（底图 2160×2880 的一半）
const opts = {
  w: 1080,
  h: 1440,
  bg: data('cover34_0.png'),
  logo: data('logo.png'),
  logoBox: { x: 14, y: 4, w: 425, rot: -0.03 },
  text: { str: '要输了？', x: 545, y: 640, size: 230, rot: -0.03 },
  ring: { x: 548, y: 1240, rx: 245, ry: 66 },
};

const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 5197, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5197/scripts/trailer/caption.html');
  await page.waitForFunction(() => (window as any).ready);
  const url = (await page.evaluate((o) => (window as any).cover(o), opts)) as string;
  const png = join(ROOT, 'marketing/trailer/cover-3x4.png');
  writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '2', png.replace(/\.png$/, '.jpg')]);
  console.log('→ marketing/trailer/cover-3x4.png / .jpg');
} finally {
  await browser.close();
  await server.close();
}
