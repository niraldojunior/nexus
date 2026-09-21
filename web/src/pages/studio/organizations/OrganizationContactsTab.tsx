import { useState } from 'react';
import { Mail, Phone, Plus, Trash2, User } from 'lucide-react';
import type { OrganizationDraftItem } from './organizationDraft';
import type { PartyContactValue } from '../../../types/partyCharacteristics';
import { Button, Modal } from '../../../components/ui';

export type OrganizationContactsTabProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<OrganizationDraftItem>) => void;
};

const CONTACT_TYPES = [
  'E-mail Comercial',
  'E-mail Financeiro',
  'Telefone Geral',
  'WhatsApp',
  'Plantão NOC / Suporte',
  'Gerente de Contas',
];

export function OrganizationContactsTab({
  item,
  canMutate,
  onChange,
}: OrganizationContactsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PartyContactValue>({
    type: 'E-mail Comercial',
    value: '',
    contactName: '',
    roleOrDepartment: '',
    isPrimary: false,
  });

  const handleOpenNew = () => {
    setEditingIndex(null);
    setDraft({
      type: 'E-mail Comercial',
      value: '',
      contactName: '',
      roleOrDepartment: '',
      isPrimary: item.contacts.length === 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(item.contacts[index] ?? { type: 'E-mail Comercial', value: '' });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.value.trim()) return;

    let next = [...item.contacts];
    if (draft.isPrimary) {
      next = next.map((c) => ({ ...c, isPrimary: false }));
    }

    if (editingIndex !== null) {
      next[editingIndex] = draft;
    } else {
      next.push(draft);
    }

    onChange({ contacts: next });
    setModalOpen(false);
  };

  const handleDelete = (index: number) => {
    const next = item.contacts.filter((_, i) => i !== index);
    onChange({ contacts: next });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[0.88rem] font-bold text-app-text">Contatos e Pontos Focais</h4>
          <p className="text-[0.78rem] text-app-muted">
            Canais de comunicação, NOC, gerentes de conta e e-mails operacionais.
          </p>
        </div>
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={handleOpenNew}
          >
            Adicionar contato
          </Button>
        )}
      </div>

      {item.contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-app-border p-8 text-center text-app-muted">
          <Mail className="h-8 w-8 opacity-40" />
          <p className="mt-2 text-[0.84rem] font-semibold text-app-text">
            Nenhum contato cadastrado
          </p>
          <p className="mt-0.5 text-[0.78rem]">
            Cadastre canais de contato para facilitar o acionamento de equipes e responsáveis.
          </p>
          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={handleOpenNew}
              className="mt-3"
            >
              Adicionar primeiro contato
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {item.contacts.map((contact, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-[12px] border border-app-border bg-app-panel p-3 shadow-xs"
            >
              <div
                className="flex flex-1 cursor-pointer items-center gap-3"
                onClick={() => canMutate && handleOpenEdit(idx)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                  {contact.type.toLowerCase().includes('telefone') ||
                  contact.type.toLowerCase().includes('whatsapp') ? (
                    <Phone className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-app-text">{contact.value}</span>
                    <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-[0.72rem] font-medium text-app-muted">
                      {contact.type}
                    </span>
                    {contact.isPrimary && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[0.68rem] font-medium text-sky-800">
                        Principal
                      </span>
                    )}
                  </div>
                  {(contact.contactName || contact.roleOrDepartment) && (
                    <div className="flex items-center gap-1.5 text-[0.74rem] text-app-muted">
                      <User className="h-3 w-3" />
                      <span>
                        {contact.contactName || 'Contato'}
                        {contact.roleOrDepartment ? ` (${contact.roleOrDepartment})` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {canMutate && (
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="p-1.5 text-app-muted hover:text-status-red"
                  title="Remover contato"
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
          title={editingIndex !== null ? 'Editar contato' : 'Novo contato'}
          width={460}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" form="contact-form">
                Salvar
              </Button>
            </>
          }
        >
          <form id="contact-form" onSubmit={handleSave} className="space-y-3">
            <label className="block text-[0.8rem] font-semibold text-app-text">
              Tipo de canal *
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              E-mail ou Telefone *
              <input
                type="text"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder="Ex.: contato@empresa.com.br ou (11) 98765-4321"
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
                autoFocus
              />
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Nome do responsável (opcional)
              <input
                type="text"
                value={draft.contactName ?? ''}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                placeholder="Ex.: Maria Souza"
                className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent"
              />
            </label>

            <label className="block text-[0.8rem] font-semibold text-app-text">
              Cargo ou Departamento
              <input
                type="text"
                value={draft.roleOrDepartment ?? ''}
                onChange={(e) => setDraft({ ...draft, roleOrDepartment: e.target.value })}
                placeholder="Ex.: Gerente de Contas, Suporte N2"
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
              Definir como contato principal
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
