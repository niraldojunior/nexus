import type { ResourceType } from './domain.js';
import { buildHref } from '../../shared/tmf/index.js';

const resourceType = (
  id: string,
  code: string,
  name: string,
  categoryCode: string,
  description?: string,
  status: ResourceType['status'] = 'active',
): ResourceType => ({
  '@type': 'ResourceType',
  id,
  href: buildHref('resourceType', id),
  code,
  name,
  categoryCode,
  ...(description ? { description } : {}),
  status,
});

export const RESOURCE_TYPES: ResourceType[] = [
  resourceType('rt-olt', 'OLT', 'Optical Line Terminal', 'Equipment.Access'),
  resourceType('rt-ont', 'ONT', 'Optical Network Terminal', 'Equipment.CustomerPremises'),
  resourceType('rt-cpe', 'CPE', 'Customer Premises Equipment', 'Equipment.CustomerPremises'),
  resourceType('rt-router', 'Router', 'Router', 'Equipment.Transport'),
  resourceType('rt-switch', 'Switch', 'Switch', 'Equipment.Transport'),
  resourceType('rt-rack', 'Rack', 'Rack', 'Equipment.Transport'),
  resourceType('rt-card', 'Card', 'Card / Module', 'Equipment.Access'),
  resourceType('rt-port', 'Port', 'Port', 'Equipment.Access'),
  resourceType('rt-power-supply', 'PowerSupply', 'Power Supply', 'Equipment.Transport'),
  resourceType('rt-splitter', 'Splitter', 'Splitter', 'Infrastructure.Passive'),
  resourceType('rt-cto', 'CTO', 'Caixa de Terminação Óptica', 'Infrastructure.Passive'),
  resourceType('rt-dio', 'DIO', 'Distribuidor Interno Óptico', 'Infrastructure.Passive'),
  // Caixa de emenda óptica (CEO/CEOS do Netwin) — junta trechos de cabo sem terminar fibra
  // (ao contrário da CTO, que termina em splitter/porta de cliente).
  resourceType('rt-splice-closure', 'SpliceClosure', 'Caixa de Emenda Óptica', 'Infrastructure.Passive'),
  // Nó óptico ativo intermediário (OSP_CAT_ENTITY.OPT do Netwin) — equipamento eletrônico na
  // planta externa, distinto das caixas passivas acima.
  resourceType('rt-optical-node', 'OpticalNode', 'Nó Óptico', 'Infrastructure.Passive'),
  resourceType('rt-duct', 'Duct', 'Duct', 'Infrastructure.CivilWorks'),
  resourceType('rt-pole', 'Pole', 'Pole', 'Infrastructure.CivilWorks'),
  resourceType('rt-manhole', 'Manhole', 'Manhole', 'Infrastructure.CivilWorks'),
  // Lance (OSP_ROUTE do Netwin): o trecho de infraestrutura civil entre dois pontos que um
  // cabo atravessa — aéreo, subterrâneo (duto já coberto acima), enterrado direto ou interno a
  // uma edificação.
  resourceType('rt-aerial-span', 'AerialSpan', 'Lance Aéreo', 'Infrastructure.CivilWorks'),
  resourceType('rt-buried-span', 'BuriedSpan', 'Lance Enterrado', 'Infrastructure.CivilWorks'),
  resourceType('rt-inner-span', 'InnerSpan', 'Lance Interno', 'Infrastructure.CivilWorks'),
  resourceType('rt-other-span', 'OtherSpan', 'Lance (Outro)', 'Infrastructure.CivilWorks'),
  resourceType('rt-fiber', 'Fiber', 'Fiber', 'Cable.OutsidePlant'),
  resourceType('rt-drop-cable', 'DropCable', 'Drop Cable', 'Cable.OutsidePlant'),
  resourceType(
    'rt-distribution-cable',
    'DistributionCable',
    'Distribution Cable',
    'Cable.OutsidePlant',
  ),
  resourceType('rt-backbone-cable', 'BackboneCable', 'Backbone Cable', 'Cable.OutsidePlant'),
  resourceType('rt-patch-cord', 'PatchCord', 'Patch Cord', 'Cable.InsidePlant'),
  resourceType('rt-jumper', 'Jumper', 'Jumper', 'Cable.InsidePlant'),
  resourceType('rt-ip-address', 'IPAddress', 'IP Address', 'Logical.IPAM'),
  resourceType('rt-prefix', 'Prefix', 'Prefix', 'Logical.IPAM'),
  resourceType('rt-vlan', 'VLAN', 'VLAN', 'Logical.L2'),
  resourceType('rt-vlan-group', 'VLANGroup', 'VLAN Group', 'Logical.L2'),
  resourceType('rt-vrf', 'VRF', 'VRF', 'Logical.L3'),
  resourceType('rt-asn', 'ASN', 'ASN', 'Logical.L3'),
  resourceType('rt-route-target', 'RouteTarget', 'Route Target', 'Logical.L3'),
];

export const getResourceTypeByCode = (code: string): ResourceType | undefined =>
  RESOURCE_TYPES.find((type) => type.code === code);

// --- Árvore dinâmica de catálogo (issue #188) ---------------------------------------------------
// Só o container do catálogo é bootstrap estático aqui — insert-if-missing, nunca sobrescreve
// edição do operador (C9), mesmo padrão de RESOURCE_TYPES acima. A árvore de
// nodes (Category → GROUP, Type → RESOURCE_TYPE) **não** nasce aqui: ela depende de ResourceType
// já materializado por tenant, o que só acontece no backfill auditado (plano §7 Fase A, tarefa
// #10) — criar nodes agora, antes disso, violaria a FK composta (tenant_id, resource_type_id) já
// que ResourceType hoje só existe com tenant_id='default'. Ver também `RESOURCE_TENANTS` abaixo.

export const RESOURCE_CATALOG_BOOTSTRAP = {
  code: 'nexus-master-resource-catalog',
  name: 'Catálogo Mestre V.tal Nexus',
  description: 'Árvore de navegação governada do Resource Catalog.',
} as const;

/**
 * Únicos tenants no escopo do módulo Resource após o refactor (decisão firmada, plano
 * "Decisões já firmadas"). Geo/Service/Party/Order e demais módulos não são afetados —
 * continuam em `default`.
 */
export const RESOURCE_TENANTS = ['vtal', 'tecto'] as const;

// A normalização de tenant (`default` → `vtal`) será ativada junto ao backfill (tarefas #10/#12).
// Antes disso, aplicá-la no runtime faria as operações deixarem de enxergar os dados existentes
// sob `tenant_id='default'`. A aplicação continua aceitando tenants autenticados fora desta lista;
// ela delimita apenas o bootstrap e o cutover de dados deste plano.