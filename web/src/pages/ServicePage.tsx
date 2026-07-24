import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Briefcase,
  FileText,
  Filter,
  Loader2,
  Network,
  Plus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createService,
  createServiceSpecification,
  loadServiceWorkspaceSnapshot,
  terminateService,
  updateService,
  updateServiceSpecification,
  type CustomerFacingService,
  type CustomerFacingServicePayload,
  type ResourceFacingService,
  type ResourceFacingServicePayload,
  type ServiceCategory,
  type ServiceEntity,
  type ServiceSpecification,
  type ServiceSpecificationPayload,
  type ServiceSpecificationType,
  type ServiceState,
  type ServiceTab,
} from '../services/serviceApi';
import { listResources, type ResourceEntity } from '../services/resourceApi';
import ColumnFilterMenu from '../components/ColumnFilterMenu';
import Field from '../components/Field';
import { useGeoDirectory } from '../hooks/useGeoDirectory';
import { useNavigation } from '../hooks/useNavigation';
import { PlaceLabelCompact } from '../components/PlaceLabel';
import { PlacePicker } from '../components/PlacePicker';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import {
  DEFAULT_SERVICE_CATEGORY_CODE,
  SERVICE_STATE_LABELS,
  SERVICE_STATE_ORDER,
  SERVICE_VIEWS,
  serviceCategoryCode,
  type ServiceView,
} from '../data/serviceCategoryViews';

const PAGE_SIZE = 20;

type ServiceTabId = ServiceTab;
type ServiceMode = 'create' | 'edit';

type ModalState = {
  tab: ServiceTabId;
  mode: ServiceMode;
  entity: ServiceEntity | ServiceSpecification | null;
};

type ServiceFormState = {
  name: string;
  description: string;
  category: string;
  serviceSpecificationId: string;
  /** Só no Catálogo: tipa a spec como CFS ou RFS. */
  serviceType: ServiceSpecificationType | '';
  state: ServiceState;
  subscriberId: string;
  subscriberPartyId: string;
  supportingServiceIds: string[];
  supportingResourceIds: string[];
  placeId: string;
  placeType: string;
};

const emptyFormState = (): ServiceFormState => ({
  name: '',
  description: '',
  category: '',
  serviceSpecificationId: '',
  serviceType: '',
  state: 'designed',
  subscriberId: '',
  subscriberPartyId: '',
  supportingServiceIds: [],
  supportingResourceIds: [],
  placeId: '',
  placeType: 'GeographicAddress',
});


const tabConfig: Record<
  ServiceTabId,
  {
    description: string;
    icon: LucideIcon;
    buildColumns: () => Array<{ key: string; label: string }>;
  }
> = {
  CustomerFacingService: {
    description:
      'Serviços instanciados na categoria: o que o cliente contrata (CFS) e o que a rede entrega (RFS).',
    icon: Briefcase,
    buildColumns: () => [
      { key: 'name', label: 'Serviço' },
      { key: 'kind', label: 'Camada' },
      { key: 'spec', label: 'Especificação' },
      { key: 'state', label: 'Estado' },
      { key: 'binding', label: 'Assinante / Recursos' },
      { key: 'place', label: 'Local' },
    ],
  },
  ResourceFacingService: {
    description:
      'Serviços instanciados na categoria: o que o cliente contrata (CFS) e o que a rede entrega (RFS).',
    icon: Network,
    buildColumns: () => [
      { key: 'name', label: 'Serviço' },
      { key: 'kind', label: 'Camada' },
      { key: 'spec', label: 'Especificação' },
      { key: 'state', label: 'Estado' },
      { key: 'binding', label: 'Assinante / Recursos' },
      { key: 'place', label: 'Local' },
    ],
  },
  ServiceSpecification: {
    description: 'Catálogo de especificações que tipam os serviços de cliente (CFS) e de rede (RFS).',
    icon: FileText,
    buildColumns: () => [
      { key: 'name', label: 'Especificação' },
      { key: 'serviceType', label: 'Camada' },
      { key: 'description', label: 'Descrição' },
      { key: 'characteristics', label: 'Características' },
    ],
  },
};

// Colunas cujo domínio é um conjunto fechado de valores de sistema — ganham picklist no cabeçalho.
const FILTERABLE_COLUMNS: Record<ServiceTabId, string[]> = {
  CustomerFacingService: ['kind', 'spec', 'state'],
  ResourceFacingService: ['kind', 'spec', 'state'],
  ServiceSpecification: ['serviceType'],
};

type OpenFilterState = { key: string; rect: DOMRect };

interface ServicePageProps {
  category?: string;
}

export default function ServicePage({ category: categoryProp }: ServicePageProps = {}) {
  const category = categoryProp ?? DEFAULT_SERVICE_CATEGORY_CODE;
  const [view, setView] = useState<ServiceView>('inventory');
  // O Inventário mostra CFS e RFS juntos; a tab só distingue catálogo de inventário — o servidor
  // sempre devolve CFS+RFS da categoria ativa juntos (ver buildServiceWorkspaceSnapshot).
  const effectiveTab: ServiceTabId = view === 'catalog' ? 'ServiceSpecification' : 'CustomerFacingService';

  const [page, setPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<OpenFilterState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(SERVICE_CATEGORY_DEFAULTS);
  const [specificationOptions, setSpecificationOptions] = useState<ServiceSpecification[]>([]);
  const [customerFacingServices, setCustomerFacingServices] = useState<CustomerFacingService[]>([]);
  const [resourceFacingServices, setResourceFacingServices] = useState<ResourceFacingService[]>([]);
  // Amostra limitada para o combobox de "recurso de suporte" do modal de RFS — buscada sob demanda
  // na abertura do modal, nunca a partir do inventário completo de recursos.
  const [supportingResourceChoices, setSupportingResourceChoices] = useState<ResourceEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [terminateConfirmOpen, setTerminateConfirmOpen] = useState(false);
  const [formState, setFormState] = useState<ServiceFormState>(emptyFormState());
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Carregar diretório Geo para resolução de rótulos de locais
  const { directory: geoDirectory } = useGeoDirectory();
  const { goToGeo } = useNavigation();

  const activeTabConfig = tabConfig[effectiveTab];
  const activeColumns = activeTabConfig.buildColumns();
  const categoryName = serviceCategories.find((item) => item.code === category)?.name ?? category;
  const CategoryIcon = activeTabConfig.icon;

  const specificationsById = useMemo(() => {
    const map = new Map<string, ServiceSpecification>();
    for (const spec of specificationOptions) map.set(spec.id, spec);
    return map;
  }, [specificationOptions]);

  const resourcesById = useMemo(() => {
    const map = new Map<string, ResourceEntity>();
    for (const resource of supportingResourceChoices) map.set(resource.id, resource);
    return map;
  }, [supportingResourceChoices]);

  const servicesById = useMemo(() => {
    const map = new Map<string, ServiceEntity>();
    for (const service of [...customerFacingServices, ...resourceFacingServices]) map.set(service.id, service);
    return map;
  }, [customerFacingServices, resourceFacingServices]);

  /** RFS elegíveis como `supportingService` de um CFS — encerrados não entram. */
  const supportingServiceOptions = useMemo(
    () => resourceFacingServices.filter((service) => service.state !== 'terminated'),
    [resourceFacingServices],
  );

  // O servidor já escopa CFS/RFS pela categoria ativa (buildServiceWorkspaceSnapshot); este filtro
  // client-side é só uma segunda passada barata (cobre o fallback categoria-via-spec) sobre um
  // conjunto que já chegou pequeno — a paginação em si continua no cliente.
  const categoryItems = useMemo<Array<ServiceEntity | ServiceSpecification>>(() => {
    if (view === 'catalog') {
      return specificationOptions.filter((spec) => spec.category === category);
    }
    return [...customerFacingServices, ...resourceFacingServices].filter(
      (service) => serviceCategoryCode(service, specificationsById) === category,
    );
  }, [view, category, specificationOptions, customerFacingServices, resourceFacingServices, specificationsById]);

  // Valor exibido de uma coluna — usado para montar o domínio do filtro e para aplicá-lo, garantindo
  // que o filtro casa exatamente com o texto renderizado na célula.
  const filterableColumns = FILTERABLE_COLUMNS[effectiveTab];
  const columnValueFor = (item: ServiceEntity | ServiceSpecification, key: string): string => {
    if (view === 'catalog') {
      const spec = item as ServiceSpecification;
      switch (key) {
        case 'serviceType':
          return spec.serviceType;
        default:
          return '-';
      }
    }
    const service = item as ServiceEntity;
    switch (key) {
      case 'kind':
        return serviceKindLabel(service);
      case 'spec':
        return specificationsById.get(service.serviceSpecificationId)?.name ?? '-';
      case 'state':
        return SERVICE_STATE_LABELS[service.state] ?? service.state;
      default:
        return '-';
    }
  };

  const columnDomain = (key: string): string[] => {
    const values = new Set<string>();
    for (const item of categoryItems) values.add(columnValueFor(item, key));
    return [...values].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  };

  const filteredItems = useMemo(() => {
    const entries = Object.entries(columnFilters).filter(([, values]) => values.size > 0);
    if (!entries.length) return categoryItems;
    return categoryItems.filter((item) => entries.every(([key, values]) => values.has(columnValueFor(item, key))));
    // columnValueFor deriva de view + catálogos, cobertos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryItems, columnFilters, view, specificationsById]);

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

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const activePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = filteredItems.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const hasMore = activePage < totalPages;

  const selectedOnPage = pageItems.filter((item) => selectedIds.has(item.id));
  const pageSelectionCount = selectedOnPage.length;
  const selectedCount = selectedIds.size;
  const selectedTerminatePreview = selectedOnPage.slice(0, 3).map((item) => item.name).join(', ');

  const loadWorkspaceData = async (tab: ServiceTabId): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // A categoria é escopada no servidor (evita o full-scan global do inventário); a
      // paginação/filtro de coluna continua no cliente sobre esse conjunto já bem menor.
      const snapshot = await loadServiceWorkspaceSnapshot({ tab, ...(tab !== 'ServiceSpecification' ? { category } : {}) });
      setSpecificationOptions(snapshot.serviceSpecificationOptions);
      // O backend não modela `code` em ServiceCategory; a árvore canônica do frontend é a referência
      // de navegação. Só usamos as categorias do servidor se elas trouxerem o código.
      const named = snapshot.serviceCategories.filter((item) => Boolean(item.code));
      setServiceCategories(named.length ? named : SERVICE_CATEGORY_DEFAULTS);
      setCustomerFacingServices(snapshot.customerFacingServices);
      setResourceFacingServices(snapshot.resourceFacingServices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Service.');
    } finally {
      setIsLoading(false);
    }
  };

  // Refaz o fetch quando a aba OU a categoria mudam — antes só a aba disparava, porque o inventário
  // inteiro (todas as categorias) já tinha chegado de uma vez.
  useEffect(() => {
    void loadWorkspaceData(effectiveTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab, category]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = pageSelectionCount > 0 && pageSelectionCount < pageItems.length;
  }, [pageItems.length, pageSelectionCount]);

  // Trocar de categoria ou de sub-visão reinicia paginação, seleção e filtros.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setTerminateConfirmOpen(false);
    setColumnFilters({});
    setOpenFilter(null);
  }, [category, view]);

  useEffect(() => {
    setPage(1);
  }, [columnFilters]);

  useEffect(() => {
    if (!modalState) {
      setFormState(emptyFormState());
      return;
    }

    if (modalState.tab === 'ServiceSpecification') {
      const entity = modalState.entity as ServiceSpecification | null;
      setFormState({
        ...emptyFormState(),
        name: entity?.name ?? '',
        // A categoria é fixada pela página ativa; specs novas a herdam, edições mantêm a sua.
        category: entity?.category ?? category,
        serviceType: entity?.serviceType ?? 'CFS',
        description: entity?.description ?? '',
      });
      return;
    }

    const entity = modalState.entity as ServiceEntity | null;
    const isCfs = modalState.tab === 'CustomerFacingService';
    setFormState({
      ...emptyFormState(),
      name: entity?.name ?? '',
      category,
      serviceSpecificationId: entity?.serviceSpecificationId ?? '',
      state: entity?.state ?? 'designed',
      subscriberId: isCfs ? (entity as CustomerFacingService | null)?.subscriberId ?? '' : '',
      supportingServiceIds: isCfs
        ? ((entity as CustomerFacingService | null)?.supportingService ?? []).map((ref) => ref.id)
        : [],
      supportingResourceIds: !isCfs
        ? ((entity as ResourceFacingService | null)?.supportingResource ?? []).map((ref) => ref.id)
        : [],
      placeId: entity?.place?.[0]?.id ?? '',
      placeType: entity?.place?.[0]?.['@referredType'] ?? 'GeographicAddress',
    });
  }, [modalState, category]);

  // Busca sob demanda uma amostra de recursos para o combobox de "recurso de suporte" do modal de
  // RFS — nunca o inventário completo de recursos, que pode ter dezenas de milhares de itens.
  useEffect(() => {
    if (!modalState || modalState.tab !== 'ResourceFacingService') return;
    let cancelled = false;
    void (async () => {
      try {
        const [physical, logical] = await Promise.all([
          listResources({ kind: 'PhysicalResource', limit: 100, offset: 0, status: 'active' }),
          listResources({ kind: 'LogicalResource', limit: 100, offset: 0, status: 'active' }),
        ]);
        if (!cancelled) setSupportingResourceChoices([...physical, ...logical]);
      } catch {
        // Best-effort: o campo já tolera um id selecionado sem opção correspondente na lista.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalState]);

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

  const openCreateModal = (tab: ServiceTabId) => {
    setModalState({ tab, mode: 'create', entity: null });
  };

  const openEditModal = (entity: ServiceEntity | ServiceSpecification) => {
    const tab: ServiceTabId =
      view === 'catalog' ? 'ServiceSpecification' : ((entity as ServiceEntity)['@type'] as ServiceTabId);
    setModalState({ tab, mode: 'edit', entity });
  };

  const closeModal = () => {
    setModalState(null);
    setSaving(false);
  };

  const openTerminateConfirmation = () => {
    if (!selectedCount) return;
    setTerminateConfirmOpen(true);
  };

  const closeTerminateConfirmation = () => {
    if (terminating) return;
    setTerminateConfirmOpen(false);
  };

  const refreshWorkspace = async () => {
    await loadWorkspaceData(effectiveTab);
  };

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (modalState?.tab === 'ServiceSpecification') {
        const payload = buildSpecificationPayload(formState);
        if (modalState.mode === 'create') await createServiceSpecification(payload);
        else if (modalState.entity) await updateServiceSpecification(modalState.entity.id, payload);
      } else if (modalState?.tab === 'CustomerFacingService') {
        const payload = buildCfsPayload(formState);
        if (modalState.mode === 'create') await createService(payload);
        else if (modalState.entity) await updateService(modalState.entity.id, payload);
      } else if (modalState?.tab === 'ResourceFacingService') {
        const payload = buildRfsPayload(formState, resourcesById);
        if (modalState.mode === 'create') await createService(payload);
        else if (modalState.entity) await updateService(modalState.entity.id, payload);
      }
      closeModal();
      setSelectedIds(new Set());
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar Service.');
    } finally {
      setSaving(false);
    }
  };

  const confirmTerminateSelected = async () => {
    if (!selectedCount) return;
    setTerminating(true);
    setError(null);
    try {
      for (const id of [...selectedIds]) {
        await terminateService(id);
      }
      setSelectedIds(new Set());
      setTerminateConfirmOpen(false);
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao encerrar Service.');
    } finally {
      setTerminating(false);
    }
  };

  const rows =
    view === 'catalog'
      ? (pageItems as ServiceSpecification[]).map((spec) => (
          <tr
            key={spec.id}
            className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-accent-soft"
            onClick={() => openEditModal(spec)}
          >
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${spec.name}`}
                checked={selectedIds.has(spec.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleSelected(spec.id)}
              />
            </td>
            <td className="px-4 py-3 text-[0.92rem] font-semibold text-app-text">{spec.name}</td>
            <td className="px-4 py-3">
              <LayerBadge label={spec.serviceType} />
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{spec.description || '-'}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {spec.serviceSpecificationCharacteristic?.length ?? 0}
            </td>
          </tr>
        ))
      : (pageItems as ServiceEntity[]).map((service) => (
          <tr
            key={service.id}
            className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-accent-soft"
            onClick={() => openEditModal(service)}
          >
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${service.name}`}
                checked={selectedIds.has(service.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleSelected(service.id)}
              />
            </td>
            <td className="px-4 py-3 text-[0.92rem] font-semibold text-app-text">{service.name}</td>
            <td className="px-4 py-3">
              <LayerBadge label={serviceKindLabel(service)} />
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {specificationsById.get(service.serviceSpecificationId)?.name ?? '-'}
            </td>
            <td className="px-4 py-3">
              <StateBadge state={service.state} />
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{serviceBindingSummary(service)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              <div className="flex items-center gap-2">
                <PlaceLabelCompact place={service.place?.[0]} directory={geoDirectory} />
                {service.place?.[0]?.id && (
                  <button
                    type="button"
                    onClick={() => goToGeo(service.place![0].id)}
                    className="text-[0.75rem] font-semibold text-app-accent hover:text-app-accent-border transition"
                    title="Ver no mapa de locais"
                  >
                    📍
                  </button>
                )}
              </div>
            </td>
          </tr>
        ));

  return (
    <div className="h-full min-h-0 overflow-hidden px-8 py-8">
      <div className="mx-auto flex h-full max-w-[1460px] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <CategoryIcon className="h-7 w-7 shrink-0 text-app-muted" strokeWidth={2} />
              <h1 className="font-display text-4xl font-semibold text-app-text">{categoryName}</h1>
            </div>
            <p className="mt-2 max-w-[820px] text-[0.96rem] text-app-muted">{activeTabConfig.description}</p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2">
            <div
              role="tablist"
              aria-label="Visão do serviço"
              className="mr-1 inline-flex items-center gap-1 rounded-[16px] border border-app-border bg-white p-1 shadow-soft"
            >
              {SERVICE_VIEWS.map((viewOption) => {
                const selected = view === viewOption.id;
                return (
                  <button
                    key={viewOption.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setView(viewOption.id)}
                    className={`rounded-[12px] px-4 py-2 text-[0.88rem] font-semibold transition ${
                      selected
                        ? 'bg-app-accent-soft text-app-text'
                        : 'text-app-muted hover:bg-app-accent-soft hover:text-app-text'
                    }`}
                  >
                    {viewOption.label}
                  </button>
                );
              })}
            </div>
            {view === 'catalog' ? (
              <button
                type="button"
                onClick={() => openCreateModal('ServiceSpecification')}
                aria-label="Criar especificação"
                title="Criar especificação"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-app-border bg-white text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text focus-visible:border-app-accent-border disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openCreateModal('ResourceFacingService')}
                  aria-label="Criar serviço de rede (RFS)"
                  title="Criar serviço de rede (RFS)"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] border border-app-border bg-white px-4 text-[0.88rem] font-semibold text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text"
                >
                  <Plus className="h-4 w-4" />
                  RFS
                </button>
                <button
                  type="button"
                  onClick={() => openCreateModal('CustomerFacingService')}
                  aria-label="Criar serviço de cliente (CFS)"
                  title="Criar serviço de cliente (CFS)"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] border border-app-border bg-white px-4 text-[0.88rem] font-semibold text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text"
                >
                  <Plus className="h-4 w-4" />
                  CFS
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openTerminateConfirmation}
              disabled={!selectedCount || saving || terminating || view === 'catalog'}
              aria-label="Encerrar selecionados"
              title="Encerrar selecionados"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-app-border bg-white text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text focus-visible:border-app-accent-border disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.9rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-app-border bg-white shadow-soft">
          <div className="flex-1 overflow-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-app-border">
                  <th className="w-[56px] px-4 py-3">
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
                      <th
                        key={column.key}
                        className="px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted"
                      >
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
                            className={`-mx-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 uppercase tracking-[0.08em] transition hover:bg-app-accent-soft ${
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
                    <td
                      colSpan={activeColumns.length + 1}
                      className="px-4 py-10 text-center text-[0.9rem] text-app-muted"
                    >
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
                : filteredItems.length
                  ? `Mostrando ${(activePage - 1) * PAGE_SIZE + 1}–${Math.min(activePage * PAGE_SIZE, filteredItems.length)} de ${filteredItems.length} registro(s)${
                      filteredItems.length !== categoryItems.length ? ` (filtrado de ${categoryItems.length})` : ''
                    }`
                  : categoryItems.length
                    ? 'Nenhum registro para os filtros aplicados'
                    : 'Nenhuma seleção ativa'}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-[0.88rem] text-app-muted">
                Página {activePage} de {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="geo-btn secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-app-border disabled:hover:bg-white"
                  onClick={() => goToPage(activePage - 1)}
                  disabled={activePage <= 1 || isLoading}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="geo-btn secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-app-border disabled:hover:bg-white"
                  onClick={() => goToPage(activePage + 1)}
                  disabled={!hasMore || isLoading}
                >
                  Próximo
                </button>
              </div>
            </div>
          </div>
        </div>
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
        <ServiceModal
          tab={modalState.tab}
          mode={modalState.mode}
          category={category}
          formState={formState}
          specificationOptions={specificationOptions}
          supportingServiceOptions={supportingServiceOptions}
          resourceOptions={supportingResourceChoices}
          servicesById={servicesById}
          geoDirectory={geoDirectory}
          saving={saving}
          onClose={closeModal}
          onChange={setFormState}
          onSubmit={submitModal}
        />
      ) : null}

      {terminateConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="terminate-confirmation-title"
                className="w-full max-w-[560px] rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
              >
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-[14px] bg-amber-50 p-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                        Confirmação de encerramento
                      </div>
                      <h2
                        id="terminate-confirmation-title"
                        className="mt-1 font-display text-[1.4rem] font-semibold text-app-text"
                      >
                        Encerrar {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}?
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
                    onClick={closeTerminateConfirmation}
                    disabled={terminating}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid gap-4 text-[0.92rem] text-app-muted">
                  <p>
                    O encerramento é lógico: os serviços passam ao estado Encerrado e saem da operação, mas
                    permanecem no inventário para auditoria e rastreabilidade. Encerrar um RFS com CFS ativo é
                    recusado pelo inventário.
                  </p>
                  {selectedTerminatePreview ? (
                    <div className="rounded-[18px] border border-app-border bg-app-accent-soft px-4 py-3 text-[0.88rem] text-app-text">
                      {selectedTerminatePreview}
                      {selectedCount > selectedOnPage.length
                        ? ' e outros itens selecionados em páginas anteriores.'
                        : ''}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-app-border pt-4">
                  <button
                    type="button"
                    onClick={closeTerminateConfirmation}
                    disabled={terminating}
                    className="geo-btn secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmTerminateSelected()}
                    disabled={terminating}
                    className="inline-flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-600 px-4 py-2 text-[0.92rem] font-semibold text-white shadow-soft transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    {terminating ? 'Encerrando...' : 'Confirmar encerramento'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isLoading ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.88rem] font-medium text-app-muted shadow-soft backdrop-blur">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Carregando dados...
        </div>
      ) : null}
    </div>
  );
}

function ServiceModal({
  tab,
  mode,
  category,
  formState,
  specificationOptions,
  supportingServiceOptions,
  resourceOptions,
  servicesById,
  geoDirectory,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  tab: ServiceTabId;
  mode: ServiceMode;
  category: string;
  formState: ServiceFormState;
  specificationOptions: ServiceSpecification[];
  supportingServiceOptions: ResourceFacingService[];
  resourceOptions: ResourceEntity[];
  servicesById: Map<string, ServiceEntity>;
  geoDirectory: ReturnType<typeof useGeoDirectory>['directory'] | null;
  saving: boolean;
  onClose: () => void;
  onChange: (next: ServiceFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isCatalog = tab === 'ServiceSpecification';
  const isCfs = tab === 'CustomerFacingService';

  // O seletor de spec só oferece specs da categoria ativa e da camada correta — o backend recusa
  // (422) quando o tipo da spec não casa com o tipo do serviço.
  const eligibleSpecs = specificationOptions.filter(
    (spec) => spec.category === category && spec.serviceType === (isCfs ? 'CFS' : 'RFS'),
  );

  const cfsBlockedByMissingRfs = isCfs && supportingServiceOptions.length === 0;

  const nameValid = formState.name.trim().length > 0;
  const submitValid = isCatalog
    ? nameValid && formState.category.trim().length > 0 && formState.serviceType !== ''
    : nameValid &&
      formState.serviceSpecificationId.trim().length > 0 &&
      (isCfs
        ? formState.subscriberId.trim().length > 0 && formState.supportingServiceIds.length > 0
        : formState.supportingResourceIds.length > 0);

  const title = isCatalog
    ? mode === 'create'
      ? 'Nova especificação'
      : 'Editar especificação'
    : isCfs
      ? mode === 'create'
        ? 'Novo serviço de cliente (CFS)'
        : 'Editar serviço de cliente (CFS)'
      : mode === 'create'
        ? 'Novo serviço de rede (RFS)'
        : 'Editar serviço de rede (RFS)';

  const toggleId = (field: 'supportingServiceIds' | 'supportingResourceIds', id: string) => {
    const current = formState[field];
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    onChange({ ...formState, [field]: next });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-modal-title"
        className="max-h-full w-full max-w-[760px] overflow-auto rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {isCatalog ? 'Catálogo de serviços' : 'Inventário de serviços'}
            </div>
            <h2 id="service-modal-title" className="mt-1 font-display text-[1.4rem] font-semibold text-app-text">
              {title}
            </h2>
          </div>
          <button type="button" className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {cfsBlockedByMissingRfs ? (
          <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-[0.88rem] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Um serviço de cliente precisa apoiar-se em ao menos um serviço de rede. Cadastre um RFS nesta
              categoria antes de criar o CFS.
            </span>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome" fullWidth>
            <input
              className="geo-input"
              value={formState.name}
              onChange={(event) => onChange({ ...formState, name: event.target.value })}
              placeholder={isCfs ? 'Bitstream-GPON-700-ProvedorX-SUB778899' : 'Acesso-GPON-778899'}
            />
          </Field>

          {isCatalog ? (
            <>
              <Field label="Camada">
                <select
                  className="geo-input"
                  value={formState.serviceType}
                  onChange={(event) =>
                    onChange({ ...formState, serviceType: event.target.value as ServiceSpecificationType })
                  }
                >
                  <option value="CFS">CFS — serviço de cliente</option>
                  <option value="RFS">RFS — serviço de rede</option>
                </select>
              </Field>
              <Field label="Categoria">
                <input className="geo-input" value={formState.category} readOnly />
              </Field>
              <Field label="Descrição" fullWidth>
                <textarea
                  className="geo-input"
                  rows={3}
                  value={formState.description}
                  onChange={(event) => onChange({ ...formState, description: event.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Especificação">
                <select
                  className="geo-input"
                  value={formState.serviceSpecificationId}
                  onChange={(event) => onChange({ ...formState, serviceSpecificationId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {eligibleSpecs.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Estado">
                <select
                  className="geo-input"
                  value={formState.state}
                  onChange={(event) => onChange({ ...formState, state: event.target.value as ServiceState })}
                >
                  {SERVICE_STATE_ORDER.filter((state) => state !== 'terminated').map((state) => (
                    <option key={state} value={state}>
                      {SERVICE_STATE_LABELS[state]}
                    </option>
                  ))}
                </select>
              </Field>

              {/* SubscriberID só existe no CFS: o inventário recusa (422) um RFS com assinante. */}
              {isCfs ? (
                <Field label="SubscriberID">
                  <input
                    className="geo-input"
                    value={formState.subscriberId}
                    onChange={(event) => onChange({ ...formState, subscriberId: event.target.value })}
                    placeholder="SUB778899"
                  />
                </Field>
              ) : null}

              <Field label="Local">
                <PlacePicker
                  value={formState.placeId ? { id: formState.placeId, '@referredType': formState.placeType || 'GeographicAddress' } : null}
                  onChange={(place) => {
                    onChange({
                      ...formState,
                      placeId: place?.id ?? '',
                      placeType: place?.['@referredType'] ?? 'GeographicAddress',
                    });
                  }}
                  directory={geoDirectory}
                  placeholder="Selecione um local…"
                />
              </Field>

              {/*
                A fronteira C3 em forma de UI: o CFS escolhe RFS (supportingService) e nunca recursos;
                o RFS escolhe recursos (supportingResource).
              */}
              {isCfs ? (
                <Field label="Serviços de rede que sustentam este CFS" fullWidth>
                  <CheckboxList
                    emptyMessage="Nenhum RFS disponível."
                    options={supportingServiceOptions.map((service) => ({
                      id: service.id,
                      label: service.name,
                      hint: SERVICE_STATE_LABELS[service.state],
                    }))}
                    selected={formState.supportingServiceIds}
                    onToggle={(id) => toggleId('supportingServiceIds', id)}
                  />
                </Field>
              ) : (
                <Field label="Recursos que sustentam este RFS" fullWidth>
                  <CheckboxList
                    emptyMessage="Nenhum recurso disponível."
                    options={resourceOptions.map((resource) => ({
                      id: resource.id,
                      label: resource.name,
                      hint: resource['@type'] === 'LogicalResource' ? 'Lógico' : 'Físico',
                    }))}
                    selected={formState.supportingResourceIds}
                    onToggle={(id) => toggleId('supportingResourceIds', id)}
                  />
                </Field>
              )}

              {isCfs && formState.supportingServiceIds.length ? (
                <div className="md:col-span-2 rounded-[18px] border border-app-border bg-app-accent-soft px-4 py-3 text-[0.82rem] text-app-text">
                  <span className="font-semibold">Cadeia: </span>
                  {formState.name || 'CFS'} →{' '}
                  {formState.supportingServiceIds
                    .map((id) => servicesById.get(id)?.name ?? id)
                    .join(' · ')}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-app-border pt-4">
          <button type="button" onClick={onClose} className="geo-btn secondary">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !submitValid || cfsBlockedByMissingRfs}
            className="inline-flex items-center gap-2 rounded-[16px] border border-app-accent-border bg-app-accent px-4 py-2 text-[0.92rem] font-semibold text-app-text shadow-soft transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CheckboxList({
  options,
  selected,
  onToggle,
  emptyMessage,
}: {
  options: Array<{ id: string; label: string; hint?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  emptyMessage: string;
}) {
  if (!options.length) {
    return (
      <div className="rounded-[14px] border border-app-border bg-white px-3 py-4 text-center text-[0.82rem] font-normal normal-case tracking-normal text-app-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="max-h-[180px] overflow-auto rounded-[14px] border border-app-border bg-white">
      {options.map((option) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[0.86rem] font-normal normal-case tracking-normal text-app-text transition hover:bg-app-accent-soft"
        >
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={() => onToggle(option.id)}
            aria-label={option.label}
          />
          <span className="truncate">{option.label}</span>
          {option.hint ? <span className="ml-auto shrink-0 text-[0.76rem] text-app-muted">{option.hint}</span> : null}
        </label>
      ))}
    </div>
  );
}

function LayerBadge({ label }: { label: string }) {
  const isCfs = label === 'CFS';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-semibold ${
        isCfs ? 'border-app-accent-border bg-app-accent-soft text-app-text' : 'border-app-border bg-white text-app-muted'
      }`}
    >
      {isCfs ? <Users className="h-3 w-3" aria-hidden /> : <Network className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  );
}

function StateBadge({ state }: { state: ServiceState }) {
  const tone =
    state === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : state === 'terminated'
        ? 'border-app-border bg-slate-50 text-app-muted'
        : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[0.74rem] font-semibold ${tone}`}>
      {SERVICE_STATE_LABELS[state] ?? state}
    </span>
  );
}

function serviceKindLabel(service: ServiceEntity): string {
  return service['@type'] === 'CustomerFacingService' ? 'CFS' : 'RFS';
}

/** Resumo da amarração: o CFS mostra o assinante; o RFS, quantos recursos sustenta. */
function serviceBindingSummary(service: ServiceEntity): string {
  if (service['@type'] === 'CustomerFacingService') {
    return service.subscriberId || '-';
  }
  const count = service.supportingResource?.length ?? 0;
  return count ? `${count} recurso(s)` : '-';
}

function buildSpecificationPayload(state: ServiceFormState): ServiceSpecificationPayload {
  return {
    name: state.name.trim(),
    category: state.category.trim(),
    serviceType: (state.serviceType || 'CFS') as ServiceSpecificationType,
    description: state.description.trim(),
  };
}

function buildPlace(state: ServiceFormState) {
  if (!state.placeId.trim()) return undefined;
  return [{ id: state.placeId.trim(), '@referredType': state.placeType || 'GeographicAddress' }];
}

function buildCfsPayload(state: ServiceFormState): CustomerFacingServicePayload {
  return {
    '@type': 'CustomerFacingService',
    name: state.name.trim(),
    serviceSpecificationId: state.serviceSpecificationId,
    subscriberId: state.subscriberId.trim(),
    state: state.state,
    category: state.category,
    supportingService: state.supportingServiceIds.map((id) => ({
      id,
      '@referredType': 'ResourceFacingService',
    })),
    place: buildPlace(state),
  };
}

function buildRfsPayload(
  state: ServiceFormState,
  resourcesById: Map<string, ResourceEntity>,
): ResourceFacingServicePayload {
  return {
    '@type': 'ResourceFacingService',
    name: state.name.trim(),
    serviceSpecificationId: state.serviceSpecificationId,
    state: state.state,
    category: state.category,
    supportingResource: state.supportingResourceIds.map((id) => ({
      id,
      '@referredType': resourcesById.get(id)?.['@type'] ?? 'PhysicalResource',
    })),
    place: buildPlace(state),
  };
}
