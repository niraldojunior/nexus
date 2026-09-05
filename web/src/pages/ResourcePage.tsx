import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Filter,
  Layers3,
  Link2,
  Loader2,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  createResource,
  deleteResource,
  listResources,
  loadResourceWorkspaceSnapshot,
  updateResource,
  type ResourceCategory,
  type LogicalResource,
  type LogicalResourcePayload,
  type PhysicalResource,
  type PhysicalResourcePayload,
  type ResourceEntity,
  type ResourceSpecification,
  type ResourceType,
} from '../services/resourceApi';
import { useNavigation } from '../hooks/useNavigation';
import { PlaceLabelCompact } from '../components/PlaceLabel';
import { PlacePicker } from '../components/PlacePicker';
import ColumnFilterMenu from '../components/ColumnFilterMenu';
import Field from '../components/Field';
import { PageHead, Button, Card, StatusPill, Modal } from '../components/ui';
import { resourceFieldLabel } from '../utils/resourceFieldLabels';
import {
  DEFAULT_RESOURCE_CATEGORY_CODE,
  resourceCategoryDescription,
} from '../data/resourceCategoryViews';
import {
  buildPhysicalModelOptions,
  buildTypeOptions,
  categoryIconForCode,
  emptyResourceSpecFormState,
  isPhysicalCategoryCode,
  type ResourceSpecFormState,
} from '../utils/resourceSpecificationForm';

const PAGE_SIZE = 20;
// Inventário apenas — o Catálogo (ResourceSpecification) foi centralizado em Configurações
// (acesso restrito a admin), ver ResourceCatalogTab.tsx.
type ResourceTabId = 'PhysicalResource' | 'LogicalResource';
type ResourceMode = 'create' | 'edit';

type ModalState = {
  tab: ResourceTabId;
  mode: ResourceMode;
  entity: ResourceEntity | null;
};

type ResourceFormState = ResourceSpecFormState & {
  resourceSpecificationId: string;
  placeId: string;
  placeType: string;
  status: string;
  serialNumber: string;
  partNumber: string;
  supportingPhysicalResourceId: string;
};

const emptyFormState = (): ResourceFormState => ({
  ...emptyResourceSpecFormState(),
  resourceSpecificationId: '',
  placeId: '',
  placeType: '',
  status: 'active',
  serialNumber: '',
  partNumber: '',
  supportingPhysicalResourceId: '',
});

const tabConfig: Record<
  ResourceTabId,
  {
    title: string;
    icon: LucideIcon;
    buildColumns: () => Array<{ key: string; label: string }>;
  }
> = {
  PhysicalResource: {
    title: 'Recursos Físicos',
    icon: Layers3,
    buildColumns: () => [
      { key: 'name', label: resourceFieldLabel('name') },
      { key: 'spec', label: resourceFieldLabel('resourceSpecificationName') },
      { key: 'resourceType', label: resourceFieldLabel('resourceType') },
      { key: 'place', label: resourceFieldLabel('placeId') },
      { key: 'status', label: 'Status' },
      { key: 'details', label: 'Detalhes' },
    ],
  },
  LogicalResource: {
    title: 'Recursos Lógicos',
    icon: Link2,
    buildColumns: () => [
      { key: 'name', label: resourceFieldLabel('name') },
      { key: 'spec', label: resourceFieldLabel('resourceSpecificationName') },
      { key: 'place', label: resourceFieldLabel('placeId') },
      { key: 'status', label: 'Status' },
      { key: 'details', label: 'Vínculo físico' },
    ],
  },
};

// Colunas cujo domínio é um conjunto fechado de valores de sistema (não texto livre) e que, por
// isso, ganham filtro por picklist no cabeçalho. Datas, nomes e modelos ficam de fora.
const FILTERABLE_COLUMNS: Record<ResourceTabId, string[]> = {
  PhysicalResource: ['spec', 'resourceType', 'status'],
  LogicalResource: ['spec', 'status'],
};

type OpenFilterState = { key: string; rect: DOMRect };

interface ResourcePageProps {
  category?: string;
}

export default function ResourcePage({ category: categoryProp }: ResourcePageProps = {}) {
  const category = categoryProp ?? DEFAULT_RESOURCE_CATEGORY_CODE;
  const isPhysicalCategory = isPhysicalCategoryCode(category);
  const effectiveTab: ResourceTabId = isPhysicalCategory ? 'PhysicalResource' : 'LogicalResource';

  const [page, setPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<OpenFilterState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [resourceSpecificationOptions, setResourceSpecificationOptions] = useState<
    ResourceSpecification[]
  >([]);
  // Página atual + total já filtrados/paginados pelo servidor (PhysicalResource/LogicalResource).
  // O catálogo (ResourceSpecification) é pequeno o bastante para continuar paginando no cliente.
  const [items, setItems] = useState<ResourceEntity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // Opções limitadas para o combobox "recurso físico de suporte" do modal de LogicalResource —
  // buscadas sob demanda na abertura do modal, nunca a partir do inventário completo.
  const [supportingPhysicalResourceChoices, setSupportingPhysicalResourceChoices] = useState<
    PhysicalResource[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [formState, setFormState] = useState<ResourceFormState>(emptyFormState());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const refreshCatalogRef = useRef<null | (() => void)>(null);

  const { goToGeo } = useNavigation();

  const activeTabConfig = tabConfig[effectiveTab];
  const activeColumns = activeTabConfig.buildColumns();
  const categoryName = resourceCategories.find((item) => item.code === category)?.name ?? category;
  const CategoryIcon = categoryIconForCode(category);

  const filterableColumns = FILTERABLE_COLUMNS[effectiveTab];

  // Domínio do picklist do cabeçalho — vem dos catálogos (specs/tipos já carregados por completo)
  // em vez de escanear o inventário, que nunca fica todo em memória no cliente.
  const columnDomain = (key: string): string[] => {
    if (key === 'spec') {
      return resourceSpecificationOptions
        .filter((spec) => spec.category === category)
        .map((spec) => spec.name)
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    }
    if (key === 'resourceType') {
      return resourceTypes
        .filter((type) => type.categoryCode === category)
        .map((type) => type.code)
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    }
    if (key === 'status') {
      // O workspace só traz recursos ativos (status='active' é fixo no backend), então o domínio
      // hoje é sempre um único valor — igual ao comportamento anterior client-side.
      return ['active'];
    }
    return [];
  };

  // Traduz os valores selecionados no picklist (nomes/código exibidos) para os IDs que o servidor
  // entende — os catálogos completos (specs/tipos) já estão em memória, então isso é barato.
  const selectedResourceSpecificationIds = (): string[] | undefined => {
    const selectedNames = columnFilters.spec;
    if (!selectedNames || selectedNames.size === 0) return undefined;
    const namesLower = new Set([...selectedNames].map((name) => name.toLowerCase()));
    return resourceSpecificationOptions
      .filter((spec) => spec.category === category && namesLower.has(spec.name.toLowerCase()))
      .map((spec) => spec.id);
  };

  const selectedResourceTypes = (): string[] | undefined => {
    const selected = columnFilters.resourceType;
    if (!selected || selected.size === 0) return undefined;
    return [...selected];
  };

  const setColumnFilter = (key: string, values: Set<string>) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (values.size === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  };

  const toggleColumnFilterValue = (key: string, value: string) => {
    setColumnFilters((current) => {
      const next = { ...current };
      const set = new Set(next[key] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size === 0) delete next[key];
      else next[key] = set;
      return next;
    });
  };

  const clearColumnFilter = (key: string) => {
    setColumnFilters((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const totalItemCount = totalCount;
  const totalPages = Math.max(1, Math.ceil(totalItemCount / PAGE_SIZE));
  const activePage = Math.min(Math.max(1, page), totalPages);
  const pageItems: ResourceEntity[] = items;
  const hasMore = activePage < totalPages;
  const hasActiveColumnFilters = Object.values(columnFilters).some((values) => values.size > 0);

  const selectedOnPage = pageItems.filter((item) => selectedIds.has(item.id));
  const pageSelectionCount = selectedOnPage.length;
  const selectedCount = selectedIds.size;
  const selectedDeletePreview = selectedOnPage
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ');

  const loadWorkspaceData = async (tab: ResourceTabId, pageNumber: number): Promise<void> => {
    setIsLoading(true);
    setLookupLoading(true);
    setError(null);
    try {
      const snapshot = await loadResourceWorkspaceSnapshot({
        tab,
        limit: PAGE_SIZE,
        offset: (pageNumber - 1) * PAGE_SIZE,
        category,
        resourceSpecificationIdIn: selectedResourceSpecificationIds(),
        ...(tab === 'PhysicalResource' ? { resourceTypeIn: selectedResourceTypes() } : {}),
      });

      setResourceSpecificationOptions(snapshot.resourceSpecificationOptions);
      setResourceCategories(snapshot.resourceCategories);
      setResourceTypes(snapshot.resourceTypes);
      setItems(snapshot.items as ResourceEntity[]);
      setTotalCount(snapshot.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Resource.');
    } finally {
      setIsLoading(false);
      setLookupLoading(false);
    }
  };

  // Refaz o fetch sempre que a aba, a categoria, a página ou os filtros de coluna mudam — a
  // paginação/filtro de PhysicalResource e LogicalResource é sempre resolvida no servidor.
  useEffect(() => {
    void loadWorkspaceData(effectiveTab, page);
  }, [effectiveTab, category, page, columnFilters]);

  // Se a página atual ficar fora do alcance (ex.: exclusão esvaziou a última página), volta para
  // a última página válida — o que dispara o efeito acima e refaz o fetch automaticamente.
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [totalCount, page]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      pageSelectionCount > 0 && pageSelectionCount < pageItems.length;
  }, [pageItems.length, pageSelectionCount]);

  // Category changes reset the local pagination/selection/filter scope.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    setColumnFilters({});
    setOpenFilter(null);
  }, [category]);

  // Any change to the active filters returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [columnFilters]);

  useEffect(() => {
    if (!modalState) {
      setFormState(emptyFormState());
      return;
    }

    const entity = modalState.entity as ResourceEntity | null;
    const resourceSpecification = resourceSpecificationOptions.find(
      (spec) => spec.id === entity?.resourceSpecificationId,
    );
    setFormState({
      ...emptyFormState(),
      name: entity?.name ?? '',
      resourceSpecificationId: entity?.resourceSpecificationId ?? '',
      // Physical resources scope their catalog lookups by category; default to the active page category.
      category: isPhysicalResource(entity)
        ? (resourceSpecification?.category ?? category)
        : category,
      resourceType: isPhysicalResource(entity) ? (resourceSpecification?.resourceType ?? '') : '',
      placeId: entity?.place?.id ?? '',
      placeType: entity?.place?.['@referredType'] ?? '',
      status: entity?.status ?? 'active',
      serialNumber: isPhysicalResource(entity) ? (entity.serialNumber ?? '') : '',
      partNumber: isPhysicalResource(entity) ? (entity.partNumber ?? '') : '',
      supportingPhysicalResourceId: isLogicalResource(entity)
        ? (entity.supportingPhysicalResourceId ?? '')
        : '',
    });
  }, [modalState, category]);

  // Busca sob demanda uma amostra de recursos físicos para o combobox de "recurso de suporte" do
  // modal de LogicalResource — nunca o inventário inteiro, que pode ter dezenas de milhares de itens.
  useEffect(() => {
    if (!modalState || modalState.tab !== 'LogicalResource') return;
    let cancelled = false;
    void (async () => {
      try {
        const options = await listResources({
          kind: 'PhysicalResource',
          limit: 200,
          offset: 0,
          status: 'active',
        });
        if (!cancelled) setSupportingPhysicalResourceChoices(options as PhysicalResource[]);
      } catch {
        // Best-effort: o campo já tolera um id selecionado sem opção correspondente na lista.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalState]);

  useEffect(() => {
    if (!modalState || modalState.mode !== 'create') return;
    if (modalState.tab !== 'LogicalResource') return;
    const firstCategorySpecId =
      resourceSpecificationOptions.find((spec) => spec.category === category)?.id ?? '';
    setFormState((current) => {
      const nextResourceSpecificationId = current.resourceSpecificationId || firstCategorySpecId;
      if (nextResourceSpecificationId === current.resourceSpecificationId) return current;
      return { ...current, resourceSpecificationId: nextResourceSpecificationId };
    });
  }, [modalState, resourceSpecificationOptions, category]);

  const goToPage = (nextPage: number) => {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selectedOnPage.length === pageItems.length && pageItems.length > 0) {
        for (const item of pageItems) next.delete(item.id);
      } else {
        for (const item of pageItems) next.add(item.id);
      }
      return next;
    });
  };

  const openCreateModal = () => {
    setModalState({ tab: effectiveTab, mode: 'create', entity: null });
  };

  const openEditModal = (entity: ResourceEntity) => {
    setModalState({ tab: effectiveTab, mode: 'edit', entity });
  };

  const closeModal = () => {
    setModalState(null);
    setSaving(false);
  };

  const openDeleteConfirmation = () => {
    if (!selectedCount) return;
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirmation = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
  };

  const refreshWorkspace = async () => {
    await loadWorkspaceData(effectiveTab, page);
  };

  refreshCatalogRef.current = () => {
    void refreshWorkspace();
  };

  useEffect(() => {
    const handler = () => {
      refreshCatalogRef.current?.();
    };

    window.addEventListener('nexus:resource-catalog-updated', handler);
    return () => window.removeEventListener('nexus:resource-catalog-updated', handler);
  }, []);

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (modalState?.tab === 'PhysicalResource') {
        const payload = buildPhysicalPayload(formState);
        if (modalState.mode === 'create') {
          await createResource({ '@type': 'PhysicalResource', ...payload });
        } else if (modalState.entity) {
          await updateResource(modalState.entity.id, { '@type': 'PhysicalResource', ...payload });
        }
      } else if (modalState?.tab === 'LogicalResource') {
        const payload = buildLogicalPayload(formState);
        if (modalState.mode === 'create') {
          await createResource({ '@type': 'LogicalResource', ...payload });
        } else if (modalState.entity) {
          await updateResource(modalState.entity.id, { '@type': 'LogicalResource', ...payload });
        }
      }
      closeModal();
      setSelectedIds(new Set());
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar Resource.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSelected = async () => {
    if (!selectedCount) return;
    setDeleting(true);
    setError(null);
    try {
      const idsToDelete = [...selectedIds];
      for (const id of idsToDelete) {
        await deleteResource(id);
      }
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir Resource.');
    } finally {
      setDeleting(false);
    }
  };

  const rows = pageItems.map((resourceItem) => (
    <tr key={resourceItem.id} className="cursor-pointer" onClick={() => openEditModal(resourceItem)}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          aria-label={`Selecionar ${resourceItem.name}`}
          checked={selectedIds.has(resourceItem.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={() => toggleSelected(resourceItem.id)}
        />
      </td>
      <td className="px-4 py-3 text-[0.92rem] font-semibold text-app-text">{resourceItem.name}</td>
      <td className="px-4 py-3 text-[0.88rem] text-app-muted">
        {readResourceSpecificationName(
          resourceSpecificationOptions,
          resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId,
        )}
      </td>
      {effectiveTab === 'PhysicalResource' ? (
        <td className="px-4 py-3 text-[0.88rem] text-app-muted">
          {readResourceSpecificationType(
            resourceSpecificationOptions,
            resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId,
          )}
        </td>
      ) : null}
      <td className="px-4 py-3 text-[0.88rem] text-app-muted">
        <div className="flex items-center gap-2">
          <PlaceLabelCompact place={resourceItem.place} />
          {resourceItem.place?.id && (
            <button
              type="button"
              onClick={() => goToGeo(resourceItem.place!.id)}
              className="text-[0.75rem] font-semibold text-app-accent hover:text-app-accent-border transition"
              title="Ver no mapa de locais"
            >
              📍
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {resourceItem.status ? <StatusPill status={resourceItem.status} /> : '-'}
      </td>
      <td className="px-4 py-3 text-[0.88rem] text-app-muted">
        {effectiveTab === 'PhysicalResource'
          ? physicalDetails(resourceItem as PhysicalResource)
          : logicalDetails(resourceItem as LogicalResource)}
      </td>
    </tr>
  ));

  return (
    <div className="h-full min-h-0 overflow-hidden bg-white px-8 py-8">
      <div className="mx-auto flex h-full flex-col gap-6" style={{ maxWidth: 'var(--content-max)' }}>
        <PageHead
          title={
            <span className="flex min-w-0 items-center gap-3">
              <CategoryIcon className="h-6 w-6 shrink-0 text-app-muted" strokeWidth={2} />
              <span className="truncate">{categoryName}</span>
            </span>
          }
          subtitle={resourceCategoryDescription(category)}
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={openCreateModal}
                aria-label="Criar recurso"
                title="Criar recurso"
                iconLeft={<Plus className="h-4 w-4" />}
              />
              <Button
                variant="secondary"
                size="md"
                onClick={openDeleteConfirmation}
                disabled={!selectedCount || saving || deleting}
                aria-label="Excluir selecionados"
                title="Excluir selecionados"
                iconLeft={<Trash2 className="h-4 w-4" />}
              />
            </>
          }
        />

        {error ? (
          <Card
            elevation="flat"
            style={{ borderColor: 'var(--status-red)', background: 'var(--status-red-soft)' }}
          >
            <span style={{ color: 'var(--status-red)', fontSize: 'var(--fs-body-lg)' }}>{error}</span>
          </Card>
        ) : null}

        <Card elevation="flat" pad={0} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto">
            <table className="vt-table">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="w-[56px]">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Selecionar página atual"
                      checked={pageItems.length > 0 && pageSelectionCount === pageItems.length}
                      onChange={toggleSelectPage}
                    />
                  </th>
                  {activeColumns.map((column) => {
                    const isFilterable = filterableColumns.includes(column.key);
                    const activeCount = columnFilters[column.key]?.size ?? 0;
                    return (
                      <th key={column.key}>
                        {isFilterable ? (
                          <button
                            type="button"
                            title={`Filtrar por ${column.label}`}
                            aria-expanded={openFilter?.key === column.key}
                            onClick={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setOpenFilter((current) =>
                                current?.key === column.key ? null : { key: column.key, rect },
                              );
                            }}
                            className={`-mx-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 transition hover:bg-app-accent-soft ${
                              activeCount ? 'text-app-text' : 'text-app-muted'
                            }`}
                          >
                            <span>{column.label}</span>
                            <Filter
                              className={`h-3 w-3 ${activeCount ? 'text-app-text' : 'text-app-muted opacity-60'}`}
                              strokeWidth={2}
                              fill={activeCount ? 'currentColor' : 'none'}
                              aria-hidden
                            />
                            {activeCount ? (
                              <span className="rounded-full bg-app-accent px-1.5 text-[0.6rem] font-bold leading-[1.4] text-app-text">
                                {activeCount}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows
                ) : (
                  <tr>
                    <td colSpan={activeColumns.length + 1} className="text-center">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-app-border px-5 py-4">
            <div className="text-[0.88rem] text-app-muted">
              {selectedCount
                ? `${selectedCount} selecionados no total`
                : totalItemCount
                  ? `Mostrando ${(activePage - 1) * PAGE_SIZE + 1}–${Math.min(activePage * PAGE_SIZE, totalItemCount)} de ${totalItemCount} registro(s)`
                  : hasActiveColumnFilters
                    ? 'Nenhum registro para os filtros aplicados'
                    : 'Nenhuma seleção ativa'}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-[0.88rem] text-app-muted">
                Página {activePage} de {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => goToPage(activePage - 1)}
                  disabled={activePage <= 1 || isLoading}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => goToPage(activePage + 1)}
                  disabled={!hasMore || isLoading}
                >
                  Próximo
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {openFilter ? (
        <ColumnFilterMenu
          label={activeColumns.find((column) => column.key === openFilter.key)?.label ?? ''}
          rect={openFilter.rect}
          options={columnDomain(openFilter.key)}
          selected={columnFilters[openFilter.key] ?? new Set()}
          onToggle={(value) => toggleColumnFilterValue(openFilter.key, value)}
          onSelectAll={() => setColumnFilter(openFilter.key, new Set(columnDomain(openFilter.key)))}
          onClear={() => clearColumnFilter(openFilter.key)}
          onClose={() => setOpenFilter(null)}
        />
      ) : null}

      {modalState ? (
        <ResourceModal
          tab={modalState.tab}
          mode={modalState.mode}
          category={category}
          formState={formState}
          resourceTypes={resourceTypes}
          resourceSpecificationOptions={resourceSpecificationOptions}
          physicalResourceOptions={supportingPhysicalResourceChoices}
          lookupLoading={lookupLoading}
          saving={saving}
          onClose={closeModal}
          onChange={setFormState}
          onSubmit={submitModal}
        />
      ) : null}

      {deleteConfirmOpen
        ? createPortal(
            <Modal
              title={
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--status-amber-soft)', color: 'var(--status-amber)' }}
                  >
                    <AlertTriangle className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <span>
                    Excluir {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}?
                  </span>
                </span>
              }
              width={520}
              onClose={closeDeleteConfirmation}
              footer={
                <>
                  <Button variant="secondary" onClick={closeDeleteConfirmation} disabled={deleting}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void confirmDeleteSelected()}
                    disabled={deleting}
                    iconLeft={<Trash2 className="h-4 w-4" />}
                  >
                    {deleting ? 'Excluindo...' : 'Confirmar exclusão'}
                  </Button>
                </>
              }
            >
              <div className="grid gap-4" style={{ color: 'var(--text-secondary)' }}>
                <p>
                  A exclusão é lógica. Os itens selecionados serão encerrados e removidos da
                  listagem ativa.
                </p>
                {selectedDeletePreview ? (
                  <div
                    className="px-4 py-3"
                    style={{
                      borderRadius: 'var(--radius-xl)',
                      background: 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedDeletePreview}
                    {selectedCount > selectedOnPage.length
                      ? ' e outros itens selecionados em páginas anteriores.'
                      : ''}
                  </div>
                ) : null}
              </div>
            </Modal>,
            document.body,
          )
        : null}

      {isLoading ? (
        <div
          className="pointer-events-none fixed bottom-6 right-6 z-50 px-4 py-3 text-[0.88rem] font-medium backdrop-blur"
          style={{
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border)',
            background: 'rgba(255, 255, 255, 0.9)',
            color: 'var(--text-tertiary)',
          }}
        >
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Carregando dados...
        </div>
      ) : null}
    </div>
  );
}

function ResourceModal({
  tab,
  mode,
  category,
  formState,
  resourceTypes,
  resourceSpecificationOptions,
  physicalResourceOptions,
  lookupLoading,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  tab: ResourceTabId;
  mode: ResourceMode;
  category: string;
  formState: ResourceFormState;
  resourceTypes: ResourceType[];
  resourceSpecificationOptions: ResourceSpecification[];
  physicalResourceOptions: PhysicalResource[];
  lookupLoading: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: (next: ResourceFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  // A página já assume o Inventário (tab é sempre PhysicalResource ou LogicalResource) — o
  // Catálogo (ResourceSpecification) foi centralizado em Configurações.
  const title = `${mode === 'create' ? 'Criar' : 'Editar'} ${tabConfig[tab].title}`;
  const visibleTypeOptions = buildTypeOptions(resourceTypes, category);
  const selectedResourceSpecification = resourceSpecificationOptions.find(
    (spec) => spec.id === formState.resourceSpecificationId,
  );
  const physicalTypeOptions = visibleTypeOptions;
  const physicalModelOptions = buildPhysicalModelOptions(
    resourceSpecificationOptions,
    category,
    formState.resourceType,
  );
  const logicalSpecificationOptions = resourceSpecificationOptions.filter(
    (spec) => spec.category === category,
  );
  const selectedPhysicalResource = physicalResourceOptions.find(
    (resource) => resource.id === formState.supportingPhysicalResourceId,
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <Modal title={title} width={880} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4">
        {tab === 'PhysicalResource' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={resourceFieldLabel('name')}>
                <input
                  required
                  value={formState.name}
                  onChange={(event) => onChange({ ...formState, name: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('resourceType')}>
                <select
                  required
                  value={formState.resourceType}
                  onChange={(event) => {
                    const nextResourceType = event.target.value;
                    onChange({
                      ...formState,
                      resourceType: nextResourceType,
                      resourceSpecificationId: '',
                    });
                  }}
                  className="geo-input"
                  disabled={!formState.category}
                >
                  <option value="">Selecione um tipo</option>
                  {physicalTypeOptions.map((option) => (
                    <option key={option.code} value={option.code} disabled={!option.active}>
                      {option.label}
                      {!option.active ? ' (inativo)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <select
                  required
                  value={formState.resourceSpecificationId}
                  onChange={(event) => {
                    const nextSpecification = resourceSpecificationOptions.find(
                      (spec) => spec.id === event.target.value,
                    );
                    onChange({
                      ...formState,
                      resourceSpecificationId: event.target.value,
                      category: nextSpecification?.category ?? formState.category,
                      resourceType: nextSpecification?.resourceType ?? formState.resourceType,
                    });
                  }}
                  className="geo-input"
                  disabled={
                    !formState.category ||
                    !formState.resourceType ||
                    (lookupLoading && !resourceSpecificationOptions.length)
                  }
                >
                  <option value="">Selecione um modelo</option>
                  {physicalModelOptions.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name}
                    </option>
                  ))}
                  {formState.resourceSpecificationId &&
                  selectedResourceSpecification &&
                  !physicalModelOptions.some(
                    (spec) => spec.id === selectedResourceSpecification.id,
                  ) ? (
                    <option value={selectedResourceSpecification.id}>
                      {selectedResourceSpecification.name}
                    </option>
                  ) : null}
                  {formState.resourceSpecificationId && !selectedResourceSpecification ? (
                    <option value={formState.resourceSpecificationId}>Modelo legado</option>
                  ) : null}
                </select>
              </Field>
              <Field label={resourceFieldLabel('placeId')}>
                <PlacePicker
                  value={
                    formState.placeId
                      ? {
                          id: formState.placeId,
                          '@referredType': formState.placeType || 'GeographicSite',
                        }
                      : null
                  }
                  onChange={(place) => {
                    onChange({
                      ...formState,
                      placeId: place?.id ?? '',
                      placeType: place?.['@referredType'] ?? '',
                    });
                  }}
                  placeholder="Selecione um local…"
                />
              </Field>
              <Field label="status">
                <select
                  value={formState.status}
                  onChange={(event) => onChange({ ...formState, status: event.target.value })}
                  className="geo-input"
                >
                  {['active', 'inactive', 'suspended', 'terminated'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="serialNumber">
                <input
                  value={formState.serialNumber}
                  onChange={(event) => onChange({ ...formState, serialNumber: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label="partNumber">
                <input
                  value={formState.partNumber}
                  onChange={(event) => onChange({ ...formState, partNumber: event.target.value })}
                  className="geo-input"
                />
              </Field>
            </div>
          ) : null}

          {tab === 'LogicalResource' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={resourceFieldLabel('name')}>
                <input
                  required
                  value={formState.name}
                  onChange={(event) => onChange({ ...formState, name: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('resourceSpecificationName')}>
                <select
                  required
                  value={formState.resourceSpecificationId}
                  onChange={(event) =>
                    onChange({ ...formState, resourceSpecificationId: event.target.value })
                  }
                  className="geo-input"
                  disabled={lookupLoading && !resourceSpecificationOptions.length}
                >
                  <option value="">Selecione uma especificacao</option>
                  {logicalSpecificationOptions.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name} · {spec.resourceType}
                    </option>
                  ))}
                  {formState.resourceSpecificationId && !selectedResourceSpecification ? (
                    <option value={formState.resourceSpecificationId}>
                      {formState.resourceSpecificationId}
                    </option>
                  ) : null}
                </select>
                <span className="text-[0.72rem] font-normal uppercase tracking-[0.05em] text-app-muted">
                  {selectedResourceSpecification
                    ? `${selectedResourceSpecification.name} · ${selectedResourceSpecification.category} · ${selectedResourceSpecification.resourceType}`
                    : 'Lookup TMF634'}
                </span>
              </Field>
              <Field label={resourceFieldLabel('placeId')}>
                <PlacePicker
                  value={
                    formState.placeId
                      ? {
                          id: formState.placeId,
                          '@referredType': formState.placeType || 'GeographicSite',
                        }
                      : null
                  }
                  onChange={(place) => {
                    onChange({
                      ...formState,
                      placeId: place?.id ?? '',
                      placeType: place?.['@referredType'] ?? '',
                    });
                  }}
                  placeholder="Selecione um local…"
                />
              </Field>
              <Field label="status">
                <select
                  value={formState.status}
                  onChange={(event) => onChange({ ...formState, status: event.target.value })}
                  className="geo-input"
                >
                  {['active', 'inactive', 'suspended', 'terminated'].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={resourceFieldLabel('supportingPhysicalResourceName')}>
                <select
                  value={formState.supportingPhysicalResourceId}
                  onChange={(event) =>
                    onChange({ ...formState, supportingPhysicalResourceId: event.target.value })
                  }
                  className="geo-input"
                >
                  <option value="">Selecione um recurso fisico</option>
                  {physicalResourceOptions.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name} · {resource.resourceSpecificationId}
                    </option>
                  ))}
                  {formState.supportingPhysicalResourceId && !selectedPhysicalResource ? (
                    <option value={formState.supportingPhysicalResourceId}>
                      {formState.supportingPhysicalResourceId}
                    </option>
                  ) : null}
                </select>
                <span className="text-[0.72rem] font-normal uppercase tracking-[0.05em] text-app-muted">
                  {selectedPhysicalResource
                    ? `${selectedPhysicalResource.name} · ${selectedPhysicalResource.resourceSpecificationId}`
                    : 'Lookup TMF639'}
                </span>
              </Field>
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-3 border-t border-app-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </Button>
          </div>
      </form>
    </Modal>,
    document.body,
  );
}

function buildPhysicalPayload(state: ResourceFormState): PhysicalResourcePayload {
  return {
    name: state.name.trim(),
    resourceSpecificationId: state.resourceSpecificationId.trim(),
    placeId: state.placeId.trim(),
    placeType: state.placeType.trim(),
    status: state.status as PhysicalResource['status'],
    serialNumber: state.serialNumber.trim(),
    partNumber: state.partNumber.trim(),
  };
}

function buildLogicalPayload(state: ResourceFormState): LogicalResourcePayload {
  return {
    name: state.name.trim(),
    resourceSpecificationId: state.resourceSpecificationId.trim(),
    placeId: state.placeId.trim(),
    placeType: state.placeType.trim(),
    status: state.status as LogicalResource['status'],
    supportingPhysicalResourceId: state.supportingPhysicalResourceId.trim(),
  };
}

function readResourceSpecificationName(
  specifications: ResourceSpecification[],
  specificationId: string,
): string {
  return specifications.find((spec) => spec.id === specificationId)?.name ?? specificationId;
}

function readResourceSpecificationType(
  specifications: ResourceSpecification[],
  specificationId: string,
): string {
  return (
    specifications.find((spec) => spec.id === specificationId)?.resourceType ?? specificationId
  );
}

function isPhysicalResource(
  entity: ResourceEntity | ResourceSpecification | null,
): entity is PhysicalResource {
  return Boolean(entity && entity['@type'] === 'PhysicalResource');
}

function isLogicalResource(
  entity: ResourceEntity | ResourceSpecification | null,
): entity is LogicalResource {
  return Boolean(entity && entity['@type'] === 'LogicalResource');
}

function physicalDetails(resource: PhysicalResource): string {
  return (
    [resource.serialNumber, resource.partNumber].filter(Boolean)
      .join(' · ') || '-'
  );
}

function logicalDetails(resource: LogicalResource): string {
  return resource.supportingPhysicalResourceId ?? '-';
}
