/**
 * `href` (self-link) das entidades TMF é derivado em tempo de leitura a partir de `id`/`code` + tipo
 * de entidade, em vez de persistido. É 100% determinístico — não há coluna física correspondente
 * (ver `docs/5-delivery-plan/architecture-decisions.md`, D-API-001).
 *
 * Cada valor de `HREF_PATHS` é o path completo até (e excluindo) o segmento final da chave, para que
 * `buildHref` seja uma simples concatenação — isso também acomoda as duas entidades fora do padrão
 * `/tmf-api/<domínio>Management/v4/<recurso>` sem precisar de caso especial no código.
 */
export const HREF_PATHS = {
  geographicLocation: '/tmf-api/geographicLocationManagement/v4/geographicLocation',
  geographicAddress: '/tmf-api/geographicAddressManagement/v4/geographicAddress',
  geographicSite: '/tmf-api/geographicSiteManagement/v4/geographicSite',
  geographicSiteSpecification: '/tmf-api/geographicSiteManagement/v4/geographicSiteSpecification',
  /** Fora do namespace TMF e chaveado por `code`, não por `id` (ver src/modules/geo/service.ts). */
  geographicRelationshipType: '/v1/geo/relationship-types',
  resourceSpecification: '/tmf-api/resourceCatalogManagement/v4/resourceSpecification',
  resourceFunctionSpecification: '/tmf-api/resourceCatalogManagement/v4/resourceFunctionSpecification',
  resourceCategory: '/tmf-api/resourceCatalogManagement/v4/resourceCategory',
  resourceType: '/tmf-api/resourceCatalogManagement/v4/resourceType',
  resourceLayer: '/v1/resource-layers',
  resourceCatalog: '/tmf-api/resourceCatalogManagement/v4/resourceCatalog',
  /** Fora do namespace TMF — árvore V.tal não tem equivalente TMF634 direto (issue #188). */
  resourceCatalogNode: '/v1/resource-catalog-nodes',
  /** Cobre PhysicalResource e LogicalResource — ambos compartilham este path hoje. */
  resource: '/tmf-api/resourceInventoryManagement/v4/resource',
  serviceSpecification: '/tmf-api/serviceCatalogManagement/v4/serviceSpecification',
  serviceCategory: '/tmf-api/serviceCatalogManagement/v4/serviceCategory',
  serviceCandidate: '/tmf-api/serviceCatalogManagement/v4/serviceCandidate',
  /** Cobre CustomerFacingService e ResourceFacingService — ambos compartilham este path hoje. */
  service: '/tmf-api/serviceInventoryManagement/v4/service',
  serviceQualification: '/tmf-api/serviceQualificationManagement/v4/serviceQualification',
  serviceOrder: '/tmf-api/serviceOrderingManagement/v4/serviceOrder',
  resourceOrder: '/tmf-api/resourceOrderingManagement/v4/resourceOrder',
  party: '/tmf-api/partyManagement/v4/party',
  partyRole: '/tmf-api/partyRoleManagement/v4/partyRole',
  /** Fora do namespace TMF — rota interna do módulo de busca. */
  researchSession: '/v1/search/sessions',
  /** Fora do namespace TMF — control plane do Nexus Studio (D-ARQ-005, sem Open API TMF própria). */
  studioWorkspace: '/v1/studio/workspaces',
  studioVersion: '/v1/studio/versions',
} as const satisfies Record<string, `/${string}`>;

export type HrefEntity = keyof typeof HREF_PATHS;

let baseUrl = '';

/**
 * Configura a base URL usada por `buildHref`. Chamar uma única vez no boot do processo, antes de
 * qualquer repositório ser exercitado — nunca por requisição. Valor padrão (vazio) preserva o
 * comportamento histórico: `href` relativo, ex. `/tmf-api/.../{id}`.
 *
 * Usado para expor `href` absoluto quando o Nexus é servido atrás de um gateway (Apigee) cujo host
 * público difere do host interno (ver `docs/3-system-design/integrations.md`).
 */
export const configureHrefBaseUrl = (value: string | undefined): void => {
  baseUrl = (value ?? '').trim().replace(/\/+$/, '');
};

/**
 * Monta o `href` de uma entidade TMF a partir do seu identificador natural (`id` na maioria dos
 * casos; `code` para `geographicRelationshipType`).
 */
export const buildHref = (entity: HrefEntity, key: string): string =>
  `${baseUrl}${HREF_PATHS[entity]}/${encodeURIComponent(key)}`;
