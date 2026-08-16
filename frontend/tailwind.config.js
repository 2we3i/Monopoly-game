/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep felt-green table the board sits on - a genuine dark-to-light
        // range so a radial "spotlight" behind the board is possible, not
        // just a flat color with a barely-visible vignette.
        table: {
          deep: '#0a2419',
          DEFAULT: '#0f3626',
          light: '#1c5a40',
          glow: '#237250',
        },
        // Parchment board surface - warmer and more saturated than a
        // generic cream, so it reads as aged paper/card stock, not a UI card.
        board: {
          DEFAULT: '#ecdfbd',
          tile: '#f8f0da',
          line: '#c7b184',
          shadow: '#3d2f16',
        },
        ink: {
          DEFAULT: '#211a0f',
          soft: '#4a3f2a',
          faint: '#8c7f60',
        },
        brass: {
          DEFAULT: '#c6952f',
          bright: '#f0c563',
          deep: '#8a621a',
          ink: '#3d2c0c',
        },
        rent: {
          DEFAULT: '#b23b2e',
          deep: '#7c2019',
        },
        go: {
          DEFAULT: '#1f7a52',
          deep: '#155a3d',
        },
        // Property group colors - original palette, not Hasbro's exact hues
        grp: {
          brown: '#7a5230',
          lightblue: '#a3d0e8',
          pink: '#d888b0',
          orange: '#e08a3c',
          red: '#c4453a',
          yellow: '#e8cf4a',
          green: '#3f9463',
          blue: '#3a6ea8',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        tile: '0 1px 2px rgba(33,26,15,0.18)',
        panel: '0 20px 60px -10px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.25)',
        board: '0 30px 80px -15px rgba(0,0,0,0.65), 0 0 0 1px rgba(198,149,47,0.15)',
        token: '0 2px 5px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.1)',
        brass: '0 0 0 3px rgba(198,149,47,0.35)',
        'brass-glow': '0 0 30px rgba(240,197,99,0.35), 0 0 0 1px rgba(240,197,99,0.4)',
        inset: 'inset 0 2px 4px rgba(33,26,15,0.25)',
      },
      backgroundImage: {
        felt: 'radial-gradient(circle at 50% 40%, rgba(35,114,80,0.55) 0%, rgba(15,54,38,0.2) 45%, transparent 70%)',
      },
      keyframes: {
        'dice-tumble': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '20%': { transform: 'rotate(150deg) scale(1.15)' },
          '45%': { transform: 'rotate(280deg) scale(0.92)' },
          '70%': { transform: 'rotate(390deg) scale(1.08)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        'token-hop': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-8px) scale(1.05)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'coin-fall': {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateY(0)', opacity: '0' },
        },
        'rise-in': {
          '0%': { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'board-drift': {
          '0%, 100%': { transform: 'perspective(1400px) rotateX(38deg) rotateZ(-2deg) translateY(0)' },
          '50%': { transform: 'perspective(1400px) rotateX(38deg) rotateZ(-2deg) translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(240,197,99,0.55)' },
          '100%': { boxShadow: '0 0 0 12px rgba(240,197,99,0)' },
        },
      },
      animation: {
        'dice-tumble': 'dice-tumble 0.6s cubic-bezier(0.34,1.56,0.64,1)',
        'token-hop': 'token-hop 0.4s ease-in-out',
        'pop-in': 'pop-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'coin-fall': 'coin-fall 0.9s ease-out forwards',
        'rise-in': 'rise-in 0.5s cubic-bezier(0.16,1,0.3,1)',
        'board-drift': 'board-drift 8s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

