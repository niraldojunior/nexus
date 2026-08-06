import { createCanonicalId } from '../utils/canonical-id.js';
import { PostgresGeoRepository } from '../../modules/geo/postgres-repository.js';
import { OracleGeoRepository } from '../../modules/geo/oracle-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { GeoTreeService } from '../../modules/geo/tree-service.js';
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

export type NexusRuntimeUser = UserRecord;

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

export const createNexusRuntime = async (db: DatabaseClient) => {
  const oracle = db.provider === 'oracle';
  const userRepository = oracle ? new OracleUserRepository(db) : new PostgresUserRepository(db);
  const searchRepository = oracle
    ? new OracleSearchRepository(db)
    : new PostgresSearchRepository(db);
  const researchRepository = oracle ? new OracleResearchRepository(db) : new ResearchRepository(db);
  const geoRepository = oracle ? new OracleGeoRepository(db) : new PostgresGeoRepository(db);
  const geoService = new GeoService(geoRepository);
  await geoService.ensureBootstrapSpecifications();
  await geoService.ensureBootstrapRelationshipTypes();
  const geoTreeService = new GeoTreeService(db);
  const eventRepository = oracle ? new OracleEventRepository(db) : new PostgresEventRepository(db);
  const eventService = new EventService(eventRepository);
  const partyRepository = oracle ? new OraclePartyRepository(db) : new PostgresPartyRepository(db);
  await partyRepository.initialize();
  const partyService = new PartyService(partyRepository, eventService);
  const resourceRepository = oracle
    ? new OracleResourceRepository(db)
    : new PostgresResourceRepository(db);
  await resourceRepository.initialize();
  const resourceService = new ResourceService(resourceRepository, eventService, {
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
  });
  const serviceRepository = oracle
    ? new OracleServiceRepository(db)
    : new PostgresServiceRepository(db);
  const serviceService: ServiceService = new ServiceService(serviceRepository, eventService, {
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

  return {
    db,
    userRepository,
    searchRepository,
    researchRepository,
    searchService,
    geoRepository,
    geoService,
    geoTreeService,
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
