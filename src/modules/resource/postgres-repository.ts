import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { GeoGeometryType } from '../geo/domain.js';
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
  ResourceLayer,
  ResourceSpecification,
  ResourceSpecificationQuery,
  PhysicalResourceDetail,
  ResourceAuditEntry,
  ResourceStatusBehavior,
  ResourceStatusCatalogEntry,
  ResourceDetailReference,
  ResourcePortConnection,
  ResourcePortDetail,
  ResourcePortsView,
  ResourceCatalog,
  ResourceCatalogNode,
  ResourceCatalogQuery,
} from './domain.js';
import type {
  IResourceRepository,
  ResourceTenantScope,
} from './resource-repository-interface.js';
import { RESOURCE_CATEGORIES, RESOURCE_TYPES } from './catalog.js';
import { RESOURCE_STATUS_DEFAULTS } from './status-catalog.js';
import { buildHref } from '../../shared/tmf/index.js';

// Nome da characteristic que diz qual GeographicSite atende o recurso — a estação
// dona da planta externa que fica na rua (o `place` dela é a Location do ponto, não
// o Site). É extensão V.tal via characteristic, como manda o cânone: a coluna
// `serving_site_id` abaixo é só armazenamento derivado, para a árvore de navegação
// do módulo Geo poder expandir uma estação por índice em vez de varrer o JSON.
const SERVING_SITE_CHARACTERISTIC = 'servingSite';

// `before_state`/`after_state` são CLOB de JSON gravados por `recordMutation`. Linha corrompida
// (ou já não-JSON, de auditoria antiga) não pode derrubar a aba Histórico inteira — vira `null`.
const parseAuditState = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const characteristicStringFromCharacteristics = (
  characteristics: Array<{ name: string; value: unknown }>,
  name: string,
): string | undefined => {
  const value = characteristics.find((item) => item.name === name)?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const characteristicNumberFromCharacteristics = (
  characteristics: Array<{ name: string; value: unknown }>,
  name: string,
): number | undefined => {
  const value = characteristicStringFromCharacteristics(characteristics, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const characteristicStringFromJson = (raw: string | null, name: string): string | undefined => {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? characteristicStringFromCharacteristics(parsed as Array<{ name: string; value: unknown }>, name)
      : undefined;
  } catch {
    return undefined;
  }
};

type ResourceCatalogRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description?: string | null;
  status: 'active' | 'inactive';
  is_default: number | boolean;
  sort_order: number | string;
  created_by?: string | null;
  updated_by?: string | null;
};

type ResourceCatalogNodeRow = {
  id: string;
  tenant_id: string;
  catalog_id: string;
  parent_node_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  kind: 'GROUP' | 'RESOURCE_TYPE';
  resource_type_id?: string | null;
  status: 'active' | 'inactive';
  sort_order: number | string;
  metadata?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  rt_id?: string | null;
  rt_code?: string | null;
  rt_name?: string | null;
};

// LEFT JOIN em ResourceType para expandir `resourceType` em nós RESOURCE_TYPE sem N+1 (plano §8).
const RESOURCE_CATALOG_NODE_SELECT = `
  SELECT n.id, n.tenant_id, n.catalog_id, n.parent_node_id, n.code, n.name, n.description, n.kind,
         n.resource_type_id, n.status, n.sort_order, n.metadata, n.created_by, n.updated_by,
         rt.id AS rt_id, rt.code AS rt_code, rt.name AS rt_name
    FROM tmf_resource_catalog_node n
    LEFT JOIN tmf_resource_type rt ON rt.id = n.resource_type_id AND rt.tenant_id = n.tenant_id`;

const comparePortDetails = (a: ResourcePortDetail, b: ResourcePortDetail): number => {
  if (a.role !== b.role) return a.role === 'FO.I' ? -1 : b.role === 'FO.I' ? 1 : 0;
  return (a.index ?? 0) - (b.index ?? 0);
};

const relationshipFromRow = (row: {
  resource_to_id: string;
  relationship_type: string;
  valid_for_start?: string | null;
  valid_for_end?: string | null;
}): ResourceRelationship => ({
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

const servingSiteIdOf = (resource: {
  characteristic?: Array<{ name: string; value: unknown }>;
}): string | null => {
  const found = resource.characteristic?.find((item) => item.name === SERVING_SITE_CHARACTERISTIC);
  return typeof found?.value === 'string' && found.value.length > 0 ? found.value : null;
};

// Projeção completa de tmf_physical_resource, compartilhada por get e list para as duas não
// divergirem quando uma coluna nova entra (foi o que aconteceu com status_code/label/
// asset_reference/project_id na issue #171). `serving_site_id` fica fora de propósito: é
// armazenamento derivado da characteristic `servingSite`, que já viaja em `characteristics`.
const PHYSICAL_RESOURCE_COLUMNS = `r.id, r.name, r.resource_specification_id,
       rs.resource_type, r.status, r.status_code, r.place_id, r.place_type,
       r.administrative_state, r.operational_state, r.usage_state,
       r.serial_number, r.part_number, r.label, r.asset_reference, r.project_id,
       r.valid_for_start, r.valid_for_end, r.related_party, r.characteristics, r.tenant_id,
       r.created_at, r.updated_at`;

const PHYSICAL_RESOURCE_FROM = `tmf_physical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id`;

const LOGICAL_RESOURCE_COLUMNS = `r.id, r.name, r.resource_specification_id,
       rs.resource_type, r.status, r.place_id, r.place_type,
       r.supporting_physical_resource_id, r.administrative_state, r.operational_state,
       r.usage_state, r.related_party, r.characteristics, r.valid_for_start, r.valid_for_end,
       r.tenant_id`;

const LOGICAL_RESOURCE_FROM = `tmf_logical_resource r
       JOIN tmf_resource_specification rs ON rs.id = r.resource_specification_id`;

// Compartilhado entre list*Resources e count*Resources para que a contagem use exatamente
// os mesmos filtros da listagem (sem limit/offset), evitando total e página divergirem.
const buildResourceConditions = (
  query?: ResourceQuery,
): { conditions: string[]; params: Array<string | number> } => {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (query?.name) {
    conditions.push('LOWER(r.name) LIKE LOWER(?)');
    params.push(`%${query.name}%`);
  }
  if (query?.status) {
    conditions.push('r.status = ?');
    params.push(query.status);
  }
  if (query?.resourceSpecificationIdIn && query.resourceSpecificationIdIn.length > 0) {
    conditions.push(
      `r.resource_specification_id IN (${query.resourceSpecificationIdIn.map(() => '?').join(', ')})`,
    );
    params.push(...query.resourceSpecificationIdIn);
  } else if (query?.resourceSpecificationId) {
    conditions.push('r.resource_specification_id = ?');
    params.push(query.resourceSpecificationId);
  }
  if (query?.resourceTypeIn && query.resourceTypeIn.length > 0) {
    conditions.push(`rs.resource_type IN (${query.resourceTypeIn.map(() => '?').join(', ')})`);
    params.push(...query.resourceTypeIn);
  } else if (query?.resourceType) {
    conditions.push('rs.resource_type = ?');
    params.push(query.resourceType);
  }
  if (query?.category) {
    conditions.push('rs.category = ?');
    params.push(query.category);
  }
  if (query?.placeId) {
    conditions.push('r.place_id = ?');
    params.push(query.placeId);
  }
  if (query?.tenantId) {
    conditions.push('r.tenant_id = ?');
    params.push(query.tenantId);
  }

  return { conditions, params };
};

import type { LogicalResourceRow, PhysicalResourceRow } from './rows.js';
export class PostgresResourceRepository implements IResourceRepository {
  public constructor(private readonly db: DatabaseClient) {}

  public transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.db.transaction(async () => await fn());
  }

  public async initialize(): Promise<void> {
    await this.seedResourceCatalog();
    await this.seedResourceLayers();
    await this.seedStatusCatalog();
  }

  private async seedResourceLayers(tenantId = 'default'): Promise<void> {
    const layers = [
      ['resource-layer-infrastructure', 'infrastructure', 'Infraestrutura'],
      ['resource-layer-gpon-network', 'gpon_network', 'Rede GPON'],
    ] as const;
    const now = new Date().toISOString();
    for (const [id, code, name] of layers) {
      const existing = await this.db.get<{ id: string }>(
        `SELECT id FROM tmf_resource_layer WHERE tenant_id = ? AND code = ?`,
        [tenantId, code],
      );
      if (existing) continue;
      await this.db.run(
        `INSERT INTO tmf_resource_layer
         (id, tenant_id, code, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        [id, tenantId, code, name, now, now],
      );
    }
  }

  /**
   * Bootstrap do catálogo de estados granulares (issue #171). Sem `ON CONFLICT` — o runtime
   * corporativo é Oracle e o catálogo é editável via API (C9), então o bootstrap só insere o que
   * falta e nunca sobrescreve o que o operador ajustou. Mesmo desenho de
   * `GeoProjectRepository.ensureStatusCatalog`.
   */
  private async seedStatusCatalog(tenantId = 'default'): Promise<void> {
    for (const entry of RESOURCE_STATUS_DEFAULTS) {
      const existing = await this.db.get<{ code: string }>(
        `SELECT code FROM tmf_resource_status_catalog WHERE tenant_id = ? AND code = ?`,
        [tenantId, entry.code],
      );
      if (existing) continue;
      await this.db.run(
        `INSERT INTO tmf_resource_status_catalog
         (tenant_id, code, name, resource_type, sort_order, active, behavior)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          entry.code,
          entry.name,
          entry.resourceType ?? null,
          entry.sortOrder,
          entry.active ? 1 : 0,
          entry.behavior,
        ],
      );
    }
  }

  public async listResourceStatusCatalog(
    query: { resourceType?: string; tenantId?: string } = {},
  ): Promise<ResourceStatusCatalogEntry[]> {
    const tenantId = query.tenantId ?? 'default';
    await this.seedStatusCatalog(tenantId);
    // `resource_type IS NULL` = estado transversal; sempre volta junto com os do tipo pedido.
    const rows = await this.db.all<{
      code: string;
      name: string;
      resource_type: string | null;
      sort_order: number;
      active: number;
      behavior: ResourceStatusBehavior;
    }>(
      `SELECT code, name, resource_type, sort_order, active, behavior
         FROM tmf_resource_status_catalog
        WHERE tenant_id = ?${query.resourceType ? ' AND (resource_type IS NULL OR resource_type = ?)' : ''}
        ORDER BY sort_order, code`,
      query.resourceType ? [tenantId, query.resourceType] : [tenantId],
    );
    return rows.map((row) => ({
      '@type': 'ResourceStatusCatalogEntry' as const,
      code: row.code,
      name: row.name,
      ...(row.resource_type ? { resourceType: row.resource_type } : {}),
      sortOrder: Number(row.sort_order),
      active: Number(row.active) === 1,
      behavior: row.behavior,
      tenantId,
    }));
  }

  public async getResourceStatusCatalogEntry(
    code: string,
    tenantId = 'default',
  ): Promise<ResourceStatusCatalogEntry | undefined> {
    const entries = await this.listResourceStatusCatalog({ tenantId });
    return entries.find((entry) => entry.code === code);
  }

  /**
   * Histórico do recurso a partir de `tmf_audit_log` (issue #171). Ordenado do mais recente para
   * o mais antigo; a UI inverte se quiser leitura cronológica. Usa o índice
   * `(entity_type, entity_id, event_time DESC)` que já existe.
   */
  public async listResourceAudit(
    resourceId: string,
    scope?: ResourceTenantScope & { limit?: number },
  ): Promise<ResourceAuditEntry[]> {
    const conditions = [`entity_type = 'PhysicalResource'`, 'entity_id = ?'];
    const params: Array<string | number> = [resourceId];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const rows = await this.db.all<{
      id: string;
      tenant_id: string;
      actor_sub: string;
      action: string;
      entity_type: string;
      entity_id: string;
      event_time: string;
      before_state: string | null;
      after_state: string | null;
      trace_id: string;
      source_ip: string | null;
    }>(
      `SELECT id, tenant_id, actor_sub, action, entity_type, entity_id, event_time,
              before_state, after_state, trace_id, source_ip
         FROM tmf_audit_log
        WHERE ${conditions.join(' AND ')}
        ORDER BY event_time DESC, id DESC
        LIMIT ?`,
      [...params, scope?.limit ?? 200],
    );
    return rows.map((row) => ({
      '@type': 'ResourceAuditEntry' as const,
      id: row.id,
      tenantId: row.tenant_id,
      actorSub: row.actor_sub,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventTime: row.event_time,
      before: parseAuditState(row.before_state),
      after: parseAuditState(row.after_state),
      traceId: row.trace_id,
      ...(row.source_ip ? { sourceIp: row.source_ip } : {}),
    }));
  }

  private async seedResourceCatalog(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.transaction(async () => {
      for (const category of RESOURCE_CATEGORIES) {
        await this.db.run(
          `INSERT INTO tmf_resource_category (id, code, name, parent_category_code, description, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           parent_category_code = excluded.parent_category_code,
           description = excluded.description,
           status = excluded.status,
           updated_at = excluded.updated_at`,
          [
            category.id,
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
          `INSERT INTO tmf_resource_type (id, code, name, category_code, description, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           category_code = excluded.category_code,
           description = excluded.description,
           status = excluded.status,
           updated_at = excluded.updated_at`,
          [
            type.id,
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
      code: string;
      name: string;
      parent_category_code?: string | null;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, code, name, parent_category_code, description, status
       FROM tmf_resource_category
       WHERE code = ?`,
      [code],
    );

    return row ? this.mapResourceCategory(row) : undefined;
  }

  public async listResourceCategories(): Promise<ResourceCategory[]> {
    const rows = await this.db.all<{
      id: string;
      code: string;
      name: string;
      parent_category_code?: string | null;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, code, name, parent_category_code, description, status
       FROM tmf_resource_category
       ORDER BY code`,
    );
    return rows.map((row) => this.mapResourceCategory(row));
  }

  public async getResourceType(code: string): Promise<ResourceType | undefined> {
    const row = await this.db.get<{
      id: string;
      code: string;
      name: string;
      category_code: string;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, code, name, category_code, description, status
       FROM tmf_resource_type
       WHERE code = ?`,
      [code],
    );

    return row ? this.mapResourceType(row) : undefined;
  }

  public async listResourceTypes(): Promise<ResourceType[]> {
    const rows = await this.db.all<{
      id: string;
      code: string;
      name: string;
      category_code: string;
      description?: string | null;
      status: 'active' | 'inactive';
    }>(
      `SELECT id, code, name, category_code, description, status
       FROM tmf_resource_type
       ORDER BY category_code, code`,
    );
    return rows.map((row) => this.mapResourceType(row));
  }

  public async upsertResourceLayer(layer: ResourceLayer): Promise<ResourceLayer> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_layer
       (id, tenant_id, code, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         name = excluded.name,
         description = excluded.description,
         status = excluded.status,
         updated_at = excluded.updated_at`,
      [
        layer.id,
        layer.tenantId ?? 'default',
        layer.code,
        layer.name,
        layer.description ?? null,
        layer.status,
        now,
        now,
      ],
    );
    return layer;
  }

  public async getResourceLayer(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<ResourceLayer | undefined> {
    const tenantId = scope?.tenantId ?? 'default';
    await this.seedResourceLayers(tenantId);
    const row = await this.db.get<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      status: 'active' | 'inactive';
      tenant_id: string;
    }>(
      `SELECT id, code, name, description, status, tenant_id
         FROM tmf_resource_layer WHERE id = ? AND tenant_id = ?`,
      [id, tenantId],
    );
    return row ? this.mapResourceLayer(row) : undefined;
  }

  public async listResourceLayers(scope?: ResourceTenantScope): Promise<ResourceLayer[]> {
    const tenantId = scope?.tenantId ?? 'default';
    await this.seedResourceLayers(tenantId);
    const rows = await this.db.all<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      status: 'active' | 'inactive';
      tenant_id: string;
    }>(
      `SELECT id, code, name, description, status, tenant_id
         FROM tmf_resource_layer WHERE tenant_id = ? ORDER BY code`,
      [tenantId],
    );
    return rows.map((row) => this.mapResourceLayer(row));
  }

  // --- Árvore dinâmica de catálogo (issue #188) ---------------------------------------------------
  // Convive com Category/Layer acima até o cutover lógico (plano §7.8). Sem bootstrap lazy aqui —
  // o catálogo/árvore inicial é governado (task #7, catalog.ts), não um vocabulário fixo reescrito
  // a cada boot como seedResourceLayers.

  public async upsertResourceCatalog(catalog: ResourceCatalog): Promise<ResourceCatalog> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_catalog
       (id, tenant_id, code, name, description, status, is_default, sort_order, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         code = excluded.code,
         name = excluded.name,
         description = excluded.description,
         status = excluded.status,
         is_default = excluded.is_default,
         sort_order = excluded.sort_order,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [
        catalog.id,
        catalog.tenantId,
        catalog.code,
        catalog.name,
        catalog.description ?? null,
        catalog.status,
        catalog.isDefault ? 1 : 0,
        catalog.sortOrder,
        catalog.createdBy ?? null,
        catalog.updatedBy ?? null,
        now,
        now,
      ],
    );
    return (await this.getResourceCatalog(catalog.id, { tenantId: catalog.tenantId })) ?? catalog;
  }

  public async getResourceCatalog(
    id: string,
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalog | undefined> {
    const row = await this.db.get<ResourceCatalogRow>(
      `SELECT id, tenant_id, code, name, description, status, is_default, sort_order, created_by, updated_by
         FROM tmf_resource_catalog WHERE id = ? AND tenant_id = ?`,
      [id, scope.tenantId ?? 'default'],
    );
    return row ? this.mapResourceCatalog(row) : undefined;
  }

  public async getResourceCatalogByCode(
    code: string,
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalog | undefined> {
    const row = await this.db.get<ResourceCatalogRow>(
      `SELECT id, tenant_id, code, name, description, status, is_default, sort_order, created_by, updated_by
         FROM tmf_resource_catalog WHERE tenant_id = ? AND code = ?`,
      [scope.tenantId ?? 'default', code],
    );
    return row ? this.mapResourceCatalog(row) : undefined;
  }

  public async getDefaultResourceCatalog(
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalog | undefined> {
    const row = await this.db.get<ResourceCatalogRow>(
      `SELECT id, tenant_id, code, name, description, status, is_default, sort_order, created_by, updated_by
         FROM tmf_resource_catalog WHERE tenant_id = ? AND is_default = 1`,
      [scope.tenantId ?? 'default'],
    );
    return row ? this.mapResourceCatalog(row) : undefined;
  }

  public async listResourceCatalogs(
    query: ResourceCatalogQuery & ResourceTenantScope,
  ): Promise<ResourceCatalog[]> {
    const conditions = ['tenant_id = ?'];
    const params: Array<string | number> = [query.tenantId ?? 'default'];
    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query.name) {
      conditions.push('LOWER(name) LIKE ?');
      params.push(`%${query.name.toLowerCase()}%`);
    }
    const rows = await this.db.all<ResourceCatalogRow>(
      `SELECT id, tenant_id, code, name, description, status, is_default, sort_order, created_by, updated_by
         FROM tmf_resource_catalog
        WHERE ${conditions.join(' AND ')}
        ORDER BY sort_order, name, id`,
      params,
    );
    return rows.map((row) => this.mapResourceCatalog(row));
  }

  public async upsertResourceCatalogNode(node: ResourceCatalogNode): Promise<ResourceCatalogNode> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_catalog_node
       (id, tenant_id, catalog_id, parent_node_id, code, name, description, kind, resource_type_id, status, sort_order, metadata, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         parent_node_id = excluded.parent_node_id,
         code = excluded.code,
         name = excluded.name,
         description = excluded.description,
         kind = excluded.kind,
         resource_type_id = excluded.resource_type_id,
         status = excluded.status,
         sort_order = excluded.sort_order,
         metadata = excluded.metadata,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [
        node.id,
        node.tenantId,
        node.catalogId,
        node.parentNodeId ?? null,
        node.code,
        node.name,
        node.description ?? null,
        node.kind,
        node.resourceTypeId ?? null,
        node.status,
        node.sortOrder,
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.createdBy ?? null,
        node.updatedBy ?? null,
        now,
        now,
      ],
    );
    return (await this.getResourceCatalogNode(node.id, { tenantId: node.tenantId })) ?? node;
  }

  public async getResourceCatalogNode(
    id: string,
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalogNode | undefined> {
    const row = await this.db.get<ResourceCatalogNodeRow>(
      `${RESOURCE_CATALOG_NODE_SELECT} WHERE n.id = ? AND n.tenant_id = ?`,
      [id, scope.tenantId ?? 'default'],
    );
    return row ? this.mapResourceCatalogNode(row) : undefined;
  }

  public async getResourceCatalogNodeByCode(
    catalogId: string,
    code: string,
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalogNode | undefined> {
    const row = await this.db.get<ResourceCatalogNodeRow>(
      `${RESOURCE_CATALOG_NODE_SELECT} WHERE n.tenant_id = ? AND n.catalog_id = ? AND n.code = ?`,
      [scope.tenantId ?? 'default', catalogId, code],
    );
    return row ? this.mapResourceCatalogNode(row) : undefined;
  }

  public async listResourceCatalogNodes(
    catalogId: string,
    scope: ResourceTenantScope & { includeInactive?: boolean },
  ): Promise<ResourceCatalogNode[]> {
    const conditions = ['n.tenant_id = ?', 'n.catalog_id = ?'];
    const params: Array<string | number> = [scope.tenantId ?? 'default', catalogId];
    if (!scope.includeInactive) conditions.push(`n.status = 'active'`);
    const rows = await this.db.all<ResourceCatalogNodeRow>(
      `${RESOURCE_CATALOG_NODE_SELECT} WHERE ${conditions.join(' AND ')}
        ORDER BY n.sort_order, n.name, n.id`,
      params,
    );
    return rows.map((row) => this.mapResourceCatalogNode(row));
  }

  public async listResourceCatalogNodesByResourceType(
    resourceTypeId: string,
    scope: ResourceTenantScope,
  ): Promise<ResourceCatalogNode[]> {
    const rows = await this.db.all<ResourceCatalogNodeRow>(
      `${RESOURCE_CATALOG_NODE_SELECT} WHERE n.tenant_id = ? AND n.resource_type_id = ?
        ORDER BY n.sort_order, n.name, n.id`,
      [scope.tenantId ?? 'default', resourceTypeId],
    );
    return rows.map((row) => this.mapResourceCatalogNode(row));
  }

  public async countResourceCatalogNodeChildren(
    nodeId: string,
    scope: ResourceTenantScope,
  ): Promise<number> {
    const row = await this.db.get<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM tmf_resource_catalog_node
        WHERE tenant_id = ? AND parent_node_id = ?`,
      [scope.tenantId ?? 'default', nodeId],
    );
    return Number(row?.count ?? 0);
  }

  private mapResourceCatalog(row: ResourceCatalogRow): ResourceCatalog {
    return {
      '@type': 'ResourceCatalog',
      id: row.id,
      href: buildHref('resourceCatalog', row.id),
      code: row.code,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
      isDefault: Number(row.is_default) === 1,
      sortOrder: Number(row.sort_order),
      tenantId: row.tenant_id,
      ...(row.created_by ? { createdBy: row.created_by } : {}),
      ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    };
  }

  private mapResourceCatalogNode(row: ResourceCatalogNodeRow): ResourceCatalogNode {
    const metadata = row.metadata ? this.parseNodeMetadata(row.metadata) : undefined;
    return {
      '@type': 'ResourceCatalogNode',
      id: row.id,
      href: buildHref('resourceCatalogNode', row.id),
      catalogId: row.catalog_id,
      ...(row.parent_node_id ? { parentNodeId: row.parent_node_id } : {}),
      code: row.code,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      kind: row.kind,
      ...(row.resource_type_id ? { resourceTypeId: row.resource_type_id } : {}),
      ...(row.kind === 'RESOURCE_TYPE' && row.rt_id
        ? {
            resourceType: {
              id: row.rt_id,
              href: buildHref('resourceType', row.rt_id),
              code: row.rt_code ?? '',
              name: row.rt_name ?? '',
              '@referredType': 'ResourceType' as const,
            },
          }
        : {}),
      status: row.status,
      sortOrder: Number(row.sort_order),
      ...(metadata ? { metadata } : {}),
      tenantId: row.tenant_id,
      ...(row.created_by ? { createdBy: row.created_by } : {}),
      ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    };
  }

  private parseNodeMetadata(raw: string): Record<string, unknown> | undefined {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  public async upsertResourceSpecification(
    spec: ResourceSpecification,
  ): Promise<ResourceSpecification> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_specification
       (id, name, category, resource_type, resource_layer_id, description, valid_for_start, valid_for_end, related_party, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       resource_type = excluded.resource_type,
       resource_layer_id = excluded.resource_layer_id,
       description = excluded.description,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.name,
        spec.category,
        spec.resourceType,
        spec.resourceLayerId ?? null,
        spec.description ?? null,
        spec.validFor?.startDateTime ?? null,
        spec.validFor?.endDateTime ?? null,
        JSON.stringify(spec.relatedParty),
        JSON.stringify(spec.resourceSpecificationCharacteristic),
        spec.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getResourceSpecification(spec.id)) ?? spec;
  }

  public async getResourceSpecification(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<ResourceSpecification | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<{
      id: string;
      name: string;
      category: string;
      resource_type: string;
      resource_layer_id?: string | null;
      description?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      related_party?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(
      `SELECT id, name, category, resource_type, resource_layer_id, description, valid_for_start, valid_for_end, related_party, characteristics, tenant_id
       FROM tmf_resource_specification
       WHERE ${conditions.join(' AND ')}`,
      params,
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
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, name, category, resource_type, resource_layer_id, description, valid_for_start, valid_for_end, related_party, characteristics, tenant_id FROM tmf_resource_specification',
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
      name: string;
      category: string;
      resource_type: string;
      resource_layer_id?: string | null;
      description?: string | null;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
      related_party?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(sql, params);

    return rows.map((row) => this.mapSpec(row));
  }

  public async upsertResourceFunctionSpecification(
    spec: ResourceFunctionSpecification,
  ): Promise<ResourceFunctionSpecification> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_resource_function_specification
       (id, name, description, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        spec.id,
        spec.name,
        spec.description ?? null,
        JSON.stringify(spec.resourceFunctionSpecificationCharacteristic),
        spec.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getResourceFunctionSpecification(spec.id)) ?? spec;
  }

  public async getResourceFunctionSpecification(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<ResourceFunctionSpecification | undefined> {
    const conditions = ['id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<{
      id: string;
      name: string;
      description?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(
      `SELECT id, name, description, characteristics, tenant_id
       FROM tmf_resource_function_specification
       WHERE ${conditions.join(' AND ')}`,
      params,
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
    if (query?.tenantId) {
      conditions.push('tenant_id = ?');
      params.push(query.tenantId);
    }

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      'SELECT id, name, description, characteristics, tenant_id FROM tmf_resource_function_specification',
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
      name: string;
      description?: string | null;
      characteristics?: string | null;
      tenant_id: string;
    }>(sql, params);

    return rows.map((row) => this.mapFunctionSpec(row));
  }

  public async upsertPhysicalResource(resource: PhysicalResource): Promise<PhysicalResource> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO tmf_physical_resource
       (id, name, resource_specification_id, status, status_code,
        place_id, place_type, serving_site_id, administrative_state, operational_state, usage_state,
        serial_number, part_number, label, asset_reference, project_id, valid_for_start, valid_for_end,
        related_party, characteristics, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
       status = excluded.status,
       status_code = excluded.status_code,
       place_id = excluded.place_id,
       place_type = excluded.place_type,
       serving_site_id = excluded.serving_site_id,
       administrative_state = excluded.administrative_state,
       operational_state = excluded.operational_state,
       usage_state = excluded.usage_state,
       serial_number = excluded.serial_number,
       part_number = excluded.part_number,
       label = excluded.label,
       asset_reference = excluded.asset_reference,
       project_id = excluded.project_id,
       valid_for_start = excluded.valid_for_start,
       valid_for_end = excluded.valid_for_end,
       related_party = excluded.related_party,
       characteristics = excluded.characteristics,
       updated_at = excluded.updated_at`,
      [
        resource.id,
        resource.name,
        resource.resourceSpecificationId,
        resource.status,
        resource.statusCode ?? null,
        resource.place?.id ?? null,
        resource.place?.['@referredType'] ?? null,
        servingSiteIdOf(resource),
        resource.administrativeState,
        resource.operationalState,
        resource.usageState,
        resource.serialNumber ?? null,
        resource.partNumber ?? null,
        resource.label ?? null,
        resource.assetReference ?? null,
        resource.projectId ?? null,
        resource.validFor?.startDateTime ?? null,
        resource.validFor?.endDateTime ?? null,
        JSON.stringify(resource.relatedParty),
        JSON.stringify(resource.characteristic),
        resource.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getPhysicalResource(resource.id)) ?? resource;
  }

  public async getPhysicalResource(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<PhysicalResource | undefined> {
    const conditions = ['r.id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('r.tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<PhysicalResourceRow>(
      `SELECT ${PHYSICAL_RESOURCE_COLUMNS}
       FROM ${PHYSICAL_RESOURCE_FROM}
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return row
      ? this.mapPhysicalResource(row, await this.listResourceRelationships(row.id))
      : undefined;
  }

  public async getPhysicalResourceDetail(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<PhysicalResourceDetail | undefined> {
    const conditions = ['r.id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('r.tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<PhysicalResourceRow & { serving_site_id: string | null }>(
      `SELECT ${PHYSICAL_RESOURCE_COLUMNS}, r.serving_site_id
         FROM ${PHYSICAL_RESOURCE_FROM}
        WHERE ${conditions.join(' AND ')}`,
      params,
    );
    if (!row) return undefined;

    const resource = this.mapPhysicalResource(row, await this.listResourceRelationships(id));
    const specification = await this.getResourceSpecification(row.resource_specification_id, scope);
    if (!specification) return undefined;
    const resourceType = await this.getResourceType(specification.resourceType);
    const tenantId = scope?.tenantId ?? row.tenant_id ?? 'default';

    const statusCatalogEntry = row.status_code
      ? await this.getResourceStatusCatalogEntry(row.status_code, tenantId)
      : undefined;
    const parentRow = await this.db.get<{
      id: string;
      name: string;
      resource_type: string;
      relationship_type: string;
    }>(
      `SELECT p.id, p.name, ps.resource_type, rr.relationship_type
         FROM tmf_resource_relationship rr
         JOIN tmf_physical_resource p ON p.id = rr.resource_from_id
         JOIN tmf_resource_specification ps ON ps.id = p.resource_specification_id
        WHERE rr.resource_to_id = ?
          AND rr.relationship_type IN ('containsAsChild', 'connectedTo')
          AND p.tenant_id = ?
        ORDER BY CASE WHEN rr.relationship_type = 'containsAsChild' THEN 0 ELSE 1 END, p.name
        LIMIT 1`,
      [id, tenantId],
    );
    const childRow = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM tmf_resource_relationship rr
         JOIN tmf_physical_resource c ON c.id = rr.resource_to_id
        WHERE rr.resource_from_id = ? AND rr.relationship_type = 'containsAsChild'
          AND c.tenant_id = ?`,
      [id, tenantId],
    );

    const place = row.place_id
      ? await this.resolveDetailPlace(row.place_id, row.place_type, tenantId)
      : undefined;
    const location = await this.resolveDetailLocation(row, place, tenantId);
    const servingSite = row.serving_site_id
      ? await this.db.get<{ id: string; name: string }>(
          `SELECT id, name FROM tmf_geographic_site WHERE id = ? AND tenant_id = ?`,
          [row.serving_site_id, tenantId],
        )
      : undefined;
    const project = row.project_id
      ? await this.db.get<{ id: string; name: string }>(
          `SELECT id, name FROM geo_project WHERE id = ? AND tenant_id = ?`,
          [row.project_id, tenantId],
        )
      : undefined;

    const characteristicValue = (name: string): string | undefined => {
      const value = specification.resourceSpecificationCharacteristic.find(
        (characteristic) => characteristic.name === name,
      )?.value;
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const manufacturer = specification.relatedParty.find((party) => party.role === 'manufacturer');
    const model = characteristicValue('model');
    const resourceLayer = specification.resourceLayerId
      ? await this.getResourceLayer(specification.resourceLayerId, { tenantId })
      : undefined;

    return {
      '@type': 'PhysicalResourceDetail',
      resource: { ...resource, createdAt: row.created_at, updatedAt: row.updated_at },
      specification: {
        ...specification,
        resourceTypeName: resourceType?.name ?? specification.resourceType,
        ...(manufacturer
          ? {
              manufacturer: {
                id: manufacturer.id,
                ...(manufacturer.name ? { name: manufacturer.name } : {}),
                '@referredType': manufacturer['@referredType'],
              },
            }
          : {}),
        ...(model ? { model } : {}),
        ...(resourceLayer
          ? {
              resourceLayer: {
                id: resourceLayer.id,
                code: resourceLayer.code,
                name: resourceLayer.name,
                '@referredType': 'ResourceLayer',
              },
            }
          : {}),
      },
      ...(statusCatalogEntry ? { statusCatalogEntry } : {}),
      ...(parentRow
        ? {
            parent: {
              id: parentRow.id,
              name: parentRow.name,
              '@referredType': 'PhysicalResource',
              resourceType: parentRow.resource_type,
              relationshipType: parentRow.relationship_type,
            },
          }
        : {}),
      ...(place ? { place } : {}),
      ...(location ? { location } : {}),
      ...(servingSite
        ? {
            servingSite: {
              id: servingSite.id,
              name: servingSite.name,
              '@referredType': 'GeographicSite',
            },
          }
        : {}),
      ...(project
        ? {
            project: {
              id: project.id,
              name: project.name,
              '@referredType': 'GeoProject',
            },
          }
        : {}),
      childCount: Number(childRow?.count ?? 0),
    };
  }

  public async getResourcePortsView(
    ctoId: string,
    scope?: ResourceTenantScope,
  ): Promise<ResourcePortsView | undefined> {
    const tenantId = scope?.tenantId ?? 'default';
    const cto = await this.getPhysicalResource(ctoId, { tenantId });
    if (!cto || cto.resourceType !== 'CTO') return undefined;
    const splitterRows = await this.db.all<{ id: string; name: string; resource_type: string; characteristics: string | null }>(
      `SELECT s.id, s.name, ss.resource_type, s.characteristics
         FROM tmf_resource_relationship c
         JOIN tmf_physical_resource s ON s.id = c.resource_to_id
         JOIN tmf_resource_specification ss ON ss.id = s.resource_specification_id
        WHERE c.resource_from_id = ? AND c.relationship_type = 'containsAsChild'
          AND s.tenant_id = ? AND ss.resource_type = 'Splitter'
        ORDER BY s.name, s.id`,
      [ctoId, tenantId],
    );
    const groups = await Promise.all(
      splitterRows.map(async (splitter) => {
        const ports = await this.listPortDetailsForSplitter(splitter.id, cto, tenantId);
        const splitRatio = characteristicStringFromJson(splitter.characteristics, 'razao');
        return {
          splitter: {
            id: splitter.id,
            name: splitter.name,
            '@referredType': 'PhysicalResource' as const,
            resourceType: splitter.resource_type,
            ...(splitRatio ? { splitRatio } : {}),
          },
          ports,
        };
      }),
    );
    return { '@type': 'ResourcePortsView', ctoId, groups };
  }

  public async getResourcePortDetail(
    portId: string,
    scope?: ResourceTenantScope,
  ): Promise<ResourcePortDetail | undefined> {
    const tenantId = scope?.tenantId ?? 'default';
    const port = await this.getPhysicalResource(portId, { tenantId });
    if (!port || port.resourceType !== 'Port') return undefined;
    const parent = await this.db.get<{ id: string; name: string; resource_type: string; characteristics: string | null; cto_id: string | null; cto_name: string | null }>(
      `SELECT s.id, s.name, ss.resource_type, s.characteristics, cto.id AS cto_id, cto.name AS cto_name
         FROM tmf_resource_relationship p
         JOIN tmf_physical_resource s ON s.id = p.resource_from_id
         JOIN tmf_resource_specification ss ON ss.id = s.resource_specification_id
         LEFT JOIN tmf_resource_relationship c ON c.resource_to_id = s.id AND c.relationship_type = 'containsAsChild'
         LEFT JOIN tmf_physical_resource cto ON cto.id = c.resource_from_id AND cto.tenant_id = ?
         LEFT JOIN tmf_resource_specification ctos ON ctos.id = cto.resource_specification_id
        WHERE p.resource_to_id = ? AND p.relationship_type = 'containsAsChild'
          AND s.tenant_id = ? AND ss.resource_type = 'Splitter'
          AND (ctos.resource_type = 'CTO' OR cto.id IS NULL)
        ORDER BY cto.name, s.name LIMIT 1`,
      [tenantId, portId, tenantId],
    );
    return await this.buildPortDetail(port, parent, tenantId);
  }

  private async listPortDetailsForSplitter(
    splitterId: string,
    cto: PhysicalResource,
    tenantId: string,
  ): Promise<ResourcePortDetail[]> {
    const ports = await this.db.all<PhysicalResourceRow>(
      `SELECT ${PHYSICAL_RESOURCE_COLUMNS}
         FROM ${PHYSICAL_RESOURCE_FROM}
         JOIN tmf_resource_relationship rr ON rr.resource_to_id = r.id
        WHERE rr.resource_from_id = ? AND rr.relationship_type = 'containsAsChild'
          AND r.tenant_id = ? AND rs.resource_type = 'Port'
        ORDER BY r.name, r.id`,
      [splitterId, tenantId],
    );
    const splitter = await this.getPhysicalResource(splitterId, { tenantId });
    if (!splitter) return [];
    const details = await Promise.all(
      ports.map(async (port) => await this.buildPortDetail(this.mapPhysicalResource(port, await this.listResourceRelationships(port.id)), {
        id: splitter.id, name: splitter.name, resource_type: splitter.resourceType,
        characteristics: JSON.stringify(splitter.characteristic), cto_id: cto.id, cto_name: cto.name,
      }, tenantId)),
    );
    return details.sort(comparePortDetails);
  }

  private async buildPortDetail(
    port: PhysicalResource,
    parent: { id: string; name: string; resource_type: string; characteristics: string | null; cto_id: string | null; cto_name: string | null } | undefined,
    tenantId: string,
  ): Promise<ResourcePortDetail> {
    const connectionRows = await this.db.all<{ id: string; name: string; resource_type: string; valid_for_start: string | null; valid_for_end: string | null }>(
      `SELECT d.id, d.name, ds.resource_type, rr.valid_for_start, rr.valid_for_end
         FROM tmf_resource_relationship rr
         JOIN tmf_physical_resource d ON d.id = CASE WHEN rr.resource_from_id = ? THEN rr.resource_to_id ELSE rr.resource_from_id END
         JOIN tmf_resource_specification ds ON ds.id = d.resource_specification_id
        WHERE rr.relationship_type = 'connectedTo' AND (rr.resource_from_id = ? OR rr.resource_to_id = ?)
          AND d.tenant_id = ? AND ds.resource_type = 'DropCable'
        ORDER BY d.name, d.id`,
      [port.id, port.id, port.id, tenantId],
    );
    const currentDrops = await Promise.all(connectionRows.map(async (drop) => {
      const validFor = drop.valid_for_start || drop.valid_for_end
        ? { ...(drop.valid_for_start ? { startDateTime: drop.valid_for_start } : {}), ...(drop.valid_for_end ? { endDateTime: drop.valid_for_end } : {}) }
        : undefined;
      const active = !drop.valid_for_end || new Date(drop.valid_for_end).getTime() > Date.now();
      const ont = active ? await this.resolveDropOnt(drop.id, tenantId) : undefined;
      return {
        resource: {
          id: drop.id,
          name: drop.name,
          '@referredType': 'PhysicalResource' as const,
          resourceType: drop.resource_type,
        },
        active,
        ...(validFor ? { validFor } : {}),
        ...(ont ? { ont } : {}),
      };
    }));
    const historicalDrops = await this.listHistoricalPortDrops(port.id, tenantId, new Set(currentDrops.map((drop) => drop.resource.id)));
    const drops = [...currentDrops, ...historicalDrops];
    const role = characteristicStringFromCharacteristics(port.characteristic, 'role');
    const index = characteristicNumberFromCharacteristics(port.characteristic, 'index');
    const derivedUsageState = drops.some((drop) => drop.active) ? 'active' as const : 'idle' as const;
    const splitRatio = parent ? characteristicStringFromJson(parent.characteristics, 'razao') : undefined;
    return {
      '@type': 'ResourcePortDetail',
      resource: { ...port, usageState: role === 'FO.O' ? derivedUsageState : port.usageState },
      ...(role ? { role } : {}), ...(index !== undefined ? { index } : {}),
      ...(parent ? { splitter: { id: parent.id, name: parent.name, '@referredType': 'PhysicalResource', resourceType: parent.resource_type } } : {}),
      ...(parent?.cto_id && parent.cto_name ? { cto: { id: parent.cto_id, name: parent.cto_name, '@referredType': 'PhysicalResource', resourceType: 'CTO' } } : {}),
      ...(splitRatio ? { splitRatio } : {}),
      derivedUsageState,
      hasActiveService: false,
      drops,
    };
  }

  /**
   * ONT alimentada por um drop, via `connectedTo` no grafo físico — independente do Service.
   * Cobre porta com drop ativo mesmo sem RFS/CFS ativos (churn), já que a fiação continua conectada.
   */
  private async resolveDropOnt(
    dropId: string,
    tenantId: string,
  ): Promise<ResourceDetailReference | undefined> {
    const ont = await this.db.get<{ id: string; name: string; resource_type: string }>(
      `SELECT o.id, o.name, os.resource_type
         FROM tmf_resource_relationship rr
         JOIN tmf_physical_resource o ON o.id = CASE WHEN rr.resource_from_id = ? THEN rr.resource_to_id ELSE rr.resource_from_id END
         JOIN tmf_resource_specification os ON os.id = o.resource_specification_id
        WHERE rr.relationship_type = 'connectedTo' AND (rr.resource_from_id = ? OR rr.resource_to_id = ?)
          AND o.tenant_id = ? AND os.resource_type = 'ONT'
        LIMIT 1`,
      [dropId, dropId, dropId, tenantId],
    );
    if (!ont) return undefined;
    return { id: ont.id, name: ont.name, '@referredType': 'PhysicalResource', resourceType: ont.resource_type };
  }

  private async listHistoricalPortDrops(
    portId: string,
    tenantId: string,
    currentDropIds: Set<string>,
  ): Promise<ResourcePortConnection[]> {
    const audit = await this.listResourceAudit(portId, { tenantId, limit: 500 });
    const removedDropIds = new Set<string>();
    for (const entry of audit) {
      if (entry.action !== 'update') continue;
      const payload = entry.after;
      const relatedResourceId = payload?.relatedResourceId;
      const relationshipType = payload?.relationshipType;
      if (
        typeof relatedResourceId === 'string' &&
        relationshipType === 'connectedTo' &&
        !currentDropIds.has(relatedResourceId)
      ) {
        removedDropIds.add(relatedResourceId);
      }
    }
    if (removedDropIds.size === 0) return [];

    const ids = [...removedDropIds];
    const rows = await this.db.all<{ id: string; name: string; resource_type: string }>(
      `SELECT d.id, d.name, ds.resource_type
         FROM tmf_physical_resource d
         JOIN tmf_resource_specification ds ON ds.id = d.resource_specification_id
        WHERE d.tenant_id = ? AND ds.resource_type = 'DropCable'
          AND d.id IN (${ids.map(() => '?').join(', ')})
        ORDER BY d.name, d.id`,
      [tenantId, ...ids],
    );
    return rows.map((drop) => ({
      resource: {
        id: drop.id,
        name: drop.name,
        '@referredType': 'PhysicalResource',
        resourceType: drop.resource_type,
      },
      active: false,
    }));
  }

  private async resolveDetailPlace(
    id: string,
    referredType: string | null,
    tenantId: string,
  ): Promise<PhysicalResourceDetail['place'] | undefined> {
    if (referredType === 'GeographicAddress') {
      const fields = await this.fetchAddressStreetFields(id, tenantId);
      if (!fields) return undefined;
      return {
        id,
        '@referredType': 'GeographicAddress',
        name: [fields.streetType, fields.streetName, fields.streetNr].filter(Boolean).join(' '),
        ...fields,
      };
    }
    if (referredType === 'GeographicSite') {
      const site = await this.db.get<{ id: string; name: string; geographic_address_id: string | null }>(
        `SELECT id, name, geographic_address_id FROM tmf_geographic_site WHERE id = ? AND tenant_id = ?`,
        [id, tenantId],
      );
      if (!site) return undefined;
      // Endereço vinculado ao site (a rua real onde ele fica) — quando presente, a UI usa
      // esses campos no lugar do nome do site para o campo "Endereço" do painel de recurso
      // (ver formatPlaceAddress em ResourceOverviewTab.tsx). O Site continua sendo a
      // referência (id/@referredType/name).
      const addressFields = site.geographic_address_id
        ? await this.fetchAddressStreetFields(site.geographic_address_id, tenantId)
        : undefined;
      return {
        id: site.id,
        name: site.name,
        '@referredType': 'GeographicSite',
        ...addressFields,
      };
    }
    return { id, '@referredType': referredType ?? 'GeographicLocation' };
  }

  private async fetchAddressStreetFields(
    addressId: string,
    tenantId: string,
  ): Promise<
    | {
        streetType?: string;
        streetName: string;
        streetNr?: string;
        locality?: string;
        city?: string;
        stateOrProvince?: string;
        postcode?: string;
        sourceSystem?: string;
      }
    | undefined
  > {
    const address = await this.db.get<{
      street_type: string | null;
      street_name: string;
      street_nr: string | null;
      locality: string | null;
      city: string | null;
      state_or_province: string | null;
      postcode: string | null;
      source_system: string | null;
    }>(
      `SELECT street_type, street_name, street_nr, locality, city, state_or_province, postcode, source_system
         FROM tmf_geographic_address WHERE id = ? AND tenant_id = ?`,
      [addressId, tenantId],
    );
    if (!address) return undefined;
    return {
      ...(address.street_type ? { streetType: address.street_type } : {}),
      streetName: address.street_name,
      ...(address.street_nr ? { streetNr: address.street_nr } : {}),
      ...(address.locality ? { locality: address.locality } : {}),
      ...(address.city ? { city: address.city } : {}),
      ...(address.state_or_province ? { stateOrProvince: address.state_or_province } : {}),
      ...(address.postcode ? { postcode: address.postcode } : {}),
      ...(address.source_system ? { sourceSystem: address.source_system } : {}),
    };
  }

  private async resolveDetailLocation(
    row: PhysicalResourceRow,
    place: PhysicalResourceDetail['place'] | undefined,
    tenantId: string,
  ): Promise<PhysicalResourceDetail['location'] | undefined> {
    let locationId: string | null = null;
    if (row.place_type === 'GeographicLocation') locationId = row.place_id;
    else if (row.place_type === 'GeographicAddress' && row.place_id) {
      const address = await this.db.get<{ geographic_location_id: string | null }>(
        `SELECT geographic_location_id FROM tmf_geographic_address WHERE id = ? AND tenant_id = ?`,
        [row.place_id, tenantId],
      );
      locationId = address?.geographic_location_id ?? null;
    } else if (row.place_type === 'GeographicSite' && row.place_id) {
      const site = await this.db.get<{ geographic_location_id: string | null }>(
        `SELECT geographic_location_id FROM tmf_geographic_site WHERE id = ? AND tenant_id = ?`,
        [row.place_id, tenantId],
      );
      locationId = site?.geographic_location_id ?? null;
    }
    if (!locationId && place?.['@referredType'] === 'GeographicLocation') {
      locationId = place.id;
    }
    if (!locationId) return undefined;

    const geo = await this.db.get<{ geometry_type: GeoGeometryType; geometry: string }>(
      `SELECT geometry_type, geometry FROM tmf_geographic_location WHERE id = ? AND tenant_id = ?`,
      [locationId, tenantId],
    );
    return {
      id: locationId,
      '@referredType': 'GeographicLocation',
      ...(geo ? { geometryType: geo.geometry_type, geometry: JSON.parse(geo.geometry) } : {}),
    };
  }

  public async listPhysicalResources(query?: ResourceQuery): Promise<PhysicalResource[]> {
    const { conditions, params } = buildResourceConditions(query);

    const hasLimit = query?.limit !== undefined;
    const hasOffset = query?.offset !== undefined;
    const sql = [
      `SELECT ${PHYSICAL_RESOURCE_COLUMNS} FROM ${PHYSICAL_RESOURCE_FROM}`,
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
      `SELECT COUNT(*) as count FROM ${PHYSICAL_RESOURCE_FROM}`,
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
       (id, name, resource_specification_id, status,
        place_id, place_type, serving_site_id, supporting_physical_resource_id,
        administrative_state, operational_state, usage_state,
        related_party, characteristics, valid_for_start, valid_for_end, tenant_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       resource_specification_id = excluded.resource_specification_id,
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
        resource.name,
        resource.resourceSpecificationId,
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
        resource.tenantId ?? 'default',
        now,
        now,
      ],
    );

    return (await this.getLogicalResource(resource.id)) ?? resource;
  }

  public async getLogicalResource(
    id: string,
    scope?: ResourceTenantScope,
  ): Promise<LogicalResource | undefined> {
    const conditions = ['r.id = ?'];
    const params: Array<string | number> = [id];
    if (scope?.tenantId) {
      conditions.push('r.tenant_id = ?');
      params.push(scope.tenantId);
    }
    const row = await this.db.get<LogicalResourceRow>(
      `SELECT ${LOGICAL_RESOURCE_COLUMNS}
       FROM ${LOGICAL_RESOURCE_FROM}
       WHERE ${conditions.join(' AND ')}`,
      params,
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
      `SELECT ${LOGICAL_RESOURCE_COLUMNS} FROM ${LOGICAL_RESOURCE_FROM}`,
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
      `SELECT COUNT(*) as count FROM ${LOGICAL_RESOURCE_FROM}`,
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

    return rows.map((row) => relationshipFromRow(row));
  }

  public async listIncidentResourceRelationships(resourceId: string): Promise<ResourceRelationship[]> {
    const rows = await this.db.all<{
      related_resource_id: string;
      relationship_type: string;
      valid_for_start?: string | null;
      valid_for_end?: string | null;
    }>(
      `SELECT CASE WHEN resource_from_id = ? THEN resource_to_id ELSE resource_from_id END AS related_resource_id,
              relationship_type, valid_for_start, valid_for_end
         FROM tmf_resource_relationship
        WHERE resource_from_id = ? OR resource_to_id = ?
        ORDER BY relationship_type, related_resource_id`,
      [resourceId, resourceId, resourceId],
    );
    return rows.map((row) => relationshipFromRow({ ...row, resource_to_id: row.related_resource_id }));
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
    name: string;
    category: string;
    resource_type: string;
    resource_layer_id?: string | null;
    description?: string | null;
    valid_for_start?: string | null;
    valid_for_end?: string | null;
    related_party?: string | null;
    characteristics?: string | null;
    tenant_id?: string;
  }): ResourceSpecification {
    const spec: ResourceSpecification = {
      '@type': 'ResourceSpecification',
      id: row.id,
      href: buildHref('resourceSpecification', row.id),
      name: row.name,
      category: row.category,
      resourceType: row.resource_type,
      ...(row.resource_layer_id ? { resourceLayerId: row.resource_layer_id } : {}),
      resourceSpecificationCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ResourceSpecification['resourceSpecificationCharacteristic'],
      relatedParty: JSON.parse(row.related_party || '[]') as ResourceSpecification['relatedParty'],
      tenantId: row.tenant_id ?? 'default',
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

  private mapResourceLayer(row: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    status: 'active' | 'inactive';
    tenant_id?: string;
  }): ResourceLayer {
    return {
      '@type': 'ResourceLayer',
      id: row.id,
      href: buildHref('resourceLayer', row.id),
      code: row.code,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
      tenantId: row.tenant_id ?? 'default',
    };
  }

  private mapResourceCategory(row: {
    id: string;
    code: string;
    name: string;
    parent_category_code?: string | null;
    description?: string | null;
    status: 'active' | 'inactive';
  }): ResourceCategory {
    return {
      '@type': 'ResourceCategory',
      id: row.id,
      href: buildHref('resourceCategory', row.id),
      code: row.code,
      name: row.name,
      ...(row.parent_category_code ? { parentCategoryCode: row.parent_category_code } : {}),
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
    };
  }

  private mapResourceType(row: {
    id: string;
    code: string;
    name: string;
    category_code: string;
    description?: string | null;
    status: 'active' | 'inactive';
  }): ResourceType {
    return {
      '@type': 'ResourceType',
      id: row.id,
      href: buildHref('resourceType', row.id),
      code: row.code,
      name: row.name,
      categoryCode: row.category_code,
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
    };
  }

  private mapFunctionSpec(row: {
    id: string;
    name: string;
    description?: string | null;
    characteristics?: string | null;
    tenant_id?: string;
  }): ResourceFunctionSpecification {
    const spec: ResourceFunctionSpecification = {
      '@type': 'ResourceFunctionSpecification',
      id: row.id,
      href: buildHref('resourceFunctionSpecification', row.id),
      name: row.name,
      resourceFunctionSpecificationCharacteristic: JSON.parse(
        row.characteristics || '[]',
      ) as ResourceFunctionSpecification['resourceFunctionSpecificationCharacteristic'],
      tenantId: row.tenant_id ?? 'default',
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
      href: buildHref('resource', row.id),
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
      tenantId: row.tenant_id ?? 'default',
    };

    if (row.place_id) {
      resource.place = {
        id: row.place_id,
        '@referredType': row.place_type || 'GeographicLocation',
      };
    }
    if (row.status_code) resource.statusCode = row.status_code;
    if (row.serial_number) resource.serialNumber = row.serial_number;
    if (row.part_number) resource.partNumber = row.part_number;
    if (row.label) resource.label = row.label;
    if (row.asset_reference) resource.assetReference = row.asset_reference;
    if (row.project_id) resource.projectId = row.project_id;
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
      href: buildHref('resource', row.id),
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
      tenantId: row.tenant_id ?? 'default',
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
