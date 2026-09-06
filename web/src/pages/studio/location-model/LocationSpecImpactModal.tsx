import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Trash2 } from 'lucide-react';
import type { GeoSpec, ContainmentImpactResult } from '../../../services/geoApi';
import { getGeoSpecImpact } from '../../../services/geoApi';
import { Modal, Button } from '../../../components/ui';

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
      // Inativar não altera as regras de contenção existentes (o backend preserva
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
      const msg = err instanceof Error ? err.message : 'Falha ao inativar especificação.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      width={560}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-red-200 bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3>Inativar especificação de local</h3>
            <p className="text-[0.78rem] text-app-muted">
              {spec.name} ({spec.code})
            </p>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={submitting}
            iconLeft={<Trash2 className="h-4 w-4" />}
          >
            {submitting ? 'Inativando…' : 'Inativar especificação'}
          </Button>
        </>
      }
    >
      <div>
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[0.85rem] text-app-muted">
              Calculando impacto de contenção...
            </div>
          ) : (
            <>
              <p className="text-[0.88rem] text-app-text leading-relaxed">
                Você está prestes a inativar <strong>{spec.name}</strong>. Conforme o cânone
                arquitetural C6, a inativação é lógica (soft-terminate) — a especificação passa a
                <code className="mx-1 rounded bg-black/[0.05] px-1 py-0.5 text-[0.8rem]">lifecycleStatus=Retired</code>
                e não pode mais ser usada para novos locais, mas locais existentes são preservados.
              </p>

              {hasImpact && (
                <div className="rounded-[16px] border border-red-200 bg-red-50/70 p-4 text-red-800 text-[0.84rem]">
                  <strong className="font-semibold block mb-1">Atenção: locais dependem desta especificação</strong>
                  Há locais ativos cuja relação de contenção (pai ou filho direto) depende desta
                  especificação. Reveja essas relações antes de inativá-la.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Impacto como pai
                  </span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.impactedParentAssignments ?? 0}
                  </p>
                </div>
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Impacto como filho
                  </span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.impactedChildAssignments ?? 0}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
