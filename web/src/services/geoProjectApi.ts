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
import type { GeoTreeNode, MapBounds } from './geoTreeApi';

// Mesmo vocabulário de GeoStatus — o projeto é a unidade de estado (REQ-MOD01-015): mudar
// o status do projeto cascateia (best-effort) para cada Site vinculado. Enquanto o projeto
// está em curso, o local não tem status próprio editável, só herda este valor — uma vez que
// o projeto termina (status 'terminated'), o local passa a ter vida própria (Active) e ganha
// controle de status independente no painel unificado de Local (SiteOverviewTab).
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
// PATCH que muda `status` (ver /v1/geo/projects/:id em app.ts). `blocked` só aparece quando
// algum local tem dependência ativa (filho/relacionamento/recurso/serviço/ordem).
export type GeoProjectSiteCascade = { updated: number; skipped: number; blocked?: number };

// Resposta do DELETE /v1/geo/projects/:id: o projeto só é excluído (`deleted: true`) quando
// TODOS os locais puderam ser encerrados — havendo algum bloqueado, o projeto e seus vínculos
// são mantidos íntegros (ver comentário da rota em app.ts) e `blockedSiteIds` traz uma amostra
// para o usuário resolver as pendências antes de tentar de novo.
export type GeoProjectDeleteSummary = {
  deleted: boolean;
  retired: number;
  skipped: number;
  blocked: number;
  blockedSiteIds?: string[];
};

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

// Mancha de concentração/dispersão do projeto (REQ-MOD01-017), gerada por
// scripts/build-project-areas.mjs — ver ProjectAreaOverlay.ts para o desenho no mapa.
export type ProjectAreaPolygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };

export type ProjectArea = {
  id: string;
  kind: 'concentration' | 'dispersion';
  siteCount: number;
  geometry: ProjectAreaPolygon;
  siteIds: string[];
  centroid: [number, number] | null;
  areaKm2: number | null;
  generatedAt: string;
};

const BASE_URL = '/v1/geo/projects';

export const fetchProjects = (): Promise<GeoProject[]> => getJson<GeoProject[]>(BASE_URL);

// Manchas já geradas para o projeto (vazio se nenhuma foi gerada ainda — o painel volta ao
// comportamento de sempre, listando/desenhando os locais individuais).
export const fetchProjectAreas = (projectId: string): Promise<ProjectArea[]> =>
  getJson<{ areas: ProjectArea[] }>(`${BASE_URL}/${projectId}/areas`).then((res) => res.areas);

export const createProject = (name?: string): Promise<GeoProject> =>
  postJson<GeoProject>(BASE_URL, name?.trim() ? { name: name.trim() } : {});

export const updateProject = (
  id: string,
  patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status'>>,
): Promise<GeoProject & { siteCascade?: GeoProjectSiteCascade }> =>
  patchJson<GeoProject & { siteCascade?: GeoProjectSiteCascade }>(`${BASE_URL}/${id}`, patch);

export const deleteProject = (id: string): Promise<GeoProjectDeleteSummary> =>
  deleteJson<GeoProjectDeleteSummary>(`${BASE_URL}/${id}`);

// Locais do projeto já vêm na forma de GeoTreeNode (mesma que a árvore usa), com geometria
// resolvida — é o que dá pin/balão/voo de câmera de graça no mapa (ver GeoTreeService.sitesByIds).
//
// `bounds` restringe a busca à região visível do mapa (REQ-MOD01-017) — usado quando o projeto
// já tem manchas geradas, para não baixar dezenas de milhares de locais de uma vez; sem
// `bounds`, mantém o comportamento de sempre (todos os locais, na ordem salva). `limit` também
// vale para a lista do painel (sem `bounds`), para um projeto grande não travar a UI.
export const fetchProjectSites = (
  projectId: string,
  options: { bounds?: MapBounds; limit?: number } = {},
): Promise<ProjectSite[]> => {
  const params = new URLSearchParams();
  if (options.bounds) {
    params.set('minLng', String(options.bounds.minLng));
    params.set('minLat', String(options.bounds.minLat));
    params.set('maxLng', String(options.bounds.maxLng));
    params.set('maxLat', String(options.bounds.maxLat));
  }
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const query = params.toString();
  return getJson<ProjectSite[]>(`${BASE_URL}/${projectId}/sites${query ? `?${query}` : ''}`);
};

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
