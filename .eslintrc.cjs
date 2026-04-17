/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  rules: {
    // 禁止直接读 process.env，强制通过 src/lib/env.ts
    'no-restricted-globals': 'off',
    'no-process-env': 'error',

    // 禁止跨 feature 相互 import，强制通过 src/shared 共享
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/features/*/*', '!@/features/*/index', '!@/features/*'],
            message:
              'Cross-feature imports must go through the feature index. Put shared logic in src/shared.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/lib/env.ts'],
      rules: { 'no-process-env': 'off' },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: { 'no-process-env': 'off' },
    },
    {
      files: ['drizzle.config.ts', 'vitest.config.ts', 'next.config.mjs'],
      rules: { 'no-process-env': 'off' },
    },
    {
      files: ['src/db/seed.ts'],
      rules: {
        'no-process-env': 'off',
        'no-restricted-imports': 'off',
      },
    },
  ],
};
