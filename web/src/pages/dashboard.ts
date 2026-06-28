import { dashboardMetrics, moduleCards } from '../data';
import { renderShell } from '../shell';

export const renderDashboard = () => renderShell('dashboard', `
  <section class="page">
    <h1>Dashboard inicial</h1>
    <p class="lead">Resumo operacional das entidades já presentes no Nexus, com navegação lateral comum para todas as páginas.</p>
    <div class="metrics">
      ${dashboardMetrics.map((item) => `<article class="card metric"><div class="label">${item.label}</div><div class="value">${item.value}</div><div class="sub">${item.sub}</div></article>`).join('')}
    </div>
    <div class="section-head">
      <h2>Módulos da base</h2>
      <span class="badge">Vite</span>
    </div>
    <div class="cards">
      ${moduleCards.map((item) => `<article class="card"><h2>${item.name}</h2><p>${item.desc}</p></article>`).join('')}
    </div>
  </section>
`);
