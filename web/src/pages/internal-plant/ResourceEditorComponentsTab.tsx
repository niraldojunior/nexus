import { ChevronRight, Maximize2, Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EditorCharacteristic } from '../../services/internalPlantApi';
import type {
  ResourceSpecification,
  ResourceType,
  ResourceTypeRelationshipRule,
} from '../../services/resourceApi';
import type { ChildNode } from './ResourceEditorModal';
import {
  linearBatch,
  linearConflictAt,
  linearEnd,
  linearFits,
  linearLabel,
  linearSlots,
  sequentialName,
  type LinearConfiguration,
  type LinearOccupant,
} from './resource-component-linear';

const inputClass =
  'w-full rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent aria-[invalid=true]:border-status-red';
const labelClass = 'grid gap-1 text-[0.78rem] font-semibold text-app-muted';
const activeRule = (rule: ResourceTypeRelationshipRule) => rule.lifecycleStatus === 'Active';
let sequence = 0;
const nextKey = () => `component-${(sequence += 1)}`;

type ActiveContext = { nodeKey: string | null; typeId: string; name: string };
type Selection = { kind: 'empty'; position: number } | { kind: 'resource'; key: string } | null;

type Props = {
  rootName: string;
  draft: ChildNode[];
  typeById: Map<string, ResourceType>;
  specs: ResourceSpecification[];
  rootTypeId: string;
  rulesByType: Record<string, ResourceTypeRelationshipRule[]>;
  ensureRules: (typeId: string) => Promise<void>;
  onChange: (children: ChildNode[]) => void;
};

const updateNode = (
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

const findNode = (nodes: ChildNode[], key: string): ChildNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node;
    const nested = findNode(node.children, key);
    if (nested) return nested;
  }
  return undefined;
};

const containmentRules = (
  rules: ResourceTypeRelationshipRule[] | undefined,
): ResourceTypeRelationshipRule[] =>
  (rules ?? []).filter(
    (rule) =>
      activeRule(rule) &&
      rule.relationshipTypeCode === 'containsAsChild' &&
      rule.targetKind === 'RESOURCE_TYPE',
  );

const linearRules = (rules: ResourceTypeRelationshipRule[] | undefined) =>
  containmentRules(rules).filter(
    (rule): rule is ResourceTypeRelationshipRule & { configuration: LinearConfiguration } =>
      rule.configuration?.placementPolicy === 'LINEAR',
  );

export function ResourceEditorComponentsTab({
  rootName,
  draft,
  typeById,
  specs,
  rootTypeId,
  rulesByType,
  ensureRules,
  onChange,
}: Props) {
  const [contexts, setContexts] = useState<ActiveContext[]>([
    { nodeKey: null, typeId: rootTypeId, name: rootName },
  ]);
  const activeContext = contexts[contexts.length - 1]!;
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selection, setSelection] = useState<Selection>(null);

  const activeNode = activeContext.nodeKey ? findNode(draft, activeContext.nodeKey) : undefined;
  const activeChildren = activeNode?.children ?? draft;
  const linear = linearRules(rulesByType[activeContext.typeId]);
  const selectedRule = linear.find((rule) => rule.id === selectedRuleId) ?? linear[0];
  const configuration = selectedRule?.configuration;

  useEffect(() => {
    void ensureRules(activeContext.typeId);
  }, [activeContext.typeId, ensureRules]);

  useEffect(() => {
    if (!selectedRule || selectedRule.id === selectedRuleId) return;
    setSelectedRuleId(selectedRule.id);
  }, [selectedRule, selectedRuleId]);

  useEffect(() => {
    setSelection(null);
  }, [activeContext.nodeKey, selectedRuleId]);

  const contextualChildren = useMemo(
    () =>
      selectedRule
        ? activeChildren.filter((node) => node.relationshipDefinitionId === selectedRule.id)
        : [],
    [activeChildren, selectedRule],
  );
  const occupants = useMemo<LinearOccupant<ChildNode>[]>(
    () =>
      contextualChildren.flatMap((node) =>
        node.placement?.placementPolicy === 'LINEAR'
          ? [{ item: node, placement: node.placement }]
          : [],
      ),
    [contextualChildren],
  );

  const replaceActiveChildren = (nextChildren: ChildNode[]) => {
    if (!activeContext.nodeKey) onChange(nextChildren);
    else
      onChange(
        updateNode(draft, activeContext.nodeKey, (node) => ({ ...node, children: nextChildren })),
      );
  };

  if (!configuration || !selectedRule) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <FallbackComponents
          draft={draft}
          rootTypeId={rootTypeId}
          rulesByType={rulesByType}
          typeById={typeById}
          specs={specs}
          ensureRules={ensureRules}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]"
      aria-label="Editor de componentes"
    >
      <LinearCanvas
        containerName={contexts[contexts.length - 1]?.name ?? rootName}
        configuration={configuration}
        occupants={occupants}
        selection={selection}
        onSelect={setSelection}
        toolbarLeading={
          contexts.length > 1 || linear.length > 1 ? (
            <>
              {contexts.length > 1 ? (
                <nav
                  aria-label="Contexto do container"
                  className="flex flex-wrap items-center gap-1"
                >
                  {contexts.map((context, index) => (
                    <span
                      key={`${context.nodeKey ?? 'root'}-${context.typeId}`}
                      className="flex items-center gap-1"
                    >
                      {index > 0 ? (
                        <ChevronRight size={14} aria-hidden="true" className="text-app-muted" />
                      ) : null}
                      <button
                        type="button"
                        className="rounded px-1 py-0.5 text-[0.8rem] text-app-muted hover:bg-app-hover hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                        onClick={() => setContexts((current) => current.slice(0, index + 1))}
                      >
                        {context.name}
                      </button>
                    </span>
                  ))}
                </nav>
              ) : null}
              {linear.length > 1 ? (
                <label className="flex items-center gap-2 text-[0.78rem] text-app-muted">
                  Estrutura
                  <select
                    className="rounded-[8px] border border-app-border bg-app-panel px-2 py-1 text-app-text"
                    value={selectedRule.id}
                    onChange={(event) => setSelectedRuleId(event.target.value)}
                  >
                    {linear.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {typeById.get(rule.targetId)?.name ?? 'Componentes'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null
        }
      />
      <LinearInspector
        configuration={configuration}
        rule={selectedRule}
        children={activeChildren}
        occupants={occupants}
        selection={selection}
        specs={specs}
        typeById={typeById}
        rulesByType={rulesByType}
        onChangeChildren={replaceActiveChildren}
        onSelect={setSelection}
        onEnter={(node) =>
          setContexts((current) => [
            ...current,
            { nodeKey: node.key, typeId: node.typeId, name: node.name },
          ])
        }
      />
    </div>
  );
}

const FRAME_HEADER = 24;
const FRAME_PAD = 6;

const ZOOM_STEPS = [25, 50, 75, 100, 150, 200, 300, 400];
const MIN_CELL = 6;
const FALLBACK_CELL = 44;

function LinearCanvas({
  configuration,
  occupants,
  selection,
  onSelect,
  toolbarLeading,
  containerName,
}: {
  configuration: LinearConfiguration;
  occupants: LinearOccupant<ChildNode>[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  toolbarLeading?: ReactNode;
  containerName: string;
}) {
  const slots = linearSlots(configuration, occupants);
  const isHorizontal = configuration.axis === 'horizontal';
  const [focusedPosition, setFocusedPosition] = useState(slots[0]?.position ?? 1);
  const [zoom, setZoom] = useState(100);
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setViewport(isHorizontal ? element.clientWidth : element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isHorizontal]);

  // 100% = container inteiro visível na área; acima disso a área rola.
  const baseCell =
    viewport > 0
      ? Math.max(MIN_CELL, Math.floor((viewport - 28) / configuration.capacity))
      : FALLBACK_CELL;
  const cell = Math.max(MIN_CELL, Math.round((baseCell * zoom) / 100));
  const showText = cell >= 14;

  const indexByPosition = new Map(slots.map((slot, index) => [slot.position, index]));
  const stops = slots.filter(
    (slot) => !slot.occupant || slot.occupant.placement.position === slot.position,
  );
  const stepZoom = (direction: 1 | -1) => {
    const next =
      direction > 0
        ? ZOOM_STEPS.find((step) => step > zoom)
        : [...ZOOM_STEPS].reverse().find((step) => step < zoom);
    if (next) setZoom(next);
  };

  const moveFocus = (position: number) => {
    setFocusedPosition(position);
    document.getElementById(`linear-position-${position}`)?.focus();
  };

  const track = `${cell}px`;
  // Dimensão transversal acompanha o zoom, mantendo a proporção do container.
  const cross = isHorizontal
    ? Math.max(24, Math.round((72 * zoom) / 100))
    : Math.max(60, Math.round((260 * zoom) / 100));
  const zoomButton =
    'inline-flex size-8 items-center justify-center rounded-[8px] border border-app-border text-app-text hover:bg-app-hover disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';
  const trackStyle = isHorizontal
    ? {
        gridTemplateColumns: `repeat(${configuration.capacity}, ${track})`,
        gridTemplateRows: `${cross}px`,
      }
    : {
        gridTemplateRows: `repeat(${configuration.capacity}, ${track})`,
        gridTemplateColumns: `${cross}px`,
      };
  const labelStyle = isHorizontal
    ? {
        gridTemplateColumns: `repeat(${configuration.capacity}, ${track})`,
        paddingLeft: FRAME_PAD,
        columnGap: 1,
      }
    : {
        gridTemplateRows: `repeat(${configuration.capacity}, ${track})`,
        paddingTop: FRAME_HEADER + FRAME_PAD,
        rowGap: 1,
      };

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-app-border bg-app-panel"
      aria-label="Estrutura física"
    >
      {toolbarLeading ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app-border bg-app-panel px-2 py-1.5">
          {toolbarLeading}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div
          className="absolute bottom-3 right-5 z-10 flex items-center gap-1 rounded-[10px] border border-app-border bg-app-panel p-1 shadow-sm"
          role="group"
          aria-label="Zoom"
        >
          <button
            type="button"
            aria-label="Reduzir zoom"
            disabled={zoom <= ZOOM_STEPS[0]!}
            onClick={() => stepZoom(-1)}
            className={zoomButton}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <output
            aria-label="Nível de zoom"
            className="min-w-[3.25rem] text-center font-mono text-[0.78rem] text-app-text"
          >
            {zoom}%
          </output>
          <button
            type="button"
            aria-label="Aumentar zoom"
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
            onClick={() => stepZoom(1)}
            className={zoomButton}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Ajustar à área visível"
            onClick={() => setZoom(100)}
            className={zoomButton}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
        <div ref={scrollRef} className="h-full overflow-auto bg-app-subtle p-2">
          <div
            className={`mx-auto flex w-fit gap-1.5 ${isHorizontal ? 'min-w-max flex-col' : ''}`}
          >
            <div
              aria-hidden="true"
              className="grid shrink-0 font-mono font-bold text-app-muted"
              style={{ ...labelStyle, fontSize: showText ? '0.66rem' : '0.5rem', lineHeight: 1 }}
            >
              {slots.map((slot) => (
                <span
                  key={`label-${slot.position}`}
                  className={`flex items-center ${isHorizontal ? 'justify-center' : 'justify-end'}`}
                >
                  {slot.label}
                </span>
              ))}
            </div>
            <div
              className="min-w-0 shrink-0 rounded-[4px] bg-app-ink shadow-sm"
              style={{ padding: `0 ${FRAME_PAD}px ${FRAME_PAD}px` }}
            >
              <div
                className="flex items-center justify-center text-[0.72rem] font-bold text-app-on-ink"
                style={{ height: FRAME_HEADER }}
              >
                {containerName}
              </div>
              <div
                role="listbox"
                aria-label={`Posições ${configuration.unitLabel}`}
                aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
                className="grid gap-px rounded-[2px] bg-app-border-strong p-px"
                style={trackStyle}
              >
                {stops.map((slot) => {
                  const occupant = slot.occupant;
                  const span = occupant
                    ? linearEnd(occupant.placement) - occupant.placement.position + 1
                    : 1;
                  const first = occupant
                    ? Math.min(
                        ...Array.from(
                          { length: span },
                          (_, i) => indexByPosition.get(occupant.placement.position + i) ?? 0,
                        ),
                      )
                    : indexByPosition.get(slot.position)!;
                  const selected =
                    (selection?.kind === 'empty' && selection.position === slot.position) ||
                    (selection?.kind === 'resource' && occupant?.item.key === selection.key);
                  const endLabel = linearLabel(configuration, slot.position + span - 1);
                  const name = occupant?.item.name || 'Recurso sem nome';
                  const inactive =
                    occupant && occupant.item.status && occupant.item.status !== 'active';
                  const place = isHorizontal
                    ? { gridColumn: `${first + 1} / span ${span}`, gridRow: 1 }
                    : { gridRow: `${first + 1} / span ${span}`, gridColumn: 1 };
                  const select = () =>
                    onSelect(
                      occupant
                        ? { kind: 'resource', key: occupant.item.key }
                        : { kind: 'empty', position: slot.position },
                    );
                  const tone = occupant
                    ? selected
                      ? 'z-10 border-app-accent ring-2 ring-app-accent text-app-text'
                      : inactive
                        ? 'border-app-border-strong bg-app-subtle text-app-text hover:border-app-accent'
                        : 'border-status-green bg-status-green-soft text-app-text hover:border-app-accent'
                    : selected
                      ? 'z-10 border-app-accent bg-app-accent-soft ring-2 ring-app-accent text-app-text'
                      : 'border-transparent bg-app-panel text-app-muted hover:bg-status-blue-soft';
                  return (
                    <button
                      key={slot.position}
                      id={`linear-position-${slot.position}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={
                        occupant
                          ? `${slot.label}${span > 1 ? ` a ${endLabel}` : ''}, ocupada por ${name}`
                          : `${slot.label}, posição vazia`
                      }
                      tabIndex={focusedPosition === slot.position ? 0 : -1}
                      className={`group relative flex min-h-0 min-w-0 items-start justify-between gap-2 overflow-hidden rounded-[3px] border px-2 text-left text-[0.76rem] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-app-accent ${tone}`}
                      style={{
                        ...place,
                        ...(selected && occupant
                          ? {
                              backgroundColor: inactive
                                ? 'var(--surface-sidebar)'
                                : 'color-mix(in srgb, var(--status-green) 38%, var(--status-green-soft))',
                            }
                          : {}),
                        ...(occupant
                          ? (() => {
                              const height = span * cell + (span - 1) - 2;
                              const fontPx = Math.min(12.16, height * 0.72);
                              return height >= 20
                                ? { paddingTop: 4 }
                                : { alignItems: 'center', paddingTop: 0, paddingBottom: 0, lineHeight: 1, fontSize: fontPx };
                            })()
                          : {}),
                      }}
                      onClick={select}
                      onMouseEnter={(event) => {
                        if (!occupant) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHint({ text: name, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setHint(null)}
                      onFocus={() => setFocusedPosition(slot.position)}
                      onKeyDown={(event) => {
                        const ordered = stops.map((entry) => entry.position);
                        const current = ordered.indexOf(slot.position);
                        if (event.key === 'Home') {
                          event.preventDefault();
                          moveFocus(ordered[0]!);
                        } else if (event.key === 'End') {
                          event.preventDefault();
                          moveFocus(ordered[ordered.length - 1]!);
                        } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                          event.preventDefault();
                          moveFocus(ordered[Math.min(current + 1, ordered.length - 1)]!);
                        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                          event.preventDefault();
                          moveFocus(ordered[Math.max(current - 1, 0)]!);
                        } else if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select();
                        }
                      }}
                    >
                      {occupant && (span * cell + (span - 1) - 2) * 0.72 >= 5.5 ? (
                        <>
                          <span className="truncate">{name}</span>
                          <span className="shrink-0">
                            {span}
                            {configuration.unitLabel}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {hint
        ? createPortal(
            <div
              aria-hidden="true"
              role="presentation"
              className="pointer-events-none fixed z-[1000] max-w-[320px] -translate-x-1/2 -translate-y-full rounded-[6px] border border-app-border-strong bg-app-ink px-2 py-1 text-[0.75rem] font-medium text-app-on-ink shadow-md"
              style={{ left: hint.x, top: hint.y - 6 }}
            >
              {hint.text}
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function LinearInspector({
  configuration,
  rule,
  children,
  occupants,
  selection,
  specs,
  typeById,
  rulesByType,
  onChangeChildren,
  onSelect,
  onEnter,
}: {
  configuration: LinearConfiguration;
  rule: ResourceTypeRelationshipRule;
  children: ChildNode[];
  occupants: LinearOccupant<ChildNode>[];
  selection: Selection;
  specs: ResourceSpecification[];
  typeById: Map<string, ResourceType>;
  rulesByType: Record<string, ResourceTypeRelationshipRule[]>;
  onChangeChildren: (children: ChildNode[]) => void;
  onSelect: (selection: Selection) => void;
  onEnter: (node: ChildNode) => void;
}) {
  const [specId, setSpecId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [startingNumber, setStartingNumber] = useState('1');
  const [span, setSpan] = useState('1');
  const [message, setMessage] = useState('');
  const allowedSpecs = specs.filter((spec) => spec.resourceTypeId === rule.targetId);
  const node =
    selection?.kind === 'resource'
      ? children.find((child) => child.key === selection.key)
      : undefined;
  const [placementMessage, setPlacementMessage] = useState('');

  useEffect(() => {
    if (selection?.kind !== 'empty') return;
    setMessage('');
    setSpecId((current) => current || allowedSpecs[0]?.id || '');
  }, [selection, allowedSpecs]);

  if (!selection) {
    return (
      <aside
        className="rounded-[10px] border border-app-border bg-app-panel p-4"
        aria-label="Detalhes da seleção"
      >
        <p className="text-[0.85rem] text-app-muted">
          Selecione uma posição ou recurso para ver os detalhes.
        </p>
      </aside>
    );
  }

  if (selection.kind === 'empty') {
    const position = selection.position;
    const parsedQuantity = Number.parseInt(quantity, 10);
    const parsedStart = Number.parseInt(startingNumber, 10);
    const parsedSpan = Number.parseInt(span, 10);
    const placements =
      Number.isInteger(parsedQuantity) && Number.isInteger(parsedSpan)
        ? linearBatch(position, parsedQuantity, parsedSpan)
        : [];
    const preview = placements.length
      ? `${sequentialName(prefix || typeById.get(rule.targetId)?.code || 'RECURSO', Number.isInteger(parsedStart) ? parsedStart : 1, 0)}${placements.length > 1 ? ` a ${sequentialName(prefix || typeById.get(rule.targetId)?.code || 'RECURSO', Number.isInteger(parsedStart) ? parsedStart : 1, placements.length - 1)}` : ''}`
      : '';
    const add = () => {
      if (!specId) return setMessage('Selecione uma specification para criar o recurso.');
      if (
        !Number.isInteger(parsedQuantity) ||
        parsedQuantity < 1 ||
        !Number.isInteger(parsedSpan) ||
        parsedSpan < 1
      ) {
        return setMessage('Quantidade e slots ocupados devem ser números inteiros positivos.');
      }
      if (!Number.isInteger(parsedStart) || parsedStart < 0)
        return setMessage('Informe o número inicial da sequência.');
      const conflict = placements
        .map((placement) => linearConflictAt(occupants, placement))
        .find(Boolean);
      if (conflict)
        return setMessage(
          `${linearLabel(configuration, conflict.placement.position)} já está ocupada por ${conflict.item.name}. Escolha outra posição.`,
        );
      if (placements.some((placement) => !linearFits(configuration, occupants, placement))) {
        return setMessage(
          `Não há posições livres suficientes a partir de ${linearLabel(configuration, position)}. Reduza a quantidade ou o tamanho.`,
        );
      }
      const maximum = rule.cardinality?.maxTargetPerSource;
      const sameRuleCount = occupants.length;
      if (maximum !== undefined && sameRuleCount + placements.length > maximum) {
        return setMessage(`A regra permite no máximo ${maximum} componentes deste tipo.`);
      }
      const resourceType = typeById.get(rule.targetId);
      const effectivePrefix = prefix.trim() || resourceType?.code || 'RECURSO';
      const additions: ChildNode[] = placements.map((placement, index) => ({
        key: nextKey(),
        relationshipDefinitionId: rule.id,
        placement,
        name: sequentialName(effectivePrefix, parsedStart, index),
        specId,
        typeId: rule.targetId,
        status: 'active',
        statusCode: '',
        administrativeState: 'unlocked',
        operationalState: 'enabled',
        usageState: 'idle',
        characteristics: [],
        children: [],
      }));
      onChangeChildren([...children, ...additions]);
      onSelect({ kind: 'resource', key: additions[0]!.key });
    };
    return (
      <aside
        className="min-h-0 overflow-y-auto rounded-[10px] border border-app-border bg-app-panel p-4"
        aria-label="Criar componente"
      >
        <div className="grid gap-3">
          <div>
            <p className="text-[0.85rem] font-semibold text-app-text">
              {linearLabel(configuration, position)} está disponível.
            </p>
            <p className="mt-1 text-[0.78rem] text-app-muted">
              Crie recursos internos a partir desta posição.
            </p>
          </div>
          <label className={labelClass}>
            Tipo de recurso
            <output className={inputClass}>{typeById.get(rule.targetId)?.name ?? '—'}</output>
          </label>
          <label className={labelClass}>
            Specification
            <select
              className={inputClass}
              value={specId}
              onChange={(event) => setSpecId(event.target.value)}
            >
              <option value="">Selecione</option>
              {allowedSpecs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Prefixo
            <input
              className={inputClass}
              value={prefix}
              placeholder={typeById.get(rule.targetId)?.code ?? 'RECURSO'}
              onChange={(event) => setPrefix(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Quantidade
              <input
                className={inputClass}
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Número inicial
              <input
                className={inputClass}
                inputMode="numeric"
                value={startingNumber}
                onChange={(event) => setStartingNumber(event.target.value)}
              />
            </label>
          </div>
          <label className={labelClass}>
            Slots por recurso
            <input
              className={inputClass}
              type="number"
              min="1"
              value={span}
              onChange={(event) => setSpan(event.target.value)}
            />
          </label>
          {preview ? <p className="text-[0.78rem] text-app-muted">Prévia: {preview}</p> : null}
          <div aria-live="polite" className="min-h-5 text-[0.78rem] text-status-red">
            {message}
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-app-accent px-3 text-[0.85rem] font-semibold text-app-text hover:brightness-95"
            onClick={add}
          >
            <Plus size={16} aria-hidden="true" />
            Adicionar recursos
          </button>
        </div>
      </aside>
    );
  }

  if (!node) return null;
  const placement = node.placement?.placementPolicy === 'LINEAR' ? node.placement : undefined;
  const childRules = containmentRules(rulesByType[node.typeId]);
  const proposedPlacement = (position: number, span: number) => ({
    placementPolicy: 'LINEAR' as const,
    position,
    ...(span > 1 ? { span } : {}),
  });
  const placementError = (position: number, span: number) => {
    const candidate = proposedPlacement(position, span);
    if (candidate.position < 1 || linearEnd(candidate) > configuration.capacity) {
      return `A posição deve permanecer entre ${linearLabel(configuration, 1)} e ${linearLabel(configuration, configuration.capacity)}.`;
    }
    const conflict = linearConflictAt(occupants, candidate, node);
    return conflict
      ? `${linearLabel(configuration, conflict.placement.position)} já está ocupada por ${conflict.item.name}. Escolha outra posição.`
      : '';
  };
  const updatePlacement = (position: number, span: number) => {
    const error = placementError(position, span);
    if (error) return setPlacementMessage(error);
    setPlacementMessage('');
    update({ placement: proposedPlacement(position, span) });
  };
  const update = (changes: Partial<ChildNode>) =>
    onChangeChildren(updateNode(children, node.key, (current) => ({ ...current, ...changes })));
  const remove = () => {
    onChangeChildren(updateNode(children, node.key, () => null));
    onSelect(null);
  };
  return (
    <aside
      className="min-h-0 overflow-y-auto rounded-[10px] border border-app-border bg-app-panel p-4"
      aria-label="Detalhes do componente"
    >
      <div className="grid gap-3">
        <div>
          <p className="text-[0.85rem] font-semibold text-app-text">{node.name || 'Componente'}</p>
          <p className="text-[0.78rem] text-app-muted">
            {placement
              ? `${linearLabel(configuration, placement.position)}${linearEnd(placement) > placement.position ? ` a ${linearLabel(configuration, linearEnd(placement))}` : ''}`
              : 'Sem posição'}
          </p>
        </div>
        <label className={labelClass}>
          Nome
          <input
            className={inputClass}
            value={node.name}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className={labelClass}>
          Specification
          <select
            className={inputClass}
            value={node.specId}
            onChange={(event) => update({ specId: event.target.value })}
          >
            {specs
              .filter((spec) => spec.resourceTypeId === node.typeId)
              .map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.name}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Posição
            <input
              className={inputClass}
              type="number"
              min="1"
              max={configuration.capacity}
              value={placement?.position ?? 1}
              onChange={(event) => {
                const position = Number.parseInt(event.target.value, 10);
                if (Number.isInteger(position)) updatePlacement(position, placement?.span ?? 1);
              }}
            />
          </label>
          <label className={labelClass}>
            Span
            <input
              className={inputClass}
              type="number"
              min="1"
              value={placement?.span ?? 1}
              onChange={(event) => {
                const nextSpan = Number.parseInt(event.target.value, 10);
                if (Number.isInteger(nextSpan) && nextSpan > 0)
                  updatePlacement(placement?.position ?? 1, nextSpan);
              }}
            />
          </label>
        </div>
        <div aria-live="polite" className="min-h-5 text-[0.78rem] text-status-red">
          {placementMessage}
        </div>
        <fieldset className="grid gap-2 border-t border-app-border pt-3">
          <legend className="text-[0.78rem] font-semibold text-app-text">Estados</legend>
          <label className={labelClass}>
            Status
            <select
              aria-label="Status do componente"
              className={inputClass}
              value={node.status}
              onChange={(event) => update({ status: event.target.value })}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="suspended">Suspenso</option>
              <option value="terminated">Terminado</option>
            </select>
          </label>
          <label className={labelClass}>
            Motivo do status
            <input
              aria-label="Motivo do status do componente"
              className={inputClass}
              value={node.statusCode}
              placeholder="Padrão"
              onChange={(event) => update({ statusCode: event.target.value })}
            />
          </label>
          <label className={labelClass}>
            Estado administrativo
            <select
              aria-label="Estado administrativo do componente"
              className={inputClass}
              value={node.administrativeState}
              onChange={(event) => update({ administrativeState: event.target.value })}
            >
              <option value="unlocked">Desbloqueado</option>
              <option value="locked">Bloqueado</option>
              <option value="shuttingDown">Em desligamento</option>
            </select>
          </label>
          <label className={labelClass}>
            Estado operacional
            <select
              aria-label="Estado operacional do componente"
              className={inputClass}
              value={node.operationalState}
              onChange={(event) => update({ operationalState: event.target.value })}
            >
              <option value="enabled">Habilitado</option>
              <option value="disabled">Desabilitado</option>
            </select>
          </label>
          <label className={labelClass}>
            Estado de uso
            <select
              aria-label="Estado de uso do componente"
              className={inputClass}
              value={node.usageState}
              onChange={(event) => update({ usageState: event.target.value })}
            >
              <option value="idle">Livre</option>
              <option value="active">Em uso parcial</option>
              <option value="busy">Ocupado</option>
              <option value="unknown">Desconhecido</option>
            </select>
          </label>
        </fieldset>
        <ChildCharacteristics
          node={node}
          type={typeById.get(node.typeId)}
          onChange={(characteristics) => update({ characteristics })}
        />
        {childRules.length > 0 ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-app-border px-3 text-[0.82rem] font-semibold text-app-text hover:bg-app-hover"
            onClick={() => onEnter(node)}
          >
            Gerenciar componentes internos
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-status-red/40 px-3 text-[0.82rem] font-semibold text-status-red hover:bg-status-red/10"
          onClick={remove}
        >
          <Trash2 size={16} aria-hidden="true" />
          {node.id ? 'Desvincular recurso' : 'Remover do rascunho'}
        </button>
        {node.id ? (
          <p className="text-[0.75rem] text-app-muted">O recurso continuará no inventário.</p>
        ) : null}
      </div>
    </aside>
  );
}

function ChildCharacteristics({
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
  return (
    <fieldset className="grid gap-2 border-t border-app-border pt-3">
      <legend className="text-[0.78rem] font-semibold text-app-text">Características</legend>
      {specification.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-[0.75rem] font-semibold text-app-muted">Da specification</p>
          {specification.map((definition) => (
            <label key={definition.name} className={labelClass}>
              {definition.name}
              {control(definition, false)}
            </label>
          ))}
        </div>
      ) : null}
      {instance.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-[0.75rem] font-semibold text-app-muted">Da instância</p>
          {instance.map((definition) => (
            <label key={definition.name} className={labelClass}>
              {definition.name}
              {control(definition, true)}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[0.78rem] text-app-muted">
          Este tipo não define características de instância.
        </p>
      )}
    </fieldset>
  );
}

function FallbackComponents({
  draft,
  rootTypeId,
  rulesByType,
  typeById,
  specs,
  ensureRules,
  onChange,
}: Omit<Props, 'rootName'>) {
  useEffect(() => {
    void ensureRules(rootTypeId);
  }, [ensureRules, rootTypeId]);
  const rules = containmentRules(rulesByType[rootTypeId]);
  const add = (rule: ResourceTypeRelationshipRule) => {
    const specification = specs.find((spec) => spec.resourceTypeId === rule.targetId);
    onChange([
      ...draft,
      {
        key: nextKey(),
        relationshipDefinitionId: rule.id,
        ...(rule.configuration?.placementPolicy === 'GRID'
          ? { placement: { placementPolicy: 'GRID' as const, row: 1, column: 1 } }
          : {}),
        name: '',
        specId: specification?.id ?? '',
        typeId: rule.targetId,
        status: 'active',
        statusCode: '',
        administrativeState: 'unlocked',
        operationalState: 'enabled',
        usageState: 'idle',
        characteristics: [],
        children: [],
      },
    ]);
  };
  return (
    <div className="grid gap-3">
      <p className="text-[0.82rem] text-app-muted">
        Este tipo não possui organização LINEAR. A edição estrutural permanece na lista compacta.
      </p>
      {rules.map((rule) => (
        <button
          key={rule.id}
          type="button"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[8px] border border-app-border px-3 text-[0.82rem] text-app-text hover:bg-app-hover"
          onClick={() => add(rule)}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar {typeById.get(rule.targetId)?.name ?? 'componente'}
        </button>
      ))}
      {draft.map((node) => {
        const rule = rules.find(
          (candidate) =>
            candidate.id === node.relationshipDefinitionId || candidate.targetId === node.typeId,
        );
        const placement = node.placement?.placementPolicy === 'GRID' ? node.placement : undefined;
        const updateGrid = (field: 'row' | 'column', value: string) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isInteger(parsed)) return;
          onChange(
            updateNode(draft, node.key, (current) => ({
              ...current,
              ...(rule ? { relationshipDefinitionId: rule.id } : {}),
              placement: {
                placementPolicy: 'GRID',
                row: field === 'row' ? parsed : (placement?.row ?? 1),
                column: field === 'column' ? parsed : (placement?.column ?? 1),
              },
            })),
          );
        };
        return (
          <div
            key={node.key}
            className="flex flex-wrap items-center gap-2 rounded-[8px] border border-app-border p-2"
          >
            <input
              aria-label="Nome do componente"
              className={`${inputClass} min-w-[140px] flex-1`}
              value={node.name}
              onChange={(event) =>
                onChange(
                  updateNode(draft, node.key, (current) => ({
                    ...current,
                    name: event.target.value,
                  })),
                )
              }
            />
            {rule?.configuration?.placementPolicy === 'GRID' ? (
              <span className="flex items-center gap-1">
                <input
                  aria-label="Linha estrutural"
                  className="w-14 rounded-[8px] border border-app-border bg-app-panel px-2 py-1 font-mono text-[0.8rem] text-app-text"
                  type="number"
                  min="1"
                  max={rule.configuration.rows}
                  value={placement?.row ?? ''}
                  onChange={(event) => updateGrid('row', event.target.value)}
                />
                <span>×</span>
                <input
                  aria-label="Coluna estrutural"
                  className="w-14 rounded-[8px] border border-app-border bg-app-panel px-2 py-1 font-mono text-[0.8rem] text-app-text"
                  type="number"
                  min="1"
                  max={rule.configuration.columns}
                  value={placement?.column ?? ''}
                  onChange={(event) => updateGrid('column', event.target.value)}
                />
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`Remover ${node.name || 'componente'}`}
              className="p-2 text-app-muted hover:text-status-red"
              onClick={() => onChange(updateNode(draft, node.key, () => null))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
