import type { DatabaseClient } from '../../shared/persistence/database-client.js';
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

// Nome da characteristic que diz qual GeographicSite atende o recurso — a estação
// dona da planta externa que fica na rua (o `place` dela é a Location do ponto, não
// o Site). É extensão V.tal via characteristic, como manda o cânone: a coluna
// `serving_site_id` abaixo é só armazenamento derivado, para a árvore de navegação
// do módulo Geo poder expandir uma estação por índice em vez de varrer o JSON.
const SERVING_SITE_CHARACTERISTIC = 'servingSite';

const servingSiteIdOf = (resource: {
  characteristic?: Array<{ name: string; value: unknown }>;
}): string | null => {
  const found = resource.characteristic?.find((item) => item.name === SERVING_SITE_CHARACTERISTIC);
  return typeof found?.value === 'string' && found.value.length > 0 ? found.value : null;
};

// Compartilhado entre list*Resources e count*Resources para que a contagem use exatamente
// os mesmos filtros da listagem (sem limit/offset), evitando total e página divergirem.
const buildResourceConditions = (
  query?: ResourceQuery,
): { conditions: string[]; params: Array<string | number> } => {
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
  if (query?.resourceSpecificationIdIn && query.resourceSpecificationIdIn.length > 0) {
    conditions.push(
      `resource_specification_id IN (${query.resourceSpecificationIdIn.map(() => '?').join(', ')})`,
    );
    params.push(...query.resourceSpecificationIdIn);
  } else if (query?.resourceSpecificationId) {
    conditions.push('resource_specification_id = ?');
    params.push(query.resourceSpecificationId);
  }
  if (query?.resourceTypeIn && query.resourceTypeIn.length > 0) {
    conditions.push(`resource_type IN (${query.resourceTypeIn.map(() => '?').join(', ')})`);
    params.push(...query.resourceTypeIn);
  } else if (query?.resourceType) {
    conditions.push('resource_type = ?');
    params.push(query.resourceType);
  }
  if (query?.category) {
    conditions.push(
      'resource_specification_id IN (SELECT id FROM tmf_resource_specification WHERE category = ?)',
    );
    params.push(query.category);
  }
  if (query?.placeId) {
    conditions.push('place_id = ?');
    params.push(query.placeId);
  }

  return { conditions, params };
};

import type { LogicalResourceRow, PhysicalResourceRow } from './rows.js';
export class PostgresResourceRepository implements IResourceRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public initialize(): Promise<void> {
    return this.seedResourceCatalog();
  }

  private async seedResourceCatalog(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.transaction(async () => {
      for (const category of RESOURCE_CATEGORIES) {
        await this.db.run(
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
        await this.db.run(
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
    });
  }

  public async getResourceCategory(code: string): Promise<ResourceCategory | undefined> {
    const row = await this.db.get<{
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

  public async listResourceCategories(): Promise<ResourceCategory[]> {
    const rows = await this.db.all<{
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

  public async getResourceType(code: string): Promise<ResourceType | undefined> {
    const row = await this.db.get<{
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

  public async listResourceTypes(): Promise<ResourceType[]> {
    const rows = await this.db.all<{
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

  public async upsertResourceSpecification(
    spec: ResourceSpecification,
  ): Promise<ResourceSpecification> {
    const now = new Date().toISOString();
    await this.db.run(
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

    return (await this.getResourceSpecification(spec.id)) ?? spec;
  }

  public async getResourceSpecification(id: string): Promise<ResourceSpecification | undefined> {
    const row = await this.db.get<{
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

  public async listResourceSpecifications(
    query?: ResourceSpecificationQuery,
  ): Promise<ResourceSpecification[]> {
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
    if (!query?.includeEnded) {
      conditions.push('valid_for_end IS NULL');
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

    const rows = await this.db.all<{
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

  public async upsertResourceFunctionSpecification(
    spec: ResourceFunctionSpecification,
  ): Promise<ResourceFunctionSpecification> {
    const now = new Date().toISOString();
    await this.db.run(
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

    return (await this.getResourceFunctionSpecification(spec.id)) ?? spec;
  }

  public async getResourceFunctionSpecification(
    id: string,
  ): Promise<ResourceFunctionSpecification | undefined> {
    const row = await this.db.get<{
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

  public async listResourceFunctionSpecifications(
    query?: ResourceFunctionSpecificationQuery,
  ): Promise<ResourceFunctionSpecification[]> {
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

    const rows = await this.db.all<{
      id: string;
      href: string;
      name: string;
      description?: string | null;
      characteristics?: string | null;
    }>(sql, params);

    return rows.map((row) => this.mapFunctionSpec(row));
  }

  public async upsertPhysicalResource(resource: PhysicalResource): Promise<PhysicalResource> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_physical_resource
       (id, href, name, resource_specification_id, resource_type, status,
        place_id, place_type, serving_site_id, administrative_state, operational_state, usage_state,
        manufacturer, model, serial_number, part_number, valid_for_start, valid_for_end,
        related_party, characteristics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
       resource_type = excluded.resource_type,
       status = excluded.status,
       place_id = excluded.place_id,
       place_type = excluded.place_type,
       serving_site_id = excluded.serving_site_id,
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
        servingSiteIdOf(resource),
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

    return (await this.getPhysicalResource(resource.id)) ?? resource;
  }

  public async getPhysicalResource(id: string): Promise<PhysicalResource | undefined> {
    const row = await this.db.get<PhysicalResourceRow>(
      `SELECT id, href, name, resource_specification_id, resource_type, status,
              place_id, place_type, administrative_state, operational_state, usage_state,
              manufacturer, model, serial_number, part_number, valid_for_start, valid_for_end,
              related_party, characteristics
       FROM tmf_physical_resource
       WHERE id = ?`,
      [id],
    );

    return row
      ? this.mapPhysicalResource(row, await this.listResourceRelationships(row.id))
      : undefined;
  }

  public async listPhysicalResources(query?: ResourceQuery): Promise<PhysicalResource[]> {
    const { conditions, params } = buildResourceConditions(query);

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

    const rows = await this.db.all<PhysicalResourceRow>(sql, params);
    const relationshipsByResourceId = await this.loadResourceRelationshipsByResourceIds(
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      this.mapPhysicalResource(row, relationshipsByResourceId.get(row.id) ?? []),
    );
  }

  public async countPhysicalResources(query?: ResourceQuery): Promise<number> {
    const { conditions, params } = buildResourceConditions(query);
    const sql = [
      'SELECT COUNT(*) as count FROM tmf_physical_resource',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    const row = await this.db.get<{ count: number }>(sql, params);
    return Number(row?.count ?? 0);
  }

  public async upsertLogicalResource(resource: LogicalResource): Promise<LogicalResource> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_logical_resource
       (id, href, name, resource_specification_id, resource_type, status,
        place_id, place_type, serving_site_id, supporting_physical_resource_id,
        administrative_state, operational_state, usage_state,
        related_party, characteristics, valid_for_start, valid_for_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       href = excluded.href,
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
       resource_type = excluded.resource_type,
       status = excluded.status,
       place_id = excluded.place_id,
       place_type = excluded.place_type,
       serving_site_id = excluded.serving_site_id,
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
        servingSiteIdOf(resource),
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

    return (await this.getLogicalResource(resource.id)) ?? resource;
  }

  public async getLogicalResource(id: string): Promise<LogicalResource | undefined> {
    const row = await this.db.get<LogicalResourceRow>(
      `SELECT id, href, name, resource_specification_id, resource_type, status, place_id, place_type,
              supporting_physical_resource_id, administrative_state, operational_state, usage_state,
              related_party, characteristics, valid_for_start, valid_for_end
       FROM tmf_logical_resource
       WHERE id = ?`,
      [id],
    );

    return row
      ? this.mapLogicalResource(row, await this.listResourceRelationships(row.id))
      : undefined;
  }

  public async listLogicalResources(query?: ResourceQuery): Promise<LogicalResource[]> {
    const { conditions, params } = buildResourceConditions(query);

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

    const rows = await this.db.all<LogicalResourceRow>(sql, params);
    const relationshipsByResourceId = await this.loadResourceRelationshipsByResourceIds(
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      this.mapLogicalResource(row, relationshipsByResourceId.get(row.id) ?? []),
    );
  }

  public async countLogicalResources(query?: ResourceQuery): Promise<number> {
    const { conditions, params } = buildResourceConditions(query);
    const sql = [
      'SELECT COUNT(*) as count FROM tmf_logical_resource',
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    const row = await this.db.get<{ count: number }>(sql, params);
    return Number(row?.count ?? 0);
  }

  public async countResources(query?: ResourceQuery): Promise<number> {
    if (query?.kind === 'PhysicalResource') return await this.countPhysicalResources(query);
    if (query?.kind === 'LogicalResource') return await this.countLogicalResources(query);
    return (await this.countPhysicalResources(query)) + (await this.countLogicalResources(query));
  }

  public async upsertResourceRelationship(
    resourceId: string,
    relationship: ResourceRelationship,
  ): Promise<ResourceRelationship> {
    await this.db.run(
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

  public async deleteResourceRelationship(
    resourceId: string,
    relatedResourceId: string,
    relationshipType: string,
  ): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM tmf_resource_relationship
       WHERE resource_from_id = ? AND resource_to_id = ? AND relationship_type = ?`,
      [resourceId, relatedResourceId, relationshipType],
    );
    return result.changes > 0;
  }

  public async listResourceRelationships(resourceId: string): Promise<ResourceRelationship[]> {
    const rows = await this.db.all<{
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

  private async loadResourceRelationshipsByResourceIds(
    resourceIds: string[],
  ): Promise<Map<string, ResourceRelationship[]>> {
    if (resourceIds.length === 0) {
      return new Map();
    }

    const placeholders = resourceIds.map(() => '?').join(', ');
    const rows = await this.db.all<{
      resource_from_id: string;
      resource_to_id: string;
      relationship_type: string;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
    }>(
      `SELECT resource_from_id, resource_to_id, relationship_type, valid_for_start, valid_for_end
       FROM tmf_resource_relationship
       WHERE resource_from_id IN (${placeholders})
       ORDER BY resource_from_id, relationship_type, resource_to_id`,
      resourceIds,
    );

    const relationshipsByResourceId = new Map<string, ResourceRelationship[]>();
    for (const row of rows) {
      const current = relationshipsByResourceId.get(row.resource_from_id) ?? [];
      current.push({
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
      });
      relationshipsByResourceId.set(row.resource_from_id, current);
    }

    return relationshipsByResourceId;
  }

  public async listResources(query?: ResourceQuery): Promise<Resource[]> {
    if (query?.kind === 'PhysicalResource') {
      return await this.listPhysicalResources(query);
    }

    if (query?.kind === 'LogicalResource') {
      return await this.listLogicalResources(query);
    }

    return [
      ...(await this.listPhysicalResources(query)),
      ...(await this.listLogicalResources(query)),
    ];
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
      resourceSpecificationCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ResourceSpecification['resourceSpecificationCharacteristic'],
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
      resourceFunctionSpecificationCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ResourceFunctionSpecification['resourceFunctionSpecificationCharacteristic'],
    };

    if (row.description) spec.description = row.description;
    return spec;
  }

  private mapPhysicalResource(
    row: PhysicalResourceRow,
    resourceRelationships: ResourceRelationship[],
  ): PhysicalResource {
    const resource: PhysicalResource = {
      '@type': 'PhysicalResource',
      id: row.id,
      href: row.href,
      name: row.name,
      resourceSpecificationId: row.resource_specification_id,
      resourceSpecification: {
        id: row.resource_specification_id,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: row.resource_type,
      status: row.status,
      administrativeState: row.administrative_state ?? 'unlocked',
      operationalState: row.operational_state ?? 'enabled',
      usageState: row.usage_state ?? 'idle',
      relatedParty: JSON.parse(row.related_party || '[]'),
      resourceRelationship: resourceRelationships,
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

  private mapLogicalResource(
    row: LogicalResourceRow,
    resourceRelationships: ResourceRelationship[],
  ): LogicalResource {
    const resource: LogicalResource = {
      '@type': 'LogicalResource',
      id: row.id,
      href: row.href,
      name: row.name,
      resourceSpecificationId: row.resource_specification_id,
      resourceSpecification: {
        id: row.resource_specification_id,
        '@referredType': 'ResourceSpecification',
      },
      resourceType: row.resource_type,
      status: row.status,
      administrativeState: row.administrative_state ?? 'unlocked',
      operationalState: row.operational_state ?? 'enabled',
      usageState: row.usage_state ?? 'idle',
      relatedParty: JSON.parse(row.related_party || '[]'),
      resourceRelationship: resourceRelationships,
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
