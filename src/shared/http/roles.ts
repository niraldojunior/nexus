// Matriz de papéis por área (ver docs/3-system-design/security.md §3). Fonte única para as rotas
// HTTP e para o servidor MCP: o Copilot só pode executar o que a UI executaria para o mesmo papel.

// Papéis que administram contas de usuário.
export const USER_ADMIN_ROLES = ['tenant.admin', 'platform.admin'] as const;

// Mesmos papéis que GeoService.assertRole exige internamente para leitura/escrita de Site
// (READ_ROLE/WRITE_ROLE, privados a service.ts) — os Projetos de trabalho (REQ-MOD01-015)
// não passam pelo GeoService, então a camada de entrada replica a checagem.
export const PROJECT_READ_ROLES = ['inventory.reader', 'platform.admin'] as const;
export const PROJECT_WRITE_ROLES = ['inventory.editor', 'platform.admin'] as const;

// RBAC de Party/Resource/Service/Event/Order. Segue o mesmo critério estrito do
// GeoService.assertRole: papel exato ou platform.admin — não há hierarquia implícita entre papéis
// (um editor sem `inventory.reader` não lê por herança).
export const INVENTORY_READ_ROLES = ['inventory.reader', 'platform.admin'] as const;
export const INVENTORY_WRITE_ROLES = ['inventory.editor', 'platform.admin'] as const;
// Specifications/RelationshipTypes (catálogo) só mudam com catalog.admin; a leitura do catálogo
// segue o papel de leitura comum, mesmo critério do GeoService para RelationshipType (§3, C9).
export const CATALOG_ADMIN_ROLES = ['catalog.admin', 'platform.admin'] as const;

// Studio é o control plane de metadados. Os papéis são explícitos para que o leitor também possa
// consultar o draft compartilhado; escrita/publicação usam gates mais estritos em seus endpoints.
export const STUDIO_READ_ROLES = [
  'studio.reader',
  'studio.editor',
  'studio.admin',
  'platform.admin',
] as const;
export const STUDIO_EDIT_ROLES = ['studio.editor', 'studio.admin', 'platform.admin'] as const;
export const STUDIO_ADMIN_ROLES = ['studio.admin', 'platform.admin'] as const;

// order.requester abre ordens e consulta viabilidade (leitura + criação); order.operator executa
// designação e avança o estado de uma ordem existente (PATCH/DELETE); order.reader é somente
// leitura, sem criar nem operar — cobre quem só precisa visualizar Serviços/Ordens.
export const ORDER_READ_ROLES = [
  'order.reader',
  'order.requester',
  'order.operator',
  'platform.admin',
] as const;
export const ORDER_REQUEST_ROLES = ['order.requester', 'platform.admin'] as const;
export const ORDER_OPERATE_ROLES = ['order.operator', 'platform.admin'] as const;
