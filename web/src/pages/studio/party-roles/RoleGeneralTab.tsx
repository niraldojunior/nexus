import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { RoleDraftItem } from './roleDraft';
import { PARTY_ROLE_TYPE_OPTIONS } from './partyRoleTypeOptions';
import { RoleTypeHelpModal } from './RoleTypeHelpModal';

export type RoleGeneralTabProps = {
  item: RoleDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<RoleDraftItem>) => void;
};

// Slug estável a partir do nome — usado como `key` de papéis novos. Múltiplos papéis podem
// compartilhar o mesmo `roleName`/tipo (ex.: "Fabricante de ONT" e "Fabricante de OLT"), cada um
// com sua própria `key` e catálogo de características.
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function RoleGeneralTab({ item, canMutate, onChange }: RoleGeneralTabProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="space-y-5 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[0.8rem] font-semibold text-app-text">
          Nome {canMutate ? '*' : ''}
          <input
            type="text"
            value={item.label}
            disabled={!canMutate}
            onChange={(e) => {
              const label = e.target.value;
              // Papéis já persistidos mantêm a `key` original — só papéis novos ganham slug
              // automático a partir do nome.
              onChange(item.persistedId ? { label } : { label, key: slugify(label) });
            }}
            placeholder="Ex.: Fornecedor de Equipamentos"
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          />
        </label>

        <div className="block text-[0.8rem] font-semibold text-app-text">
          <div className="flex items-center gap-1.5">
            <span>Tipo {canMutate ? '*' : ''}</span>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="O que significa cada tipo?"
              className="text-app-muted transition hover:text-app-accent"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
          <select
            value={item.roleName}
            disabled={!canMutate}
            onChange={(e) => onChange({ roleName: e.target.value })}
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          >
            <option value="" disabled>
              Selecione um tipo...
            </option>
            {PARTY_ROLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="block text-[0.8rem] font-semibold text-app-text">
        Descrição
        <textarea
          rows={3}
          value={item.description ?? ''}
          disabled={!canMutate}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Descreva a finalidade deste papel no ecossistema de partes..."
          className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
        />
      </label>

      {helpOpen && <RoleTypeHelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
