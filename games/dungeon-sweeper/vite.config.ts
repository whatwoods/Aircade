import { mkdirSync, writeFileSync } from 'node:fs';
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

export default defineConfig({
  base: './',
  plugins: [assetSink()],
  server: { port: 5101, strictPort: true, host: true },
  preview: { port: 5101, strictPort: true, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 400,
  },
});
