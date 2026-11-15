// 快手版音频产出：
//   音效：网页版合成配方（src/audio/sfx.ts）→ 无头 Chrome 的 OfflineAudioContext → 32kHz 单声道 wav
//   音乐：src/assets/music/*.m4a → ffmpeg → mp3（快手 InnerAudioContext 只支持 wav / mp3）
// 产物放 yoola/.cache/audio/，源码没变就不重做。直接运行（pnpm audio:yoola）强制重做。
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { MUSIC_MODES, musicFileName } from '../../src/audio/sfxFiles.ts';

const root = resolve(import.meta.dirname, '../..');
export const AUDIO_CACHE = join(root, 'yoola', '.cache', 'audio');
const HASH_FILE = join(root, 'yoola', '.cache', 'audio.hash');

function sourceHash(): string {
  const h = createHash('sha256');
  const files = ['src/audio/audio.ts', 'src/audio/sfx.ts', 'src/audio/sfxFiles.ts', 'scripts/yoola/sfx-page.ts', 'scripts/yoola/audio.ts'];
  for (const f of files) h.update(readFileSync(join(root, f)));
  for (const m of MUSIC_MODES) h.update(readFileSync(join(root, 'src/assets/music', m + '.m4a')));
  return h.digest('hex');
}

function chromePath(): string {
  const cands = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const hit = cands.find((p) => p && existsSync(p));
  if (!hit) throw new Error('找不到 Chrome：设置环境变量 CHROME_PATH');
  return hit;
}

/** 无头 Chrome 打开页面，等页面标题变 done，取回 #out 的文本（CDP，不依赖 puppeteer） */
async function runInChrome(url: string, tmp: string): Promise<string> {
  const proc = spawn(chromePath(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + join(tmp, 'profile'), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const endpoint = await new Promise<string>((ok, no) => {
      let buf = '';
      proc.stderr.on('data', (d: Buffer) => {
        buf += d.toString();
        const m = /DevTools listening on ws:\/\/([\d.]+:\d+)\//.exec(buf);
        if (m) ok(m[1]);
      });
      proc.on('exit', () => no(new Error('Chrome 提前退出')));
      setTimeout(() => no(new Error('Chrome 启动超时')), 20000);
    });
    const list = (await (await fetch(`http://${endpoint}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的页面');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((ok, no) => {
      ws.onopen = () => ok();
      ws.onerror = () => no(new Error('CDP 连接失败'));
    });
    let seq = 0;
    const pending = new Map<number, (v: { result?: { value?: string } }) => void>();
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { id?: number; result?: { result?: { value?: string } } };
      if (m.id !== undefined) pending.get(m.id)?.(m.result ?? {});
    };
    const call = (method: string, params: object = {}): Promise<{ result?: { value?: string } }> =>
      new Promise((ok) => {
        const id = ++seq;
        pending.set(id, ok);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evalStr = async (expr: string): Promise<string> => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value ?? '';
    await call('Page.navigate', { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      await new Promise((r) => setTimeout(r, 500));
      if ((await evalStr('document.title')) === 'done') break;
      const o = await evalStr("(document.getElementById('out')||{}).textContent||''");
      if (o.startsWith('ERROR')) return o;
    }
    const text = await evalStr("document.getElementById('out').textContent");
    ws.close();
    return text;
  } finally {
    proc.kill();
  }
}

async function renderSfx(): Promise<void> {
  // 把渲染页打成一个脚本（网页版的配方代码原样进来，只换入口）
  const out = (await build({
    root,
    configFile: false,
    logLevel: 'silent',
    define: { __YOOLA__: 'false', __APP_VERSION__: '""' },
    build: { write: false, minify: false, lib: { entry: 'scripts/yoola/sfx-page.ts', formats: ['iife'], name: 'SfxPage' } },
  })) as { output: { type: string; code?: string }[] } | { output: { type: string; code?: string }[] }[];
  const chunks = Array.isArray(out) ? out.flatMap((o) => o.output) : out.output;
  const code = chunks.find((c) => c.type === 'chunk')?.code;
  if (!code) throw new Error('渲染页打包失败');

  const tmp = mkdtempSync(join(tmpdir(), 'pb-sfx-'));
  try {
    writeFileSync(join(tmp, 'page.html'), `<!doctype html><meta charset="utf-8"><title>render</title><pre id="out"></pre><script>${code.replace(/<\/script/g, '<\\/script')}</script>`);
    const body = await runInChrome('file://' + join(tmp, 'page.html'), tmp);
    if (!body.startsWith('{')) throw new Error('音效渲染失败：' + body.slice(0, 400));
    const files = JSON.parse(body) as Record<string, string>;
    for (const [name, b64] of Object.entries(files)) writeFileSync(join(AUDIO_CACHE, name), Buffer.from(b64, 'base64'));
    console.log(`  音效 ${Object.keys(files).length} 个 wav`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function convertMusic(): void {
  for (const m of MUSIC_MODES) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(root, 'src/assets/music', m + '.m4a'), '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', join(AUDIO_CACHE, musicFileName(m))]);
  }
  console.log(`  音乐 ${MUSIC_MODES.length} 个 mp3`);
}

/** 产物过期（或不存在）就重做；返回产物目录 */
export async function ensureAudio(force = false): Promise<string> {
  const h = sourceHash();
  if (!force && existsSync(HASH_FILE) && readFileSync(HASH_FILE, 'utf8') === h && existsSync(AUDIO_CACHE) && readdirSync(AUDIO_CACHE).length > 0) return AUDIO_CACHE;
  console.log('渲染快手版音频…');
  rmSync(AUDIO_CACHE, { recursive: true, force: true });
  mkdirSync(AUDIO_CACHE, { recursive: true });
  await renderSfx();
  convertMusic();
  writeFileSync(HASH_FILE, h);
  return AUDIO_CACHE;
}

if (import.meta.filename === process.argv[1]) {
  await ensureAudio(true);
  console.log('✓ ' + AUDIO_CACHE);
}
