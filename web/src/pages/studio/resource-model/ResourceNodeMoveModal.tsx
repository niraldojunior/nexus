import { useState } from 'react';
import { Move, AlertCircle } from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogTreeNode,
  MoveResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';
import { Modal, Button } from '../../../components/ui';

export type ResourceNodeMoveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onMove: (input: MoveResourceCatalogNodeInput) => Promise<void>;
  node: ResourceCatalogNode;
  tree: ResourceCatalogTreeNode[];
};

export function ResourceNodeMoveModal({
  isOpen,
  onClose,
  onMove,
  node,
  tree,
}: ResourceNodeMoveModalProps) {
  const [selectedParentId, setSelectedParentId] = useState<string>(node.parentNodeId || '');
  const [sortOrder, setSortOrder] = useState<number>(node.sortOrder || 0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  // Flatten GROUP nodes from tree for parent picker (excluding this node and descendants)
  const groupOptions: Array<{ id: string; name: string; code: string; level: number }> = [];

  const isDescendant = (candidate: ResourceCatalogTreeNode, targetId: string): boolean => {
    if (candidate.id === targetId) return true;
    return candidate.children?.some((child) => isDescendant(child, targetId)) ?? false;
  };

  const collectGroups = (nodes: ResourceCatalogTreeNode[], level = 0) => {
    for (const item of nodes) {
      if (item.kind === 'GROUP') {
        if (item.id !== node.id && !isDescendant(item, node.id)) {
          groupOptions.push({ id: item.id, name: item.name, code: item.code, level });
          if (item.children) collectGroups(item.children, level + 1);
        }
      }
    }
  };
  collectGroups(tree);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      await onMove({
        parentNodeId: selectedParentId || null,
        sortOrder: Number(sortOrder),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao mover nó do catálogo.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      width={480}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
            <Move className="h-5 w-5" />
          </div>
          <div>
            <h3>Mover nó do catálogo</h3>
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
          <Button variant="primary" type="submit" form="resource-node-move-form" disabled={submitting}>
            {submitting ? 'Movendo…' : 'Confirmar movimentação'}
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

        <form id="resource-node-move-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Novo Nó Pai
            </label>
            <select
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            >
              <option value="">Raiz do Catálogo</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {'- '.repeat(g.level)}
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
            <p className="text-[0.75rem] text-app-muted mt-1">
              Grupos que gerariam ciclos foram ocultados da lista.
            </p>
          </div>

          <div>
            <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
              Posição de Ordenação (sortOrder)
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
            />
          </div>

        </form>
      </div>
    </Modal>
  );
}
