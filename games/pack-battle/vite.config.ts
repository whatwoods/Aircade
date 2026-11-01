import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5104, strictPort: true, host: true },
  preview: { port: 5104, strictPort: true, host: true },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
  },
});
