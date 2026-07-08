import { createCanonicalId } from '../utils/canonical-id.js';
import { SqliteGeoRepository } from '../../modules/geo/sqlite-repository.js';
import { GeoService } from '../../modules/geo/service.js';
import { OrderService } from '../../modules/order/service.js';
import { SqliteOrderRepository } from '../../modules/order/sqlite-repository.js';
import { PartyService } from '../../modules/party/service.js';
import { SqlitePartyRepository } from '../../modules/party/sqlite-repository.js';
import { ResourceService } from '../../modules/resource/service.js';
import { SqliteResourceRepository } from '../../modules/resource/sqlite-repository.js';
import { SearchService } from '../../modules/search/service.js';
import { SqliteSearchRepository as ResearchRepository } from '../../modules/search/sqlite-repository.js';
import { ServiceService } from '../../modules/service/service.js';
import { SqliteServiceRepository } from '../../modules/service/sqlite-repository.js';
import { SqliteDatabase } from '../persistence/sqlite-database.js';
import { SqliteSearchRepository } from '../persistence/sqlite-search-repository.js';
import { SqliteUserRepository, type UserRecord } from '../persistence/sqlite-user-repository.js';
import { EventService, SqliteEventRepository } from '../tmf/index.js';

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

export const createNexusRuntime = (db: SqliteDatabase) => {
  const userRepository = new SqliteUserRepository(db);
  const searchRepository = new SqliteSearchRepository(db);
  const researchRepository = new ResearchRepository(db);
  const geoRepository = new SqliteGeoRepository(db);
  const geoService = new GeoService(geoRepository);
  const eventRepository = new SqliteEventRepository(db);
  const eventService = new EventService(eventRepository);
  const partyRepository = new SqlitePartyRepository(db);
  const partyService = new PartyService(partyRepository, eventService);
  const resourceRepository = new SqliteResourceRepository(db);
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
  const serviceRepository = new SqliteServiceRepository(db);
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
  const orderRepository = new SqliteOrderRepository(db);
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
