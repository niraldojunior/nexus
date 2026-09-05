import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Trash2 } from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogNodeImpact,
} from '../../../services/resourceCatalogApi';
import { getResourceCatalogNodeImpact } from '../../../services/resourceCatalogApi';
import { Modal, Button } from '../../../components/ui';

export type ResourceNodeImpactModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmInactivate: () => Promise<void>;
  catalogId: string;
  node: ResourceCatalogNode;
};

export function ResourceNodeImpactModal({
  isOpen,
  onClose,
  onConfirmInactivate,
  catalogId,
  node,
}: ResourceNodeImpactModalProps) {
  const [impact, setImpact] = useState<ResourceCatalogNodeImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      getResourceCatalogNodeImpact(catalogId, node.id)
        .then(setImpact)
        .catch((err) => setError(err.message || 'Erro ao carregar análise de impacto.'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, catalogId, node.id]);

  if (!isOpen) return null;

  const hasDescendants = impact && impact.descendantCount > 0;
  const isGroup = node.kind === 'GROUP';

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await onConfirmInactivate();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao inativar nó.';
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
            <h3>Inativar nó do catálogo</h3>
            <p className="text-[0.78rem] text-app-muted">
              {node.name} ({node.code})
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
            disabled={submitting || Boolean(isGroup && hasDescendants)}
            iconLeft={<Trash2 className="h-4 w-4" />}
          >
            {submitting ? 'Inativando…' : 'Inativar nó'}
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
              Calculando impacto na árvore e inventário...
            </div>
          ) : (
            <>
              <p className="text-[0.88rem] text-app-text leading-relaxed">
                Você está prestes a inativar o nó <strong>{node.name}</strong>. Conforme o cânone
                arquitetural C6, a exclusão é lógica (soft-delete), preservando todo o histórico.
              </p>

              {isGroup && hasDescendants && (
                <div className="rounded-[16px] border border-red-200 bg-red-50/70 p-4 text-red-800 text-[0.84rem]">
                  <strong className="font-semibold block mb-1">Atenção: Nó com filhos diretos</strong>
                  Este grupo possui {impact?.descendantCount} nó(s) subordinado(s). O backend recusa
                  a inativação direta de grupos não-vazios. Remova ou mova os nós filhos antes de
                  inativar este grupo.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Filhos</span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.descendantCount ?? 0}
                  </p>
                </div>
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Specs</span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.specificationCount ?? 0}
                  </p>
                </div>
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Rec. físicos</span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.activePhysicalResourceCount ?? 0}
                  </p>
                </div>
                <div className="rounded-[10px] border border-app-border p-3">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Rec. lógicos</span>
                  <p className="text-[1.1rem] font-semibold text-app-text mt-0.5">
                    {impact?.activeLogicalResourceCount ?? 0}
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
