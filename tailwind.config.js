/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': '#fafafb',
        'app-canvas': '#fafafb',
        'app-sidebar': '#fafafb',
        'app-panel': '#ffffff',
        'app-card': '#ffffff',
        'app-border': '#e8e8ee',
        'app-text': '#2e2d39',
        'app-muted': '#8a8899',
        'app-focus': '#ffd919',
        'app-strong': '#181919',
        'app-accent': '#ffd919',
        'app-accent-soft': '#fef7dc',
        'app-accent-border': '#ffe047',
        'app-ink': '#181919',
        'app-ink-soft': '#2e2d39',
        'app-on-ink': '#ffffff',
        'app-on-ink-muted': 'rgba(255, 255, 255, 0.6)',
        'brand-amber': '#f59e0b',
        'brand-terracotta': '#f59e0b',
        // Espelham docs/4-design-system/tokens/colors.css (--status-*)
        'status-green': '#10b981',
        'status-green-soft': '#e7f8f1',
        'status-amber': '#f59e0b',
        'status-amber-soft': '#fef4e2',
        'status-red': '#ef4444',
        'status-red-soft': '#fdecec',
        'status-blue': '#3b82f6',
        'status-blue-soft': '#eaf2fe',
        'status-purple': '#8b5cf6',
        'status-purple-soft': '#f1ecfd',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(46, 45, 57, 0.04)',
        'soft-lg': '0 4px 16px rgba(46, 45, 57, 0.08)',
        modal: '0 20px 48px rgba(46, 45, 57, 0.16)',
        'focus-accent': '0 0 0 3px rgba(255, 217, 25, 0.45)',
        // Sombra do dock (hierarquia/detalhe) sobre o mapa de fundo — estilo Google
        // Maps: mais forte que `soft`, para se destacar do canvas cinza-claro do mapa.
        dock: '3px 0 18px rgba(15, 23, 42, 0.22)',
        // Controles flutuantes sobre o mapa (busca, MUB, GPS) — sombra curta e escura,
        // no padrão do Google Maps: o `soft` (6 % de alfa, 20 px de desfoque) some sobre
        // o canvas claro do mapa e confunde o controle com o próprio mapa.
        'map-control': '0 1px 4px -1px rgba(15, 23, 42, 0.32)',
        'map-control-lg': '0 2px 10px -1px rgba(15, 23, 42, 0.35)',
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: [
          '"Montserrat"',
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
