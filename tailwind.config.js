/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e9fbf4',
          100: '#c9f4e3',
          200: '#a9eed2',
          300: '#8ee8c4',
          400: '#7ae3ba',
          500: '#5ce0b3',
          600: '#41c594',
          700: '#2ea57f'
        },
        warning: {
          50: '#fff6e6',
          100: '#fdeccf',
          300: '#f5c26b',
          500: '#e7a944',
          600: '#c7831d'
        },
        danger: {
          500: '#ff5d5d',
          600: '#e04646'
        },
        muted: '#9aa4b2',
        surface: '#151a1f',
        background: '#0c0d0f',
        border: '#252a31'
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'ui-sans-serif', 'system-ui'],
        manrope: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui']
      }
    }
  },
  plugins: []
};
