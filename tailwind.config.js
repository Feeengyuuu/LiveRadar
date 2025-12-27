/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,css}'],
  theme: {
    extend: {
      colors: {
        // Platform colors (matching CSS variables)
        douyu: '#ff5d23',
        bilibili: '#fb7299',
        twitch: '#9146ff',
        // Status colors
        live: '#10b981',
        loop: '#6366f1',
        off: '#6b7280',
        weak: '#eab308',
        gold: '#ffd700',
        // Background colors
        'card-bg': '#121212',
        'bg-dark': '#050505',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Microsoft YaHei',
          '微软雅黑',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
