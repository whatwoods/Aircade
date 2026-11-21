// 渲染字幕 PNG：node scripts/trailer/captions.ts → marketing/trailer/caps/<n>.png
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'marketing/trailer/caps');
const edit = JSON.parse(readFileSync(join(ROOT, 'scripts/trailer/edit.json'), 'utf8')) as { captions: { text: string; size: number }[] };
mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 5198, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5198/scripts/trailer/caption.html');
  await page.waitForFunction(() => (window as any).ready);
  for (const [i, c] of edit.captions.entries()) {
    const url = (await page.evaluate(([t, s]) => (window as any).render(t, s), [c.text, c.size] as const)) as string;
    writeFileSync(join(OUT, i + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('caption', i, c.text);
  }
} finally {
  await browser.close();
  await server.close();
}
