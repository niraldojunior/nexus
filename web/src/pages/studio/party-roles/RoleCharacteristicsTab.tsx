import { useMemo, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import type { RoleDraftItem } from './roleDraft';
import { Button } from '../../../components/ui';
import {
  buildPartyRoleCharacteristicPayload,
  partyRoleCharacteristicRowsFrom,
  type PartyRoleCharacteristicRow,
} from '../../../utils/partyCharacteristicsForm';
import { RoleCharacteristicFormModal } from './RoleCharacteristicFormModal';
import { CharacteristicListRow } from '../shared/CharacteristicListRow';

const VALUE_TYPE_LABELS: Record<string, string> = {
  string: 'Texto',
  integer: 'Inteiro',
  decimal: 'Decimal',
  boolean: 'Booleano',
  date: 'Data',
  list: 'Lista de opções',
  json: 'JSON livre',
};

export type RoleCharacteristicsTabProps = {
  item: RoleDraftItem;
  canMutate: boolean;
  onChange: (updated: Partial<RoleDraftItem>) => void;
};

export function RoleCharacteristicsTab({ item, canMutate, onChange }: RoleCharacteristicsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PartyRoleCharacteristicRow | null>(null);

  const rows = useMemo(
    () => partyRoleCharacteristicRowsFrom(item.characteristics),
    [item.characteristics],
  );

  const handleOpenNew = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (row: PartyRoleCharacteristicRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSaveRow = (row: PartyRoleCharacteristicRow) => {
    const exists = rows.some((r) => r.key === row.key);
    const nextRows = exists ? rows.map((r) => (r.key === row.key ? row : r)) : [...rows, row];
    onChange({ characteristics: buildPartyRoleCharacteristicPayload(nextRows) });
  };

  const handleDeleteRow = (key: string) => {
    const nextRows = rows.filter((r) => r.key !== key);
    onChange({ characteristics: buildPartyRoleCharacteristicPayload(nextRows) });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[0.88rem] font-bold text-app-text">
            Catálogo de Características do Papel
          </h4>
          <p className="text-[0.78rem] text-app-muted">
            Campos que serão solicitados dinamicamente ao atribuir este papel a uma organização.
          </p>
        </div>
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={handleOpenNew}
          >
            Adicionar característica
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-app-border p-8 text-center">
          <Tag className="h-8 w-8 text-app-muted opacity-40" />
          <p className="mt-2 text-[0.84rem] font-semibold text-app-text">
            Nenhuma característica configurada
          </p>
          <p className="mt-0.5 max-w-sm text-[0.78rem] text-app-muted">
            Este papel atualmente não exige campos específicos ao ser atribuído a uma organização.
          </p>
          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={handleOpenNew}
              className="mt-3"
            >
              Criar primeira característica
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <CharacteristicListRow
              key={row.key}
              variant="card"
              name={row.name}
              typeLabel={VALUE_TYPE_LABELS[row.valueType] ?? row.valueType}
              group={row.group}
              mandatory={row.mandatory}
              leadingIcon={
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-app-accent-soft text-app-accent">
                  <Tag className="h-4 w-4" />
                </div>
              }
              extraMeta={
                (row.hasDefaultValue || row.referenceDataSetKey) && (
                  <div className="mt-0.5 flex items-center gap-3 text-[0.76rem] text-app-muted">
                    {row.hasDefaultValue && <span>Padrão: {row.valueText || '—'}</span>}
                    {row.referenceDataSetKey && <span>Ref: {row.referenceDataSetKey}</span>}
                  </div>
                )
              }
              onClick={() => handleOpenEdit(row)}
              onDelete={canMutate ? () => handleDeleteRow(row.key) : undefined}
            />
          ))}
        </div>
      )}

      <RoleCharacteristicFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editingRow={editingRow}
        readOnly={!canMutate}
        existingNames={rows.filter((r) => r.key !== editingRow?.key).map((r) => r.name)}
        onSave={handleSaveRow}
      />
    </div>
  );
}
