import { Activity, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listStudioAudit, type StudioAuditEntry, type StudioDomain } from '../../services/studioApi';

const domains: Array<{ value: StudioDomain; label: string }> = [
  { value: 'resource-model', label: 'Modelo de recursos' },
  { value: 'location-model', label: 'Modelo de locais' },
  { value: 'spatial', label: 'Espacial' },
  { value: 'geo-experience', label: 'Experiência GEO' },
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

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-app-accent-border bg-app-accent-soft text-app-text">
            <Activity className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="font-display text-[1.5rem] font-semibold text-app-text">Eventos</h1>
            <p className="mt-1 text-[0.88rem] leading-5 text-app-muted">
              Trilha de auditoria de drafts e publicações do tenant por domínio do Studio.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-app-border px-3 py-2 text-[0.82rem] font-semibold text-app-text transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          Atualizar
        </button>
      </div>

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
        <p className="mb-4 flex items-start gap-2 rounded-[14px] border border-app-border bg-app-accent-soft px-3 py-3 text-[0.82rem] leading-5 text-app-text" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
              <th className="px-5 py-3">Data e hora</th>
              <th className="px-5 py-3">Evento</th>
              <th className="px-5 py-3">Versão</th>
              <th className="px-5 py-3">Ator</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-5 text-[0.88rem] text-app-muted">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos…</span>
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-5 text-[0.88rem] text-app-muted">
                  Nenhum evento registrado para este domínio.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-app-border text-[0.88rem] text-app-text last:border-0">
                  <td className="px-5 py-3 text-app-muted">{formatDateTime(entry.eventTime)}</td>
                  <td className="px-5 py-3 font-medium">{actionLabel[entry.action]}</td>
                  <td className="px-5 py-3 text-app-muted">v{entry.versionNumber}</td>
                  <td className="px-5 py-3 font-mono text-[0.8rem] text-app-muted">{entry.actorSub}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
