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
        'stomp-wiggle': 'stompWiggle 3s ease-in-out infinite',
        'stomp-heartbeat': 'stompHeartbeat 1.2s ease-in-out infinite',
        'arrow-nudge-ul': 'arrowNudgeUL 2s ease-in-out infinite',
        'arrow-nudge-dl': 'arrowNudgeDL 2s ease-in-out infinite',
        'arrow-nudge-ur': 'arrowNudgeUR 2s ease-in-out infinite',
        'arrow-nudge-dr': 'arrowNudgeDR 2s ease-in-out infinite',
        'pump-feedback': 'pumpFeedback 1.5s ease-out forwards',
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
        stompWiggle: {
          '0%, 80%, 100%': { transform: 'rotate(0deg)' },
          '85%': { transform: 'rotate(-8deg)' },
          '90%': { transform: 'rotate(8deg)' },
          '95%': { transform: 'rotate(-5deg)' },
        },
        stompHeartbeat: {
          '0%, 100%': { transform: 'scale(1.1)' },
          '15%': { transform: 'scale(1.3)' },
          '30%': { transform: 'scale(1.1)' },
          '45%': { transform: 'scale(1.25)' },
          '60%': { transform: 'scale(1.1)' },
        },
        arrowNudgeUL: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-3px, -3px)' },
        },
        arrowNudgeDL: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-3px, 3px)' },
        },
        arrowNudgeUR: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(3px, -3px)' },
        },
        arrowNudgeDR: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(3px, 3px)' },
        },
        pumpFeedback: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '70%': { opacity: '1' },
          '100%': { transform: 'translateY(-20px)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
