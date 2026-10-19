import { useEffect, useRef, useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, Folder, Search } from 'lucide-react';
import type { ResourceCatalogTreeNode } from '../services/resourceCatalogApi';
import { ResourceIcon } from './ResourceIcon';

export type CatalogResourceTypeRef = {
  id: string;
  code: string;
  name: string;
  href?: string;
  '@referredType'?: 'ResourceType';
};

// Picker leve da árvore de catálogo, reusando o padrão visual de ResourceCatalogTree.tsx
function findSelectedNode(
  nodes: ResourceCatalogTreeNode[],
  selectedTypeId: string | null,
): ResourceCatalogTreeNode | undefined {
  for (const node of nodes) {
    if (node.kind === 'RESOURCE_TYPE' && node.resourceTypeId === selectedTypeId) return node;
    const child = findSelectedNode(node.children ?? [], selectedTypeId);
    if (child) return child;
  }
  return undefined;
}

export function CatalogTreePicker({
  nodes,
  selectedTypeId,
  onSelectType,
}: {
  nodes: ResourceCatalogTreeNode[];
  selectedTypeId: string | null;
  onSelectType: (type: CatalogResourceTypeRef, pathLabel: string) => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    // Auto-expande grupos que contêm o tipo selecionado
    const findAndExpand = (items: ResourceCatalogTreeNode[]): boolean => {
      let found = false;
      for (const item of items) {
        if (item.kind === 'RESOURCE_TYPE' && item.resourceTypeId === selectedTypeId) {
          found = true;
        } else if (item.children && findAndExpand(item.children)) {
          ids.add(item.id);
          found = true;
        }
      }
      return found;
    };
    findAndExpand(nodes);
    return ids;
  });

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

  const renderNode = (
    node: ResourceCatalogTreeNode,
    level: number,
    ancestors: string[] = [],
  ): React.ReactNode => {
    if (node.status === 'inactive') return null;
    if (filterText && !matchesFilter(node, filterText)) return null;

    const isGroup = node.kind === 'GROUP';
    const isSelected = !isGroup && node.resourceTypeId === selectedTypeId;
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedIds.has(node.id) || (filterText.length > 0 && hasChildren);
    const currentPath = [...ancestors, node.name];

    return (
      <div key={node.id} className="relative select-none">
        <div
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          onClick={(e) => {
            if (isGroup) {
              toggleExpand(node.id, e);
            } else if (node.resourceType) {
              onSelectType(node.resourceType, ancestors.join(' \\ '));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (isGroup) {
                setExpandedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              } else if (node.resourceType) {
                onSelectType(node.resourceType, ancestors.join(' \\ '));
              }
            }
          }}
          className={`group flex items-center justify-between gap-1 rounded-[8px] border px-2 py-1 text-[0.82rem] transition cursor-pointer ${
            isSelected
              ? 'border-app-accent bg-app-accent-soft font-semibold text-app-text'
              : 'border-transparent text-app-text vt-hover-muted'
          }`}
          style={{ paddingLeft: `${Math.max(level * 14 + 6, 6)}px` }}
        >
          <div className="flex min-w-0 items-center gap-1.5 flex-1">
            {isGroup ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-app-muted hover:text-app-text"
                aria-label={isExpanded ? 'Recolher' : 'Expandir'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {isGroup ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-app-muted" />
            ) : node.resourceType ? (
              <span aria-hidden="true" className="flex shrink-0 items-center text-app-text">
                <ResourceIcon
                  resource={node.resourceType.code}
                  visualIdentity={node.resourceType.visualIdentity}
                  variant="glyph"
                  size={16}
                />
              </span>
            ) : (
              <Boxes className="h-3.5 w-3.5 shrink-0 text-app-muted" />
            )}

            <span className="truncate">{node.name}</span>
          </div>
        </div>

        {isGroup && isExpanded && node.children && node.children.length > 0 && (
          <div>{node.children.map((child) => renderNode(child, level + 1, currentPath))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-[10px] border border-app-border bg-app-panel">
      <div className="flex items-center gap-2 border-b border-app-border px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-app-muted shrink-0" />
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Buscar no catálogo…"
          aria-label="Buscar na árvore de catálogo"
          className="w-full bg-transparent text-[0.8rem] text-app-text outline-none placeholder:text-app-muted"
        />
      </div>
      <div className="max-h-56 overflow-y-auto p-1.5">
        {nodes.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}

/** Campo compacto que abre a árvore do catálogo em um popover flutuante. */
export function CatalogTreeCombobox({
  nodes,
  selectedTypeId,
  onSelectType,
  placeholder = 'Selecione um tipo…',
  selectedLabel,
  onOpen,
  loading = false,
  selectedIcon,
}: {
  nodes: ResourceCatalogTreeNode[];
  selectedTypeId: string | null;
  onSelectType: (type: CatalogResourceTypeRef, pathLabel: string) => void;
  placeholder?: string;
  /** Ícone do tipo selecionado, exibido antes do nome. */
  selectedIcon?: React.ReactNode;
  /** Nome do tipo selecionado quando a árvore ainda não foi carregada. */
  selectedLabel?: string | undefined;
  /** Chamado quando o popover abre (carga preguiçosa da árvore). */
  onOpen?: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedNode = findSelectedNode(nodes, selectedTypeId);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        role="combobox"
        aria-haspopup="tree"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((current) => !current);
        }}
        style={{ borderWidth: 1, borderStyle: 'solid' }}
        className="flex w-full items-center justify-between gap-2 rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-left text-[0.85rem] text-app-text outline-none transition focus:border-app-accent"
      >
        {selectedIcon ? (
          <span aria-hidden="true" className="flex shrink-0 items-center text-app-text">
            {selectedIcon}
          </span>
        ) : null}
        <span className={`min-w-0 flex-1 truncate ${selectedNode ? '' : 'text-app-muted'}`}>
          {selectedNode?.name ?? selectedLabel ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-app-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] w-[130%] z-[var(--z-dropdown)] overflow-hidden rounded-[16px] border border-app-border bg-app-panel shadow-modal">
          {loading && nodes.length === 0 ? (
            <p className="p-3 text-[0.82rem] text-app-muted">Carregando…</p>
          ) : (
            <CatalogTreePicker
              nodes={nodes}
              selectedTypeId={selectedTypeId}
              onSelectType={(type, pathLabel) => {
                onSelectType(type, pathLabel);
                setOpen(false);
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
