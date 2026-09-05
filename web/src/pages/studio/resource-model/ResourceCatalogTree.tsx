import { useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Box,
  Cpu,
  Plus,
  Trash2,
  AlertCircle,
  Search,
  GripVertical,
} from 'lucide-react';
import type { ResourceCatalogTreeNode, ResourceCatalogNode } from '../../../services/resourceCatalogApi';
import { isLogicalResourceNode } from '../../../utils/resourceNodeNature';

export type DropPosition = 'before' | 'after' | 'inside';

export type ResourceCatalogTreeProps = {
  tree: ResourceCatalogTreeNode[];
  /** Exibe a textbox de busca — alternada pela lupa no cabeçalho, em `ResourceModelStudio`. */
  showSearch: boolean;
  selectedNodeId: string | null;
  onSelectNode: (node: ResourceCatalogNode) => void;
  onAddChild: (parentNode: ResourceCatalogNode) => void;
  onImpactNode: (node: ResourceCatalogNode) => void;
  /** Callback para mover ou reordenar um nó diretamente via arrastar e soltar na árvore. */
  onDirectMove?: (
    nodeId: string,
    parentNodeId: string | null,
    orderedSiblingIds?: string[],
  ) => void | Promise<void>;
  canEdit: boolean;
  /** Existe um draft de governança aberto — controla a visibilidade dos botões de mutação. */
  isEditing: boolean;
};

const getSiblingsOfParent = (
  nodes: ResourceCatalogTreeNode[],
  parentId: string | null,
): ResourceCatalogTreeNode[] => {
  if (parentId === null) {
    return nodes;
  }
  const findParent = (list: ResourceCatalogTreeNode[]): ResourceCatalogTreeNode | null => {
    for (const item of list) {
      if (item.id === parentId) return item;
      if (item.children) {
        const found = findParent(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  const parent = findParent(nodes);
  return parent?.children ?? [];
};

export function ResourceCatalogTree({
  tree,
  showSearch,
  selectedNodeId,
  onSelectNode,
  onAddChild,
  onImpactNode,
  onDirectMove,
  canEdit,
  isEditing,
}: ResourceCatalogTreeProps) {
  const canMutate = canEdit && isEditing;
  const [filterText, setFilterText] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Estado de Arrastar e Soltar (Drag and Drop)
  const [draggedNode, setDraggedNode] = useState<ResourceCatalogTreeNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const [isOverRoot, setIsOverRoot] = useState(false);

  // Ao ocultar a textbox de busca (lupa desligada), limpa o filtro — senão um filtro esquecido
  // continuaria restringindo a árvore de forma invisível.
  useEffect(() => {
    if (!showSearch) setFilterText('');
  }, [showSearch]);

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

  // Verifica recursivamente se targetId é descendente do nó sendo arrastado (evita ciclos)
  const isDescendant = (parent: ResourceCatalogTreeNode, targetId: string): boolean => {
    if (parent.id === targetId) return true;
    return parent.children?.some((child) => isDescendant(child, targetId)) ?? false;
  };

  const handleDragStart = (node: ResourceCatalogTreeNode, e: React.DragEvent) => {
    if (!canMutate) return;
    setDraggedNode(node);
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (targetNode: ResourceCatalogTreeNode, e: React.DragEvent) => {
    if (!canMutate || !draggedNode) return;
    if (draggedNode.id === targetNode.id) return;
    if (isDescendant(draggedNode, targetNode.id)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;

    let nextPosition: DropPosition;
    if (targetNode.kind === 'GROUP') {
      if (relY < 0.25) {
        nextPosition = 'before';
      } else if (relY > 0.75) {
        nextPosition = 'after';
      } else {
        nextPosition = 'inside';
      }
    } else {
      nextPosition = relY < 0.5 ? 'before' : 'after';
    }

    if (dropTargetId !== targetNode.id || dropPosition !== nextPosition) {
      setDropTargetId(targetNode.id);
      setDropPosition(nextPosition);
    }
  };

  const handleDragLeave = (targetNode: ResourceCatalogTreeNode, e: React.DragEvent) => {
    e.stopPropagation();
    const related = e.relatedTarget as HTMLElement | null;
    if (e.currentTarget.contains(related)) return;

    if (dropTargetId === targetNode.id) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  };

  const handleDrop = async (targetNode: ResourceCatalogTreeNode, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canMutate || !draggedNode || draggedNode.id === targetNode.id) {
      setDraggedNode(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }
    if (isDescendant(draggedNode, targetNode.id)) {
      setDraggedNode(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const pos = dropPosition ?? (targetNode.kind === 'GROUP' ? 'inside' : 'after');

    let targetParentId: string | null = null;
    let orderedSiblingIds: string[] = [];

    if (pos === 'inside') {
      targetParentId = targetNode.id;
      const rawSiblings = getSiblingsOfParent(tree, targetParentId);
      const siblingIds = rawSiblings.map((s) => s.id).filter((id) => id !== draggedNode.id);
      orderedSiblingIds = [...siblingIds, draggedNode.id];
      // Auto-expande o grupo destino
      setExpandedIds((prev) => new Set(prev).add(targetNode.id));
    } else {
      targetParentId = targetNode.parentNodeId ?? null;
      const rawSiblings = getSiblingsOfParent(tree, targetParentId);
      const siblingIds = rawSiblings.map((s) => s.id).filter((id) => id !== draggedNode.id);
      const targetIdx = siblingIds.indexOf(targetNode.id);
      if (targetIdx === -1) {
        orderedSiblingIds = [...siblingIds, draggedNode.id];
      } else if (pos === 'before') {
        orderedSiblingIds = [
          ...siblingIds.slice(0, targetIdx),
          draggedNode.id,
          ...siblingIds.slice(targetIdx),
        ];
      } else {
        // pos === 'after'
        orderedSiblingIds = [
          ...siblingIds.slice(0, targetIdx + 1),
          draggedNode.id,
          ...siblingIds.slice(targetIdx + 1),
        ];
      }
    }

    try {
      await onDirectMove?.(draggedNode.id, targetParentId, orderedSiblingIds);
    } finally {
      setDraggedNode(null);
      setDropTargetId(null);
      setDropPosition(null);
      setIsOverRoot(false);
    }
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDropTargetId(null);
    setDropPosition(null);
    setIsOverRoot(false);
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
    const isBeingDragged = draggedNode?.id === node.id;
    const isCurrentDropTarget = dropTargetId === node.id;

    // Indicadores visuais para reordenação (antes / depois) e reparenting (dentro de grupo)
    const showDropTop = isCurrentDropTarget && dropPosition === 'before';
    const showDropBottom = isCurrentDropTarget && dropPosition === 'after';
    const showDropInside = isCurrentDropTarget && dropPosition === 'inside';

    return (
      <div key={node.id} className="relative select-none">
        {/* Linha indicadora azul de inserção ANTES do nó */}
        {showDropTop && (
          <div
            className="absolute -top-0.5 left-2 right-2 h-0.5 bg-app-accent rounded z-10 pointer-events-none"
            style={{ marginLeft: `${Math.max(level * 16 + 8, 8)}px` }}
          />
        )}

        <div
          role="button"
          tabIndex={0}
          draggable={canMutate}
          onDragStart={(e) => handleDragStart(node, e)}
          onDragOver={(e) => handleDragOver(node, e)}
          onDragLeave={(e) => handleDragLeave(node, e)}
          onDrop={(e) => handleDrop(node, e)}
          onDragEnd={handleDragEnd}
          onClick={() => onSelectNode(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectNode(node);
            }
          }}
          className={`group flex items-center justify-between gap-1 rounded-[12px] px-2 py-1.5 text-[0.85rem] transition ${
            canMutate ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
          } ${isBeingDragged ? 'opacity-30 scale-[0.98]' : ''} ${
            showDropInside
              ? 'ring-2 ring-app-accent bg-app-accent-soft text-app-text font-semibold'
              : isSelected
                ? 'bg-app-accent-soft text-app-text font-semibold'
                : 'text-app-text hover:bg-black/[0.04]'
          }`}
          style={{ paddingLeft: `${Math.max(level * 16 + 8, 8)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {canMutate && (
              <span
                title="Arraste para mover para outro pai ou posição"
                className="text-app-muted/60 group-hover:text-app-text cursor-grab active:cursor-grabbing p-0.5 -ml-1 shrink-0"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}

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
            ) : isLogicalResourceNode(node) ? (
              <Cpu className="h-4 w-4 shrink-0 text-purple-600" />
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

          {canMutate && !isBeingDragged && (
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

        {/* Linha indicadora azul de inserção DEPOIS do nó */}
        {showDropBottom && (
          <div
            className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-app-accent rounded z-10 pointer-events-none"
            style={{ marginLeft: `${Math.max(level * 16 + 8, 8)}px` }}
          />
        )}

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
      {showSearch && (
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
          <input
            type="text"
            autoFocus
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar nós por nome ou código..."
            className="w-full rounded-[14px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.84rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 max-h-[680px]">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-app-muted">
            <AlertCircle className="h-8 w-8 mb-2 stroke-1" />
            <p className="text-[0.88rem] font-medium">Nenhum nó no catálogo.</p>
            <p className="text-[0.78rem]">Crie o primeiro grupo ou tipo na raiz.</p>
          </div>
        ) : (
          <>
            {tree.map((node) => renderNode(node, 0))}

            {/* Zona de soltar para a raiz: visível enquanto arrasta um nó que não está na raiz */}
            {canMutate && draggedNode && draggedNode.parentNodeId !== null && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setIsOverRoot(true);
                  setDropTargetId(null);
                }}
                onDragLeave={() => setIsOverRoot(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!draggedNode) return;
                  const rootSiblings = getSiblingsOfParent(tree, null);
                  const rootSiblingIds = rootSiblings
                    .map((s) => s.id)
                    .filter((id) => id !== draggedNode.id);
                  const orderedIds = [...rootSiblingIds, draggedNode.id];
                  try {
                    await onDirectMove?.(draggedNode.id, null, orderedIds);
                  } finally {
                    setDraggedNode(null);
                    setDropTargetId(null);
                    setIsOverRoot(false);
                  }
                }}
                className={`mt-2 rounded-[12px] border-2 border-dashed p-3 text-center text-[0.8rem] transition ${
                  isOverRoot
                    ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                    : 'border-app-border text-app-muted hover:border-app-accent hover:text-app-text'
                }`}
              >
                Mover para a raiz da hierarquia
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
