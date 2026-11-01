import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5107, strictPort: true, host: true },
  preview: { port: 5107, strictPort: true, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});
