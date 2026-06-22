/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core cyberpunk palette
        'void':     '#070812',
        'abyss':    '#0a0d1a',
        'surface':  '#0e1028',
        'panel':    '#111530',
        'border':   '#1e2548',
        'subtle':   '#252d5a',

        // Neon accents
        'cyan':     { DEFAULT: '#00d4ff', dim: '#0091af', glow: '#00d4ff66' },
        'magenta':  { DEFAULT: '#ff3db4', dim: '#9e2470', glow: '#ff3db466' },
        'green':    { DEFAULT: '#00ff9d', dim: '#008c56', glow: '#00ff9d66' },
        'amber':    { DEFAULT: '#ffd600', dim: '#9e8600', glow: '#ffd60066' },
        'red':      { DEFAULT: '#ff3d6a', dim: '#9e2442', glow: '#ff3d6a66' },
        'purple':   { DEFAULT: '#c77dff', dim: '#7048ae', glow: '#c77dff66' },

        // Text hierarchy
        'text-primary':   '#e8eaf6',
        'text-secondary': '#8891c0',
        'text-muted':     '#444d7a',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body:    ['Exo 2', 'sans-serif'],
        code:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      boxShadow: {
        'neon-cyan':    '0 0 20px 0 rgba(0, 212, 255, 0.4), 0 0 40px 0 rgba(0, 212, 255, 0.15)',
        'neon-green':   '0 0 20px 0 rgba(0, 255, 157, 0.4), 0 0 40px 0 rgba(0, 255, 157, 0.15)',
        'neon-magenta': '0 0 20px 0 rgba(255, 61, 180, 0.4)',
        'neon-amber':   '0 0 20px 0 rgba(255, 214, 0, 0.4)',
        'neon-red':     '0 0 20px 0 rgba(255, 61, 106, 0.4)',
        'panel':        '0 4px 24px 0 rgba(0, 0, 0, 0.6)',
        'inner-glow':   'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grid-pattern': `
          linear-gradient(rgba(0, 212, 255, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 212, 255, 0.04) 1px, transparent 1px)
        `,
        'scanlines': `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0,0,0,0.08) 2px,
          rgba(0,0,0,0.08) 4px
        )`,
        'neon-gradient': 'linear-gradient(135deg, #00d4ff, #c77dff, #ff3db4)',
        'panel-gradient': 'linear-gradient(135deg, rgba(14,16,40,0.95), rgba(11,14,34,0.98))',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.8' },
          '94%': { opacity: '1' },
          '96%': { opacity: '0.9' },
          '97%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ping-once': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'typing-cursor': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan': 'scan 3s linear infinite',
        'flicker': 'flicker 8s infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-in': 'fade-in 0.5s ease-out',
        'ping-once': 'ping-once 0.6s ease-out forwards',
        'float': 'float 4s ease-in-out infinite',
        'typing-cursor': 'typing-cursor 1s step-end infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
