// Cliente dos Projetos de trabalho da página Locais (REQ-MOD01-015, `/v1/geo/projects/*`),
// estilo "Salvos" do Google Maps. Compartilhado por tenant (C8) — não há filtro por usuário
// aqui, ao contrário do histórico de busca (geoSearchHistoryApi.ts).

import {
  getJson,
  postJson,
  patchJson,
  deleteJson,
  type GeoAddress,
  type GeoLocation,
  type GeoSite,
  type GeoStatus,
} from './geoApi';
import type { GeoTreeNode } from './geoTreeApi';

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  createdBy: string | null;
  siteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectSiteInput = {
  coordinates: [number, number];
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  name: string;
  status?: GeoStatus;
  siteSpecificationId: string;
};

export type CreatedProjectSite = {
  location: GeoLocation;
  address: GeoAddress;
  site: GeoSite;
};

const BASE_URL = '/v1/geo/projects';

export const fetchProjects = (): Promise<GeoProject[]> => getJson<GeoProject[]>(BASE_URL);

export const createProject = (name?: string): Promise<GeoProject> =>
  postJson<GeoProject>(BASE_URL, name?.trim() ? { name: name.trim() } : {});

export const updateProject = (
  id: string,
  patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl'>>,
): Promise<GeoProject> => patchJson<GeoProject>(`${BASE_URL}/${id}`, patch);

export const deleteProject = (id: string): Promise<void> => deleteJson(`${BASE_URL}/${id}`);

// Locais do projeto já vêm na forma de GeoTreeNode (mesma que a árvore usa), com geometria
// resolvida — é o que dá pin/balão/voo de câmera de graça no mapa (ver GeoTreeService.sitesByIds).
export const fetchProjectSites = (projectId: string): Promise<GeoTreeNode[]> =>
  getJson<GeoTreeNode[]>(`${BASE_URL}/${projectId}/sites`);

export const createProjectSite = (
  projectId: string,
  input: CreateProjectSiteInput,
): Promise<CreatedProjectSite> =>
  postJson<CreatedProjectSite>(`${BASE_URL}/${projectId}/sites`, {
    location: {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: input.coordinates },
      spatialRef: 'EPSG:4326',
      accuracy: 'GOOGLE_MAPS',
    },
    address: {
      street: input.street,
      streetNr: input.streetNr,
      city: input.city,
      stateOrProvince: input.stateOrProvince,
      postcode: input.postcode,
      country: input.country ?? 'BR',
    },
    site: {
      name: input.name,
      status: input.status ?? 'planned',
      siteSpecificationId: input.siteSpecificationId,
    },
  });

export const removeProjectSite = (projectId: string, siteId: string): Promise<void> =>
  deleteJson(`${BASE_URL}/${projectId}/sites/${siteId}`);
