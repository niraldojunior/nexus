import { ChevronDown, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ResourceIcon } from '../../components/ResourceIcon';
import { loadDefaultCatalogTree } from '../../services/internalPlantCatalogCache';
import type { ResourceCatalogTreeNode } from '../../services/resourceCatalogApi';

export type TypeSelection = {
  key: string;
  label: string;
  resourceTypeIds: string[];
  /** Código do ResourceType quando a seleção é um tipo (folha); ausente em grupo. */
  resourceTypeCode?: string | undefined;
  /** Id do ResourceType da folha selecionada; base do botão de criação. */
  leafResourceTypeId?: string | undefined;
};

type Props = {
  onSelect: (selection: TypeSelection) => void;
  selectedKey?: string | undefined;
  /** Filtro rápido por nome de grupo/tipo. */
  query?: string;
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Mantém nós cujo nome casa (com a subárvore inteira) ou que têm descendente casando. */
const filterTree = (
  nodes: ResourceCatalogTreeNode[],
  tokens: string[],
): ResourceCatalogTreeNode[] =>
  nodes.flatMap((node) => {
    const name = normalize(node.name);
    if (tokens.every((token) => name.includes(token))) return [node];
    const children = filterTree(node.children, tokens);
    return children.length > 0 ? [{ ...node, children }] : [];
  });

/** Todos os ResourceTypes descendentes de um nó (a própria folha, se for tipo). */
const collectTypeIds = (node: ResourceCatalogTreeNode): string[] => {
  const own = node.kind === 'RESOURCE_TYPE' && node.resourceTypeId ? [node.resourceTypeId] : [];
  return [...own, ...node.children.flatMap(collectTypeIds)];
};

/** Aba Tipo: catálogo de recursos ativo/default; grupo seleciona todos os tipos descendentes. */
export function TypeTree({ onSelect, selectedKey, query = '' }: Props) {
  const [tree, setTree] = useState<ResourceCatalogTreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nodes = await loadDefaultCatalogTree();
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

  const tokens = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const filtering = tokens.length > 0;
  const visibleTree = useMemo(
    () => (tree && filtering ? filterTree(tree, tokens) : tree),
    [tree, filtering, tokens],
  );

  if (error)
    return (
      <p role="alert" className="p-4 text-[0.9rem] text-app-muted">
        {error}
      </p>
    );
  if (!tree) {
    return (
      <div className="p-4 text-app-muted">
        <Loader2 size={16} className="animate-spin" role="status" aria-label="Carregando" />
      </div>
    );
  }
  if (tree.length === 0) {
    return <p className="p-4 text-[0.9rem] text-app-muted">Nenhum tipo no catálogo ativo.</p>;
  }

  if (filtering && visibleTree?.length === 0) {
    return <p className="p-4 text-[0.9rem] text-app-muted">Nenhum tipo encontrado.</p>;
  }

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
  };

  const renderNode = (node: ResourceCatalogTreeNode, depth: number) => {
    const isGroup = node.kind === 'GROUP';
    const isOpen = expanded.has(node.id) || (filtering && isGroup);
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
            <ResourceIcon resource={node.resourceType?.code} variant="glyph" catalogTone />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            title={node.name}
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
                  leafResourceTypeId: node.resourceTypeId ?? undefined,
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
      {(visibleTree ?? tree).map((node) => renderNode(node, 0))}
    </ul>
  );
}
