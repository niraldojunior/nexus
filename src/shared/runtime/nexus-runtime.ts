import { createCanonicalId } from '../utils/canonical-id.js';
import { PostgresGeoRepository } from '../../modules/geo/postgres-repository.js';
import { OracleGeoRepository } from '../../modules/geo/oracle-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { GeoTreeService } from '../../modules/geo/tree-service.js';
import { GeoMapTileService } from '../../modules/geo/map-tile-service.js';
import { GeoMapDensityService } from '../../modules/geo/map-density-service.js';
import { GeoMapFeatureSynchronizer } from '../../modules/geo/map-feature-synchronizer.js';
import { GeoCoverageService } from '../../modules/geo/coverage-service.js';
import { OrderService } from '../../modules/order/service.js';
import { PostgresOrderRepository } from '../../modules/order/postgres-repository.js';
import { OracleOrderRepository } from '../../modules/order/oracle-repository.js';
import { PartyService } from '../../modules/party/service.js';
import { PostgresPartyRepository } from '../../modules/party/postgres-repository.js';
import { OraclePartyRepository } from '../../modules/party/oracle-repository.js';
import { ResourceService } from '../../modules/resource/service.js';
import { PostgresResourceRepository } from '../../modules/resource/postgres-repository.js';
import { OracleResourceRepository } from '../../modules/resource/oracle-repository.js';
import { SearchService } from '../../modules/search/service.js';
import { PostgresSearchRepository as ResearchRepository } from '../../modules/search/postgres-repository.js';
import { OracleSearchRepository as OracleResearchRepository } from '../../modules/search/oracle-repository.js';
import { ServiceService } from '../../modules/service/service.js';
import { PostgresServiceRepository } from '../../modules/service/postgres-repository.js';
import { OracleServiceRepository } from '../../modules/service/oracle-repository.js';
import type { DatabaseClient } from '../persistence/database-client.js';
import { PostgresSearchRepository } from '../persistence/postgres-search-repository.js';
import { OracleSearchRepository } from '../persistence/oracle-search-repository.js';
import {
  PostgresUserRepository,
  type UserRecord,
} from '../persistence/postgres-user-repository.js';
import { OracleUserRepository } from '../persistence/oracle-user-repository.js';
import { EventService, PostgresEventRepository } from '../tmf/index.js';
import { OracleEventRepository } from '../tmf/oracle-event-repository.js';
import { AuthService } from '../../modules/auth/index.js';
import { GeoSearchHistoryRepository } from '../../modules/geo/search-history-repository.js';
import { GeoProjectRepository } from '../../modules/geo/project-repository.js';
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
  const oracle = db.provider === 'oracle';
  const userRepository = oracle ? new OracleUserRepository(db) : new PostgresUserRepository(db);
  const authService = new AuthService(userRepository, {
    ...(options.auth?.jwtSecret ? { jwtSecret: options.auth.jwtSecret } : {}),
    accessTokenTtlSeconds: options.auth?.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  });
  const geoSearchHistoryRepository = new GeoSearchHistoryRepository(db);
  const geoProjectRepository = new GeoProjectRepository(db);
  const searchRepository = oracle
    ? new OracleSearchRepository(db)
    : new PostgresSearchRepository(db);
  const researchRepository = oracle ? new OracleResearchRepository(db) : new ResearchRepository(db);
  const geoRepository = oracle ? new OracleGeoRepository(db) : new PostgresGeoRepository(db);
  const mapFeatureSynchronizer = new GeoMapFeatureSynchronizer(db);
  const geoService = new GeoService(geoRepository, mapFeatureSynchronizer);
  await geoService.ensureBootstrapSpecifications();
  await geoService.ensureBootstrapRelationshipTypes();
  const geoTreeService = new GeoTreeService(db);
  const geoMapTileService = new GeoMapTileService(db);
  const geoMapDensityService = new GeoMapDensityService(db);
  const geoCoverageService = new GeoCoverageService(db);
  const geonetAddressGateway = options.geonet ? new GeonetAddressGateway(options.geonet) : null;
  const eventRepository = oracle ? new OracleEventRepository(db) : new PostgresEventRepository(db);
  const eventService = new EventService(eventRepository);
  const partyRepository = oracle ? new OraclePartyRepository(db) : new PostgresPartyRepository(db);
  await partyRepository.initialize();
  const partyService = new PartyService(partyRepository, eventService, db);
  const resourceRepository = oracle
    ? new OracleResourceRepository(db)
    : new PostgresResourceRepository(db);
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
  const serviceRepository = oracle
    ? new OracleServiceRepository(db)
    : new PostgresServiceRepository(db);
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
  const orderRepository = oracle ? new OracleOrderRepository(db) : new PostgresOrderRepository(db);
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
    resourceRepository,
    resourceService,
    serviceRepository,
    serviceService,
    orderRepository,
    orderService,
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
