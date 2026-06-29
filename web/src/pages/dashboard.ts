import { renderShell } from '../shell';

const quickActions = [
  {
    title: 'Consultar local',
    desc: 'Buscar site, endereço ou área de cobertura.',
    icon: 'map-pin',
  },
  {
    title: 'Checar viabilidade',
    desc: 'Abrir jornada de qualificação para HP ou HC.',
    icon: 'layers-3',
  },
  {
    title: 'Explorar inventário',
    desc: 'Navegar pela hierarquia de recursos e relações.',
    icon: 'grid',
  },
  {
    title: 'Abrir serviço',
    desc: 'Visualizar CFS, RFS e supporting relations.',
    icon: 'workflow',
  },
];

const icon = (name: string) => {
  const common = 'aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  const icons: Record<string, string> = {
    grid: `<svg ${common}><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>`,
    'map-pin': `<svg ${common}><path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>`,
    'layers-3': `<svg ${common}><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z"></path><path d="m2.5 13 9.5 5 9.5-5"></path><path d="m2.5 18 9.5 5 9.5-5"></path></svg>`,
    workflow: `<svg ${common}><path d="M4 6h6"></path><path d="M14 6h6"></path><path d="M10 6v12"></path><circle cx="4" cy="6" r="1.5"></circle><circle cx="20" cy="6" r="1.5"></circle><circle cx="10" cy="18" r="1.5"></circle></svg>`,
  };
  return icons[name] || icons.grid;
};

export const renderDashboard = () => renderShell('dashboard', `
  <section class="page landing">
    <div class="landing-hero">
      <div class="landing-kicker">Nexus / V.tal</div>
      <h1>Pesquise, navegue e qualifique inventário em uma interface leve.</h1>
      <p class="lead landing-lead">
        Uma landing focada em conversação e descoberta, com a estrutura visual da V.tal e o ritmo mais limpo da web do Gemini.
      </p>
    </div>

    <div class="prompt-card card">
      <div class="prompt-row">
        <div class="prompt-icon">N</div>
        <div class="prompt-copy">
          <strong>O que você quer encontrar?</strong>
          <span>Digite uma localização, recurso, serviço ou projeto.</span>
        </div>
      </div>
      <div class="prompt-box">
        <span class="prompt-placeholder">Ex.: localizar um site, abrir um serviço ou checar viabilidade</span>
        <button class="prompt-action" type="button">Enviar</button>
      </div>
      <div class="prompt-hint">Sugestão: use a navegação lateral para mudar de domínio.</div>
    </div>

    <div class="section-head landing-section-head">
      <h2>Ações rápidas</h2>
      <span class="badge">Chat landing</span>
    </div>

    <div class="quick-grid">
      ${quickActions.map((item) => `
        <article class="quick-card card">
          <div class="quick-card__icon">${icon(item.icon)}</div>
          <div class="quick-card__body">
            <h2>${item.title}</h2>
            <p>${item.desc}</p>
          </div>
        </article>
      `).join('')}
    </div>
  </section>
`);
