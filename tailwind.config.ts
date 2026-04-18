import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
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
        pill: '999px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      keyframes: {
        heartPop: {
          '0%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.35) rotate(-6deg)' },
          '60%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        sparkle: {
          '0%': { transform: 'translate(0,0) scale(0.4)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': {
            transform: 'translate(var(--dx), var(--dy)) scale(1)',
            opacity: '0',
          },
        },
        pageIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        heartPop: 'heartPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        sparkle: 'sparkle 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        pageIn: 'pageIn 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
