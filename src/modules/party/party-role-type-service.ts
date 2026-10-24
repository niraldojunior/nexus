import { AppError } from '../../shared/errors/app-error.js';
import { CATALOG_ADMIN_ROLES, INVENTORY_READ_ROLES } from '../../shared/http/roles.js';
import { requireRoles, type RequestContext } from '../../shared/http/request-context.js';
import { recordMutation, type AuditAction } from '../../shared/persistence/audit-outbox.js';
import type { DatabaseClient } from '../../shared/persistence/database-client.js';
import type { EventService } from '../../shared/tmf/index.js';
import type {
  CreatePartyRoleTypeInput,
  PartyRoleType,
  PartyRoleTypeRepository,
  UpdatePartyRoleTypeInput,
} from './party-role-type-repository.js';

// Só o que o service precisa da governança do Studio; evita importar o módulo studio (que já
// depende de party via PartiesStudioAdapter).
export type PartyRoleTypeDraftGuard = {
  assertActiveDraft: (domain: 'parties', context: RequestContext) => Promise<unknown>;
};

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;

export const parsePartyRoleTypeInput = (
  body: Record<string, unknown>,
  current?: CreatePartyRoleTypeInput,
): CreatePartyRoleTypeInput => {
  const key = String(body.key ?? current?.key ?? '').trim();
  const roleName = String(body.roleName ?? current?.roleName ?? '').trim();
  const label = String(body.label ?? current?.label ?? '').trim();
  const description =
    body.description === undefined
      ? current?.description
      : body.description === null
        ? null
        : String(body.description).trim();
  if (!key || !roleName || !label) {
    throw new AppError('party role type key, roleName and label are required', {
      code: 'PARTY_ROLE_TYPE_INVALID',
      statusCode: 400,
    });
  }
  if (!IDENTIFIER.test(key) || !IDENTIFIER.test(roleName)) {
    throw new AppError('party role type key and roleName must be lowercase identifiers', {
      code: 'PARTY_ROLE_TYPE_INVALID',
      statusCode: 400,
    });
  }
  return { key, roleName, label, description: description || null };
};

// Casos de uso de tipos de party (Studio -> Partes). Rota HTTP e tool MCP chamam o mesmo código,
// com papel, governança de draft, auditoria e evento TMF688.
export class PartyRoleTypeService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly repository: PartyRoleTypeRepository,
    private readonly studio: PartyRoleTypeDraftGuard,
    private readonly eventService: EventService,
  ) {}

  public async list(context: RequestContext): Promise<PartyRoleType[]> {
    requireRoles(context, INVENTORY_READ_ROLES);
    return await this.repository.list(context.tenantId);
  }

  public async create(
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<PartyRoleType> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('parties', context);
    const input = parsePartyRoleTypeInput(body);
    if (await this.repository.findByKey(context.tenantId, input.key)) throw this.conflict();
    const created = await this.repository.create(context.tenantId, input);
    await this.record('create', created, context, { after: created });
    return created;
  }

  public async update(
    id: string,
    body: Record<string, unknown>,
    context: RequestContext,
  ): Promise<PartyRoleType | null> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('parties', context);
    const current = await this.require(id, context);
    const input = parsePartyRoleTypeInput(body, current);
    const clash = await this.repository.findByKey(context.tenantId, input.key);
    if (clash && clash.id !== current.id) throw this.conflict();
    const updated = await this.repository.update(
      context.tenantId,
      id,
      input as UpdatePartyRoleTypeInput,
    );
    if (updated) await this.record('update', updated, context, { before: current, after: updated });
    return updated;
  }

  // Soft-delete (C6): inativa; recusa quando há organizações ou especificações usando o papel.
  public async deactivate(id: string, context: RequestContext): Promise<PartyRoleType | null> {
    requireRoles(context, CATALOG_ADMIN_ROLES);
    await this.studio.assertActiveDraft('parties', context);
    const current = await this.require(id, context);
    const usage = await this.repository.getUsage(context.tenantId, current.roleName, current.id);
    if (usage.organizationCount > 0 || usage.resourceSpecificationCount > 0) {
      throw new AppError(
        `Não é possível inativar o papel "${current.label}" porque ele está em uso (${usage.organizationCount} organizações, ${usage.resourceSpecificationCount} especificações de recurso).`,
        { code: 'PARTY_ROLE_TYPE_IN_USE', statusCode: 409 },
      );
    }
    const deactivated = await this.repository.deactivate(context.tenantId, id);
    if (deactivated) {
      await this.record('delete', deactivated, context, { before: current, after: deactivated });
    }
    return deactivated;
  }

  private async require(id: string, context: RequestContext): Promise<PartyRoleType> {
    const current = await this.repository.get(context.tenantId, id);
    if (!current) {
      throw new AppError('party role type not found', {
        code: 'PARTY_ROLE_TYPE_NOT_FOUND',
        statusCode: 404,
      });
    }
    return current;
  }

  private conflict(): AppError {
    return new AppError('party role type key already exists', {
      code: 'PARTY_ROLE_TYPE_CONFLICT',
      statusCode: 409,
    });
  }

  private async record(
    action: AuditAction,
    entity: PartyRoleType,
    context: RequestContext,
    states: { before?: unknown; after?: unknown },
  ): Promise<void> {
    const event = await this.eventService.appendEvent({
      eventType: `PartyRoleType${action === 'create' ? 'Create' : action === 'delete' ? 'Delete' : 'AttributeValueChange'}Event`,
      source: 'party.PartyRoleType',
      correlationId: entity.id,
      eventData: {
        entityId: entity.id,
        entityType: 'PartyRoleType',
        payload: states.after ?? entity,
      },
    });
    await recordMutation(this.db, context, {
      action,
      entityType: 'PartyRoleType',
      entityId: entity.id,
      ...(states.before !== undefined ? { before: states.before } : {}),
      ...(states.after !== undefined ? { after: states.after } : {}),
      event,
      topic: 'tmf688.party',
    });
  }
}
