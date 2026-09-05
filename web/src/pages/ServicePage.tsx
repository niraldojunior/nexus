import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Briefcase,
  Filter,
  Loader2,
  MapPin,
  Network,
  Plus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createService,
  loadServiceWorkspaceSnapshot,
  terminateService,
  updateService,
  type CustomerFacingService,
  type CustomerFacingServicePayload,
  type ResourceFacingService,
  type ResourceFacingServicePayload,
  type ServiceCategory,
  type ServiceEntity,
  type ServiceSpecification,
  type ServiceState,
} from '../services/serviceApi';
import { listResources, type ResourceEntity } from '../services/resourceApi';
import ColumnFilterMenu from '../components/ColumnFilterMenu';
import Field from '../components/Field';
import { useNavigation } from '../hooks/useNavigation';
import { PlaceLabelCompact } from '../components/PlaceLabel';
import { PlacePicker } from '../components/PlacePicker';
import { SERVICE_CATEGORY_DEFAULTS } from '../data/serviceCatalogDefaults';
import {
  DEFAULT_SERVICE_CATEGORY_CODE,
  SERVICE_STATE_LABELS,
  SERVICE_STATE_ORDER,
  serviceCategoryCode,
} from '../data/serviceCategoryViews';
import {
  emptyServiceSpecFormState,
  type ServiceSpecFormState,
} from '../utils/serviceSpecificationForm';
import { PageHead, Button, Badge, StatusPill, DataTable, Modal } from '../components/ui';
import type { DataTableColumn } from '../components/ui';

const PAGE_SIZE = 20;

// Inventário apenas — o Catálogo (ServiceSpecification) foi centralizado em Configurações
// (acesso restrito a admin), ver ServiceCatalogTab.tsx.
type ServiceTabId = 'CustomerFacingService' | 'ResourceFacingService';
type ServiceMode = 'create' | 'edit';

type ModalState = {
  tab: ServiceTabId;
  mode: ServiceMode;
  entity: ServiceEntity | null;
};

type ServiceFormState = ServiceSpecFormState & {
  serviceSpecificationId: string;
  state: ServiceState;
  subscriberId: string;
  subscriberPartyId: string;
  supportingServiceIds: string[];
  supportingResourceIds: string[];
  placeId: string;
  placeType: string;
};

const emptyFormState = (): ServiceFormState => ({
  ...emptyServiceSpecFormState(),
  serviceSpecificationId: '',
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
};

type OpenFilterState = { key: string; rect: DOMRect };

interface ServicePageProps {
  category?: string;
}

export default function ServicePage({ category: categoryProp }: ServicePageProps = {}) {
  const category = categoryProp ?? DEFAULT_SERVICE_CATEGORY_CODE;
  // A tabela mostra CFS e RFS juntos — a tab só serve para o modal de criação (RFS × CFS) e para
  // as colunas filtráveis; o servidor devolve CFS+RFS da categoria ativa juntos (ver
  // buildServiceWorkspaceSnapshot).
  const effectiveTab: ServiceTabId = 'CustomerFacingService';

  const [page, setPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<OpenFilterState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [serviceCategories, setServiceCategories] =
    useState<ServiceCategory[]>(SERVICE_CATEGORY_DEFAULTS);
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

  const { goToGeo } = useNavigation();

  const activeTabConfig = tabConfig[effectiveTab];
  const activeColumns = activeTabConfig.buildColumns();
  const categoryName = serviceCategories.find((item) => item.code === category)?.name ?? category;

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
    for (const service of [...customerFacingServices, ...resourceFacingServices])
      map.set(service.id, service);
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
  const categoryItems = useMemo<ServiceEntity[]>(() => {
    return [...customerFacingServices, ...resourceFacingServices].filter(
      (service) => serviceCategoryCode(service, specificationsById) === category,
    );
  }, [category, customerFacingServices, resourceFacingServices, specificationsById]);

  // Valor exibido de uma coluna — usado para montar o domínio do filtro e para aplicá-lo, garantindo
  // que o filtro casa exatamente com o texto renderizado na célula.
  const columnValueFor = (service: ServiceEntity, key: string): string => {
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
    return categoryItems.filter((item) =>
      entries.every(([key, values]) => values.has(columnValueFor(item, key))),
    );
    // columnValueFor deriva de specificationsById, coberto abaixo.
  }, [categoryItems, columnFilters, specificationsById]);

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
  const selectedTerminatePreview = selectedOnPage
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ');

  const loadWorkspaceData = async (tab: ServiceTabId): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // A categoria é escopada no servidor (evita o full-scan global do inventário); a
      // paginação/filtro de coluna continua no cliente sobre esse conjunto já bem menor.
      const snapshot = await loadServiceWorkspaceSnapshot({ tab, category });
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
  }, [effectiveTab, category]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      pageSelectionCount > 0 && pageSelectionCount < pageItems.length;
  }, [pageItems.length, pageSelectionCount]);

  // Trocar de categoria reinicia paginação, seleção e filtros.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setTerminateConfirmOpen(false);
    setColumnFilters({});
    setOpenFilter(null);
  }, [category]);

  useEffect(() => {
    setPage(1);
  }, [columnFilters]);

  useEffect(() => {
    if (!modalState) {
      setFormState(emptyFormState());
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
      subscriberId: isCfs ? ((entity as CustomerFacingService | null)?.subscriberId ?? '') : '',
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

  const openEditModal = (entity: ServiceEntity) => {
    setModalState({ tab: entity['@type'] as ServiceTabId, mode: 'edit', entity });
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
      if (modalState?.tab === 'CustomerFacingService') {
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

  // Cabeçalho de coluna filtrável — botão sentence-case (o rótulo já vem em sentence case de
  // tabConfig) com o indicador de picklist; abre o ColumnFilterMenu ancorado no próprio botão.
  const renderFilterableHeader = (key: string, label: string) => {
    const activeCount = columnFilters[key]?.size ?? 0;
    return (
      <button
        type="button"
        title={`Filtrar por ${label}`}
        aria-expanded={openFilter?.key === key}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setOpenFilter((current) => (current?.key === key ? null : { key, rect }));
        }}
        className="-mx-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 transition hover:bg-app-accent-soft"
        style={{ color: activeCount ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
      >
        <span>{label}</span>
        <Filter
          className="h-3 w-3"
          strokeWidth={2}
          fill={activeCount ? 'currentColor' : 'none'}
          style={{ opacity: activeCount ? 1 : 0.6 }}
          aria-hidden
        />
        {activeCount ? (
          <span
            className="rounded-full px-1.5 text-[0.6rem] font-bold leading-[1.4]"
            style={{ background: 'var(--vt-yellow)', color: 'var(--text-primary)' }}
          >
            {activeCount}
          </span>
        ) : null}
      </button>
    );
  };

  const columns: DataTableColumn<ServiceEntity>[] = [
    {
      key: 'select',
      headerClassName: 'w-[44px]',
      header: (
        <input
          ref={selectAllRef}
          type="checkbox"
          aria-label="Selecionar página atual"
          checked={pageItems.length > 0 && pageSelectionCount === pageItems.length}
          onChange={toggleSelectPage}
        />
      ),
      render: (service) => (
        <input
          type="checkbox"
          aria-label={`Selecionar ${service.name}`}
          checked={selectedIds.has(service.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={() => toggleSelected(service.id)}
        />
      ),
    },
    {
      key: 'name',
      header: 'Serviço',
      render: (service) => (
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {service.name}
        </span>
      ),
    },
    {
      key: 'kind',
      header: renderFilterableHeader('kind', 'Camada'),
      render: (service) => <LayerBadge label={serviceKindLabel(service)} />,
    },
    {
      key: 'spec',
      header: renderFilterableHeader('spec', 'Especificação'),
      render: (service) => specificationsById.get(service.serviceSpecificationId)?.name ?? '-',
    },
    {
      key: 'state',
      header: renderFilterableHeader('state', 'Estado'),
      render: (service) => (
        <StatusPill status={service.state} label={SERVICE_STATE_LABELS[service.state]} />
      ),
    },
    {
      key: 'binding',
      header: 'Assinante / Recursos',
      render: (service) => serviceBindingSummary(service),
    },
    {
      key: 'place',
      header: 'Local',
      render: (service) => (
        <div className="flex items-center gap-2">
          <PlaceLabelCompact place={service.place?.[0]} />
          {service.place?.[0]?.id && (
            <button
              type="button"
              onClick={() => goToGeo(service.place![0].id)}
              className="inline-flex items-center text-app-accent transition hover:text-app-accent-border"
              title="Ver no mapa de locais"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full px-8 py-8">
      <div className="mx-auto flex flex-col gap-6" style={{ maxWidth: 'var(--content-max)' }}>
        <PageHead
          title={categoryName}
          subtitle={activeTabConfig.description}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => openCreateModal('ResourceFacingService')}
                iconLeft={<Plus className="h-4 w-4" />}
                aria-label="Criar serviço de rede (RFS)"
                title="Criar serviço de rede (RFS)"
              >
                RFS
              </Button>
              <Button
                variant="secondary"
                onClick={() => openCreateModal('CustomerFacingService')}
                iconLeft={<Plus className="h-4 w-4" />}
                aria-label="Criar serviço de cliente (CFS)"
                title="Criar serviço de cliente (CFS)"
              >
                CFS
              </Button>
              <Button
                variant="secondary"
                onClick={openTerminateConfirmation}
                disabled={!selectedCount || saving || terminating}
                iconLeft={<X className="h-4 w-4" />}
                aria-label="Encerrar selecionados"
                title="Encerrar selecionados"
              />
            </>
          }
        />

        {error ? (
          <div
            className="px-4 py-3 text-[0.9rem]"
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--status-red)',
              background: 'var(--status-red-soft)',
              color: 'var(--status-red)',
            }}
          >
            {error}
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={pageItems}
          rowKey={(service) => service.id}
          onRowClick={openEditModal}
          emptyMessage="Nenhum registro encontrado."
          footer={
            <>
              <div style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-tertiary)' }}>
                {selectedCount
                  ? `${selectedCount} selecionados no total`
                  : filteredItems.length
                    ? `Mostrando ${(activePage - 1) * PAGE_SIZE + 1}–${Math.min(activePage * PAGE_SIZE, filteredItems.length)} de ${filteredItems.length} registro(s)${
                        filteredItems.length !== categoryItems.length
                          ? ` (filtrado de ${categoryItems.length})`
                          : ''
                      }`
                    : categoryItems.length
                      ? 'Nenhum registro para os filtros aplicados'
                      : 'Nenhuma seleção ativa'}
              </div>
              <div className="flex items-center gap-4">
                <div style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-tertiary)' }}>
                  Página {activePage} de {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToPage(activePage - 1)}
                    disabled={activePage <= 1 || isLoading}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToPage(activePage + 1)}
                    disabled={!hasMore || isLoading}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          }
        />
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
          saving={saving}
          onClose={closeModal}
          onChange={setFormState}
          onSubmit={submitModal}
        />
      ) : null}

      {terminateConfirmOpen
        ? createPortal(
            <Modal
              onClose={closeTerminateConfirmation}
              width={560}
              ariaLabel="Confirmação de encerramento"
              footer={
                <>
                  <Button
                    variant="secondary"
                    onClick={closeTerminateConfirmation}
                    disabled={terminating}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void confirmTerminateSelected()}
                    disabled={terminating}
                    iconLeft={<X className="h-4 w-4" />}
                  >
                    {terminating ? 'Encerrando...' : 'Confirmar encerramento'}
                  </Button>
                </>
              }
            >
              <div
                className="mb-4 flex items-start justify-between gap-4 border-b pb-4"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 p-2"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--status-amber-soft)',
                      color: 'var(--status-amber)',
                    }}
                  >
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="vt-eyebrow">Confirmação de encerramento</div>
                    <h2
                      className="mt-1 text-app-text"
                      style={{ font: 'var(--text-h2)', letterSpacing: 'var(--tracking-snug)' }}
                    >
                      Encerrar {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}?
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 transition hover:bg-app-accent-soft"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={closeTerminateConfirmation}
                  disabled={terminating}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                className="grid gap-4"
                style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-secondary)' }}
              >
                <p>
                  O encerramento é lógico: os serviços passam ao estado Encerrado e saem da
                  operação, mas permanecem no inventário para auditoria e rastreabilidade.
                  Encerrar um RFS com CFS ativo é recusado pelo inventário.
                </p>
                {selectedTerminatePreview ? (
                  <div
                    className="px-4 py-3 text-[0.88rem]"
                    style={{
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      background: 'var(--vt-yellow-tint)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedTerminatePreview}
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
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.9)',
            color: 'var(--text-tertiary)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
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
  saving: boolean;
  onClose: () => void;
  onChange: (next: ServiceFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isCfs = tab === 'CustomerFacingService';

  // O seletor de spec só oferece specs da categoria ativa e da camada correta — o backend recusa
  // (422) quando o tipo da spec não casa com o tipo do serviço.
  const eligibleSpecs = specificationOptions.filter(
    (spec) => spec.category === category && spec.serviceType === (isCfs ? 'CFS' : 'RFS'),
  );

  const cfsBlockedByMissingRfs = isCfs && supportingServiceOptions.length === 0;

  const nameValid = formState.name.trim().length > 0;
  const submitValid =
    nameValid &&
    formState.serviceSpecificationId.trim().length > 0 &&
    (isCfs
      ? formState.subscriberId.trim().length > 0 && formState.supportingServiceIds.length > 0
      : formState.supportingResourceIds.length > 0);

  const title = isCfs
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
    <Modal onClose={onClose} width={760} ariaLabel={title}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div
          className="mb-1 flex items-start justify-between gap-4 border-b pb-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="vt-eyebrow">Inventário de serviços</div>
            <h2
              className="mt-1 text-app-text"
              style={{ font: 'var(--text-h2)', letterSpacing: 'var(--tracking-snug)' }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-full p-2 transition hover:bg-app-accent-soft"
            style={{ color: 'var(--text-tertiary)' }}
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cfsBlockedByMissingRfs ? (
          <div
            className="flex items-start gap-3 px-4 py-3 text-[0.88rem]"
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--status-amber)',
              background: 'var(--status-amber-soft)',
              color: 'var(--status-amber)',
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Um serviço de cliente precisa apoiar-se em ao menos um serviço de rede. Cadastre um
              RFS nesta categoria antes de criar o CFS.
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

          <>
            <Field label="Especificação">
              <select
                className="geo-input"
                value={formState.serviceSpecificationId}
                onChange={(event) =>
                  onChange({ ...formState, serviceSpecificationId: event.target.value })
                }
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
                onChange={(event) =>
                  onChange({ ...formState, state: event.target.value as ServiceState })
                }
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
                value={
                  formState.placeId
                    ? {
                        id: formState.placeId,
                        '@referredType': formState.placeType || 'GeographicAddress',
                      }
                    : null
                }
                onChange={(place) => {
                  onChange({
                    ...formState,
                    placeId: place?.id ?? '',
                    placeType: place?.['@referredType'] ?? 'GeographicAddress',
                  });
                }}
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
              <div
                className="px-4 py-3 text-[0.82rem] md:col-span-2"
                style={{
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  background: 'var(--vt-yellow-tint)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="font-semibold">Cadeia: </span>
                {formState.name || 'CFS'} →{' '}
                {formState.supportingServiceIds
                  .map((id) => servicesById.get(id)?.name ?? id)
                  .join(' · ')}
              </div>
            ) : null}
          </>
        </div>

        <div
          className="mt-2 flex items-center justify-end gap-3 border-t pt-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !submitValid || cfsBlockedByMissingRfs}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>,
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
      <div
        className="px-3 py-4 text-center text-[0.82rem]"
        style={{
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--surface-card)',
          color: 'var(--text-tertiary)',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className="max-h-[180px] overflow-auto"
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--surface-card)',
      }}
    >
      {options.map((option) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[0.86rem] transition hover:bg-app-accent-soft"
          style={{ color: 'var(--text-primary)' }}
        >
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={() => onToggle(option.id)}
            aria-label={option.label}
          />
          <span className="truncate">{option.label}</span>
          {option.hint ? (
            <span
              className="ml-auto shrink-0 text-[0.76rem]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {option.hint}
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}

function LayerBadge({ label }: { label: string }) {
  const isCfs = label === 'CFS';
  return (
    <Badge tone={isCfs ? 'brand' : 'neutral'}>
      {isCfs ? (
        <Users className="h-3 w-3" aria-hidden />
      ) : (
        <Network className="h-3 w-3" aria-hidden />
      )}
      {label}
    </Badge>
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
