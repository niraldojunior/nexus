import type { PartyRoleType } from '../../../services/partyRoleTypeApi';
import type { PartyRoleTypeCharacteristic } from '../../../services/partyRoleTypeCharacteristicApi';

export type RoleDraftItem = {
  localId: string;
  persistedId?: string;
  key: string;
  roleName: string;
  label: string;
  description?: string | null;
  active: boolean;
  characteristics: PartyRoleTypeCharacteristic[];
};

export type RolesSnapshot = {
  partyRoleTypes: Array<{
    id?: string;
    key: string;
    roleName: string;
    label: string;
    description?: string | null;
    active?: boolean;
    characteristics?: Array<{
      id?: string;
      name: string;
      group?: string | null;
      description?: string | null;
      valueType: string;
      allowedValues?: string[] | null;
      referenceDataSetKey?: string | null;
      sortOrder?: number;
      mandatory?: boolean;
      defaultValue?: string | null;
    }>;
  }>;
};

export function draftRolesFromCanonical(
  types: PartyRoleType[],
  characteristicsByRole: Record<string, PartyRoleTypeCharacteristic[]>,
): RoleDraftItem[] {
  return types.map((type) => ({
    localId: type.id,
    persistedId: type.id,
    key: type.key,
    roleName: type.roleName,
    label: type.label,
    description: type.description,
    active: type.active !== false,
    // Chave é o `id` do papel — characteristics são separadas por instância de papel (não por
    // roleName), permitindo múltiplos papéis do mesmo tipo (ex.: "Fabricante de ONT"/"...OLT").
    characteristics: characteristicsByRole[type.id] ?? [],
  }));
}

export function draftRolesFromSnapshot(
  snapshot: Record<string, unknown> | undefined,
  canonicalTypes: PartyRoleType[],
  canonicalCharsByRole: Record<string, PartyRoleTypeCharacteristic[]>,
): RoleDraftItem[] | null {
  if (!snapshot || !Array.isArray((snapshot as RolesSnapshot).partyRoleTypes)) return null;
  const canonicalById = new Map(canonicalTypes.map((t) => [t.id, t]));
  const canonicalByKey = new Map(canonicalTypes.map((t) => [t.key.toLowerCase(), t]));

  return (snapshot as RolesSnapshot).partyRoleTypes.map((item, index) => {
    const canonical = item.id
      ? canonicalById.get(item.id)
      : canonicalByKey.get(item.key.toLowerCase());
    const roleName = item.roleName || canonical?.roleName || `role-${index}`;
    const roleTypeId = canonical?.id ?? item.id ?? `temp-role-${index}`;
    const chars: PartyRoleTypeCharacteristic[] = (item.characteristics ?? []).map((c, cIdx) => ({
      id: c.id ?? `char-${index}-${cIdx}`,
      tenantId: '',
      roleName,
      name: c.name,
      group: c.group ?? null,
      description: c.description ?? null,
      valueType: (c.valueType as PartyRoleTypeCharacteristic['valueType']) || 'string',
      allowedValues: c.allowedValues ?? null,
      referenceDataSetKey: c.referenceDataSetKey ?? null,
      sortOrder: c.sortOrder ?? (cIdx + 1) * 10,
      mandatory: Boolean(c.mandatory),
      defaultValue: c.defaultValue ?? null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    return {
      localId: canonical?.id ?? item.id ?? `temp-role-${index}`,
      persistedId: canonical?.id ?? item.id,
      key: item.key,
      roleName: item.roleName,
      label: item.label,
      description: item.description ?? null,
      active: item.active !== false,
      characteristics: chars.length > 0 ? chars : canonicalCharsByRole[roleTypeId] ?? [],
    };
  });
}

export function buildRolesSnapshot(drafts: RoleDraftItem[]): RolesSnapshot {
  return {
    partyRoleTypes: drafts.map((draft) => ({
      id: draft.persistedId,
      key: draft.key.trim(),
      roleName: draft.roleName.trim(),
      label: draft.label.trim(),
      description: draft.description?.trim() || null,
      active: draft.active,
      characteristics: draft.characteristics.map((c) => ({
        id: c.id.startsWith('temp-') || c.id.startsWith('char-') ? undefined : c.id,
        name: c.name.trim(),
        group: c.group?.trim() || null,
        description: c.description?.trim() || null,
        valueType: c.valueType,
        allowedValues: c.allowedValues,
        referenceDataSetKey: c.referenceDataSetKey,
        sortOrder: c.sortOrder,
        mandatory: c.mandatory,
        defaultValue: c.defaultValue,
      })),
    })),
  };
}

export function createRoleDraftItem(): RoleDraftItem {
  const tempId = `temp-role-${Date.now()}`;
  return {
    localId: tempId,
    key: '',
    roleName: '',
    label: '',
    description: null,
    active: true,
    characteristics: [],
  };
}
