import { useState } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import type { OrganizationDraftItem } from './organizationDraft';
import type { PartyIdentificationValue } from '../../../types/partyCharacteristics';
import { Button, Modal } from '../../../components/ui';

export type OrganizationIdentificationsTabProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<OrganizationDraftItem>) => void;
};

const IDENTIFICATION_TYPES = ['CNPJ', 'CPF', 'Inscrição Estadual', 'Inscrição Municipal', 'DUNS', 'Passaporte'];

export function OrganizationIdentificationsTab({
  item,
  canMutate,
  onChange,
}: OrganizationIdentificationsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PartyIdentificationValue>({
    type: 'CNPJ',
    value: '',
    origin: '',
    isPrimary: false,
  });

  const handleOpenNew = () => {
    setEditingIndex(null);
    setDraft({ type: 'CNPJ', value: '', origin: 'Receita Federal', isPrimary: item.identifications.length === 0 });
    setModalOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(item.identifications[index] ?? { type: 'CNPJ', value: '' });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.value.trim()) return;

    let next = [...item.identifications];
    if (draft.isPrimary) {
      next = next.map((it) => ({ ...it, isPrimary: false }));
    }

    if (editingIndex !== null) {
      next[editingIndex] = draft;
    } else {
      next.push(draft);
    }

    onChange({ identifications: next });
    setModalOpen(false);
  };

  const handleDelete = (index: number) => {
    const next = item.identifications.filter((_, i) => i !== index);
    onChange({ identifications: next });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[0.88rem] font-bold text-app-text">Documentos e Identificações Fiscais</h4>
          <p className="text-[0.78rem] text-app-muted">
            CNPJ, Inscrição Estadual, Municipal ou identificadores regulatórios da empresa.
          </p>
        </div>
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={handleOpenNew}
          >
            Adicionar identificação
          </Button>
        )}
      </div>

      {item.identifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-app-border p-8 text-center text-app-muted">
          <CreditCard className="h-8 w-8 opacity-40" />
          <p className="mt-2 text-[0.84rem] font-semibold text-app-text">
            Nenhuma identificação cadastrada
          </p>
          <p className="mt-0.5 text-[0.78rem]">
            Cadastre o CNPJ ou outros registros fiscais para identificar esta organização.
          </p>
          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={handleOpenNew}
              className="mt-3"
            >
              Cadastrar documento
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {item.identifications.map((ident, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-[12px] border border-app-border bg-app-panel p-3 shadow-xs"
            >
              <div
                className="flex flex-1 cursor-pointer items-center gap-3"
                onClick={() => canMutate && handleOpenEdit(idx)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-app-text">{ident.value}</span>
                    <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-[0.72rem] font-medium text-app-muted">
                      {ident.type}
                    </span>
                    {ident.isPrimary && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[0.68rem] font-medium text-sky-800">
                        Principal
                      </span>
                    )}
                  </div>
                  {ident.origin && (
                    <span className="text-[0.74rem] text-app-muted">Origem: {ident.origin}</span>
                  )}
                </div>
              </div>

              {canMutate && (
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="p-1.5 text-app-muted hover:text-status-red"
                  title="Remover identificação"
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
          title={editingIndex !== null ? 'Editar identificação' : 'Nova identificação'}
          width={460}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" form="ident-form">
                Salvar
              </Button>
            </>
          }
        >
          <form id="ident-form" onSubmit={handleSave} className="space-y-3">
            <label className="block text-[0.8rem] font-semibold text-app-text">
              Tipo de documento *
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                {IDENTIFICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Número / Valor *
              <input
                type="text"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder="Ex.: 00.000.000/0001-00"
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
                autoFocus
              />
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Órgão emissor / Origem
              <input
                type="text"
                value={draft.origin ?? ''}
                onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
                placeholder="Ex.: Receita Federal, SEFAZ/SP, SAP"
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              />
            </label>

            <label className="flex items-center gap-2 pt-1 text-[0.82rem] font-medium text-app-text">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
                className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
              />
              Definir como documento principal
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
