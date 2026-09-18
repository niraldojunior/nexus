import { useEffect, useMemo, useState } from 'react';
import { listModeledResourceTypes } from '../services/resourceCatalogApi';
import type { ResourceTypePresentation } from '../utils/resourceTypePresentation';

const inFlight = new Map<string, Promise<Map<string, ResourceTypePresentation>>>();
const CACHE_KEY = 'modeled-resource-types';
let cachedPresentations: Map<string, ResourceTypePresentation> | undefined;

function resourceTypeKey(resourceType: string | undefined): string | undefined {
  const normalized = resourceType?.trim();
  return normalized ? normalized.toLowerCase() : undefined;
}

async function loadPresentations(): Promise<Map<string, ResourceTypePresentation>> {
  if (cachedPresentations) return cachedPresentations;
  const current = inFlight.get(CACHE_KEY);
  if (current) return await current;

  const request = listModeledResourceTypes()
    .then((types) => {
      const presentations = new Map<string, ResourceTypePresentation>();
      for (const type of types) {
        presentations.set(type.code.toLowerCase(), {
          name: type.name,
          nature: type.nature,
          visualIdentity: type.visualIdentity,
        });
      }
      cachedPresentations = presentations;
      return presentations;
    })
    .finally(() => inFlight.delete(CACHE_KEY));
  inFlight.set(CACHE_KEY, request);
  return await request;
}

export type ResourceTypeVisualIdentityResolver = (
  resourceType: string | undefined,
) => ResourceTypePresentation | undefined;

const noPresentation: ResourceTypeVisualIdentityResolver = () => undefined;

export function resetResourceTypeVisualIdentitiesForTests(): void {
  cachedPresentations = undefined;
  inFlight.clear();
}

/**
 * Carrega uma única vez a apresentação canônica dos tipos modelados para superfícies
 * operacionais. A instância continua levando apenas o código: identidade e natureza ficam no
 * catálogo, sem desnormalização das APIs de inventário.
 */
export function useResourceTypeVisualIdentities(): ResourceTypeVisualIdentityResolver {
  const [presentations, setPresentations] = useState<Map<string, ResourceTypePresentation>>();

  useEffect(() => {
    let cancelled = false;
    void loadPresentations()
      .then((loaded) => {
        if (!cancelled) setPresentations(loaded);
      })
      // A ausência do catálogo não pode bloquear o inventário: ResourceIcon mantém compatibilidade.
      .catch(() => {
        if (!cancelled) setPresentations(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (!presentations) return noPresentation;
    return (resourceType) => {
      const key = resourceTypeKey(resourceType);
      return key ? presentations.get(key) : undefined;
    };
  }, [presentations]);
}
