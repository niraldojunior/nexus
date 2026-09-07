// Aba "Especificações" do Studio -> Partes: tabela de registros (Party + PartyRole) de um
// determinado tipo, extraída da antiga aba "Fornecedores" de ConfigurationPage.tsx (issue #220).
// O campo `cnpj` continua hardcoded nesta entrega — o formulário dinâmico baseado no catálogo
// de características é um follow-up natural (ver plano, recomendação final).

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createParty,
  createPartyRole,
  deletePartyRole,
  listPartyRoles,
  updateParty,
  updatePartyRole,
  type PartyRole,
} from '../../../services/partyApi';
import { Button, Modal } from '../../../components/ui';
import Field from '../../../components/Field';
import { SortableHeader, sortedBy, useSort } from '../../config-tabs/sortable';

export type SupplierRecordsTabProps = {
  roleName: string;
  canMutate: boolean;
};

type SupplierDraft = { name: string; cnpj: string };

const supplierStatusLabel: Record<PartyRole['status'], string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  terminated: 'Encerrado',
};

const supplierCnpj = (role: PartyRole): string => {
  const characteristic = role.partyRoleCharacteristic?.find((item) => item.name === 'cnpj');
  return typeof characteristic?.value === 'string' ? characteristic.value : '';
};

const emptyDraft = (): SupplierDraft => ({ name: '', cnpj: '' });

export function SupplierRecordsTab({ roleName, canMutate }: SupplierRecordsTabProps) {
  const [suppliers, setSuppliers] = useState<PartyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; role: PartyRole | null } | null>(
    null,
  );
  const [draft, setDraft] = useState<SupplierDraft>(emptyDraft());

  const [sort, onSort] = useSort<'name' | 'cnpj' | 'status'>();
  const sorted = useMemo(
    () =>
      sortedBy(suppliers, sort, (role, key) => {
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
    [suppliers, sort],
  );

  const reload = () => {
    setLoading(true);
    void listPartyRoles({ name: roleName, limit: 200, offset: 0 })
      .then(setSuppliers)
      .catch(() => setError('Não foi possível carregar os fornecedores.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [roleName]);

  const openCreate = () => {
    setDraft(emptyDraft());
    setModal({ mode: 'create', role: null });
    setError(null);
  };

  const openEdit = (role: PartyRole) => {
    setDraft({ name: role.party.name ?? '', cnpj: supplierCnpj(role) });
    setModal({ mode: 'edit', role });
    setError(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
  };

  const submitModal = async (event: FormEvent) => {
    event.preventDefault();
    if (!modal || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (modal.mode === 'create') {
        const party = await createParty({ name: draft.name.trim(), partyType: 'Organization' });
        await createPartyRole({
          partyId: party.id,
          name: roleName,
          partyRoleCharacteristic: draft.cnpj.trim()
            ? [{ name: 'cnpj', value: draft.cnpj.trim() }]
            : [],
        });
      } else if (modal.role) {
        await updateParty(modal.role.partyId, { name: draft.name.trim() });
        await updatePartyRole(modal.role.id, {
          partyRoleCharacteristic: draft.cnpj.trim()
            ? [{ name: 'cnpj', value: draft.cnpj.trim() }]
            : [],
        });
      }
      setModal(null);
      reload();
    } catch {
      setError(
        modal.mode === 'create'
          ? 'Não foi possível cadastrar o fornecedor.'
          : 'Não foi possível salvar o fornecedor.',
      );
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (role: PartyRole) => {
    try {
      await deletePartyRole(role.id);
      reload();
    } catch {
      setError('Não foi possível desativar o fornecedor.');
    }
  };

  return (
    <div className="space-y-4">
      {canMutate && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Adicionar
          </Button>
        </div>
      )}

      {error && !modal ? (
        <p className="mb-3 rounded-[10px] bg-status-red-soft px-3 py-2 text-[0.82rem] text-status-red">
          {error}
        </p>
      ) : null}

      <div className="vt-card vt-table-card" style={{ overflow: 'hidden', padding: 0 }}>
        <table className="vt-table" style={{ minWidth: 550 }}>
          <thead>
            <tr>
              <SortableHeader label="Nome" sortKey="name" sort={sort} onSort={onSort} />
              <SortableHeader label="CNPJ" sortKey="cnpj" sort={sort} onSort={onSort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Carregando…</td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={4}>Nenhum fornecedor cadastrado.</td>
              </tr>
            ) : (
              sorted.map((role) => (
                <tr key={role.id}>
                  <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {role.party.name}
                  </td>
                  <td>{supplierCnpj(role) || '-'}</td>
                  <td>{supplierStatusLabel[role.status]}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {canMutate && (
                        <button
                          type="button"
                          onClick={() => openEdit(role)}
                          className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft"
                          aria-label={`Editar ${role.party.name ?? ''}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canMutate && role.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void deactivate(role)}
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

      {modal ? (
        <SupplierModal
          mode={modal.mode}
          draft={draft}
          saving={saving}
          error={error}
          onChange={setDraft}
          onSubmit={submitModal}
          onClose={closeModal}
        />
      ) : null}
    </div>
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
        <div className="flex items-center justify-between gap-4">
          <span>{mode === 'create' ? 'Criar fornecedor' : 'Editar fornecedor'}</span>
          <button
            type="button"
            className="rounded-full p-2 text-app-muted transition hover:bg-app-accent-soft"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
