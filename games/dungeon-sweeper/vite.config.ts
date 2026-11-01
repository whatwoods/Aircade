import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** 开发专用：接收 __game.exportAssets() 生成的 PNG，写进 public/（图标与 OG 图由代码程序化生成） */
function assetSink(): Plugin {
  return {
    name: 'asset-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__asset', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[\w.-]+\.png$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

/**
 * 构建时生成 Service Worker：预缓存全部产物与 public/ 文件，离线可玩。
 * 页面导航走网络优先（拿到新版本），带哈希的资源走缓存优先。
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const pub = readdirSync(resolve(dirname(fileURLToPath(import.meta.url)), 'public')).filter((f) => !f.startsWith('.') && f !== 'og.png');
      const files = ['./', ...Object.keys(bundle), ...pub].filter((f) => f !== 'sw.js');
      let h = 0;
      for (const f of files.join('|')) h = (Math.imul(h, 31) + f.charCodeAt(0)) | 0;
      const cache = `aircade.dungeon-sweeper.${(h >>> 0).toString(36)}`;
      const source = `const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('aircade.dungeon-sweeper.') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [assetSink(), serviceWorker()],
  server: { port: 5101, strictPort: true, host: true },
  preview: { port: 5101, strictPort: true, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 400,
  },
});
