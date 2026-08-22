import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createServiceSpecification,
  deleteServiceSpecification,
  loadServiceWorkspaceSnapshot,
  updateServiceSpecification,
  type ServiceCategory,
  type ServiceSpecification,
} from '../../services/serviceApi';
import ServiceSpecificationFields from '../../components/ServiceSpecificationFields';
import Field from '../../components/Field';
import { SERVICE_CATEGORY_DEFAULTS } from '../../data/serviceCatalogDefaults';
import {
  buildServiceSpecificationPayload,
  emptyServiceSpecFormState,
  serviceSpecFormStateFrom,
  serviceSpecSubmitValid,
  type ServiceSpecFormState,
} from '../../utils/serviceSpecificationForm';
import { SortableHeader, sortedBy, useSort } from './sortable';

/**
 * Catálogo de Serviços (ServiceSpecification) em Configurações — reusa os campos e o payload do
 * modal embutido em ServicePage (ver ServiceSpecificationFields e utils/serviceSpecificationForm.ts),
 * mas com a categoria selecionável, já que aqui não há categoria de página ativa.
 */
export function ServiceCatalogTab() {
  const [specs, setSpecs] = useState<ServiceSpecification[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<ServiceSpecification | null>(null);
  const [saving, setSaving] = useState(false);

  type ModalState = { mode: 'create' | 'edit'; entity: ServiceSpecification | null };
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [formState, setFormState] = useState<ServiceSpecFormState>(emptyServiceSpecFormState());

  const reload = () => {
    setLoading(true);
    setError(null);
    void loadServiceWorkspaceSnapshot({ tab: 'ServiceSpecification' })
      .then((snapshot) => {
        setSpecs(snapshot.serviceSpecificationOptions);
        // O backend não modela `code` em ServiceCategory; sem ele, cai na árvore canônica do
        // frontend — mesmo fallback usado por ServicePage (ver loadWorkspaceData).
        const named = snapshot.serviceCategories.filter((item) => Boolean(item.code));
        setServiceCategories(named.length ? named : SERVICE_CATEGORY_DEFAULTS);
      })
      .catch(() => setError('Não foi possível carregar o catálogo de Serviços.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const filteredSpecs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return specs;
    return specs.filter((spec) => spec.name.toLowerCase().includes(term));
  }, [specs, search]);

  const [sort, onSort] = useSort<'name' | 'serviceType' | 'category' | 'description'>();
  const sortedSpecs = useMemo(
    () =>
      sortedBy(filteredSpecs, sort, (spec, key) => {
        switch (key) {
          case 'name':
            return spec.name;
          case 'serviceType':
            return spec.serviceType;
          case 'category':
            return spec.category;
          case 'description':
            return spec.description ?? '';
          default:
            return '';
        }
      }),
    [filteredSpecs, sort],
  );

  const openCreateModal = () => {
    setFormState(emptyServiceSpecFormState());
    setModalState({ mode: 'create', entity: null });
  };

  const openEditModal = (spec: ServiceSpecification) => {
    setFormState(serviceSpecFormStateFrom(spec, spec.category));
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

  const submitValid = serviceSpecSubmitValid(formState);

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!submitValid) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildServiceSpecificationPayload(formState);
      if (modalState?.mode === 'create') {
        await createServiceSpecification(payload);
      } else if (modalState?.entity) {
        await updateServiceSpecification(modalState.entity.id, payload);
      }
      setModalState(null);
      reload();
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
      await deleteServiceSpecification(pendingRemoval.id);
      setPendingRemoval(null);
      reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível remover a especificação.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.5rem] font-semibold text-app-text">
            Catálogo de Serviços
          </h1>
          <p className="mt-1 text-[0.88rem] text-app-muted">
            Especificações (ServiceSpecification) que tipam os serviços de cliente (CFS) e de rede
            (RFS) do inventário.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="geo-btn primary shrink-0">
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
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
              <SortableHeader label="Camada" sortKey="serviceType" sort={sort} onSort={onSort} />
              <SortableHeader label="Categoria" sortKey="category" sort={sort} onSort={onSort} />
              <SortableHeader
                label="Descrição"
                sortKey="description"
                sort={sort}
                onSort={onSort}
              />
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-[0.88rem] text-app-muted">
                  Carregando…
                </td>
              </tr>
            ) : sortedSpecs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-[0.88rem] text-app-muted">
                  Nenhuma especificação cadastrada.
                </td>
              </tr>
            ) : (
              sortedSpecs.map((spec) => (
                <tr
                  key={spec.id}
                  className="border-b border-app-border text-[0.88rem] text-app-text last:border-0"
                >
                  <td className="px-5 py-3 font-medium">{spec.name}</td>
                  <td className="px-5 py-3 text-app-muted">{spec.serviceType}</td>
                  <td className="px-5 py-3 text-app-muted">{spec.category}</td>
                  <td className="px-5 py-3 text-app-muted">{spec.description || '-'}</td>
                  <td className="flex justify-end gap-1 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(spec)}
                      className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                      aria-label={`Editar ${spec.name}`}
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
                        aria-label={`Remover ${spec.name}`}
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
              <form
                onSubmit={submitModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="service-catalog-modal-title"
                className="max-h-full w-full max-w-[760px] overflow-auto rounded-[28px] border border-app-border bg-white p-6 shadow-modal"
              >
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-app-border pb-4">
                  <div>
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                      Catálogo de Serviços
                    </div>
                    <h2
                      id="service-catalog-modal-title"
                      className="mt-1 font-display text-[1.4rem] font-semibold text-app-text"
                    >
                      {modalState.mode === 'create' ? 'Nova especificação' : 'Editar especificação'}
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

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Nome" fullWidth>
                    <input
                      className="geo-input"
                      value={formState.name}
                      onChange={(event) =>
                        setFormState({ ...formState, name: event.target.value })
                      }
                    />
                  </Field>
                  <ServiceSpecificationFields
                    formState={formState}
                    onChange={setFormState}
                    categoryOptions={serviceCategories}
                  />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-app-border pt-4">
                  <button type="button" onClick={closeModal} className="geo-btn secondary">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !submitValid}
                    className="inline-flex items-center gap-2 rounded-[16px] border border-app-accent-border bg-app-accent px-4 py-2 text-[0.92rem] font-semibold text-app-text shadow-soft transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : modalState.mode === 'create' ? 'Criar' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {loading ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.88rem] font-medium text-app-muted shadow-soft backdrop-blur">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Carregando dados...
        </div>
      ) : null}
    </>
  );
}
