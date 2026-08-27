import type { DatabaseClient } from './database-client.js';
import type { RequestContext } from '../http/request-context.js';
import { createCanonicalId } from '../utils/canonical-id.js';

// Trilha de auditoria + outbox compartilhada por todos os módulos TMF (Resource/Service/Order/
// Party) — mesmo par de tabelas que o Geo já escreve via GeoRepository.appendAudit/appendOutbox
// (ver src/modules/geo/postgres-repository.ts e service.ts#recordMutation), só que aqui como
// função livre sobre DatabaseClient em vez de método de uma interface de repositório específica,
// para não obrigar Resource/Service/Order/Party a crescerem um método de repositório só para
// isto. Ver docs/3-system-design/security.md §5 (auditoria) e C7 (event-driven/outbox).

export type AuditAction = 'create' | 'update' | 'delete';

export type RecordMutationInput = {
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** Evento TMF688 já persistido (id/eventTime) — a auditoria e o outbox reusam sua identidade,
   *  em vez de gerar uma segunda cronologia divergente da do event log. */
  event: { id: string; eventTime: string };
  /** Tópico do outbox — convenção `tmf688.<módulo>`, espelhando `tmf688.geo`. */
  topic: string;
};

export const recordMutation = async (
  db: DatabaseClient,
  context: RequestContext,
  input: RecordMutationInput,
): Promise<void> => {
  await db.run(
    `INSERT INTO tmf_audit_log
     (id, tenant_id, actor_sub, action, entity_type, entity_id, event_time, before_state, after_state, trace_id, source_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createCanonicalId(),
      context.tenantId,
      context.actorSub,
      input.action,
      input.entityType,
      input.entityId,
      input.event.eventTime,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      context.traceId,
      context.sourceIp ?? null,
    ],
  );

  await db.run(
    `INSERT INTO tmf_outbox (id, tenant_id, event_id, topic, payload, status, created_at, published_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    [
      createCanonicalId(),
      context.tenantId,
      input.event.id,
      input.topic,
      JSON.stringify(input.after ?? input.before ?? null),
      input.event.eventTime,
    ],
  );
};
