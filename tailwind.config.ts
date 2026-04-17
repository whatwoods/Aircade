import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#FF9F6B',
          cream: '#FFE9B8',
          mint: '#9FE3C9',
          pink: '#FFB7C5',
          milk: '#FFFBF5',
          coffee: '#3D2E1F',
        },
      },
      borderRadius: {
        btn: '12px',
        card: '20px',
        input: '10px',
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'var(--font-harmony)',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: [
          'var(--font-lxgw)',
          'var(--font-harmony)',
          'var(--font-inter)',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
