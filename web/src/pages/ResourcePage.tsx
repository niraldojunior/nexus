import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Cable,
  ChevronDown,
  Cpu,
  FileText,
  Globe2,
  Home,
  Layers3,
  Link2,
  Loader2,
  Network,
  Package,
  Plus,
  Server,
  Shield,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createResource,
  createResourceSpecification,
  deleteResource,
  deleteResourceSpecification,
  listResourceCategories,
  listResourceSpecifications,
  listResourceTypes,
  listResources,
  updateResource,
  updateResourceSpecification,
  type ResourceCategory,
  type LogicalResource,
  type LogicalResourcePayload,
  type PhysicalResource,
  type PhysicalResourcePayload,
  type ResourceEntity,
  type ResourceSpecification,
  type ResourceSpecificationPayload,
  type ResourceType,
  type ResourceTab,
} from '../services/resourceApi';
import { listParties, listPartyRoles, type Party } from '../services/partyApi';
import { RESOURCE_CATEGORY_DEFAULTS, RESOURCE_TYPE_DEFAULTS } from '../data/resourceCatalogDefaults';
import { resourceFieldLabel } from '../utils/resourceFieldLabels';
import {
  characteristicBooleanValue,
  RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS,
  readResourceSpecificationCharacteristicBooleanState,
  readResourceSpecificationCharacteristicString,
  readResourceSpecificationStatusLabel,
  type ResourceSpecificationCharacteristic,
} from '../utils/resourceSpecificationCharacteristics';

const PAGE_SIZE = 20;
const MANUFACTURER_PARTY_NAMES = new Set([
  'VANTIVA',
  'BLU-CASTLE',
  'DATACOM',
  'HUAWEI',
  'ZTE',
  'SAGEMCOM',
  'NOKIA',
  'TELLESCOM',
  'ARCADYAN',
]);

type ResourceTabId = ResourceTab;
type ResourceMode = 'create' | 'edit';

type ModalState = {
  tab: ResourceTabId;
  mode: ResourceMode;
  entity: ResourceEntity | ResourceSpecification | null;
};

type ResourceFormState = {
  name: string;
  category: string;
  resourceType: string;
  description: string;
  equipmentCode: string;
  equipmentFunction: string;
  manufacturer: string;
  model: string;
  manufacturerPartyId: string;
  skuId: string;
  stockable: '' | 'true' | 'false';
  discontinued: '' | 'true' | 'false';
  supportsSdWan: '' | 'true' | 'false';
  supportsVoice: '' | 'true' | 'false';
  homologationDate: string;
  endOfLifeDate: string;
  endOfSupportLifeDate: string;
  lifecycleStatus: string;
  resourceSpecificationId: string;
  placeId: string;
  placeType: string;
  status: string;
  serialNumber: string;
  partNumber: string;
  supportingPhysicalResourceId: string;
};

type PlaceOption = {
  id: string;
  referredType: string;
  label: string;
};

type CatalogOption = {
  code: string;
  label: string;
  active: boolean;
  icon: LucideIcon;
};

const emptyFormState = (): ResourceFormState => ({
  name: '',
  category: '',
  resourceType: '',
  description: '',
  equipmentCode: '',
  equipmentFunction: '',
  manufacturer: '',
  model: '',
  manufacturerPartyId: '',
  skuId: '',
  stockable: '',
  discontinued: '',
  supportsSdWan: '',
  supportsVoice: '',
  homologationDate: '',
  endOfLifeDate: '',
  endOfSupportLifeDate: '',
  lifecycleStatus: '',
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
    description: string;
    icon: LucideIcon;
    buildColumns: () => Array<{ key: string; label: string }>;
  }
> = {
  PhysicalResource: {
    title: 'Recursos Físicos',
    description: 'Inventário de ativos e infraestrutura física, com foco em ocupação, estado e contenção.',
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
    description: 'Recursos lógicos associados a endereçamento, isolamento e vínculos técnicos.',
    icon: Link2,
    buildColumns: () => [
      { key: 'name', label: resourceFieldLabel('name') },
      { key: 'spec', label: resourceFieldLabel('resourceSpecificationName') },
      { key: 'place', label: resourceFieldLabel('placeId') },
      { key: 'status', label: 'Status' },
      { key: 'details', label: 'Vínculo físico' },
    ],
  },
  ResourceSpecification: {
    title: 'Catálogo de Recursos',
    description: 'Catálogo de tipos, categorias e especificações que tipam as instâncias de recurso.',
    icon: FileText,
    buildColumns: () => [
      { key: 'category', label: resourceFieldLabel('category') },
      { key: 'resourceType', label: resourceFieldLabel('resourceType') },
      { key: 'manufacturer', label: resourceFieldLabel('manufacturer') },
      { key: 'model', label: resourceFieldLabel('model') },
      { key: 'lifecycleStatus', label: resourceFieldLabel('lifecycleStatus') },
      { key: 'equipmentFunction', label: resourceFieldLabel('equipmentFunction') },
      { key: 'endOfLifeDate', label: resourceFieldLabel('endOfLifeDate') },
      { key: 'endOfSupportLifeDate', label: resourceFieldLabel('endOfSupportLifeDate') },
    ],
  },
};

interface ResourcePageProps {
  activeTab?: ResourceTab;
  onActiveTabChange?: (tab: ResourceTab) => void;
}

export default function ResourcePage({
  activeTab: controlledActiveTab,
}: ResourcePageProps = {}) {
  const [pageByTab, setPageByTab] = useState<Record<ResourceTabId, number>>({
    PhysicalResource: 1,
    LogicalResource: 1,
    ResourceSpecification: 1,
  });
  const [selectedIds, setSelectedIds] = useState<Record<ResourceTabId, Set<string>>>({
    PhysicalResource: new Set(),
    LogicalResource: new Set(),
    ResourceSpecification: new Set(),
  });
  const [resourceSpecifications, setResourceSpecifications] = useState<ResourceSpecification[]>([]);
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [resourcesByTab, setResourcesByTab] = useState<Record<Exclude<ResourceTabId, 'ResourceSpecification'>, ResourceEntity[]>>({
    PhysicalResource: [],
    LogicalResource: [],
  });
  const [resourceSpecificationOptions, setResourceSpecificationOptions] = useState<ResourceSpecification[]>([]);
  const [manufacturerOptions, setManufacturerOptions] = useState<Party[]>([]);
  const [physicalResourceOptions, setPhysicalResourceOptions] = useState<PhysicalResource[]>([]);
  const [logicalResourceOptions, setLogicalResourceOptions] = useState<LogicalResource[]>([]);
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

  const activeTab = controlledActiveTab ?? 'PhysicalResource';
  const activePage = pageByTab[activeTab];
  const activeSelection = selectedIds[activeTab];
  const activeItems = activeTab === 'ResourceSpecification' ? resourceSpecifications : resourcesByTab[activeTab];
  const activeColumns = tabConfig[activeTab].buildColumns();
  const activeTabConfig = tabConfig[activeTab];
  const ActiveIcon = activeTabConfig.icon;
  const placeOptions = buildPlaceOptions([...physicalResourceOptions, ...logicalResourceOptions]);
  const selectedCategory = resourceCategories.find((category) => category.code === formState.category);
  const visibleTypeOptions = buildTypeOptions(resourceTypes, formState.category);
  const selectedResourceType = resourceTypes.find((type) => type.code === formState.resourceType);
  const categorySelectionInvalid = Boolean(formState.category && (!selectedCategory || selectedCategory.status !== 'active'));
  const resourceTypeSelectionInvalid = Boolean(
    formState.resourceType &&
      (!selectedResourceType || selectedResourceType.status !== 'active' || selectedResourceType.categoryCode !== formState.category),
  );
  const catalogSelectionValid =
    !(
      modalState?.tab === 'ResourceSpecification' &&
      (categorySelectionInvalid ||
        resourceTypeSelectionInvalid ||
        (Boolean(formState.category) &&
          Boolean(formState.resourceType) &&
          !visibleTypeOptions.some((option) => option.code === formState.resourceType)))
    );
  const hasMore = activeItems.length === PAGE_SIZE;
  const selectedOnPage = activeItems.filter((item) => activeSelection.has(item.id));
  const pageSelectionCount = selectedOnPage.length;
  const selectedCount = activeSelection.size;
  const selectedDeletePreview = selectedOnPage.slice(0, 3).map((item) => item.name).join(', ');

  const loadTab = async (tab: ResourceTabId, page: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      if (tab === 'ResourceSpecification') {
        const items = await listResourceSpecifications({ limit: PAGE_SIZE, offset });
        setResourceSpecifications(items);
      } else {
        const items = await listResources({ kind: tab, limit: PAGE_SIZE, offset, status: 'active' });
        setResourcesByTab((current) => ({ ...current, [tab]: items }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Resource.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLookupOptions = async (): Promise<void> => {
    setLookupLoading(true);
    try {
      const [specsResult, categoriesResult, typesResult, physicalResourcesResult, logicalResourcesResult, manufacturerCandidatesResult] = await Promise.allSettled([
        loadAllResourceSpecifications(),
        listResourceCategories(),
        listResourceTypes(),
        loadAllResources('PhysicalResource'),
        loadAllResources('LogicalResource'),
        loadManufacturerCandidates(),
      ]);

      if (specsResult.status === 'fulfilled') {
        setResourceSpecificationOptions(specsResult.value);
      }

      setResourceCategories(
        categoriesResult.status === 'fulfilled' && categoriesResult.value.length
          ? categoriesResult.value
          : RESOURCE_CATEGORY_DEFAULTS,
      );
      setResourceTypes(
        typesResult.status === 'fulfilled' && typesResult.value.length ? typesResult.value : RESOURCE_TYPE_DEFAULTS,
      );

      if (physicalResourcesResult.status === 'fulfilled') {
        setPhysicalResourceOptions(physicalResourcesResult.value.filter(isPhysicalResource));
      }
      if (logicalResourcesResult.status === 'fulfilled') {
        setLogicalResourceOptions(logicalResourcesResult.value.filter(isLogicalResource));
      }
      if (manufacturerCandidatesResult.status === 'fulfilled') {
        setManufacturerOptions(manufacturerCandidatesResult.value);
      }
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    void loadTab(activeTab, activePage);
  }, [activeTab, activePage]);

  useEffect(() => {
    void loadLookupOptions();
  }, []);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = pageSelectionCount > 0 && pageSelectionCount < activeItems.length;
  }, [activeItems.length, pageSelectionCount]);

  useEffect(() => {
    setDeleteConfirmOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!modalState) {
      setFormState(emptyFormState());
      return;
    }

    if (modalState.tab === 'ResourceSpecification') {
      const entity = modalState.entity as ResourceSpecification | null;
      const characteristics = entity?.resourceSpecificationCharacteristic ?? [];
      const manufacturerCharacteristic = characteristics.find((characteristic) => characteristic.name === 'manufacturer');
      const manufacturerParty = entity?.relatedParty?.find((party) => party.role === 'manufacturer');
      const manufacturerLabel = manufacturerParty?.name ?? (manufacturerCharacteristic?.value ? String(manufacturerCharacteristic.value).trim() : '');
      const resolvedManufacturer =
        manufacturerParty ??
        manufacturerOptions.find(
          (party) =>
            party.name.trim().toLowerCase() === manufacturerLabel.trim().toLowerCase() ||
            party.id.trim().toLowerCase() === manufacturerLabel.trim().toLowerCase(),
        ) ??
        null;
      setFormState({
        ...emptyFormState(),
        name: entity?.name ?? '',
        category: entity?.category ?? '',
        resourceType: entity?.resourceType ?? '',
        description: entity?.description ?? '',
        equipmentCode: readResourceSpecificationCharacteristicString(characteristics, 'equipmentCode'),
        equipmentFunction: readResourceSpecificationCharacteristicString(characteristics, 'equipmentFunction'),
        model: readSpecificationModel(entity),
        manufacturerPartyId: resolvedManufacturer?.id ?? '',
        skuId: readResourceSpecificationCharacteristicString(characteristics, 'skuId'),
        stockable: readResourceSpecificationCharacteristicBooleanState(characteristics, 'stockable'),
        discontinued: readResourceSpecificationCharacteristicBooleanState(characteristics, 'discontinued'),
        supportsSdWan: readResourceSpecificationCharacteristicBooleanState(characteristics, 'supportsSdWan'),
        supportsVoice: readResourceSpecificationCharacteristicBooleanState(characteristics, 'supportsVoice'),
        homologationDate: readResourceSpecificationCharacteristicString(characteristics, 'homologationDate'),
        endOfLifeDate: readResourceSpecificationCharacteristicString(characteristics, 'endOfLifeDate'),
        endOfSupportLifeDate: readResourceSpecificationCharacteristicString(characteristics, 'endOfSupportLifeDate'),
        lifecycleStatus: readResourceSpecificationCharacteristicString(characteristics, 'lifecycleStatus'),
      });
      return;
    }

    const entity = modalState.entity as ResourceEntity | null;
    const resourceSpecification = resourceSpecificationOptions.find((spec) => spec.id === entity?.resourceSpecificationId);
    setFormState({
      ...emptyFormState(),
      name: entity?.name ?? '',
      resourceSpecificationId: entity?.resourceSpecificationId ?? '',
      category: isPhysicalResource(entity) ? resourceSpecification?.category ?? '' : '',
      resourceType: isPhysicalResource(entity) ? resourceSpecification?.resourceType ?? '' : '',
      placeId: entity?.place?.id ?? '',
      placeType: entity?.place?.['@referredType'] ?? '',
      status: entity?.status ?? 'active',
      model: isPhysicalResource(entity) ? entity.model ?? '' : '',
      serialNumber: isPhysicalResource(entity) ? entity.serialNumber ?? '' : '',
      partNumber: isPhysicalResource(entity) ? entity.partNumber ?? '' : '',
      supportingPhysicalResourceId: isLogicalResource(entity) ? entity.supportingPhysicalResourceId ?? '' : '',
    });
  }, [modalState, manufacturerOptions]);

  useEffect(() => {
    if (!modalState || modalState.mode !== 'create') return;
    if (modalState.tab !== 'LogicalResource') return;
    setFormState((current) => {
      const nextResourceSpecificationId = current.resourceSpecificationId || resourceSpecificationOptions[0]?.id || '';
      if (nextResourceSpecificationId === current.resourceSpecificationId) return current;
      return { ...current, resourceSpecificationId: nextResourceSpecificationId };
    });
  }, [modalState, resourceSpecificationOptions]);

  // Auto-populate manufacturer and model from ResourceSpecification for PhysicalResource.
  useEffect(() => {
    if (!modalState || modalState.tab !== 'PhysicalResource') return;
    if (!formState.resourceSpecificationId) return;

    const selectedSpec = resourceSpecificationOptions.find((spec) => spec.id === formState.resourceSpecificationId);
    if (!selectedSpec) return;

    // Prefer the canonical characteristic. Keep relatedParty as fallback for legacy specs.
    const manufacturerCharacteristic = selectedSpec.resourceSpecificationCharacteristic?.find(
      (characteristic) => characteristic.name === 'manufacturer',
    );
    const manufacturerParty = selectedSpec.relatedParty?.find((party) => party.role === 'manufacturer');
    const manufacturerName =
      (typeof manufacturerCharacteristic?.value === 'string' ? manufacturerCharacteristic.value : String(manufacturerCharacteristic?.value ?? '')).trim() ||
      manufacturerParty?.name ||
      '';

    // Use spec name as model
    const specModel = selectedSpec.name || '';

    setFormState((current) => {
      // Only update if values have changed to avoid unnecessary re-renders
      if (current.manufacturer === manufacturerName && current.model === specModel) {
        return current;
      }
      return {
        ...current,
        manufacturer: manufacturerName,
        model: specModel,
      };
    });
  }, [modalState, formState.resourceSpecificationId, resourceSpecificationOptions]);

  const goToPage = (nextPage: number) => {
    setPageByTab((current) => ({ ...current, [activeTab]: Math.max(1, nextPage) }));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current[activeTab]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...current, [activeTab]: next };
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current[activeTab]);
      if (selectedOnPage.length === activeItems.length && activeItems.length > 0) {
        for (const item of activeItems) next.delete(item.id);
      } else {
        for (const item of activeItems) next.add(item.id);
      }
      return { ...current, [activeTab]: next };
    });
  };

  const openCreateModal = () => {
    setModalState({ tab: activeTab, mode: 'create', entity: null });
  };

  const openEditModal = (entity: ResourceEntity | ResourceSpecification) => {
    setModalState({ tab: activeTab, mode: 'edit', entity });
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

  const refreshActiveTab = async () => {
    await loadTab(activeTab, pageByTab[activeTab]);
  };

  refreshCatalogRef.current = () => {
    void loadLookupOptions();
    void refreshActiveTab();
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
      if (modalState?.tab === 'ResourceSpecification') {
        const payload = buildSpecificationPayload(formState, modalState.entity as ResourceSpecification | null, manufacturerOptions);
        if (modalState.mode === 'create') {
          await createResourceSpecification(payload);
        } else if (modalState.entity) {
          await updateResourceSpecification(modalState.entity.id, payload);
        }
      } else if (modalState?.tab === 'PhysicalResource') {
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
      setSelectedIds((current) => ({ ...current, [activeTab]: new Set() }));
      await refreshActiveTab();
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
      const idsToDelete = [...activeSelection];
      for (const id of idsToDelete) {
        if (activeTab === 'ResourceSpecification') await deleteResourceSpecification(id);
        else await deleteResource(id);
      }
      setSelectedIds((current) => ({ ...current, [activeTab]: new Set() }));
      setDeleteConfirmOpen(false);
      await refreshActiveTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir Resource.');
    } finally {
      setDeleting(false);
    }
  };

  const rows =
    activeTab === 'ResourceSpecification'
      ? resourceSpecifications.map((spec) => (
          <tr
            key={spec.id}
            className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-accent-soft"
            onClick={() => openEditModal(spec)}
          >
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${spec.name}`}
                checked={activeSelection.has(spec.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleSelected(spec.id)}
              />
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readResourceCategoryLabel(resourceCategories, spec.category)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readResourceTypeCode(resourceTypes, spec.resourceType)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecificationManufacturer(spec)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecificationModel(spec)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'equipmentFunction')}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'endOfLifeDate')}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'endOfSupportLifeDate')}</td>
          </tr>
        ))
      : activeItems.map((resource) => {
          const resourceItem = resource as ResourceEntity;
          return (
          <tr
            key={resourceItem.id}
            className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-accent-soft"
            onClick={() => openEditModal(resourceItem)}
          >
            <td className="px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Selecionar ${resourceItem.name}`}
                checked={activeSelection.has(resourceItem.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleSelected(resourceItem.id)}
              />
            </td>
            <td className="px-4 py-3 text-[0.92rem] font-semibold text-app-text">{resourceItem.name}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {readResourceSpecificationName(resourceSpecificationOptions, resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId)}
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {readResourceSpecificationType(resourceSpecificationOptions, resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId)}
            </td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{resourceItem.place?.id ?? '-'}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{resourceItem.status ?? '-'}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {activeTab === 'PhysicalResource'
                ? physicalDetails(resourceItem as PhysicalResource)
                : logicalDetails(resourceItem as LogicalResource)}
            </td>
          </tr>
          );
        });

  return (
    <div className="h-full min-h-0 overflow-hidden px-8 py-8">
      <div className="mx-auto flex h-full max-w-[1460px] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <ActiveIcon className="h-7 w-7 shrink-0 text-app-muted" strokeWidth={2} />
              <h1 className="font-display text-4xl font-semibold text-app-text">
                {activeTabConfig.title}
              </h1>
            </div>
            <p className="mt-2 max-w-[820px] text-[0.96rem] text-app-muted">
              {activeTabConfig.description}
            </p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              aria-label="Criar recurso"
              title="Criar recurso"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-app-border bg-white text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text focus-visible:border-app-accent-border disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openDeleteConfirmation}
              disabled={!selectedCount || saving || deleting}
              aria-label="Excluir selecionados"
              title="Excluir selecionados"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-app-border bg-white text-app-muted shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft hover:text-app-text focus-visible:border-app-accent-border disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
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
                      checked={activeItems.length > 0 && pageSelectionCount === activeItems.length}
                      onChange={toggleSelectPage}
                    />
                  </th>
                  {activeColumns.map((column) => (
                    <th
                      key={column.key}
                      className="px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows
                ) : (
                  <tr>
                    <td colSpan={activeColumns.length + 1} className="px-4 py-10 text-center text-[0.9rem] text-app-muted">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-app-border px-5 py-4">
            <div className="text-[0.88rem] text-app-muted">
              {selectedCount ? `${selectedCount} selecionados no total` : 'Nenhuma seleção ativa'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="geo-btn secondary"
                onClick={() => goToPage(activePage - 1)}
                disabled={activePage <= 1 || isLoading}
              >
                Anterior
              </button>
              <div className="rounded-[16px] border border-app-border bg-app-accent-soft px-4 py-2 text-[0.88rem] font-semibold text-app-text">
                Página {activePage}
              </div>
              <button
                type="button"
                className="geo-btn secondary"
                onClick={() => goToPage(activePage + 1)}
                disabled={!hasMore || isLoading}
              >
                Próximo
              </button>
            </div>
          </div>
        </div>
      </div>

      {modalState ? (
        <ResourceModal
          tab={modalState.tab}
          mode={modalState.mode}
          formState={formState}
          resourceCategories={resourceCategories}
          resourceTypes={resourceTypes}
          resourceSpecificationOptions={resourceSpecificationOptions}
          manufacturerOptions={manufacturerOptions}
          physicalResourceOptions={physicalResourceOptions}
          placeOptions={placeOptions}
          lookupLoading={lookupLoading}
          saving={saving}
          catalogSelectionValid={catalogSelectionValid}
          onClose={closeModal}
          onChange={setFormState}
          onSubmit={submitModal}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirmation-title"
            className="w-full max-w-[560px] rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
          >
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-[14px] bg-amber-50 p-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                    Confirmação de exclusão
                  </div>
                  <h2 id="delete-confirmation-title" className="mt-1 font-display text-[1.4rem] font-semibold text-app-text">
                    Excluir {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}?
                  </h2>
                </div>
              </div>
              <button type="button" className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft" onClick={closeDeleteConfirmation} disabled={deleting}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 text-[0.92rem] text-app-muted">
              <p>
                A exclusão é lógica. Os itens selecionados serão encerrados e removidos da listagem ativa.
              </p>
              {selectedDeletePreview ? (
                <div className="rounded-[18px] border border-app-border bg-app-accent-soft px-4 py-3 text-[0.88rem] text-app-text">
                  {selectedDeletePreview}
                  {selectedCount > selectedOnPage.length ? ' e outros itens selecionados em páginas anteriores.' : ''}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-app-border pt-4">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={deleting}
                className="geo-btn secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSelected()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-600 px-4 py-2 text-[0.92rem] font-semibold text-white shadow-soft transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.88rem] font-medium text-app-muted shadow-soft backdrop-blur">
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
  formState,
  resourceCategories,
  resourceTypes,
  resourceSpecificationOptions,
  manufacturerOptions,
  physicalResourceOptions,
  placeOptions,
  lookupLoading,
  saving,
  catalogSelectionValid,
  onClose,
  onChange,
  onSubmit,
}: {
  tab: ResourceTabId;
  mode: ResourceMode;
  formState: ResourceFormState;
  resourceCategories: ResourceCategory[];
  resourceTypes: ResourceType[];
  resourceSpecificationOptions: ResourceSpecification[];
  manufacturerOptions: Party[];
  physicalResourceOptions: PhysicalResource[];
  placeOptions: PlaceOption[];
  lookupLoading: boolean;
  saving: boolean;
  catalogSelectionValid: boolean;
  onClose: () => void;
  onChange: (next: ResourceFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const title =
    tab === 'ResourceSpecification'
      ? `${mode === 'create' ? 'Criar' : 'Editar'} Modelo de Recurso`
      : `${mode === 'create' ? 'Criar' : 'Editar'} ${tabConfig[tab].title}`;
  const categoryOptions = buildCategoryOptions(resourceCategories);
  const physicalCategoryOptions = buildPhysicalCategoryOptions(resourceCategories);
  const visibleTypeOptions = buildTypeOptions(resourceTypes, formState.category);
  const selectedResourceSpecification = resourceSpecificationOptions.find((spec) => spec.id === formState.resourceSpecificationId);
  const selectedCategory = resourceCategories.find((category) => category.code === formState.category);
  const selectedCategoryOption = categoryOptions.find((option) => option.code === formState.category);
  const selectedResourceType = resourceTypes.find((type) => type.code === formState.resourceType);
  const selectedResourceTypeOption = visibleTypeOptions.find((option) => option.code === formState.resourceType);
  const selectedResourceTypeVisible = visibleTypeOptions.some((option) => option.code === formState.resourceType);
  const physicalTypeOptions = buildTypeOptions(resourceTypes, formState.category);
  const physicalModelOptions = buildPhysicalModelOptions(resourceSpecificationOptions, formState.category, formState.resourceType);
  const selectedPhysicalResource = physicalResourceOptions.find((resource) => resource.id === formState.supportingPhysicalResourceId);
  const selectedPlace = placeOptions.find((place) => place.id === formState.placeId);
  const selectedManufacturer = manufacturerOptions.find((party) => party.id === formState.manufacturerPartyId) ?? null;
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [typeMenuOpen]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-modal-title"
        className="max-h-[92vh] w-full max-w-[880px] overflow-auto rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              CRUD de Recursos
            </div>
            <h2 id="resource-modal-title" className="mt-1 font-display text-[1.45rem] font-semibold text-app-text">
              {title}
            </h2>
          </div>
          <button type="button" className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4">
          {tab === 'ResourceSpecification' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                Identificação
              </div>
              <Field label={resourceFieldLabel('category')}>
                <div ref={categoryMenuRef} className="relative">
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={categoryMenuOpen}
                    aria-controls="resource-category-listbox"
                    onClick={() => setCategoryMenuOpen((current) => !current)}
                    className="geo-input geo-combobox flex items-center justify-between gap-3 text-left"
                    disabled={lookupLoading && !resourceCategories.length}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {selectedCategoryOption ? (
                        <>
                          <selectedCategoryOption.icon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                          <span className="truncate">{selectedCategoryOption.label}</span>
                        </>
                      ) : (
                        <span className="text-app-muted">Selecione uma categoria</span>
                      )}
                    </span>
                    <span className="geo-combobox-indicator">
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                  {categoryMenuOpen ? (
                    <div
                      id="resource-category-listbox"
                      role="listbox"
                      className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[18px] border border-app-border bg-white p-2 shadow-modal"
                    >
                      {categoryOptions.map((option) => {
                        const OptionIcon = option.icon;
                        const isSelected = option.code === formState.category;
                        return (
                          <button
                            key={option.code}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={!option.active}
                            onClick={() => {
                              const nextTypeOptions = buildTypeOptions(resourceTypes, option.code);
                              onChange({
                                ...formState,
                                category: option.code,
                                resourceType: nextTypeOptions.some((typeOption) => typeOption.code === formState.resourceType)
                                  ? formState.resourceType
                                  : '',
                              });
                              setTypeMenuOpen(false);
                              setCategoryMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] transition ${
                              isSelected ? 'bg-app-accent-soft text-app-text' : 'text-app-text hover:bg-app-accent-soft'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <OptionIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {!option.active ? <span className="text-[0.72rem] text-app-muted">(inativa)</span> : null}
                          </button>
                        );
                      })}
                      {formState.category && !selectedCategory ? (
                        <button
                          type="button"
                          role="option"
                          aria-selected="true"
                          className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] text-amber-900 transition hover:bg-amber-50"
                          onClick={() => setCategoryMenuOpen(false)}
                        >
                          <FileText className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{formState.category} (legado)</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Field>
              <Field label={resourceFieldLabel('resourceType')}>
                <div ref={typeMenuRef} className="relative">
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={typeMenuOpen}
                    aria-controls="resource-type-listbox"
                    onClick={() => setTypeMenuOpen((current) => !current)}
                    className="geo-input geo-combobox flex items-center justify-between gap-3 text-left"
                    disabled={!formState.category || (lookupLoading && !resourceTypes.length)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {selectedResourceTypeOption ? (
                        <>
                          <selectedResourceTypeOption.icon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                          <span className="truncate">{selectedResourceTypeOption.label}</span>
                        </>
                      ) : (
                        <span className="text-app-muted">Selecione um tipo</span>
                      )}
                    </span>
                    <span className="geo-combobox-indicator">
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                  {typeMenuOpen ? (
                    <div
                      id="resource-type-listbox"
                      role="listbox"
                      className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[18px] border border-app-border bg-white p-2 shadow-modal"
                    >
                      {visibleTypeOptions.map((option) => {
                        const OptionIcon = option.icon;
                        const isSelected = option.code === formState.resourceType;
                        return (
                          <button
                            key={option.code}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={!option.active}
                            onClick={() => {
                              onChange({ ...formState, resourceType: option.code });
                              setTypeMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] transition ${
                              isSelected ? 'bg-app-accent-soft text-app-text' : 'text-app-text hover:bg-app-accent-soft'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <OptionIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {!option.active ? <span className="text-[0.72rem] text-app-muted">(inativo)</span> : null}
                          </button>
                        );
                      })}
                      {formState.resourceType && (!selectedResourceType || !selectedResourceTypeVisible) ? (
                        <button
                          type="button"
                          role="option"
                          aria-selected="true"
                          className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] text-amber-900 transition hover:bg-amber-50"
                          onClick={() => setTypeMenuOpen(false)}
                        >
                          <FileText className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{formState.resourceType} (legado)</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Field>
              <Field label={resourceFieldLabel('manufacturer')}>
                <select
                  value={formState.manufacturerPartyId}
                  onChange={(event) => onChange({ ...formState, manufacturerPartyId: event.target.value })}
                  className="geo-input"
                >
                  <option value="">Selecione um fabricante</option>
                  {manufacturerOptions.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                    </option>
                  ))}
                </select>
                {selectedManufacturer ? (
                  <span className="text-[0.72rem] font-medium normal-case tracking-normal text-app-muted">
                    Selecionado: {selectedManufacturer.name}
                  </span>
                ) : null}
              </Field>
              <Field label={resourceFieldLabel('model')}>
                <input
                  required
                  value={formState.model}
                  onChange={(event) => onChange({ ...formState, model: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('equipmentFunction')}>
                <input
                  value={formState.equipmentFunction}
                  onChange={(event) => onChange({ ...formState, equipmentFunction: event.target.value })}
                  className="geo-input"
                  placeholder="Ex.: Roteador, ONT, OLT"
                />
              </Field>
              <Field label={resourceFieldLabel('equipmentCode')}>
                <input
                  value={formState.equipmentCode}
                  onChange={(event) => onChange({ ...formState, equipmentCode: event.target.value })}
                  className="geo-input"
                  placeholder="Ex.: EQ-OLT-001"
                />
              </Field>
              <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                Comercial e homologação
              </div>
              <Field label={resourceFieldLabel('skuId')}>
                <input
                  value={formState.skuId}
                  onChange={(event) => onChange({ ...formState, skuId: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('homologationDate')}>
                <input
                  type="date"
                  value={formState.homologationDate}
                  onChange={(event) => onChange({ ...formState, homologationDate: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('endOfLifeDate')}>
                <input
                  type="date"
                  value={formState.endOfLifeDate}
                  onChange={(event) => onChange({ ...formState, endOfLifeDate: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <Field label={resourceFieldLabel('endOfSupportLifeDate')}>
                <input
                  type="date"
                  value={formState.endOfSupportLifeDate}
                  onChange={(event) => onChange({ ...formState, endOfSupportLifeDate: event.target.value })}
                  className="geo-input"
                />
              </Field>
              <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                Capacidades e ciclo de vida
              </div>
              <Field label={resourceFieldLabel('stockable')}>
                <select
                  value={formState.stockable}
                  onChange={(event) =>
                    onChange({ ...formState, stockable: event.target.value as ResourceFormState['stockable'] })
                  }
                  className="geo-input"
                >
                  <option value="">Selecione</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
              <Field label={resourceFieldLabel('discontinued')}>
                <select
                  value={formState.discontinued}
                  onChange={(event) =>
                    onChange({ ...formState, discontinued: event.target.value as ResourceFormState['discontinued'] })
                  }
                  className="geo-input"
                >
                  <option value="">Selecione</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
              <Field label={resourceFieldLabel('supportsSdWan')}>
                <select
                  value={formState.supportsSdWan}
                  onChange={(event) =>
                    onChange({ ...formState, supportsSdWan: event.target.value as ResourceFormState['supportsSdWan'] })
                  }
                  className="geo-input"
                >
                  <option value="">Selecione</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
              <Field label={resourceFieldLabel('supportsVoice')}>
                <select
                  value={formState.supportsVoice}
                  onChange={(event) =>
                    onChange({ ...formState, supportsVoice: event.target.value as ResourceFormState['supportsVoice'] })
                  }
                  className="geo-input"
                >
                  <option value="">Selecione</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
              <Field label={resourceFieldLabel('lifecycleStatus')}>
                <select
                  value={formState.lifecycleStatus}
                  onChange={(event) => onChange({ ...formState, lifecycleStatus: event.target.value })}
                  className="geo-input"
                >
                  <option value="">Selecione um status</option>
                  {RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={resourceFieldLabel('description')} fullWidth>
                <textarea
                  value={formState.description}
                  onChange={(event) => onChange({ ...formState, description: event.target.value })}
                  className="min-h-[116px] rounded-[16px] border border-app-border bg-white px-3 py-2 text-[0.9rem] text-app-text shadow-sm"
                />
              </Field>
              {!catalogSelectionValid ? (
                <div className="md:col-span-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-[0.88rem] text-amber-900">
                  Selecione uma categoria e um tipo ativos do catálogo. Valores legados precisam ser remapeados antes de salvar.
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'PhysicalResource' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={resourceFieldLabel('name')}>
                <input required value={formState.name} onChange={(event) => onChange({ ...formState, name: event.target.value })} className="geo-input" />
              </Field>
              <Field label={resourceFieldLabel('category')}>
                <select
                  required
                  value={formState.category}
                  onChange={(event) => {
                    const nextCategory = event.target.value;
                    const nextResourceTypes = buildTypeOptions(resourceTypes, nextCategory);
                    onChange({
                      ...formState,
                      category: nextCategory,
                      resourceType: nextResourceTypes.some((option) => option.code === formState.resourceType) ? formState.resourceType : '',
                      resourceSpecificationId: '',
                    });
                  }}
                  className="geo-input"
                  disabled={lookupLoading && !resourceCategories.length}
                >
                  <option value="">Selecione uma categoria</option>
                  {physicalCategoryOptions.map((option) => (
                    <option key={option.code} value={option.code} disabled={!option.active}>
                      {option.label}{!option.active ? ' (inativa)' : ''}
                    </option>
                  ))}
                </select>
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
                      {option.label}{!option.active ? ' (inativo)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <select
                  required
                  value={formState.resourceSpecificationId}
                  onChange={(event) => {
                    const nextSpecification = resourceSpecificationOptions.find((spec) => spec.id === event.target.value);
                    onChange({
                      ...formState,
                      resourceSpecificationId: event.target.value,
                      category: nextSpecification?.category ?? formState.category,
                      resourceType: nextSpecification?.resourceType ?? formState.resourceType,
                      // Reset manufacturer and model — will be auto-populated by useEffect
                      manufacturer: '',
                      model: '',
                    });
                  }}
                  className="geo-input"
                  disabled={!formState.category || !formState.resourceType || (lookupLoading && !resourceSpecificationOptions.length)}
                >
                  <option value="">Selecione um modelo</option>
                  {physicalModelOptions.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name}
                    </option>
                  ))}
                  {formState.resourceSpecificationId && selectedResourceSpecification && !physicalModelOptions.some((spec) => spec.id === selectedResourceSpecification.id) ? (
                    <option value={selectedResourceSpecification.id}>{selectedResourceSpecification.name}</option>
                  ) : null}
                  {formState.resourceSpecificationId && !selectedResourceSpecification ? (
                    <option value={formState.resourceSpecificationId}>Modelo legado</option>
                  ) : null}
                </select>
              </Field>
              <Field label={resourceFieldLabel('placeId')}>
                <select
                  value={formState.placeId}
                  onChange={(event) => {
                    const nextPlace = placeOptions.find((place) => place.id === event.target.value);
                    onChange({
                      ...formState,
                      placeId: event.target.value,
                      placeType: nextPlace?.referredType ?? '',
                    });
                  }}
                  className="geo-input"
                >
                  <option value="">Sem place</option>
                  {placeOptions.map((place) => (
                    <option key={`${place.referredType}:${place.id}`} value={place.id}>
                      {place.label}
                    </option>
                  ))}
                  {formState.placeId && !selectedPlace ? <option value={formState.placeId}>{formState.placeId}</option> : null}
                </select>
              </Field>
              <Field label={resourceFieldLabel('placeType')}>
                <input value={formState.placeType || selectedPlace?.referredType || '—'} readOnly className="geo-input bg-app-accent-soft text-app-muted" />
              </Field>
              <Field label="status">
                <select value={formState.status} onChange={(event) => onChange({ ...formState, status: event.target.value })} className="geo-input">
                  {['active', 'inactive', 'suspended', 'terminated'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fabricante">
                <input
                  value={formState.manufacturer}
                  readOnly
                  disabled
                  className="geo-input bg-app-accent-soft text-app-muted cursor-not-allowed opacity-60"
                  title="Campo preenchido automaticamente a partir da especificação selecionada"
                />
              </Field>
              <Field label="Modelo físico">
                <input
                  value={formState.model}
                  readOnly
                  disabled
                  className="geo-input bg-app-accent-soft text-app-muted cursor-not-allowed opacity-60"
                  title="Campo preenchido automaticamente a partir da especificação selecionada"
                />
              </Field>
              <Field label="serialNumber">
                <input value={formState.serialNumber} onChange={(event) => onChange({ ...formState, serialNumber: event.target.value })} className="geo-input" />
              </Field>
              <Field label="partNumber">
                <input value={formState.partNumber} onChange={(event) => onChange({ ...formState, partNumber: event.target.value })} className="geo-input" />
              </Field>
            </div>
          ) : null}

          {tab === 'LogicalResource' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={resourceFieldLabel('name')}>
                <input required value={formState.name} onChange={(event) => onChange({ ...formState, name: event.target.value })} className="geo-input" />
              </Field>
              <Field label={resourceFieldLabel('resourceSpecificationName')}>
                <select
                  required
                  value={formState.resourceSpecificationId}
                  onChange={(event) => onChange({ ...formState, resourceSpecificationId: event.target.value })}
                  className="geo-input"
                  disabled={lookupLoading && !resourceSpecificationOptions.length}
                >
                  <option value="">Selecione uma especificacao</option>
                  {resourceSpecificationOptions.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name} · {spec.category} · {spec.resourceType}
                    </option>
                  ))}
                  {formState.resourceSpecificationId && !selectedResourceSpecification ? (
                    <option value={formState.resourceSpecificationId}>{formState.resourceSpecificationId}</option>
                  ) : null}
                </select>
                <span className="text-[0.72rem] font-normal uppercase tracking-[0.05em] text-app-muted">
                  {selectedResourceSpecification
                    ? `${selectedResourceSpecification.name} · ${selectedResourceSpecification.category} · ${selectedResourceSpecification.resourceType}`
                    : 'Lookup TMF634'}
                </span>
              </Field>
              <Field label={resourceFieldLabel('placeId')}>
                <select
                  value={formState.placeId}
                  onChange={(event) => {
                    const nextPlace = placeOptions.find((place) => place.id === event.target.value);
                    onChange({
                      ...formState,
                      placeId: event.target.value,
                      placeType: nextPlace?.referredType ?? '',
                    });
                  }}
                  className="geo-input"
                >
                  <option value="">Sem place</option>
                  {placeOptions.map((place) => (
                    <option key={`${place.referredType}:${place.id}`} value={place.id}>
                      {place.label}
                    </option>
                  ))}
                  {formState.placeId && !selectedPlace ? <option value={formState.placeId}>{formState.placeId}</option> : null}
                </select>
              </Field>
              <Field label={resourceFieldLabel('placeType')}>
                <input value={formState.placeType || selectedPlace?.referredType || '—'} readOnly className="geo-input bg-app-accent-soft text-app-muted" />
              </Field>
              <Field label="status">
                <select value={formState.status} onChange={(event) => onChange({ ...formState, status: event.target.value })} className="geo-input">
                  {['active', 'inactive', 'suspended', 'terminated'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label={resourceFieldLabel('supportingPhysicalResourceName')}>
                <select
                  value={formState.supportingPhysicalResourceId}
                  onChange={(event) => onChange({ ...formState, supportingPhysicalResourceId: event.target.value })}
                  className="geo-input"
                >
                  <option value="">Selecione um recurso fisico</option>
                  {physicalResourceOptions.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name} · {resource.resourceSpecificationId}
                    </option>
                  ))}
                  {formState.supportingPhysicalResourceId && !selectedPhysicalResource ? (
                    <option value={formState.supportingPhysicalResourceId}>{formState.supportingPhysicalResourceId}</option>
                  ) : null}
                </select>
                <span className="text-[0.72rem] font-normal uppercase tracking-[0.05em] text-app-muted">
                  {selectedPhysicalResource ? `${selectedPhysicalResource.name} · ${selectedPhysicalResource.resourceSpecificationId}` : 'Lookup TMF639'}
                </span>
              </Field>
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-3 border-t border-app-border pt-4">
            <button type="button" onClick={onClose} className="geo-btn secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || (tab === 'ResourceSpecification' && !catalogSelectionValid)}
              className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, fullWidth }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return (
    <label className={`grid gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted ${fullWidth ? 'md:col-span-2' : ''}`}>
      {label}
      {children}
    </label>
  );
}

type SpecificationCharacteristicDefinition = {
  name: string;
  field: keyof ResourceFormState;
  valueType: 'string' | 'boolean' | 'date';
  group: string;
};

const SPECIFICATION_CHARACTERISTIC_DEFINITIONS: SpecificationCharacteristicDefinition[] = [
  { name: 'equipmentCode', field: 'equipmentCode', valueType: 'string', group: 'identification' },
  { name: 'equipmentFunction', field: 'equipmentFunction', valueType: 'string', group: 'identification' },
  { name: 'model', field: 'model', valueType: 'string', group: 'commercial' },
  { name: 'skuId', field: 'skuId', valueType: 'string', group: 'commercial' },
  { name: 'stockable', field: 'stockable', valueType: 'boolean', group: 'capability' },
  { name: 'discontinued', field: 'discontinued', valueType: 'boolean', group: 'lifecycle' },
  { name: 'supportsSdWan', field: 'supportsSdWan', valueType: 'boolean', group: 'capability' },
  { name: 'supportsVoice', field: 'supportsVoice', valueType: 'boolean', group: 'capability' },
  { name: 'homologationDate', field: 'homologationDate', valueType: 'date', group: 'commercial' },
  { name: 'endOfLifeDate', field: 'endOfLifeDate', valueType: 'date', group: 'lifecycle' },
  { name: 'endOfSupportLifeDate', field: 'endOfSupportLifeDate', valueType: 'date', group: 'lifecycle' },
  { name: 'lifecycleStatus', field: 'lifecycleStatus', valueType: 'string', group: 'lifecycle' },
];

function buildSpecificationPayload(
  state: ResourceFormState,
  existing?: ResourceSpecification | null,
  manufacturerOptions: Party[] = [],
): ResourceSpecificationPayload {
  const existingManufacturerParty = existing?.relatedParty?.find((party) => party.role === 'manufacturer');
  const manufacturerParty = resolveManufacturerParty(state, manufacturerOptions) ?? existingManufacturerParty;
  const relatedParty = (existing?.relatedParty ?? []).filter((party) => party.role !== 'manufacturer');
  if (manufacturerParty) {
    relatedParty.push({
      id: manufacturerParty.id,
      '@referredType': 'partyType' in manufacturerParty ? manufacturerParty.partyType : manufacturerParty['@referredType'],
      role: 'manufacturer',
      name: manufacturerParty.name,
    });
  }

  const resourceSpecificationCharacteristic = mergeSpecificationCharacteristics(existing?.resourceSpecificationCharacteristic ?? [], state);
  const modelName = normalizeCatalogText(state.model) || normalizeCatalogText(state.name);
  if (manufacturerParty) {
    const filtered = resourceSpecificationCharacteristic.filter((item) => item.name !== 'manufacturer');
    return {
      name: modelName,
      category: state.category.trim(),
      resourceType: state.resourceType.trim(),
      description: state.description.trim(),
      relatedParty,
      resourceSpecificationCharacteristic: filtered,
    };
  }

  return {
    name: modelName,
    category: state.category.trim(),
    resourceType: state.resourceType.trim(),
    description: state.description.trim(),
    relatedParty,
    resourceSpecificationCharacteristic,
  };
}

function buildPhysicalPayload(state: ResourceFormState): PhysicalResourcePayload {
  return {
    name: state.name.trim(),
    resourceSpecificationId: state.resourceSpecificationId.trim(),
    placeId: state.placeId.trim(),
    placeType: state.placeType.trim(),
    status: state.status as PhysicalResource['status'],
    manufacturer: state.manufacturer.trim(),
    model: normalizeCatalogText(state.model),
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

function mergeSpecificationCharacteristics(
  existing: ResourceSpecificationCharacteristic[],
  state: ResourceFormState,
): ResourceSpecificationCharacteristic[] {
  const merged = new Map(existing.map((item) => [item.name, { ...item }] as const));

  for (const definition of SPECIFICATION_CHARACTERISTIC_DEFINITIONS) {
    const value = state[definition.field];
    if (definition.valueType === 'boolean') {
      const normalized = characteristicBooleanValue(value as '' | 'true' | 'false');
      if (normalized === undefined) merged.delete(definition.name);
      else {
        merged.set(definition.name, {
          name: definition.name,
          value: normalized,
          valueType: 'boolean',
          group: definition.group,
        });
      }
      continue;
    }

    const text = definition.name === 'model' ? normalizeCatalogText(String(value ?? '')) : String(value ?? '').trim();
    if (!text) {
      merged.delete(definition.name);
      continue;
    }

    merged.set(definition.name, {
      name: definition.name,
      value: text,
      valueType: definition.valueType,
      group: definition.group,
    });
  }

  return [...merged.values()];
}

function resolveManufacturerParty(state: ResourceFormState, options: Party[]): Party | undefined {
  if (state.manufacturerPartyId) {
    const selected = options.find((party) => party.id === state.manufacturerPartyId);
    if (selected) return selected;
  }
  return undefined;
}

function readSpecCharacteristic(characteristics: ResourceSpecificationCharacteristic[] | undefined, name: string): string {
  const item = characteristics?.find((characteristic) => characteristic.name === name);
  if (!item || item.value === undefined || item.value === null) return '-';
  return typeof item.value === 'string' ? item.value : String(item.value);
}

function readSpecificationManufacturer(spec: ResourceSpecification | null | undefined): string {
  if (!spec) return '-';
  const manufacturerParty = spec.relatedParty?.find((party) => party.role === 'manufacturer');
  if (manufacturerParty?.name) return manufacturerParty.name;
  return readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'manufacturer');
}

function readSpecificationModel(spec: ResourceSpecification | null | undefined): string {
  if (!spec) return '-';
  const model = readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'model');
  if (model !== '-') return model;
  return spec.name || '-';
}

function readSpecLifecycleStatus(characteristics: ResourceSpecificationCharacteristic[] | undefined): string {
  const value = readSpecCharacteristic(characteristics, 'lifecycleStatus');
  if (value === '-') return value;
  return readResourceSpecificationStatusLabel(value);
}

function readResourceCategoryLabel(categories: ResourceCategory[], categoryCode: string): string {
  return categories.find((category) => category.code === categoryCode)?.name ?? categoryCode;
}

function readResourceTypeCode(types: ResourceType[], resourceTypeCode: string): string {
  return types.find((type) => type.code === resourceTypeCode)?.code ?? resourceTypeCode;
}

function readResourceSpecificationName(specifications: ResourceSpecification[], specificationId: string): string {
  return specifications.find((spec) => spec.id === specificationId)?.name ?? specificationId;
}

function readResourceSpecificationType(specifications: ResourceSpecification[], specificationId: string): string {
  return specifications.find((spec) => spec.id === specificationId)?.resourceType ?? specificationId;
}

function isPhysicalResource(entity: ResourceEntity | ResourceSpecification | null): entity is PhysicalResource {
  return Boolean(entity && entity['@type'] === 'PhysicalResource');
}

function isLogicalResource(entity: ResourceEntity | ResourceSpecification | null): entity is LogicalResource {
  return Boolean(entity && entity['@type'] === 'LogicalResource');
}

function physicalDetails(resource: PhysicalResource): string {
  return [resource.manufacturer, resource.model, resource.serialNumber, resource.partNumber]
    .filter(Boolean)
    .join(' · ') || '-';
}

function logicalDetails(resource: LogicalResource): string {
  return resource.supportingPhysicalResourceId ?? '-';
}

async function loadAllResourceSpecifications(): Promise<ResourceSpecification[]> {
  const collected: ResourceSpecification[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const items = await listResourceSpecifications({ limit: PAGE_SIZE, offset });
    collected.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return collected;
}

async function loadManufacturerCandidates(): Promise<Party[]> {
  const fromRoles = await loadManufacturerCandidatesFromRoles();
  if (fromRoles.length > 0) {
    return fromRoles;
  }

  const fromParties = await loadManufacturerCandidatesFromParties();
  return fromParties;
}

function isManufacturerParty(party: Party): boolean {
  return party.partyType === 'Organization' && MANUFACTURER_PARTY_NAMES.has(party.name.trim().toUpperCase());
}

async function loadManufacturerCandidatesFromRoles(): Promise<Party[]> {
  const collected: Party[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const items = await listPartyRoles({ limit: PAGE_SIZE, offset, status: 'active', name: 'manufacturer' });
    for (const role of items) {
      const party = role.party;
      if (!party || party['@referredType'] !== 'Organization') continue;
      collected.push({
        '@type': 'Organization',
        id: party.id,
        href: party.href ?? `/tmf-api/partyManagement/v4/party/${party.id}`,
        name: party.name ?? party.id,
        status: 'active',
        partyType: 'Organization',
      });
    }
    if (items.length < PAGE_SIZE) break;
  }

  return normalizeManufacturerParties(collected);
}

async function loadManufacturerCandidatesFromParties(): Promise<Party[]> {
  const collected: Party[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const items = await listParties({ limit: PAGE_SIZE, offset, status: 'active', partyType: 'Organization' });
    for (const party of items) {
      if (!isManufacturerParty(party)) continue;
      collected.push({
        '@type': 'Organization',
        id: party.id,
        href: party.href ?? `/tmf-api/partyManagement/v4/party/${party.id}`,
        name: party.name,
        status: 'active',
        partyType: 'Organization',
      });
    }
    if (items.length < PAGE_SIZE) break;
  }

  return normalizeManufacturerParties(collected);
}

function normalizeManufacturerParties(parties: Party[]): Party[] {
  return [...new Map(parties.map((party) => [party.id, party] as const)).values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function loadAllResources(kind: Exclude<ResourceTabId, 'ResourceSpecification'>): Promise<ResourceEntity[]> {
  const collected: ResourceEntity[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const items = await listResources({ kind, limit: PAGE_SIZE, offset, status: 'active' });
    collected.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return collected;
}

function buildPlaceOptions(resources: ResourceEntity[]): PlaceOption[] {
  const options = new Map<string, PlaceOption>();
  for (const resource of resources) {
    const place = resource.place;
    if (!place) continue;
    const key = `${place['@referredType']}::${place.id}`;
    if (!options.has(key)) {
      options.set(key, {
        id: place.id,
        referredType: place['@referredType'],
        label: `${place.id} · ${place['@referredType']}`,
      });
    }
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildCategoryOptions(categories: ResourceCategory[]): CatalogOption[] {
  const byCode = new Map(categories.map((category) => [category.code, category] as const));
  const childrenByParent = new Map<string | undefined, ResourceCategory[]>();
  for (const category of categories) {
    const parentKey = category.parentCategoryCode;
    const current = childrenByParent.get(parentKey) ?? [];
    current.push(category);
    childrenByParent.set(parentKey, current);
  }

  const labelCache = new Map<string, string>();
  const resolveLabel = (category: ResourceCategory): string => {
    const cached = labelCache.get(category.code);
    if (cached) return cached;
    const parent = category.parentCategoryCode ? byCode.get(category.parentCategoryCode) : undefined;
    const label = parent ? `${resolveLabel(parent)} / ${category.name}` : category.name;
    labelCache.set(category.code, label);
    return label;
  };

  const visit = (parentCode: string | undefined, depth: number, acc: CatalogOption[]): void => {
    const children = (childrenByParent.get(parentCode) ?? []).slice().sort((left, right) => left.code.localeCompare(right.code));
    for (const category of children) {
      acc.push({
        code: category.code,
        label: `${'  '.repeat(depth)}${resolveLabel(category)}`,
        active: category.status === 'active',
        icon: categoryIconForCode(category.code),
      });
      visit(category.code, depth + 1, acc);
    }
  };

  const options: CatalogOption[] = [];
  visit(undefined, 0, options);
  return options;
}

function buildPhysicalCategoryOptions(categories: ResourceCategory[]): CatalogOption[] {
  return buildCategoryOptions(categories.filter((category) => isPhysicalCategoryCode(category.code)));
}

function buildPhysicalModelOptions(
  resourceSpecifications: ResourceSpecification[],
  categoryCode: string,
  resourceTypeCode: string,
): ResourceSpecification[] {
  return resourceSpecifications
    .filter((spec) => isPhysicalCategoryCode(spec.category))
    .filter((spec) => !categoryCode || spec.category === categoryCode)
    .filter((spec) => !resourceTypeCode || spec.resourceType === resourceTypeCode)
    .sort((left, right) => {
      const categoryOrder = left.category.localeCompare(right.category);
      if (categoryOrder !== 0) return categoryOrder;
      const typeOrder = left.resourceType.localeCompare(right.resourceType);
      if (typeOrder !== 0) return typeOrder;
      return left.name.localeCompare(right.name);
    });
}

function isPhysicalCategoryCode(categoryCode: string): boolean {
  return !categoryCode.startsWith('Logical');
}

function categoryIconForCode(categoryCode: string): LucideIcon {
  switch (categoryCode) {
    case 'Equipment':
      return Server;
    case 'Equipment.Access':
      return Cpu;
    case 'Equipment.Transport':
      return Network;
    case 'Equipment.CustomerPremises':
      return Home;
    case 'Infrastructure':
      return Package;
    case 'Infrastructure.Passive':
      return Cable;
    case 'Infrastructure.Delivery':
      return Package;
    case 'Cable':
      return Cable;
    case 'Cable.OutsidePlant':
      return Cable;
    case 'Cable.InsidePlant':
      return Cable;
    case 'Logical':
      return Globe2;
    case 'Logical.IPAM':
      return Globe2;
    case 'Logical.L2':
      return Link2;
    case 'Logical.L3':
      return Shield;
    default:
      return FileText;
  }
}

function buildTypeOptions(types: ResourceType[], categoryCode: string): CatalogOption[] {
  return types
    .filter((type) => type.categoryCode === categoryCode)
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((type) => ({
      code: type.code,
      label: `${type.name} · ${type.code}`,
      active: type.status === 'active',
      icon: resourceTypeIconForCode(type.code),
    }));
}

function resourceTypeIconForCode(typeCode: string): LucideIcon {
  switch (typeCode) {
    case 'OLT':
      return Server;
    case 'ONT':
      return Home;
    case 'CPE':
      return Home;
    case 'Router':
      return Network;
    case 'Switch':
      return Network;
    case 'Rack':
      return Package;
    case 'Card':
      return Cpu;
    case 'Port':
      return Link2;
    case 'PowerSupply':
      return Shield;
    case 'Splitter':
      return Cable;
    case 'CTO':
      return Package;
    case 'DIO':
      return Cable;
    case 'Duct':
      return Cable;
    case 'Pole':
      return FileText;
    case 'Manhole':
      return Package;
    case 'Fiber':
      return Cable;
    case 'DropCable':
      return Cable;
    case 'DistributionCable':
      return Cable;
    case 'BackboneCable':
      return Cable;
    case 'PatchCord':
      return Cable;
    case 'Jumper':
      return Cable;
    case 'IPAddress':
      return Globe2;
    case 'Prefix':
      return Globe2;
    case 'VLAN':
      return Link2;
    case 'VLANGroup':
      return Link2;
    case 'VRF':
      return Shield;
    case 'ASN':
      return Shield;
    case 'RouteTarget':
      return Shield;
    default:
      return FileText;
  }
}

function normalizeCatalogText(value: string): string {
  return value.trim().replace(/^[-\s]+/, '');
}
