import { useState, useEffect } from 'react';
import { X, AlertTriangle, AlertCircle, Trash2 } from 'lucide-react';
import type { GeoSpec, ContainmentImpactResult } from '../../../services/geoApi';
import { getGeoSpecImpact } from '../../../services/geoApi';

export type LocationSpecImpactModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmRetire: () => Promise<void>;
  spec: GeoSpec;
};

export function LocationSpecImpactModal({
  isOpen,
  onClose,
  onConfirmRetire,
  spec,
}: LocationSpecImpactModalProps) {
  const [impact, setImpact] = useState<ContainmentImpactResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      // Aposentar não altera as regras de contenção existentes (o backend preserva
      // allowedParentSpecIds/allowedChildSpecIds ao definir lifecycleStatus=Retired) —
      // avaliamos o impacto de uma remoção total das regras como sinal de alerta sobre
      // sites que hoje dependem desta especificação como pai ou filho direto.
      getGeoSpecImpact(spec.id, { allowedParentSpecIds: [], allowedChildSpecIds: [] })
        .then(setImpact)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Erro ao carregar análise de impacto.';
          setError(msg);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, spec.id]);

  if (!isOpen) return null;

  const hasImpact = impact && (impact.impactedParentAssignments > 0 || impact.impactedChildAssignments > 0);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await onConfirmRetire();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao aposentar especificação.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-[24px] border border-app-border bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-app-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-red-50 text-red-600 border border-red-200">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-app-text text-[1.1rem]">Aposentar Especificação de Local</h3>
              <p className="text-[0.78rem] text-app-muted">
                {spec.name} ({spec.code})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-app-muted hover:bg-black/[0.04] hover:text-app-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-red-200 bg-red-50 p-3 text-[0.84rem] text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[0.85rem] text-app-muted">
              Calculando impacto de contenção...
            </div>
          ) : (
            <>
              <p className="text-[0.88rem] text-app-text leading-relaxed">
                Você está prestes a aposentar <strong>{spec.name}</strong>. Conforme o cânone
                arquitetural C6, a inativação é lógica (soft-terminate) — a especificação passa a
                <code className="mx-1 rounded bg-black/[0.05] px-1 py-0.5 text-[0.8rem]">lifecycleStatus=Retired</code>
                e não pode mais ser usada para novos locais, mas locais existentes são preservados.
              </p>

              {hasImpact && (
                <div className="rounded-[16px] border border-red-200 bg-red-50/70 p-4 text-red-800 text-[0.84rem]">
                  <strong className="font-semibold block mb-1">Atenção: locais dependem desta especificação</strong>
                  Há locais ativos cuja relação de contenção (pai ou filho direto) depende desta
                  especificação. Reveja essas relações antes de aposentá-la.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-[14px] border border-app-border p-3 bg-app-bg/50">
                  <span className="text-[0.7rem] font-semibold uppercase text-app-muted">
                    Impacto como Pai
                  </span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.impactedParentAssignments ?? 0}
                  </p>
                </div>
                <div className="rounded-[14px] border border-app-border p-3 bg-app-bg/50">
                  <span className="text-[0.7rem] font-semibold uppercase text-app-muted">
                    Impacto como Filho
                  </span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.impactedChildAssignments ?? 0}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[14px] border border-app-border px-4 py-2 text-[0.84rem] font-medium text-app-muted hover:bg-black/[0.02]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-[14px] bg-red-600 px-5 py-2 text-[0.84rem] font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition shadow-soft flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? 'Aposentando...' : 'Aposentar Especificação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
