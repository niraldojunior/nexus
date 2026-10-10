import { ChevronDown, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ResourceIcon } from '../../components/ResourceIcon';
import {
  getResourceCatalogTree,
  listResourceCatalogs,
  type ResourceCatalogTreeNode,
} from '../../services/resourceCatalogApi';

export type TypeSelection = {
  key: string;
  label: string;
  resourceTypeIds: string[];
  /** Código do ResourceType quando a seleção é um tipo (folha); ausente em grupo. */
  resourceTypeCode?: string | undefined;
};

type Props = {
  onSelect: (selection: TypeSelection) => void;
  selectedKey?: string | undefined;
};

/** Todos os ResourceTypes descendentes de um nó (a própria folha, se for tipo). */
const collectTypeIds = (node: ResourceCatalogTreeNode): string[] => {
  const own = node.kind === 'RESOURCE_TYPE' && node.resourceTypeId ? [node.resourceTypeId] : [];
  return [...own, ...node.children.flatMap(collectTypeIds)];
};

/** Aba Tipo: catálogo de recursos ativo/default; grupo seleciona todos os tipos descendentes. */
export function TypeTree({ onSelect, selectedKey }: Props) {
  const [tree, setTree] = useState<ResourceCatalogTreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const catalogs = await listResourceCatalogs();
        const catalog =
          catalogs.find((item) => item.status === 'active' && item.isDefault) ??
          catalogs.find((item) => item.status === 'active');
        const nodes = catalog ? await getResourceCatalogTree(catalog.id) : [];
        if (!cancelled) setTree(nodes);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Falha ao carregar tipos.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="p-4 text-[0.9rem] text-app-muted">{error}</p>;
  if (!tree) {
    return (
      <div className="p-4 text-app-muted">
        <Loader2 size={16} className="animate-spin" aria-label="Carregando" />
      </div>
    );
  }
  if (tree.length === 0) {
    return <p className="p-4 text-[0.9rem] text-app-muted">Nenhum tipo no catálogo ativo.</p>;
  }

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  };

  const renderNode = (node: ResourceCatalogTreeNode, depth: number) => {
    const isGroup = node.kind === 'GROUP';
    const isOpen = expanded.has(node.id);
    const selected = selectedKey === node.id;
    return (
      <li key={node.id} role="none">
        <div
          role="treeitem"
          aria-expanded={isGroup ? isOpen : undefined}
          aria-selected={selected}
          className={`flex items-center gap-1 rounded-lg py-[3px] pr-2 text-[0.8rem] text-app-text ${
            isGroup ? 'font-semibold' : ''
          } ${selected ? 'bg-app-accent-soft' : 'hover:bg-app-hover'}`}
          style={{ paddingLeft: depth * 14 }}
        >
          {isGroup ? (
            <button
              type="button"
              aria-label={`${isOpen ? 'Recolher' : 'Expandir'} ${node.name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-app-muted"
              onClick={() => toggle(node.id)}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          {isGroup ? (
            <Folder size={15} className="shrink-0 text-app-muted" />
          ) : (
            <ResourceIcon resource={node.resourceType?.code} variant="glyph" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => {
              // Grupo só abre/fecha; a consulta nasce do clique num tipo de recurso.
              if (isGroup) {
                toggle(node.id);
                return;
              }
              const ids = [...new Set(collectTypeIds(node))];
              if (ids.length > 0) {
                onSelect({
                  key: node.id,
                  label: node.name,
                  resourceTypeIds: ids,
                  resourceTypeCode: node.resourceType?.code,
                });
              }
            }}
          >
            {node.name}
          </button>
        </div>
        {isGroup && isOpen ? (
          <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="Tipos" className="px-3 py-2">
      {tree.map((node) => renderNode(node, 0))}
    </ul>
  );
}
