import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import type { OrganizationDraftItem } from './organizationDraft';
import type { PartyAddressValue } from '../../../types/partyCharacteristics';
import { Button, Modal } from '../../../components/ui';

export type OrganizationAddressesTabProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<OrganizationDraftItem>) => void;
};

const ADDRESS_PURPOSES = ['Sede', 'Filial', 'Faturamento', 'Correspondência', 'NOC / Operações'];

export function OrganizationAddressesTab({
  item,
  canMutate,
  onChange,
}: OrganizationAddressesTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PartyAddressValue>({
    purpose: 'Sede',
    summary: '',
    geographicAddressId: '',
    isPrimary: false,
  });

  const handleOpenNew = () => {
    setEditingIndex(null);
    setDraft({
      purpose: 'Sede',
      summary: '',
      geographicAddressId: '',
      isPrimary: item.addresses.length === 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(item.addresses[index] ?? { purpose: 'Sede', summary: '' });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.summary?.trim()) return;

    let next = [...item.addresses];
    if (draft.isPrimary) {
      next = next.map((a) => ({ ...a, isPrimary: false }));
    }

    if (editingIndex !== null) {
      next[editingIndex] = draft;
    } else {
      next.push(draft);
    }

    onChange({ addresses: next });
    setModalOpen(false);
  };

  const handleDelete = (index: number) => {
    const next = item.addresses.filter((_, i) => i !== index);
    onChange({ addresses: next });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[0.88rem] font-bold text-app-text">Endereços e Sedes</h4>
          <p className="text-[0.78rem] text-app-muted">
            Locais físicos, sedes corporativas, centros de distribuição e faturamento.
          </p>
        </div>
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={handleOpenNew}
          >
            Adicionar endereço
          </Button>
        )}
      </div>

      {item.addresses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-app-border p-8 text-center text-app-muted">
          <MapPin className="h-8 w-8 opacity-40" />
          <p className="mt-2 text-[0.84rem] font-semibold text-app-text">
            Nenhum endereço cadastrado
          </p>
          <p className="mt-0.5 text-[0.78rem]">
            Cadastre os endereços operacionais e fiscais da organização.
          </p>
          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={handleOpenNew}
              className="mt-3"
            >
              Adicionar endereço
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {item.addresses.map((addr, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-[12px] border border-app-border bg-app-panel p-3 shadow-xs"
            >
              <div
                className="flex flex-1 cursor-pointer items-center gap-3"
                onClick={() => canMutate && handleOpenEdit(idx)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-app-text">{addr.summary}</span>
                    <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-[0.72rem] font-medium text-app-muted">
                      {addr.purpose}
                    </span>
                    {addr.isPrimary && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[0.68rem] font-medium text-sky-800">
                        Principal
                      </span>
                    )}
                  </div>
                  {addr.geographicAddressId && (
                    <span className="font-mono text-[0.72rem] text-app-muted">
                      ID Geográfico: {addr.geographicAddressId}
                    </span>
                  )}
                </div>
              </div>

              {canMutate && (
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="p-1.5 text-app-muted hover:text-status-red"
                  title="Remover endereço"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          onClose={() => setModalOpen(false)}
          title={editingIndex !== null ? 'Editar endereço' : 'Novo endereço'}
          width={480}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" form="address-form">
                Salvar
              </Button>
            </>
          }
        >
          <form id="address-form" onSubmit={handleSave} className="space-y-3">
            <label className="block text-[0.8rem] font-semibold text-app-text">
              Finalidade / Tipo *
              <select
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                {ADDRESS_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Endereço completo / Descrição *
              <textarea
                rows={3}
                value={draft.summary ?? ''}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="Ex.: Av. Brigadeiro Faria Lima, 3477, 14º andar - Itaim Bibi, São Paulo - SP, 04538-133"
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
                autoFocus
              />
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Vínculo com GeographicAddress (UUID opcional)
              <input
                type="text"
                value={draft.geographicAddressId ?? ''}
                onChange={(e) => setDraft({ ...draft, geographicAddressId: e.target.value })}
                placeholder="UUID do endereço geográfico normalizado..."
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent font-mono text-[0.8rem]"
              />
            </label>

            <label className="flex items-center gap-2 pt-1 text-[0.82rem] font-medium text-app-text">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
                className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
              />
              Definir como endereço principal
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
