import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  getStudioStatus,
  listStudioAudit,
  type StudioAuditEntry,
  type StudioDomain,
  type StudioStatus,
} from '../services/studioApi';
import { Badge, Card } from './ui';

/**
 * Visão agregada dos oito `StudioDomain` (issue #191) — não é um nono domínio governado, só um
 * painel de leitura que soma `getStudioStatus` + `listStudioAudit` por domínio. Substitui o
 * `EmptyState` que a seção "Governança" mostrava antes de nenhum domínio ter adapter real.
 */
const DOMAIN_LABELS: Record<StudioDomain, string> = {
  'resource-model': 'Recursos',
  'location-model': 'Locais',
  spatial: 'Camadas',
  'studio-geo': 'Mapa',
  parties: 'Partes',
  'reference-data': 'Dados de referência',
  'rules-workflows': 'Regras e workflows',
  templates: 'Templates',
};

const STUDIO_DOMAINS: StudioDomain[] = [
  'resource-model',
  'location-model',
  'spatial',
  'studio-geo',
  'parties',
  'reference-data',
  'rules-workflows',
  'templates',
];

const AUDIT_ACTION_LABELS: Record<StudioAuditEntry['action'], string> = {
  'draft-created': 'Draft criado',
  'draft-updated': 'Draft atualizado',
  'draft-validated': 'Draft validado',
  published: 'Publicado',
  discarded: 'Descartado',
};

const formatDateTime = (value?: string): string => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
};

type DomainRow = {
  domain: StudioDomain;
  status: StudioStatus | null;
  lastAudit: StudioAuditEntry | null;
  error: string | null;
};

export function StudioGovernanceOverview() {
  const [rows, setRows] = useState<DomainRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      STUDIO_DOMAINS.map(async (domain): Promise<DomainRow> => {
        try {
          const [status, audit] = await Promise.all([
            getStudioStatus(domain),
            listStudioAudit(domain, { limit: 1 }),
          ]);
          return { domain, status, lastAudit: audit[0] ?? null, error: null };
        } catch (err) {
          return {
            domain,
            status: null,
            lastAudit: null,
            error: err instanceof Error ? err.message : 'Falha ao carregar domínio',
          };
        }
      }),
    ).then((next) => {
      if (!cancelled) {
        setRows(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !rows) {
    return (
      <div className="flex items-center gap-2 text-[0.82rem] text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Carregando domínios do Studio...</span>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Domínios do Studio">
      {rows.map((row) => {
        const draft = row.status?.draftVersion;
        const published = row.status?.publishedVersion;
        const editing = Boolean(draft);

        return (
          <Card key={row.domain} pad={14} role="listitem">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[0.88rem] font-semibold text-app-text">
                {DOMAIN_LABELS[row.domain]}
              </h3>
              {row.error ? (
                <Badge tone="red">Erro</Badge>
              ) : editing ? (
                <Badge tone="amber">Draft aberto</Badge>
              ) : published ? (
                <Badge tone="green">Publicado</Badge>
              ) : (
                <Badge tone="neutral">Sem versão</Badge>
              )}
            </div>

            {row.error ? (
              <p className="mt-2 flex items-center gap-1.5 text-[0.78rem] text-status-red">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{row.error}</span>
              </p>
            ) : (
              <dl className="mt-2 space-y-1 text-[0.78rem]">
                <div className="flex justify-between gap-2">
                  <dt className="text-app-muted">Versão publicada</dt>
                  <dd className="text-app-text">
                    {published ? `v${published.versionNumber}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-app-muted">Publicada em</dt>
                  <dd className="text-app-text">{formatDateTime(published?.publishedAt)}</dd>
                </div>
                {editing ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-app-muted">Draft desde</dt>
                    <dd className="text-app-text">{formatDateTime(draft?.createdAt)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="text-app-muted">Última auditoria</dt>
                  <dd className="text-app-text">
                    {row.lastAudit
                      ? `${AUDIT_ACTION_LABELS[row.lastAudit.action]} · ${formatDateTime(row.lastAudit.eventTime)}`
                      : '—'}
                  </dd>
                </div>
              </dl>
            )}
          </Card>
        );
      })}
    </div>
  );
}
