/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0074d4',
          50: '#e6f3ff',
          100: '#b3d9ff',
          200: '#80bfff',
          300: '#4da6ff',
          400: '#1a8cff',
          500: '#0074d4',
          600: '#005bb1',
          700: '#00428e',
          800: '#002a6b',
          900: '#001148'
        }
      }
    }
  },
  plugins: []
};

