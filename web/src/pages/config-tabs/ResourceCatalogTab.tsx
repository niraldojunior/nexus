import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  createResourceSpecification,
  deleteResourceSpecification,
  loadResourceWorkspaceSnapshot,
  updateResourceSpecification,
  type ResourceCategory,
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
  buildResourceSpecificationPayload,
  type ResourceSpecFormState,
} from '../../utils/resourceSpecificationForm';
import { readResourceSpecificationNetworkTypeLabel } from '../../utils/resourceSpecificationCharacteristics';
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
  const [manufacturerOptions, setManufacturerOptions] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<ResourceSpecification | null>(null);
  const [saving, setSaving] = useState(false);

  type ModalState = { mode: 'create' | 'edit'; entity: ResourceSpecification | null };
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formState, setFormState] = useState<ResourceSpecFormState>(emptyResourceSpecFormState());
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    void loadResourceWorkspaceSnapshot({ tab: 'ResourceSpecification', limit: 500, offset: 0 })
      .then((snapshot) => {
        setSpecs(snapshot.items as ResourceSpecification[]);
        setResourceCategories(snapshot.resourceCategories);
        setResourceTypes(snapshot.resourceTypes);
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

  const filteredSpecs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return specsOfTab;
    return specsOfTab.filter((spec) => readSpecificationModel(spec).toLowerCase().includes(term));
  }, [specsOfTab, search]);

  const [sort, onSort] = useSort<
    'name' | 'category' | 'resourceType' | 'networkType' | 'manufacturer' | 'lifecycleStatus'
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
          case 'networkType':
            return readResourceSpecificationNetworkTypeLabel(
              spec.resourceSpecificationCharacteristic?.find((item) => item.name === 'networkType')
                ?.value as string | undefined,
            );
          case 'manufacturer':
            return readSpecificationManufacturer(spec);
          case 'lifecycleStatus':
            return readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic);
          default:
            return '';
        }
      }),
    [filteredSpecs, sort, resourceTypes, resourceCategories],
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
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.5rem] font-semibold text-app-text">{copy.title}</h1>
          <p className="mt-1 text-[0.88rem] text-app-muted">{copy.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isNetworkTab ? (
            <button
              type="button"
              onClick={() => setBulkImportOpen(true)}
              className="geo-btn secondary"
            >
              <Upload className="h-4 w-4" />
              Carga em massa
            </button>
          ) : null}
          <button type="button" onClick={openCreateModal} className="geo-btn primary">
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome…"
        className="geo-input mb-3 max-w-sm"
      />

      <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
        <table className="w-full min-w-[750px] text-left">
          <thead>
            <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
              <SortableHeader label="Especificação" sortKey="name" sort={sort} onSort={onSort} />
              {isNetworkTab ? (
                <SortableHeader label="Categoria" sortKey="category" sort={sort} onSort={onSort} />
              ) : null}
              <SortableHeader label="Tipo" sortKey="resourceType" sort={sort} onSort={onSort} />
              {isNetworkTab ? (
                <SortableHeader
                  label="Tipo de Rede"
                  sortKey="networkType"
                  sort={sort}
                  onSort={onSort}
                />
              ) : null}
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
                <td colSpan={columnCount} className="px-5 py-4 text-[0.88rem] text-app-muted">
                  Carregando…
                </td>
              </tr>
            ) : sortedSpecs.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-5 py-4 text-[0.88rem] text-app-muted">
                  Nenhuma especificação cadastrada.
                </td>
              </tr>
            ) : (
              sortedSpecs.map((spec) => (
                <tr
                  key={spec.id}
                  className="border-b border-app-border text-[0.88rem] text-app-text last:border-0"
                >
                  <td className="px-5 py-3 font-medium">{readSpecificationModel(spec)}</td>
                  {isNetworkTab ? (
                    <td className="px-5 py-3 text-app-muted">{categoryLabel(spec.category)}</td>
                  ) : null}
                  <td className="px-5 py-3 text-app-muted">
                    {readResourceTypeCode(resourceTypes, spec.resourceType)}
                  </td>
                  {isNetworkTab ? (
                    <td className="px-5 py-3 text-app-muted">
                      {readResourceSpecificationNetworkTypeLabel(
                        spec.resourceSpecificationCharacteristic?.find(
                          (item) => item.name === 'networkType',
                        )?.value as string | undefined,
                      )}
                    </td>
                  ) : null}
                  <td className="px-5 py-3 text-app-muted">
                    {readSpecificationManufacturer(spec)}
                  </td>
                  <td className="px-5 py-3 text-app-muted">
                    {readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic)}
                  </td>
                  <td className="flex justify-end gap-1 px-5 py-3">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalState
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="resource-catalog-modal-title"
                className={`max-h-[92vh] w-full overflow-auto rounded-[28px] border border-app-border bg-white p-6 shadow-modal ${
                  infraTab === 'civil' ? 'max-w-[620px]' : 'max-w-[880px]'
                }`}
              >
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
                  <div>
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                      {infraTab === 'civil'
                        ? 'Catálogo de Infraestrutura Civil'
                        : 'Catálogo de Recursos'}
                    </div>
                    <h2
                      id="resource-catalog-modal-title"
                      className="mt-1 font-display text-[1.45rem] font-semibold text-app-text"
                    >
                      {modalState.mode === 'create' ? 'Criar' : 'Editar'}{' '}
                      {infraTab === 'civil' ? 'Recurso de Infra Civil' : 'Especificação de Recurso'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
                    onClick={closeModal}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={submitModal} className="grid gap-4">
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
                      categoryOptions={categoryOptionsForTab}
                      selectionValid={selectionValid}
                    />
                  )}

                  <div className="mt-2 flex justify-end gap-3 border-t border-app-border pt-4">
                    <button type="button" onClick={closeModal} className="geo-btn secondary">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !submitValid}
                      className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? 'Salvando...' : modalState.mode === 'create' ? 'Criar' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {bulkImportOpen ? (
        <ResourceSpecificationBulkImportModal
          categories={categoryOptionsForTab}
          resourceTypes={resourceTypes}
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
