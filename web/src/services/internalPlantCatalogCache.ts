import { listGeoSiteSpecifications } from './geoApi';
import { listResourceRelationshipTypes } from './resourceApi';
import {
  getResourceCatalogTree,
  listResourceCatalogs,
  listResourceSpecifications,
  listResourceTypes,
} from './resourceCatalogApi';

// O backend de dev atende em série: catálogos compartilhados entre a árvore "Tipos" e o modal
// do editor são buscados uma vez (promise em voo compartilhada) e reaproveitados por um TTL curto.
const TTL_MS = 60_000;

type Entry<T> = { at: number; promise: Promise<T> };

function cached<T>(entry: Entry<T> | undefined, load: () => Promise<T>, set: (e: Entry<T>) => void) {
  if (entry && Date.now() - entry.at < TTL_MS) return entry.promise;
  const promise = load();
  const next = { at: Date.now(), promise };
  set(next);
  promise.catch(() => {
    set({ at: 0, promise });
  });
  return promise;
}

let treeEntry: Entry<Awaited<ReturnType<typeof getResourceCatalogTree>>> | undefined;
let typesEntry: Entry<Awaited<ReturnType<typeof listResourceTypes>>> | undefined;
let relTypesEntry: Entry<Awaited<ReturnType<typeof listResourceRelationshipTypes>>> | undefined;
let siteSpecsEntry: Entry<Awaited<ReturnType<typeof listGeoSiteSpecifications>>> | undefined;
const specsByType = new Map<string, Entry<Awaited<ReturnType<typeof listResourceSpecifications>>>>();

/** Árvore do catálogo ativo/default (a mesma usada por "Tipos" e pelo editor). */
export const loadDefaultCatalogTree = () =>
  cached(
    treeEntry,
    async () => {
      const catalogs = await listResourceCatalogs();
      const catalog =
        catalogs.find((c) => c.status === 'active' && c.isDefault) ??
        catalogs.find((c) => c.status === 'active');
      return catalog ? getResourceCatalogTree(catalog.id) : [];
    },
    (e) => (treeEntry = e),
  );

export const loadResourceTypesCached = () =>
  cached(typesEntry, () => listResourceTypes(), (e) => (typesEntry = e));

export const loadRelationshipTypesCached = () =>
  cached(relTypesEntry, () => listResourceRelationshipTypes(), (e) => (relTypesEntry = e));

export const loadSiteSpecificationsCached = () =>
  cached(siteSpecsEntry, () => listGeoSiteSpecifications().catch(() => []), (e) => (siteSpecsEntry = e));

/** Especificações de um tipo; sem tipo, a lista completa. */
export const loadSpecificationsCached = (resourceTypeId?: string) => {
  const key = resourceTypeId ?? '*';
  return cached(
    specsByType.get(key),
    () => listResourceSpecifications(resourceTypeId ? { resourceTypeId } : undefined),
    (e) => specsByType.set(key, e),
  );
};

export function invalidateRelationshipTypesCache() {
  relTypesEntry = undefined;
}

export function invalidateInternalPlantCatalogCache() {
  treeEntry = typesEntry = relTypesEntry = siteSpecsEntry = undefined;
  specsByType.clear();
}
