import { ChevronDown, ChevronRight, Building2, FolderTree, Loader2, Map, Plus } from 'lucide-react';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import type { GeoTreeRow } from '../../utils/geoHierarchy';
import { ResourceIcon } from '../../components/ResourceIcon';
import { siteIconDataUrl, siteIconFor } from '../../utils/siteIcon';
import { siteKindFromSpec } from '../../utils/placeLabel';

export type HierarchyTreeViewProps = {
  rows: GeoTreeRow[];
  selectedNodeId: string | null;
  onSelect: (node: GeoTreeNode) => void;
  onToggle: (row: GeoTreeRow) => void;
  onLoadMore: (row: GeoTreeRow) => void;
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
export function HierarchyTreeView({ rows, selectedNodeId, onSelect, onToggle, onLoadMore }: HierarchyTreeViewProps) {
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
          onSelect={onSelect}
          onToggle={onToggle}
          onLoadMore={onLoadMore}
        />
      ))}
    </div>
  );
}

function TreeRow({
  row,
  selected,
  onSelect,
  onToggle,
  onLoadMore,
}: {
  row: GeoTreeRow;
  selected: boolean;
  onSelect: (node: GeoTreeNode) => void;
  onToggle: (row: GeoTreeRow) => void;
  onLoadMore: (row: GeoTreeRow) => void;
}) {
  const { node, depth } = row;
  const count = node.childCount ?? row.total;
  const indent = 8 + depth * 14;

  return (
    <>
      <div
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
          title={node.sublabel ? `${node.label} · ${node.sublabel}` : node.label}
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

function NodeIcon({ node }: { node: GeoTreeNode }) {
  // Recurso leva o ícone do seu tipo — o mesmo desenho do pin no mapa, para o
  // olho ligar árvore e mapa sem legenda.
  if (node.kind === 'resource') {
    return <ResourceIcon resource={node.resourceType ?? ''} variant="badge" size={20} />;
  }
  if (node.kind === 'site') {
    const kind = siteKindFromSpec({ category: node.siteCategory, name: node.sublabel });
    const icon = siteIconFor(kind, node.status === 'terminated' ? 'terminated' : 'active');
    return <img src={siteIconDataUrl(icon, { size: 20 })} alt="" className="h-5 w-5 shrink-0" />;
  }
  const Icon = node.kind === 'uf' ? Map : node.kind === 'city' ? Building2 : FolderTree;
  return <Icon className="h-4 w-4 shrink-0 text-app-muted" />;
}
