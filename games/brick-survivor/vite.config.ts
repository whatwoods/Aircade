import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5102, strictPort: true, host: true },
  preview: { port: 5102, strictPort: true, host: true },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 400,
  },
});
