import type { DatabaseClient } from '../../shared/persistence/database-client.js';
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
  ServiceState,
} from './domain.js';
import type {
  IServiceRepository,
  ServiceTenantScope,
} from './service-repository-interface.js';
import type {
  CustomerFacingServiceRow,
  ResourceFacingServiceRow,
  ServiceCandidateRow,
  ServiceCategoryRow,
  ServiceSpecificationRow,
} from './rows.js';

export class PostgresServiceRepository implements IServiceRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public async upsertServiceSpecification(
    spec: ServiceSpecification,
  ): Promise<ServiceSpecification> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_service_specification
       (id, href, name, category, service_type, description, observation, valid_for_start, valid_for_end, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       category = excluded.category,
       service_type = excluded.service_type,
       description = excluded.description,
       observation = excluded.observation,
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
        spec.observation ?? null,
        spec.validFor?.startDateTime ?? null,
        spec.validFor?.endDateTime ?? null,
        JSON.stringify(spec.serviceSpecificationCharacteristic),
        spec.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getServiceSpecification(spec.id)) ?? spec;
  }

  public async getServiceSpecification(
    id: string,
    scope?: ServiceTenantScope,
  ): Promise<ServiceSpecification | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<ServiceSpecificationRow>(
      `SELECT id, href, name, category, service_type, description, observation, valid_for_start, valid_for_end, characteristics, tenant_id
       FROM tmf_service_specification
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapServiceSpecification(row) : undefined;
  }

  public async listServiceSpecifications(
    query?: ServiceSpecificationQuery,
  ): Promise<ServiceSpecification[]> {
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
    if (!query?.includeEnded) {
      conditions.push('valid_for_end IS NULL');
    }
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, category, service_type, description, observation, valid_for_start, valid_for_end, characteristics, tenant_id FROM tmf_service_specification',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY category, name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = await this.db.all<ServiceSpecificationRow>(sql, params);
    return rows.map((row) => this.mapServiceSpecification(row));
  }

  public async upsertServiceCategory(category: ServiceCategory): Promise<ServiceCategory> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_service_category
       (id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        category.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getServiceCategory(category.id)) ?? category;
  }

  public async getServiceCategory(
    id: string,
    scope?: ServiceTenantScope,
  ): Promise<ServiceCategory | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<ServiceCategoryRow>(
      `SELECT id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics, tenant_id
       FROM tmf_service_category
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapServiceCategory(row) : undefined;
  }

  public async listServiceCategories(query?: ServiceCategoryQuery): Promise<ServiceCategory[]> {
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
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, description, parent_category_id, valid_for_start, valid_for_end, characteristics, tenant_id FROM tmf_service_category',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = await this.db.all<ServiceCategoryRow>(sql, params);
    return rows.map((row) => this.mapServiceCategory(row));
  }

  public async upsertServiceCandidate(candidate: ServiceCandidate): Promise<ServiceCandidate> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_service_candidate
       (id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        candidate.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getServiceCandidate(candidate.id)) ?? candidate;
  }

  public async getServiceCandidate(
    id: string,
    scope?: ServiceTenantScope,
  ): Promise<ServiceCandidate | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<ServiceCandidateRow>(
      `SELECT id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics, tenant_id
       FROM tmf_service_candidate
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapServiceCandidate(row) : undefined;
  }

  public async listServiceCandidates(query?: ServiceCandidateQuery): Promise<ServiceCandidate[]> {
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
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, description, service_specification_id, service_category_id, status, valid_for_start, valid_for_end, characteristics, tenant_id FROM tmf_service_candidate',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = await this.db.all<ServiceCandidateRow>(sql, params);
    return rows.map((row) => this.mapServiceCandidate(row));
  }

  public async upsertCustomerFacingService(
    service: CustomerFacingService,
  ): Promise<CustomerFacingService> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_customer_facing_service
       (id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
        is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
        supporting_services, service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        service.state === 'terminated'
          ? 'terminated'
          : service.state === 'inactive'
            ? 'inactive'
            : 'active',
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
        service.tenantId ?? 'default',
        service.validFor?.startDateTime ?? null,
        service.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return (await this.getCustomerFacingService(service.id)) ?? service;
  }

  public async getCustomerFacingService(
    id: string,
    scope?: ServiceTenantScope,
  ): Promise<CustomerFacingService | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<CustomerFacingServiceRow>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
              supporting_services, service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
       FROM tmf_customer_facing_service
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapCustomerFacingService(row) : undefined;
  }

  public async listCustomerFacingServices(query?: ServiceQuery): Promise<CustomerFacingService[]> {
    return (await this.listServices(query)).filter(
      (service): service is CustomerFacingService => service['@type'] === 'CustomerFacingService',
    );
  }

  public async upsertResourceFacingService(
    service: ResourceFacingService,
  ): Promise<ResourceFacingService> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_facing_service
       (id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
        is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
        service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        service.state === 'terminated'
          ? 'terminated'
          : service.state === 'inactive'
            ? 'inactive'
            : 'active',
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
        service.tenantId ?? 'default',
        service.validFor?.startDateTime ?? null,
        service.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return (await this.getResourceFacingService(service.id)) ?? service;
  }

  public async getResourceFacingService(
    id: string,
    scope?: ServiceTenantScope,
  ): Promise<ResourceFacingService | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<ResourceFacingServiceRow>(
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
              service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
       FROM tmf_resource_facing_service
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row ? this.mapResourceFacingService(row) : undefined;
  }

  public async listResourceFacingServices(query?: ServiceQuery): Promise<ResourceFacingService[]> {
    return (await this.listServices(query)).filter(
      (service): service is ResourceFacingService => service['@type'] === 'ResourceFacingService',
    );
  }

  public async listServices(query?: ServiceQuery): Promise<Service[]> {
    if (query?.type === 'CustomerFacingService') {
      return await this.listCustomerFacingServicesDirect(query);
    }

    if (query?.type === 'ResourceFacingService') {
      return await this.listResourceFacingServicesDirect(query);
    }

    return [
      ...(await this.listCustomerFacingServicesDirect(query)),
      ...(await this.listResourceFacingServicesDirect(query)),
    ];
  }

  // Sem isso, cada fetch de página (limit=20) varria a tabela inteira e paginava em JS — o mesmo
  // anti-padrão que tornava /v1/resource/workspace lento, só que aqui nem existia LIMIT no SQL.
  // placeId/characteristic/supporting* continuam sendo JSON-embutidos, então só dá pra filtrar em
  // JS — quando algum deles é pedido, cai pro caminho antigo (varredura completa) por segurança.
  private async listCustomerFacingServicesDirect(
    query?: ServiceQuery,
  ): Promise<CustomerFacingService[]> {
    if (hasComplexServiceFilter(query)) {
      const rows = await this.db.all<CustomerFacingServiceRow>(
        `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
                is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
                supporting_services, service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
         FROM tmf_customer_facing_service
         ORDER BY name, id`,
      );
      return rows
        .map((row) => this.mapCustomerFacingService(row))
        .filter((service) => filterService(service, query));
    }

    const { conditions, params } = buildServiceConditions(query, {
      subscriberIdColumn: 'subscriber_id',
    });
    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, subscriber_id, supporting_resource_facing_service_id, place, related_party,
              supporting_services, service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
       FROM tmf_customer_facing_service`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    const rows = await this.db.all<CustomerFacingServiceRow>(sql, params);
    return rows.map((row) => this.mapCustomerFacingService(row));
  }

  private async listResourceFacingServicesDirect(
    query?: ServiceQuery,
  ): Promise<ResourceFacingService[]> {
    if (hasComplexServiceFilter(query)) {
      const rows = await this.db.all<ResourceFacingServiceRow>(
        `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
                is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
                service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
         FROM tmf_resource_facing_service
         ORDER BY name, id`,
      );
      return rows
        .map((row) => this.mapResourceFacingService(row))
        .filter((service) => filterService(service, query));
    }

    const { conditions, params } = buildServiceConditions(query);
    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT id, href, name, service_specification_id, status, state, service_type, category, service_date, start_date, end_date,
              is_service_enabled, has_started, supporting_resource_id, place, related_party, supporting_resources, supporting_services,
              service_relationships, characteristics, tenant_id, valid_for_start, valid_for_end
       FROM tmf_resource_facing_service`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    if (hasLimit) params.push(query!.limit as number);
    if (hasOffset) params.push(query!.offset as number);

    const rows = await this.db.all<ResourceFacingServiceRow>(sql, params);
    return rows.map((row) => this.mapResourceFacingService(row));
  }

  public async countCustomerFacingServices(query?: ServiceQuery): Promise<number> {
    if (hasComplexServiceFilter(query))
      return (await this.listCustomerFacingServicesDirect(query)).length;
    const { conditions, params } = buildServiceConditions(query, {
      subscriberIdColumn: 'subscriber_id',
    });
    const sql = [
      'SELECT COUNT(*) as count FROM tmf_customer_facing_service',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    const row = await this.db.get<{ count: number }>(sql, params);
    return Number(row?.count ?? 0);
  }

  public async countResourceFacingServices(query?: ServiceQuery): Promise<number> {
    if (hasComplexServiceFilter(query))
      return (await this.listResourceFacingServicesDirect(query)).length;
    const { conditions, params } = buildServiceConditions(query);
    const sql = [
      'SELECT COUNT(*) as count FROM tmf_resource_facing_service',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    const row = await this.db.get<{ count: number }>(sql, params);
    return Number(row?.count ?? 0);
  }

  public async countServices(query?: ServiceQuery): Promise<number> {
    if (query?.type === 'CustomerFacingService')
      return await this.countCustomerFacingServices(query);
    if (query?.type === 'ResourceFacingService')
      return await this.countResourceFacingServices(query);
    return (
      (await this.countCustomerFacingServices(query)) +
      (await this.countResourceFacingServices(query))
    );
  }

  private mapServiceSpecification(row: ServiceSpecificationRow): ServiceSpecification {
    const spec: ServiceSpecification = {
      '@type': 'ServiceSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      category: row.category,
      serviceType: row.service_type,
      serviceSpecificationCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ServiceSpecification['serviceSpecificationCharacteristic'],
      relatedParty: [],
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.description) spec.description = row.description;
    if (row.observation) spec.observation = row.observation;
    if (row.valid_for_start || row.valid_for_end) {
      spec.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return spec;
  }

  private mapServiceCategory(row: ServiceCategoryRow): ServiceCategory {
    const category: ServiceCategory = {
      '@type': 'ServiceCategory',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceCategoryCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ServiceCategory['serviceCategoryCharacteristic'],
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.description) category.description = row.description;
    if (row.parent_category_id)
      category.parentServiceCategory = {
        id: row.parent_category_id,
        '@referredType': 'ServiceCategory',
      };
    if (row.valid_for_start || row.valid_for_end) {
      category.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return category;
  }

  private mapServiceCandidate(row: ServiceCandidateRow): ServiceCandidate {
    const candidate: ServiceCandidate = {
      '@type': 'ServiceCandidate',
      id: row.id,
      href: row.href,
      name: row.name,
      status: row.status,
      serviceSpecification: {
        id: row.service_specification_id,
        '@referredType': 'ServiceSpecification',
      },
      serviceCandidateCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ServiceCandidate['serviceCandidateCharacteristic'],
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.description) candidate.description = row.description;
    if (row.service_category_id)
      candidate.serviceCategory = {
        id: row.service_category_id,
        '@referredType': 'ServiceCategory',
      };
    if (row.valid_for_start || row.valid_for_end) {
      candidate.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }
    return candidate;
  }

  private mapCustomerFacingService(row: CustomerFacingServiceRow): CustomerFacingService {
    return {
      '@type': 'CustomerFacingService',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceSpecificationId: row.service_specification_id,
      serviceSpecification: {
        id: row.service_specification_id,
        '@referredType': 'ServiceSpecification',
      },
      serviceType: row.service_type ?? undefined,
      category: row.category ?? undefined,
      state: normalizeState(row.state ?? row.status),
      serviceDate: row.service_date ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      isServiceEnabled: intToBoolean(row.is_service_enabled),
      hasStarted: intToBoolean(row.has_started),
      subscriberId: row.subscriber_id,
      supportingService: parseServiceRefs(
        row.supporting_services,
        row.supporting_resource_facing_service_id,
      ),
      relatedParty: JSON.parse(row.related_party || '[]'),
      place: JSON.parse(row.place || '[]'),
      serviceRelationship: parseServiceRelationships(row.service_relationships),
      serviceCharacteristic: JSON.parse(row.characteristics || '[]'),
      tenantId: row.tenant_id ?? 'default',
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

  private mapResourceFacingService(row: ResourceFacingServiceRow): ResourceFacingService {
    return {
      '@type': 'ResourceFacingService',
      id: row.id,
      href: row.href,
      name: row.name,
      serviceSpecificationId: row.service_specification_id,
      serviceSpecification: {
        id: row.service_specification_id,
        '@referredType': 'ServiceSpecification',
      },
      serviceType: row.service_type ?? undefined,
      category: row.category ?? undefined,
      state: normalizeState(row.state ?? row.status),
      serviceDate: row.service_date ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      isServiceEnabled: intToBoolean(row.is_service_enabled),
      hasStarted: intToBoolean(row.has_started),
      supportingResource: parseServiceRefs(row.supporting_resources, row.supporting_resource_id),
      // Sem fallback: `supporting_resource_facing_service_id` e coluna do CFS e nunca foi trazida
      // pelo SELECT do RFS — o argumento anterior era sempre undefined.
      supportingService: parseServiceRefs(row.supporting_services),
      relatedParty: JSON.parse(row.related_party || '[]'),
      place: JSON.parse(row.place || '[]'),
      serviceRelationship: parseServiceRelationships(row.service_relationships),
      serviceCharacteristic: JSON.parse(row.characteristics || '[]'),
      tenantId: row.tenant_id ?? 'default',
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

const parseServiceRefs = (
  jsonValue: string | null | undefined,
  fallbackId?: string | null,
): ServiceReference[] => {
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

// placeId/characteristic*/supporting*/relatedPartyId vivem em colunas JSON — não dá pra filtrar
// em SQL sem json_extract por item de array, então esses forçam o fallback de varredura completa.
const hasComplexServiceFilter = (query?: ServiceQuery): boolean =>
  Boolean(
    query &&
    (query.relatedPartyId ||
      query.placeId ||
      query.supportingResourceId ||
      query.supportingServiceId ||
      query.characteristicName),
  );

const buildServiceConditions = (
  query?: ServiceQuery,
  options?: { subscriberIdColumn?: string },
): { conditions: string[]; params: Array<string | number> } => {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (query?.name) {
    conditions.push('LOWER(name) LIKE LOWER(?)');
    params.push(`%${query.name}%`);
  }
  if (query?.state) {
    conditions.push('state = ?');
    params.push(query.state);
  }
  if (query?.serviceSpecificationIdIn && query.serviceSpecificationIdIn.length > 0) {
    conditions.push(
      `service_specification_id IN (${query.serviceSpecificationIdIn.map(() => '?').join(', ')})`,
    );
    params.push(...query.serviceSpecificationIdIn);
  } else if (query?.serviceSpecificationId) {
    conditions.push('service_specification_id = ?');
    params.push(query.serviceSpecificationId);
  }
  if (query?.category) {
    conditions.push('category = ?');
    params.push(query.category);
  }
  if (options?.subscriberIdColumn && query?.subscriberId) {
    conditions.push(`${options.subscriberIdColumn} = ?`);
    params.push(query.subscriberId);
  }
  if (query?.tenantId) {
    conditions.push('tenant_id = ?');
    params.push(query.tenantId);
  }

  return { conditions, params };
};

const filterService = (service: Service, query?: ServiceQuery): boolean => {
  if (!query) return true;
  if (query.tenantId && (service.tenantId ?? 'default') !== query.tenantId) return false;
  if (query.name && !service.name.toLowerCase().includes(query.name.toLowerCase())) return false;
  if (query.state && service.state !== query.state) return false;
  if (query.serviceSpecificationIdIn && query.serviceSpecificationIdIn.length > 0) {
    if (!query.serviceSpecificationIdIn.includes(service.serviceSpecificationId)) return false;
  } else if (
    query.serviceSpecificationId &&
    service.serviceSpecificationId !== query.serviceSpecificationId
  ) {
    return false;
  }
  if (query.category && service.category !== query.category) return false;
  if (
    query.relatedPartyId &&
    !service.relatedParty.some((item) => item.id === query.relatedPartyId)
  )
    return false;
  if (query.placeId && !service.place.some((item) => item.id === query.placeId)) return false;
  if (
    query.supportingServiceId &&
    !getSupportingServices(service).some((item) => item.id === query.supportingServiceId)
  )
    return false;
  if (
    query.supportingResourceId &&
    !getSupportingResources(service).some((item) => item.id === query.supportingResourceId)
  )
    return false;
  if (query.subscriberId) {
    if (service['@type'] !== 'CustomerFacingService' || service.subscriberId !== query.subscriberId)
      return false;
  }
  if (query.characteristicName) {
    const value = getCharacteristicValue(service.serviceCharacteristic, query.characteristicName);
    if (value === undefined) return false;
    if (query.characteristicValue !== undefined && String(value) !== query.characteristicValue)
      return false;
  }
  return true;
};

const getSupportingServices = (service: Service): ServiceReference[] =>
  service['@type'] === 'CustomerFacingService'
    ? service.supportingService
    : service.supportingService;

const getSupportingResources = (service: Service): ServiceReference[] =>
  service['@type'] === 'ResourceFacingService' ? service.supportingResource : [];

const getCharacteristicValue = (
  items: Array<{ name: string; value: unknown }>,
  name: string,
): unknown => {
  const item = items.find((entry) => entry.name === name);
  return item?.value;
};

const normalizeState = (state?: string | null): ServiceState => {
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
