import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Cpu,
  Factory,
  Folder,
  Loader2,
  Radio,
  Search,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import {
  getResourceCatalogTree,
  listResourceCatalogs,
  listResourceSpecifications,
  type ResourceCatalogTreeNode,
} from '../../services/resourceCatalogApi';
import type { ResourceSpecification } from '../../services/resourceApi';
import {
  buildModelSpecificationOptions,
  readSpecificationManufacturer,
  readSpecificationModel,
} from '../../utils/resourceSpecificationForm';

export type ResourceDefinitionModalProps = {
  currentSpecification: ResourceSpecification;
  onCommit: (specificationId: string) => Promise<void> | void;
  onClose: () => void;
};

export type CatalogResourceTypeRef = {
  id: string;
  code: string;
  name: string;
  href?: string;
  '@referredType'?: 'ResourceType';
};

// Picker leve da árvore de catálogo, reusando o padrão visual de ResourceCatalogTree.tsx
function CatalogTreePicker({
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
              : 'border-transparent text-app-text hover:bg-black/[0.04]'
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
            ) : (
              <Boxes className="h-3.5 w-3.5 shrink-0 text-app-muted" />
            )}

            <span className="truncate">{node.name}</span>
          </div>

          {!isGroup && node.resourceType ? (
            <span className="shrink-0 text-[0.7rem] text-app-muted">
              {node.resourceType.code}
            </span>
          ) : null}
        </div>

        {isGroup && isExpanded && node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-[10px] border border-app-border bg-white">
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

export function ResourceDefinitionModal({
  currentSpecification,
  onCommit,
  onClose,
}: ResourceDefinitionModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Árvore do catálogo padrão
  const [treeNodes, setTreeNodes] = useState<ResourceCatalogTreeNode[]>([]);
  // Seleção guiada: Caminho → Tipo de Recurso → Fabricante (filtro) → Especificação
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedResourceType, setSelectedResourceType] = useState<CatalogResourceTypeRef | null>(null);
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('ALL');
  const [selectedSpecificationId, setSelectedSpecificationId] = useState<string>(
    currentSpecification.id,
  );

  // Cache de specs carregadas para o tipo selecionado
  const [typeSpecs, setTypeSpecs] = useState<ResourceSpecification[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);

  // Carga inicial da árvore via getResourceCatalogTree
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void listResourceCatalogs()
      .then(async (catalogs) => {
        const catalog =
          catalogs.find((c) => c.status === 'active' && c.isDefault) ??
          catalogs.find((c) => c.status === 'active');
        if (!catalog) throw new Error('Nenhum catálogo ativo encontrado');
        const tree = await getResourceCatalogTree(catalog.id);
        if (cancelled) return;
        setTreeNodes(tree);

        // Inicializa com o tipo atual da spec procurando na árvore
        const currentTypeId = currentSpecification.resourceTypeId;
        if (currentTypeId) {
          const findTypeNode = (items: ResourceCatalogTreeNode[]): CatalogResourceTypeRef | null => {
            for (const item of items) {
              if (item.kind === 'RESOURCE_TYPE' && item.resourceTypeId === currentTypeId && item.resourceType) {
                return item.resourceType;
              }
              if (item.children) {
                const sub = findTypeNode(item.children);
                if (sub) return sub;
              }
            }
            return null;
          };
          const matchType = findTypeNode(tree);
          if (matchType) {
            setSelectedResourceType(matchType);
          } else if (currentSpecification.resourceType) {
            setSelectedResourceType({
              id: currentTypeId,
              code: currentSpecification.resourceType,
              name: currentSpecification.resourceType,
            });
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar catálogo');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentSpecification.resourceTypeId]);

  // Carga de especificações quando o tipo de recurso muda
  useEffect(() => {
    const typeId = selectedResourceType?.id ?? currentSpecification.resourceTypeId;
    if (!typeId) {
      setTypeSpecs([]);
      return;
    }
    let cancelled = false;
    setSpecsLoading(true);

    void listResourceSpecifications({ resourceTypeId: typeId, includeEnded: false })
      .then((specs) => {
        if (cancelled) return;
        // Mescla a especificação atual caso ela não venha na página ou esteja ended
        const exists = specs.some((s) => s.id === currentSpecification.id);
        const merged = exists ? specs : [currentSpecification, ...specs];
        setTypeSpecs(merged);

        // Se a spec selecionada não pertence a este tipo, reseta para a primeira do novo tipo
        if (!merged.some((s) => s.id === selectedSpecificationId)) {
          const first = merged[0];
          setSelectedSpecificationId(first ? first.id : '');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao listar especificações');
        }
      })
      .finally(() => {
        if (!cancelled) setSpecsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedResourceType?.id, currentSpecification]);

  // Fabricantes distintos para o tipo selecionado (filtro puro)
  const manufacturerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const spec of typeSpecs) {
      const m = readSpecificationManufacturer(spec);
      if (m && m !== '-') names.add(m);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [typeSpecs]);

  // Especificações visíveis após o filtro de fabricante
  const visibleSpecifications = useMemo(() => {
    const base = buildModelSpecificationOptions(
      typeSpecs,
      selectedResourceType?.id ?? currentSpecification.resourceTypeId ?? '',
    );
    if (manufacturerFilter === 'ALL') return base;
    return base.filter((s) => readSpecificationManufacturer(s) === manufacturerFilter);
  }, [typeSpecs, selectedResourceType?.id, currentSpecification.resourceTypeId, manufacturerFilter]);

  // Fabricante muda: ajusta a spec selecionada se a atual não estiver mais nas visíveis
  useEffect(() => {
    if (visibleSpecifications.length > 0 && !visibleSpecifications.some((s) => s.id === selectedSpecificationId)) {
      const first = visibleSpecifications[0];
      if (first) setSelectedSpecificationId(first.id);
    }
  }, [visibleSpecifications, selectedSpecificationId]);

  const handleSelectTypeFromTree = (type: CatalogResourceTypeRef, pathLabel: string) => {
    setSelectedResourceType(type);
    setSelectedPath(pathLabel);
    setManufacturerFilter('ALL');
  };

  const handleSave = async () => {
    if (!selectedSpecificationId) return;
    try {
      setSubmitting(true);
      setError(null);
      await onCommit(selectedSpecificationId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar especificação');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      width={680}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-app-accent-soft text-app-text">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-app-text text-[0.98rem]">Definição do recurso</h3>
            <p className="text-[0.78rem] text-app-muted">
              Troca guiada: Caminho → Tipo de Recurso → Fabricante → Especificação
            </p>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={submitting || !selectedSpecificationId || loading || specsLoading}
          >
            {submitting ? 'Salvando…' : 'Salvar alteração'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error && (
          <div
            className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[0.88rem] text-app-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando árvore de catálogo…</span>
          </div>
        ) : (
          <>
            {/* Nível 1: Caminho na árvore */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
                <Radio className="h-3.5 w-3.5" />
                <span>1. Caminho e Tipo de Recurso no Catálogo</span>
              </label>
              <CatalogTreePicker
                nodes={treeNodes}
                selectedTypeId={selectedResourceType?.id ?? currentSpecification.resourceTypeId ?? null}
                onSelectType={handleSelectTypeFromTree}
              />
              {selectedPath ? (
                <p className="px-1 text-[0.75rem] text-app-muted">
                  Caminho selecionado: <span className="font-medium text-app-text">{selectedPath}</span>
                </p>
              ) : null}
            </div>

            {/* Nível 2 + 3: Tipo (consequência) e Fabricante (filtro) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
                  <Boxes className="h-3.5 w-3.5" />
                  <span>2. Tipo do Recurso</span>
                </label>
                <input
                  readOnly
                  disabled
                  value={
                    selectedResourceType
                      ? `${selectedResourceType.name} (${selectedResourceType.code})`
                      : '—'
                  }
                  className="geo-input bg-slate-50 text-app-muted cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
                  <Factory className="h-3.5 w-3.5" />
                  <span>3. Fabricante (filtro de busca)</span>
                </label>
                <select
                  value={manufacturerFilter}
                  onChange={(e) => setManufacturerFilter(e.target.value)}
                  className="geo-input"
                  aria-label="Filtrar por Fabricante"
                >
                  <option value="ALL">Todos os fabricantes ({manufacturerOptions.length})</option>
                  {manufacturerOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Nível 4: Especificação final */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-app-muted">
                <Cpu className="h-3.5 w-3.5" />
                <span>4. Especificação</span>
              </label>

              {specsLoading ? (
                <div className="flex items-center gap-2 py-2 text-[0.82rem] text-app-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Carregando especificações…</span>
                </div>
              ) : visibleSpecifications.length === 0 ? (
                <p className="rounded-[8px] border border-dashed border-app-border p-3 text-[0.82rem] text-app-muted text-center">
                  Nenhuma especificação encontrada para este tipo e fabricante.
                </p>
              ) : (
                <select
                  value={selectedSpecificationId}
                  onChange={(e) => setSelectedSpecificationId(e.target.value)}
                  className="geo-input"
                  aria-label="Especificação"
                >
                  {visibleSpecifications.map((spec) => {
                    const m = readSpecificationManufacturer(spec);
                    const mod = readSpecificationModel(spec);
                    return (
                      <option key={spec.id} value={spec.id}>
                        {mod !== '-' ? `${mod} (${spec.name})` : spec.name}
                        {m !== '-' ? ` · ${m}` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
