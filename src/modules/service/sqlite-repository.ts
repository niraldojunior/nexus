import { SqliteDatabase } from '../../shared/persistence/sqlite-database.js';
import type {
  CustomerFacingService,
  ResourceFacingService,
  Service,
  ServiceCandidate,
  ServiceCandidateQuery,
  ServiceCategory,
  ServiceCategoryQuery,
  ServiceQuery,
  ServiceReference,
  ServiceRelationship,
  ServiceSpecification,
  ServiceSpecificationQuery,
} from './domain.js';
import type { IServiceRepository } from './service-repository-interface.js';

export class SqliteServiceRepository implements IServiceRepository {
  public constructor(private readonly db: SqliteDatabase) {}

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  public upsertServiceSpecification(spec: ServiceSpecification): ServiceSpecification {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_service_specification
       (id, href, name, category, service_type, description, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       category = excluded.category,
       service_type = excluded.service_type,
       description = excluded.description,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.href,
        spec.name,
        spec.category,
        spec.serviceType,
        spec.description ?? null,
        spec.validFor?.startDateTime ?? null,
        spec.validFor?.endDateTime ?? null,
        JSON.stringify(spec.serviceSpecificationCharacteristic),
        now,
        now,
      ],
    );

    return this.getServiceSpecification(spec.id) ?? spec;
  }

  public getServiceSpecification(id: string): ServiceSpecification | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      category: string;
      service_type: 'CFS' | 'RFS' | 'Other';
      description?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, category, service_type, description, valid_for_start, valid_for_end, characteristics
       FROM tmf_service_specification
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapServiceSpecification(row) : undefined;
  }

  public listServiceSpecifications(query?: ServiceSpecificationQuery): ServiceSpecification[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.category) {
      conditions.push('category = ?');
      params.push(query.category);
    }
    if (query?.serviceType) {
      conditions.push('service_type = ?');
      params.push(query.serviceType);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, category, service_type, description, valid_for_start, valid_for_end, characteristics FROM tmf_service_specification',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY category, name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<any>(sql, params);
    return rows.map((row) => this.mapServiceSpecification(row));
  }

  public upsertServiceCategory(category: ServiceCategory): ServiceCategory {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_service_category
       (id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       description = excluded.description,
       parent_category_id = excluded.parent_category_id,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        category.id,
        category.href,
        category.name,
        category.description ?? null,
        category.parentServiceCategory?.id ?? null,
        category.validFor?.startDateTime ?? null,
        category.validFor?.endDateTime ?? null,
        JSON.stringify(category.serviceCategoryCharacteristic),
        now,
        now,
      ],
    );

    return this.getServiceCategory(category.id) ?? category;
  }

  public getServiceCategory(id: string): ServiceCategory | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      description?: string | null;
      parent_category_id?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics
       FROM tmf_service_category
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapServiceCategory(row) : undefined;
  }

  public listServiceCategories(query?: ServiceCategoryQuery): ServiceCategory[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.parentCategoryId) {
      conditions.push('parent_category_id = ?');
      params.push(query.parentCategoryId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics FROM tmf_service_category',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<any>(sql, params);
    return rows.map((row) => this.mapServiceCategory(row));
  }

  public upsertServiceCandidate(candidate: ServiceCandidate): ServiceCandidate {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_service_candidate
       (id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       description = excluded.description,
       service_specification_id = excluded.service_specification_id,
       service_category_id = excluded.service_category_id,
       status = excluded.status,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        candidate.id,
        candidate.href,
        candidate.name,
        candidate.description ?? null,
        candidate.serviceSpecification.id,
        candidate.serviceCategory?.id ?? null,
        candidate.status,
        candidate.validFor?.startDateTime ?? null,
        candidate.validFor?.endDateTime ?? null,
        JSON.stringify(candidate.serviceCandidateCharacteristic),
        now,
        now,
      ],
    );

    return this.getServiceCandidate(candidate.id) ?? candidate;
  }

  public getServiceCandidate(id: string): ServiceCandidate | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      description?: string | null;
      service_specification_id: string;
      service_category_id?: string | null;
      status: 'active' | 'inactive' | 'terminated';
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics
       FROM tmf_service_candidate
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapServiceCandidate(row) : undefined;
  }

  public listServiceCandidates(query?: ServiceCandidateQuery): ServiceCandidate[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.serviceSpecificationId) {
      conditions.push('service_specification_id = ?');
      params.push(query.serviceSpecificationId);
    }
    if (query?.serviceCategoryId) {
      conditions.push('service_category_id = ?');
      params.push(query.serviceCategoryId);
    }
    if (query?.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics FROM tmf_service_candidate',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<any>(sql, params);
    return rows.map((row) => this.mapServiceCandidate(row));
  }

  public upsertCustomerFacingService(service: CustomerFacingService): CustomerFacingService {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_customer_facing_service
       (id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
        is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
        supporting_services, service_relationships, characteristics, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       service_specification_id = excluded.service_specification_id,
       status = excluded.status,
       state = excluded.state,
       service_type = excluded.service_type,
       category = excluded.category,
       service_date = excluded.service_date,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       is_service_enabled = excluded.is_service_enabled,
       has_started = excluded.has_started,
       subscriber_id = excluded.subscriber_id,
       supporting_resource_facing_service_id = excluded.supporting_resource_facing_service_id,
       place = excluded.place,
       related_party = excluded.related_party,
       supporting_services = excluded.supporting_services,
       service_relationships = excluded.service_relationships,
       characteristics = excluded.characteristics,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        service.id,
        service.href,
        service.name,
        service.serviceSpecificationId,
        service.state === 'terminated' ? 'terminated' : service.state === 'inactive' ? 'inactive' : 'active',
        service.state,
        service.serviceType ?? null,
        service.category ?? null,
        service.serviceDate ?? null,
        service.startDate ?? null,
        service.endDate ?? null,
        booleanToInt(service.isServiceEnabled),
        booleanToInt(service.hasStarted),
        service.subscriberId,
        service.supportingService[0]?.id ?? null,
        JSON.stringify(service.place),
        JSON.stringify(service.relatedParty),
        JSON.stringify(service.supportingService),
        JSON.stringify(service.serviceRelationship),
        JSON.stringify(service.serviceCharacteristic),
        service.validFor?.startDateTime ?? null,
        service.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getCustomerFacingService(service.id) ?? service;
  }

  public getCustomerFacingService(id: string): CustomerFacingService | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
              supporting_services, service_relationships, characteristics, valid_for_start, valid_for_end
       FROM tmf_customer_facing_service
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapCustomerFacingService(row) : undefined;
  }

  public listCustomerFacingServices(query?: ServiceQuery): CustomerFacingService[] {
    return this.listServices(query).filter((service): service is CustomerFacingService => service['@type'] === 'CustomerFacingService');
  }

  public upsertResourceFacingService(service: ResourceFacingService): ResourceFacingService {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_resource_facing_service
       (id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
        is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
        service_relationships, characteristics, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       service_specification_id = excluded.service_specification_id,
       status = excluded.status,
       state = excluded.state,
       service_type = excluded.service_type,
       category = excluded.category,
       service_date = excluded.service_date,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       is_service_enabled = excluded.is_service_enabled,
       has_started = excluded.has_started,
       supporting_resource_id = excluded.supporting_resource_id,
       place = excluded.place,
       related_party = excluded.related_party,
       supporting_resources = excluded.supporting_resources,
       supporting_services = excluded.supporting_services,
       service_relationships = excluded.service_relationships,
       characteristics = excluded.characteristics,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        service.id,
        service.href,
        service.name,
        service.serviceSpecificationId,
        service.state === 'terminated' ? 'terminated' : service.state === 'inactive' ? 'inactive' : 'active',
        service.state,
        service.serviceType ?? null,
        service.category ?? null,
        service.serviceDate ?? null,
        service.startDate ?? null,
        service.endDate ?? null,
        booleanToInt(service.isServiceEnabled),
        booleanToInt(service.hasStarted),
        service.supportingResource[0]?.id ?? null,
        JSON.stringify(service.place),
        JSON.stringify(service.relatedParty),
        JSON.stringify(service.supportingResource),
        JSON.stringify(service.supportingService),
        JSON.stringify(service.serviceRelationship),
        JSON.stringify(service.serviceCharacteristic),
        service.validFor?.startDateTime ?? null,
        service.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getResourceFacingService(service.id) ?? service;
  }

  public getResourceFacingService(id: string): ResourceFacingService | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
              service_relationships, characteristics, valid_for_start, valid_for_end
       FROM tmf_resource_facing_service
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapResourceFacingService(row) : undefined;
  }

  public listResourceFacingServices(query?: ServiceQuery): ResourceFacingService[] {
    return this.listServices(query).filter((service): service is ResourceFacingService => service['@type'] === 'ResourceFacingService');
  }

  public listServices(query?: ServiceQuery): Service[] {
    if (query?.type === 'CustomerFacingService') {
      return this.listCustomerFacingServicesDirect(query);
    }

    if (query?.type === 'ResourceFacingService') {
      return this.listResourceFacingServicesDirect(query);
    }

    return [...this.listCustomerFacingServicesDirect(query), ...this.listResourceFacingServicesDirect(query)];
  }

  private listCustomerFacingServicesDirect(query?: ServiceQuery): CustomerFacingService[] {
    const rows = this.db.all<any>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
              supporting_services, service_relationships, characteristics, valid_for_start, valid_for_end
       FROM tmf_customer_facing_service
       ORDER BY name, id`,
    );
    return rows.map((row) => this.mapCustomerFacingService(row)).filter((service) => filterService(service, query));
  }

  private listResourceFacingServicesDirect(query?: ServiceQuery): ResourceFacingService[] {
    const rows = this.db.all<any>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
              service_relationships, characteristics, valid_for_start, valid_for_end
       FROM tmf_resource_facing_service
       ORDER BY name, id`,
    );
    return rows.map((row) => this.mapResourceFacingService(row)).filter((service) => filterService(service, query));
  }

  private mapServiceSpecification(row: {
    id: string;
    href: string;
    name: string;
    category: string;
    service_type: 'CFS' | 'RFS' | 'Other';
    description?: string | null;
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
  }): ServiceSpecification {
    const spec: ServiceSpecification = {
      '@type': 'ServiceSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      category: row.category,
      serviceType: row.service_type,
      serviceSpecificationCharacteristic: JSON.parse(row.characteristics || '[]') as ServiceSpecification['serviceSpecificationCharacteristic'],
      relatedParty: [],
    };

    if (row.description) spec.description = row.description;
    if (row.valid_for_start || row.valid_for_end) {
      spec.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return spec;
  }

  private mapServiceCategory(row: {
    id: string;
    href: string;
    name: string;
    description?: string | null;
    parent_category_id?: string | null;
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
  }): ServiceCategory {
    const category: ServiceCategory = {
      '@type': 'ServiceCategory',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceCategoryCharacteristic: JSON.parse(row.characteristics || '[]') as ServiceCategory['serviceCategoryCharacteristic'],
    };

    if (row.description) category.description = row.description;
    if (row.parent_category_id) category.parentServiceCategory = { id: row.parent_category_id, '@referredType': 'ServiceCategory' };
    if (row.valid_for_start || row.valid_for_end) {
      category.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return category;
  }

  private mapServiceCandidate(row: {
    id: string;
    href: string;
    name: string;
    description?: string | null;
    service_specification_id: string;
    service_category_id?: string | null;
    status: 'active' | 'inactive' | 'terminated';
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    characteristics?: string | null;
  }): ServiceCandidate {
    const candidate: ServiceCandidate = {
      '@type': 'ServiceCandidate',
      id: row.id,
      href: row.href,
      name: row.name,
      status: row.status,
      serviceSpecification: { id: row.service_specification_id, '@referredType': 'ServiceSpecification' },
      serviceCandidateCharacteristic: JSON.parse(row.characteristics || '[]') as ServiceCandidate['serviceCandidateCharacteristic'],
    };

    if (row.description) candidate.description = row.description;
    if (row.service_category_id) candidate.serviceCategory = { id: row.service_category_id, '@referredType': 'ServiceCategory' };
    if (row.valid_for_start || row.valid_for_end) {
      candidate.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return candidate;
  }

  private mapCustomerFacingService(row: any): CustomerFacingService {
    return {
      '@type': 'CustomerFacingService',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceSpecificationId: row.service_specification_id,
      serviceSpecification: { id: row.service_specification_id, '@referredType': 'ServiceSpecification' },
      serviceType: row.service_type ?? undefined,
      category: row.category ?? undefined,
      state: normalizeState(row.state ?? row.status),
      serviceDate: row.service_date ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      isServiceEnabled: intToBoolean(row.is_service_enabled),
      hasStarted: intToBoolean(row.has_started),
      subscriberId: row.subscriber_id,
      supportingService: parseServiceRefs(row.supporting_services, row.supporting_resource_facing_service_id),
      relatedParty: JSON.parse(row.related_party || '[]'),
      place: JSON.parse(row.place || '[]'),
      serviceRelationship: parseServiceRelationships(row.service_relationships),
      serviceCharacteristic: JSON.parse(row.characteristics || '[]'),
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    };
  }

  private mapResourceFacingService(row: any): ResourceFacingService {
    return {
      '@type': 'ResourceFacingService',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceSpecificationId: row.service_specification_id,
      serviceSpecification: { id: row.service_specification_id, '@referredType': 'ServiceSpecification' },
      serviceType: row.service_type ?? undefined,
      category: row.category ?? undefined,
      state: normalizeState(row.state ?? row.status),
      serviceDate: row.service_date ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      isServiceEnabled: intToBoolean(row.is_service_enabled),
      hasStarted: intToBoolean(row.has_started),
      supportingResource: parseServiceRefs(row.supporting_resources, row.supporting_resource_id),
      supportingService: parseServiceRefs(row.supporting_services, row.supporting_resource_facing_service_id),
      relatedParty: JSON.parse(row.related_party || '[]'),
      place: JSON.parse(row.place || '[]'),
      serviceRelationship: parseServiceRelationships(row.service_relationships),
      serviceCharacteristic: JSON.parse(row.characteristics || '[]'),
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    };
  }
}

const parseServiceRefs = (jsonValue: string | null | undefined, fallbackId?: string | null): ServiceReference[] => {
  if (jsonValue) {
    const parsed = JSON.parse(jsonValue) as Array<ServiceReference>;
    return parsed.map((item) => ({ ...item }));
  }

  if (fallbackId) {
    return [{ id: fallbackId, '@referredType': 'Service' }];
  }

  return [];
};

const parseServiceRelationships = (jsonValue: string | null | undefined): ServiceRelationship[] => {
  if (!jsonValue) return [];
  return (JSON.parse(jsonValue) as ServiceRelationship[]).map((item) => ({ ...item }));
};

const filterService = (service: Service, query?: ServiceQuery): boolean => {
  if (!query) return true;
  if (query.name && !service.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.state && service.state !== query.state) return false;
  if (query.serviceSpecificationId && service.serviceSpecificationId !== query.serviceSpecificationId) return false;
  if (query.relatedPartyId && !service.relatedParty.some((item) => item.id === query.relatedPartyId)) return false;
  if (query.placeId && !service.place.some((item) => item.id === query.placeId)) return false;
  if (query.supportingServiceId && !getSupportingServices(service).some((item) => item.id === query.supportingServiceId)) return false;
  if (query.supportingResourceId && !getSupportingResources(service).some((item) => item.id === query.supportingResourceId)) return false;
  if (query.subscriberId) {
    if (service['@type'] !== 'CustomerFacingService' || service.subscriberId !== query.subscriberId) return false;
  }
  if (query.characteristicName) {
    const value = getCharacteristicValue(service.serviceCharacteristic, query.characteristicName);
    if (value === undefined) return false;
    if (query.characteristicValue !== undefined && String(value) !== query.characteristicValue) return false;
  }
  return true;
};

const getSupportingServices = (service: Service): ServiceReference[] =>
  service['@type'] === 'CustomerFacingService' ? service.supportingService : service.supportingService;

const getSupportingResources = (service: Service): ServiceReference[] =>
  service['@type'] === 'ResourceFacingService' ? service.supportingResource : [];

const getCharacteristicValue = (items: Array<{ name: string; value: unknown }>, name: string): unknown => {
  const item = items.find((entry) => entry.name === name);
  return item?.value;
};

const normalizeState = (state?: string): any => {
  if (
    state === 'feasibilityChecked' ||
    state === 'designed' ||
    state === 'reserved' ||
    state === 'inactive' ||
    state === 'active' ||
    state === 'terminated'
  ) {
    return state;
  }
  if (state === 'suspended') return 'inactive';
  return 'active';
};

const booleanToInt = (value: boolean | undefined): number | null => {
  if (value === undefined) return null;
  return value ? 1 : 0;
};

const intToBoolean = (value: number | null | undefined): boolean | undefined => {
  if (value === null || value === undefined) return undefined;
  return value === 1;
};
