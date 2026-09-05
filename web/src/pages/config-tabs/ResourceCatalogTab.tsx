import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  createResourceSpecification,
  deleteResourceSpecification,
  listResourceLayers,
  loadResourceWorkspaceSnapshot,
  updateResourceSpecification,
  type ResourceCategory,
  type ResourceLayer,
  type ResourceSpecification,
  type ResourceType,
} from '../../services/resourceApi';
import type { Party } from '../../services/partyApi';
import ResourceSpecificationFields from '../../components/ResourceSpecificationFields';
import CivilResourceSpecificationFields from '../../components/CivilResourceSpecificationFields';
import ResourceSpecificationBulkImportModal from '../../components/ResourceSpecificationBulkImportModal';
import {
  civilResourceSpecRequiredFieldsValid,
  emptyResourceSpecFormState,
  isCivilInfrastructureCategory,
  readResourceTypeCode,
  readSpecificationManufacturer,
  readSpecificationModel,
  readSpecLifecycleStatus,
  resourceSpecFormStateFrom,
  resourceSpecRequiredFieldsValid,
  resourceSpecSelectionValid,
  resourceTypeOptionLabel,
  buildResourceSpecificationPayload,
  type ResourceSpecFormState,
} from '../../utils/resourceSpecificationForm';
import PageHead from '../../components/ui/PageHead';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { DataTablePagination } from '../../components/ui/DataTable';
import { SortableHeader, sortedBy, useSort } from './sortable';

export type ResourceInfraTab = 'network' | 'civil';

const RESOURCE_INFRA_TAB_COPY: Record<ResourceInfraTab, { title: string; description: string }> = {
  network: {
    title: 'Catálogo de Recursos de Rede',
    description:
      'Especificações (ResourceSpecification) que tipam equipamentos, passivos ópticos, cabos e recursos lógicos do inventário.',
  },
  civil: {
    title: 'Catálogo de Infraestrutura Civil',
    description:
      'Especificações (ResourceSpecification) de obra civil — dutos, postes e caixas de passagem — sem tipo de rede próprio.',
  },
};

function ModalTitle({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow?: string;
  title: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {eyebrow}
          </div>
        ) : null}
        <div className="mt-0.5 font-display text-[1.35rem] font-semibold text-app-text">{title}</div>
      </div>
      <button
        type="button"
        className="rounded-full p-2 text-app-muted transition hover:bg-app-accent-soft"
        onClick={onClose}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Catálogo de Recursos (ResourceSpecification) em Configurações — mesma implementação de campos e
 * payload usada pelo modal embutido em ResourcePage (ver ResourceSpecificationFields e
 * utils/resourceSpecificationForm.ts), mas com uma categoria selecionável no formulário, já que
 * aqui não há categoria de página ativa. Disparar o evento `nexus:resource-catalog-updated` mantém
 * ResourcePage sincronizada sem exigir F5 (ver ResourcePage.tsx). `infraTab` é fixo por chamador —
 * Configurações tem uma aba própria para cada lado (Infraestrutura Civil × Recursos de Rede), então
 * a troca acontece navegando entre abas do menu, não com um seletor interno.
 */
export function ResourceCatalogTab({ infraTab }: { infraTab: ResourceInfraTab }) {
  const [specs, setSpecs] = useState<ResourceSpecification[]>([]);
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [resourceLayers, setResourceLayers] = useState<ResourceLayer[]>([]);
  const [manufacturerOptions, setManufacturerOptions] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [resourceLayerFilter, setResourceLayerFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<ResourceSpecification | null>(null);
  const [saving, setSaving] = useState(false);

  type ModalState = { mode: 'create' | 'edit'; entity: ResourceSpecification | null };
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formState, setFormState] = useState<ResourceSpecFormState>(emptyResourceSpecFormState());
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    void Promise.all([
      loadResourceWorkspaceSnapshot({ tab: 'ResourceSpecification', limit: 500, offset: 0 }),
      listResourceLayers(),
    ])
      .then(([snapshot, layers]) => {
        setSpecs(snapshot.items as ResourceSpecification[]);
        setResourceCategories(snapshot.resourceCategories);
        setResourceTypes(snapshot.resourceTypes);
        setResourceLayers(layers);
        setManufacturerOptions(snapshot.manufacturerOptions);
      })
      .catch(() => setError('Não foi possível carregar o catálogo de Recursos.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  // Categoria vem da API como código canônico (ex.: "Infrastructure.Passive") — o rótulo
  // pt-BR já existe em ResourceCategory.name (ver src/modules/resource/catalog.ts), então a
  // tabela nunca deveria exibir o código cru.
  const categoryLabel = (categoryCode: string): string =>
    resourceCategories.find((item) => item.code === categoryCode)?.name ?? categoryCode;

  const specsOfTab = useMemo(
    () =>
      specs.filter((spec) =>
        infraTab === 'civil'
          ? isCivilInfrastructureCategory(spec.category)
          : !isCivilInfrastructureCategory(spec.category),
      ),
    [specs, infraTab],
  );

  const resourceLayerName = (resourceLayerId: string | undefined): string =>
    resourceLayers.find((layer) => layer.id === resourceLayerId)?.name ?? '-';

  const filteredSpecs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return specsOfTab.filter((spec) => {
      if (term && !readSpecificationModel(spec).toLowerCase().includes(term)) return false;
      if (resourceLayerFilter && spec.resourceLayerId !== resourceLayerFilter) return false;
      if (categoryFilter && spec.category !== categoryFilter) return false;
      if (resourceTypeFilter && spec.resourceType !== resourceTypeFilter) return false;
      return true;
    });
  }, [specsOfTab, search, resourceLayerFilter, categoryFilter, resourceTypeFilter]);

  const [sort, onSort] = useSort<
    'name' | 'category' | 'resourceType' | 'resourceLayer' | 'manufacturer' | 'lifecycleStatus'
  >();
  const sortedSpecs = useMemo(
    () =>
      sortedBy(filteredSpecs, sort, (spec, key) => {
        switch (key) {
          case 'name':
            return readSpecificationModel(spec);
          case 'category':
            return categoryLabel(spec.category);
          case 'resourceType':
            return readResourceTypeCode(resourceTypes, spec.resourceType);
          case 'resourceLayer':
            return resourceLayerName(spec.resourceLayerId);
          case 'manufacturer':
            return readSpecificationManufacturer(spec);
          case 'lifecycleStatus':
            return readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic);
          default:
            return '';
        }
      }),
    [filteredSpecs, sort, resourceTypes, resourceCategories, resourceLayers],
  );

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [search, resourceLayerFilter, categoryFilter, resourceTypeFilter, infraTab, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedSpecs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedSpecs = useMemo(
    () => sortedSpecs.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [sortedSpecs, currentPage],
  );

  const categoryOptionsForTab = useMemo(
    () =>
      resourceCategories.filter((category) =>
        infraTab === 'civil'
          ? isCivilInfrastructureCategory(category.code)
          : !isCivilInfrastructureCategory(category.code),
      ),
    [resourceCategories, infraTab],
  );

  const categoryCodesForTab = useMemo(
    () => new Set(categoryOptionsForTab.map((category) => category.code)),
    [categoryOptionsForTab],
  );
  // Restrita à Categoria selecionada no filtro (nunca a infraestrutura civil, já fora de
  // categoryCodesForTab nesta aba); sem categoria escolhida, mostra os tipos de todas as
  // categorias da aba.
  const resourceTypeOptionsForTab = useMemo(
    () =>
      resourceTypes.filter((type) =>
        categoryFilter ? type.categoryCode === categoryFilter : categoryCodesForTab.has(type.categoryCode),
      ),
    [resourceTypes, categoryCodesForTab, categoryFilter],
  );

  const notifyUpdated = () => {
    window.dispatchEvent(new CustomEvent('nexus:resource-catalog-updated'));
  };

  const openCreateModal = () => {
    // A aba ativa já escopa a categoria (Civil × Rede) — pré-seleciona a única opção quando ela é
    // óbvia (aba Civil tem uma categoria só hoje); na aba Rede o usuário escolhe entre as várias.
    const defaultCategory = categoryOptionsForTab.length === 1 ? categoryOptionsForTab[0].code : '';
    setFormState({ ...emptyResourceSpecFormState(), category: defaultCategory });
    setModalState({ mode: 'create', entity: null });
  };

  const openEditModal = (spec: ResourceSpecification) => {
    setFormState(resourceSpecFormStateFrom(spec, spec.category, manufacturerOptions));
    setModalState({ mode: 'edit', entity: spec });
  };

  const closeModal = () => {
    if (saving) return;
    setModalState(null);
  };

  useEffect(() => {
    if (!modalState) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalState, saving]);

  const requiredFieldsValid =
    infraTab === 'civil'
      ? civilResourceSpecRequiredFieldsValid(formState)
      : resourceSpecRequiredFieldsValid(formState);
  const selectionValid = resourceSpecSelectionValid(
    formState,
    resourceTypes,
    (categoryCode) =>
      resourceCategories.find((item) => item.code === categoryCode)?.status === 'active',
  );
  const submitValid = requiredFieldsValid && selectionValid;

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!submitValid) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildResourceSpecificationPayload(
        formState,
        modalState?.entity,
        manufacturerOptions,
      );
      if (modalState?.mode === 'create') {
        await createResourceSpecification(payload);
      } else if (modalState?.entity) {
        await updateResourceSpecification(modalState.entity.id, payload);
      }
      setModalState(null);
      reload();
      notifyUpdated();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível salvar a especificação.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeSpec = async () => {
    if (!pendingRemoval) return;
    setSaving(true);
    setError(null);
    try {
      await deleteResourceSpecification(pendingRemoval.id);
      setPendingRemoval(null);
      reload();
      notifyUpdated();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível remover a especificação.',
      );
    } finally {
      setSaving(false);
    }
  };

  const isNetworkTab = infraTab === 'network';
  const columnCount = isNetworkTab ? 7 : 5;
  const copy = RESOURCE_INFRA_TAB_COPY[infraTab];

  return (
    <>
      <PageHead
        title={copy.title}
        subtitle={copy.description}
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {isNetworkTab ? (
              <Button
                variant="secondary"
                onClick={() => setBulkImportOpen(true)}
                iconLeft={<Upload className="h-4 w-4" />}
              >
                Carga em massa
              </Button>
            ) : null}
            <Button onClick={openCreateModal} iconLeft={<Plus className="h-4 w-4" />}>
              Adicionar
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isNetworkTab ? (
          <>
            <select
              value={resourceLayerFilter}
              onChange={(event) => setResourceLayerFilter(event.target.value)}
              className="geo-input w-auto"
            >
              <option value="">Camada: todas</option>
              {resourceLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                  {layer.status !== 'active' ? ' (inativa)' : ''}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setResourceTypeFilter('');
              }}
              className="geo-input w-auto"
            >
              <option value="">Categoria: todas</option>
              {categoryOptionsForTab.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            <select
              value={resourceTypeFilter}
              onChange={(event) => setResourceTypeFilter(event.target.value)}
              className="geo-input w-auto"
            >
              <option value="">Tipo: todos</option>
              {resourceTypeOptionsForTab.map((option) => (
                <option key={option.code} value={option.code}>
                  {resourceTypeOptionLabel(option)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome…"
            className="geo-input max-w-sm"
          />
        )}
      </div>

      <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="vt-table" style={{ minWidth: 750 }}>
          <thead>
            <tr>
              <SortableHeader label="Especificação" sortKey="name" sort={sort} onSort={onSort} />
              {isNetworkTab ? (
                <SortableHeader
                  label="Camada de recurso"
                  sortKey="resourceLayer"
                  sort={sort}
                  onSort={onSort}
                />
              ) : null}
              {isNetworkTab ? (
                <SortableHeader label="Categoria" sortKey="category" sort={sort} onSort={onSort} />
              ) : null}
              <SortableHeader label="Tipo" sortKey="resourceType" sort={sort} onSort={onSort} />
              <SortableHeader
                label="Fabricante"
                sortKey="manufacturer"
                sort={sort}
                onSort={onSort}
              />
              <SortableHeader
                label="Ciclo de vida"
                sortKey="lifecycleStatus"
                sort={sort}
                onSort={onSort}
              />
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount}>Carregando…</td>
              </tr>
            ) : sortedSpecs.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>Nenhuma especificação cadastrada.</td>
              </tr>
            ) : (
              pagedSpecs.map((spec) => (
                <tr key={spec.id}>
                  <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {readSpecificationModel(spec)}
                  </td>
                  {isNetworkTab ? (
                    <td>{resourceLayerName(spec.resourceLayerId)}</td>
                  ) : null}
                  {isNetworkTab ? <td>{categoryLabel(spec.category)}</td> : null}
                  <td>{readResourceTypeCode(resourceTypes, spec.resourceType)}</td>
                  <td>{readSpecificationManufacturer(spec)}</td>
                  <td>{readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(spec)}
                        className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                        aria-label={`Editar ${readSpecificationModel(spec)}`}
                        disabled={saving}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {pendingRemoval?.id === spec.id ? (
                        <button
                          type="button"
                          onClick={() => void removeSpec()}
                          className="rounded-xl border border-status-red/30 bg-status-red-soft px-2 py-1 text-[0.75rem] font-semibold text-status-red"
                          disabled={saving}
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingRemoval(spec);
                            setError(null);
                          }}
                          className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                          aria-label={`Remover ${readSpecificationModel(spec)}`}
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && sortedSpecs.length > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <DataTablePagination
              count={Math.min((currentPage + 1) * PAGE_SIZE, sortedSpecs.length)}
              total={sortedSpecs.length}
              label="especificações"
              hasPrevious={currentPage > 0}
              hasNext={currentPage < pageCount - 1}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            />
          </div>
        ) : null}
      </div>

      {modalState ? (
        <Modal
          title={
            <ModalTitle
              eyebrow={
                infraTab === 'civil'
                  ? 'Catálogo de Infraestrutura Civil'
                  : 'Catálogo de Recursos'
              }
              title={`${modalState.mode === 'create' ? 'Criar' : 'Editar'} ${
                infraTab === 'civil' ? 'Recurso de Infra Civil' : 'Especificação de Recurso'
              }`}
              onClose={closeModal}
            />
          }
          onClose={closeModal}
          width={infraTab === 'civil' ? 620 : 880}
          footer={
            <>
              <Button variant="secondary" type="button" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button
                type="submit"
                form="resource-spec-form"
                disabled={saving || !submitValid}
              >
                {saving ? 'Salvando...' : modalState.mode === 'create' ? 'Criar' : 'Salvar'}
              </Button>
            </>
          }
        >
          <form id="resource-spec-form" onSubmit={submitModal} className="grid gap-4">
            {infraTab === 'civil' ? (
              <CivilResourceSpecificationFields
                formState={formState}
                onChange={setFormState}
                resourceTypes={resourceTypes}
                manufacturerOptions={manufacturerOptions}
                selectionValid={selectionValid}
              />
            ) : (
              <ResourceSpecificationFields
                formState={formState}
                onChange={setFormState}
                resourceTypes={resourceTypes}
                manufacturerOptions={manufacturerOptions}
                resourceLayers={resourceLayers}
                categoryOptions={categoryOptionsForTab}
                selectionValid={selectionValid}
              />
            )}
          </form>
        </Modal>
      ) : null}

      {bulkImportOpen ? (
        <ResourceSpecificationBulkImportModal
          categories={categoryOptionsForTab}
          resourceTypes={resourceTypes}
          resourceLayers={resourceLayers}
          manufacturerOptions={manufacturerOptions}
          existingSpecs={specsOfTab}
          onClose={() => setBulkImportOpen(false)}
          onImported={() => {
            reload();
            notifyUpdated();
          }}
        />
      ) : null}

      {loading ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.88rem] font-medium text-app-muted shadow-soft backdrop-blur">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Carregando dados...
        </div>
      ) : null}
    </>
  );
}
