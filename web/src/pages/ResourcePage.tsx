import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Cable,
  ChevronDown,
  Cpu,
  FileText,
  Filter,
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
  loadResourceWorkspaceSnapshot,
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
import type { Party } from '../services/partyApi';
import { useGeoDirectory } from '../hooks/useGeoDirectory';
import { PlaceLabelCompact } from '../components/PlaceLabel';
import { PlacePicker } from '../components/PlacePicker';
import ColumnFilterMenu from '../components/ColumnFilterMenu';
import Field from '../components/Field';
import { resourceFieldLabel } from '../utils/resourceFieldLabels';
import {
  DEFAULT_RESOURCE_CATEGORY_CODE,
  RESOURCE_VIEWS,
  type ResourceView,
} from '../data/resourceCategoryViews';
import {
  characteristicBooleanValue,
  RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS,
  readResourceSpecificationCharacteristicBooleanState,
  readResourceSpecificationCharacteristicString,
  readResourceSpecificationStatusLabel,
  type ResourceSpecificationCharacteristic,
} from '../utils/resourceSpecificationCharacteristics';

const PAGE_SIZE = 20;
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

// Colunas cujo domínio é um conjunto fechado de valores de sistema (não texto livre) e que, por
// isso, ganham filtro por picklist no cabeçalho. Datas, nomes e modelos ficam de fora.
const FILTERABLE_COLUMNS: Record<ResourceTabId, string[]> = {
  PhysicalResource: ['spec', 'resourceType', 'status'],
  LogicalResource: ['spec', 'status'],
  ResourceSpecification: ['resourceType', 'manufacturer', 'lifecycleStatus', 'equipmentFunction'],
};

type OpenFilterState = { key: string; rect: DOMRect };

interface ResourcePageProps {
  category?: string;
}

export default function ResourcePage({ category: categoryProp }: ResourcePageProps = {}) {
  const category = categoryProp ?? DEFAULT_RESOURCE_CATEGORY_CODE;
  const isPhysicalCategory = isPhysicalCategoryCode(category);
  const [view, setView] = useState<ResourceView>('inventory');
  const effectiveTab: ResourceTabId =
    view === 'catalog' ? 'ResourceSpecification' : isPhysicalCategory ? 'PhysicalResource' : 'LogicalResource';

  const [page, setPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<OpenFilterState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
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

  // Carregar diretório Geo para resolução de rótulos de locais
  const { directory: geoDirectory } = useGeoDirectory();

  const activeTabConfig = tabConfig[effectiveTab];
  const activeColumns = activeTabConfig.buildColumns();
  const categoryName = resourceCategories.find((item) => item.code === category)?.name ?? category;
  const CategoryIcon = categoryIconForCode(category);

  const specCategoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const spec of resourceSpecificationOptions) map.set(spec.id, spec.category);
    return map;
  }, [resourceSpecificationOptions]);

  // The workspace snapshot already ships the full resource/spec arrays, so we filter and paginate
  // by the active category client-side instead of relying on the server-paginated `items`.
  const categoryItems = useMemo<Array<ResourceEntity | ResourceSpecification>>(() => {
    if (view === 'catalog') {
      return resourceSpecificationOptions.filter((spec) => spec.category === category);
    }
    const pool: ResourceEntity[] = isPhysicalCategory ? physicalResourceOptions : logicalResourceOptions;
    return pool.filter((resource) => {
      const specId = resource.resourceSpecification?.id ?? resource.resourceSpecificationId;
      return specCategoryById.get(specId) === category;
    });
  }, [
    view,
    category,
    isPhysicalCategory,
    resourceSpecificationOptions,
    physicalResourceOptions,
    logicalResourceOptions,
    specCategoryById,
  ]);

  // Valor exibido de uma coluna para um item — usado tanto para montar o domínio do filtro quanto
  // para aplicá-lo, garantindo que o filtro casa exatamente com o texto renderizado na célula.
  const filterableColumns = FILTERABLE_COLUMNS[effectiveTab];
  const columnValueFor = (item: ResourceEntity | ResourceSpecification, key: string): string => {
    if (effectiveTab === 'ResourceSpecification') {
      const spec = item as ResourceSpecification;
      switch (key) {
        case 'resourceType':
          return readResourceTypeCode(resourceTypes, spec.resourceType);
        case 'manufacturer':
          return readSpecificationManufacturer(spec);
        case 'lifecycleStatus':
          return readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic);
        case 'equipmentFunction':
          return readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'equipmentFunction');
        default:
          return '-';
      }
    }
    const resourceItem = item as ResourceEntity;
    const specId = resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId;
    switch (key) {
      case 'spec':
        return readResourceSpecificationName(resourceSpecificationOptions, specId);
      case 'resourceType':
        return readResourceSpecificationType(resourceSpecificationOptions, specId);
      case 'status':
        return resourceItem.status ?? '-';
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
    // columnValueFor deriva de effectiveTab + catálogos, cobertos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryItems, columnFilters, effectiveTab, resourceTypes, resourceSpecificationOptions]);

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

  const selectedCategory = resourceCategories.find((item) => item.code === formState.category);
  const visibleTypeOptions = buildTypeOptions(resourceTypes, formState.category);
  const selectedResourceType = resourceTypes.find((type) => type.code === formState.resourceType);
  const categorySelectionInvalid = Boolean(formState.category && (!selectedCategory || selectedCategory.status !== 'active'));
  const resourceTypeSelectionInvalid = Boolean(
    formState.resourceType &&
      (!selectedResourceType || selectedResourceType.status !== 'active' || selectedResourceType.categoryCode !== formState.category),
  );
  const catalogRequiredFieldsValid =
    modalState?.tab !== 'ResourceSpecification' ||
    (formState.category.trim().length > 0 && formState.resourceType.trim().length > 0 && formState.model.trim().length > 0);
  const catalogSelectionValid =
    !(
      modalState?.tab === 'ResourceSpecification' &&
      (categorySelectionInvalid ||
        resourceTypeSelectionInvalid ||
        (Boolean(formState.category) &&
          Boolean(formState.resourceType) &&
          !visibleTypeOptions.some((option) => option.code === formState.resourceType)))
    );
  const catalogSubmitValid = catalogRequiredFieldsValid && catalogSelectionValid;
  const selectedOnPage = pageItems.filter((item) => selectedIds.has(item.id));
  const pageSelectionCount = selectedOnPage.length;
  const selectedCount = selectedIds.size;
  const selectedDeletePreview = selectedOnPage.slice(0, 3).map((item) => item.name).join(', ');

  const loadWorkspaceData = async (tab: ResourceTabId): Promise<void> => {
    setIsLoading(true);
    setLookupLoading(true);
    setError(null);
    try {
      const snapshot = await loadResourceWorkspaceSnapshot({ tab, limit: PAGE_SIZE, offset: 0 });

      setResourceSpecificationOptions(snapshot.resourceSpecificationOptions);
      setResourceCategories(snapshot.resourceCategories);
      setResourceTypes(snapshot.resourceTypes);
      setPhysicalResourceOptions(snapshot.physicalResources.filter(isPhysicalResource));
      setLogicalResourceOptions(snapshot.logicalResources.filter(isLogicalResource));
      setManufacturerOptions(snapshot.manufacturerOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Resource.');
    } finally {
      setIsLoading(false);
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspaceData(effectiveTab);
  }, [effectiveTab]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = pageSelectionCount > 0 && pageSelectionCount < pageItems.length;
  }, [pageItems.length, pageSelectionCount]);

  // Category or sub-view changes reset the local pagination/selection/filter scope.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    setColumnFilters({});
    setOpenFilter(null);
  }, [category, view]);

  // Any change to the active filters returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [columnFilters]);

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
        // The category is fixed by the active page; new specs inherit it, edits keep their own.
        category: entity?.category ?? category,
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
      // Physical resources scope their catalog lookups by category; default to the active page category.
      category: isPhysicalResource(entity) ? resourceSpecification?.category ?? category : category,
      resourceType: isPhysicalResource(entity) ? resourceSpecification?.resourceType ?? '' : '',
      placeId: entity?.place?.id ?? '',
      placeType: entity?.place?.['@referredType'] ?? '',
      status: entity?.status ?? 'active',
      model: isPhysicalResource(entity) ? entity.model ?? '' : '',
      serialNumber: isPhysicalResource(entity) ? entity.serialNumber ?? '' : '',
      partNumber: isPhysicalResource(entity) ? entity.partNumber ?? '' : '',
      supportingPhysicalResourceId: isLogicalResource(entity) ? entity.supportingPhysicalResourceId ?? '' : '',
    });
  }, [modalState, manufacturerOptions, category]);

  useEffect(() => {
    if (!modalState || modalState.mode !== 'create') return;
    if (modalState.tab !== 'LogicalResource') return;
    const firstCategorySpecId = resourceSpecificationOptions.find((spec) => spec.category === category)?.id ?? '';
    setFormState((current) => {
      const nextResourceSpecificationId = current.resourceSpecificationId || firstCategorySpecId;
      if (nextResourceSpecificationId === current.resourceSpecificationId) return current;
      return { ...current, resourceSpecificationId: nextResourceSpecificationId };
    });
  }, [modalState, resourceSpecificationOptions, category]);

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

  const openEditModal = (entity: ResourceEntity | ResourceSpecification) => {
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
    await loadWorkspaceData(effectiveTab);
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
        if (effectiveTab === 'ResourceSpecification') await deleteResourceSpecification(id);
        else await deleteResource(id);
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

  const rows =
    effectiveTab === 'ResourceSpecification'
      ? (pageItems as ResourceSpecification[]).map((spec) => (
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
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readResourceTypeCode(resourceTypes, spec.resourceType)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecificationManufacturer(spec)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecificationModel(spec)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecLifecycleStatus(spec.resourceSpecificationCharacteristic)}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'equipmentFunction')}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'endOfLifeDate')}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{readSpecCharacteristic(spec.resourceSpecificationCharacteristic, 'endOfSupportLifeDate')}</td>
          </tr>
        ))
      : (pageItems as ResourceEntity[]).map((resourceItem) => (
          <tr
            key={resourceItem.id}
            className="cursor-pointer border-b border-app-border last:border-b-0 hover:bg-app-accent-soft"
            onClick={() => openEditModal(resourceItem)}
          >
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
              {readResourceSpecificationName(resourceSpecificationOptions, resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId)}
            </td>
            {effectiveTab === 'PhysicalResource' ? (
              <td className="px-4 py-3 text-[0.88rem] text-app-muted">
                {readResourceSpecificationType(resourceSpecificationOptions, resourceItem.resourceSpecification?.id ?? resourceItem.resourceSpecificationId)}
              </td>
            ) : null}
            <td className="px-4 py-3 text-[0.88rem] text-app-muted"><PlaceLabelCompact place={resourceItem.place} directory={geoDirectory} /></td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">{resourceItem.status ?? '-'}</td>
            <td className="px-4 py-3 text-[0.88rem] text-app-muted">
              {effectiveTab === 'PhysicalResource'
                ? physicalDetails(resourceItem as PhysicalResource)
                : logicalDetails(resourceItem as LogicalResource)}
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
              <h1 className="font-display text-4xl font-semibold text-app-text">
                {categoryName}
              </h1>
            </div>
            <p className="mt-2 max-w-[820px] text-[0.96rem] text-app-muted">
              {activeTabConfig.description}
            </p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2">
            <div
              role="tablist"
              aria-label="Visão do recurso"
              className="mr-1 inline-flex items-center gap-1 rounded-[16px] border border-app-border bg-white p-1 shadow-soft"
            >
              {RESOURCE_VIEWS.map((viewOption) => {
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
        <ResourceModal
          tab={modalState.tab}
          mode={modalState.mode}
          category={category}
          formState={formState}
          resourceTypes={resourceTypes}
          resourceSpecificationOptions={resourceSpecificationOptions}
          manufacturerOptions={manufacturerOptions}
          physicalResourceOptions={physicalResourceOptions}
          geoDirectory={geoDirectory}
          lookupLoading={lookupLoading}
          saving={saving}
          catalogSelectionValid={catalogSelectionValid}
          catalogSubmitValid={catalogSubmitValid}
          onClose={closeModal}
          onChange={setFormState}
          onSubmit={submitModal}
        />
      ) : null}

      {deleteConfirmOpen ? createPortal(
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
        </div>,
        document.body
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
  category,
  formState,
  resourceTypes,
  resourceSpecificationOptions,
  manufacturerOptions,
  physicalResourceOptions,
  geoDirectory,
  lookupLoading,
  saving,
  catalogSelectionValid,
  catalogSubmitValid,
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
  manufacturerOptions: Party[];
  physicalResourceOptions: PhysicalResource[];
  geoDirectory: ReturnType<typeof useGeoDirectory>['directory'] | null;
  lookupLoading: boolean;
  saving: boolean;
  catalogSelectionValid: boolean;
  catalogSubmitValid: boolean;
  onClose: () => void;
  onChange: (next: ResourceFormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  // The active page already establishes the category, so the modal never asks for it again —
  // it just scopes the type/model/spec options to `category`.
  const title =
    tab === 'ResourceSpecification'
      ? `${mode === 'create' ? 'Criar' : 'Editar'} Modelo de Recurso`
      : `${mode === 'create' ? 'Criar' : 'Editar'} ${tabConfig[tab].title}`;
  const visibleTypeOptions = buildTypeOptions(resourceTypes, category);
  const selectedResourceSpecification = resourceSpecificationOptions.find((spec) => spec.id === formState.resourceSpecificationId);
  const selectedResourceType = resourceTypes.find((type) => type.code === formState.resourceType);
  const selectedResourceTypeOption = visibleTypeOptions.find((option) => option.code === formState.resourceType);
  const selectedResourceTypeVisible = visibleTypeOptions.some((option) => option.code === formState.resourceType);
  const physicalTypeOptions = visibleTypeOptions;
  const physicalModelOptions = buildPhysicalModelOptions(resourceSpecificationOptions, category, formState.resourceType);
  const logicalSpecificationOptions = resourceSpecificationOptions.filter((spec) => spec.category === category);
  const selectedPhysicalResource = physicalResourceOptions.find((resource) => resource.id === formState.supportingPhysicalResourceId);
  const selectedManufacturer = manufacturerOptions.find((party) => party.id === formState.manufacturerPartyId) ?? null;
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
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
                <PlacePicker
                  value={formState.placeId ? { id: formState.placeId, '@referredType': formState.placeType || 'GeographicSite' } : null}
                  onChange={(place) => {
                    onChange({
                      ...formState,
                      placeId: place?.id ?? '',
                      placeType: place?.['@referredType'] ?? '',
                    });
                  }}
                  directory={geoDirectory}
                  placeholder="Selecione um local…"
                />
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
                  {logicalSpecificationOptions.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.name} · {spec.resourceType}
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
                <PlacePicker
                  value={formState.placeId ? { id: formState.placeId, '@referredType': formState.placeType || 'GeographicSite' } : null}
                  onChange={(place) => {
                    onChange({
                      ...formState,
                      placeId: place?.id ?? '',
                      placeType: place?.['@referredType'] ?? '',
                    });
                  }}
                  directory={geoDirectory}
                  placeholder="Selecione um local…"
                />
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
              disabled={saving || (tab === 'ResourceSpecification' && !catalogSubmitValid)}
              className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
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
