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
} from './geoApi';
import type { GeoTreeNode, MapBounds } from './geoTreeApi';
import type { LogicalResourcePayload, PhysicalResourcePayload, ResourceEntity } from './resourceApi';

// Mesmo vocabulário de GeoStatus — o projeto é a unidade de estado (REQ-MOD01-015): mudar
// o status do projeto cascateia (best-effort) para cada Site vinculado. Enquanto o projeto
// está em curso, o local não tem status próprio editável, só herda este valor — uma vez que
// o projeto termina (status 'terminated'), o local passa a ter vida própria (Active) e ganha
// controle de status independente no painel unificado de Local (SiteOverviewTab).
export type GeoProjectStatus = 'planned' | 'active' | 'suspended' | 'terminated' | 'cancelled';
export type GeoProjectStatusBehavior = 'planning' | 'execution' | 'suspended' | 'close-release';
export type GeoProjectStatusCatalogItem = {
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  behavior: GeoProjectStatusBehavior;
};

export type GeoProject = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  iconDataUrl: string | null;
  status: GeoProjectStatus;
  statusCode?: string;
  statusName?: string;
  statusBehavior?: GeoProjectStatusBehavior;
  createdBy: string | null;
  siteCount: number;
  resourceCount?: number;
  infrastructureCount?: number;
  areaCount?: number;
  archivedAt?: string | null;
  archivedBy?: string | null;
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
  archived?: boolean;
  project?: GeoProject;
  /** @deprecated compatibility with the pre-archive endpoint. */
  deleted?: boolean;
  retired?: number;
  skipped?: number;
  blocked?: number;
  blockedSiteIds?: string[];
};

// Local de um projeto, na mesma forma de nó que a árvore usa, acrescido da anotação de
// trabalho e do endereço GEONET de origem (ver geo_project_site em schema.ts). `projectId` é
// carimbado pelo cliente (não vem do servidor) — o nó sobrevive em `nodeByIdRef` dentro de
// GoogleMapPanel e volta carimbado no clique do marcador, para o roteamento do clique no mapa
// (GeoPage.selectNodeFromMap) reconhecer um local de projeto mesmo quando ele não está na
// página de 200 carregada no painel (projeto com manchas geradas, REQ-MOD01-017, busca por
// bbox via `projectViewportSites`).
export type ProjectSite = GeoTreeNode & {
  note: string | null;
  geonetAddressId: string | null;
  projectId: string;
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
  resourceCount?: number;
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
  patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status' | 'statusCode'>>,
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
  options: { bounds?: MapBounds; limit?: number; offset?: number } = {},
): Promise<ProjectSite[]> => {
  const params = new URLSearchParams();
  if (options.bounds) {
    params.set('minLng', String(options.bounds.minLng));
    params.set('minLat', String(options.bounds.minLat));
    params.set('maxLng', String(options.bounds.maxLng));
    params.set('maxLat', String(options.bounds.maxLat));
  }
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  // O servidor não devolve `projectId` na linha (é implícito na rota) — carimbado aqui, nos
  // dois caminhos (com e sem `bounds`), para o nó levar o vínculo consigo até o clique no mapa.
  return getJson<Omit<ProjectSite, 'projectId'>[] | { items: Omit<ProjectSite, 'projectId'>[] }>(
    `${BASE_URL}/${projectId}/sites${query ? `?${query}` : ''}`,
  ).then((result) => (Array.isArray(result) ? result : result.items).map((node) => ({ ...node, projectId })));
};

export type ProjectPagedResult = { items: GeoTreeNode[]; offset: number; limit: number; hasMore: boolean };

export const fetchProjectResources = (
  projectId: string,
  options: { view?: 'all' | 'infrastructure'; limit?: number; offset?: number } = {},
): Promise<ProjectPagedResult> => {
  const params = new URLSearchParams();
  if (options.view) params.set('view', options.view);
  params.set('limit', String(options.limit ?? 50));
  params.set('offset', String(options.offset ?? 0));
  return getJson<ProjectPagedResult>(`${BASE_URL}/${projectId}/resources?${params}`);
};

export const searchProject = (
  projectId: string,
  q: string,
  offset = 0,
  signal?: AbortSignal,
  scope?: 'sites' | 'infrastructure' | 'resources',
): Promise<ProjectPagedResult> =>
  getJson<ProjectPagedResult>(`${BASE_URL}/${projectId}/search?q=${encodeURIComponent(q)}&limit=20&offset=${offset}${scope ? `&scope=${scope}` : ''}`, { signal });

export const createProjectResource = (
  projectId: string,
  payload: PhysicalResourcePayload | LogicalResourcePayload,
): Promise<ResourceEntity> => postJson<ResourceEntity>(`${BASE_URL}/${projectId}/resources`, payload);

export const listProjectStatusCatalog = (): Promise<GeoProjectStatusCatalogItem[]> =>
  getJson('/v1/geo/project-statuses');
export const createProjectStatusCatalogItem = (item: Omit<GeoProjectStatusCatalogItem, 'code'>) =>
  postJson<GeoProjectStatusCatalogItem>('/v1/geo/project-statuses', item);
export const updateProjectStatusCatalogItem = (
  code: string,
  patch: Partial<Omit<GeoProjectStatusCatalogItem, 'code'>>,
) => patchJson<GeoProjectStatusCatalogItem>(`/v1/geo/project-statuses/${encodeURIComponent(code)}`, patch);
export const deactivateProjectStatusCatalogItem = (code: string) =>
  deleteJson<GeoProjectStatusCatalogItem>(`/v1/geo/project-statuses/${encodeURIComponent(code)}`);

export const linkProjectResource = (projectId: string, resourceId: string): Promise<unknown> =>
  postJson(`${BASE_URL}/${projectId}/resources/${resourceId}`, {});

export const unlinkProjectResource = (projectId: string, resourceId: string): Promise<{ detached: boolean }> =>
  deleteJson<{ detached: boolean }>(`${BASE_URL}/${projectId}/resources/${resourceId}`);

// Devolve o `projectId` carimbado por `fetchProjectSites`, ou `null` para qualquer outro
// `GeoTreeNode` (árvore, busca, infra passiva) — usado por GeoPage.selectNodeFromMap para
// distinguir um pin de projeto de um pin comum sem depender de qual lista o alimentou.
export const projectIdOfNode = (node: GeoTreeNode): string | null =>
  (node as Partial<ProjectSite>).projectId ?? null;

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
