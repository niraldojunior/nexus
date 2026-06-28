import { renderShell } from '../shell';

export const renderResource = () => renderShell('resource', `
  <section class="page">
    <h1>Resource</h1>
    <p class="lead">Página em estrutura para o inventário físico e lógico. Esta tela ficará responsável pelo catálogo e pela instância de Resources.</p>
    <div class="card">
      <h2>Próximo passo</h2>
      <p>Conectar a modelagem de Resources, place e supporting relations ao backend.</p>
    </div>
  </section>
`);
