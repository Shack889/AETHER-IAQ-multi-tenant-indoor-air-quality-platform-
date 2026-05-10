import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        aether: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#7ee7f9',
          400: '#4FD1FF',
          500: '#22b8e6',
          600: '#0e9bcc',
          700: '#0a7ba6',
          800: '#095e80',
          900: '#084560',
        },
        accent: {
          50:  '#f1f3ff',
          100: '#e3e7ff',
          400: '#a99eff',
          500: '#8B7CFF',
          600: '#6e60e6',
        },
        aeci: {
          cyan:   '#4FD1FF',
          teal:   '#2FE6C5',
          purple: '#8B7CFF',
          amber:  '#FFB84D',
          red:    '#FF5C7A',
          green:  '#47E58A',
        },
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        aqi: {
          good:      '#47E58A',
          moderate:  '#FFB84D',
          usg:       '#FF8A4D',
          unhealthy: '#FF5C7A',
          hazardous: '#B36DFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'breathe': 'breathe 3.2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        cinema: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        'halo-cyan':   '0 0 24px rgba(79, 209, 255, 0.30), 0 0 60px rgba(79, 209, 255, 0.18)',
        'halo-amber':  '0 0 24px rgba(255, 184, 77, 0.28), 0 0 60px rgba(255, 184, 77, 0.16)',
        'halo-red':    '0 0 24px rgba(255, 92, 122, 0.28), 0 0 60px rgba(255, 92, 122, 0.18)',
        'halo-green':  '0 0 24px rgba(71, 229, 138, 0.28), 0 0 60px rgba(71, 229, 138, 0.18)',
        'halo-purple': '0 0 24px rgba(139, 124, 255, 0.28), 0 0 60px rgba(139, 124, 255, 0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
