import { SqliteDatabase } from '../../shared/persistence/sqlite-database.js';
import type {
  LogicalResource,
  PhysicalResource,
  ResourceCategory,
  Resource,
  ResourceFunctionSpecification,
  ResourceFunctionSpecificationQuery,
  ResourceQuery,
  ResourceRelationship,
  ResourceType,
  ResourceSpecification,
  ResourceSpecificationQuery,
} from './domain.js';
import type { IResourceRepository } from './resource-repository-interface.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES } from './catalog.js';

export class SqliteResourceRepository implements IResourceRepository {
  public constructor(private readonly db: SqliteDatabase) {
    this.seedResourceCatalog();
  }

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  private seedResourceCatalog(): void {
    const now = new Date().toISOString();
    this.db.run('DELETE FROM tmf_resource_type');
    this.db.run('DELETE FROM tmf_resource_category');
    for (const category of RESOURCE_CATEGORIES) {
      this.db.run(
        `INSERT INTO tmf_resource_category (id, href, code, name, parent_category_code, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
         href = excluded.href,
         name = excluded.name,
         parent_category_code = excluded.parent_category_code,
         description = excluded.description,
         status = excluded.status,
         updated_at = excluded.updated_at`,
        [
          category.id,
          category.href,
          category.code,
          category.name,
          category.parentCategoryCode ?? null,
          category.description ?? null,
          category.status,
          now,
          now,
        ],
      );
    }

    for (const type of RESOURCE_TYPES) {
      this.db.run(
        `INSERT INTO tmf_resource_type (id, href, code, name, category_code, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
         href = excluded.href,
         name = excluded.name,
         category_code = excluded.category_code,
         description = excluded.description,
         status = excluded.status,
         updated_at = excluded.updated_at`,
        [
          type.id,
          type.href,
          type.code,
          type.name,
          type.categoryCode,
          type.description ?? null,
          type.status,
          now,
          now,
        ],
      );
    }
  }

  public getResourceCategory(code: string): ResourceCategory | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      code: string;
      name: string;
      parent_category_code?: string | null;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, href, code, name, parent_category_code, description, status
       FROM tmf_resource_category
       WHERE code = ?`,
      [code],
    );

    return row ? this.mapResourceCategory(row) : undefined;
  }

  public listResourceCategories(): ResourceCategory[] {
    const rows = this.db.all<{
      id: string;
      href: string;
      code: string;
      name: string;
      parent_category_code?: string | null;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, href, code, name, parent_category_code, description, status
       FROM tmf_resource_category
       ORDER BY code`,
    );
    return rows.map((row) => this.mapResourceCategory(row));
  }

  public getResourceType(code: string): ResourceType | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      code: string;
      name: string;
      category_code: string;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, href, code, name, category_code, description, status
       FROM tmf_resource_type
       WHERE code = ?`,
      [code],
    );

    return row ? this.mapResourceType(row) : undefined;
  }

  public listResourceTypes(): ResourceType[] {
    const rows = this.db.all<{
      id: string;
      href: string;
      code: string;
      name: string;
      category_code: string;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, href, code, name, category_code, description, status
       FROM tmf_resource_type
       ORDER BY category_code, code`,
    );
    return rows.map((row) => this.mapResourceType(row));
  }

  public upsertResourceSpecification(spec: ResourceSpecification): ResourceSpecification {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_resource_specification
       (id, href, name, category, resource_type, description, valid_for_start, valid_for_end, related_party, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       category = excluded.category,
       resource_type = excluded.resource_type,
       description = excluded.description,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.href,
        spec.name,
        spec.category,
        spec.resourceType,
        spec.description ?? null,
        spec.validFor?.startDateTime ?? null,
        spec.validFor?.endDateTime ?? null,
        JSON.stringify(spec.relatedParty),
        JSON.stringify(spec.resourceSpecificationCharacteristic),
        now,
        now,
      ],
    );

    return this.getResourceSpecification(spec.id) ?? spec;
  }

  public getResourceSpecification(id: string): ResourceSpecification | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      category: string;
      resource_type: string;
      description?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      related_party?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, category, resource_type, description, valid_for_start, valid_for_end, related_party, characteristics
       FROM tmf_resource_specification
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapSpec(row) : undefined;
  }

  public listResourceSpecifications(query?: ResourceSpecificationQuery): ResourceSpecification[] {
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
    if (query?.resourceType) {
      conditions.push('resource_type = ?');
      params.push(query.resourceType);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, category, resource_type, description, valid_for_start, valid_for_end, related_party, characteristics FROM tmf_resource_specification',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY category, name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<{
      id: string;
      href: string;
      name: string;
      category: string;
      resource_type: string;
      description?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      related_party?: string | null;
      characteristics?: string | null;
    }>(sql, params);

    return rows.map((row) => this.mapSpec(row));
  }

  public upsertResourceFunctionSpecification(spec: ResourceFunctionSpecification): ResourceFunctionSpecification {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_resource_function_specification
       (id, href, name, description, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       description = excluded.description,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.href,
        spec.name,
        spec.description ?? null,
        JSON.stringify(spec.resourceFunctionSpecificationCharacteristic),
        now,
        now,
      ],
    );

    return this.getResourceFunctionSpecification(spec.id) ?? spec;
  }

  public getResourceFunctionSpecification(id: string): ResourceFunctionSpecification | undefined {
    const row = this.db.get<{
      id: string;
      href: string;
      name: string;
      description?: string | null;
      characteristics?: string | null;
    }>(
      `SELECT id, href, name, description, characteristics
       FROM tmf_resource_function_specification
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapFunctionSpec(row) : undefined;
  }

  public listResourceFunctionSpecifications(query?: ResourceFunctionSpecificationQuery): ResourceFunctionSpecification[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, description, characteristics FROM tmf_resource_function_specification',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      'ORDER BY name, id',
      hasLimit ? 'LIMIT ?' : hasOffset ? 'LIMIT -1' : '',
      hasOffset ? 'OFFSET ?' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (hasLimit) params.push(query.limit as number);
    if (hasOffset) params.push(query.offset as number);

    const rows = this.db.all<{
      id: string;
      href: string;
      name: string;
      description?: string | null;
      characteristics?: string | null;
    }>(sql, params);

    return rows.map((row) => this.mapFunctionSpec(row));
  }

  public upsertPhysicalResource(resource: PhysicalResource): PhysicalResource {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_physical_resource
       (id, href, name, resource_specification_id, resource_type, status,
        place_id, place_type, administrative_state, operational_state, usage_state,
        manufacturer, model, serial_number, part_number, valid_for_start, valid_for_end,
        related_party, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
       resource_type = excluded.resource_type,
       status = excluded.status,
       place_id = excluded.place_id,
       place_type = excluded.place_type,
       administrative_state = excluded.administrative_state,
       operational_state = excluded.operational_state,
       usage_state = excluded.usage_state,
       manufacturer = excluded.manufacturer,
       model = excluded.model,
       serial_number = excluded.serial_number,
       part_number = excluded.part_number,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        resource.id,
        resource.href,
        resource.name,
        resource.resourceSpecificationId,
        resource.resourceType,
        resource.status,
        resource.place?.id ?? null,
        resource.place?.['@referredType'] ?? null,
        resource.administrativeState,
        resource.operationalState,
        resource.usageState,
        resource.manufacturer ?? null,
        resource.model ?? null,
        resource.serialNumber ?? null,
        resource.partNumber ?? null,
        resource.validFor?.startDateTime ?? null,
        resource.validFor?.endDateTime ?? null,
        JSON.stringify(resource.relatedParty),
        JSON.stringify(resource.characteristic),
        now,
        now,
      ],
    );

    return this.getPhysicalResource(resource.id) ?? resource;
  }

  public getPhysicalResource(id: string): PhysicalResource | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, resource_specification_id, resource_type, status,
              place_id, place_type, administrative_state, operational_state, usage_state,
              manufacturer, model, serial_number, part_number, valid_for_start, valid_for_end,
              related_party, characteristics
       FROM tmf_physical_resource
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapPhysicalResource(row) : undefined;
  }

  public listPhysicalResources(query?: ResourceQuery): PhysicalResource[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query?.resourceSpecificationId) {
      conditions.push('resource_specification_id = ?');
      params.push(query.resourceSpecificationId);
    }
    if (query?.placeId) {
      conditions.push('place_id = ?');
      params.push(query.placeId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, resource_specification_id, resource_type, status, place_id, place_type, administrative_state, operational_state, usage_state, manufacturer, model, serial_number, part_number, valid_for_start, valid_for_end, related_party, characteristics FROM tmf_physical_resource',
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
    return rows.map((row) => this.mapPhysicalResource(row));
  }

  public upsertLogicalResource(resource: LogicalResource): LogicalResource {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO tmf_logical_resource
       (id, href, name, resource_specification_id, resource_type, status,
        place_id, place_type, supporting_physical_resource_id,
        administrative_state, operational_state, usage_state,
        related_party, characteristics, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
       resource_type = excluded.resource_type,
       status = excluded.status,
       place_id = excluded.place_id,
       place_type = excluded.place_type,
       supporting_physical_resource_id = excluded.supporting_physical_resource_id,
       administrative_state = excluded.administrative_state,
       operational_state = excluded.operational_state,
       usage_state = excluded.usage_state,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       updated_at = excluded.updated_at`,
      [
        resource.id,
        resource.href,
        resource.name,
        resource.resourceSpecificationId,
        resource.resourceType,
        resource.status,
        resource.place?.id ?? null,
        resource.place?.['@referredType'] ?? null,
        resource.supportingPhysicalResourceId ?? null,
        resource.administrativeState,
        resource.operationalState,
        resource.usageState,
        JSON.stringify(resource.relatedParty),
        JSON.stringify(resource.characteristic),
        resource.validFor?.startDateTime ?? null,
        resource.validFor?.endDateTime ?? null,
        now,
        now,
      ],
    );

    return this.getLogicalResource(resource.id) ?? resource;
  }

  public getLogicalResource(id: string): LogicalResource | undefined {
    const row = this.db.get<any>(
      `SELECT id, href, name, resource_specification_id, resource_type, status, place_id, place_type,
              supporting_physical_resource_id, administrative_state, operational_state, usage_state,
              related_party, characteristics, valid_for_start, valid_for_end
       FROM tmf_logical_resource
       WHERE id = ?`,
      [id],
    );

    return row ? this.mapLogicalResource(row) : undefined;
  }

  public listLogicalResources(query?: ResourceQuery): LogicalResource[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.name) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${query.name}%`);
    }
    if (query?.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query?.resourceSpecificationId) {
      conditions.push('resource_specification_id = ?');
      params.push(query.resourceSpecificationId);
    }
    if (query?.placeId) {
      conditions.push('place_id = ?');
      params.push(query.placeId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, href, name, resource_specification_id, resource_type, status, place_id, place_type, supporting_physical_resource_id, administrative_state, operational_state, usage_state, related_party, characteristics, valid_for_start, valid_for_end FROM tmf_logical_resource',
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
    return rows.map((row) => this.mapLogicalResource(row));
  }

  public upsertResourceRelationship(resourceId: string, relationship: ResourceRelationship): ResourceRelationship {
    this.db.run(
      `INSERT INTO tmf_resource_relationship
       (resource_from_id, resource_to_id, relationship_type, valid_for_start, valid_for_end)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(resource_from_id, resource_to_id, relationship_type) DO UPDATE SET
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end`,
      [
        resourceId,
        relationship.id,
        relationship.relationshipType,
        relationship.validFor?.startDateTime ?? null,
        relationship.validFor?.endDateTime ?? null,
      ],
    );

    return relationship;
  }

  public deleteResourceRelationship(resourceId: string, relatedResourceId: string, relationshipType: string): boolean {
    const result = this.db.run(
      `DELETE FROM tmf_resource_relationship
       WHERE resource_from_id = ? AND resource_to_id = ? AND relationship_type = ?`,
      [resourceId, relatedResourceId, relationshipType],
    );
    return result.changes > 0;
  }

  public listResourceRelationships(resourceId: string): ResourceRelationship[] {
    const rows = this.db.all<{
      resource_to_id: string;
      relationship_type: string;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
    }>(
      `SELECT resource_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_resource_relationship
       WHERE resource_from_id = ?
       ORDER BY relationship_type, resource_to_id`,
      [resourceId],
    );

    return rows.map((row) => ({
      id: row.resource_to_id,
      relationshipType: row.relationship_type,
      '@referredType': 'Resource',
      ...(row.valid_for_start || row.valid_for_end
        ? {
            validFor: {
              ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
              ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
            },
          }
        : {}),
    }));
  }

  public listResources(query?: ResourceQuery): Resource[] {
    if (query?.kind === 'PhysicalResource') {
      return this.listPhysicalResources(query);
    }

    if (query?.kind === 'LogicalResource') {
      return this.listLogicalResources(query);
    }

    return [...this.listPhysicalResources(query), ...this.listLogicalResources(query)];
  }

  private mapSpec(row: {
    id: string;
    href: string;
    name: string;
    category: string;
    resource_type: string;
    description?: string | null;
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    related_party?: string | null;
    characteristics?: string | null;
  }): ResourceSpecification {
    const spec: ResourceSpecification = {
      '@type': 'ResourceSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      category: row.category,
      resourceType: row.resource_type,
      resourceSpecificationCharacteristic: JSON.parse(row.characteristics || '[]') as ResourceSpecification['resourceSpecificationCharacteristic'],
      relatedParty: JSON.parse(row.related_party || '[]') as ResourceSpecification['relatedParty'],
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

  private mapResourceCategory(row: {
    id: string;
    href: string;
    code: string;
    name: string;
    parent_category_code?: string | null;
    description?: string | null;
    status: 'active' | 'inactive';
  }): ResourceCategory {
    return {
      '@type': 'ResourceCategory',
      id: row.id,
      href: row.href,
      code: row.code,
      name: row.name,
      ...(row.parent_category_code ? { parentCategoryCode: row.parent_category_code } : {}),
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
    };
  }

  private mapResourceType(row: {
    id: string;
    href: string;
    code: string;
    name: string;
    category_code: string;
    description?: string | null;
    status: 'active' | 'inactive';
  }): ResourceType {
    return {
      '@type': 'ResourceType',
      id: row.id,
      href: row.href,
      code: row.code,
      name: row.name,
      categoryCode: row.category_code,
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
    };
  }

  private mapFunctionSpec(row: {
    id: string;
    href: string;
    name: string;
    description?: string | null;
    characteristics?: string | null;
  }): ResourceFunctionSpecification {
    const spec: ResourceFunctionSpecification = {
      '@type': 'ResourceFunctionSpecification',
      id: row.id,
      href: row.href,
      name: row.name,
      resourceFunctionSpecificationCharacteristic: JSON.parse(row.characteristics || '[]') as ResourceFunctionSpecification['resourceFunctionSpecificationCharacteristic'],
    };

    if (row.description) spec.description = row.description;
    return spec;
  }

  private mapPhysicalResource(row: any): PhysicalResource {
    const resource: PhysicalResource = {
      '@type': 'PhysicalResource',
      id: row.id,
      href: row.href,
      name: row.name,
      resourceSpecificationId: row.resource_specification_id,
      resourceSpecification: { id: row.resource_specification_id, '@referredType': 'ResourceSpecification' },
      resourceType: row.resource_type,
      status: row.status,
      administrativeState: row.administrative_state ?? 'unlocked',
      operationalState: row.operational_state ?? 'enabled',
      usageState: row.usage_state ?? 'idle',
      relatedParty: JSON.parse(row.related_party || '[]'),
      resourceRelationship: this.listResourceRelationships(row.id),
      characteristic: JSON.parse(row.characteristics || '[]'),
    };

    if (row.place_id) {
      resource.place = {
        id: row.place_id,
        '@referredType': row.place_type || 'GeographicLocation',
      };
    }
    if (row.manufacturer) resource.manufacturer = row.manufacturer;
    if (row.model) resource.model = row.model;
    if (row.serial_number) resource.serialNumber = row.serial_number;
    if (row.part_number) resource.partNumber = row.part_number;
    if (row.valid_for_start || row.valid_for_end) {
      resource.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }

    return resource;
  }

  private mapLogicalResource(row: any): LogicalResource {
    const resource: LogicalResource = {
      '@type': 'LogicalResource',
      id: row.id,
      href: row.href,
      name: row.name,
      resourceSpecificationId: row.resource_specification_id,
      resourceSpecification: { id: row.resource_specification_id, '@referredType': 'ResourceSpecification' },
      resourceType: row.resource_type,
      status: row.status,
      administrativeState: row.administrative_state ?? 'unlocked',
      operationalState: row.operational_state ?? 'enabled',
      usageState: row.usage_state ?? 'idle',
      relatedParty: JSON.parse(row.related_party || '[]'),
      resourceRelationship: this.listResourceRelationships(row.id),
      characteristic: JSON.parse(row.characteristics || '[]'),
    };

    if (row.place_id) {
      resource.place = {
        id: row.place_id,
        '@referredType': row.place_type || 'GeographicLocation',
      };
    }
    if (row.supporting_physical_resource_id) {
      resource.supportingPhysicalResourceId = row.supporting_physical_resource_id;
    }
    if (row.valid_for_start || row.valid_for_end) {
      resource.validFor = {
        ...(row.valid_for_start ? { startDateTime: row.valid_for_start } : {}),
        ...(row.valid_for_end ? { endDateTime: row.valid_for_end } : {}),
      };
    }

    return resource;
  }
}
