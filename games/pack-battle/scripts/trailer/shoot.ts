// 宣传片采集：起 Vite → Playwright 开 Chrome（390×844）→ 游戏内拍摄模式逐帧录制每个镜头
// 用法：node scripts/trailer/shoot.ts [镜头名 ...]（不填 = 全部）
// 输出：marketing/trailer/raw/<镜头>.mov（H.264 + 游戏音效 PCM，60fps）
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { SHOTS, type Ctx } from './shots.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = join(ROOT, 'marketing/trailer/raw');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5199;
export const DPR = 4;

mkdirSync(RAW, { recursive: true });
const want = process.argv.slice(2);
const list = want.length ? SHOTS.filter((s) => want.includes(s.name)) : SHOTS;
if (!list.length) throw new Error('没有这些镜头：' + want.join(' '));

const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

try {
  for (const shot of list) {
    const t0 = Date.now();
    const vp = shot.viewport ?? { w: 390, h: 844 };
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.log('  [page]', m.text());
    });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.exposeFunction('__filmWrite', (file: string, b64: string, append: boolean) => {
      const p = join(RAW, file);
      const buf = Buffer.from(b64, 'base64');
      if (append) appendFileSync(p, buf);
      else writeFileSync(p, buf);
    });
    await page.goto(`http://localhost:${PORT}/?debug=1&film=1&notut=1&seed=${shot.seed ?? 7}`);
    await page.waitForFunction(() => !!(window as unknown as { __film?: unknown; __game?: unknown }).__film && !!(window as unknown as { __game?: unknown }).__game);
    // 先按正常时钟预热 1.5 秒（精灵、立牌、字体）
    await page.waitForTimeout(1500);
    const size = await page.evaluate((d) => (window as any).__film.enter(d), shot.dpr ?? DPR);
    const ctx: Ctx = {
      page,
      g: (fn, arg) => page.evaluate(fn as any, arg) as any,
      game: (code) => page.evaluate(`(async () => { const G = window.__game, F = window.__film; ${code} })()`) as any,
    };
    console.log(`▶ ${shot.name}  ${size.w}×${size.h}`);
    await shot.run(ctx);
    await page.close();
    // h264 + wav → mov（视频流直接拷贝）；只截图的镜头没有视频
    const base = join(RAW, shot.name);
    if (!existsSync(base + '.h264')) {
      console.log(`  ✓ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      continue;
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-r', '60', '-f', 'h264', '-i', base + '.h264', '-i', base + '.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-bsf:v', 'setts=ts=N/(60*TB)', '-video_track_timescale', '6000', '-c:a', 'pcm_s16le', base + '.mov']);
    if (!process.env.KEEP) {
      rmSync(base + '.h264');
      rmSync(base + '.wav');
    }
    console.log(`  ✓ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  await server.close();
}
