/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': '#e7eaf0',
        'app-canvas': '#e7eaf0',
        'app-sidebar': '#f8fafc',
        'app-panel': '#ffffff',
        'app-card': '#fff6cc',
        'app-border': '#d7dee8',
        'app-text': '#243041',
        'app-muted': '#64748b',
        'app-focus': '#f3c600',
        'app-strong': '#1f2937',
        'app-accent': '#ffd200',
        'app-accent-soft': '#fff8da',
        'app-accent-border': '#f2d35a',
        'app-ink': '#243041',
        'app-ink-soft': '#2f3b4d',
        'app-on-ink': '#ffffff',
        'app-on-ink-muted': 'rgba(255, 255, 255, 0.6)',
        'brand-amber': '#ffb000',
        'brand-terracotta': '#ffb000',
        // Espelham docs/4-design-system/tokens/colors.css (--status-*) — o web/ ainda
        // não lê CSS vars do design system, então trazemos os mesmos valores para cá.
        'status-green': '#10b981',
        'status-green-soft': '#e7f8f1',
        'status-amber': '#f59e0b',
        'status-amber-soft': '#fef4e2',
        'status-red': '#ef4444',
        'status-red-soft': '#fdecec',
      },
      boxShadow: {
        soft: '0 6px 20px rgba(15, 23, 42, 0.06)',
        'soft-lg': '0 12px 34px rgba(15, 23, 42, 0.09)',
        modal: '0 28px 64px rgba(15, 23, 42, 0.18)',
        'focus-accent': '0 0 0 3px rgba(255, 210, 0, 0.28)',
        // Sombra do dock (hierarquia/detalhe) sobre o mapa de fundo — estilo Google
        // Maps: mais forte que `soft`, para se destacar do canvas cinza-claro do mapa.
        dock: '3px 0 18px rgba(15, 23, 42, 0.22)',
      },
      fontFamily: {
        sans: ['"Aptos"', '"Segoe UI"', '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: [
          '"Aptos Display"',
          '"Aptos"',
          '"Segoe UI"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
