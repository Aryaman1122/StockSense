import type { Config } from 'tailwindcss';

// Palette carried over from legacy/index.html (dark navy surfaces, red accent).
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d0f',
        s0: '#111116', s1: '#16161d', s2: '#1c1c26', s3: '#22222e', s4: '#2a2a38',
        b1: '#1e1e2a', b2: '#26263a', b3: '#30304a',
        accent: { DEFAULT: '#e03a3a', soft: '#c0322b' },
        info: '#3d8ef0', ok: '#2dc98d', warn: '#f5a623', violet: '#a78bfa',
        t1: '#f0f0f8', t2: '#b0b0c8', t3: '#6a6a88', t4: '#3a3a52',
      },
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'], mono: ['ui-monospace', 'monospace'] },
    },
  },
} satisfies Config;
