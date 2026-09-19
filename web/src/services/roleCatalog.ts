// Catálogo canônico de papéis e descrições do V.tal Nexus.
// Fonte normativa: docs/3-system-design/security.md §3.

export type RoleDefinition = {
  label: string;
  description: string;
};

export const ROLE_CATALOG: Record<string, RoleDefinition> = {
  'inventory.reader': {
    label: 'Leitor de Inventário',
    description: 'Visualizar dados de locais, recursos e serviços do próprio tenant.',
  },
  'inventory.editor': {
    label: 'Editor de Inventário',
    description: 'Criar e alterar entidades de Geo, Recursos e Serviços.',
  },
  'order.reader': {
    label: 'Leitor de Ordens',
    description: 'Visualizar serviços e ordens (sem abertura ou operação).',
  },
  'order.requester': {
    label: 'Solicitante de Ordens',
    description: 'Abrir ordens e consultar viabilidade técnica.',
  },
  'order.operator': {
    label: 'Operador de Ordens',
    description: 'Executar designação e avançar estados de ordens.',
  },
  'catalog.admin': {
    label: 'Administrador de Catálogo',
    description: 'Manter especificações e tipos de relacionamento (C9).',
  },
  'studio.reader': {
    label: 'Leitor do Studio',
    description: 'Consultar modelos e versões publicadas/draft do Studio.',
  },
  'studio.editor': {
    label: 'Editor do Studio',
    description: 'Criar, alterar e validar drafts de modelagem no Studio.',
  },
  'studio.admin': {
    label: 'Administrador do Studio',
    description: 'Publicar, descartar drafts e executar exclusões governadas.',
  },
  'tenant.admin': {
    label: 'Administrador de Tenant',
    description: 'Gerenciar usuários e acessos do próprio tenant.',
  },
  'platform.admin': {
    label: 'Administrador da Plataforma',
    description: 'Acesso transversal de operação V.tal com auditoria reforçada.',
  },
};

export const getRoleDefinition = (role: string): RoleDefinition =>
  ROLE_CATALOG[role] ?? {
    label: role,
    description: 'Permissão personalizada do sistema.',
  };
