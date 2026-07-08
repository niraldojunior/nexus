import type { ResourceCategory, ResourceType } from './domain.js';

const buildHref = (kind: 'resourceCategory' | 'resourceType', id: string): string =>
  `/tmf-api/resourceCatalogManagement/v4/${kind}/${encodeURIComponent(id)}`;

const category = (
  id: string,
  code: string,
  name: string,
  parentCategoryCode?: string,
  description?: string,
): ResourceCategory => ({
  '@type': 'ResourceCategory',
  id,
  href: buildHref('resourceCategory', id),
  code,
  name,
  ...(parentCategoryCode ? { parentCategoryCode } : {}),
  ...(description ? { description } : {}),
  status: 'active',
});

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

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  category('cat-equipment-access', 'Equipment.Access', 'Equipamentos de Acesso'),
  category('cat-equipment-transport', 'Equipment.Transport', 'Equipamentos de Transporte'),
  category('cat-equipment-cpe', 'Equipment.CustomerPremises', 'Equipamentos de Cliente'),
  category('cat-infrastructure-passive', 'Infrastructure.Passive', 'Infraestrutura Passiva'),
  category('cat-cable-outside-plant', 'Cable.OutsidePlant', 'Cabos OSP'),
  category('cat-cable-inside-plant', 'Cable.InsidePlant', 'Cabos ISP'),
  category('cat-logical-ipam', 'Logical.IPAM', 'Endereçamento e IPAM'),
  category('cat-logical-l2', 'Logical.L2', 'Recursos L2'),
  category('cat-logical-l3', 'Logical.L3', 'Recursos L3'),
];

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
  resourceType('rt-duct', 'Duct', 'Duct', 'Infrastructure.Passive'),
  resourceType('rt-pole', 'Pole', 'Pole', 'Infrastructure.Passive'),
  resourceType('rt-manhole', 'Manhole', 'Manhole', 'Infrastructure.Passive'),
  resourceType('rt-fiber', 'Fiber', 'Fiber', 'Cable.OutsidePlant'),
  resourceType('rt-drop-cable', 'DropCable', 'Drop Cable', 'Cable.OutsidePlant'),
  resourceType('rt-distribution-cable', 'DistributionCable', 'Distribution Cable', 'Cable.OutsidePlant'),
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

export const getResourceCategoryByCode = (code: string): ResourceCategory | undefined =>
  RESOURCE_CATEGORIES.find((category) => category.code === code);

export const getResourceTypeByCode = (code: string): ResourceType | undefined =>
  RESOURCE_TYPES.find((type) => type.code === code);

export const listResourceTypesByCategory = (categoryCode: string): ResourceType[] =>
  RESOURCE_TYPES.filter((type) => type.categoryCode === categoryCode);
