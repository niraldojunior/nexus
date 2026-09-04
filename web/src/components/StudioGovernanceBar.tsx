import { AlertTriangle, CheckCircle2, Clock3, Loader2, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  discardStudioDraft,
  getStudioStatus,
  publishStudioDraft,
  saveStudioDraft,
  validateStudioDraft,
  type StudioDomain,
  type StudioStatus,
} from '../services/studioApi';

type StudioGovernanceBarProps = {
  domain: StudioDomain;
  canEdit: boolean;
  canAdmin: boolean;
};

const formatDateTime = (value?: string): string => {
  if (!value) return 'Ainda não publicado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
};

/**
 * Faixa reutilizável de ciclo de vida de metadata. O conteúdo continua a cargo do editor de cada
 * domínio; este componente só opera o envelope comum draft → validate → publish/discard.
 */
export function StudioGovernanceBar({ domain, canEdit, canAdmin }: StudioGovernanceBarProps) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'create' | 'validate' | 'publish' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getStudioStatus(domain));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a governança.');
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runAction = async (
    action: 'create' | 'validate' | 'publish' | 'discard',
    work: () => Promise<unknown>,
  ) => {
    setBusy(action);
    setError(null);
    try {
      await work();
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(null);
    }
  };

  const draft = status?.draftVersion;
  const published = status?.publishedVersion;
  const validation = draft?.validation;
  // Um draft recém-criado ou recém-editado ainda não tem `validation` — tratar essa ausência
  // como "sem erro" habilitaria Publicar sem nunca ter passado por Validar, e o backend só
  // valida de fato dentro de publish(), respondendo 422 quando o snapshot é inválido (ex.:
  // Studio Spatial sem `coverages`). Exigir `validation.valid === true` fecha essa lacuna.
  const isValidated = validation?.valid === true;
  const validationIssues = validation?.issues ?? [];

  return (
    <section
      aria-label="Governança da publicação"
      className="rounded-[22px] border border-app-border bg-white p-4 shadow-soft sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-app-accent-border bg-app-accent-soft text-app-text">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-[1.05rem] font-semibold text-app-text">Governança</h3>
            <p className="mt-0.5 text-[0.84rem] leading-5 text-app-muted">
              Consumidores operacionais leem somente a versão publicada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-2 text-[0.82rem] text-app-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando
            </span>
          ) : draft ? (
            <>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void runAction('validate', () => validateStudioDraft(domain))}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-app-border px-3 py-2 text-[0.82rem] font-semibold text-app-text transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Validar
                </button>
              ) : null}
              {canAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runAction('discard', () => discardStudioDraft(domain, draft.checksum))}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-xl border border-app-border px-3 py-2 text-[0.82rem] font-semibold text-app-text transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction('publish', () => publishStudioDraft(domain, draft.checksum))}
                    disabled={busy !== null || !isValidated}
                    title={!isValidated ? 'Valide o draft antes de publicar.' : undefined}
                    className="inline-flex items-center gap-2 rounded-xl bg-app-accent px-3 py-2 text-[0.82rem] font-semibold text-app-text transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publicar
                  </button>
                </>
              ) : null}
            </>
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => void runAction('create', () => saveStudioDraft(domain, {}))}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-app-accent px-3 py-2 text-[0.82rem] font-semibold text-app-text transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
              Criar draft
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-app-border bg-app-accent-soft px-3 py-2 text-[0.82rem] leading-5 text-app-text" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && status ? (
        <dl className="mt-4 grid gap-3 border-t border-app-border pt-4 text-[0.84rem] sm:grid-cols-3">
          <div>
            <dt className="text-app-muted">Published</dt>
            <dd className="mt-1 font-semibold text-app-text">
              {published ? `v${published.versionNumber} · ${formatDateTime(published.publishedAt)}` : 'Nenhuma versão'}
            </dd>
          </div>
          <div>
            <dt className="text-app-muted">Draft</dt>
            <dd className="mt-1 font-semibold text-app-text">
              {draft ? `v${draft.versionNumber} · alterado ${formatDateTime(draft.createdAt)}` : 'Sem alterações pendentes'}
            </dd>
          </div>
          <div>
            <dt className="text-app-muted">Validação</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-semibold text-app-text">
              {validation ? (
                validation.valid ? (
                  <><CheckCircle2 className="h-4 w-4" /> Sem impedimentos</>
                ) : (
                  <><AlertTriangle className="h-4 w-4" /> {validation.issues.length} impedimento(s)</>
                )
              ) : draft ? (
                'Pendente'
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      ) : null}

      {validationIssues.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-app-border pt-4 text-[0.82rem] text-app-text">
          {validationIssues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex items-start gap-2">
              <AlertTriangle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}
              />
              <span>
                {issue.message}
                {issue.path ? <span className="text-app-muted"> ({issue.path})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
