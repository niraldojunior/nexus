import { renderShell } from '../shell';

export const renderService = () => renderShell('service', `
  <section class="page">
    <h1>Service</h1>
    <p class="lead">Página em estrutura para Service Inventory, CFS e RFS, com foco em relacionamento e estado de serviço.</p>
    <div class="card">
      <h2>Próximo passo</h2>
      <p>Expor o inventário de serviços e a navegação por supportingResource.</p>
    </div>
  </section>
`);
