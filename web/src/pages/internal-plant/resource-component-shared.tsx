import type { EditorCharacteristic } from '../../services/internalPlantApi';
import type { ResourceType, ResourceTypeRelationshipRule } from '../../services/resourceApi';
import type { ChildNode } from './ResourceEditorModal';

export const inputClass =
  'w-full min-w-0 truncate rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent aria-[invalid=true]:border-status-red';
export const labelClass = 'grid gap-1 text-[0.78rem] font-semibold text-app-muted';
export const inlineLabelClass =
  'grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2 text-[0.78rem] font-semibold text-app-muted';
const activeRule = (rule: ResourceTypeRelationshipRule) => rule.lifecycleStatus === 'Active';
let sequence = 0;
export const nextKey = () => `component-${(sequence += 1)}`;

export const updateNode = (
  nodes: ChildNode[],
  key: string,
  fn: (node: ChildNode) => ChildNode | null,
): ChildNode[] =>
  nodes.flatMap((node) => {
    if (node.key === key) {
      const updated = fn(node);
      return updated ? [updated] : [];
    }
    return [{ ...node, children: updateNode(node.children, key, fn) }];
  });

export const findNode = (nodes: ChildNode[], key: string): ChildNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node;
    const nested = findNode(node.children, key);
    if (nested) return nested;
  }
  return undefined;
};

export const containmentRules = (
  rules: ResourceTypeRelationshipRule[] | undefined,
): ResourceTypeRelationshipRule[] =>
  (rules ?? []).filter(
    (rule) =>
      activeRule(rule) &&
      rule.relationshipTypeCode === 'containsAsChild' &&
      rule.targetKind === 'RESOURCE_TYPE',
  );

export function ChildCharacteristics({
  node,
  type,
  onChange,
}: {
  node: ChildNode;
  type?: ResourceType;
  onChange: (characteristics: EditorCharacteristic[]) => void;
}) {
  const definitions = type?.resourceTypeCharacteristic ?? [];
  const specification = definitions.filter(
    (definition) => definition.characteristicLevel !== 'instance',
  );
  const instance = definitions.filter(
    (definition) => definition.characteristicLevel === 'instance',
  );
  const values = new Map(
    node.characteristics.map((characteristic) => [characteristic.name, characteristic]),
  );
  const update = (definition: EditorCharacteristic, value: string) => {
    const existing = values.get(definition.name);
    const next = node.characteristics.filter(
      (characteristic) => characteristic.name !== definition.name,
    );
    if (value !== '') {
      next.push({
        ...existing,
        name: definition.name,
        value,
        ...(definition.valueType ? { valueType: definition.valueType } : {}),
      });
    }
    onChange(next);
  };
  const control = (definition: EditorCharacteristic, editable: boolean) => {
    const value = String(values.get(definition.name)?.value ?? '');
    if (!editable)
      return (
        <output className={`${inputClass} min-h-[2.125rem] truncate`}>
          {definition.value === undefined || definition.value === null
            ? '—'
            : String(definition.value)}
        </output>
      );
    if (definition.valueType === 'boolean') {
      return (
        <select
          aria-label={definition.name}
          className={inputClass}
          value={value}
          onChange={(event) => update(definition, event.target.value)}
        >
          <option value="">—</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      );
    }
    if (definition.allowedValues?.length) {
      return (
        <select
          aria-label={definition.name}
          className={inputClass}
          value={value}
          onChange={(event) => update(definition, event.target.value)}
        >
          <option value="">—</option>
          {definition.allowedValues.map((allowed) => (
            <option key={allowed} value={allowed}>
              {allowed}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        aria-label={definition.name}
        className={inputClass}
        type={
          definition.valueType === 'date'
            ? 'date'
            : definition.valueType === 'integer' || definition.valueType === 'decimal'
              ? 'number'
              : 'text'
        }
        value={value}
        onChange={(event) => update(definition, event.target.value)}
      />
    );
  };
  const heading =
    'border-b border-app-border pb-1 text-[0.8rem] font-semibold uppercase tracking-wide text-app-text';
  return (
    <div className="grid gap-4">
      <section aria-label="Nível de especificação" className="grid gap-2">
        <h3 className={heading}>Nível de especificação</h3>
        {specification.length === 0 ? (
          <p className="text-[0.78rem] text-app-muted">
            Este tipo não define características de especificação.
          </p>
        ) : (
          specification.map((definition) => (
            <label key={definition.name} className={inlineLabelClass}>
              {definition.name}
              {control(definition, false)}
            </label>
          ))
        )}
      </section>
      <section aria-label="Nível de instância" className="grid gap-2">
        <h3 className={heading}>Nível de instância</h3>
        {instance.length === 0 ? (
          <p className="text-[0.78rem] text-app-muted">
            Este tipo não define características de instância.
          </p>
        ) : (
          instance.map((definition) => (
            <label key={definition.name} className={inlineLabelClass}>
              {definition.name}
              {control(definition, true)}
            </label>
          ))
        )}
      </section>
    </div>
  );
}
