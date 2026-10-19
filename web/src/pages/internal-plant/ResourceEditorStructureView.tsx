import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ResourceIcon } from '../../components/ResourceIcon';
import type {
  ResourceSpecification,
  ResourceType,
  ResourceTypeRelationshipRule,
} from '../../services/resourceApi';
import { getResourceVisualState } from '../geo-tabs/internal-components/resourceVisualState';
import type { ChildNode } from './ResourceEditorModal';
import { ResourceNodeDetailsForm } from './ResourceNodeDetailsForm';
import { findNode, inputClass, labelClass, updateNode } from './resource-component-shared';
import {
  calculatedName,
  collectTypeIds,
  createStandardNode,
  hasPositionalRules,
  remainingCapacity,
  standardChildren,
  standardRules,
} from './resource-component-structure';

type Props = {
  rootName: string;
  rootTypeId: string;
  draft: ChildNode[];
  typeById: Map<string, ResourceType>;
  specs: ResourceSpecification[];
  rulesByType: Record<string, ResourceTypeRelationshipRule[]>;
  ensureRules: (typeId: string) => Promise<void>;
  onChange: (children: ChildNode[]) => void;
};

/** Superfície selecionada: a cor do estado escurecida, com texto claro. */
const SELECTED_SURFACE: Record<string, string> = {
  green: 'bg-[color-mix(in_srgb,var(--status-green)_62%,black)]',
  amber: 'bg-[color-mix(in_srgb,var(--status-amber)_62%,black)]',
  blue: 'bg-[color-mix(in_srgb,var(--status-blue)_62%,black)]',
  red: 'bg-[color-mix(in_srgb,var(--status-red)_62%,black)]',
  purple: 'bg-[color-mix(in_srgb,var(--status-purple)_62%,black)]',
};
const selectedSurfaceOf = (indicatorClassName: string): string =>
  SELECTED_SURFACE[/status-(\w+)/.exec(indicatorClassName)?.[1] ?? ''] ?? 'bg-app-ink';

const visualOf = (node: ChildNode) =>
  getResourceVisualState({
    id: node.id ?? node.key,
    status: node.status,
    administrativeState: node.administrativeState,
    operationalState: node.operationalState,
    usageState: node.usageState,
  } as Parameters<typeof getResourceVisualState>[0]);

/**
 * Editor visual da contenção com organização padrão (NONE): containers
 * aninhados com todos os níveis visíveis + inspetor de detalhes/criação.
 */
export function ResourceEditorStructureView({
  rootName,
  rootTypeId,
  draft,
  typeById,
  specs,
  rulesByType,
  ensureRules,
  onChange,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const typeIds = collectTypeIds(draft).join('|');

  useEffect(() => {
    void ensureRules(rootTypeId);
    for (const typeId of typeIds.split('|').filter(Boolean)) void ensureRules(typeId);
  }, [ensureRules, rootTypeId, typeIds]);

  const selected = selectedKey ? findNode(draft, selectedKey) : undefined;
  const parentKey = selected ? selected.key : null;
  const parentTypeId = selected ? selected.typeId : rootTypeId;
  const parentName = selected ? selected.name : rootName;
  const parentChildren = selected ? selected.children : draft;
  const selectedParentTypeId = selected
    ? typeIdOfParent(draft, selected.key, rootTypeId)
    : rootTypeId;
  const parentRules = standardRules(rulesByType[selectedParentTypeId]);
  const typeOptions = parentRules.map((r) => ({
    typeId: r.targetId,
    name: typeById.get(r.targetId)?.name ?? 'Componente',
  }));
  const changeType = (node: ChildNode, typeId: string) => {
    const rule = parentRules.find((r) => r.targetId === typeId);
    if (!rule) return;
    const newRules = rulesByType[typeId];
    const keepsChildren = newRules === undefined || standardRules(newRules).length > 0;
    update(node.key, {
      typeId,
      relationshipDefinitionId: rule.id,
      specId: specs.find((s) => s.resourceTypeId === typeId)?.id ?? '',
      characteristics: [],
      children: keepsChildren ? node.children : [],
    });
    void ensureRules(typeId);
  };
  const canCreate = standardRules(rulesByType[parentTypeId]).length > 0;

  const replaceChildren = (children: ChildNode[]) =>
    parentKey
      ? onChange(updateNode(draft, parentKey, (n) => ({ ...n, children })))
      : onChange(children);

  const update = (key: string, changes: Partial<ChildNode>) =>
    onChange(updateNode(draft, key, (current) => ({ ...current, ...changes })));

  const renderNode = (node: ChildNode) => {
    const rules = rulesByType[node.typeId];
    const kids = standardChildren(node.children, rules);
    const canContain = standardRules(rules).length > 0;
    const state = visualOf(node);
    const isSelected = node.key === selectedKey;
    const typeName = typeById.get(node.typeId)?.name ?? '';
    const header = (
      <div className="rounded-[6px] bg-app-ink p-0.5">
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`${node.name || 'Componente'}, ${typeName}, ${state.label}`}
          onClick={() => setSelectedKey(node.key)}
          className={`flex min-h-[22px] w-full min-w-0 items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${state.borderClassName} ${state.borderStyleClassName} ${isSelected ? `border-app-accent ring-2 ring-app-accent ${selectedSurfaceOf(state.indicatorClassName)}` : state.surfaceClassName}`}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.indicatorClassName}`}
            aria-hidden="true"
          />
          <ResourceIcon
            resource={typeById.get(node.typeId)?.code}
            visualIdentity={typeById.get(node.typeId)?.visualIdentity}
            variant="glyph"
            size={16}
            className={isSelected ? 'brightness-0 invert' : undefined}
          />
          <span
            className={`min-w-0 flex-1 break-words text-[0.76rem] font-semibold leading-snug ${isSelected ? 'text-app-on-ink' : 'text-app-text'}`}
          >
            {node.name || 'Sem nome'}
          </span>
        </button>
      </div>
    );
    if (!kids.length && !canContain)
      return (
        <div key={node.key} className="max-w-full">
          {header}
        </div>
      );
    return (
      <section
        key={node.key}
        aria-label={`Container ${node.name || 'Componente'}`}
        className="grid max-w-full min-w-0 gap-1 rounded-[4px] border border-app-border-strong bg-app-ink p-1 shadow-sm"
      >
        {header}
        {kids.length ? (
          <div className="flex flex-wrap items-start gap-1 pt-2">{kids.map(renderNode)}</div>
        ) : (
          <p className="px-1 text-[0.75rem] text-app-on-ink">
            Vazio. Selecione para criar componentes internos.
          </p>
        )}
      </section>
    );
  };

  const rootRules = rulesByType[rootTypeId];
  const rootKids = standardChildren(draft, rootRules);

  return (
    <div
      className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]"
      aria-label="Editor de componentes"
    >
      <section
        aria-label="Composição visual"
        className="min-h-0 overflow-auto rounded-[10px] border border-app-border bg-app-subtle p-3"
      >
        <div className="mx-auto w-full max-w-3xl rounded-[4px] bg-app-ink p-1 shadow-sm">
          <button
            type="button"
            aria-pressed={selectedKey === null}
            aria-label={`Recurso raiz: ${rootName}`}
            onClick={() => setSelectedKey(null)}
            className={`mb-1 flex min-h-[22px] w-full items-center justify-center rounded-[4px] px-2 text-[0.72rem] font-bold text-app-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${selectedKey === null ? 'ring-2 ring-app-accent' : ''}`}
          >
            {rootName}
          </button>
          <div className="flex flex-wrap items-start gap-1 rounded-[2px] bg-app-border-strong p-1 pt-3">
            {rootKids.length ? (
              rootKids.map(renderNode)
            ) : (
              <p className="w-full px-2 py-3 text-center text-[0.82rem] text-app-on-ink">
                Nenhum componente interno. Use o painel ao lado para criar.
              </p>
            )}
          </div>
        </div>
        {hasPositionalRules(rootRules) ? (
          <p className="mt-2 text-[0.75rem] text-app-muted">
            Este tipo também possui componentes posicionais (LINEAR/GRID), gerenciados na estrutura
            correspondente.
          </p>
        ) : null}
      </section>
      <aside
        aria-label="Detalhes do componente"
        className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden rounded-[10px] border border-app-border bg-app-panel p-4"
      >
        <div className="grid min-w-0 grid-cols-1 gap-3">
          {selected ? (
            <ResourceNodeDetailsForm
              key={selected.key}
              node={selected}
              specs={specs}
              type={typeById.get(selected.typeId)}
              onUpdate={(changes) => update(selected.key, changes)}
              onRemove={() => {
                onChange(updateNode(draft, selected.key, () => null));
                setSelectedKey(null);
              }}
              {...(canCreate ? { onAdd: () => setCreating(true) } : {})}
              {...(!selected.id && typeOptions.length > 1
                ? { typeOptions, onChangeType: (typeId: string) => changeType(selected, typeId) }
                : {})}
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-app-border bg-[var(--surface-muted)] text-app-text">
                  <ResourceIcon
                    resource={typeById.get(rootTypeId)?.code}
                    visualIdentity={typeById.get(rootTypeId)?.visualIdentity}
                    variant="glyph"
                    size={20}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9rem] font-semibold text-app-text">{rootName}</p>
                  <p className="text-[0.78rem] text-app-muted">Recurso raiz</p>
                </div>
                {canCreate ? (
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-[10px] bg-app-accent text-app-text hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                    aria-label="Adicionar componente interno"
                    title="Adicionar componente interno"
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <p className="text-[0.82rem] text-app-muted">
                {canCreate
                  ? 'Selecione um componente na composição para ver os detalhes ou use + para criar componentes internos.'
                  : hasPositionalRules(rulesByType[rootTypeId])
                    ? 'Os componentes internos deste tipo são gerenciados na estrutura posicional correspondente.'
                    : 'Este tipo não admite componentes internos.'}
              </p>
            </>
          )}
          {selected && !canCreate ? (
            <p className="text-[0.78rem] text-app-muted">
              {hasPositionalRules(rulesByType[selected.typeId])
                ? 'Os componentes internos deste tipo são gerenciados na estrutura posicional correspondente.'
                : 'Este tipo não admite componentes internos.'}
            </p>
          ) : null}
        </div>
      </aside>
      {creating && canCreate ? (
        <CreateChildrenDialog parentName={parentName} onClose={() => setCreating(false)}>
          <CreateChildren
            key={parentKey ?? 'root'}
            parentTypeId={parentTypeId}
            parentName={parentName}
            parentChildren={parentChildren}
            specs={specs}
            typeById={typeById}
            rulesByType={rulesByType}
            onCreate={(nodes) => {
              replaceChildren([...parentChildren, ...nodes]);
              setSelectedKey(nodes[0]!.key);
              setCreating(false);
            }}
          />
        </CreateChildrenDialog>
      ) : null}
    </div>
  );
}

function typeIdOfParent(nodes: ChildNode[], key: string, rootTypeId: string): string {
  const walk = (list: ChildNode[], parentTypeId: string): string | undefined => {
    for (const node of list) {
      if (node.key === key) return parentTypeId;
      const nested = walk(node.children, node.typeId);
      if (nested) return nested;
    }
    return undefined;
  };
  return walk(nodes, rootTypeId) ?? rootTypeId;
}

function CreateChildrenDialog({
  parentName,
  onClose,
  children,
}: {
  parentName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--scrim)] p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Criar componente em ${parentName}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="grid w-full max-w-md gap-3 rounded-[16px] border border-app-border bg-app-panel p-5 shadow-modal outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[0.95rem] font-semibold text-app-text">
            Criar componente em {parentName}
          </h3>
          <button
            type="button"
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-[8px] text-app-muted hover:bg-app-hover"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateChildren({
  parentTypeId,
  parentName,
  parentChildren,
  specs,
  typeById,
  rulesByType,
  onCreate,
}: {
  parentTypeId: string;
  parentName: string;
  parentChildren: ChildNode[];
  specs: ResourceSpecification[];
  typeById: Map<string, ResourceType>;
  rulesByType: Record<string, ResourceTypeRelationshipRule[]>;
  onCreate: (nodes: ChildNode[]) => void;
}) {
  const parentRules = rulesByType[parentTypeId];
  const rules = standardRules(parentRules);
  const [ruleId, setRuleId] = useState('');
  const [specId, setSpecId] = useState('');
  const [calculated, setCalculated] = useState(true);
  // null = ainda não editado: o prefixo acompanha o nome do recurso pai.
  const [prefixEdit, setPrefixEdit] = useState<string | null>(null);
  const [start, setStart] = useState('1');
  const [step, setStep] = useState('1');
  const [quantity, setQuantity] = useState('1');
  const [freeNames, setFreeNames] = useState<string[]>([]);
  const prefix = prefixEdit ?? parentName;
  const [message, setMessage] = useState('');
  const rule = rules.find((r) => r.id === ruleId) ?? rules[0];
  const allowedSpecs = rule ? specs.filter((s) => s.resourceTypeId === rule.targetId) : [];
  const effectiveSpec = allowedSpecs.some((s) => s.id === specId)
    ? specId
    : (allowedSpecs[0]?.id ?? '');

  if (!rule) {
    return (
      <p className="text-[0.82rem] text-app-muted">
        {hasPositionalRules(parentRules)
          ? 'Os componentes internos deste tipo são gerenciados na estrutura posicional correspondente.'
          : 'Este tipo não admite componentes internos.'}
      </p>
    );
  }

  const targetType = typeById.get(rule.targetId);
  const previewCount = Math.min(Math.max(Number.parseInt(quantity, 10) || 0, 0), 200);
  const previewStart = Number.parseInt(start, 10);
  const previewStep = Number.parseInt(step, 10);
  const preview =
    previewCount > 0 && Number.isInteger(previewStart) && previewStep >= 1
      ? `Exemplo: ${[0, 1, 2]
          .filter((i) => i < previewCount)
          .map((i) => calculatedName(prefix, previewStart, previewStep, i))
          .join(', ')}${previewCount > 3 ? '…' : ''}`
      : '';
  const create = () => {
    const amount = Number.parseInt(quantity, 10);
    if (!effectiveSpec) return setMessage('Selecione uma specification para criar o recurso.');
    if (!Number.isInteger(amount) || amount < 1)
      return setMessage('A quantidade deve ser um número inteiro positivo.');
    const remaining = remainingCapacity(parentChildren, rule, parentRules ?? []);
    if (remaining !== undefined && amount > remaining)
      return setMessage(
        `A regra permite no máximo ${rule.cardinality?.maxTargetPerSource} componentes deste tipo.`,
      );
    let names: string[];
    if (calculated) {
      const first = Number.parseInt(start, 10);
      const increment = Number.parseInt(step, 10);
      if (!Number.isInteger(first) || !Number.isInteger(increment) || increment < 1)
        return setMessage('Informe um valor inicial inteiro e um incremento maior que zero.');
      names = Array.from({ length: amount }, (_, i) => calculatedName(prefix, first, increment, i));
    } else {
      names = Array.from({ length: amount }, (_, i) => (freeNames[i] ?? '').trim());
      if (names.some((name) => !name)) return setMessage('Preencha o nome de cada recurso.');
    }
    const nodes = names.map((name) => createStandardNode(rule, effectiveSpec, name));
    setMessage('');
    onCreate(nodes);
  };

  return (
    <div className="grid gap-3">
      {rules.length > 1 ? (
        <label className={labelClass}>
          Tipo de recurso
          <select
            className={inputClass}
            value={rule.id}
            onChange={(e) => setRuleId(e.target.value)}
          >
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {typeById.get(r.targetId)?.name ?? 'Componente'}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className={labelClass}>
          Tipo de recurso
          <output className={inputClass}>{targetType?.name ?? '—'}</output>
        </label>
      )}
      <label className={labelClass}>
        Specification
        <select
          className={inputClass}
          value={effectiveSpec}
          onChange={(e) => setSpecId(e.target.value)}
        >
          <option value="">Selecione</option>
          {allowedSpecs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex gap-4 text-[0.85rem] text-app-text">
        <legend className="sr-only">Forma de nomear</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={calculated} onChange={() => setCalculated(true)} />
          Nome calculado
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!calculated} onChange={() => setCalculated(false)} />
          Nomes livres
        </label>
      </fieldset>
      <label className={labelClass}>
        Quantidade
        <input
          className={inputClass}
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      {calculated ? (
        <>
          <label className={labelClass}>
            Prefixo
            <input
              className={inputClass}
              value={prefix}
              placeholder="Sem prefixo"
              onChange={(e) => setPrefixEdit(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Valor inicial
              <input
                className={inputClass}
                type="number"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Incremento
              <input
                className={inputClass}
                type="number"
                min="1"
                value={step}
                onChange={(e) => setStep(e.target.value)}
              />
            </label>
          </div>
          <p className="text-[0.78rem] text-app-muted">{preview}</p>
        </>
      ) : (
        <div className="grid max-h-56 gap-2 overflow-y-auto">
          {Array.from(
            { length: Math.min(Math.max(Number.parseInt(quantity, 10) || 0, 0), 200) },
            (_, i) => (
              <input
                key={i}
                aria-label={`Nome do recurso ${i + 1}`}
                className={inputClass}
                value={freeNames[i] ?? ''}
                onChange={(e) =>
                  setFreeNames((current) => {
                    const next = [...current];
                    next[i] = e.target.value;
                    return next;
                  })
                }
              />
            ),
          )}
        </div>
      )}
      <div aria-live="polite" className="min-h-5 text-[0.78rem] text-status-red">
        {message}
      </div>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-app-accent px-3 text-[0.85rem] font-semibold text-app-text hover:brightness-95"
        onClick={create}
      >
        <Plus size={16} aria-hidden="true" />
        Adicionar recursos
      </button>
    </div>
  );
}
