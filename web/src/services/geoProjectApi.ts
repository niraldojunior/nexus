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

// Mesmo vocabulário de GeoStatus — o projeto é a unidade de estado (REQ-MOD01-015): mudar
// o status do projeto cascateia (best-effort) para cada Site vinculado. Um local de projeto
// não tem status próprio editável, só herda este valor.
export type GeoProjectStatus = GeoStatus;

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  status: GeoProjectStatus;
  createdBy: string | null;
  siteCount: number;
  createdAt: string;
  updatedAt: string;
};

// Quantos locais a cascata de status conseguiu (e não conseguiu) transicionar — só vem no
// PATCH que muda `status` (ver /v1/geo/projects/:id em app.ts).
export type GeoProjectSiteCascade = { updated: number; skipped: number };

// Local de um projeto, na mesma forma de nó que a árvore usa, acrescido da anotação de
// trabalho e do endereço GEONET de origem (ver geo_project_site em schema.ts).
export type ProjectSite = GeoTreeNode & {
  note: string | null;
  geonetAddressId: string | null;
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
  siteSpecificationId: string;
  // Obrigatório: todo local de projeto nasce amarrado a um endereço real do GEONET —
  // não há criação sem candidato GEONET escolhido (REQ-MOD01-015 §20).
  geonetAddressId: string;
  note?: string | null;
};

export type UpdateProjectSiteInput = {
  name?: string;
  siteSpecificationId?: string;
  note?: string | null;
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
  patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status'>>,
): Promise<GeoProject & { siteCascade?: GeoProjectSiteCascade }> =>
  patchJson<GeoProject & { siteCascade?: GeoProjectSiteCascade }>(`${BASE_URL}/${id}`, patch);

export const deleteProject = (id: string): Promise<void> => deleteJson(`${BASE_URL}/${id}`);

// Locais do projeto já vêm na forma de GeoTreeNode (mesma que a árvore usa), com geometria
// resolvida — é o que dá pin/balão/voo de câmera de graça no mapa (ver GeoTreeService.sitesByIds).
export const fetchProjectSites = (projectId: string): Promise<ProjectSite[]> =>
  getJson<ProjectSite[]>(`${BASE_URL}/${projectId}/sites`);

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
      siteSpecificationId: input.siteSpecificationId,
    },
    geonetAddressId: input.geonetAddressId,
    note: input.note ?? undefined,
  });

export const updateProjectSite = (
  projectId: string,
  siteId: string,
  patch: UpdateProjectSiteInput,
): Promise<{ site: GeoSite; note: string | null }> =>
  patchJson<{ site: GeoSite; note: string | null }>(
    `${BASE_URL}/${projectId}/sites/${siteId}`,
    patch,
  );

export const removeProjectSite = (projectId: string, siteId: string): Promise<void> =>
  deleteJson(`${BASE_URL}/${projectId}/sites/${siteId}`);
