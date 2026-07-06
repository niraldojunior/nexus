import {
  Conversation,
  DomainCardData,
  DomainMetric,
  ProjectCardData,
  RecentItem,
  SettingsSectionGroup,
} from '../types';

export const initialProjects: ProjectCardData[] = [
  {
    id: 'geo',
    title: 'Geo',
    updatedAt: 'TMF673 / TMF674 / TMF675',
    description:
      'Sites, endereços e localizações operacionais para responder onde está cada entidade.',
  },
  {
    id: 'resource',
    title: 'Resource',
    updatedAt: 'TMF634 / TMF639',
    description: 'Inventário físico e lógico de rede, sempre referenciando Geo via place.',
  },
  {
    id: 'service',
    title: 'Service',
    badge: 'CFS / RFS',
    description:
      'Inventário de serviços comerciais e técnicos, com supportingResource e SubscriberID.',
    updatedAt: 'TMF633 / TMF638',
  },
];

export const initialConversations: Conversation[] = [
  {
    id: 'conversation-1',
    title: 'MVP Nexus e módulo Geo',
    projectLabel: 'V.tal Nexus',
    updatedAt: 'há 1 h',
    entries: [
      {
        id: 'entry-1',
        role: 'assistant',
        content:
          'O módulo Geo deve funcionar como console operacional para GeographicSite, GeographicAddress e GeographicLocation.\n\nA melhor experiência é combinar mapa, lista e árvore: o mapa responde onde está, a lista sustenta operação em massa, e a árvore mostra parentSite e contenção.',
        attachments: [
          {
            id: 'attachment-1',
            title: 'VTN-HLD-MOD01-GEO',
            meta: 'Documento · MD',
          },
        ],
      },
    ],
  },
];

export const initialRecentItems: RecentItem[] = [
  {
    id: 'recent-1',
    title: 'UX do console Geo',
    conversationId: 'conversation-1',
    projectLabel: 'V.tal Nexus',
    updatedAt: '2026-07-03',
  },
  {
    id: 'recent-2',
    title: 'Fronteira Geo Resource',
    conversationId: 'conversation-1',
    projectLabel: 'V.tal Nexus',
    updatedAt: '2026-07-02',
  },
  {
    id: 'recent-3',
    title: 'CFS RFS e SubscriberID',
    conversationId: 'conversation-1',
    projectLabel: 'V.tal Nexus',
    updatedAt: '2026-07-01',
  },
  {
    id: 'recent-4',
    title: 'Viabilidade e Order',
    conversationId: 'conversation-1',
    projectLabel: 'V.tal Nexus',
    updatedAt: '2026-06-28',
  },
];

export const settingsSections: SettingsSectionGroup[] = [
  {
    title: 'Configurações',
    items: [
      { id: 'general', label: 'Geral' },
      { id: 'account', label: 'Conta' },
      { id: 'privacy', label: 'Privacidade' },
      { id: 'billing', label: 'Cobrança' },
      { id: 'usage', label: 'Uso' },
      { id: 'capabilities', label: 'Capacidades' },
      { id: 'claude-code', label: 'Nexus Code' },
      { id: 'claude-chrome', label: 'Nexus in Chrome' },
    ],
  },
  {
    title: 'Personalizar',
    items: [
      { id: 'skills', label: 'Habilidades' },
      { id: 'connectors', label: 'Conectores' },
      { id: 'plugins', label: 'Plugins' },
    ],
  },
];

export const domainMetrics: Record<string, DomainMetric[]> = {
  geo: [
    { label: 'Sites TMF674', value: '1.842', sub: 'Region, Site e SubSite' },
    { label: 'Com place válido', value: '94,8%', sub: 'Aparecem no mapa' },
    { label: 'Endereços TMF673', value: '4,7M', sub: 'Base postal normalizada' },
    { label: 'Pendências Geo', value: '1', sub: 'Sites sem place próprio' },
  ],
  resource: [
    { label: 'Resources', value: '38,1M', sub: 'Physical + Logical' },
    { label: 'Catálogo', value: '126', sub: 'ResourceSpecification' },
    { label: 'Portas críticas', value: '318', sub: 'Ocupação acima de 90%' },
    { label: 'Reconciliação', value: '15 min', sub: 'Janela operacional' },
  ],
  service: [
    { label: 'Services', value: '9,8M', sub: 'CFS + RFS' },
    { label: 'Wholesale', value: '83%', sub: 'Tenant ISP como subscriber' },
    { label: 'RFS técnicos', value: '14,2M', sub: 'Consomem resources' },
    { label: 'Terminados', value: '2,1%', sub: 'Soft-terminate' },
  ],
  order: [
    { label: 'Qualificações', value: '6,4M', sub: 'TMF645' },
    { label: 'Viável', value: '72%', sub: 'HP com capacidade' },
    { label: 'Parcial', value: '18%', sub: 'Expansão ou reserva' },
    { label: 'SLA médio', value: '2,8 d', sub: 'Fulfillment' },
  ],
};

export const domainCards: Record<string, DomainCardData[]> = {
  geo: [
    {
      title: 'GeographicSite',
      description: 'Unidade operacional para Central, POP, Armário, Region e SubSite.',
      tag: 'TMF674',
    },
    {
      title: 'GeographicAddress',
      description: 'Endereço postal estruturado, normalizado e opcionalmente geocodificado.',
      tag: 'TMF673',
    },
    {
      title: 'GeographicLocation',
      description: 'Geometria Point, LineString, Polygon ou MultiPolygon para mapa e interseção.',
      tag: 'TMF675',
    },
    {
      title: 'SiteSpecification',
      description: 'Catálogo de tipos, characteristics e regras de contenção configuráveis.',
      tag: 'Catálogo',
    },
  ],
  resource: [
    {
      title: 'PhysicalResource',
      description: 'OLT, card, porta, DIO, cabo, splitter, CTO, ONT e demais ativos físicos.',
      tag: 'TMF639',
    },
    {
      title: 'LogicalResource',
      description: 'Circuitos, VLANs, VRFs e abstrações técnicas da rede.',
      tag: 'TMF639',
    },
    {
      title: 'ResourceSpecification',
      description: 'Catálogo extensível de tipos e atributos via characteristic.',
      tag: 'TMF634',
    },
    {
      title: 'Property Graph',
      description: 'Cálculo de caminho óptico e impacto sobre Oracle Property Graph.',
      tag: 'Oracle',
    },
  ],
  service: [
    {
      title: 'Customer Facing Service',
      description: 'Serviço comercial associado ao SubscriberID e ao Tenant ISP.',
      tag: 'CFS',
    },
    {
      title: 'Resource Facing Service',
      description: 'Serviço técnico que consome supportingResource.',
      tag: 'RFS',
    },
    {
      title: 'ServiceRelationship',
      description: 'Relações dependsOn, aggregates e decomposição entre serviços.',
      tag: 'TMF638',
    },
    {
      title: 'Service Catalog',
      description: 'Catálogo de ofertas técnicas e comerciais sem atributos hardcoded.',
      tag: 'TMF633',
    },
  ],
  order: [
    {
      title: 'Service Qualification',
      description: 'Consulta de viabilidade HP/HC por endereço, coordenada ou área.',
      tag: 'TMF645',
    },
    {
      title: 'Service Order',
      description: 'Orquestra ativação, alteração e cancelamento de serviços.',
      tag: 'TMF641',
    },
    {
      title: 'Resource Order',
      description: 'Reserva e ativação técnica dos recursos necessários.',
      tag: 'TMF652',
    },
    {
      title: 'Fulfillment',
      description: 'Execução orientada a processo, eventos e rollback operacional.',
      tag: 'Process',
    },
  ],
};
