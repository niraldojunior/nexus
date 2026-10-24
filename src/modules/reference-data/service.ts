import { AppError } from '../../shared/errors/app-error.js';
import { CATALOG_ADMIN_ROLES, INVENTORY_READ_ROLES } from '../../shared/http/roles.js';
import { requireRoles, type RequestContext } from '../../shared/http/request-context.js';
import { recordMutation, type AuditAction } from '../../shared/persistence/audit-outbox.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { EventService } from '../../shared/tmf/index.js';
import type { ReferenceDataSet, ReferenceDataValue } from './domain.js';
import type { IReferenceDataRepository } from './repository.js';

export type ReferenceDataDraftGuard = {
  assertActiveDraft: (domain: 'reference-data', context: RequestContext) => Promise<unknown>;
};

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;

const parseSetInput = (
  body: Record<string, unknown>,
): { key: string; name: string; description: string | null } => {
  const key = String(body.key ?? '').trim();
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description).trim() : null;
  if (!key || !name) {
    throw new AppError('reference data set key and name are required', {
      code: 'REFERENCE_DATA_SET_INVALID',
      statusCode: 400,
    });
  }
  if (!IDENTIFIER.test(key)) {
    throw new AppError('reference data set key must be a lowercase identifier', {
      code: 'REFERENCE_DATA_SET_INVALID',
      statusCode: 400,
    });
  }
  return { key, name, description };
};

const parseValueInput = (
  body: Record<string, unknown>,
): { key: string; label: string; sortOrder?: number } => {
  const key = String(body.key ?? '').trim();
  const label = String(body.label ?? '').trim();
  if (!key || !label) {
    throw new AppError('reference data value key and label are required', {
      code: 'REFERENCE_DATA_VALUE_INVALID',
      statusCode: 400,
    });
  }
  return {
    key,
    label,
    ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
  };
};

// Casos de uso de Dados de Referência (Studio). Rota HTTP e tool MCP compartilham papel,
// governança de draft, auditoria e evento TMF688.
export class ReferenceDataService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly repository: IReferenceDataRepository,
    private readonly studio: ReferenceDataDraftGuard,
    private readonly eventService: EventService,
  ) {}

  public async listSets(context: RequestContext): Promise<ReferenceDataSet[]> {
    requireRoles(context, INVENTORY_READ_ROLES);
    return await this.repository.listSets(context.tenantId);
  }

  public async createSet(
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<ReferenceDataSet> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('reference-data', context);
    const input = parseSetInput(body);
    if (await this.repository.getSetByKey(context.tenantId, input.key)) throw this.setConflict();
    const created = await this.repository.createSet(context.tenantId, input);
    await this.record('create', 'ReferenceDataSet', created, context, { after: created });
    return created;
  }

  public async updateSet(
    id: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<ReferenceDataSet | null> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('reference-data', context);
    const current = await this.requireSet(id, context);
    const input = parseSetInput(body);
    if (input.key !== current.key) {
      const clash = await this.repository.getSetByKey(context.tenantId, input.key);
      if (clash && clash.id !== current.id) throw this.setConflict();
    }
    const updated = await this.repository.updateSet(context.tenantId, id, input);
    if (updated) {
      await this.record('update', 'ReferenceDataSet', updated, context, {
        before: current,
        after: updated,
      });
    }
    return updated;
  }

  public async deactivateSet(
    id: string,
    context: RequestContext,
  ): Promise<ReferenceDataSet | null> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('reference-data', context);
    const current = await this.requireSet(id, context);
    const deactivated = await this.repository.deactivateSet(context.tenantId, id);
    if (deactivated) {
      await this.record('delete', 'ReferenceDataSet', deactivated, context, {
        before: current,
        after: deactivated,
      });
    }
    return deactivated;
  }

  public async listValues(setId: string, context: RequestContext): Promise<ReferenceDataValue[]> {
    requireRoles(context, INVENTORY_READ_ROLES);
    await this.requireSet(setId, context);
    return await this.repository.listValues(context.tenantId, setId);
  }

  public async createValue(
    setId: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<ReferenceDataValue> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.requireSet(setId, context);
    await this.studio.assertActiveDraft('reference-data', context);
    const created = await this.repository.createValue(
      context.tenantId,
      setId,
      parseValueInput(body),
    );
    await this.record('create', 'ReferenceDataValue', created, context, { after: created });
    return created;
  }

  public async updateValue(
    setId: string,
    id: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<ReferenceDataValue> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('reference-data', context);
    const current = await this.requireValue(setId, id, context);
    const updated = await this.repository.updateValue(context.tenantId, id, parseValueInput(body));
    if (!updated) throw this.valueNotFound();
    await this.record('update', 'ReferenceDataValue', updated, context, {
      before: current,
      after: updated,
    });
    return updated;
  }

  public async deactivateValue(
    setId: string,
    id: string,
    context: RequestContext,
  ): Promise<ReferenceDataValue> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('reference-data', context);
    const current = await this.requireValue(setId, id, context);
    const deactivated = await this.repository.deactivateValue(context.tenantId, id);
    if (!deactivated) throw this.valueNotFound();
    await this.record('delete', 'ReferenceDataValue', deactivated, context, {
      before: current,
      after: deactivated,
    });
    return deactivated;
  }

  private async requireSet(id: string, context: RequestContext): Promise<ReferenceDataSet> {
    const set = await this.repository.getSet(context.tenantId, id);
    if (!set) {
      throw new AppError('reference data set not found', {
        code: 'REFERENCE_DATA_SET_NOT_FOUND',
        statusCode: 404,
      });
    }
    return set;
  }

  private async requireValue(
    setId: string,
    id: string,
    context: RequestContext,
  ): Promise<ReferenceDataValue> {
    const value = await this.repository.getValue(context.tenantId, id);
    if (!value || value.setId !== setId) throw this.valueNotFound();
    return value;
  }

  private valueNotFound(): AppError {
    return new AppError('reference data value not found', {
      code: 'REFERENCE_DATA_VALUE_NOT_FOUND',
      statusCode: 404,
    });
  }

  private setConflict(): AppError {
    return new AppError('reference data set key already exists', {
      code: 'REFERENCE_DATA_SET_CONFLICT',
      statusCode: 409,
    });
  }

  private async record(
    action: AuditAction,
    entityType: 'ReferenceDataSet' | 'ReferenceDataValue',
    entity: { id: string },
    context: RequestContext,
    states: { before?: unknown; after?: unknown },
  ): Promise<void> {
    const event = await this.eventService.appendEvent({
      eventType: `${entityType}${action === 'create' ? 'Create' : action === 'delete' ? 'Delete' : 'AttributeValueChange'}Event`,
      source: `reference-data.${entityType}`,
      correlationId: entity.id,
      eventData: {
        entityId: entity.id,
        entityType,
        payload: states.after ?? entity,
      },
    });
    await recordMutation(this.db, context, {
      action,
      entityType,
      entityId: entity.id,
      ...(states.before !== undefined ? { before: states.before } : {}),
      ...(states.after !== undefined ? { after: states.after } : {}),
      event,
      topic: 'tmf688.reference-data',
    });
  }
}
