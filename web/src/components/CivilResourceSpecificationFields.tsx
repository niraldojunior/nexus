import type { Party } from '../services/partyApi';
import type { ResourceType } from '../services/resourceApi';
import { resourceFieldLabel } from '../utils/resourceFieldLabels';
import { resourceTypeLabel } from '../utils/resourceIcon';
import { RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS } from '../utils/resourceSpecificationCharacteristics';
import {
  CIVIL_INFRASTRUCTURE_CATEGORY_CODE,
  type ResourceSpecFormState,
} from '../utils/resourceSpecificationForm';
import Field from './Field';

/**
 * Versão simplificada de ResourceSpecificationFields para o catálogo de Infraestrutura Civil
 * (dutos, postes, caixas de passagem) — obra civil não tem tipo de rede, comercial/homologação
 * ou capacidades de equipamento de rede (SD-WAN, Voz), então esses campos ficam de fora. Reusa o
 * mesmo `ResourceSpecFormState`/payload de ResourceSpecificationFields; a categoria já vem fixa
 * do chamador (aba Civil de ResourceCatalogTab), então não há select de Categoria aqui.
 */
export default function CivilResourceSpecificationFields({
  formState,
  onChange,
  resourceTypes,
  manufacturerOptions,
  selectionValid,
}: {
  formState: ResourceSpecFormState;
  onChange: (next: ResourceSpecFormState) => void;
  resourceTypes: ResourceType[];
  manufacturerOptions: Party[];
  selectionValid: boolean;
}) {
  const typeOptions = resourceTypes
    .filter((type) => type.categoryCode === CIVIL_INFRASTRUCTURE_CATEGORY_CODE)
    .map((type) => ({ ...type, label: resourceTypeLabel(type.code) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const selectedManufacturer =
    manufacturerOptions.find((party) => party.id === formState.manufacturerPartyId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Identificação
      </div>
      <Field label={resourceFieldLabel('resourceType')}>
        <select
          value={formState.resourceType}
          onChange={(event) => onChange({ ...formState, resourceType: event.target.value })}
          className="geo-input"
        >
          <option value="">Selecione um tipo</option>
          {typeOptions.map((option) => (
            <option key={option.code} value={option.code} disabled={option.status !== 'active'}>
              {option.label}
              {option.status !== 'active' ? ' (inativo)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label={resourceFieldLabel('manufacturer')}>
        <select
          value={formState.manufacturerPartyId}
          onChange={(event) => onChange({ ...formState, manufacturerPartyId: event.target.value })}
          className="geo-input"
        >
          <option value="">Selecione um fabricante</option>
          {manufacturerOptions.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
        {selectedManufacturer ? (
          <span className="text-[0.72rem] font-medium normal-case tracking-normal text-app-muted">
            Selecionado: {selectedManufacturer.name}
          </span>
        ) : null}
      </Field>
      <Field label={resourceFieldLabel('model')}>
        <input
          value={formState.model}
          onChange={(event) => onChange({ ...formState, model: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('equipmentFunction')}>
        <input
          value={formState.equipmentFunction}
          onChange={(event) => onChange({ ...formState, equipmentFunction: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('equipmentCode')}>
        <input
          value={formState.equipmentCode}
          onChange={(event) => onChange({ ...formState, equipmentCode: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('skuId')}>
        <input
          value={formState.skuId}
          onChange={(event) => onChange({ ...formState, skuId: event.target.value })}
          className="geo-input"
        />
      </Field>
      <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Capacidades e ciclo de vida
      </div>
      <Field label={resourceFieldLabel('stockable')}>
        <select
          value={formState.stockable}
          onChange={(event) =>
            onChange({
              ...formState,
              stockable: event.target.value as ResourceSpecFormState['stockable'],
            })
          }
          className="geo-input"
        >
          <option value="">Selecione</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </Field>
      <Field label={resourceFieldLabel('lifecycleStatus')}>
        <select
          value={formState.lifecycleStatus}
          onChange={(event) => onChange({ ...formState, lifecycleStatus: event.target.value })}
          className="geo-input"
        >
          <option value="">Selecione um status</option>
          {RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={resourceFieldLabel('description')} fullWidth>
        <textarea
          value={formState.description}
          onChange={(event) => onChange({ ...formState, description: event.target.value })}
          className="min-h-[116px] rounded-[16px] border border-app-border bg-white px-3 py-2 text-[0.9rem] text-app-text shadow-sm"
        />
      </Field>
      {!selectionValid ? (
        <div className="md:col-span-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-[0.88rem] text-amber-900">
          Selecione um tipo ativo do catálogo. Valores legados precisam ser remapeados antes de
          salvar.
        </div>
      ) : null}
    </div>
  );
}
