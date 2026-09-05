import type { ResourceCatalogNode } from '../services/resourceCatalogApi';

/**
 * Códigos de `ResourceType` que são recurso lógico por convenção, para nós que ainda não têm
 * `metadata.nature` gravado (dados legados/seed) nem `resourceType.categoryCode` disponível no
 * contexto atual (ex.: nó de árvore puro, sem o fetch extra de `getResourceTypeCatalogContext`).
 */
const LOGICAL_RESOURCE_TYPE_CODES = [
  'IPAddress',
  'Prefix',
  'VLAN',
  'VLANGroup',
  'VRF',
  'ASN',
  'RouteTarget',
  'rt-ip-address',
  'rt-prefix',
  'rt-vlan',
  'rt-vlan-group',
  'rt-vrf',
  'rt-asn',
  'rt-route-target',
];

/**
 * Deriva se um nó `RESOURCE_TYPE` do catálogo é de natureza lógica ou física — usado tanto no
 * seletor de edição (`ResourceNodeDetail`) quanto no ícone da árvore (`ResourceCatalogTree`).
 * Precedência: `metadata.nature` (gravado explicitamente pelo usuário) → `categoryCode` do
 * `ResourceType` (quando disponível, ex.: via `getResourceTypeCatalogContext`) → lista de códigos
 * conhecidos, para nós legados sem nenhum dos dois.
 */
export function isLogicalResourceNode(
  node: Pick<ResourceCatalogNode, 'metadata' | 'resourceType' | 'code' | 'resourceTypeId'>,
  categoryCode?: string,
): boolean {
  if (node.metadata?.nature === 'LogicalResource') return true;
  if (node.metadata?.nature === 'PhysicalResource') return false;
  if (categoryCode) return categoryCode.startsWith('Logical');
  return LOGICAL_RESOURCE_TYPE_CODES.includes(
    node.resourceType?.code || node.code || node.resourceTypeId || '',
  );
}
