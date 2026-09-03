import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { fetchSiteAudit, type GeoAuditLog } from '../../services/geoApi';
import { siteStatusLabel } from '../../utils/geoLabels';

export type SiteHistoryTabProps = {
  siteId: string;
};

// Campos do GeographicSite relevantes para o histórico legível — um shallow diff, não uma
// comparação profunda do JSON inteiro (characteristic, siteAddress…), que exporia campos
// técnicos demais para o usuário de campo que esta aba serve.
const TRACKED_FIELDS: Array<{
  key: string;
  label: string;
  read: (snapshot: Record<string, unknown>) => string | null;
}> = [
  { key: 'name', label: 'Nome', read: (s) => (typeof s.name === 'string' ? s.name : null) },
  {
    key: 'status',
    label: 'Status',
    read: (s) => (typeof s.status === 'string' ? siteStatusLabel(s.status) : null),
  },
  { key: 'note', label: 'Observação', read: (s) => (typeof s.note === 'string' ? s.note : null) },
  {
    key: 'parentSite',
    label: 'Local Pai',
    read: (s) =>
      s.parentSite && typeof s.parentSite === 'object' && 'id' in s.parentSite
        ? String((s.parentSite as { id: unknown }).id)
        : null,
  },
  {
    key: 'address',
    label: 'Endereço',
    read: (s) =>
      s.address && typeof s.address === 'object' && 'id' in s.address
        ? String((s.address as { id: unknown }).id)
        : null,
  },
  {
    key: 'siteSpecificationId',
    label: 'Tipo',
    read: (s) => (typeof s.siteSpecificationId === 'string' ? s.siteSpecificationId : null),
  },
];

const actionLabel = (action: string): string => {
  if (action === 'create') return 'Local criado';
  if (action === 'transition') return 'Status alterado';
  return 'Local atualizado';
};

function diffOf(entry: GeoAuditLog): string[] {
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
 * Aba Histórico do painel unificado de Local (REQ-MOD01-016): o log de auditoria do Site
 * (tmf_audit_log, já existente via GET /v1/geo/sites/:id/audit), traduzido em o que mudou,
 * quando e por quem.
 */
export function SiteHistoryTab({ siteId }: SiteHistoryTabProps) {
  const [entries, setEntries] = useState<GeoAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSiteAudit(siteId)
      .then((result) => !cancelled && setEntries(result))
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

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
                    className="break-words text-[0.84rem] leading-snug text-app-text"
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
