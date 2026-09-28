import { Globe } from 'lucide-react';
import type { OrganizationDraftItem } from './organizationDraft';
import { ImageCharacteristicInput } from '../resource-model/ImageCharacteristicInput';

export type OrganizationGeneralTabProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<OrganizationDraftItem>) => void;
};

export function OrganizationGeneralTab({ item, canMutate, onChange }: OrganizationGeneralTabProps) {
  return (
    <div className="space-y-5 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[0.8rem] font-semibold text-app-text">
          Nome fantasia / Nome de exibição {canMutate ? '*' : ''}
          <input
            type="text"
            value={item.name}
            disabled={!canMutate}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ex.: Nokia do Brasil"
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          />
        </label>

        <label className="block text-[0.8rem] font-semibold text-app-text">
          Razão Social (Legal Name)
          <input
            type="text"
            value={item.legalName ?? ''}
            disabled={!canMutate}
            onChange={(e) => onChange({ legalName: e.target.value })}
            placeholder="Ex.: Nokia Solutions and Networks do Brasil Ltda."
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          />
        </label>
      </div>

      <div className="block text-[0.8rem] font-semibold text-app-text">
        Logotipo
        <div className="mt-1.5">
          <ImageCharacteristicInput
            value={item.logoUrl ?? ''}
            onChange={(value) => onChange({ logoUrl: value })}
            disabled={!canMutate}
            readOnly={!canMutate}
            name="Logotipo da organização"
            ariaLabel="Logotipo da organização"
            align="left"
          />
        </div>
      </div>

      <label className="block text-[0.8rem] font-semibold text-app-text">
        Descrição institucional
        <textarea
          rows={3}
          value={item.description ?? ''}
          disabled={!canMutate}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Descrição, perfil institucional ou observações sobre a organização..."
          className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] font-normal text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
        />
      </label>

      {item.origin && (
        <div className="rounded-[14px] border border-app-border bg-[var(--surface-subtle)] p-4 text-[0.82rem]">
          <div className="flex items-center gap-2 font-semibold text-app-text">
            <Globe className="h-4 w-4 text-sky-600" />
            <span>Origem e Rastreabilidade (Canon C5 — _origin)</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-app-muted">
            <div>
              <span className="font-medium text-app-text">Sistema de origem:</span>{' '}
              {item.origin.system || '—'}
            </div>
            <div>
              <span className="font-medium text-app-text">ID externo:</span> {item.origin.id || '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
