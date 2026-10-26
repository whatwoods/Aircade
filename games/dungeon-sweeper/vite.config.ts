import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5101, strictPort: true, host: true },
  preview: { port: 5101, strictPort: true, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 400,
  },
});
