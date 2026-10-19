import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Boxes,
  Grid3X3,
  Layers3,
  List,
  Move,
  Rows,
} from 'lucide-react';
import type { GeoSpec } from '../../../services/geoApi';
import type {
  ResourceRelationshipCardinality,
  ResourceRelationshipDefinitionConfiguration,
  ResourceRelationshipDefinitionValidationRules,
  ResourceRelationshipTargetKind,
  ResourceRelationshipType,
  ResourceType,
  ResourceTypeRelationshipRule,
} from '../../../services/resourceApi';
import { Button, Modal, Switch } from '../../../components/ui';

export type RelationshipRuleModalMode = 'create' | 'edit' | 'view';

export type ResourceRelationshipRuleFormValue = {
  relationshipTypeCode: string;
  targetKind: ResourceRelationshipTargetKind;
  targetId: string;
  cardinality?: ResourceRelationshipCardinality;
  configuration?: ResourceRelationshipDefinitionConfiguration | null;
  validationRules?: ResourceRelationshipDefinitionValidationRules;
};

type PlacementPolicy = 'NONE' | 'LINEAR' | 'GRID';
type CardinalityMode = 'none' | 'one' | 'max';

type OrganizationOption = {
  policy: PlacementPolicy | 'REGIONS' | 'FREEFORM';
  label: string;
  description: string;
  icon: typeof List;
  available: boolean;
};

const targetKindLabel: Record<ResourceRelationshipTargetKind, string> = {
  RESOURCE_TYPE: 'Tipo de Recurso',
  GEOGRAPHIC_SITE_SPECIFICATION: 'Tipo de Local',
};

const targetKindSelectableRelationshipCodes = new Set(['mountedOn', 'feeds']);

const organizationOptions: OrganizationOption[] = [
  {
    policy: 'NONE',
    label: 'Padrão',
    description: 'Lista simples de componentes.',
    icon: List,
    available: true,
  },
  {
    policy: 'LINEAR',
    label: 'Linear',
    description: 'Sequência de posições estruturais.',
    icon: Rows,
    available: true,
  },
  {
    policy: 'GRID',
    label: 'Grade',
    description: 'Matriz de linhas e colunas.',
    icon: Grid3X3,
    available: false,
  },
  {
    policy: 'REGIONS',
    label: 'Regiões',
    description: 'Áreas com regras próprias.',
    icon: Layers3,
    available: false,
  },
  {
    policy: 'FREEFORM',
    label: 'Livre',
    description: 'Posicionamento em canvas.',
    icon: Move,
    available: false,
  },
];

function dedupeByCode(types: ResourceType[]): ResourceType[] {
  const seen = new Set<string>();
  return types.filter((type) => {
    const key = type.code || type.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cardinalityFromRule(rule: ResourceTypeRelationshipRule | undefined): {
  mode: CardinalityMode;
  max: string;
} {
  const max = rule?.cardinality?.maxTargetPerSource;
  if (max === 1) return { mode: 'one', max: '' };
  if (typeof max === 'number' && max > 1) return { mode: 'max', max: String(max) };
  return { mode: 'none', max: '' };
}

export function ResourceRelationshipRuleModal({
  mode,
  rule,
  relationshipTypes,
  resourceTypes,
  geoSpecs,
  sourceResourceTypeId,
  sourceResourceTypeName,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  mode: RelationshipRuleModalMode;
  rule?: ResourceTypeRelationshipRule;
  relationshipTypes: ResourceRelationshipType[];
  resourceTypes: ResourceType[];
  geoSpecs: GeoSpec[];
  sourceResourceTypeId: string;
  sourceResourceTypeName: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: ResourceRelationshipRuleFormValue) => Promise<void>;
}) {
  const readOnly = mode === 'view';
  const initialCardinality = cardinalityFromRule(rule);
  const [relationshipCode, setRelationshipCode] = useState(
    rule?.relationshipTypeCode ?? relationshipTypes[0]?.code ?? '',
  );
  const [targetKind, setTargetKind] = useState<ResourceRelationshipTargetKind>(
    rule?.targetKind ?? relationshipTypes[0]?.allowedTargetKinds[0] ?? 'RESOURCE_TYPE',
  );
  const [targetId, setTargetId] = useState(rule?.targetId ?? '');
  const [cardinalityMode, setCardinalityMode] = useState<CardinalityMode>(initialCardinality.mode);
  const [cardinalityMax, setCardinalityMax] = useState(initialCardinality.max);
  const [required, setRequired] = useState(rule?.validationRules?.required ?? false);
  const [placementPolicy, setPlacementPolicy] = useState<PlacementPolicy>(
    rule?.configuration?.placementPolicy ?? 'NONE',
  );
  const [linearAxis, setLinearAxis] = useState<'vertical' | 'horizontal'>(
    rule?.configuration?.placementPolicy === 'LINEAR' ? rule.configuration.axis : 'vertical',
  );
  const [linearUnitLabel, setLinearUnitLabel] = useState(
    rule?.configuration?.placementPolicy === 'LINEAR' ? rule.configuration.unitLabel : 'U',
  );
  const [linearCapacity, setLinearCapacity] = useState(
    rule?.configuration?.placementPolicy === 'LINEAR' ? String(rule.configuration.capacity) : '',
  );
  const [numberingDirection, setNumberingDirection] = useState<'ascending' | 'descending'>(
    rule?.configuration?.placementPolicy === 'LINEAR'
      ? rule.configuration.numberingDirection
      : 'ascending',
  );
  const [gridRows, setGridRows] = useState(
    rule?.configuration?.placementPolicy === 'GRID' ? String(rule.configuration.rows) : '',
  );
  const [gridColumns, setGridColumns] = useState(
    rule?.configuration?.placementPolicy === 'GRID' ? String(rule.configuration.columns) : '',
  );
  const [fillOrder, setFillOrder] = useState<'row-major' | 'column-major'>(
    rule?.configuration?.placementPolicy === 'GRID' ? rule.configuration.fillOrder : 'row-major',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const selectedRelationshipType = relationshipTypes.find((item) => item.code === relationshipCode);
  const allowedTargetKinds = selectedRelationshipType?.allowedTargetKinds ?? [];
  const canChooseTargetKind =
    targetKindSelectableRelationshipCodes.has(relationshipCode) &&
    allowedTargetKinds.includes('RESOURCE_TYPE') &&
    allowedTargetKinds.includes('GEOGRAPHIC_SITE_SPECIFICATION');
  const isContainment = relationshipCode === 'containsAsChild';

  useEffect(() => {
    const nextTargetKind = canChooseTargetKind ? targetKind : 'RESOURCE_TYPE';
    if (!allowedTargetKinds.includes(nextTargetKind) || nextTargetKind !== targetKind) {
      setTargetKind(allowedTargetKinds.includes('RESOURCE_TYPE') ? 'RESOURCE_TYPE' : nextTargetKind);
      setTargetId('');
    }
  }, [allowedTargetKinds, canChooseTargetKind, targetKind]);
  const targetOptions = useMemo(
    () =>
      targetKind === 'RESOURCE_TYPE'
        ? dedupeByCode(
            resourceTypes.filter((type) => type.id !== sourceResourceTypeId && type.status === 'active'),
          )
            .map((type) => ({ id: type.id, name: type.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
        : geoSpecs
            .map((spec) => ({ id: spec.id, name: spec.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })),
    [geoSpecs, resourceTypes, sourceResourceTypeId, targetKind],
  );
  const selectedTargetName = targetOptions.find((option) => option.id === targetId)?.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (!relationshipCode) return setFormError('Selecione um tipo de relação.');
    if (!targetId) return setFormError('Selecione um alvo para a relação.');

    let cardinality: ResourceRelationshipCardinality | undefined;
    if (cardinalityMode === 'one') cardinality = { maxTargetPerSource: 1 };
    if (cardinalityMode === 'max') {
      const value = Number.parseInt(cardinalityMax.trim(), 10);
      if (!Number.isInteger(value) || value < 1) {
        return setFormError('Informe uma quantidade máxima válida (número inteiro >= 1).');
      }
      cardinality = { maxTargetPerSource: value };
    }

    let configuration: ResourceRelationshipDefinitionConfiguration | null | undefined;
    if (isContainment) {
      if (placementPolicy === 'LINEAR') {
        const capacity = Number.parseInt(linearCapacity.trim(), 10);
        if (!linearUnitLabel.trim() || !Number.isInteger(capacity) || capacity < 1) {
          return setFormError('Informe unidade e capacidade positiva para o layout linear.');
        }
        configuration = {
          version: 1,
          placementPolicy: 'LINEAR',
          axis: linearAxis,
          unitLabel: linearUnitLabel.trim(),
          capacity,
          numberingDirection,
        };
      } else if (placementPolicy === 'GRID') {
        const rows = Number.parseInt(gridRows.trim(), 10);
        const columns = Number.parseInt(gridColumns.trim(), 10);
        if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
          return setFormError('Informe linhas e colunas positivas para a grade.');
        }
        configuration = { version: 1, placementPolicy: 'GRID', rows, columns, fillOrder };
      } else {
        configuration = { version: 1, placementPolicy: 'NONE' };
      }
    } else if (rule?.configuration) {
      configuration = null;
    }

    const { required: _required, ...preservedRules } = rule?.validationRules ?? {};
    const validationRules = required ? { ...preservedRules, required: true } : preservedRules;
    setFormError(null);
    await onSubmit({
      relationshipTypeCode: relationshipCode,
      targetKind,
      targetId,
      cardinality,
      ...(configuration !== undefined ? { configuration } : {}),
      ...(Object.keys(validationRules).length > 0 ? { validationRules } : {}),
    });
  };

  const title = readOnly ? 'Detalhes da relação' : rule ? 'Editar relação' : 'Adicionar relação';
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={isContainment ? 960 : 460}
      footer={
        readOnly ? (
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="resource-relationship-rule-form" size="sm" loading={saving}>
              {rule ? 'Salvar' : 'Adicionar'}
            </Button>
          </>
        )
      }
    >
      <form id="resource-relationship-rule-form" onSubmit={submit} className="space-y-2.5">
        {(error || formError) && (
          <div
            className="flex items-center gap-2 rounded-[10px] p-2.5 text-[0.82rem]"
            style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError ?? error}</span>
          </div>
        )}
        <fieldset disabled={readOnly || saving} className="space-y-2 disabled:opacity-100">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[0.74rem] text-app-muted">
            <span>
              <span>Definição para:</span>{' '}
              <strong className="font-semibold text-app-text">{sourceResourceTypeName}</strong>
            </span>
            {selectedRelationshipType && selectedTargetName && (
              <span className="font-medium text-app-text">
                {sourceResourceTypeName} → {selectedRelationshipType.name} → {selectedTargetName}
              </span>
            )}
          </div>
          <div
            className={
              isContainment
                ? 'grid gap-3 lg:grid-cols-[minmax(250px,0.3fr)_minmax(0,0.7fr)]'
                : ''
            }
          >
            <section className="space-y-2 rounded-[10px] border border-app-border bg-app-sidebar/35 p-3">
              <Field label="Tipo de relação" htmlFor="form-rule-relationship-type">
                <select
                  id="form-rule-relationship-type"
                  value={relationshipCode}
                  onChange={(event) => {
                    setRelationshipCode(event.target.value);
                    setTargetId('');
                  }}
                  className="geo-input"
                >
                  {relationshipTypes.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </Field>
              {canChooseTargetKind && (
                <Field label="Tipo de alvo" htmlFor="form-rule-target-kind">
                  <select
                    id="form-rule-target-kind"
                    value={targetKind}
                    onChange={(event) => {
                      setTargetKind(event.target.value as ResourceRelationshipTargetKind);
                      setTargetId('');
                    }}
                    className="geo-input"
                  >
                    {allowedTargetKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {targetKindLabel[kind]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={targetKindLabel[targetKind]} htmlFor="form-rule-target-id">
                <select
                  id="form-rule-target-id"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="geo-input"
                >
                  <option value="">Selecione…</option>
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cardinalidade" htmlFor="form-rule-cardinality">
                <select
                  id="form-rule-cardinality"
                  value={cardinalityMode}
                  onChange={(event) => setCardinalityMode(event.target.value as CardinalityMode)}
                  className="geo-input"
                >
                  <option value="none">Sem restrição</option>
                  <option value="one">Exatamente 1</option>
                  <option value="max">No máximo N</option>
                </select>
              </Field>
              {cardinalityMode === 'max' && (
                <Field label="Quantidade máxima" htmlFor="form-rule-cardinality-max">
                  <input
                    id="form-rule-cardinality-max"
                    type="number"
                    min="1"
                    step="1"
                    value={cardinalityMax}
                    onChange={(event) => setCardinalityMax(event.target.value)}
                    className="geo-input font-mono"
                  />
                </Field>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-app-border bg-app-panel px-3 py-1.5">
                <div>
                  <p className="text-[0.78rem] font-semibold text-app-text">Obrigatória</p>
                  <p className="mt-0.5 text-[0.68rem] text-app-muted">
                    Exige esta relação na validação do recurso.
                  </p>
                </div>
                <Switch checked={required} onCheckedChange={setRequired} aria-label="Relação obrigatória" />
              </div>
            </section>

            {isContainment && (
              <section className="rounded-[10px] border border-app-border p-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-[0.84rem] font-semibold text-app-text">Organização dos componentes</h4>
                  <p className="text-right text-[0.68rem] text-app-muted">
                    Estrutura dos componentes relacionados.
                  </p>
                </div>
                <div className="mt-1.5 grid grid-cols-5 gap-1" role="group" aria-label="Organização dos componentes">
                  {organizationOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = placementPolicy === option.policy;
                    return (
                      <button
                        key={option.policy}
                        type="button"
                        aria-pressed={option.available ? selected : undefined}
                        aria-disabled={!option.available}
                        aria-description={
                          option.available ? undefined : `${option.description} Disponível em breve.`
                        }
                        disabled={!option.available}
                        onClick={() => {
                          if (option.available) setPlacementPolicy(option.policy as PlacementPolicy);
                        }}
                        className={`relative flex flex-col items-center justify-center rounded-[8px] border px-1 py-1 text-center transition ${
                          option.available
                            ? selected
                              ? 'border-app-accent-border bg-app-accent-soft text-app-text shadow-sm'
                              : 'border-app-border bg-app-panel text-app-text hover:border-app-border-strong hover:bg-app-sidebar/60'
                            : 'cursor-not-allowed border-dashed border-app-border bg-app-sidebar/30 text-app-muted opacity-70'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="mt-0.5 text-[0.64rem] font-semibold leading-tight">{option.label}</span>
                        {!option.available && (
                          <span className="absolute right-0.5 top-0.5 rounded-full bg-[var(--surface-muted)] px-1 py-0.2 text-[0.48rem] font-semibold text-app-muted">
                            Em breve
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <OrganizationConfiguration
                  policy={placementPolicy}
                  linearAxis={linearAxis}
                  linearUnitLabel={linearUnitLabel}
                  linearCapacity={linearCapacity}
                  numberingDirection={numberingDirection}
                  gridRows={gridRows}
                  gridColumns={gridColumns}
                  fillOrder={fillOrder}
                  onLinearAxisChange={setLinearAxis}
                  onLinearUnitLabelChange={setLinearUnitLabel}
                  onLinearCapacityChange={setLinearCapacity}
                  onNumberingDirectionChange={setNumberingDirection}
                  onGridRowsChange={setGridRows}
                  onGridColumnsChange={setGridColumns}
                  onFillOrderChange={setFillOrder}
                />
              </section>
            )}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-[0.74rem] font-medium text-app-muted">
      {label}
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

function OrganizationConfiguration({
  policy,
  linearAxis,
  linearUnitLabel,
  linearCapacity,
  numberingDirection,
  gridRows,
  gridColumns,
  fillOrder,
  onLinearAxisChange,
  onLinearUnitLabelChange,
  onLinearCapacityChange,
  onNumberingDirectionChange,
  onGridRowsChange,
  onGridColumnsChange,
  onFillOrderChange,
}: {
  policy: PlacementPolicy;
  linearAxis: 'vertical' | 'horizontal';
  linearUnitLabel: string;
  linearCapacity: string;
  numberingDirection: 'ascending' | 'descending';
  gridRows: string;
  gridColumns: string;
  fillOrder: 'row-major' | 'column-major';
  onLinearAxisChange: (value: 'vertical' | 'horizontal') => void;
  onLinearUnitLabelChange: (value: string) => void;
  onLinearCapacityChange: (value: string) => void;
  onNumberingDirectionChange: (value: 'ascending' | 'descending') => void;
  onGridRowsChange: (value: string) => void;
  onGridColumnsChange: (value: string) => void;
  onFillOrderChange: (value: 'row-major' | 'column-major') => void;
}) {
  const content =
    policy === 'LINEAR' ? (
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Orientação" htmlFor="form-rule-linear-axis">
          <select id="form-rule-linear-axis" value={linearAxis} onChange={(event) => onLinearAxisChange(event.target.value as 'vertical' | 'horizontal')} className="geo-input">
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </Field>
        <Field label="Unidade" htmlFor="form-rule-linear-unit">
          <input id="form-rule-linear-unit" value={linearUnitLabel} onChange={(event) => onLinearUnitLabelChange(event.target.value)} className="geo-input" />
        </Field>
        <Field label="Capacidade" htmlFor="form-rule-linear-capacity">
          <input id="form-rule-linear-capacity" type="number" min="1" step="1" value={linearCapacity} onChange={(event) => onLinearCapacityChange(event.target.value)} className="geo-input font-mono" />
        </Field>
        <Field label="Direção da numeração" htmlFor="form-rule-linear-direction">
          <select id="form-rule-linear-direction" value={numberingDirection} onChange={(event) => onNumberingDirectionChange(event.target.value as 'ascending' | 'descending')} className="geo-input">
            <option value="ascending">Inferior → superior</option>
            <option value="descending">Superior → inferior</option>
          </select>
        </Field>
      </div>
    ) : policy === 'GRID' ? (
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Linhas" htmlFor="form-rule-grid-rows">
          <input id="form-rule-grid-rows" type="number" min="1" step="1" value={gridRows} onChange={(event) => onGridRowsChange(event.target.value)} className="geo-input font-mono" />
        </Field>
        <Field label="Colunas" htmlFor="form-rule-grid-columns">
          <input id="form-rule-grid-columns" type="number" min="1" step="1" value={gridColumns} onChange={(event) => onGridColumnsChange(event.target.value)} className="geo-input font-mono" />
        </Field>
        <Field label="Ordem" htmlFor="form-rule-grid-fill-order">
          <select id="form-rule-grid-fill-order" value={fillOrder} onChange={(event) => onFillOrderChange(event.target.value as 'row-major' | 'column-major')} className="geo-input">
            <option value="row-major">Linha a linha</option>
            <option value="column-major">Coluna a coluna</option>
          </select>
        </Field>
      </div>
    ) : (
      <p className="text-[0.74rem] leading-snug text-app-muted">
        Os componentes são exibidos como uma lista simples.
      </p>
    );

  return (
    <div className="mt-2 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.85fr)]">
      <div className="rounded-[10px] bg-app-sidebar/45 p-2.5">
        <h5 className="text-[0.76rem] font-semibold text-app-text">
          Configuração do tipo {policy === 'NONE' ? 'Padrão' : policy === 'LINEAR' ? 'Linear' : 'Grade'}
        </h5>
        <div className="mt-1.5">{content}</div>
      </div>
      <LayoutPreview
        policy={policy}
        capacity={linearCapacity}
        linearAxis={linearAxis}
        numberingDirection={numberingDirection}
        rows={gridRows}
        columns={gridColumns}
      />
    </div>
  );
}

function LinearRackPreview({
  capacity,
  axis,
  numberingDirection,
}: {
  capacity: string;
  axis: 'vertical' | 'horizontal';
  numberingDirection: 'ascending' | 'descending';
}) {
  const units = Math.max(Number.parseInt(capacity, 10) || 42, 1);
  const referencePositions = Array.from(
    new Set([1, Math.max(1, Math.ceil(units / 3)), Math.max(1, Math.ceil((units * 2) / 3)), units]),
  );
  // Mesma ordem do editor de componentes: descending = maior número no topo.
  const labels = numberingDirection === 'descending' ? [...referencePositions].reverse() : referencePositions;
  const vertical = axis === 'vertical';
  const directionLabel = numberingDirection === 'ascending' ? 'inferior para superior' : 'superior para inferior';
  const slotClassName = vertical ? 'flex-[3] rounded-sm border border-app-border bg-[var(--surface-muted)]' : 'flex-[3] rounded-sm border border-app-border bg-[var(--surface-muted)]';
  const equipmentClassName = vertical
    ? 'flex flex-[2] items-center gap-1 rounded-sm border border-app-accent-border bg-app-accent px-1'
    : 'flex flex-[2] flex-col items-center gap-1 rounded-sm border border-app-accent-border bg-app-accent py-1';

  return (
    <div
      className={`mt-1.5 grid items-center gap-2.5 ${vertical ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-rows-[auto_auto]'}`}
      role="img"
      aria-label={`Prévia ilustrativa de layout linear ${vertical ? 'vertical' : 'horizontal'} com ${units} unidades e numeração ${directionLabel}`}
    >
      <div className={vertical ? 'grid grid-cols-[1.35rem_minmax(0,1fr)] gap-1.5' : 'grid grid-rows-[1rem_minmax(0,1fr)] gap-1.5'}>
        <div className={`flex font-mono text-[0.6rem] text-app-muted ${vertical ? 'h-20 flex-col justify-between text-right' : 'justify-between'}`}>
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
        <div className={`rounded-md border-[3px] border-app-text bg-[var(--surface-muted)] p-0.5 shadow-sm ${vertical ? '' : 'w-full'}`}>
          <div className={`flex gap-0.5 rounded-sm bg-app-panel p-0.5 ${vertical ? 'h-20 flex-col' : 'h-10 flex-row'}`}>
            <div className={slotClassName} />
            <div className={equipmentClassName}>
              <span className="h-1.5 w-1.5 rounded-full bg-app-accent-ink" />
              <span className={`${vertical ? 'h-1 flex-1' : 'w-1 flex-1'} rounded bg-app-accent-ink/60`} />
            </div>
            <div className={slotClassName} />
            <div className={`flex flex-1 items-center gap-1 rounded-sm border border-app-border-strong bg-app-text ${vertical ? 'px-1' : 'flex-col py-1'}`}>
              <span className="h-1 w-1 rounded-full bg-app-panel" />
              <span className={`${vertical ? 'h-1 flex-1' : 'w-1 flex-1'} rounded bg-app-panel/70`} />
            </div>
          </div>
        </div>
      </div>
      <div className={`text-[0.62rem] text-app-muted ${vertical ? 'space-y-1' : 'flex flex-wrap gap-x-2.5 gap-y-1'}`}>
        <PreviewLegend tone="bg-app-accent" label="Equipamento (2 U)" />
        <PreviewLegend tone="bg-[var(--surface-muted)] border border-app-border" label="Posição vazia (1 U)" />
        <PreviewLegend tone="bg-app-text" label="Outro equipamento (1 U)" />
      </div>
    </div>
  );
}

function PreviewLegend({ tone, label }: { tone: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${tone}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function LayoutPreview({
  policy,
  capacity,
  linearAxis,
  numberingDirection,
  rows,
  columns,
}: {
  policy: PlacementPolicy;
  capacity: string;
  linearAxis: 'vertical' | 'horizontal';
  numberingDirection: 'ascending' | 'descending';
  rows: string;
  columns: string;
}) {
  const safeRows = Math.min(Math.max(Number.parseInt(rows, 10) || 2, 1), 4);
  const safeColumns = Math.min(Math.max(Number.parseInt(columns, 10) || 4, 1), 6);
  return (
    <div className="rounded-[10px] border border-app-border bg-app-sidebar/30 p-2.5">
      <h5 className="text-[0.76rem] font-semibold text-app-text">Prévia do layout</h5>
      {policy === 'NONE' ? (
        <div className="mt-1.5 space-y-1.5">
          {['Componente A', 'Componente B', 'Componente C'].map((item) => (
            <div key={item} className="flex items-center gap-1.5 rounded-lg border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.74rem] text-app-text">
              <Boxes className="h-3.5 w-3.5 text-app-muted" />
              {item}
            </div>
          ))}
        </div>
      ) : policy === 'LINEAR' ? (
        <LinearRackPreview
          capacity={capacity}
          axis={linearAxis}
          numberingDirection={numberingDirection}
        />
      ) : (
        <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))` }} aria-label={`Prévia de grade ${rows || 0} por ${columns || 0}`}>
          {Array.from({ length: safeRows * safeColumns }, (_, index) => (
            <div key={index} className={`flex aspect-square items-center justify-center rounded text-[0.62rem] font-medium ${index === 0 || index === safeColumns + 1 ? 'bg-app-accent text-app-accent-ink' : 'border border-app-border bg-app-panel text-app-muted'}`}>
              {Math.floor(index / safeColumns) + 1}-{(index % safeColumns) + 1}
            </div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[0.66rem] leading-tight text-app-muted">Representação ilustrativa da estrutura configurada.</p>
    </div>
  );
}
