import { t } from '../terms.js';
import { renderShell } from '../shell.js';

export const renderGeo = () => renderShell('geo', `
  <section class="page">
    <h1>Módulo Geo</h1>
    <p class="lead">Gerencie ${t('GeographicLocation')}, ${t('GeographicAddress')}, ${t('GeographicSiteSpecification')} e ${t('GeographicSite')} em um fluxo único.</p>
    <div class="card">
      <h2>Escopo da tela</h2>
      <p>Esta página fica isolada no menu lateral para concentrar as entidades geográficas e a navegação de cadastro.</p>
    </div>
  </section>
`);
