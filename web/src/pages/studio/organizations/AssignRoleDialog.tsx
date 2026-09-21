import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { Characteristic, PartyRole, TimePeriod } from '../../../services/partyApi';
import type { PartyRoleType } from '../../../services/partyRoleTypeApi';
import {
  listPartyRoleTypeCharacteristics,
  type PartyRoleTypeCharacteristic,
} from '../../../services/partyRoleTypeCharacteristicApi';
import { Button, Modal } from '../../../components/ui';

export type AssignRoleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  availableRoleTypes: PartyRoleType[];
  organizationName: string;
  onAssign: (roleName: string, roleTypeId: string, characteristics: Characteristic[], validFor?: TimePeriod) => Promise<void>;
  /** Presente = modal em modo edição de um papel já atribuído, em vez de atribuição nova. */
  editingRole?: PartyRole;
  onUpdate?: (roleId: string, characteristics: Characteristic[], validFor?: TimePeriod) => Promise<void>;
  /** Sessão sem `canMutate` — mostra o papel já atribuído, mas sem permitir alterá-lo. */
  readOnly?: boolean;
};

function toDateInputValue(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function AssignRoleDialog({
  isOpen,
  onClose,
  availableRoleTypes,
  organizationName,
  onAssign,
  editingRole,
  onUpdate,
  readOnly = false,
}: AssignRoleDialogProps) {
  const isEditing = Boolean(editingRole);
  const [selectedRoleName, setSelectedRoleName] = useState<string>('');
  // Múltiplos papéis podem compartilhar o mesmo `roleName` (ex.: dois "manufacturer" com escopos
  // diferentes) — o catálogo de características é isolado por `roleTypeId`, não por `roleName`.
  const [selectedRoleTypeId, setSelectedRoleTypeId] = useState<string>('');
  const [characteristics, setCharacteristics] = useState<PartyRoleTypeCharacteristic[]>([]);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loadingChars, setLoadingChars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedRoleName('');
      setSelectedRoleTypeId('');
      setCharacteristics([]);
      setFormValues({});
      setStartDate('');
      setEndDate('');
      setError(null);
      return;
    }
    if (editingRole) {
      setSelectedRoleName(editingRole.name);
      // Usa o roleTypeId real gravado no papel — fallback por roleName apenas para dados
      // pré-migration V24, onde role_type_id ainda é NULL.
      setSelectedRoleTypeId(
        editingRole.roleTypeId
          ?? availableRoleTypes.find((r) => r.roleName === editingRole.name)?.id
          ?? '',
      );
      setStartDate(toDateInputValue(editingRole.validFor?.startDateTime));
      setEndDate(toDateInputValue(editingRole.validFor?.endDateTime));
      return;
    }
    if (availableRoleTypes.length > 0 && !selectedRoleName) {
      setSelectedRoleName(availableRoleTypes[0]?.roleName ?? '');
      setSelectedRoleTypeId(availableRoleTypes[0]?.id ?? '');
    }
  }, [isOpen, availableRoleTypes, selectedRoleName, editingRole]);

  useEffect(() => {
    if (!selectedRoleTypeId) return;
    setLoadingChars(true);
    listPartyRoleTypeCharacteristics(selectedRoleTypeId)
      .then((chars) => {
        const activeChars = chars.filter((c) => c.active);
        setCharacteristics(activeChars);
        const defaults: Record<string, unknown> = {};
        for (const c of activeChars) {
          if (c.defaultValue !== null && c.defaultValue !== undefined) {
            defaults[c.name] = c.defaultValue;
          }
        }
        if (editingRole) {
          for (const existing of editingRole.partyRoleCharacteristic ?? []) {
            defaults[existing.name] = existing.value;
          }
        }
        setFormValues(defaults);
      })
      .catch(() => setCharacteristics([]))
      .finally(() => setLoadingChars(false));
  }, [selectedRoleTypeId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !selectedRoleName) return;

    for (const c of characteristics) {
      if (c.mandatory && !formValues[c.name]) {
        setError(`A característica "${c.name}" é obrigatória.`);
        return;
      }
    }

    const payload: Characteristic[] = [];
    for (const c of characteristics) {
      const val = formValues[c.name];
      if (val !== undefined && val !== null && val !== '') {
        payload.push({
          name: c.name,
          value: val,
          valueType: c.valueType,
          allowedValues: c.allowedValues ?? undefined,
        });
      }
    }

    const validFor: TimePeriod | undefined =
      startDate || endDate
        ? {
            ...(startDate ? { startDateTime: new Date(startDate).toISOString() } : {}),
            ...(endDate ? { endDateTime: new Date(endDate).toISOString() } : {}),
          }
        : undefined;

    setSaving(true);
    setError(null);
    try {
      if (isEditing && editingRole && onUpdate) {
        await onUpdate(editingRole.id, payload, validFor);
      } else {
        await onAssign(selectedRoleName, selectedRoleTypeId, payload, validFor);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? 'Falha ao atualizar papel da organização.'
            : 'Falha ao atribuir papel à organização.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-app-accent" />
          <span>
            {readOnly ? 'Papel de' : isEditing ? 'Editar Papel de' : 'Atribuir Papel a'} {organizationName}
          </span>
        </div>
      }
      width={500}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="assign-role-form"
              disabled={saving || !selectedRoleName}
            >
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Confirmar atribuição'}
            </Button>
          </>
        )
      }
    >
      <form id="assign-role-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[10px] bg-status-red-soft p-3 text-[0.82rem] text-status-red">
            {error}
          </div>
        )}

        <label className="block text-[0.8rem] font-semibold text-app-text">
          Selecione o papel a atribuir *
          <select
            value={selectedRoleTypeId}
            onChange={(e) => {
              const roleTypeId = e.target.value;
              const roleType = availableRoleTypes.find((r) => r.id === roleTypeId);
              setSelectedRoleTypeId(roleTypeId);
              setSelectedRoleName(roleType?.roleName ?? '');
            }}
            disabled={isEditing || readOnly}
            className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
          >
            {availableRoleTypes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Início da vigência
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={readOnly}
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            />
          </label>
          <label className="block text-[0.8rem] font-semibold text-app-text">
            Fim da vigência
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={readOnly}
              className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
            />
          </label>
        </div>

        {loadingChars ? (
          <div className="py-4 text-center text-[0.82rem] text-app-muted">
            Carregando campos do papel...
          </div>
        ) : characteristics.length > 0 ? (
          <div className="space-y-3 pt-2">
            <h5 className="text-[0.82rem] font-bold text-app-text">
              Características do papel
            </h5>
            {characteristics.map((c) => (
              <div key={c.id} className="space-y-1">
                <label className="block text-[0.78rem] font-semibold text-app-text">
                  {c.name} {c.mandatory ? '*' : ''}
                  {c.description && (
                    <span className="ml-1 font-normal text-app-muted">({c.description})</span>
                  )}
                </label>
                {c.valueType === 'boolean' ? (
                  <label className="flex items-center gap-2 pt-1 text-[0.82rem] text-app-text">
                    <input
                      type="checkbox"
                      checked={Boolean(formValues[c.name])}
                      onChange={(e) =>
                        setFormValues((curr) => ({ ...curr, [c.name]: e.target.checked }))
                      }
                      disabled={readOnly}
                      className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                    />
                    Sim
                  </label>
                ) : c.valueType === 'list' && c.allowedValues && c.allowedValues.length > 0 ? (
                  <select
                    value={String(formValues[c.name] ?? '')}
                    onChange={(e) =>
                      setFormValues((curr) => ({ ...curr, [c.name]: e.target.value }))
                    }
                    disabled={readOnly}
                    className="w-full rounded-[12px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                  >
                    <option value="">Selecione...</option>
                    {c.allowedValues.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={c.valueType === 'integer' || c.valueType === 'decimal' ? 'number' : 'text'}
                    value={String(formValues[c.name] ?? '')}
                    onChange={(e) =>
                      setFormValues((curr) => ({ ...curr, [c.name]: e.target.value }))
                    }
                    disabled={readOnly}
                    placeholder={`Informe ${c.name}...`}
                    className="w-full rounded-[12px] border border-app-border bg-app-panel px-3 py-2 text-[0.84rem] text-app-text outline-none focus:border-app-accent disabled:bg-[var(--surface-muted)]"
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
