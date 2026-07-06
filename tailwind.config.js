/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': '#edf2f7',
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
        'brand-terracotta': '#ffb000',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
        modal: '0 28px 64px rgba(15, 23, 42, 0.18)',
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
