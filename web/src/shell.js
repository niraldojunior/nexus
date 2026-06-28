const nav = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Resumo geral' },
  { id: 'geo', label: 'Geo', hint: 'Localização e Sites' },
  { id: 'resource', label: 'Resource', hint: 'Em breve' },
  { id: 'service', label: 'Service', hint: 'Em breve' },
  { id: 'order', label: 'Order', hint: 'Em breve' },
];

export const renderShell = (active, content) => `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">N</div>
        <div>
          <div class="brand-title">Nexus</div>
          <div class="brand-subtitle">V.tal Network Inventory</div>
        </div>
      </div>
      <nav class="nav">
        ${nav.map((item) => `<button class="nav-item ${item.id === active ? 'active' : ''}" aria-current="${item.id === active ? 'page' : 'false'}" data-route="${item.id}"><span><strong>${item.label}</strong><small>${item.hint}</small></span></button>`).join('')}
      </nav>
    </aside>
    <main class="main">
      ${content}
    </main>
  </div>
`;
