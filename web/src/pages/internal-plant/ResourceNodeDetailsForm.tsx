import { Plus, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ResourceIcon } from '../../components/ResourceIcon';
import type { ResourceSpecification, ResourceType } from '../../services/resourceApi';
import type { ChildNode } from './ResourceEditorModal';
import { ChildCharacteristics, inlineLabelClass, inputClass } from './resource-component-shared';

type DetailsTab = 'general' | 'states' | 'characteristics';

const TABS: Array<{ id: DetailsTab; label: string }> = [
  { id: 'general', label: 'Geral' },
  { id: 'states', label: 'Estados' },
  { id: 'characteristics', label: 'Características' },
];

const iconButtonClass =
  'grid size-9 place-items-center rounded-[10px] border border-app-border text-app-text hover:bg-app-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';

/**
 * Detalhes de um recurso filho no rascunho agregado, compartilhados entre o
 * inspetor LINEAR e o inspetor da organização padrão.
 * Cabeçalho com ações (+ criar filho, lixeira) e sub-abas Geral / Estados /
 * Características. `afterIdentity` recebe campos específicos da organização
 * (ex.: posição/span); `afterCharacteristics` recebe ações adicionais da aba Geral.
 */
export function ResourceNodeDetailsForm({
  node,
  specs,
  type,
  onUpdate,
  onRemove,
  onAdd,
  onChangeType,
  typeOptions,
  afterIdentity,
  afterCharacteristics,
}: {
  node: ChildNode;
  specs: ResourceSpecification[];
  type: ResourceType | undefined;
  onUpdate: (changes: Partial<ChildNode>) => void;
  onRemove: () => void;
  /** Presente apenas quando o tipo admite componentes internos. */
  onAdd?: () => void;
  /** Quando presente, o tipo pode ser trocado entre estas opções. */
  typeOptions?: Array<{ typeId: string; name: string }>;
  onChangeType?: (typeId: string) => void;
  afterIdentity?: ReactNode;
  afterCharacteristics?: ReactNode;
}) {
  const [tab, setTab] = useState<DetailsTab>('general');
  const typeName = type?.name ?? '';
  const instanceCount = (type?.resourceTypeCharacteristic ?? []).length;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`node-tab-${next.id}`)?.focus();
  };
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-app-border bg-[var(--surface-muted)] text-app-text">
          <ResourceIcon
            resource={type?.code}
            visualIdentity={type?.visualIdentity}
            variant="glyph"
            size={20}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[0.9rem] font-semibold text-app-text"
            title={node.name || undefined}
          >
            {node.name || 'Componente'}
          </p>
          <p className="truncate text-[0.78rem] text-app-muted">{typeName}</p>
        </div>
        {onAdd ? (
          <button
            type="button"
            className={`${iconButtonClass} border-transparent bg-app-accent hover:bg-app-accent hover:brightness-95`}
            aria-label="Adicionar componente interno"
            title="Adicionar componente interno"
            onClick={onAdd}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={`${iconButtonClass} border-status-red/40 text-status-red hover:bg-status-red/10`}
          aria-label={node.id ? 'Desvincular recurso' : 'Remover do rascunho'}
          title={node.id ? 'Desvincular recurso (continua no inventário)' : 'Remover do rascunho'}
          onClick={onRemove}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        role="tablist"
        aria-label="Seções do componente"
        className="flex min-w-0 gap-1 border-b border-app-border"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`node-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="node-tabpanel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onTabKeyDown}
            className={`-mb-px flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-[0.8rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-accent ${tab === id ? 'border-app-accent text-app-text' : 'border-transparent text-app-muted hover:text-app-text'}`}
          >
            {label}
            {id === 'characteristics' ? (
              <span className="text-[0.72rem] font-normal">{instanceCount}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        id="node-tabpanel"
        role="tabpanel"
        aria-labelledby={`node-tab-${tab}`}
        className="grid min-w-0 grid-cols-1 gap-3"
      >
        {tab === 'general' ? (
          <>
            <label className={inlineLabelClass}>
              Nome
              <input
                className={inputClass}
                value={node.name}
                onChange={(event) => onUpdate({ name: event.target.value })}
              />
            </label>
            <label className={inlineLabelClass}>
              Tipo
              {typeOptions && typeOptions.length > 1 && onChangeType ? (
                <select
                  aria-label="Tipo do componente"
                  className={inputClass}
                  value={node.typeId}
                  onChange={(event) => onChangeType(event.target.value)}
                >
                  {typeOptions.map((option) => (
                    <option key={option.typeId} value={option.typeId}>
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : (
                <output className={`${inputClass} block truncate`}>{typeName || '—'}</output>
              )}
            </label>
            <label className={inlineLabelClass}>
              Especificação
              <select
                className={inputClass}
                value={node.specId}
                onChange={(event) => onUpdate({ specId: event.target.value })}
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
            {afterIdentity}
            {afterCharacteristics}
          </>
        ) : null}
        {tab === 'states' ? (
          <>
            <label className={inlineLabelClass}>
              Status
              <select
                aria-label="Status do componente"
                className={inputClass}
                value={node.status}
                onChange={(event) => onUpdate({ status: event.target.value })}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="suspended">Suspenso</option>
                <option value="terminated">Terminado</option>
              </select>
            </label>
            <label className={inlineLabelClass}>
              Motivo do status
              <input
                aria-label="Motivo do status do componente"
                className={inputClass}
                value={node.statusCode}
                placeholder="Padrão"
                onChange={(event) => onUpdate({ statusCode: event.target.value })}
              />
            </label>
            <label className={inlineLabelClass}>
              Estado administrativo
              <select
                aria-label="Estado administrativo do componente"
                className={inputClass}
                value={node.administrativeState}
                onChange={(event) => onUpdate({ administrativeState: event.target.value })}
              >
                <option value="unlocked">Desbloqueado</option>
                <option value="locked">Bloqueado</option>
                <option value="shuttingDown">Em desligamento</option>
              </select>
            </label>
            <label className={inlineLabelClass}>
              Estado operacional
              <select
                aria-label="Estado operacional do componente"
                className={inputClass}
                value={node.operationalState}
                onChange={(event) => onUpdate({ operationalState: event.target.value })}
              >
                <option value="enabled">Habilitado</option>
                <option value="disabled">Desabilitado</option>
              </select>
            </label>
            <label className={inlineLabelClass}>
              Estado de uso
              <select
                aria-label="Estado de uso do componente"
                className={inputClass}
                value={node.usageState}
                onChange={(event) => onUpdate({ usageState: event.target.value })}
              >
                <option value="idle">Livre</option>
                <option value="active">Em uso parcial</option>
                <option value="busy">Ocupado</option>
                <option value="unknown">Desconhecido</option>
              </select>
            </label>
          </>
        ) : null}
        {tab === 'characteristics' ? (
          <ChildCharacteristics
            node={node}
            type={type}
            onChange={(characteristics) => onUpdate({ characteristics })}
          />
        ) : null}
      </div>
    </>
  );
}
