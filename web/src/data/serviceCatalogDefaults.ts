import type { ServiceCategory } from '../services/serviceApi';

/**
 * Árvore canônica de ServiceCategory da V.tal (03-modulo-service.md §7.6, RF-004).
 *
 * O Sidebar importa estas categorias estaticamente — o submenu não depende de fetch. O `code` não
 * existe no modelo TMF do backend: é a convenção do frontend que casa com `ServiceSpecification.category`
 * (string livre), fazendo a junção serviço → spec → categoria.
 */
export const SERVICE_CATEGORY_DEFAULTS: ServiceCategory[] = [
  {
    '@type': 'ServiceCategory',
    id: 'svc-cat-access',
    href: '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-access',
    code: 'Access',
    name: 'Acesso',
    description: 'Banda larga FTTH e Bitstream GPON',
  },
  {
    '@type': 'ServiceCategory',
    id: 'svc-cat-enterprise',
    href: '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-enterprise',
    code: 'Enterprise',
    name: 'Conectividade Empresarial',
    description: 'Link dedicado, EILD, L2/L3 VPN',
  },
  {
    '@type': 'ServiceCategory',
    id: 'svc-cat-voice',
    href: '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-voice',
    code: 'Voice',
    name: 'Voz',
    description: 'CloudVoIP e troncos SIP',
  },
  {
    '@type': 'ServiceCategory',
    id: 'svc-cat-transport',
    href: '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-transport',
    code: 'Transport',
    name: 'Transporte / Atacado',
    description: 'Backbone, EVPN e capacidade de atacado',
  },
];
