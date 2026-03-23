/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        piu: {
          bg: '#0a0a1a',
          card: '#141428',
          accent: '#ff3366',
          gold: '#ffd700',
          blue: '#4488ff',
          green: '#33ff66',
          dark: '#0d0d20',
          border: '#2a2a4a',
        },
      },
      fontFamily: {
        display: ['"Rajdhani"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
