import { useState } from 'react';
import { BadgeCheck, Plus, Trash2 } from 'lucide-react';
import type { PartyRole, Characteristic, TimePeriod } from '../../../services/partyApi';
import type { PartyRoleType } from '../../../services/partyRoleTypeApi';
import type { OrganizationDraftItem } from './organizationDraft';
import { Button } from '../../../components/ui';
import { AssignRoleDialog } from './AssignRoleDialog';

function formatRoleValidity(validFor?: TimePeriod): string | null {
  if (!validFor) return null;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
  if (validFor.endDateTime) {
    return `(vigência até ${formatDate(validFor.endDateTime)})`;
  }
  if (validFor.startDateTime) {
    return `(vigência a partir de ${formatDate(validFor.startDateTime)})`;
  }
  return null;
}

export type OrganizationRolesTabProps = {
  item: OrganizationDraftItem;
  canMutate: boolean;
  availableRoleTypes: PartyRoleType[];
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

export function OrganizationRolesTab({
  item,
  canMutate,
  availableRoleTypes,
  onAssignRole,
  onUpdateRole,
  onRemoveRole,
}: OrganizationRolesTabProps) {
  const [selectedRole, setSelectedRole] = useState<PartyRole | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const roleTypeById = new Map(availableRoleTypes.map((r) => [r.id, r]));
  const roleTypeByRoleName = new Map(availableRoleTypes.map((r) => [r.roleName, r]));

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[0.88rem] font-bold text-app-text">Papéis Atribuídos</h4>
          <p className="text-[0.78rem] text-app-muted">Conforme modelado em Studio &gt; Papéis.</p>
        </div>
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={() => setAssignDialogOpen(true)}
          >
            Atribuir papel
          </Button>
        )}
      </div>

      {item.roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-app-border p-8 text-center text-app-muted">
          <BadgeCheck className="h-8 w-8 opacity-40" />
          <p className="mt-2 text-[0.84rem] font-semibold text-app-text">Nenhum papel atribuído</p>
          <p className="mt-0.5 text-[0.78rem]">
            Atribua um papel (ex.: Fornecedor, Fabricante, ISP) para integrar esta organização ao
            inventário.
          </p>
          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={() => setAssignDialogOpen(true)}
              className="mt-3"
            >
              Atribuir primeiro papel
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {item.roles.map((role) => {
            const roleType =
              (role.roleTypeId ? roleTypeById.get(role.roleTypeId) : undefined) ??
              roleTypeByRoleName.get(role.name);
            const label = roleType?.label || role.name;
            const validityText = formatRoleValidity(role.validFor);

            return (
              <div
                key={role.id}
                className="flex items-center justify-between rounded-[12px] border border-app-border bg-app-panel p-3 shadow-xs hover:border-app-accent/40"
              >
                <div
                  className="flex flex-1 cursor-pointer items-center gap-3"
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                    <BadgeCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-app-text">{label}</span>
                      {validityText && (
                        <span className="text-[0.78rem] font-normal text-app-muted">
                          {validityText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canMutate && (
                  <button
                    type="button"
                    onClick={() => void onRemoveRole(role.id)}
                    className="p-1.5 text-app-muted hover:text-status-red"
                    title="Remover atribuição de papel"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {assignDialogOpen && (
        <AssignRoleDialog
          isOpen={assignDialogOpen}
          onClose={() => setAssignDialogOpen(false)}
          availableRoleTypes={availableRoleTypes}
          organizationName={item.name}
          onAssign={onAssignRole}
        />
      )}

      {selectedRole && (
        <AssignRoleDialog
          isOpen
          onClose={() => setSelectedRole(null)}
          availableRoleTypes={availableRoleTypes}
          organizationName={item.name}
          onAssign={onAssignRole}
          editingRole={selectedRole}
          onUpdate={onUpdateRole}
          readOnly={!canMutate}
        />
      )}
    </div>
  );
}
