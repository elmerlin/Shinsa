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
          silver: '#c0c0c0',
          bronze: '#cd7f32',
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
      animation: {
        'card-flip': 'cardFlip 0.6s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'float-up': 'floatUp 2s ease-out forwards',
      },
      keyframes: {
        cardFlip: {
          '0%': { transform: 'rotateY(180deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255, 51, 102, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(255, 51, 102, 0.6)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        floatUp: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '50%': { transform: 'translateY(-120px) scale(1.3)', opacity: '0.8' },
          '100%': { transform: 'translateY(-250px) scale(0.8)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
