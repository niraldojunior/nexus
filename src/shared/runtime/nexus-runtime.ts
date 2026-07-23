import { createCanonicalId } from '../utils/canonical-id.js';
import { PostgresGeoRepository } from '../../modules/geo/postgres-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { GeoTreeService } from '../../modules/geo/tree-service.js';
import { OrderService } from '../../modules/order/service.js';
import { PostgresOrderRepository } from '../../modules/order/postgres-repository.js';
import { PartyService } from '../../modules/party/service.js';
import { PostgresPartyRepository } from '../../modules/party/postgres-repository.js';
import { ResourceService } from '../../modules/resource/service.js';
import { PostgresResourceRepository } from '../../modules/resource/postgres-repository.js';
import { SearchService } from '../../modules/search/service.js';
import { PostgresSearchRepository as ResearchRepository } from '../../modules/search/postgres-repository.js';
import { ServiceService } from '../../modules/service/service.js';
import { PostgresServiceRepository } from '../../modules/service/postgres-repository.js';
import { PostgresDatabase } from '../persistence/postgres-database.js';
import { PostgresSearchRepository } from '../persistence/postgres-search-repository.js';
import { PostgresUserRepository, type UserRecord } from '../persistence/postgres-user-repository.js';
import { EventService, PostgresEventRepository } from '../tmf/index.js';

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

export const createNexusRuntime = (db: PostgresDatabase) => {
  const userRepository = new PostgresUserRepository(db);
  const searchRepository = new PostgresSearchRepository(db);
  const researchRepository = new ResearchRepository(db);
  const geoRepository = new PostgresGeoRepository(db);
  const geoService = new GeoService(geoRepository);
  const geoTreeService = new GeoTreeService(db);
  const eventRepository = new PostgresEventRepository(db);
  const eventService = new EventService(eventRepository);
  const partyRepository = new PostgresPartyRepository(db);
  const partyService = new PartyService(partyRepository, eventService);
  const resourceRepository = new PostgresResourceRepository(db);
  const resourceService = new ResourceService(resourceRepository, eventService, {
    lookupPlace: (id) => {
      const site = geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      return undefined;
    },
    lookupParty: (id) => {
      const party = partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
  });
  const serviceRepository = new PostgresServiceRepository(db);
  let serviceService: ServiceService;
  serviceService = new ServiceService(serviceRepository, eventService, {
    lookupParty: (id) => {
      const party = partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
    lookupPlace: (id) => {
      const site = geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      return undefined;
    },
    lookupResource: (id) => {
      const resource = resourceService.getResource(id);
      if (!resource) return undefined;
      return {
        id: resource.id,
        '@referredType': resource['@type'],
        href: resource.href,
        name: resource.name,
      };
    },
    lookupService: (id) => serviceService.getService(id),
  });
  const orderRepository = new PostgresOrderRepository(db);
  const orderService = new OrderService(orderRepository, eventService, {
    lookupParty: (id) => {
      const party = partyService.getParty(id);
      if (!party) return undefined;
      return {
        id: party.id,
        '@referredType': party.partyType,
        href: party.href,
        name: party.name,
      };
    },
    lookupPlace: (id) => {
      const site = geoService.getSite(id);
      if (site) {
        return { id: site.id, '@referredType': 'GeographicSite', href: site.href, name: site.name };
      }
      const location = geoService.getLocation(id);
      if (location) {
        return { id: location.id, '@referredType': 'GeographicLocation', href: location.href };
      }
      const address = geoService.getAddress(id);
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

  let defaultUser = userRepository.getByExternalId(DEFAULT_RUNTIME_USER.externalId);
  if (!defaultUser) {
    defaultUser = userRepository.create(DEFAULT_RUNTIME_USER);
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

export type NexusRuntime = ReturnType<typeof createNexusRuntime>;
