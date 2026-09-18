import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Folder,
  FolderOpen,
  Globe,
  GripVertical,
  Layers,
  Palette,
  MapPin,
  Route,
  Ruler,
  Scan,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { getStudioStatus, saveStudioDraft } from '../../services/studioApi';
import type {
  StudioGeoCatalog,
  StudioGeoEntityCategory,
  StudioGeoEntityNode,
  StudioGeoNode,
  StudioGeoVisualConfig,
  VisualIdentity,
} from '../../services/studioGeoApi';
import { listGeoSiteSpecifications, type GeoSpec } from '../../services/geoApi';
import { listModeledResourceTypes } from '../../services/resourceCatalogApi';
import type { ResourceType } from '../../services/resourceApi';
import { mapLayerTree, type MapLayerTreeNode } from '../../utils/mapLayers';
import { useStudioPointIconPreviewUrl } from '../../hooks/useStudioPointIconPreviewUrl';
import { GeoNodeColorTab } from './geo/GeoNodeIconColorTab';
import { GeoNodeSizeTab } from './geo/GeoNodeSizeTab';
import {
  defaultVisualConfigForGeometry,
  visualGeometryKindOf,
} from '../../utils/studioGeoDefaults';
import { normalizeStudioGeoVisualConfig, resolveStudioGeoColor } from '../../utils/studioGeoVisual';
import {
  buildEligibleSites,
  buildEligibleResources,
  buildEligibleCoverages,
  type EligibleOption,
} from '../../utils/studioGeoEligibility';

type StudioGeoExperienceProps = {
  canEdit: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

export type DropPosition = 'before' | 'after' | 'inside';
type StudioGeoSnapshot = Pick<StudioGeoCatalog, 'schemaVersion' | 'nodes'>;

// Ausência de draft/publicação normaliza para um snapshot vazio — o Studio nunca pré-popula o
// editor com o catálogo canônico legado. Esse fallback só existe como compatibilidade de leitura
// do mapa em namespaces legacy (`GET /v1/geo/map-layer-catalog`), nunca como conteúdo inicial de
// um ambiente novo nem como dado editável aqui.
const normalize = (value: Record<string, unknown> | undefined): StudioGeoSnapshot => {
  if ((value?.schemaVersion === 2 || value?.schemaVersion === 3) && Array.isArray(value.nodes)) {
    return { schemaVersion: 3, nodes: value.nodes as StudioGeoNode[] };
  }
  return { schemaVersion: 3, nodes: [] };
};

const compactOrder = (nodes: StudioGeoNode[]): StudioGeoNode[] => {
  const parentIds = new Set(nodes.map((node) => node.parentNodeId));
  const order = new Map<string, number>();
  for (const parentId of parentIds) {
    nodes
      .filter((node) => node.parentNodeId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .forEach((node, index) => order.set(node.id, (index + 1) * 10));
  }
  return nodes.map((node) => ({ ...node, sortOrder: order.get(node.id) ?? node.sortOrder }));
};

// Catálogos históricos podem omitir `visualConfig` inteiramente ou carregar um formato antigo
// (POINT sem `color`/`opacity`, LINE/POLYGON com `strokeColor` solto). `normalizeStudioGeoVisualConfig`
// já sabe migrar os dois casos para o contrato canônico atual — aplicar sempre, não só quando
// ausente, evita que o editor (e o mapa) leiam um `visualConfig` parcialmente materializado.
const materializeVisualConfigs = (nodes: StudioGeoNode[]): StudioGeoNode[] =>
  nodes.map((node) =>
    node.kind === 'ENTITY'
      ? {
          ...node,
          // Quando o nó nunca teve `visualConfig` (catálogo antigo), `normalizeStudioGeoVisualConfig`
          // não tem como saber a geometria certa sozinho — sem essa dica ele caía sempre em POINT,
          // mesmo para um recurso do tipo Cabo/Duto. `visualGeometryKindOf` aplica a mesma heurística
          // por nome que `defaultVisualConfigForEntity` já usava aqui antes da normalização ficar
          // incondicional; a correção definitiva pela geometria real do ResourceType elegível
          // continua acontecendo em `buildSnapshot`, ao salvar.
          visualConfig: normalizeStudioGeoVisualConfig(
            node.visualConfig,
            node.entity,
            node.label,
            visualGeometryKindOf(node.visualConfig, node.entity, node.label),
          ),
        }
      : node,
  );

const visualConfigForEligibleOption = (
  current: StudioGeoVisualConfig | undefined,
  option: EligibleOption | undefined,
  label: string,
): StudioGeoVisualConfig | undefined => {
  if (!option) return current;
  return current?.geometryKind === option.geometryKind
    ? current
    : defaultVisualConfigForGeometry(option.geometryKind, option.reference, label);
};

const referenceForEligibleOption = (option: EligibleOption): StudioGeoEntityNode['entity'] => ({
  category: option.category,
  sourceDomain: option.sourceDomain,
  sourceType: option.sourceType,
  sourceId: option.sourceId,
});

const optionForEntity = (
  entity: StudioGeoEntityNode['entity'],
  eligible: EligibleOption[],
): EligibleOption | undefined =>
  eligible.find((option) => option.sourceId === entity.sourceId || option.id === entity.sourceId);

const visualIdentityForEntity = (
  entity: StudioGeoEntityNode['entity'],
  resourceTypes: ResourceType[],
  siteSpecs: GeoSpec[],
): VisualIdentity | undefined => {
  if (entity.sourceType === 'RESOURCE_TYPE') {
    const resourceType = resourceTypes.find(
      (item) => item.id === entity.sourceId || item.code === entity.sourceId,
    );
    return resourceType?.visualIdentity;
  }
  if (entity.sourceType === 'GEOGRAPHIC_SITE_SPECIFICATION') {
    const siteSpec = siteSpecs.find((item) => item.id === entity.sourceId || item.code === entity.sourceId);
    return siteSpec?.visualIdentity;
  }
  return undefined;
};

const isDescendant = (nodes: StudioGeoNode[], candidateId: string, ancestorId: string): boolean => {
  let current = nodes.find((node) => node.id === candidateId);
  const visited = new Set<string>();
  while (current?.parentNodeId) {
    if (current.parentNodeId === ancestorId || visited.has(current.parentNodeId)) return true;
    visited.add(current.parentNodeId);
    current = nodes.find((node) => node.id === current?.parentNodeId);
  }
  return false;
};

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

type DetailTab = 'overview' | 'icon-color' | 'size';

// Troca de categoria ou de Entidade Cadastrada é bloqueante quando já existe configuração
// materializada: o `visualConfig` é recriado do zero na nova geometria, então ícone, cores,
// transparência, estilo e tamanhos personalizados se perdem.
type PendingEntityChange = {
  nodeId: string;
  entity: StudioGeoEntityNode['entity'];
  visualConfig: StudioGeoVisualConfig | undefined;
};

type GeoTreePointIconProps = {
  node: StudioGeoEntityNode;
};

function GeoTreePointIcon({ node }: GeoTreePointIconProps) {
  const visualConfig =
    node.visualConfig?.geometryKind === 'POINT'
      ? node.visualConfig
      : defaultVisualConfigForGeometry('POINT', node.entity, node.label);
  const pointConfig = visualConfig.geometryKind === 'POINT' ? visualConfig : undefined;
  const previewUrl = useStudioPointIconPreviewUrl(
    node,
    22,
    pointConfig
      ? {
          color: resolveStudioGeoColor(pointConfig.color, node.entity.category, null),
          opacity: pointConfig.opacity,
        }
      : {},
  );

  return previewUrl ? <img src={previewUrl} alt="" className="h-[22px] w-[22px] shrink-0" /> : null;
}

export function StudioGeoExperience({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: StudioGeoExperienceProps) {
  const [snapshot, setSnapshot] = useState<StudioGeoSnapshot>({
    schemaVersion: 3,
    nodes: [],
  });
  const [checksum, setChecksum] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [pendingEntityChange, setPendingEntityChange] = useState<PendingEntityChange | null>(null);

  // Drag and Drop States (espelhado de ResourceCatalogTree)
  const [draggedNode, setDraggedNode] = useState<StudioGeoNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const [isOverRoot, setIsOverRoot] = useState(false);

  // Candidate items for entity editing
  const [siteSpecs, setSiteSpecs] = useState<GeoSpec[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);

  const wasEditing = useRef(isEditing);
  const canMutate = canEdit && isEditing;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, specs, types] = await Promise.all([
        getStudioStatus('studio-geo'),
        listGeoSiteSpecifications().catch(() => []),
        listModeledResourceTypes().catch(() => []),
      ]);
      const version = status.draftVersion ?? status.publishedVersion;
      const loaded = normalize(version?.snapshot);
      const next = { ...loaded, nodes: materializeVisualConfigs(loaded.nodes) };
      setSnapshot(next);
      setChecksum(status.draftVersion?.checksum);
      setSiteSpecs(specs);
      setResourceTypes(types);
      setSelectedId((current) =>
        current && next.nodes.some((node) => node.id === current) ? current : next.nodes[0]?.id ?? null,
      );
      setExpanded(new Set(next.nodes.filter((node) => node.kind === 'GROUP').map((node) => node.id)));
      setError(null);
    } catch (reason) {
      // Erro de rede/leitura fica sendo erro — nunca é convertido silenciosamente em dados
      // editáveis (nem o catálogo canônico legado, nem qualquer outro conteúdo sintético).
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar a Hierarquia Visual.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (wasEditing.current && !isEditing) void load();
    wasEditing.current = isEditing;
  }, [isEditing, load]);

  const buildSnapshot = useCallback(async () => {
    const eligibleByCategory: Record<StudioGeoEntityCategory, EligibleOption[]> = {
      LOCAL: buildEligibleSites(siteSpecs),
      RESOURCE: buildEligibleResources(resourceTypes),
      COVERAGE: buildEligibleCoverages(siteSpecs),
    };
    const nodes = materializeVisualConfigs(compactOrder(snapshot.nodes)).map((node) => {
      if (node.kind !== 'ENTITY') return node;
      const option = optionForEntity(node.entity, eligibleByCategory[node.entity.category]);
      const visualConfig = visualConfigForEligibleOption(node.visualConfig, option, node.label);
      return visualConfig ? { ...node, visualConfig } : node;
    });
    return { schemaVersion: 3, nodes };
  }, [resourceTypes, siteSpecs, snapshot]);

  const captureDraft = useCallback(async () => {
    const status = await getStudioStatus('studio-geo');
    await saveStudioDraft(
      'studio-geo',
      await buildSnapshot(),
      status.draftVersion?.checksum ?? checksum,
    );
  }, [buildSnapshot, checksum]);

  useEffect(() => {
    onRegisterCaptureDraft?.(captureDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [captureDraft, onRegisterCaptureDraft]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(buildSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [buildSnapshot, onRegisterCaptureInitialSnapshot]);

  // A identidade é enriquecida somente para previews. O snapshot v3 continua livre desse campo,
  // pois o modelo (ResourceType/GeoSpec), e não o Studio GEO, é sua autoridade.
  const previewCatalog = useMemo<StudioGeoCatalog>(
    () => ({
      ...snapshot,
      configured: true,
      environmentId: 'studio-draft',
      fallback: false,
      nodes: snapshot.nodes.map((node) => {
        if (node.kind !== 'ENTITY') return node;
        const visualIdentity = visualIdentityForEntity(node.entity, resourceTypes, siteSpecs);
        return visualIdentity ? { ...node, visualIdentity } : node;
      }),
    }),
    [resourceTypes, siteSpecs, snapshot],
  );
  const tree = useMemo(() => mapLayerTree(previewCatalog), [previewCatalog]);
  const selected = previewCatalog.nodes.find((node) => node.id === selectedId) ?? null;

  const patchSelected = (patch: Partial<StudioGeoNode>) =>
    selected &&
    setSnapshot((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selected.id ? ({ ...node, ...patch } as StudioGeoNode) : node,
      ),
    }));

  const removeNode = (removedId: string) => {
    setSnapshot((current) => {
      const filtered = current.nodes.filter(
        (node) => node.id !== removedId && !isDescendant(current.nodes, node.id, removedId),
      );
      return { ...current, nodes: filtered };
    });
    setSelectedId((current) => (current === removedId ? null : current));
  };

  const removeSelected = () => {
    if (!selected) return;
    removeNode(selected.id);
  };

  // Movimentação recursiva e reordenação estável
  const moveNode = (nodeId: string, targetId: string | null, position: DropPosition) => {
    setSnapshot((current) => {
      const moving = current.nodes.find((node) => node.id === nodeId);
      const target = targetId ? current.nodes.find((node) => node.id === targetId) : undefined;
      if (
        !moving ||
        (target &&
          (target.id === moving.id ||
            (moving.kind === 'GROUP' && isDescendant(current.nodes, target.id, moving.id)))) ||
        (position === 'inside' && target?.kind !== 'GROUP')
      )
        return current;

      const newParentNodeId = position === 'inside' ? target!.id : target?.parentNodeId ?? null;
      const siblings = current.nodes.filter(
        (node) => node.parentNodeId === newParentNodeId && node.id !== moving.id,
      );
      const targetIndex = target ? siblings.findIndex((node) => node.id === target.id) : siblings.length;
      const insertAt =
        position === 'before'
          ? Math.max(targetIndex, 0)
          : position === 'after'
            ? (targetIndex >= 0 ? targetIndex + 1 : siblings.length)
            : siblings.length;

      const reordered = [
        ...siblings.slice(0, insertAt),
        { ...moving, parentNodeId: newParentNodeId },
        ...siblings.slice(insertAt),
      ];
      const order = new Map(reordered.map((node, index) => [node.id, (index + 1) * 10]));
      return {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === moving.id
            ? { ...node, parentNodeId: newParentNodeId, sortOrder: order.get(node.id)! }
            : order.has(node.id)
              ? { ...node, sortOrder: order.get(node.id)! }
              : node,
        ),
      };
    });
  };

  // Filtragem de candidatos elegíveis usando o helper canônico
  const eligibleSites: EligibleOption[] = useMemo(() => buildEligibleSites(siteSpecs), [siteSpecs]);
  const eligibleResources: EligibleOption[] = useMemo(() => buildEligibleResources(resourceTypes), [resourceTypes]);
  const eligibleCoverages: EligibleOption[] = useMemo(
    () => buildEligibleCoverages(siteSpecs),
    [siteSpecs],
  );

  const getEligibleListForCategory = (cat: StudioGeoEntityCategory): EligibleOption[] => {
    if (cat === 'LOCAL') return eligibleSites;
    if (cat === 'RESOURCE') return eligibleResources;
    return eligibleCoverages;
  };

  // Referência de entidade padrão para uma nova Entidade Visual: primeiro item elegível da
  // categoria, ou um stub editável quando o catálogo ainda não tem itens elegíveis — mesma
  // regra de fallback usada em handleEntityCategoryChange logo abaixo.
  const defaultEntityReference = (cat: StudioGeoEntityCategory): StudioGeoEntityNode['entity'] => {
    const first = getEligibleListForCategory(cat)[0];
    if (first) {
      return {
        category: first.category,
        sourceDomain: first.sourceDomain,
        sourceType: first.sourceType,
        sourceId: first.sourceId,
      };
    }
    return {
      category: cat,
      sourceDomain:
        cat === 'LOCAL' ? 'location-model' : cat === 'RESOURCE' ? 'resource-model' : 'spatial',
      sourceType:
        cat === 'LOCAL'
          ? 'GEOGRAPHIC_SITE_SPECIFICATION'
          : cat === 'RESOURCE'
            ? 'RESOURCE_TYPE'
            : 'SPATIAL_COVERAGE',
      sourceId: '',
    };
  };

  const createNode = (kind: StudioGeoNode['kind']) => {
    const parentNodeId = selected?.kind === 'GROUP' ? selected.id : selected?.parentNodeId ?? null;
    const id = createId(kind === 'GROUP' ? 'group' : 'entity');

    if (kind === 'GROUP') {
      setSnapshot((current) => ({
        ...current,
        nodes: [
          ...current.nodes,
          { id, kind: 'GROUP', parentNodeId, label: 'Novo Grupo', sortOrder: 9999, active: true },
        ],
      }));
    } else {
      const entity = defaultEntityReference('RESOURCE');
      const option = optionForEntity(entity, eligibleResources);
      const node: StudioGeoEntityNode = {
        id,
        kind: 'ENTITY',
        parentNodeId,
        label: 'Nova Entidade',
        sortOrder: 9999,
        active: true,
        defaultVisible: true,
        entity,
        ...(option
          ? { visualConfig: defaultVisualConfigForGeometry(option.geometryKind, option.reference, 'Nova Entidade') }
          : {}),
      };
      setSnapshot((current) => ({ ...current, nodes: [...current.nodes, node] }));
    }

    if (parentNodeId) {
      setExpanded((current) => new Set(current).add(parentNodeId));
    }
    setActiveTab('overview');
    setSelectedId(id);
    setCreateMenuOpen(false);
  };

  // Só a primeira definição da entidade de origem é direta. Depois disso, qualquer troca passa
  // pelo diálogo bloqueante, porque o visual publicado é recriado nos defaults da nova entidade.
  const requestEntityChange = (
    node: StudioGeoEntityNode,
    entity: StudioGeoEntityNode['entity'],
    visualConfig: StudioGeoVisualConfig | undefined,
  ) => {
    const hadEntity = node.entity.sourceId !== '' && !!node.visualConfig;
    const sameReference =
      node.entity.sourceId === entity.sourceId && node.entity.category === entity.category;
    if (sameReference) return;
    if (!hadEntity) {
      patchSelected({ entity, visualConfig } as Partial<StudioGeoNode>);
      return;
    }
    setPendingEntityChange({ nodeId: node.id, entity, visualConfig });
  };

  const handleEntityCategoryChange = (newCategory: StudioGeoEntityCategory) => {
    if (!selected || selected.kind !== 'ENTITY') return;
    const first = getEligibleListForCategory(newCategory)[0];
    if (first) {
      requestEntityChange(
        selected,
        referenceForEligibleOption(first),
        defaultVisualConfigForGeometry(first.geometryKind, first.reference, selected.label),
      );
      return;
    }
    requestEntityChange(selected, defaultEntityReference(newCategory), undefined);
  };

  const handleEntitySourceChange = (sourceId: string) => {
    if (!selected || selected.kind !== 'ENTITY') return;
    const found = getEligibleListForCategory(selected.entity.category).find(
      (item) => item.sourceId === sourceId || item.id === sourceId,
    );
    if (!found) return;
    requestEntityChange(
      selected,
      referenceForEligibleOption(found),
      defaultVisualConfigForGeometry(found.geometryKind, found.reference, selected.label),
    );
  };

  const confirmEntityChange = () => {
    if (!pendingEntityChange) return;
    patchSelected({
      entity: pendingEntityChange.entity,
      visualConfig: pendingEntityChange.visualConfig,
    } as Partial<StudioGeoNode>);
    setPendingEntityChange(null);
    setActiveTab('overview');
  };

  const selectedEligibleOption =
    selected?.kind === 'ENTITY'
      ? optionForEntity(selected.entity, getEligibleListForCategory(selected.entity.category))
      : undefined;
  const selectedGeometryKind =
    selected?.kind === 'ENTITY'
      ? (selectedEligibleOption?.geometryKind ??
        visualGeometryKindOf(selected.visualConfig, selected.entity, selected.label))
      : null;

  const selectedVisualConfig =
    selected?.kind === 'ENTITY'
      ? (visualConfigForEligibleOption(
          selected.visualConfig,
          selectedEligibleOption,
          selected.label,
        ) ?? selected.visualConfig)
      : undefined;
  const selectedPointVisualConfig =
    selected?.kind === 'ENTITY' && selectedGeometryKind === 'POINT'
      ? (selectedVisualConfig ??
        defaultVisualConfigForGeometry('POINT', selected.entity, selected.label))
      : null;
  const selectedPointConfig =
    selectedPointVisualConfig?.geometryKind === 'POINT' ? selectedPointVisualConfig : null;

  // Sem uma Entidade Cadastrada elegível não há geometria canônica a editar: as abas visuais
  // ficam ocultas e a edição se limita a Geral.
  const hasVisualEditor = !!(
    selected?.kind === 'ENTITY' &&
    selectedEligibleOption &&
    selectedVisualConfig
  );
  const visualEditorConfig = hasVisualEditor ? selectedVisualConfig : undefined;

  useEffect(() => {
    if (!hasVisualEditor && activeTab !== 'overview') setActiveTab('overview');
  }, [activeTab, hasVisualEditor]);

  const pointIconPreview = useStudioPointIconPreviewUrl(
    selected?.kind === 'ENTITY' ? selected : null,
    32,
    selectedPointConfig && selected?.kind === 'ENTITY'
      ? {
          color: resolveStudioGeoColor(
            selectedPointConfig.color,
            selected.entity.category,
            null,
          ),
          opacity: selectedPointConfig.opacity,
        }
      : {},
  );

  // Drag and Drop Handlers (Padrão de ResourceCatalogTree)
  const handleDragStart = (node: MapLayerTreeNode, e: React.DragEvent) => {
    if (!canMutate) return;
    setDraggedNode(node);
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (targetNode: MapLayerTreeNode, e: React.DragEvent) => {
    if (!canMutate || !draggedNode) return;
    if (draggedNode.id === targetNode.id) return;
    if (draggedNode.kind === 'GROUP' && isDescendant(snapshot.nodes, targetNode.id, draggedNode.id)) {
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

  const handleDragLeave = (targetNode: MapLayerTreeNode, e: React.DragEvent) => {
    e.stopPropagation();
    const related = e.relatedTarget as HTMLElement | null;
    if (e.currentTarget.contains(related)) return;

    if (dropTargetId === targetNode.id) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  };

  const handleDrop = (targetNode: MapLayerTreeNode, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canMutate || !draggedNode || draggedNode.id === targetNode.id) {
      setDraggedNode(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }
    if (draggedNode.kind === 'GROUP' && isDescendant(snapshot.nodes, targetNode.id, draggedNode.id)) {
      setDraggedNode(null);
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const pos = dropPosition ?? (targetNode.kind === 'GROUP' ? 'inside' : 'after');
    moveNode(draggedNode.id, targetNode.id, pos);
    if (pos === 'inside') {
      setExpanded((prev) => new Set(prev).add(targetNode.id));
    }
    setDraggedNode(null);
    setDropTargetId(null);
    setDropPosition(null);
    setIsOverRoot(false);
  };

  const handleDragEnd = () => {
    setDraggedNode(null);
    setDropTargetId(null);
    setDropPosition(null);
    setIsOverRoot(false);
  };

  const renderNode = (node: MapLayerTreeNode, depth: number) => {
    const isGroup = node.kind === 'GROUP';
    const hasChildren = isGroup && node.children.length > 0;
    const isSelected = selectedId === node.id;
    const isExpanded = expanded.has(node.id);
    const isBeingDragged = draggedNode?.id === node.id;
    const isCurrentDropTarget = dropTargetId === node.id;

    const showDropTop = isCurrentDropTarget && dropPosition === 'before';
    const showDropBottom = isCurrentDropTarget && dropPosition === 'after';
    const showDropInside = isCurrentDropTarget && dropPosition === 'inside';

    return (
      <div key={node.id} className="relative select-none">
        {/* Linha indicadora azul de inserção ANTES do nó */}
        {showDropTop && (
          <div
            className="absolute -top-0.5 left-2 right-2 h-0.5 bg-app-accent rounded z-10 pointer-events-none"
            style={{ marginLeft: `${Math.max(depth * 16 + 8, 8)}px` }}
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
          onClick={() => setSelectedId((current) => (current === node.id ? null : node.id))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedId((current) => (current === node.id ? null : node.id));
            }
          }}
          className={`group flex items-center justify-between gap-1 rounded-[10px] border px-2 py-1.5 text-[0.85rem] transition ${
            canMutate ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
          } ${isBeingDragged ? 'opacity-30 scale-[0.98]' : ''} ${
            showDropInside
              ? 'ring-2 ring-app-accent border-app-accent bg-app-accent-soft text-app-text font-semibold'
              : isSelected
                ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                : 'border-transparent text-app-text hover:bg-black/[0.04]'
          }`}
          style={{ paddingLeft: `${Math.max(depth * 16 + 8, 8)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* Grip vertical visível apenas em modo de edição */}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                }}
                aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${node.label}`}
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
                <FolderOpen className="h-4 w-4 shrink-0 text-app-muted" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-app-muted" />
              )
            ) : visualGeometryKindOf(node.visualConfig, node.entity, node.label) === 'POINT' ? (
              <GeoTreePointIcon node={node} />
            ) : visualGeometryKindOf(node.visualConfig, node.entity, node.label) === 'LINE' ? (
              <Route className="h-4 w-4 shrink-0 text-app-muted" />
            ) : (
              <Scan className="h-4 w-4 shrink-0 text-app-muted" />
            )}

            <span className="truncate text-[0.82rem] font-medium" title={node.label}>
              {node.label}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!node.active && (
              <span className="shrink-0 rounded bg-red-100 px-1 py-0.2 text-[0.68rem] font-medium text-red-700">
                Inativo
              </span>
            )}
            {!node.active && <EyeOff className="h-3.5 w-3.5 text-app-muted" />}
            {/* Lixeira de atalho, revelada só no hover da linha — mesmo padrão de
                ResourceCatalogTree.tsx (modelagem de Recursos). */}
            {canMutate && (
              <button
                type="button"
                title="Remover este nó da hierarquia"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(node.id);
                }}
                className="hidden h-5 w-5 shrink-0 items-center justify-center rounded p-0.5 text-app-muted hover:bg-white hover:text-red-600 group-hover:flex"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Linha indicadora azul de inserção DEPOIS do nó */}
        {showDropBottom && (
          <div
            className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-app-accent rounded z-10 pointer-events-none"
            style={{ marginLeft: `${Math.max(depth * 16 + 8, 8)}px` }}
          />
        )}

        {isGroup && isExpanded && hasChildren && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading)
    return <p className="text-[0.85rem] text-app-muted">Carregando a Hierarquia Visual…</p>;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid min-h-[560px] gap-5 lg:grid-cols-[308px_minmax(0,1fr)]">
        {/* Painel Esquerdo: Hierarquia de Camadas Recursiva */}
        <section
          className="vt-card flex min-h-[560px] flex-col p-4"
          role="tree"
          aria-label="Hierarquia de Camadas"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-app-text">Hierarquia de Camadas</h3>
            {canMutate && (
              <div className="relative">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreateMenuOpen((open) => !open)}
                  title="Incluir nó"
                  aria-label="Incluir nó"
                  aria-haspopup="menu"
                  aria-expanded={createMenuOpen}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {createMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCreateMenuOpen(false)} />
                    <div
                      role="menu"
                      aria-label="Tipo de nó a incluir"
                      className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-[12px] border border-app-border bg-white py-1 shadow-soft"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => createNode('GROUP')}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                      >
                        <Folder className="h-3.5 w-3.5" />
                        Grupo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => createNode('ENTITY')}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Entidade Visual
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 max-h-[680px]">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-app-muted">
                <AlertCircle className="h-8 w-8 mb-2 stroke-1" />
                <p className="text-[0.88rem] font-medium">Nenhum nó na hierarquia.</p>
                <p className="text-[0.78rem]">Crie o primeiro grupo ou entidade visual.</p>
              </div>
            ) : (
              <>
                {tree.map((node) => renderNode(node, 0))}

                {/* Zona de soltar para mover nó para a raiz da hierarquia */}
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
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!draggedNode) return;
                      moveNode(draggedNode.id, null, 'after');
                      setDraggedNode(null);
                      setDropTargetId(null);
                      setIsOverRoot(false);
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
        </section>

        {/* Painel Direito: Nó Selecionado com Abas e Botão de Remover no Topo Direito */}
        <section className="vt-card flex h-full flex-col overflow-hidden p-0">
          {selected ? (
            <>
              {/* Header do Nó Selecionado */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Representação puramente visual: a troca de ícone vive na aba Ícone & Cor. */}
                    <div
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-app-border bg-app-accent-soft text-app-text"
                    >
                      {selected.kind === 'GROUP' ? (
                        <Folder className="h-5 w-5 text-amber-500" />
                      ) : selectedPointConfig?.geometryKind === 'POINT' && pointIconPreview ? (
                        <img src={pointIconPreview} alt="" className="h-8 w-8" />
                      ) : selectedGeometryKind === 'LINE' ? (
                        <Route className="h-5 w-5 text-sky-600" />
                      ) : (
                        <Scan className="h-5 w-5 text-emerald-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold leading-tight text-app-text truncate">
                        {selected.label}
                      </h3>
                      <p className="text-[0.78rem] text-app-muted leading-tight mt-0.5 truncate font-normal">
                        {selected.kind === 'GROUP'
                          ? 'Grupo / Agrupador'
                          : `Entidade Visual (${
                              selected.entity.category === 'LOCAL'
                                ? 'Local'
                                : selected.entity.category === 'RESOURCE'
                                  ? 'Recurso'
                                  : 'Região'
                            })`}
                      </p>
                    </div>
                  </div>

                  {/* Botão de Remover no canto superior direito */}
                  {canMutate && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="danger"
                        size="sm"
                        iconLeft={<Trash2 className="h-4 w-4" />}
                        onClick={removeSelected}
                        title="Remover este nó da hierarquia"
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </div>

                {/* Abas no estilo segmented control pill */}
                <div className="mt-3.5 flex">
                  <div className="inline-flex items-center rounded-xl bg-black/[0.04] p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('overview')}
                      className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                        activeTab === 'overview'
                          ? 'bg-white text-app-text font-semibold shadow-sm'
                          : 'text-app-muted hover:text-app-text'
                      }`}
                    >
                      Geral
                    </button>
                    {hasVisualEditor && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveTab('icon-color')}
                          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                            activeTab === 'icon-color'
                              ? 'bg-white text-app-text font-semibold shadow-sm'
                              : 'text-app-muted hover:text-app-text'
                          }`}
                        >
                          <Palette className="h-3.5 w-3.5" />
                          Cor
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('size')}
                          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                            activeTab === 'size'
                              ? 'bg-white text-app-text font-semibold shadow-sm'
                              : 'text-app-muted hover:text-app-text'
                          }`}
                        >
                          <Ruler className="h-3.5 w-3.5" />
                          Tamanho
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Conteúdo das Abas */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {activeTab === 'icon-color' && selected.kind === 'ENTITY' && visualEditorConfig ? (
                  <GeoNodeColorTab
                    node={selected}
                    visualConfig={visualEditorConfig}
                    canEdit={canMutate}
                    onChange={(updatedVisualConfig: StudioGeoVisualConfig) =>
                      patchSelected({ visualConfig: updatedVisualConfig })
                    }
                  />
                ) : activeTab === 'size' && selected.kind === 'ENTITY' && visualEditorConfig ? (
                  <GeoNodeSizeTab
                    node={selected}
                    visualConfig={visualEditorConfig}
                    canEdit={canMutate}
                    onChange={(updatedVisualConfig: StudioGeoVisualConfig) =>
                      patchSelected({ visualConfig: updatedVisualConfig })
                    }
                  />
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-[0.76rem] font-semibold text-app-muted">
                        Rótulo
                      </label>
                      <input
                        value={selected.label}
                        disabled={!canMutate}
                        onChange={(event) => patchSelected({ label: event.target.value })}
                        className="w-full rounded-[8px] border border-app-border px-3 py-1.5 text-[0.84rem] text-app-text disabled:bg-transparent"
                      />
                    </div>

                    {selected.kind === 'ENTITY' ? (
                      <div className="rounded-[12px] border border-app-border bg-black/[0.01] p-3.5 space-y-3.5">
                        <div>
                          <label className="block text-[0.78rem] font-semibold text-app-text mb-1.5">
                            Tipo de Entidade
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={!canMutate}
                              onClick={() => handleEntityCategoryChange('RESOURCE')}
                              className={`flex items-center justify-center gap-1.5 rounded-[10px] border py-2 text-[0.8rem] font-medium transition ${
                                selected.entity.category === 'RESOURCE'
                                  ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                                  : 'border-app-border bg-white text-app-muted hover:text-app-text'
                              }`}
                            >
                              <Box className="h-3.5 w-3.5" />
                              Recurso
                            </button>
                            <button
                              type="button"
                              disabled={!canMutate}
                              onClick={() => handleEntityCategoryChange('LOCAL')}
                              className={`flex items-center justify-center gap-1.5 rounded-[10px] border py-2 text-[0.8rem] font-medium transition ${
                                selected.entity.category === 'LOCAL'
                                  ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                                  : 'border-app-border bg-white text-app-muted hover:text-app-text'
                              }`}
                            >
                              <Layers className="h-3.5 w-3.5" />
                              Local (Site)
                            </button>
                            <button
                              type="button"
                              disabled={!canMutate}
                              onClick={() => handleEntityCategoryChange('COVERAGE')}
                              className={`flex items-center justify-center gap-1.5 rounded-[10px] border py-2 text-[0.8rem] font-medium transition ${
                                selected.entity.category === 'COVERAGE'
                                  ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                                  : 'border-app-border bg-white text-app-muted hover:text-app-text'
                              }`}
                            >
                              <Globe className="h-3.5 w-3.5" />
                              Região (Cobertura)
                            </button>
                          </div>
                        </div>


                        <div>
                          <label className="block text-[0.78rem] font-semibold text-app-text mb-1">
                            Entidade Cadastrada (Elegível no Mapa)
                          </label>
                          <select
                            key={selected.entity.category}
                            value={selected.entity.sourceId}
                            disabled={!canMutate}
                            onChange={(event) => handleEntitySourceChange(event.target.value)}
                            className="w-full rounded-[8px] border border-app-border bg-white px-3 py-1.5 text-[0.84rem] text-app-text disabled:bg-transparent"
                          >
                            <option value="">Selecione a entidade de origem…</option>
                            {getEligibleListForCategory(selected.entity.category).map((item) => (
                              <option key={item.id} value={item.sourceId}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[0.8rem] text-app-muted">
                        Grupos agregam todos os nós descendentes em múltiplos níveis na árvore do seletor de camadas.
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-[0.84rem] text-app-muted">
                Selecione um nó da Hierarquia de Camadas para visualizar ou editar.
              </p>
            </div>
          )}
        </section>
      </div>

      {pendingEntityChange && (
        <Modal
          onClose={() => setPendingEntityChange(null)}
          width={480}
          title={<h3>Trocar a entidade de origem?</h3>}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingEntityChange(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmEntityChange}>
                Trocar
              </Button>
            </>
          }
        >
          <p className="text-[0.86rem] text-app-text">
            A configuração visual desta entidade será redefinida com os padrões da nova origem.
          </p>
          <p className="mt-2 text-[0.84rem] text-app-muted">
            Cores, transparência, estilo de traço e tamanhos por escala configurados aqui
            serão redefinidos.
          </p>
        </Modal>
      )}
    </div>
  );
}
