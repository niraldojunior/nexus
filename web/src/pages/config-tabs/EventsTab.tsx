import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listStudioAudit, type StudioAuditEntry, type StudioDomain } from '../../services/studioApi';
import PageHead from '../../components/ui/PageHead';
import Button from '../../components/ui/Button';
import DataTable, { type DataTableColumn } from '../../components/ui/DataTable';

const domains: Array<{ value: StudioDomain; label: string }> = [
  { value: 'resource-model', label: 'Modelo de recursos' },
  { value: 'location-model', label: 'Modelo de locais' },
  { value: 'spatial', label: 'Espacial' },
  { value: 'studio-geo', label: 'Locais' },
  { value: 'parties', label: 'Partes' },
  { value: 'reference-data', label: 'Dados de referência' },
  { value: 'rules-workflows', label: 'Regras e workflows' },
  { value: 'templates', label: 'Templates' },
];

const actionLabel: Record<StudioAuditEntry['action'], string> = {
  'draft-created': 'Draft criado',
  'draft-updated': 'Draft atualizado',
  'draft-validated': 'Draft validado',
  published: 'Versão publicada',
  discarded: 'Draft descartado',
};

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));

/** Consulta tenant-scoped à trilha de publicação do Studio; não usa o feed TMF688 transversal. */
export function EventsTab() {
  const [domain, setDomain] = useState<StudioDomain>('resource-model');
  const [entries, setEntries] = useState<StudioAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listStudioAudit(domain, { limit: 100 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os eventos.');
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<StudioAuditEntry>[] = useMemo(
    () => [
      {
        key: 'eventTime',
        header: 'Data e hora',
        render: (entry) => (
          <span style={{ color: 'var(--text-secondary)' }}>{formatDateTime(entry.eventTime)}</span>
        ),
      },
      {
        key: 'action',
        header: 'Evento',
        render: (entry) => (
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {actionLabel[entry.action]}
          </span>
        ),
      },
      {
        key: 'versionNumber',
        header: 'Versão',
        render: (entry) => (
          <span style={{ color: 'var(--text-secondary)' }}>v{entry.versionNumber}</span>
        ),
      },
      {
        key: 'actorSub',
        header: 'Ator',
        render: (entry) => (
          <span className="font-mono text-[0.8rem]" style={{ color: 'var(--text-secondary)' }}>
            {entry.actorSub}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHead
        title="Eventos"
        subtitle="Trilha de auditoria de drafts e publicações do tenant por domínio do Studio."
        actions={
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
            iconLeft={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Atualizar
          </Button>
        }
      />

      <label className="mb-4 block max-w-md text-[0.82rem] font-semibold text-app-text">
        Domínio
        <select
          value={domain}
          onChange={(event) => setDomain(event.target.value as StudioDomain)}
          className="geo-input mt-1.5"
        >
          {domains.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p
          className="mb-4 flex items-start gap-2 rounded-[14px] border border-app-border bg-app-accent-soft px-3 py-3 text-[0.82rem] leading-5 text-app-text"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry.id}
        emptyMessage={
          loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos…
            </span>
          ) : (
            'Nenhum evento registrado para este domínio.'
          )
        }
      />
    </div>
  );
}
