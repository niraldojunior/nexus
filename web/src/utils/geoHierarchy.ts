// Construção da hierarquia de navegação de Locais no estilo Netwin.
//
// Produz a árvore de 6 níveis a partir do diretório Geo já existente + os
// recursos do inventário (equipamentos e cabos):
//
//   UF → Município → Localidade → Entidade (Local | Equipamento | Cabo) → Tipo → instância
//
// Função pura (sem React) para ser testável. Reusa o GeoDirectory de
// `placeLabel.ts` para resolver a ancestralidade geográfica de cada item sem
// expor hashes.

import type { GeoSite } from '../services/geoApi';
import { siteKindFromSpec, siteKindLabel, type GeoDirectory, type SiteKind } from './placeLabel';

// Forma mínima de recurso (equipamento/cabo) consumida pela hierarquia.
// Mantida local para não acoplar a util ao cliente HTTP de resourceApi.
export type HierResource = {
  id: string;
  name: string;
  '@type'?: 'PhysicalResource' | 'LogicalResource';
  resourceType?: string;
  resourceSpecification?: { id?: string; name?: string; '@referredType'?: string };
  place?: { id: string; '@referredType'?: string };
};

export type HierLevel = 'uf' | 'municipio' | 'localidade' | 'entidade' | 'tipo' | 'instancia';

export type EntityKind = 'Local' | 'Equipamento' | 'Cabo';

export type HierInstance = {
  id: string;
  name: string;
  entity: EntityKind;
  referredType: 'GeographicSite' | 'PhysicalResource' | 'LogicalResource';
  // Referência de local para centralizar no mapa (id de Site ou de Location).
  placeId?: string;
  placeType?: string;
  siteKind: SiteKind | null;
};

export type HierNode = {
  level: HierLevel;
  key: string;
  label: string;
  count: number;
  children: HierNode[];
  // Presente apenas em folhas (level === 'instancia').
  instance?: HierInstance;
};

const SEM_UF = 'Sem UF';
const SEM_MUNICIPIO = 'Sem município';
const SEM_LOCALIDADE = 'Sem localidade';
const SEM_TIPO = 'Sem tipo';

const ENTITY_ORDER: EntityKind[] = ['Local', 'Equipamento', 'Cabo'];

// Códigos/keywords que caracterizam Cabo (category Cable.* do catálogo Resource).
const CABLE_KEYWORDS = ['cabo', 'cable', 'fiber', 'fibra', 'drop', 'feeder', 'jumper', 'patch', 'backbone', 'distribution'];

// Classifica um recurso como Cabo a partir do resourceType/spec/nome.
export function isCableResource(resource: {
  resourceType?: string;
  resourceSpecification?: { name?: string };
  name?: string;
}): boolean {
  const haystack = [resource.resourceType, resource.resourceSpecification?.name, resource.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return CABLE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

// Rótulo de "Tipo" para um recurso: prioriza o resourceType canônico.
function resourceTypeLabel(resource: HierResource): string {
  return resource.resourceType || resource.resourceSpecification?.name || SEM_TIPO;
}

type GeoPath = { uf: string; municipio: string; localidade: string };

// Sobe a cadeia parentSite retornando os ancestrais (mais próximo primeiro),
// com proteção contra ciclos.
function ancestorChain(siteId: string, directory: GeoDirectory): GeoSite[] {
  const chain: GeoSite[] = [];
  const seen = new Set<string>([siteId]);
  let current = directory.siteById.get(siteId);
  while (current?.parentSite?.id && !seen.has(current.parentSite.id)) {
    seen.add(current.parentSite.id);
    const parent = directory.siteById.get(current.parentSite.id);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

// UF/Município a partir do endereço do próprio site ou do ancestral mais próximo
// que tenha endereço. Localidade = Região ancestral mais próxima que não coincide
// com UF/Município.
function derivePathForSite(site: GeoSite, directory: GeoDirectory): GeoPath {
  const chain = ancestorChain(site.id, directory);
  const withSelf = [site, ...chain];

  let uf = '';
  let municipio = '';
  for (const node of withSelf) {
    const address = node.address ? directory.addressById.get(node.address.id) : undefined;
    if (!address) continue;
    if (!uf && address.stateOrProvince) uf = address.stateOrProvince;
    if (!municipio && address.city) municipio = address.city;
    if (uf && municipio) break;
  }

  const regionAncestors = chain.filter((node) => {
    const spec = directory.specById.get(node.siteSpecificationId);
    return spec?.category === 'Region';
  });

  const norm = (value: string) => value.trim().toLowerCase();
  const localidade =
    regionAncestors
      .map((node) => node.name)
      .find((name) => name && norm(name) !== norm(uf) && norm(name) !== norm(municipio)) ?? '';

  return {
    uf: uf || SEM_UF,
    municipio: municipio || SEM_MUNICIPIO,
    localidade: localidade || SEM_LOCALIDADE,
  };
}

// Resolve a GeoPath de um recurso a partir do seu place: tenta o Site dono da
// Location; senão o endereço avulso ligado à Location.
function derivePathForResource(resource: HierResource, directory: GeoDirectory): GeoPath {
  const placeId = resource.place?.id;
  if (placeId) {
    const owningSite = directory.siteByLocationId.get(placeId) ?? directory.siteById.get(placeId);
    if (owningSite) return derivePathForSite(owningSite, directory);
    const address = directory.addressByLocationId.get(placeId);
    if (address) {
      return {
        uf: address.stateOrProvince || SEM_UF,
        municipio: address.city || SEM_MUNICIPIO,
        localidade: SEM_LOCALIDADE,
      };
    }
  }
  return { uf: SEM_UF, municipio: SEM_MUNICIPIO, localidade: SEM_LOCALIDADE };
}

function ensureChild<T>(parent: Map<string, T>, key: string, create: () => T): T {
  let value = parent.get(key);
  if (!value) {
    value = create();
    parent.set(key, value);
  }
  return value;
}

// Constrói a árvore completa de navegação.
export function buildLocationHierarchy(
  directory: GeoDirectory,
  sites: GeoSite[],
  resources: HierResource[],
): HierNode[] {
  // uf -> municipio -> localidade -> entidade -> tipo -> HierInstance[]
  type TipoMap = Map<string, HierInstance[]>;
  type EntidadeMap = Map<EntityKind, TipoMap>;
  type LocalidadeMap = Map<string, EntidadeMap>;
  type MunicipioMap = Map<string, LocalidadeMap>;
  const root: Map<string, MunicipioMap> = new Map();

  const place = (path: GeoPath, entity: EntityKind, tipo: string, instance: HierInstance) => {
    const municipios = ensureChild(root, path.uf, () => new Map() as MunicipioMap);
    const localidades = ensureChild(municipios, path.municipio, () => new Map() as LocalidadeMap);
    const entidades = ensureChild(localidades, path.localidade, () => new Map() as EntidadeMap);
    const tipos = ensureChild(entidades, entity, () => new Map() as TipoMap);
    const list = ensureChild(tipos, tipo, () => [] as HierInstance[]);
    list.push(instance);
  };

  // Locais (GeographicSite não-Region). Sites terminados são ocultados da
  // navegação (soft-terminate C6) — continuam no acervo, mas fora da árvore.
  for (const site of sites) {
    if (site.status === 'terminated') continue;
    const spec = directory.specById.get(site.siteSpecificationId);
    if (spec?.category === 'Region') continue;
    const kind = siteKindFromSpec(spec);
    const tipo = spec?.name ?? siteKindLabel[kind];
    const path = derivePathForSite(site, directory);
    place(path, 'Local', tipo, {
      id: site.id,
      name: site.name,
      entity: 'Local',
      referredType: 'GeographicSite',
      placeId: site.place?.id ?? site.id,
      placeType: site.place ? 'GeographicLocation' : 'GeographicSite',
      siteKind: kind,
    });
  }

  // Recursos (Equipamento | Cabo).
  for (const resource of resources) {
    const cable = isCableResource(resource);
    const entity: EntityKind = cable ? 'Cabo' : 'Equipamento';
    const tipo = resourceTypeLabel(resource);
    const path = derivePathForResource(resource, directory);
    place(path, entity, tipo, {
      id: resource.id,
      name: resource.name,
      entity,
      referredType: resource['@type'] ?? 'PhysicalResource',
      placeId: resource.place?.id,
      placeType: resource.place?.['@referredType'] ?? 'GeographicLocation',
      siteKind: null,
    });
  }

  return toNodes(root);
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

// Ordena chaves textuais empurrando os buckets "Sem ..." para o fim.
function sortKeys(keys: string[]): string[] {
  const isPlaceholder = (value: string) => value.startsWith('Sem ');
  return [...keys].sort((left, right) => {
    const leftPh = isPlaceholder(left);
    const rightPh = isPlaceholder(right);
    if (leftPh !== rightPh) return leftPh ? 1 : -1;
    return collator.compare(left, right);
  });
}

function countInstances(nodes: HierNode[]): number {
  return nodes.reduce((total, node) => total + (node.instance ? 1 : node.count), 0);
}

function toNodes(root: Map<string, Map<string, Map<string, Map<EntityKind, Map<string, HierInstance[]>>>>>): HierNode[] {
  const ufNodes: HierNode[] = [];

  for (const uf of sortKeys([...root.keys()])) {
    const municipios = root.get(uf)!;
    const municipioNodes: HierNode[] = [];

    for (const municipio of sortKeys([...municipios.keys()])) {
      const localidades = municipios.get(municipio)!;
      const localidadeNodes: HierNode[] = [];

      for (const localidade of sortKeys([...localidades.keys()])) {
        const entidades = localidades.get(localidade)!;
        const entidadeNodes: HierNode[] = [];

        for (const entity of ENTITY_ORDER) {
          const tipos = entidades.get(entity);
          if (!tipos) continue;
          const tipoNodes: HierNode[] = [];

          for (const tipo of sortKeys([...tipos.keys()])) {
            const instances = tipos.get(tipo)!;
            const instanceNodes: HierNode[] = instances
              .slice()
              .sort((left, right) => collator.compare(left.name, right.name))
              .map((instance) => ({
                level: 'instancia' as const,
                key: `${instance.referredType}:${instance.id}`,
                label: instance.name,
                count: 1,
                children: [],
                instance,
              }));
            tipoNodes.push({
              level: 'tipo',
              key: `tipo:${tipo}`,
              label: tipo,
              count: instanceNodes.length,
              children: instanceNodes,
            });
          }

          entidadeNodes.push({
            level: 'entidade',
            key: `entidade:${entity}`,
            label: entity,
            count: countInstances(tipoNodes),
            children: tipoNodes,
          });
        }

        localidadeNodes.push({
          level: 'localidade',
          key: `localidade:${localidade}`,
          label: localidade,
          count: countInstances(entidadeNodes),
          children: entidadeNodes,
        });
      }

      municipioNodes.push({
        level: 'municipio',
        key: `municipio:${municipio}`,
        label: municipio,
        count: countInstances(localidadeNodes),
        children: localidadeNodes,
      });
    }

    ufNodes.push({
      level: 'uf',
      key: `uf:${uf}`,
      label: uf,
      count: countInstances(municipioNodes),
      children: municipioNodes,
    });
  }

  return ufNodes;
}

// Navega a árvore por um caminho de keys e retorna o nó final (ou null).
export function nodeAt(roots: HierNode[], path: string[]): HierNode | null {
  let nodes = roots;
  let found: HierNode | null = null;
  for (const key of path) {
    const next = nodes.find((node) => node.key === key);
    if (!next) return null;
    found = next;
    nodes = next.children;
  }
  return found;
}

// Retorna os filhos disponíveis no nível seguinte, dado o caminho selecionado.
// Caminho vazio → raízes (UFs).
export function childrenAt(roots: HierNode[], path: string[]): HierNode[] {
  if (path.length === 0) return roots;
  const node = nodeAt(roots, path);
  return node ? node.children : [];
}
