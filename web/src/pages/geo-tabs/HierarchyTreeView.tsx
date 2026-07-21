import { useState } from 'react';
import { ChevronRight, Map, Building2, MapPin, Cable, Router, Tag, Circle } from 'lucide-react';
import type { HierLevel, HierNode, HierInstance } from '../../utils/geoHierarchy';
import { ResourceIcon } from '../../components/ResourceIcon';

export type HierarchyTreeViewProps = {
  roots: HierNode[];
  selectedInstanceKey: string | null;
  onSelectInstance: (instance: HierInstance) => void;
};

/**
 * Árvore expansível de 6 níveis (UF → Município → Localidade → Entidade → Tipo
 * → instância). Espelha o modo "árvore" do Netwin. Folhas (instância) disparam
 * a seleção que centraliza o mapa e abre o detalhe.
 */
export function HierarchyTreeView({ roots, selectedInstanceKey, onSelectInstance }: HierarchyTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (pathId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathId)) next.delete(pathId);
      else next.add(pathId);
      return next;
    });

  if (!roots.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Nenhum local ou recurso encontrado.
      </div>
    );
  }

  const renderNode = (node: HierNode, parentPath: string, level: number): JSX.Element => {
    const pathId = `${parentPath}/${node.key}`;
    const isLeaf = node.level === 'instancia';
    const isOpen = expanded.has(pathId);
    const isSelected = isLeaf && node.key === selectedInstanceKey;

    return (
      <div key={pathId}>
        <button
          type="button"
          onClick={() => {
            if (isLeaf && node.instance) onSelectInstance(node.instance);
            else toggle(pathId);
          }}
          className={`flex w-full items-center gap-2 rounded-[10px] py-1 pr-2 text-left leading-tight transition ${
            isSelected ? 'bg-app-accent-soft text-app-text' : 'text-app-text hover:bg-app-accent-soft'
          }`}
          style={{ paddingLeft: 8 + level * 14 }}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-app-muted">
            {isLeaf ? null : (
              <ChevronRight className={`h-3.5 w-3.5 transition ${isOpen ? 'rotate-90' : ''}`} />
            )}
          </span>
          <NodeIcon level={node.level} label={node.label} resourceType={node.resourceType ?? node.instance?.resourceType} />
          <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium">{node.label}</span>
          {!isLeaf ? (
            <span className="ml-1 shrink-0 rounded-[999px] bg-app-panel px-2 py-0.5 text-[0.68rem] font-semibold text-app-muted">
              {node.count}
            </span>
          ) : null}
        </button>
        {!isLeaf && isOpen ? node.children.map((child) => renderNode(child, pathId, level + 1)) : null}
      </div>
    );
  };

  return <div className="grid gap-0.5">{roots.map((node) => renderNode(node, '', 0))}</div>;
}

const LEVEL_ICON: Record<HierLevel, typeof Map> = {
  uf: Map,
  municipio: Building2,
  localidade: MapPin,
  entidade: Circle,
  tipo: Tag,
  instancia: Circle,
};

const ENTITY_COLOR: Record<string, string> = {
  Local: '#004E89',
  Equipamento: '#FF6B35',
  Cabo: '#1A9E7D',
};

function NodeIcon({ level, label, resourceType }: { level: HierLevel; label: string; resourceType?: string }) {
  // Grupo de tipo e folha de recurso levam o ícone do tipo — o mesmo desenho que
  // o pin do mapa usa, para o olho ligar árvore e mapa sem legenda.
  if (resourceType && level === 'tipo') {
    return <ResourceIcon resource={resourceType} variant="badge" size={20} />;
  }
  if (resourceType && level === 'instancia') {
    return <ResourceIcon resource={resourceType} variant="glyph" size={14} />;
  }
  if (level === 'entidade') {
    const color = ENTITY_COLOR[label] ?? '#5A5A5A';
    const Icon = label === 'Cabo' ? Cable : label === 'Equipamento' ? Router : Building2;
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] text-white"
        style={{ background: color }}
      >
        <Icon className="h-3 w-3" />
      </span>
    );
  }
  if (level === 'instancia') {
    return <Circle className="h-2 w-2 shrink-0 fill-app-muted text-app-muted" />;
  }
  const Icon = LEVEL_ICON[level];
  return <Icon className="h-4 w-4 shrink-0 text-app-muted" />;
}
