// Filtro de escopo da barra de pesquisa Geo (RF-013, REQ-MOD01-011): núcleo puro (sem
// React), no mesmo espírito de mapLayers.ts — o hook/dropdown/serviço HTTP leem o mesmo
// catálogo. O default (`'all'`) é a busca de sempre (Locais + Recursos do inventário +
// Endereço do Google, lado a lado); os demais restringem a UMA fonte/tipo.

import type { GeoTreeNode } from '../services/geoTreeApi';

export type GeoSearchScopeId = 'all' | 'address' | 'infrastructure' | 'sites' | 'cto' | 'cable';

export type GeoSearchScope = { id: GeoSearchScopeId; label: string; hint: string };

// Ordem pedida pelo usuário — é também a ordem de exibição na lista flutuante.
export const GEO_SEARCH_SCOPES: readonly GeoSearchScope[] = [
  { id: 'all', label: 'Pesquisa geral', hint: 'Locais, recursos e endereços' },
  { id: 'address', label: 'Apenas Endereço', hint: 'Busca só no Google (sem inventário)' },
  {
    id: 'infrastructure',
    label: 'Apenas Infraestrutura',
    hint: 'Postes, dutos, caixas subterrâneas e torres',
  },
  { id: 'sites', label: 'Apenas Locais', hint: 'Estações do inventário' },
  { id: 'cto', label: 'Apenas CTOs', hint: 'Caixas de terminação óptica (CDOE/CDOI)' },
  { id: 'cable', label: 'Apenas Cabos', hint: 'Backbone, distribuição, drop e fibra' },
];

// Mesmo vocabulário de RESOURCE_LAYER_BY_TYPE (mapLayers.ts) — os `resource_type` que o
// servidor aceita em `types` para cada modo restrito a Recurso.
const RESOURCE_TYPES_BY_SCOPE: Partial<Record<GeoSearchScopeId, readonly string[]>> = {
  infrastructure: [
    'Pole',
    'Manhole',
    'Tower',
    'Duct',
    'RisingTube',
    'Pedestal',
    'SupportBracket',
    'CableTunnel',
    'IronPipe',
  ],
  cto: ['CTO'],
  cable: ['Fiber', 'DistributionCable', 'BackboneCable', 'DropCable'],
};

export const resourceTypesForScope = (scope: GeoSearchScopeId): string[] | undefined =>
  RESOURCE_TYPES_BY_SCOPE[scope] ? [...RESOURCE_TYPES_BY_SCOPE[scope]!] : undefined;

// 'address' não consulta o inventário; todos os demais (inclusive 'all') consultam.
export const scopeSearchesInventory = (scope: GeoSearchScopeId): boolean => scope !== 'address';

// Só 'all' e 'address' consultam o Google — os modos restritos a um tipo de recurso ou a
// Local seriam contraditórios com uma sugestão de endereço.
export const scopeSearchesAddresses = (scope: GeoSearchScopeId): boolean =>
  scope === 'all' || scope === 'address';

// 'sites' busca só Estação; os modos de recurso (infrastructure/cto/cable) só Recurso;
// 'all' busca os dois. 'address' não busca inventário (ver scopeSearchesInventory), então
// o valor aqui não importa para ele.
export const scopeKinds = (scope: GeoSearchScopeId): Array<'site' | 'resource'> =>
  scope === 'sites' ? ['site'] : scope === 'all' ? ['site', 'resource'] : ['resource'];

// Filtro client-side do histórico (campo vazio) — mesma regra que o backend aplica à
// busca por texto, aplicada sobre o `GeoTreeNode` já resolvido.
export function nodeMatchesScope(node: GeoTreeNode, scope: GeoSearchScopeId): boolean {
  if (scope === 'all') return true;
  if (scope === 'address') return false;
  if (scope === 'sites') return node.kind === 'site';
  if (node.kind !== 'resource') return false;
  const types = RESOURCE_TYPES_BY_SCOPE[scope];
  return types ? Boolean(node.resourceType && types.includes(node.resourceType)) : true;
}

const STORAGE_KEY = 'nexus.geo.searchScope';

const isScopeId = (value: string): value is GeoSearchScopeId =>
  GEO_SEARCH_SCOPES.some((scope) => scope.id === value);

// Mesma leitura defensiva de readStoredLayers: qualquer coisa fora do formato esperado
// (storage indisponível, valor desconhecido) cai no default 'all' — o usuário nunca deve
// abrir a página com um filtro restrito que ele não escolheu nesta sessão.
export function readStoredSearchScope(): GeoSearchScopeId {
  if (typeof window === 'undefined') return 'all';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isScopeId(raw)) return raw;
    return 'all';
  } catch {
    return 'all';
  }
}

export function writeStoredSearchScope(scope: GeoSearchScopeId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, scope);
  } catch {
    // Storage indisponível (modo privado, cota): a preferência só não persiste.
  }
}
