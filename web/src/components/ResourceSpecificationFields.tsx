import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import type { Party } from '../services/partyApi';
import type { ResourceCategory, ResourceLayer, ResourceType } from '../services/resourceApi';
import { resourceFieldLabel } from '../utils/resourceFieldLabels';
import { RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS } from '../utils/resourceSpecificationCharacteristics';
import {
  buildTypeOptions,
  type ResourceSpecFormState,
} from '../utils/resourceSpecificationForm';
import Field from './Field';

/**
 * Campos do formulário de ResourceSpecification (catálogo de Recursos) — compartilhado pelo modal
 * embutido em ResourcePage (onde a categoria vem da página ativa) e pelo editor de catálogo em
 * Configurações (onde não há categoria de contexto, então `categoryOptions` habilita o select).
 */
export default function ResourceSpecificationFields({
  formState,
  onChange,
  resourceTypes,
  manufacturerOptions,
  resourceLayers,
  categoryOptions,
  selectionValid,
  lookupLoading = false,
}: {
  formState: ResourceSpecFormState;
  onChange: (next: ResourceSpecFormState) => void;
  resourceTypes: ResourceType[];
  manufacturerOptions: Party[];
  resourceLayers: ResourceLayer[];
  /** Quando presente, renderiza um select de Categoria (Configurações não tem categoria de página). */
  categoryOptions?: ResourceCategory[];
  selectionValid: boolean;
  lookupLoading?: boolean;
}) {
  const visibleTypeOptions = buildTypeOptions(resourceTypes, formState.category);
  const selectedResourceType = resourceTypes.find((type) => type.code === formState.resourceType);
  const selectedResourceTypeOption = visibleTypeOptions.find(
    (option) => option.code === formState.resourceType,
  );
  const selectedResourceTypeVisible = visibleTypeOptions.some(
    (option) => option.code === formState.resourceType,
  );
  const selectedManufacturer =
    manufacturerOptions.find((party) => party.id === formState.manufacturerPartyId) ?? null;
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [typeMenuOpen]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2 rounded-[18px] border border-app-accent-border bg-app-accent-soft p-4">
        <Field label="Camada de recurso">
          <select
            value={formState.resourceLayerId}
            onChange={(event) => onChange({ ...formState, resourceLayerId: event.target.value })}
            className="geo-input"
          >
            <option value="">Sem camada</option>
            {resourceLayers.map((layer) => (
              <option key={layer.id} value={layer.id} disabled={layer.status !== 'active'}>
                {layer.name}
                {layer.status !== 'active' ? ' (inativa)' : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Identificação
      </div>
      {categoryOptions ? (
        <Field label={resourceFieldLabel('category')}>
          <select
            value={formState.category}
            onChange={(event) =>
              onChange({ ...formState, category: event.target.value, resourceType: '' })
            }
            className="geo-input"
          >
            <option value="">Selecione uma categoria</option>
            {categoryOptions.map((option) => (
              <option key={option.code} value={option.code} disabled={option.status !== 'active'}>
                {option.name}
                {option.status !== 'active' ? ' (inativa)' : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={resourceFieldLabel('resourceType')}>
        <div ref={typeMenuRef} className="relative">
          <button
            type="button"
            role="combobox"
            aria-expanded={typeMenuOpen}
            aria-controls="resource-type-listbox"
            onClick={() => setTypeMenuOpen((current) => !current)}
            className="geo-input geo-combobox flex items-center justify-between gap-3 text-left"
            disabled={!formState.category || (lookupLoading && !resourceTypes.length)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedResourceTypeOption ? (
                <>
                  <selectedResourceTypeOption.icon
                    className="h-4 w-4 shrink-0 text-app-muted"
                    aria-hidden="true"
                  />
                  <span className="truncate">{selectedResourceTypeOption.label}</span>
                </>
              ) : (
                <span className="text-app-muted">Selecione um tipo</span>
              )}
            </span>
            <span className="geo-combobox-indicator">
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
          {typeMenuOpen ? (
            <div
              id="resource-type-listbox"
              role="listbox"
              className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[18px] border border-app-border bg-white p-2 shadow-modal"
            >
              {visibleTypeOptions.map((option) => {
                const OptionIcon = option.icon;
                const isSelected = option.code === formState.resourceType;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={!option.active}
                    onClick={() => {
                      onChange({ ...formState, resourceType: option.code });
                      setTypeMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] transition ${
                      isSelected
                        ? 'bg-app-accent-soft text-app-text'
                        : 'text-app-text hover:bg-app-accent-soft'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <OptionIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {!option.active ? (
                      <span className="text-[0.72rem] text-app-muted">(inativo)</span>
                    ) : null}
                  </button>
                );
              })}
              {formState.resourceType && (!selectedResourceType || !selectedResourceTypeVisible) ? (
                <button
                  type="button"
                  role="option"
                  aria-selected="true"
                  className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[0.92rem] text-amber-900 transition hover:bg-amber-50"
                  onClick={() => setTypeMenuOpen(false)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{formState.resourceType} (legado)</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
          required
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
          placeholder="Ex.: Roteador, ONT, OLT"
        />
      </Field>
      <Field label={resourceFieldLabel('equipmentCode')}>
        <input
          value={formState.equipmentCode}
          onChange={(event) => onChange({ ...formState, equipmentCode: event.target.value })}
          className="geo-input"
          placeholder="Ex.: EQ-OLT-001"
        />
      </Field>
      <div className="md:col-span-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        Comercial e homologação
      </div>
      <Field label={resourceFieldLabel('skuId')}>
        <input
          value={formState.skuId}
          onChange={(event) => onChange({ ...formState, skuId: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('homologationDate')}>
        <input
          type="date"
          value={formState.homologationDate}
          onChange={(event) => onChange({ ...formState, homologationDate: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('endOfLifeDate')}>
        <input
          type="date"
          value={formState.endOfLifeDate}
          onChange={(event) => onChange({ ...formState, endOfLifeDate: event.target.value })}
          className="geo-input"
        />
      </Field>
      <Field label={resourceFieldLabel('endOfSupportLifeDate')}>
        <input
          type="date"
          value={formState.endOfSupportLifeDate}
          onChange={(event) =>
            onChange({ ...formState, endOfSupportLifeDate: event.target.value })
          }
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
      <Field label={resourceFieldLabel('discontinued')}>
        <select
          value={formState.discontinued}
          onChange={(event) =>
            onChange({
              ...formState,
              discontinued: event.target.value as ResourceSpecFormState['discontinued'],
            })
          }
          className="geo-input"
        >
          <option value="">Selecione</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </Field>
      <Field label={resourceFieldLabel('supportsSdWan')}>
        <select
          value={formState.supportsSdWan}
          onChange={(event) =>
            onChange({
              ...formState,
              supportsSdWan: event.target.value as ResourceSpecFormState['supportsSdWan'],
            })
          }
          className="geo-input"
        >
          <option value="">Selecione</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </Field>
      <Field label={resourceFieldLabel('supportsVoice')}>
        <select
          value={formState.supportsVoice}
          onChange={(event) =>
            onChange({
              ...formState,
              supportsVoice: event.target.value as ResourceSpecFormState['supportsVoice'],
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
          Selecione uma categoria e um tipo ativos do catálogo. Valores legados precisam ser
          remapeados antes de salvar.
        </div>
      ) : null}
    </div>
  );
}
