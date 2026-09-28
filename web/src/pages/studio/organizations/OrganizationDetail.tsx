import { useEffect, useState } from 'react';
import { Building2, RotateCcw, Trash2 } from 'lucide-react';
import type { OrganizationDraftItem } from './organizationDraft';
import type { PartyRoleType } from '../../../services/partyRoleTypeApi';
import type { Characteristic, TimePeriod } from '../../../services/partyApi';
import { Button } from '../../../components/ui';
import { OrganizationGeneralTab } from './OrganizationGeneralTab';
import { OrganizationIdentificationsTab } from './OrganizationIdentificationsTab';
import { OrganizationContactsTab } from './OrganizationContactsTab';
import { OrganizationAddressesTab } from './OrganizationAddressesTab';
import { OrganizationRolesTab } from './OrganizationRolesTab';

export type OrganizationDetailProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  availableRoleTypes: PartyRoleType[];
  onChange: (updated: Partial<OrganizationDraftItem>) => void;
  onInactivate: () => void;
  onReactivate: () => void;
  onRemoveNew?: () => void;
  onAssignRole: (
    roleName: string,
    roleTypeId: string,
    characteristics: Characteristic[],
    validFor?: TimePeriod,
  ) => Promise<void>;
  onUpdateRole: (
    roleId: string,
    characteristics: Characteristic[],
    validFor?: TimePeriod,
  ) => Promise<void>;
  onRemoveRole: (roleId: string) => Promise<void>;
};

type OrganizationTab = 'general' | 'identifications' | 'contacts' | 'addresses' | 'roles';

export function OrganizationDetail({
  item,
  canMutate,
  availableRoleTypes,
  onChange,
  onInactivate,
  onReactivate,
  onRemoveNew,
  onAssignRole,
  onUpdateRole,
  onRemoveRole,
}: OrganizationDetailProps) {
  const [activeTab, setActiveTab] = useState<OrganizationTab>('general');

  useEffect(() => {
    setActiveTab('general');
  }, [item.localId]);

  return (
    <div className="vt-card flex h-full min-h-[580px] flex-col overflow-hidden p-0">
      {/* Header do detalhe */}
      <div className="border-b border-app-border px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-app-accent-soft text-app-accent">
              {item.logoUrl ? (
                <img src={item.logoUrl} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <Building2 className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-bold leading-tight text-app-text">
                  {item.name || 'Nova organização'}
                </h3>
              </div>
              <p className="mt-0.5 truncate text-[0.78rem] text-app-muted">
                {item.legalName || 'Organização (Pessoa Jurídica)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canMutate && !item.persistedId && onRemoveNew && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Trash2 className="h-4 w-4" />}
                onClick={onRemoveNew}
              >
                Descartar
              </Button>
            )}
            {canMutate && item.persistedId && item.status === 'active' && (
              <Button
                variant="danger"
                size="sm"
                iconLeft={<Trash2 className="h-4 w-4" />}
                onClick={onInactivate}
              >
                Inativar
              </Button>
            )}
            {canMutate && item.persistedId && item.status !== 'active' && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<RotateCcw className="h-4 w-4" />}
                onClick={onReactivate}
              >
                Reativar
              </Button>
            )}
          </div>
        </div>

        {/* Tab pills */}
        <div className="mt-4 flex overflow-x-auto pb-1">
          <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'general'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <span>Geral</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('identifications')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'identifications'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <span>Identificações</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('contacts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'contacts'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <span>Contatos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('addresses')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'addresses'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <span>Endereços</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                activeTab === 'roles'
                  ? 'bg-app-panel font-semibold text-app-text shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              <span>Papéis</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && (
          <OrganizationGeneralTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'identifications' && (
          <OrganizationIdentificationsTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'contacts' && (
          <OrganizationContactsTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'addresses' && (
          <OrganizationAddressesTab item={item} canMutate={canMutate} onChange={onChange} />
        )}
        {activeTab === 'roles' && (
          <OrganizationRolesTab
            item={item}
            canMutate={canMutate}
            availableRoleTypes={availableRoleTypes}
            onAssignRole={onAssignRole}
            onUpdateRole={onUpdateRole}
            onRemoveRole={onRemoveRole}
          />
        )}
      </div>
    </div>
  );
}
