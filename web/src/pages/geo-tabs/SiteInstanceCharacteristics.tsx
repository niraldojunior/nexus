import { useEffect, useState } from 'react';
import type { GeoSpecCharacteristic } from '../../services/geoApi';
import { coerceValue, type CharacteristicValueType } from '../../utils/geoCharacteristicsForm';
import {
  listReferenceDataSets,
  listReferenceDataValues,
} from '../../services/studioReferenceDataApi';
import { getParty, listOrganizationsByRoleTypeIds } from '../../services/partyApi';
import { Info } from './InfoRow';
import { InlineEditRow } from './InlineEditRow';

type GeoCharacteristicValue = { name: string; value: unknown; valueType?: string; group?: string };

export type SiteInstanceCharacteristicsProps = {
  definitions: GeoSpecCharacteristic[];
  characteristic: GeoCharacteristicValue[] | undefined;
  canEdit: boolean;
  onPatch: (patch: { characteristic: GeoCharacteristicValue[] }) => Promise<void>;
};

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function SiteInstanceCharacteristics({
  definitions,
  characteristic,
  canEdit,
  onPatch,
}: SiteInstanceCharacteristicsProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [referenceOptions, setReferenceOptions] = useState<Record<string, string[]>>({});
  const [roleOrganizations, setRoleOrganizations] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  const [resolvedOrgNames, setResolvedOrgNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const orgDefs = definitions.filter((d) => d.valueType === 'organization');
    for (const def of orgDefs) {
      const partyId = valueToText(characteristic?.find((c) => c.name === def.name)?.value);
      if (partyId && !resolvedOrgNames[partyId]) {
        void getParty(partyId)
          .then((party) => {
            setResolvedOrgNames((prev) => ({ ...prev, [partyId]: party.name }));
          })
          .catch(() => {});
      }
    }
  }, [definitions, characteristic, resolvedOrgNames]);

  if (definitions.length === 0) return null;

  const startEdit = (def: GeoSpecCharacteristic, currentText: string) => {
    setDraft(currentText);
    setEditingName(def.name);
    const setKey = def.referenceDataSetKey;
    if (def.valueType === 'list' && setKey && !referenceOptions[setKey]) {
      void listReferenceDataSets()
        .then((sets) => {
          const set = sets.find((s) => s.key === setKey);
          if (!set) return [];
          return listReferenceDataValues(set.id);
        })
        .then((values) => {
          setReferenceOptions((prev) => ({ ...prev, [setKey]: values.map((v) => v.key) }));
        })
        .catch(() => {
          setReferenceOptions((prev) => ({ ...prev, [setKey]: [] }));
        });
    }
    if (def.valueType === 'organization' && def.allowedValues && def.allowedValues.length > 0) {
      const allowedStr = def.allowedValues.map(String);
      const cacheKey = allowedStr.sort().join(',');
      if (!roleOrganizations[cacheKey]) {
        void listOrganizationsByRoleTypeIds(allowedStr)
          .then((orgs) => {
            setRoleOrganizations((prev) => ({ ...prev, [cacheKey]: orgs }));
            for (const org of orgs) {
              setResolvedOrgNames((prev) => ({ ...prev, [org.id]: org.name }));
            }
          })
          .catch(() => {
            setRoleOrganizations((prev) => ({ ...prev, [cacheKey]: [] }));
          });
      }
    }
  };

  const commitValue = (def: GeoSpecCharacteristic, textValue: string) => {
    setEditingName(null);
    const currentText = valueToText(characteristic?.find((c) => c.name === def.name)?.value);
    if (textValue === currentText) return;
    const rest = (characteristic ?? []).filter((c) => c.name !== def.name);
    const valueType = (def.valueType ?? 'string') as CharacteristicValueType;
    const isEmpty = textValue.trim() === '';
    const next = isEmpty
      ? rest
      : [
          ...rest,
          { name: def.name, value: coerceValue(textValue, valueType), valueType: def.valueType },
        ];
    void onPatch({ characteristic: next });
  };

  const commit = (def: GeoSpecCharacteristic) => {
    commitValue(def, draft);
  };

  return (
    <>
      {definitions.map((def) => {
        const currentValue = characteristic?.find((c) => c.name === def.name)?.value;
        const currentText = valueToText(currentValue);
        const editing = editingName === def.name;
        const listOptions =
          def.valueType === 'list'
            ? ((def.referenceDataSetKey
                ? referenceOptions[def.referenceDataSetKey]
                : def.allowedValues?.map(String)) ?? [])
            : [];

        const displayValue =
          def.valueType === 'organization' && currentText
            ? (resolvedOrgNames[currentText] ?? currentText)
            : currentText;

        if (!canEdit) {
          return displayValue ? (
            <Info key={def.name} label={def.name} value={displayValue} />
          ) : null;
        }

        const orgCacheKey = (def.allowedValues ?? []).map(String).sort().join(',');
        const orgOptions = roleOrganizations[orgCacheKey] ?? [];

        return (
          <InlineEditRow
            key={def.name}
            label={def.name}
            editing={editing}
            onActivate={() => startEdit(def, currentText)}
            value={displayValue || <span className="text-app-muted">—</span>}
          >
            {def.valueType === 'boolean' ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  autoFocus
                  type="checkbox"
                  checked={draft === 'true'}
                  onChange={(event) => {
                    const nextVal = event.target.checked ? 'true' : 'false';
                    setDraft(nextVal);
                    commitValue(def, nextVal);
                  }}
                  className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                />
                <span className="text-[0.82rem] text-app-text">
                  {draft === 'true' ? 'Sim' : 'Não'}
                </span>
              </label>
            ) : def.valueType === 'list' && listOptions.length > 0 ? (
              <select
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => commit(def)}
                aria-label={def.name}
                className="geo-input geo-input-inline"
              >
                <option value="">—</option>
                {listOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : def.valueType === 'organization' ? (
              <select
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => commit(def)}
                aria-label={def.name}
                className="geo-input geo-input-inline"
              >
                <option value="">—</option>
                {orgOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                type={
                  def.valueType === 'date'
                    ? 'date'
                    : def.valueType === 'integer' || def.valueType === 'decimal'
                      ? 'number'
                      : 'text'
                }
                step={
                  def.valueType === 'integer'
                    ? '1'
                    : def.valueType === 'decimal'
                      ? 'any'
                      : undefined
                }
                value={draft}
                onChange={(event) => {
                  const val = event.target.value;
                  if (def.valueType === 'integer' && val !== '' && !/^-?\d*$/.test(val)) {
                    return;
                  }
                  setDraft(val);
                }}
                onBlur={() => commit(def)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setEditingName(null);
                }}
                placeholder={valueToText(def.defaultValue) || 'Valor da característica'}
                aria-label={def.name}
                className="geo-input geo-input-inline"
              />
            )}
          </InlineEditRow>
        );
      })}
    </>
  );
}
