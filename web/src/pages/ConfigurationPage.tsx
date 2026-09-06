import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  Briefcase,
  Check,
  FolderTree,
  Pencil,
  Plus,
  ServerCog,
  Trash2,
  Truck,
  Users,
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
import Field from '../components/Field';
import PageHead from '../components/ui/PageHead';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { ServiceCatalogTab } from './config-tabs/ServiceCatalogTab';
import { UsersTab } from './config-tabs/UsersTab';
import { EnvironmentTab } from './config-tabs/EnvironmentTab';
import { EventsTab } from './config-tabs/EventsTab';
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

type ConfigTab = 'users' | 'environment' | 'events' | 'projects' | 'suppliers' | 'services';

type ProjectStatusDraft = {
  name: string;
  behavior: GeoProjectStatusBehavior;
  sortOrder: number;
};

type ProjectStatusEditDraft = {
  name: string;
  behavior: GeoProjectStatusBehavior;
  sortOrder: number;
  active: boolean;
};

type SupplierDraft = { name: string; cnpj: string };

const tabs: Array<{ id: ConfigTab; label: string; icon: LucideIcon }> = [
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'environment', label: 'Ambiente', icon: ServerCog },
  { id: 'events', label: 'Eventos', icon: Activity },
  { id: 'projects', label: 'Projetos', icon: FolderTree },
  { id: 'services', label: 'Serviços', icon: Briefcase },
  { id: 'suppliers', label: 'Fornecedores', icon: Truck },
];

/** Cabeçalho de modal com título + botão de fechar — usado pelos três modais desta página. */
function ModalTitle({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{children}</span>
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

export function ConfigurationPage() {
  const [tab, setTab] = useState<ConfigTab>('users');

  const emptyProjectStatusDraft = (): ProjectStatusDraft => ({
    name: '',
    behavior: 'planning',
    sortOrder: 100,
  });

  const [items, setItems] = useState<GeoProjectStatusCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectStatusDraft>(emptyProjectStatusDraft());

  // Edição inline: clicar no lápis torna a linha editável (nome/comportamento/ordem/ativo);
  // salvar ou cancelar volta a linha ao estado de leitura. Excluir continua disponível a
  // qualquer momento, mesmo com outra linha em edição.
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProjectStatusEditDraft | null>(null);

  const [projectSort, onProjectSort] = useSort<'name' | 'behavior' | 'sortOrder' | 'active'>();
  const sortedItems = useMemo(
    () =>
      sortedBy(items, projectSort, (item, key) => {
        switch (key) {
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
    setProjectModalOpen(true);
    setError(null);
  };

  const closeProjectModal = () => {
    if (projectSaving) return;
    setProjectModalOpen(false);
  };

  const submitProjectModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectDraft.name.trim()) return;
    setProjectSaving(true);
    setError(null);
    try {
      await createProjectStatusCatalogItem({
        name: projectDraft.name.trim(),
        sortOrder: projectDraft.sortOrder,
        behavior: projectDraft.behavior,
        active: true,
      });
      setProjectModalOpen(false);
      reload();
    } catch {
      setError('Não foi possível criar o status.');
    } finally {
      setProjectSaving(false);
    }
  };

  const startEditProjectStatus = (item: GeoProjectStatusCatalogItem) => {
    setEditingCode(item.code);
    setEditDraft({
      name: item.name,
      behavior: item.behavior,
      sortOrder: item.sortOrder,
      active: item.active,
    });
    setError(null);
  };

  const cancelEditProjectStatus = () => {
    setEditingCode(null);
    setEditDraft(null);
  };

  const saveEditProjectStatus = async () => {
    if (!editingCode || !editDraft || !editDraft.name.trim()) return;
    setProjectSaving(true);
    setError(null);
    try {
      await updateProjectStatusCatalogItem(editingCode, {
        name: editDraft.name.trim(),
        sortOrder: editDraft.sortOrder,
        behavior: editDraft.behavior,
        active: editDraft.active,
      });
      setEditingCode(null);
      setEditDraft(null);
      reload();
    } catch {
      setError('Não foi possível salvar o status.');
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

  return (
    <div className="flex h-full w-full items-stretch overflow-hidden max-md:flex-col">
      <aside className="w-[185px] shrink-0 overflow-y-auto border-r border-app-border bg-app-sidebar px-[11px] pb-[22px] pt-[42px] max-md:w-full max-md:border-b max-md:border-r-0 max-md:px-5">
        {/* pt-[42px]: alinha o topo de "Configurações" com o topo do título da aba ativa
            (ex.: "Usuários" em UsersTab/PageHead) — a seção de conteúdo tem py-8 (32px) e
            o título fica dentro de uma caixa de 48px centralizada verticalmente
            (ver PageHead), então o texto visualmente começa ~10px abaixo do padding. */}
        <p className="px-2 pb-2.5 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
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
                className={`flex w-full items-center gap-[9px] rounded-[11px] border px-[11px] py-[7px] text-left transition ${
                  active
                    ? 'vt-yellow-selected text-app-text'
                    : 'border-transparent text-app-text hover:border-app-border hover:bg-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="text-[0.76rem] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-white px-8 py-8 max-md:px-5 max-md:py-6">
        {tab === 'users' ? (
          <UsersTab />
        ) : tab === 'environment' ? (
          <EnvironmentTab />
        ) : tab === 'events' ? (
          <EventsTab />
        ) : tab === 'projects' ? (
          <>
            <PageHead
              title="Status de Projetos"
              subtitle="Desativar preserva o histórico e remove a opção de novas escolhas."
              actions={
                <Button onClick={openCreateProjectStatus} iconLeft={<Plus className="h-4 w-4" />}>
                  Adicionar
                </Button>
              }
            />

            {error && !projectModalOpen ? (
              <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
                {error}
              </p>
            ) : null}

            <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
              <table className="vt-table" style={{ minWidth: 650 }}>
                <thead>
                  <tr>
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
                      <td colSpan={5}>Carregando…</td>
                    </tr>
                  ) : (
                    sortedItems.map((item) => {
                      const isEditing = editingCode === item.code;
                      const behaviorLocked = isEditing && item.code === '17';
                      const activeLocked = isEditing && (item.code === '1' || item.code === '17');
                      // Exclusão é soft (C6): o backend só marca active=false. Fica disponível
                      // mesmo com o status já inativo — só os dois protegidos (1, 17) ficam de fora.
                      const canDeactivate = item.code !== '1' && item.code !== '17';
                      return (
                        <tr key={item.code}>
                          {isEditing && editDraft ? (
                            <>
                              <td>
                                <input
                                  value={editDraft.name}
                                  onChange={(event) =>
                                    setEditDraft({ ...editDraft, name: event.target.value })
                                  }
                                  className="geo-input h-9 text-[0.86rem]"
                                  autoFocus
                                />
                              </td>
                              <td>
                                <select
                                  value={editDraft.behavior}
                                  disabled={behaviorLocked}
                                  onChange={(event) =>
                                    setEditDraft({
                                      ...editDraft,
                                      behavior: event.target.value as GeoProjectStatusBehavior,
                                    })
                                  }
                                  className="geo-input h-9 text-[0.86rem]"
                                >
                                  {behaviors.map((behavior) => (
                                    <option key={behavior.value} value={behavior.value}>
                                      {behavior.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={editDraft.sortOrder}
                                  onChange={(event) =>
                                    setEditDraft({
                                      ...editDraft,
                                      sortOrder: Number(event.target.value),
                                    })
                                  }
                                  className="geo-input h-9 w-24 text-[0.86rem]"
                                />
                              </td>
                              <td>
                                <label className="flex items-center gap-2 text-[0.86rem] text-app-text">
                                  <input
                                    type="checkbox"
                                    checked={editDraft.active}
                                    disabled={activeLocked}
                                    onChange={(event) =>
                                      setEditDraft({ ...editDraft, active: event.target.checked })
                                    }
                                  />
                                  {editDraft.active ? 'Sim' : 'Não'}
                                </label>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {item.name}
                              </td>
                              <td>
                                {behaviors.find((behavior) => behavior.value === item.behavior)
                                  ?.label ?? item.behavior}
                              </td>
                              <td>{item.sortOrder}</td>
                              <td>{item.active ? 'Sim' : 'Não'}</td>
                            </>
                          )}
                          <td>
                            <div className="flex justify-end gap-1">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void saveEditProjectStatus()}
                                    className="rounded-xl border border-transparent p-1.5 text-status-green transition hover:border-status-green hover:bg-status-green-soft"
                                    aria-label={`Salvar ${item.name}`}
                                    disabled={projectSaving || !editDraft?.name.trim()}
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditProjectStatus}
                                    className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                                    aria-label={`Cancelar edição de ${item.name}`}
                                    disabled={projectSaving}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEditProjectStatus(item)}
                                  className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                                  aria-label={`Editar ${item.name}`}
                                  disabled={projectSaving}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canDeactivate ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deactivateProjectStatusCatalogItem(item.code);
                                      if (isEditing) cancelEditProjectStatus();
                                      reload();
                                    } catch {
                                      setError('Não foi possível desativar o status.');
                                    }
                                  }}
                                  className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft"
                                  aria-label={`Desativar ${item.name}`}
                                  disabled={projectSaving}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {projectModalOpen ? (
              <ProjectStatusModal
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
            <PageHead
              title="Fornecedores"
              subtitle="Cadastro de organizações fornecedoras (Party com papel de Fornecedor). Desativar preserva o histórico de vínculos já criados."
              actions={
                <Button onClick={openCreateSupplier} iconLeft={<Plus className="h-4 w-4" />}>
                  Adicionar
                </Button>
              }
            />

            {suppliersError && !supplierModal ? (
              <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
                {suppliersError}
              </p>
            ) : null}

            <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
              <table className="vt-table" style={{ minWidth: 650 }}>
                <thead>
                  <tr>
                    <SortableHeader label="Nome" sortKey="name" sort={supplierSort} onSort={onSupplierSort} />
                    <SortableHeader label="CNPJ" sortKey="cnpj" sort={supplierSort} onSort={onSupplierSort} />
                    <SortableHeader label="Status" sortKey="status" sort={supplierSort} onSort={onSupplierSort} />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {suppliersLoading ? (
                    <tr>
                      <td colSpan={4}>Carregando…</td>
                    </tr>
                  ) : suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Nenhum fornecedor cadastrado.</td>
                    </tr>
                  ) : (
                    sortedSuppliers.map((role) => (
                      <tr key={role.id}>
                        <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {role.party.name}
                        </td>
                        <td>{supplierCnpj(role) || '-'}</td>
                        <td>{supplierStatusLabel[role.status]}</td>
                        <td>
                          <div className="flex justify-end gap-1">
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
                          </div>
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
        ) : (
          <ServiceCatalogTab />
        )}
      </section>
    </div>
  );
}

function ProjectStatusModal({
  draft,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
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

  const submitDisabled = saving || !draft.name.trim();

  return (
    <Modal
      title={<ModalTitle onClose={onClose}>Criar status de Projeto</ModalTitle>}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="project-status-form" disabled={submitDisabled}>
            {saving ? 'Salvando...' : 'Criar'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <form id="project-status-form" onSubmit={onSubmit} className="grid gap-4">
        <Field label="Nome">
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className="geo-input"
            autoFocus
          />
        </Field>
        <Field label="Comportamento">
          <select
            value={draft.behavior}
            onChange={(event) =>
              onChange({ ...draft, behavior: event.target.value as GeoProjectStatusBehavior })
            }
            className="geo-input"
          >
            {behaviors
              .filter((item) => item.value !== 'close-release')
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
            onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}
            className="geo-input"
          />
        </Field>
      </form>
    </Modal>
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

  return (
    <Modal
      title={
        <ModalTitle onClose={onClose}>
          {mode === 'create' ? 'Criar fornecedor' : 'Editar fornecedor'}
        </ModalTitle>
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" disabled={submitDisabled}>
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <form id="supplier-form" onSubmit={onSubmit} className="grid gap-4">
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
      </form>
    </Modal>
  );
}

