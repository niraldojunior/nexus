import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Box,
  Plus,
  Move,
  Trash2,
  Edit2,
  AlertCircle,
  Search,
} from 'lucide-react';
import type { ResourceCatalogTreeNode, ResourceCatalogNode } from '../../../services/resourceCatalogApi';

export type ResourceCatalogTreeProps = {
  tree: ResourceCatalogTreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: ResourceCatalogNode) => void;
  onAddChild: (parentNode: ResourceCatalogNode) => void;
  onEditNode: (node: ResourceCatalogNode) => void;
  onMoveNode: (node: ResourceCatalogNode) => void;
  onImpactNode: (node: ResourceCatalogNode) => void;
  canEdit: boolean;
  /** Existe um draft de governança aberto — controla a visibilidade dos botões de mutação. */
  isEditing: boolean;
};

export function ResourceCatalogTree({
  tree,
  selectedNodeId,
  onSelectNode,
  onAddChild,
  onEditNode,
  onMoveNode,
  onImpactNode,
  canEdit,
  isEditing,
}: ResourceCatalogTreeProps) {
  const canMutate = canEdit && isEditing;
  const [filterText, setFilterText] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const matchesFilter = (node: ResourceCatalogTreeNode, filter: string): boolean => {
    if (!filter) return true;
    const term = filter.toLowerCase();
    const matchThis =
      node.name.toLowerCase().includes(term) ||
      node.code.toLowerCase().includes(term) ||
      (node.resourceType?.name && node.resourceType.name.toLowerCase().includes(term));
    if (matchThis) return true;
    return node.children?.some((child) => matchesFilter(child, filter)) ?? false;
  };

  const renderNode = (node: ResourceCatalogTreeNode, level: number) => {
    // Fora do modo de edição (ou seja, depois de publicado), nós inativos somem da hierarquia —
    // soft-delete (C6) preserva o histórico no banco, mas não deve mais aparecer na árvore para
    // quem só está consultando. Em modo de edição eles continuam visíveis (com a tag "Inativo")
    // para permitir reativação/gestão.
    if (!isEditing && node.status === 'inactive') {
      return null;
    }
    if (filterText && !matchesFilter(node, filterText)) {
      return null;
    }

    const isGroup = node.kind === 'GROUP';
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id) || (filterText.length > 0 && hasChildren);

    return (
      <div key={node.id} className="select-none">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectNode(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectNode(node);
            }
          }}
          className={`group flex items-center justify-between gap-1 rounded-[12px] px-2 py-1.5 text-[0.85rem] transition cursor-pointer ${
            isSelected
              ? 'bg-app-accent-soft text-app-text font-semibold'
              : 'text-app-text hover:bg-black/[0.04]'
          }`}
          style={{ paddingLeft: `${Math.max(level * 16 + 8, 8)}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isGroup ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-app-muted hover:text-app-text"
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : (
                  <span className="h-4 w-4 inline-block" />
                )}
              </button>
            ) : (
              <span className="h-5 w-5 shrink-0" />
            )}

            {isGroup ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
              )
            ) : (
              <Box className="h-4 w-4 shrink-0 text-sky-600" />
            )}

            <span className="truncate" title={node.name}>
              {node.name}
            </span>
            {node.status === 'inactive' && (
              <span className="shrink-0 rounded bg-red-100 px-1 py-0.2 text-[0.68rem] font-medium text-red-700">
                Inativo
              </span>
            )}
          </div>

          {canMutate && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2">
              {isGroup && (
                <button
                  type="button"
                  title="Adicionar filho"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(node);
                  }}
                  className="rounded p-1 text-app-muted hover:bg-white hover:text-app-text"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title="Editar"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditNode(node);
                }}
                className="rounded p-1 text-app-muted hover:bg-white hover:text-app-text"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Mover"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveNode(node);
                }}
                className="rounded p-1 text-app-muted hover:bg-white hover:text-app-text"
              >
                <Move className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Análise de impacto / Inativar"
                onClick={(e) => {
                  e.stopPropagation();
                  onImpactNode(node);
                }}
                className="rounded p-1 text-app-muted hover:bg-white hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {isGroup && isExpanded && hasChildren && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Buscar nós por nome ou código..."
          className="w-full rounded-[14px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 max-h-[680px]">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-app-muted">
            <AlertCircle className="h-8 w-8 mb-2 stroke-1" />
            <p className="text-[0.88rem] font-medium">Nenhum nó no catálogo.</p>
            <p className="text-[0.78rem]">Crie o primeiro grupo ou tipo na raiz.</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
