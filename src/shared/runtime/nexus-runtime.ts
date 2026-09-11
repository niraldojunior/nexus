import { createCanonicalId } from '../utils/canonical-id.js';
import { OracleGeoRepository } from '../../modules/geo/oracle-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { GeoTreeService } from '../../modules/geo/tree-service.js';
import { GeoMapTileService } from '../../modules/geo/map-tile-service.js';
import { GeoMapDensityService } from '../../modules/geo/map-density-service.js';
import { GeoMapFeatureSynchronizer } from '../../modules/geo/map-feature-synchronizer.js';
import { GeoCoverageService } from '../../modules/geo/coverage-service.js';
import { OrderService } from '../../modules/order/service.js';
import { OracleOrderRepository } from '../../modules/order/oracle-repository.js';
import { PartyService } from '../../modules/party/service.js';
import { OraclePartyRepository } from '../../modules/party/oracle-repository.js';
import { ResourceService } from '../../modules/resource/service.js';
import { OracleResourceRepository } from '../../modules/resource/oracle-repository.js';
import { SearchService } from '../../modules/search/service.js';
import { OracleSearchRepository as OracleResearchRepository } from '../../modules/search/oracle-repository.js';
import { ServiceService } from '../../modules/service/service.js';
import { OracleServiceRepository } from '../../modules/service/oracle-repository.js';
import type { DatabaseClient } from '../persistence/database-client.js';
import { OracleSearchRepository } from '../persistence/oracle-search-repository.js';
import type { UserRecord } from '../persistence/oracle-user-repository.js';
import { OracleUserRepository } from '../persistence/oracle-user-repository.js';
import { EventService } from '../tmf/index.js';
import { OracleEventRepository } from '../tmf/oracle-event-repository.js';
import { AuthService } from '../../modules/auth/index.js';
import { GeoSearchHistoryRepository } from '../../modules/geo/search-history-repository.js';
import { GeoProjectRepository } from '../../modules/geo/project-repository.js';
import { PartyRoleTypeCharacteristicRepository } from '../../modules/party/party-role-type-characteristic-repository.js';
import { PartyRoleTypeRepository } from '../../modules/party/party-role-type-repository.js';
import { StudioService } from '../../modules/studio/service.js';
import { OracleStudioRepository } from '../../modules/studio/oracle-repository.js';
import { ResourceModelStudioAdapter } from '../../modules/studio/adapters/resource-model-adapter.js';
import { LocationModelStudioAdapter } from '../../modules/studio/adapters/location-model-adapter.js';
import { SpatialStudioAdapter } from '../../modules/studio/adapters/spatial-studio-adapter.js';
import { StudioGeoAdapter, CANONICAL_STUDIO_GEO_SNAPSHOT } from '../../modules/studio/adapters/studio-geo-adapter.js';
import { RulesWorkflowsStudioAdapter } from '../../modules/studio/adapters/rules-workflows-studio-adapter.js';
import { TemplatesStudioAdapter, CANONICAL_TEMPLATES_SNAPSHOT } from '../../modules/studio/adapters/templates-studio-adapter.js';
import { CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT } from '../../modules/geo/project-workflow.js';
import { GeoProjectWorkflowService } from '../../modules/geo/project-workflow-service.js';
import { OracleStudioAssetRepository } from '../../modules/studio/oracle-asset-repository.js';
import { StudioAssetService } from '../../modules/studio/asset-service.js';
import {
  GeonetAddressGateway,
  type GeonetGatewayConfig,
} from '../../modules/geo/geonet-address-gateway.js';

export type NexusRuntimeUser = UserRecord;

// Opções de runtime injetadas a partir da AppConfig (o runtime não lê env direto). A
// autenticação local precisa do segredo HS256, do TTL do token e do admin semente.
export type NexusRuntimeOptions = {
  auth?: {
    jwtSecret?: string;
    accessTokenTtlSeconds?: number;
    adminEmail?: string;
    adminPassword?: string;
  };
  geonet?: GeonetGatewayConfig;
};

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_TENANT_ID = 'default';

export type NexusToolContextOptions = {
  correlationId?: string;
  executionMode?: 'internal-chat' | 'external-stdio' | 'internal-http';
  permissions?: string[];
  sessionId?: string;
  tenant?: {
    id: string;
    name?: string;
  };
};

export const DEFAULT_RUNTIME_USER = {
  externalId: 'VT158145',
  name: 'NIRALDO ROCHA GRANADO JUNIOR',
} as const;

export const createNexusRuntime = async (db: DatabaseClient, options: NexusRuntimeOptions = {}) => {
  const userRepository = new OracleUserRepository(db);
  const authService = new AuthService(userRepository, {
    ...(options.auth?.jwtSecret ? { jwtSecret: options.auth.jwtSecret } : {}),
    accessTokenTtlSeconds: options.auth?.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  });
  const geoSearchHistoryRepository = new GeoSearchHistoryRepository(db);
  const geoProjectRepository = new GeoProjectRepository(db);
  const searchRepository = new OracleSearchRepository(db);
  const researchRepository = new OracleResearchRepository(db);
  const geoRepository = new OracleGeoRepository(db);
  const mapFeatureSynchronizer = new GeoMapFeatureSynchronizer(db);
  const geoService = new GeoService(geoRepository, mapFeatureSynchronizer);
  await geoService.ensureBootstrapSpecifications();
  await geoService.ensureBootstrapRelationshipTypes();
  const geoTreeService = new GeoTreeService(db);
  const geoMapTileService = new GeoMapTileService(db);
  const geoMapDensityService = new GeoMapDensityService(db);
  const geoCoverageService = new GeoCoverageService(db);
  const geonetAddressGateway = options.geonet ? new GeonetAddressGateway(options.geonet) : null;
  const eventRepository = new OracleEventRepository(db);
  const eventService = new EventService(eventRepository);
  const partyRepository = new OraclePartyRepository(db);
  await partyRepository.initialize();
  const partyService = new PartyService(partyRepository, eventService, db);
  const partyRoleTypeRepository = new PartyRoleTypeRepository(db);
  await partyRoleTypeRepository.ensureSupplierSeed(DEFAULT_TENANT_ID);
  const partyRoleTypeCharacteristicRepository = new PartyRoleTypeCharacteristicRepository(db);
  await partyRoleTypeCharacteristicRepository.ensureManufacturerCnpjSeed(DEFAULT_TENANT_ID);
  const resourceRepository = new OracleResourceRepository(db);
  await resourceRepository.initialize();
  const resourceService = new ResourceService(resourceRepository, eventService, {
    mapFeatureSynchronizer,
    db,
    lookupPlace: async (id) => {
      const site = await geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = await geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      const address = await geoService.getAddress(id);
      if (address) {
        return { id: address.id, '@referredType': 'GeographicAddress', href: address.href };
      }
      return undefined;
    },
    lookupParty: async (id) => {
      const party = await partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
    lookupPartyRoles: async (partyId) =>
      (await partyService.listPartyRoles({ partyId })).map((role) => ({
        name: role.name,
        status: role.status,
      })),
  });
  const serviceRepository = new OracleServiceRepository(db);
  const serviceService: ServiceService = new ServiceService(serviceRepository, eventService, {
    db,
    lookupParty: async (id) => {
      const party = await partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
    lookupPlace: async (id) => {
      const site = await geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = await geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      return undefined;
    },
    lookupResource: async (id) => {
      const resource = await resourceService.getResource(id);
      if (!resource) return undefined;
      return {
        id: resource.id,
        '@referredType': resource['@type'],
        href: resource.href,
        name: resource.name,
      };
    },
    lookupService: async (id) => await serviceService.getService(id),
  });
  const orderRepository = new OracleOrderRepository(db);
  const orderService = new OrderService(orderRepository, eventService, {
    db,
    lookupParty: async (id) => {
      const party = await partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
    lookupPlace: async (id) => {
      const site = await geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = await geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      const address = await geoService.getAddress(id);
      if (address) {
        return { id: address.id, '@referredType': 'GeographicAddress', href: address.href };
      }
      return undefined;
    },
    serviceService,
    geoService,
    resourceService,
    partyService,
  });
  const searchService = new SearchService(researchRepository);
  const studioRepository = new OracleStudioRepository(db);
  const studioAssetRepository = new OracleStudioAssetRepository(db);
  const studioAssetService = new StudioAssetService(studioAssetRepository);
  const studioService = new StudioService(studioRepository, eventService, { db });
  studioService.registerAdapter(new ResourceModelStudioAdapter(resourceService));
  studioService.registerAdapter(new LocationModelStudioAdapter(geoService));
  studioService.registerAdapter(new SpatialStudioAdapter(geoService));
  studioService.registerAdapter(
    new StudioGeoAdapter(async (tenantId, assetId) => Boolean(await studioAssetRepository.get(tenantId, assetId))),
  );
  studioService.registerAdapter(new RulesWorkflowsStudioAdapter(db));
  studioService.registerAdapter(new TemplatesStudioAdapter(resourceService));
  await studioService.ensurePublishedBootstrap('studio-geo', CANONICAL_STUDIO_GEO_SNAPSHOT, {
    actorSub: 'studio-bootstrap',
    tenantId: DEFAULT_TENANT_ID,
    roles: ['studio.admin', 'platform.admin'],
    traceId: createCanonicalId(),
  });
  await studioService.ensurePublishedBootstrap('rules-workflows', CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT, {
    actorSub: 'studio-bootstrap',
    tenantId: DEFAULT_TENANT_ID,
    roles: ['studio.admin', 'platform.admin'],
    traceId: createCanonicalId(),
  });
  await studioService.ensurePublishedBootstrap('templates', CANONICAL_TEMPLATES_SNAPSHOT as unknown as Record<string, unknown>, {
    actorSub: 'studio-bootstrap',
    tenantId: DEFAULT_TENANT_ID,
    roles: ['studio.admin', 'platform.admin'],
    traceId: createCanonicalId(),
  });
  const geoProjectWorkflowService = new GeoProjectWorkflowService(
    db,
    geoProjectRepository,
    geoService,
    resourceService,
    studioService,
    eventService,
  );

  let defaultUser = await userRepository.getByExternalId(DEFAULT_RUNTIME_USER.externalId);
  if (!defaultUser) {
    defaultUser = await userRepository.create(DEFAULT_RUNTIME_USER);
  }

  // Admin semente idempotente: só cria/atualiza quando as duas variáveis existem. Sem elas,
  // não há como fazer o primeiro login — o chamador (createApp) registra o aviso.
  if (options.auth?.adminEmail && options.auth?.adminPassword) {
    await authService.ensureAdmin(options.auth.adminEmail, options.auth.adminPassword);
  }

  return {
    db,
    userRepository,
    authService,
    geoSearchHistoryRepository,
    geoProjectRepository,
    geoProjectWorkflowService,
    searchRepository,
    researchRepository,
    searchService,
    geoRepository,
    geoService,
    geoTreeService,
    geoMapTileService,
    geoMapDensityService,
    geoCoverageService,
    geonetAddressGateway,
    eventRepository,
    eventService,
    partyRepository,
    partyService,
    partyRoleTypeRepository,
    partyRoleTypeCharacteristicRepository,
    resourceRepository,
    resourceService,
    serviceRepository,
    serviceService,
    orderRepository,
    orderService,
    studioRepository,
    studioAssetRepository,
    studioAssetService,
    studioService,
    defaultUser,
    createToolContext: (options: NexusToolContextOptions = {}) => ({
      user: {
        id: defaultUser.id,
        externalId: defaultUser.externalId,
        name: defaultUser.name,
      },
      tenant: options.tenant,
      permissions: options.permissions ?? ['tmf:read', 'tmf:write'],
      correlationId: options.correlationId ?? createCanonicalId(),
      executionMode: options.executionMode ?? 'internal-http',
      sessionId: options.sessionId,
    }),
  };
};

export type NexusRuntime = Awaited<ReturnType<typeof createNexusRuntime>>;
