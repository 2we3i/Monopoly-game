/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        table: { DEFAULT: '#0f3d2e', dark: '#0a2b20', light: '#155040' },
        board: { DEFAULT: '#f2e8d5', tile: '#faf4e6', line: '#d9c9a3' },
        ink: { DEFAULT: '#1f2417', soft: '#4a4f3d', faint: '#8a8b76' },
        brass: { DEFAULT: '#c9982f', deep: '#96701c', light: '#e3bb5c', soft: '#f0d79a' },
        rent: { DEFAULT: '#a8342a', deep: '#7c2019', light: '#e0695c' },
        go: { DEFAULT: '#1f7a5c', deep: '#155a43', light: '#4fc39a' },
        // Dark UI chrome that frames the parchment board.
        felt: {
          900: '#061109', 800: '#0a1b13', 700: '#0e2419',
          600: '#123021', 500: '#173c2a', 400: '#1e4c36',
        },
        parch: { DEFAULT: '#f4ecdc', soft: '#cfc4ae', dim: '#94917f' },
        grp: {
          copper: '#7a5230', brown: '#7a5230', lightblue: '#a3d0e8', teal: '#3fa9a6',
          pink: '#d888b0', magenta: '#c14e9a', orange: '#e08a3c', amber: '#e0a83c',
          red: '#c4453a', crimson: '#a32d3f', yellow: '#e8cf4a', gold: '#d4af37',
          green: '#3f9463', emerald: '#2e8b57', blue: '#3a6ea8', indigo: '#4b5fa8',
          violet: '#7a5fb8', rose: '#c1567c', slate: '#5a6b7a', obsidian: '#3a3f47',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        tile: '0 1px 2px rgba(31,36,23,0.15)',
        panel: '0 8px 30px rgba(0,0,0,0.35)',
        token: '0 2px 4px rgba(0,0,0,0.4)',
        brass: '0 0 0 3px rgba(201,152,47,0.35)',
        // New, for the dark chrome.
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 10px 30px -12px rgba(0,0,0,0.7)',
        lift: '0 2px 6px -1px rgba(0,0,0,0.45), 0 12px 28px -10px rgba(0,0,0,0.6)',
        deep: '0 24px 60px -20px rgba(0,0,0,0.85)',
        deed: '0 1px 1px rgba(31,36,23,0.10), 0 4px 10px -6px rgba(31,36,23,0.35)',
        'deed-hover': '0 2px 4px rgba(31,36,23,0.14), 0 14px 26px -12px rgba(31,36,23,0.55)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.96) translateY(8px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        'turn-ring': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(227,187,92,0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgba(227,187,92,0)' },
        },
        tumble: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '35%': { transform: 'rotate(-140deg) scale(1.12)' },
          '70%': { transform: 'rotate(160deg) scale(0.94)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.2s ease-out',
        'fade-in': 'fade-in 0.18s ease-out',
        'slide-up': 'slide-up 0.24s cubic-bezier(0.22,1,0.36,1)',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.22,1,0.36,1)',
        'turn-ring': 'turn-ring 2.4s ease-out infinite',
        tumble: 'tumble 0.55s cubic-bezier(0.3,0.8,0.3,1)',
        sheen: 'sheen 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
