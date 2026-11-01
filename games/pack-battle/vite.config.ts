import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5104, strictPort: true, host: true },
  preview: { port: 5104, strictPort: true, host: true },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
  },
});
