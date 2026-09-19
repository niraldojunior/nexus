/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': 'var(--surface-app)',
        'app-canvas': 'var(--surface-app)',
        'app-sidebar': 'var(--surface-sidebar)',
        'app-panel': 'var(--surface-card)',
        'app-card': 'var(--surface-card)',
        'app-border': 'var(--border)',
        'app-text': 'var(--text-primary)',
        'app-muted': 'var(--text-tertiary)',
        'app-focus': 'var(--vt-yellow)',
        'app-strong': 'var(--text-primary)',
        'app-accent': 'var(--vt-yellow)',
        'app-accent-soft': 'var(--sidebar-item-active)',
        'app-accent-border': 'var(--vt-yellow-light)',
        'app-ink': 'var(--surface-ink)',
        // `--neutral-700` inverte no tema escuro (vira cinza claro), o que fazia este
        // painel "ink" clarear no dark mode. `--surface-ink` é o token feito para ficar
        // escuro nos dois temas — mesma superfície usada em botões/painéis de marca.
        'app-ink-soft': 'var(--surface-ink)',
        'app-on-ink': 'var(--text-on-dark)',
        'app-on-ink-muted': 'var(--text-on-dark-dim)',
        'brand-amber': '#f59e0b',
        'brand-terracotta': '#f59e0b',
        // Espelham docs/4-design-system/tokens/colors.css (--status-*)
        'status-green': 'var(--status-green)',
        'status-green-soft': 'var(--status-green-soft)',
        'status-amber': 'var(--status-amber)',
        'status-amber-soft': 'var(--status-amber-soft)',
        'status-red': 'var(--status-red)',
        'status-red-soft': 'var(--status-red-soft)',
        'status-blue': 'var(--status-blue)',
        'status-blue-soft': 'var(--status-blue-soft)',
        'status-purple': 'var(--status-purple)',
        'status-purple-soft': 'var(--status-purple-soft)',
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
