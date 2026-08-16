import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Building2, FolderTree, Loader2, Map, Plus } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { GeoTreeRow } from '../../utils/geoHierarchy';
import { ResourceIcon } from '../../components/ResourceIcon';
import { siteIconDataUrl, siteIconFor } from '../../utils/siteIcon';
import { siteKindFromSpec } from '../../utils/placeLabel';
import { siteSpecNameLabel } from '../../utils/geoLabels';

export type HierarchyTreeViewProps = {
  rows: GeoTreeRow[];
  selectedNodeId: string | null;
  onSelect: (node: GeoTreeNode) => void;
  onToggle: (row: GeoTreeRow) => void;
  onLoadMore: (row: GeoTreeRow) => void;
  onHover?: (node: GeoTreeNode | null) => void;
};

/**
 * Árvore de profundidade variável, carregada sob demanda:
 *
 *   UF → Município → Estações → Estação → (sala | planta externa) → … → folha
 *
 * O "+" só aparece onde o servidor disse que há filho (`hasChildren`), e é o
 * clique nele que busca o nível seguinte. Clicar no rótulo seleciona o item:
 * centraliza o mapa e abre o balão.
 */
export function HierarchyTreeView({
  rows,
  selectedNodeId,
  onSelect,
  onToggle,
  onLoadMore,
  onHover,
}: HierarchyTreeViewProps) {
  const selectedRef = useRef<HTMLDivElement | null>(null);
  // Última seleção já rolada para a vista. Evita brigar com a rolagem do usuário:
  // rola uma vez por seleção, e não a cada re-render (abrir outro ramo muda as
  // linhas, mas não deve puxar a lista de volta ao item selecionado).
  const scrolledTo = useRef<string | null>(null);

  // Revela o nó escolhido dentro da hierarquia. Ao clicar num item no mapa, o ramo
  // dele é carregado e expandido em GeoPage (via revealNode), mas a linha pode
  // nascer fora da área visível — aqui a sidebar rola até ela, centralizada na
  // vertical para o item ficar no meio do painel, com o contexto acima e abaixo à
  // vista. Depende de `rows` porque a linha só aparece depois que os ancestrais
  // terminam de carregar/expandir de forma assíncrona; assim que ela entra na
  // lista, o efeito roda e rola até ela.
  useEffect(() => {
    if (!selectedNodeId) {
      scrolledTo.current = null;
      return;
    }
    if (scrolledTo.current === selectedNodeId || !selectedRef.current) return;
    selectedRef.current.scrollIntoView({ block: 'center' });
    scrolledTo.current = selectedNodeId;
  }, [selectedNodeId, rows]);

  if (!rows.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Nenhum local ou recurso encontrado.
      </div>
    );
  }

  return (
    <div className="grid gap-0.5">
      {rows.map((row) => (
        <TreeRow
          key={row.rowKey}
          row={row}
          selected={row.node.id === selectedNodeId}
          rowRef={row.node.id === selectedNodeId ? selectedRef : undefined}
          onSelect={onSelect}
          onToggle={onToggle}
          onLoadMore={onLoadMore}
          onHover={onHover}
        />
      ))}
    </div>
  );
}

function TreeRow({
  row,
  selected,
  rowRef,
  onSelect,
  onToggle,
  onLoadMore,
  onHover,
}: {
  row: GeoTreeRow;
  selected: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onSelect: (node: GeoTreeNode) => void;
  onToggle: (row: GeoTreeRow) => void;
  onLoadMore: (row: GeoTreeRow) => void;
  onHover?: (node: GeoTreeNode | null) => void;
}) {
  const { node, depth } = row;
  const count = node.childCount ?? row.total;
  const indent = 8 + depth * 14;

  return (
    <>
      <div
        ref={rowRef}
        className={`flex w-full items-center gap-1 rounded-[10px] pr-2 transition ${
          selected ? 'bg-app-accent-soft text-app-text' : 'text-app-text hover:bg-app-accent-soft'
        }`}
        style={{ paddingLeft: indent }}
      >
        {/* Botão de expandir separado do de selecionar: abrir um ramo e olhar um
            item são duas intenções diferentes, e no Netwin também são. */}
        <button
          type="button"
          onClick={() => onToggle(row)}
          disabled={!node.hasChildren}
          aria-label={row.expanded ? `Recolher ${node.label}` : `Expandir ${node.label}`}
          aria-expanded={node.hasChildren ? row.expanded : undefined}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-app-muted disabled:cursor-default disabled:opacity-0 hover:bg-black/5"
        >
          {row.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : row.expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelect(node)}
          onMouseEnter={() => onHover?.(node)}
          onMouseLeave={() => onHover?.(null)}
          onFocus={() => onHover?.(node)}
          onBlur={() => onHover?.(null)}
          title={
            node.sublabel
              ? `${node.label} · ${node.kind === 'site' ? (siteSpecNameLabel(node.sublabel) ?? node.sublabel) : node.sublabel}`
              : node.label
          }
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left leading-tight"
        >
          <NodeIcon node={node} />
          <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium">{node.label}</span>
          {count !== undefined ? (
            <span className="ml-1 shrink-0 rounded-[999px] bg-app-panel px-2 py-0.5 text-[0.68rem] font-semibold text-app-muted">
              {count.toLocaleString('pt-BR')}
            </span>
          ) : null}
        </button>
      </div>

      {row.remaining > 0 ? (
        <button
          type="button"
          onClick={() => onLoadMore(row)}
          disabled={row.loading}
          className="flex items-center gap-1.5 rounded-[10px] py-1 pr-2 text-left text-[0.78rem] font-semibold text-app-muted transition hover:bg-app-accent-soft disabled:opacity-60"
          style={{ paddingLeft: indent + 26 }}
        >
          <Plus className="h-3.5 w-3.5" />
          Carregar mais ({row.remaining.toLocaleString('pt-BR')})
        </button>
      ) : null}
    </>
  );
}

export function NodeIcon({ node }: { node: GeoTreeNode }) {
  // Recurso leva o ícone do seu tipo — o mesmo desenho do pin no mapa, para o
  // olho ligar árvore e mapa sem legenda.
  if (node.kind === 'resource') {
    return (
      <ResourceIcon
        resource={{ resourceType: node.resourceType ?? '', status: node.status }}
        variant="badge"
        size={20}
      />
    );
  }
  if (node.kind === 'site') {
    const kind = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
    const icon = siteIconFor(kind, node.status);
    return <img src={siteIconDataUrl(icon, { size: 20 })} alt="" className="h-5 w-5 shrink-0" />;
  }
  const Icon = node.kind === 'uf' ? Map : node.kind === 'city' ? Building2 : FolderTree;
  return <Icon className="h-4 w-4 shrink-0 text-app-muted" />;
}
