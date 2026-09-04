import { useState } from 'react';
import { X, Move, AlertCircle } from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogTreeNode,
  MoveResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-[24px] border border-app-border bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-app-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
              <Move className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-app-text text-[1.1rem]">Mover Nó do Catálogo</h3>
              <p className="text-[0.78rem] text-app-muted">{node.name} ({node.code})</p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[14px] border border-app-border px-4 py-2 text-[0.84rem] font-medium text-app-muted hover:bg-black/[0.02]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[14px] bg-app-accent px-5 py-2 text-[0.84rem] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition shadow-soft"
            >
              {submitting ? 'Movendo...' : 'Confirmar Movimentação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
