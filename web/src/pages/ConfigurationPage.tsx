import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  FolderTree,
  HardHat,
  MapPinned,
  Network,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createProjectStatusCatalogItem,
  deactivateProjectStatusCatalogItem,
  listProjectStatusCatalog,
  updateProjectStatusCatalogItem,
  type GeoProjectStatusBehavior,
  type GeoProjectStatusCatalogItem,
} from '../services/geoProjectApi';
import {
  createParty,
  createPartyRole,
  deletePartyRole,
  listPartyRoles,
  updateParty,
  updatePartyRole,
  type PartyRole,
} from '../services/partyApi';
import {
  deleteJson,
  listGeoSiteSpecifications,
  patchJson,
  postJson,
  type GeoSpec,
} from '../services/geoApi';
import {
  siteRoleLabel,
  siteSpecCategoryLabel,
  siteSpecLabel,
  SITE_ROLE_OPTIONS,
} from '../utils/geoLabels';
import Field from '../components/Field';
import { ResourceCatalogTab } from './config-tabs/ResourceCatalogTab';
import { ServiceCatalogTab } from './config-tabs/ServiceCatalogTab';
import { SortableHeader, sortedBy, useSort } from './config-tabs/sortable';

const behaviors: Array<{ value: GeoProjectStatusBehavior; label: string }> = [
  { value: 'planning', label: 'Planejamento' },
  { value: 'execution', label: 'Execução' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'close-release', label: 'Encerrar e liberar' },
];

// Mesmo papel usado pelo combo "Fabricante" do módulo de Recursos (ver loadAllManufacturerOptions
// em src/shared/http/app.ts) — este catálogo edita o mesmo cadastro de fornecedores/fabricantes.
const SUPPLIER_ROLE_NAME = 'manufacturer';

const supplierStatusLabel: Record<PartyRole['status'], string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  terminated: 'Encerrado',
};

const supplierCnpj = (role: PartyRole): string => {
  const characteristic = role.partyRoleCharacteristic?.find((item) => item.name === 'cnpj');
  return typeof characteristic?.value === 'string' ? characteristic.value : '';
};

type ConfigTab =
  | 'projects'
  | 'suppliers'
  | 'sites'
  | 'resourcesCivil'
  | 'resourcesNetwork'
  | 'services';

type SiteTypeDraft = {
  code: string;
  name: string;
  siteRole: GeoSpec['siteRole'];
  allowedChildSpecIds: string[];
};

type ProjectStatusDraft = {
  code: string;
  name: string;
  behavior: GeoProjectStatusBehavior;
  sortOrder: number;
  active: boolean;
};

type SupplierDraft = { name: string; cnpj: string };

const tabs: Array<{ id: ConfigTab; label: string; icon: LucideIcon }> = [
  { id: 'projects', label: 'Projetos', icon: FolderTree },
  { id: 'sites', label: 'Locais', icon: MapPinned },
  { id: 'resourcesCivil', label: 'Infraestrutura Civil', icon: HardHat },
  { id: 'resourcesNetwork', label: 'Recursos de Rede', icon: Network },
  { id: 'services', label: 'Serviços', icon: Briefcase },
  { id: 'suppliers', label: 'Fornecedores', icon: Truck },
];

export function ConfigurationPage() {
  const [tab, setTab] = useState<ConfigTab>('projects');

  const emptyProjectStatusDraft = (): ProjectStatusDraft => ({
    code: '',
    name: '',
    behavior: 'planning',
    sortOrder: 100,
    active: true,
  });

  const [items, setItems] = useState<GeoProjectStatusCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectModal, setProjectModal] = useState<{
    mode: 'create' | 'edit';
    item: GeoProjectStatusCatalogItem | null;
  } | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectStatusDraft>(emptyProjectStatusDraft());

  const [projectSort, onProjectSort] = useSort<'code' | 'name' | 'behavior' | 'sortOrder' | 'active'>();
  const sortedItems = useMemo(
    () =>
      sortedBy(items, projectSort, (item, key) => {
        switch (key) {
          case 'code':
            return item.code;
          case 'name':
            return item.name;
          case 'behavior':
            return behaviors.find((behavior) => behavior.value === item.behavior)?.label ?? item.behavior;
          case 'sortOrder':
            return item.sortOrder;
          case 'active':
            return item.active ? 1 : 0;
          default:
            return '';
        }
      }),
    [items, projectSort],
  );

  const reload = () => {
    setLoading(true);
    void listProjectStatusCatalog()
      .then(setItems)
      .catch(() => setError('Não foi possível carregar os status.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const openCreateProjectStatus = () => {
    setProjectDraft(emptyProjectStatusDraft());
    setProjectModal({ mode: 'create', item: null });
    setError(null);
  };

  const openEditProjectStatus = (item: GeoProjectStatusCatalogItem) => {
    setProjectDraft({
      code: item.code,
      name: item.name,
      behavior: item.behavior,
      sortOrder: item.sortOrder,
      active: item.active,
    });
    setProjectModal({ mode: 'edit', item });
    setError(null);
  };

  const closeProjectModal = () => {
    if (projectSaving) return;
    setProjectModal(null);
  };

  const submitProjectModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectModal || !projectDraft.code.trim() || !projectDraft.name.trim()) return;
    setProjectSaving(true);
    setError(null);
    try {
      if (projectModal.mode === 'create') {
        await createProjectStatusCatalogItem({
          code: projectDraft.code.trim(),
          name: projectDraft.name.trim(),
          sortOrder: projectDraft.sortOrder,
          behavior: projectDraft.behavior,
          active: true,
        });
      } else if (projectModal.item) {
        await updateProjectStatusCatalogItem(projectModal.item.code, {
          name: projectDraft.name.trim(),
          sortOrder: projectDraft.sortOrder,
          behavior: projectDraft.behavior,
          active: projectDraft.active,
        });
      }
      setProjectModal(null);
      reload();
    } catch {
      setError(
        projectModal.mode === 'create'
          ? 'Não foi possível criar o status. O código deve ser único.'
          : 'Não foi possível salvar o status.',
      );
    } finally {
      setProjectSaving(false);
    }
  };

  const emptySupplierDraft = (): SupplierDraft => ({ name: '', cnpj: '' });

  const [suppliers, setSuppliers] = useState<PartyRole[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierModal, setSupplierModal] = useState<{
    mode: 'create' | 'edit';
    role: PartyRole | null;
  } | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>(emptySupplierDraft());

  const [supplierSort, onSupplierSort] = useSort<'name' | 'cnpj' | 'status'>();
  const sortedSuppliers = useMemo(
    () =>
      sortedBy(suppliers, supplierSort, (role, key) => {
        switch (key) {
          case 'name':
            return role.party.name ?? '';
          case 'cnpj':
            return supplierCnpj(role);
          case 'status':
            return supplierStatusLabel[role.status];
          default:
            return '';
        }
      }),
    [suppliers, supplierSort],
  );

  const reloadSuppliers = () => {
    setSuppliersLoading(true);
    void listPartyRoles({ name: SUPPLIER_ROLE_NAME, limit: 200, offset: 0 })
      .then(setSuppliers)
      .catch(() => setSuppliersError('Não foi possível carregar os fornecedores.'))
      .finally(() => setSuppliersLoading(false));
  };
  useEffect(reloadSuppliers, []);

  const openCreateSupplier = () => {
    setSupplierDraft(emptySupplierDraft());
    setSupplierModal({ mode: 'create', role: null });
    setSuppliersError(null);
  };

  const openEditSupplier = (role: PartyRole) => {
    setSupplierDraft({ name: role.party.name ?? '', cnpj: supplierCnpj(role) });
    setSupplierModal({ mode: 'edit', role });
    setSuppliersError(null);
  };

  const closeSupplierModal = () => {
    if (supplierSaving) return;
    setSupplierModal(null);
  };

  const submitSupplierModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplierModal || !supplierDraft.name.trim()) return;
    setSupplierSaving(true);
    setSuppliersError(null);
    try {
      if (supplierModal.mode === 'create') {
        const party = await createParty({
          name: supplierDraft.name.trim(),
          partyType: 'Organization',
        });
        await createPartyRole({
          partyId: party.id,
          name: SUPPLIER_ROLE_NAME,
          partyRoleCharacteristic: supplierDraft.cnpj.trim()
            ? [{ name: 'cnpj', value: supplierDraft.cnpj.trim() }]
            : [],
        });
      } else if (supplierModal.role) {
        await updateParty(supplierModal.role.partyId, { name: supplierDraft.name.trim() });
        await updatePartyRole(supplierModal.role.id, {
          partyRoleCharacteristic: supplierDraft.cnpj.trim()
            ? [{ name: 'cnpj', value: supplierDraft.cnpj.trim() }]
            : [],
        });
      }
      setSupplierModal(null);
      reloadSuppliers();
    } catch {
      setSuppliersError(
        supplierModal.mode === 'create'
          ? 'Não foi possível cadastrar o fornecedor.'
          : 'Não foi possível salvar o fornecedor.',
      );
    } finally {
      setSupplierSaving(false);
    }
  };

  const deactivateSupplier = async (role: PartyRole) => {
    try {
      await deletePartyRole(role.id);
      reloadSuppliers();
    } catch {
      setSuppliersError('Não foi possível desativar o fornecedor.');
    }
  };

  const emptySiteTypeDraft = (): SiteTypeDraft => ({
    code: '',
    name: '',
    siteRole: 'network',
    allowedChildSpecIds: [],
  });

  const [siteSpecs, setSiteSpecs] = useState<GeoSpec[]>([]);
  const [siteTypesLoading, setSiteTypesLoading] = useState(true);
  const [siteTypeError, setSiteTypeError] = useState<string | null>(null);
  const [siteTypeSaving, setSiteTypeSaving] = useState(false);
  const [siteTypeModal, setSiteTypeModal] = useState<{
    mode: 'create' | 'edit';
    spec: GeoSpec | null;
  } | null>(null);
  const [siteTypeDraft, setSiteTypeDraft] = useState<SiteTypeDraft>(emptySiteTypeDraft());
  const [pendingSiteTypeRemoval, setPendingSiteTypeRemoval] = useState<GeoSpec | null>(null);

  const reloadSiteTypes = () => {
    setSiteTypesLoading(true);
    void listGeoSiteSpecifications()
      .then(setSiteSpecs)
      .catch(() => setSiteTypeError('Não foi possível carregar os tipos de Local.'))
      .finally(() => setSiteTypesLoading(false));
  };
  useEffect(reloadSiteTypes, []);

  const activeSiteSpecs = siteSpecs.filter((spec) => spec.lifecycleStatus === 'Active');

  const allowedChildNames = (spec: GeoSpec): string =>
    spec.allowedChildSpecIds
      .map((id) => {
        const child = siteSpecs.find((item) => item.id === id);
        return child ? siteSpecLabel(child) : id;
      })
      .join(', ');

  const [siteTypeSort, onSiteTypeSort] = useSort<'name' | 'category' | 'siteRole' | 'children'>();
  const sortedSiteSpecs = useMemo(
    () =>
      sortedBy(activeSiteSpecs, siteTypeSort, (spec, key) => {
        switch (key) {
          case 'name':
            return siteSpecLabel(spec);
          case 'category':
            return siteSpecCategoryLabel(spec.category);
          case 'siteRole':
            return siteRoleLabel(spec.siteRole);
          case 'children':
            return allowedChildNames(spec);
          default:
            return '';
        }
      }),
    [activeSiteSpecs, siteTypeSort],
  );

  const openCreateSiteType = () => {
    setSiteTypeDraft(emptySiteTypeDraft());
    setSiteTypeModal({ mode: 'create', spec: null });
    setSiteTypeError(null);
  };

  const openEditSiteType = (spec: GeoSpec) => {
    // O rótulo exibido na lista (siteSpecLabel) é a tradução pt-BR — pré-carrega o campo Label com
    // ela, não com o `spec.name` cru (código/inglês legado), para o que o usuário vê ao editar
    // seja o mesmo que ele vê na tabela.
    setSiteTypeDraft({
      code: spec.code,
      name: siteSpecLabel(spec),
      siteRole: spec.siteRole,
      allowedChildSpecIds: spec.allowedChildSpecIds,
    });
    setSiteTypeModal({ mode: 'edit', spec });
    setSiteTypeError(null);
  };

  const closeSiteTypeModal = () => {
    if (siteTypeSaving) return;
    setSiteTypeModal(null);
  };

  // `validateContainment` (src/modules/geo/service.ts) exige a relação nos dois sentidos: o pai
  // precisa ter o filho em `allowedChildSpecIds` E o filho precisa ter o pai em
  // `allowedParentSpecIds`. O PATCH desta tela grava só o lado do pai — este helper mantém o lado
  // do filho em sincronia, igual ao padrão já usado nos scripts de carga (ensureContainment).
  const syncChildParentLinks = async (
    specId: string,
    previousChildIds: string[],
    nextChildIds: string[],
  ) => {
    const previousSet = new Set(previousChildIds);
    const nextSet = new Set(nextChildIds);
    const added = nextChildIds.filter((id) => !previousSet.has(id));
    const removed = previousChildIds.filter((id) => !nextSet.has(id));
    for (const childId of added) {
      const child = siteSpecs.find((item) => item.id === childId);
      const parentIds = new Set(child?.allowedParentSpecIds ?? []);
      parentIds.add(specId);
      await patchJson(`/v1/geo/site-specifications/${encodeURIComponent(childId)}`, {
        allowedParentSpecIds: [...parentIds],
      });
    }
    for (const childId of removed) {
      const child = siteSpecs.find((item) => item.id === childId);
      const parentIds = new Set(child?.allowedParentSpecIds ?? []);
      parentIds.delete(specId);
      await patchJson(`/v1/geo/site-specifications/${encodeURIComponent(childId)}`, {
        allowedParentSpecIds: [...parentIds],
      });
    }
  };

  const submitSiteTypeModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!siteTypeModal || !siteTypeDraft.name.trim()) return;
    if (siteTypeModal.mode === 'create' && !siteTypeDraft.code.trim()) return;
    setSiteTypeSaving(true);
    setSiteTypeError(null);
    try {
      if (siteTypeModal.mode === 'create') {
        const created = await postJson<GeoSpec>('/v1/geo/site-specifications', {
          code: siteTypeDraft.code.trim(),
          name: siteTypeDraft.name.trim(),
          siteRole: siteTypeDraft.siteRole,
          category: 'Site',
          allowedChildSpecIds: siteTypeDraft.allowedChildSpecIds,
        });
        await syncChildParentLinks(created.id, [], siteTypeDraft.allowedChildSpecIds);
      } else if (siteTypeModal.spec) {
        await patchJson(`/v1/geo/site-specifications/${encodeURIComponent(siteTypeModal.spec.id)}`, {
          name: siteTypeDraft.name.trim(),
          siteRole: siteTypeDraft.siteRole,
          allowedChildSpecIds: siteTypeDraft.allowedChildSpecIds,
        });
        await syncChildParentLinks(
          siteTypeModal.spec.id,
          siteTypeModal.spec.allowedChildSpecIds,
          siteTypeDraft.allowedChildSpecIds,
        );
      }
      setSiteTypeModal(null);
      reloadSiteTypes();
    } catch (reason) {
      setSiteTypeError(
        reason instanceof Error ? reason.message : 'Não foi possível salvar o tipo de Local.',
      );
    } finally {
      setSiteTypeSaving(false);
    }
  };

  const removeSiteType = async () => {
    if (!pendingSiteTypeRemoval) return;
    setSiteTypeSaving(true);
    setSiteTypeError(null);
    try {
      await deleteJson(`/v1/geo/site-specifications/${encodeURIComponent(pendingSiteTypeRemoval.id)}`);
      if (siteTypeModal?.spec?.id === pendingSiteTypeRemoval.id) setSiteTypeModal(null);
      setPendingSiteTypeRemoval(null);
      reloadSiteTypes();
    } catch (reason) {
      setSiteTypeError(
        reason instanceof Error ? reason.message : 'Não foi possível remover o tipo de Local.',
      );
    } finally {
      setSiteTypeSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full items-stretch overflow-hidden max-md:flex-col">
      <aside className="w-[238px] shrink-0 overflow-y-auto border-r border-app-border bg-app-sidebar px-3 py-6 max-md:w-full max-md:border-b max-md:border-r-0 max-md:px-5">
        <p className="px-2 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
          Configurações
        </p>
        <div className="space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition ${
                  active
                    ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-soft'
                    : 'border-transparent text-app-text hover:border-app-border hover:bg-white'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                <span className="text-[0.88rem] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-white px-8 py-8 max-md:px-5 max-md:py-6">
        {tab === 'projects' ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-[1.5rem] font-semibold text-app-text">
                  Status de Projetos
                </h1>
                <p className="mt-1 text-[0.88rem] text-app-muted">
                  Códigos são imutáveis; desativar preserva o histórico e remove a opção de novas
                  escolhas.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateProjectStatus}
                className="geo-btn primary shrink-0"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>

            {error && !projectModal ? (
              <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
                {error}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
                    <SortableHeader label="Código" sortKey="code" sort={projectSort} onSort={onProjectSort} />
                    <SortableHeader label="Nome" sortKey="name" sort={projectSort} onSort={onProjectSort} />
                    <SortableHeader
                      label="Comportamento"
                      sortKey="behavior"
                      sort={projectSort}
                      onSort={onProjectSort}
                    />
                    <SortableHeader label="Ordem" sortKey="sortOrder" sort={projectSort} onSort={onProjectSort} />
                    <SortableHeader label="Ativo" sortKey="active" sort={projectSort} onSort={onProjectSort} />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 text-[0.88rem] text-app-muted">
                        Carregando…
                      </td>
                    </tr>
                  ) : (
                    sortedItems.map((item) => (
                      <tr
                        key={item.code}
                        className="border-b border-app-border text-[0.88rem] text-app-text last:border-0"
                      >
                        <td className="px-5 py-3 font-mono text-app-muted">{item.code}</td>
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3 text-app-muted">
                          {behaviors.find((behavior) => behavior.value === item.behavior)?.label ??
                            item.behavior}
                        </td>
                        <td className="px-5 py-3 text-app-muted">{item.sortOrder}</td>
                        <td className="px-5 py-3 text-app-muted">{item.active ? 'Sim' : 'Não'}</td>
                        <td className="flex justify-end gap-1 px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openEditProjectStatus(item)}
                            className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                            aria-label={`Editar ${item.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {item.active && item.code !== '1' && item.code !== '17' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deactivateProjectStatusCatalogItem(item.code);
                                  reload();
                                } catch {
                                  setError('Não foi possível desativar o status.');
                                }
                              }}
                              className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                              aria-label={`Desativar ${item.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {projectModal ? (
              <ProjectStatusModal
                mode={projectModal.mode}
                draft={projectDraft}
                saving={projectSaving}
                error={error}
                onChange={setProjectDraft}
                onSubmit={submitProjectModal}
                onClose={closeProjectModal}
              />
            ) : null}
          </>
        ) : tab === 'suppliers' ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-[1.5rem] font-semibold text-app-text">
                  Fornecedores
                </h1>
                <p className="mt-1 text-[0.88rem] text-app-muted">
                  Cadastro de organizações fornecedoras (Party com papel de Fornecedor). Desativar
                  preserva o histórico de vínculos já criados.
                </p>
              </div>
              <button type="button" onClick={openCreateSupplier} className="geo-btn primary shrink-0">
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>

            {suppliersError && !supplierModal ? (
              <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
                {suppliersError}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
                    <SortableHeader label="Nome" sortKey="name" sort={supplierSort} onSort={onSupplierSort} />
                    <SortableHeader label="CNPJ" sortKey="cnpj" sort={supplierSort} onSort={onSupplierSort} />
                    <SortableHeader label="Status" sortKey="status" sort={supplierSort} onSort={onSupplierSort} />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {suppliersLoading ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-[0.88rem] text-app-muted">
                        Carregando…
                      </td>
                    </tr>
                  ) : suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-[0.88rem] text-app-muted">
                        Nenhum fornecedor cadastrado.
                      </td>
                    </tr>
                  ) : (
                    sortedSuppliers.map((role) => (
                      <tr
                        key={role.id}
                        className="border-b border-app-border text-[0.88rem] text-app-text last:border-0"
                      >
                        <td className="px-5 py-3 font-medium">{role.party.name}</td>
                        <td className="px-5 py-3 text-app-muted">{supplierCnpj(role) || '-'}</td>
                        <td className="px-5 py-3 text-app-muted">{supplierStatusLabel[role.status]}</td>
                        <td className="flex justify-end gap-1 px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openEditSupplier(role)}
                            className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                            aria-label={`Editar ${role.party.name ?? ''}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {role.status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => void deactivateSupplier(role)}
                              className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                              aria-label={`Desativar ${role.party.name ?? ''}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {supplierModal ? (
              <SupplierModal
                mode={supplierModal.mode}
                draft={supplierDraft}
                saving={supplierSaving}
                error={suppliersError}
                onChange={setSupplierDraft}
                onSubmit={submitSupplierModal}
                onClose={closeSupplierModal}
              />
            ) : null}
          </>
        ) : tab === 'sites' ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-[1.5rem] font-semibold text-app-text">
                  Tipos de Locais
                </h1>
                <p className="mt-1 text-[0.88rem] text-app-muted">
                  Catálogo de especificações de Local (GeographicSiteSpecification). Papel
                  (siteRole) define o que o tipo é (C11); novos tipos entram na categoria Local —
                  tipos de Sub-local (Sala, Pavimento…) são cadastrados via API.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateSiteType}
                className="geo-btn primary shrink-0"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>

            {siteTypeError && !siteTypeModal ? (
              <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
                {siteTypeError}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-[20px] border border-app-border bg-white shadow-soft">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-app-border bg-slate-50 text-[0.82rem] font-semibold text-app-muted">
                    <SortableHeader label="Nome" sortKey="name" sort={siteTypeSort} onSort={onSiteTypeSort} />
                    <SortableHeader
                      label="Categoria"
                      sortKey="category"
                      sort={siteTypeSort}
                      onSort={onSiteTypeSort}
                    />
                    <SortableHeader label="Papel" sortKey="siteRole" sort={siteTypeSort} onSort={onSiteTypeSort} />
                    <SortableHeader
                      label="Filhos permitidos"
                      sortKey="children"
                      sort={siteTypeSort}
                      onSort={onSiteTypeSort}
                    />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {siteTypesLoading ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-4 text-[0.88rem] text-app-muted">
                        Carregando…
                      </td>
                    </tr>
                  ) : (
                    sortedSiteSpecs.map((spec) => (
                      <tr
                        key={spec.id}
                        className="border-b border-app-border text-[0.88rem] text-app-text last:border-0"
                      >
                        <td className="px-5 py-3 font-medium">{siteSpecLabel(spec)}</td>
                        <td className="px-5 py-3 text-app-muted">
                          {siteSpecCategoryLabel(spec.category)}
                        </td>
                        <td className="px-5 py-3 text-app-muted">{siteRoleLabel(spec.siteRole)}</td>
                        <td className="px-5 py-3 text-app-muted">
                          {spec.allowedChildSpecIds.length ? allowedChildNames(spec) : '-'}
                        </td>
                        <td className="flex justify-end gap-1 px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openEditSiteType(spec)}
                            className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                            aria-label={`Editar ${siteSpecLabel(spec)}`}
                            disabled={siteTypeSaving}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {pendingSiteTypeRemoval?.id === spec.id ? (
                            <button
                              type="button"
                              onClick={() => void removeSiteType()}
                              className="rounded-xl border border-status-red/30 bg-status-red-soft px-2 py-1 text-[0.75rem] font-semibold text-status-red"
                              disabled={siteTypeSaving}
                            >
                              Confirmar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPendingSiteTypeRemoval(spec);
                                setSiteTypeError(null);
                              }}
                              className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                              aria-label={`Remover ${siteSpecLabel(spec)}`}
                              disabled={siteTypeSaving}
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

            {siteTypeModal ? (
              <SiteTypeModal
                mode={siteTypeModal.mode}
                draft={siteTypeDraft}
                specOptions={activeSiteSpecs.filter((spec) => spec.id !== siteTypeModal.spec?.id)}
                saving={siteTypeSaving}
                error={siteTypeError}
                onChange={setSiteTypeDraft}
                onSubmit={submitSiteTypeModal}
                onClose={closeSiteTypeModal}
              />
            ) : null}
          </>
        ) : tab === 'resourcesCivil' ? (
          <ResourceCatalogTab infraTab="civil" />
        ) : tab === 'resourcesNetwork' ? (
          <ResourceCatalogTab infraTab="network" />
        ) : (
          <ServiceCatalogTab />
        )}
      </section>
    </div>
  );
}

function ProjectStatusModal({
  mode,
  draft,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit';
  draft: ProjectStatusDraft;
  saving: boolean;
  error: string | null;
  onChange: (next: ProjectStatusDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const behaviorLocked = mode === 'edit' && draft.code === '17';
  const activeLocked = mode === 'edit' && (draft.code === '1' || draft.code === '17');
  const submitDisabled =
    saving || !draft.name.trim() || (mode === 'create' && !draft.code.trim());

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-status-modal-title"
        className="w-full max-w-[480px] rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <h2
            id="project-status-modal-title"
            className="font-display text-[1.3rem] font-semibold text-app-text"
          >
            {mode === 'create' ? 'Criar status de Projeto' : 'Editar status de Projeto'}
          </h2>
          <button
            type="button"
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Código">
            <input
              value={draft.code}
              onChange={(event) => onChange({ ...draft, code: event.target.value })}
              className="geo-input"
              disabled={mode === 'edit'}
              autoFocus={mode === 'create'}
            />
            {mode === 'edit' ? (
              <span className="text-[0.72rem] font-medium normal-case tracking-normal text-app-muted">
                O código não pode ser alterado após o cadastro.
              </span>
            ) : null}
          </Field>
          <Field label="Nome">
            <input
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              className="geo-input"
              autoFocus={mode === 'edit'}
            />
          </Field>
          <Field label="Comportamento">
            <select
              value={draft.behavior}
              disabled={behaviorLocked}
              onChange={(event) =>
                onChange({ ...draft, behavior: event.target.value as GeoProjectStatusBehavior })
              }
              className="geo-input"
            >
              {behaviors
                .filter((item) => mode === 'edit' || item.value !== 'close-release')
                .map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Ordem">
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) =>
                onChange({ ...draft, sortOrder: Number(event.target.value) })
              }
              className="geo-input"
            />
          </Field>
          {mode === 'edit' ? (
            <label className="flex items-center gap-2 text-[0.88rem] font-normal normal-case tracking-normal text-app-text">
              <input
                type="checkbox"
                checked={draft.active}
                disabled={activeLocked}
                onChange={(event) => onChange({ ...draft, active: event.target.checked })}
              />
              Ativo
            </label>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-3 border-t border-app-border pt-4">
            <button type="button" onClick={onClose} className="geo-btn secondary" disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="geo-btn primary" disabled={submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function SupplierModal({
  mode,
  draft,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit';
  draft: SupplierDraft;
  saving: boolean;
  error: string | null;
  onChange: (next: SupplierDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submitDisabled = saving || !draft.name.trim();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
        className="w-full max-w-[480px] rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <h2
            id="supplier-modal-title"
            className="font-display text-[1.3rem] font-semibold text-app-text"
          >
            {mode === 'create' ? 'Criar fornecedor' : 'Editar fornecedor'}
          </h2>
          <button
            type="button"
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="Nome">
            <input
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              className="geo-input"
              autoFocus
            />
          </Field>
          <Field label="CNPJ">
            <input
              value={draft.cnpj}
              onChange={(event) => onChange({ ...draft, cnpj: event.target.value })}
              className="geo-input"
              placeholder="(opcional)"
            />
          </Field>

          <div className="mt-2 flex items-center justify-end gap-3 border-t border-app-border pt-4">
            <button type="button" onClick={onClose} className="geo-btn secondary" disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="geo-btn primary" disabled={submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function SiteTypeModal({
  mode,
  draft,
  specOptions,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit';
  draft: SiteTypeDraft;
  specOptions: GeoSpec[];
  saving: boolean;
  error: string | null;
  onChange: (next: SiteTypeDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleChild = (id: string) => {
    const next = draft.allowedChildSpecIds.includes(id)
      ? draft.allowedChildSpecIds.filter((item) => item !== id)
      : [...draft.allowedChildSpecIds, id];
    onChange({ ...draft, allowedChildSpecIds: next });
  };

  const submitDisabled =
    saving || !draft.name.trim() || (mode === 'create' && !draft.code.trim());

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-type-modal-title"
        className="flex max-h-[88vh] w-full max-w-[480px] flex-col rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
      >
        <div className="mb-5 flex shrink-0 items-start justify-between gap-4 border-b border-app-border pb-4">
          <h2
            id="site-type-modal-title"
            className="font-display text-[1.3rem] font-semibold text-app-text"
          >
            {mode === 'create' ? 'Criar tipo de Local' : 'Editar tipo de Local'}
          </h2>
          <button
            type="button"
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="mb-3 shrink-0 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
            <Field label="Código">
              <input
                value={draft.code}
                onChange={(event) => onChange({ ...draft, code: event.target.value })}
                className="geo-input"
                placeholder="ex: CENTRAL_OFFICE"
                disabled={mode === 'edit'}
                autoFocus={mode === 'create'}
              />
              {mode === 'edit' ? (
                <span className="text-[0.72rem] font-medium normal-case tracking-normal text-app-muted">
                  O código não pode ser alterado após o cadastro.
                </span>
              ) : null}
            </Field>
            <Field label="Label">
              <input
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                className="geo-input"
                autoFocus={mode === 'edit'}
              />
            </Field>
            <Field label="Papel">
              <select
                value={draft.siteRole}
                onChange={(event) =>
                  onChange({ ...draft, siteRole: event.target.value as GeoSpec['siteRole'] })
                }
                className="geo-input"
              >
                {SITE_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filhos permitidos">
              {specOptions.length === 0 ? (
                <div className="rounded-[14px] border border-app-border bg-white px-3 py-4 text-center text-[0.82rem] font-normal normal-case tracking-normal text-app-muted">
                  Nenhum outro tipo de Local cadastrado.
                </div>
              ) : (
                <div className="max-h-[130px] overflow-auto rounded-[14px] border border-app-border bg-white">
                  {specOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[0.86rem] font-normal normal-case tracking-normal text-app-text transition hover:bg-app-accent-soft"
                    >
                      <input
                        type="checkbox"
                        checked={draft.allowedChildSpecIds.includes(option.id)}
                        onChange={() => toggleChild(option.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{siteSpecLabel(option)}</span>
                      <span className="text-[0.72rem] text-app-muted">
                        {siteSpecCategoryLabel(option.category)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-end gap-3 border-t border-app-border pt-4">
            <button type="button" onClick={onClose} className="geo-btn secondary" disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="geo-btn primary" disabled={submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
