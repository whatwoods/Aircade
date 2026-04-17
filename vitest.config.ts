import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    reporters: 'default',
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
});
