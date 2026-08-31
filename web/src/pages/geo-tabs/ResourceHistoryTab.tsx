import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import {
  fetchPhysicalResourceAudit,
  type ResourceAuditEntry,
} from '../../services/resourceApi';
import { ADMIN_STATE_LABELS, OP_STATE_LABELS, USAGE_STATE_LABELS } from '../../utils/resourceStateLabels';

export type ResourceHistoryTabProps = {
  resourceId: string;
};

const SID_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
  terminated: 'Terminado',
};

const TRACKED_FIELDS: Array<{
  key: string;
  label: string;
  read: (snapshot: Record<string, unknown>) => string | null;
}> = [
  { key: 'name', label: 'Nome', read: (s) => (typeof s.name === 'string' ? s.name : null) },
  {
    key: 'status',
    label: 'Status SID',
    read: (s) => (typeof s.status === 'string' ? SID_STATUS_LABELS[s.status] ?? s.status : null),
  },
  {
    key: 'statusCode',
    label: 'Estado Granular',
    read: (s) => (typeof s.statusCode === 'string' ? s.statusCode : null),
  },
  {
    key: 'administrativeState',
    label: 'Estado Administrativo',
    read: (s) =>
      typeof s.administrativeState === 'string'
        ? ADMIN_STATE_LABELS[s.administrativeState] ?? s.administrativeState
        : null,
  },
  {
    key: 'operationalState',
    label: 'Estado Operacional',
    read: (s) =>
      typeof s.operationalState === 'string'
        ? OP_STATE_LABELS[s.operationalState] ?? s.operationalState
        : null,
  },
  {
    key: 'usageState',
    label: 'Estado de Uso',
    read: (s) =>
      typeof s.usageState === 'string'
        ? USAGE_STATE_LABELS[s.usageState] ?? s.usageState
        : null,
  },
  { key: 'label', label: 'Etiqueta', read: (s) => (typeof s.label === 'string' ? s.label : null) },
  {
    key: 'assetReference',
    label: 'Imobilizado (SAP)',
    read: (s) => (typeof s.assetReference === 'string' ? s.assetReference : null),
  },
  {
    key: 'serialNumber',
    label: 'Nº de Série',
    read: (s) => (typeof s.serialNumber === 'string' ? s.serialNumber : null),
  },
  {
    key: 'partNumber',
    label: 'Part Number',
    read: (s) => (typeof s.partNumber === 'string' ? s.partNumber : null),
  },
  {
    key: 'place',
    label: 'Local',
    read: (s) =>
      s.place && typeof s.place === 'object' && 'id' in s.place
        ? String((s.place as { id: unknown }).id)
        : null,
  },
  {
    key: 'resourceSpecificationId',
    label: 'Especificação',
    read: (s) => (typeof s.resourceSpecificationId === 'string' ? s.resourceSpecificationId : null),
  },
];

const actionLabel = (action: string): string => {
  if (action === 'create') return 'Recurso criado';
  if (action === 'activate' || action === 'suspend' || action === 'terminate' || action === 'transition') {
    return 'Status alterado';
  }
  return 'Recurso atualizado';
};

function diffOf(entry: ResourceAuditEntry): string[] {
  if (entry.action === 'create') return [actionLabel(entry.action)];
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const changes: string[] = [];
  for (const field of TRACKED_FIELDS) {
    const previous = field.read(before);
    const next = field.read(after);
    if (previous !== next) {
      changes.push(`${field.label}: ${previous ?? '—'} → ${next ?? '—'}`);
    }
  }
  return changes.length > 0 ? changes : [actionLabel(entry.action)];
}

/**
 * Aba Histórico do painel de Recurso (issue #171): projeção de leitura do log de auditoria
 * (`tmf_audit_log` via `GET /v1/resources/:id/audit`), com diff raso sobre as mutações registradas.
 */
export function ResourceHistoryTab({ resourceId }: ResourceHistoryTabProps) {
  const [entries, setEntries] = useState<ResourceAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPhysicalResourceAudit(resourceId)
      .then((result) => !cancelled && setEntries(result))
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  if (loading) {
    return <div className="px-2 py-3 text-[0.82rem] text-app-muted">Carregando histórico…</div>;
  }

  if (!entries.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
        Sem histórico de alterações registrado.
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime(),
  );

  return (
    <div className="grid gap-2">
      {sorted.map((entry) => (
        <div key={entry.id} className="rounded-[14px] border border-app-border p-3">
          <div className="flex items-start gap-2.5">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="grid gap-0.5">
                {diffOf(entry).map((line) => (
                  <p
                    key={line}
                    className="break-words text-[0.84rem] leading-snug text-app-text [overflow-wrap:anywhere]"
                  >
                    {line}
                  </p>
                ))}
              </div>
              <p className="mt-1 text-[0.72rem] text-app-muted">
                {new Date(entry.eventTime).toLocaleString('pt-BR')} · {entry.actorSub}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
