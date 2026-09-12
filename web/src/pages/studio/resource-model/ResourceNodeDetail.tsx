import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  FileCode,
  Check,
  Loader2,
  Cpu,
  MapPin,
  AlertCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Layers,
  Tag,
} from 'lucide-react';
import type {
  ResourceCatalogNode,
  ResourceCatalogPath,
  ResourceCatalogNodeImpact,
  ResourceTypeCatalogContext,
  UpdateResourceCatalogNodeInput,
} from '../../../services/resourceCatalogApi';
import { isLogicalResourceNode } from '../../../utils/resourceNodeNature';
import {
  getResourceCatalogNodePath,
  getResourceCatalogNodeImpact,
  getResourceTypeCatalogContext,
  listResourceSpecifications,
} from '../../../services/resourceCatalogApi';
import {
  deleteResourceSpecification,
  updateResourceType,
  type ResourceSpecification,
} from '../../../services/resourceApi';
import {
  buildCharacteristicPayload,
  resourceCharacteristicRowsFrom,
  type ResourceCharacteristicRow,
} from '../../../utils/resourceCharacteristicsForm';
import { ResourceCharacteristicFormModal } from './ResourceCharacteristicFormModal';
import { ResourceSpecificationFormModal } from './ResourceSpecificationFormModal';
import { ResourceRelationshipRulesPanel } from './ResourceRelationshipRulesPanel';
import { IconPickerModal } from './IconPickerModal';
import { resolveNodeIcon } from './catalogNodeIcons';
import { Button } from '../../../components/ui';

const numberFormatter = new Intl.NumberFormat('pt-BR');

const VALUE_TYPE_LABELS: Record<ResourceCharacteristicRow['valueType'], string> = {
  string: 'Texto',
  integer: 'Inteiro',
  decimal: 'Decimal',
  boolean: 'Booleano',
  date: 'Data',
  list: 'Lista de opções',
  json: 'JSON livre',
};

export type ResourceNodeDetailProps = {
  catalogId: string;
  node: ResourceCatalogNode;
  canEdit: boolean;
  /** Existe um draft de governança aberto — controla a visibilidade dos botões de mutação. */
  isEditing: boolean;
  /**
   * O nó já estava `active` no instante em que a sessão de edição atual começou (baseline
   * capturada em `ResourceModelStudio.captureInitialSnapshot`). Diferencia "inativado agora,
   * pode reverter" de "já estava inativo antes desta sessão" — só a primeira ganha "Reativar".
   */
  wasActiveAtBaseline: boolean;
  onEdit?: () => void;
  onImpact: () => void;
  onReactivate: () => void;
  onUpdateNode?: (input: UpdateResourceCatalogNodeInput) => Promise<void>;
  /**
   * Registra (ou desregistra, com `null`) a função `flush()` do autosave deste painel — chamada
   * por `ResourceModelStudio` antes de capturar snapshot/draft/publicação, para garantir que uma
   * edição em debounce não seja perdida (plano §5.5).
   */
  onRegisterFlush?: (fn: (() => Promise<void>) | null) => void;
  /**
   * Notifica o pai a cada transição do estado de autosave deste painel — `ResourceModelStudio`
   * usa isto para bloquear "Publicar" em `StudioGovernanceSummary` enquanto houver edição
   * pendente/em voo/com erro (plano §5.8). Chamado com `'idle'` ao desmontar (nó desselecionado).
   */
  onAutosaveStateChange?: (state: AutosaveState) => void;
};

export type DetailTab = 'overview' | 'characteristics' | 'specifications' | 'relations';
export type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type FormSnapshot = {
  name: string;
  code: string;
  description: string;
  icon: string | undefined;
  nature: 'PhysicalResource' | 'LogicalResource';
  mapPresence: boolean;
};

const AUTOSAVE_DEBOUNCE_MS = 700;

export function ResourceNodeDetail({
  catalogId,
  node,
  canEdit,
  isEditing,
  wasActiveAtBaseline,
  onImpact,
  onReactivate,
  onUpdateNode,
  onRegisterFlush,
  onAutosaveStateChange,
}: ResourceNodeDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [path, setPath] = useState<ResourceCatalogPath | null>(null);
  const [specifications, setSpecifications] = useState<ResourceSpecification[]>([]);
  const [context, setContext] = useState<ResourceTypeCatalogContext | null>(null);
  const [impact, setImpact] = useState<ResourceCatalogNodeImpact | null>(null);

  // Linhas das características que definem o ResourceType (issue #216) — a aba "Características"
  // deixou de ser por especificação: edita `context.resourceType.resourceTypeCharacteristic`,
  // herdado por todas as specs desse tipo. Lista + modal de item único (plano §8) em vez da
  // edição tabular de `ResourceCharacteristicsEditor` — cada add/edit/remove persiste de imediato.
  const [typeCharacteristicRows, setTypeCharacteristicRows] = useState<ResourceCharacteristicRow[]>([]);
  const [typeCharacteristicError, setTypeCharacteristicError] = useState<string | null>(null);
  const [characteristicModalOpen, setCharacteristicModalOpen] = useState(false);
  const [editingCharacteristicRow, setEditingCharacteristicRow] = useState<ResourceCharacteristicRow | null>(
    null,
  );
  const [characteristicDeletingKey, setCharacteristicDeletingKey] = useState<string | null>(null);

  // Modal de criação/edição/leitura de ResourceSpecification (aba "Especificações", issue #216).
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<ResourceSpecification | null>(null);
  const [specModalReadOnly, setSpecModalReadOnly] = useState(false);
  const [specDeletingId, setSpecDeletingId] = useState<string | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);

  // Estados locais para edição direta (inline), autosalvos — ver `scheduleSave`/`flush` abaixo.
  const [formName, setFormName] = useState(node.name);
  const [formCode, setFormCode] = useState(node.code);
  const [formDescription, setFormDescription] = useState(node.description || '');
  const [formNature, setFormNature] = useState<'PhysicalResource' | 'LogicalResource'>('PhysicalResource');
  const [formMapPresence, setFormMapPresence] = useState<boolean>(false);
  const [formIcon, setFormIcon] = useState<string | undefined>(
    (node.metadata?.icon as string) || undefined,
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);

  const isGroup = node.kind === 'GROUP';

  const defaultIsLogical = isLogicalResourceNode(node, context?.resourceType?.categoryCode);

  // Espelha os campos do formulário em um ref para que o autosave (debounce/flush) sempre leia o
  // valor mais recente, mesmo dentro de um timeout ou de uma closure antiga.
  const formRef = useRef<FormSnapshot>({
    name: node.name,
    code: node.code,
    description: node.description || '',
    icon: (node.metadata?.icon as string) || undefined,
    nature: 'PhysicalResource',
    mapPresence: false,
  });

  // Revisão monotônica por nó — cada novo save incrementa; uma resposta de uma revisão antiga
  // nunca sobrescreve o estado local de uma edição mais nova (ver plano §5.3).
  const revisionRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateNodeRef = useRef(onUpdateNode);
  onUpdateNodeRef.current = onUpdateNode;

  // Sincroniza o formulário somente quando o nó SELECIONADO muda de fato (por id) — nunca a cada
  // nova referência de objeto `node` recebida após `reloadTree()`. Antes, o efeito dependia de
  // `[node, defaultIsLogical]`, então toda gravação (que dispara reload) recriava o objeto `node`
  // e este efeito resetava o formulário por cima de uma edição em andamento — a exata corrida que
  // o autosave precisa evitar.
  useEffect(() => {
    setFormName(node.name);
    setFormCode(node.code);
    setFormDescription(node.description || '');
    setFormIcon((node.metadata?.icon as string) || undefined);

    // Enquanto o contexto canônico do ResourceType carrega, usa apenas a heurística de natureza e
    // mantém a visibilidade desligada. Nunca usa metadata legado para exibir "Sim": isso fazia a UI
    // mentir mesmo quando tmf_resource_type.map_presence permanecia false.
    const initialNature: 'PhysicalResource' | 'LogicalResource' = defaultIsLogical
      ? 'LogicalResource'
      : 'PhysicalResource';
    setFormNature(initialNature);

    const initialMapPresence = false;
    setFormMapPresence(initialMapPresence);

    formRef.current = {
      name: node.name,
      code: node.code,
      description: node.description || '',
      icon: (node.metadata?.icon as string) || undefined,
      nature: initialNature,
      mapPresence: initialMapPresence,
    };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    revisionRef.current = 0;
    setAutosaveState('idle');
    setAutosaveError(null);
    // Depende apenas do id do nó selecionado — ver comentário acima sobre por que `node` inteiro
    // e `defaultIsLogical` não entram nas dependências.
  }, [node.id]);

  useEffect(() => {
    let isMounted = true;

    // Caminho/impacto podem ser consultas caras no Oracle. Carrega-os sem bloquear o contexto do
    // ResourceType, que é a fonte canônica de nature/mapPresence e precisa chegar primeiro para o
    // formulário não apresentar um valor fictício enquanto as métricas ainda estão calculando.
    void getResourceCatalogNodePath(catalogId, node.id)
      .then((result) => {
        if (isMounted) setPath(result);
      })
      .catch(() => {
        if (isMounted) setPath(null);
      });
    void getResourceCatalogNodeImpact(catalogId, node.id)
      .then((result) => {
        if (isMounted) setImpact(result);
      })
      .catch(() => {
        if (isMounted) setImpact(null);
      });

    if (node.kind === 'RESOURCE_TYPE' && node.resourceTypeId) {
      void Promise.all([
        listResourceSpecifications({ resourceTypeId: node.resourceTypeId }).catch(() => []),
        getResourceTypeCatalogContext(node.resourceTypeId).catch(() => null),
      ]).then(([specsRes, contextRes]) => {
        if (!isMounted) return;
        setSpecifications(specsRes);
        setContext(contextRes);
        setTypeCharacteristicRows(
          resourceCharacteristicRowsFrom(contextRes?.resourceType.resourceTypeCharacteristic),
        );
        setTypeCharacteristicError(null);
        if (contextRes) {
          const canonicalNature = contextRes.resourceType.nature ?? 'PhysicalResource';
          const canonicalMapPresence =
            canonicalNature === 'PhysicalResource' && contextRes.resourceType.mapPresence === true;
          setFormNature(canonicalNature);
          setFormMapPresence(canonicalMapPresence);
          formRef.current = {
            ...formRef.current,
            nature: canonicalNature,
            mapPresence: canonicalMapPresence,
          };
        }
      });
    } else {
      setSpecifications([]);
      setContext(null);
      setTypeCharacteristicRows([]);
      setTypeCharacteristicError(null);
    }

    return () => {
      isMounted = false;
    };
  }, [catalogId, node]);

  // Se a folha selecionada deixa de ser RESOURCE_TYPE (ex.: seleção mudou para um grupo) e a aba
  // ativa era exclusiva de tipo, volta para Geral — evita renderizar uma aba inexistente.
  useEffect(() => {
    if (isGroup && activeTab !== 'overview') {
      setActiveTab('overview');
    }
  }, [isGroup, activeTab]);

  const pathString = path
    ? path.nodes.length > 1
      ? `/ ${path.nodes.slice(0, -1).map((n) => n.name).join(' / ')} /`
      : '/'
    : '';

  const isLogical = context?.resourceType.nature
    ? context.resourceType.nature === 'LogicalResource'
    : defaultIsLogical;

  // ---- Autosave: núcleo do controlador (plano §5) --------------------------------------------

  const doSaveNow = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const myRevision = ++revisionRef.current;
    setAutosaveState('saving');
    setAutosaveError(null);

    const snapshot = formRef.current;
    const updatedMetadata: Record<string, unknown> = {
      ...(node.metadata ?? {}),
      ...(snapshot.icon ? { icon: snapshot.icon } : {}),
    };
    if (!snapshot.icon && 'icon' in updatedMetadata) {
      delete updatedMetadata.icon;
    }
    // Estes campos pertencem ao ResourceType. Remove cópias legadas do metadata para manter uma
    // única fonte de verdade e evitar que a visualização volte a divergir da elegibilidade GEO.
    delete updatedMetadata.nature;
    delete updatedMetadata.mapPresence;

    try {
      await onUpdateNodeRef.current?.({
        name: snapshot.name.trim() || node.name,
        code: snapshot.code.trim() || node.code,
        description: snapshot.description.trim() || undefined,
        metadata: updatedMetadata,
        ...(node.kind === 'RESOURCE_TYPE'
          ? {
              nature: snapshot.nature,
              mapPresence:
                snapshot.nature === 'PhysicalResource' ? snapshot.mapPresence : false,
            }
          : {}),
      });
      // Uma edição mais nova já começou enquanto este save estava em voo — deixa o ciclo mais
      // recente decidir o estado final; não regride "saving"/"dirty" para "saved" por cima dele.
      if (myRevision === revisionRef.current) {
        setAutosaveState('saved');
      }
    } catch (err: unknown) {
      if (myRevision === revisionRef.current) {
        setAutosaveState('error');
        setAutosaveError(err instanceof Error ? err.message : 'Falha ao salvar alterações do nó.');
      }
    }
  }, [node]);

  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void doSaveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [doSaveNow]);

  /** Força o flush imediato de qualquer alteração pendente — usado em blur, troca de aba, troca
   * de nó e antes de captura/publicação (plano §5.5). Idempotente quando não há nada pendente. */
  const flush = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      await doSaveNow();
    }
  }, [doSaveNow]);

  useEffect(() => {
    onRegisterFlush?.(flush);
    return () => onRegisterFlush?.(null);
  }, [flush, onRegisterFlush]);

  // Repassa cada transição de estado ao pai (ver doc de `onAutosaveStateChange`) e reporta
  // `'idle'` ao desmontar — o nó pode ter sido desselecionado com uma gravação em erro pendente,
  // e "Publicar" não deve continuar bloqueado por um painel que não existe mais.
  useEffect(() => {
    onAutosaveStateChange?.(autosaveState);
  }, [autosaveState, onAutosaveStateChange]);

  useEffect(() => {
    return () => onAutosaveStateChange?.('idle');
    // Roda apenas na montagem/desmontagem — não deve disparar a cada render por causa de
    // `onAutosaveStateChange` sendo recriada no pai.
  }, []);

  const handleTextChange = (field: 'name' | 'code' | 'description', value: string) => {
    formRef.current = { ...formRef.current, [field]: value };
    if (field === 'name') setFormName(value);
    if (field === 'code') setFormCode(value);
    if (field === 'description') setFormDescription(value);
    setAutosaveState('dirty');
    scheduleSave();
  };

  const handleImmediateChange = (patch: Partial<FormSnapshot>) => {
    formRef.current = { ...formRef.current, ...patch };
    if (patch.icon !== undefined) setFormIcon(patch.icon);
    if (patch.nature !== undefined) setFormNature(patch.nature);
    if (patch.mapPresence !== undefined) setFormMapPresence(patch.mapPresence);
    setAutosaveState('dirty');
    void doSaveNow();
  };

  const handleSelectIcon = (newIcon: string) => {
    setIconPickerOpen(false);
    handleImmediateChange({ icon: newIcon });
  };

  // Persiste um array completo de linhas como `resourceTypeCharacteristic` do tipo — chamada por
  // add/edit/remove, que montam o array alvo antes de chamar isto (plano §8.5). Em falha, o
  // array em tela não é alterado, para o modal/estado local não sumirem antes da confirmação.
  const persistCharacteristicRows = async (nextRows: ResourceCharacteristicRow[]): Promise<void> => {
    if (!context) return;
    const updated = await updateResourceType(context.resourceType.id, {
      resourceTypeCharacteristic: buildCharacteristicPayload(nextRows),
    });
    setContext((prev) => (prev ? { ...prev, resourceType: updated } : prev));
    setTypeCharacteristicRows(resourceCharacteristicRowsFrom(updated.resourceTypeCharacteristic));
  };

  const handleOpenCreateCharacteristic = () => {
    setEditingCharacteristicRow(null);
    setTypeCharacteristicError(null);
    setCharacteristicModalOpen(true);
  };

  const handleOpenEditCharacteristic = (row: ResourceCharacteristicRow) => {
    setEditingCharacteristicRow(row);
    setTypeCharacteristicError(null);
    setCharacteristicModalOpen(true);
  };

  const handleSaveCharacteristic = async (row: ResourceCharacteristicRow) => {
    const exists = typeCharacteristicRows.some((r) => r.key === row.key);
    const nextRows = exists
      ? typeCharacteristicRows.map((r) => (r.key === row.key ? row : r))
      : [...typeCharacteristicRows, row];
    await persistCharacteristicRows(nextRows);
  };

  const handleDeleteCharacteristic = async (row: ResourceCharacteristicRow) => {
    setTypeCharacteristicError(null);
    setCharacteristicDeletingKey(row.key);
    try {
      await persistCharacteristicRows(typeCharacteristicRows.filter((r) => r.key !== row.key));
    } catch (err: unknown) {
      setTypeCharacteristicError(
        err instanceof Error ? err.message : 'Falha ao remover característica.',
      );
    } finally {
      setCharacteristicDeletingKey(null);
    }
  };

  const handleOpenCreateSpec = () => {
    setEditingSpec(null);
    setSpecModalReadOnly(false);
    setSpecError(null);
    setSpecModalOpen(true);
  };

  const handleOpenEditSpec = (spec: ResourceSpecification) => {
    setEditingSpec(spec);
    setSpecModalReadOnly(false);
    setSpecError(null);
    setSpecModalOpen(true);
  };

  const handleOpenViewSpec = (spec: ResourceSpecification) => {
    setEditingSpec(spec);
    setSpecModalReadOnly(true);
    setSpecError(null);
    setSpecModalOpen(true);
  };

  const handleSpecSaved = (saved: ResourceSpecification) => {
    setSpecifications((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
    });
  };

  const handleDeleteSpec = async (spec: ResourceSpecification) => {
    setSpecError(null);
    setSpecDeletingId(spec.id);
    try {
      await deleteResourceSpecification(spec.id);
      setSpecifications((prev) => prev.filter((s) => s.id !== spec.id));
    } catch (err: unknown) {
      setSpecError(err instanceof Error ? err.message : 'Falha ao remover especificação.');
    } finally {
      setSpecDeletingId(null);
    }
  };

  const displayIcon = isEditing ? formIcon : (node.metadata?.icon as string | undefined);
  const CurrentNodeIcon = resolveNodeIcon(displayIcon, node.kind, isLogical);

  const handleTabChange = (tab: DetailTab) => {
    void flush();
    setActiveTab(tab);
  };

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group/icon shrink-0">
              <button
                type="button"
                disabled={!isEditing}
                onClick={() => isEditing && setIconPickerOpen(true)}
                title={isEditing ? 'Clique para trocar o ícone deste nó' : undefined}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border transition ${
                  isGroup
                    ? 'border-amber-200 bg-amber-50 text-amber-600'
                    : isLogical
                      ? 'border-purple-200 bg-purple-50 text-purple-600'
                      : 'border-sky-200 bg-sky-50 text-sky-600'
                } ${
                  isEditing
                    ? 'cursor-pointer hover:scale-105 hover:shadow-sm ring-offset-1 focus:outline-none focus:ring-2 ' +
                      (isGroup
                        ? 'hover:border-amber-400 focus:ring-amber-400'
                        : isLogical
                          ? 'hover:border-purple-400 focus:ring-purple-400'
                          : 'hover:border-sky-400 focus:ring-sky-400')
                    : 'cursor-default'
                }`}
              >
                <CurrentNodeIcon className="h-5 w-5" />
              </button>
              {isEditing && (
                <span
                  onClick={() => setIconPickerOpen(true)}
                  title="Trocar ícone"
                  className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-app-accent text-app-text shadow-xs transition cursor-pointer"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold leading-tight text-app-text truncate">{node.name}</h3>
              {pathString && (
                <p className="text-[0.78rem] text-app-muted leading-tight mt-0.5 truncate font-normal">
                  {pathString}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isEditing && <AutosaveIndicator state={autosaveState} error={autosaveError} />}
            {canEdit && isEditing && (
              <div className="flex items-center gap-2">
                {node.status === 'active' && (
                  <Button variant="danger" size="sm" onClick={onImpact}>
                    Inativar
                  </Button>
                )}
                {node.status !== 'active' && wasActiveAtBaseline && (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<RotateCcw className="h-4 w-4" />}
                    onClick={onReactivate}
                  >
                    Reativar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs — segmented control pill */}
        <div className="mt-3.5 flex">
          <div className="inline-flex items-center rounded-xl bg-black/[0.04] p-1 gap-1">
            <button
              type="button"
              onClick={() => handleTabChange('overview')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Geral
            </button>
            {!isGroup && (
              <button
                type="button"
                onClick={() => handleTabChange('characteristics')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                  activeTab === 'characteristics'
                    ? 'bg-white text-app-text font-semibold shadow-sm'
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                Características
                <span className="rounded-full bg-black/[0.06] px-1.5 py-0.2 text-[0.7rem]">
                  {context?.resourceType.resourceTypeCharacteristic?.length ?? 0}
                </span>
              </button>
            )}
            {!isGroup && (
              <button
                type="button"
                onClick={() => handleTabChange('specifications')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                  activeTab === 'specifications'
                    ? 'bg-white text-app-text font-semibold shadow-sm'
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                Especificações
                <span className="rounded-full bg-black/[0.06] px-1.5 py-0.2 text-[0.7rem]">
                  {specifications.length}
                </span>
              </button>
            )}
            {!isGroup && (
              <button
                type="button"
                onClick={() => handleTabChange('relations')}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                  activeTab === 'relations'
                    ? 'bg-white text-app-text font-semibold shadow-sm'
                    : 'text-app-muted hover:text-app-text'
                }`}
              >
                Relações
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {isEditing ? (
              /* Modo Edição Inline Direta — autosalva; ver `handleTextChange`/`handleImmediateChange`. */
              <div className="space-y-5">
                {autosaveState === 'error' && autosaveError && (
                  <div
                    className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                    style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{autosaveError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                      Nome *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => handleTextChange('name', e.target.value)}
                      onBlur={() => void flush()}
                      placeholder="Ex: Optical Line Terminal"
                      className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                      Código *
                    </label>
                    <input
                      type="text"
                      value={formCode}
                      onChange={(e) => handleTextChange('code', e.target.value)}
                      onBlur={() => void flush()}
                      placeholder="Ex: OLT"
                      className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                    Descrição
                  </label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => handleTextChange('description', e.target.value)}
                    onBlur={() => void flush()}
                    placeholder="Descrição funcional do nó no catálogo de recursos..."
                    className="w-full rounded-[14px] border border-app-border bg-white px-3 py-2 text-[0.88rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                  />
                </div>

                {!isGroup && (
                  <div className="space-y-3 rounded-[12px] border border-app-border bg-black/[0.01] p-4">
                    <div>
                      <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                        Natureza do Recurso
                      </label>
                      <div className="inline-flex rounded-xl bg-black/[0.04] p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => handleImmediateChange({ nature: 'PhysicalResource' })}
                          className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition ${
                            formNature === 'PhysicalResource'
                              ? 'bg-white text-app-text font-semibold shadow-sm'
                              : 'text-app-muted hover:text-app-text'
                          }`}
                        >
                          <Box className="h-4 w-4 text-sky-600" />
                          Recurso Físico
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImmediateChange({ nature: 'LogicalResource' })}
                          className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[0.84rem] font-medium transition ${
                            formNature === 'LogicalResource'
                              ? 'bg-white text-app-text font-semibold shadow-sm'
                              : 'text-app-muted hover:text-app-text'
                          }`}
                        >
                          <Cpu className="h-4 w-4 text-purple-600" />
                          Recurso Lógico
                        </button>
                      </div>
                    </div>

                    {formNature === 'PhysicalResource' && (
                      <div className="pt-2 border-t border-app-border/70">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formMapPresence}
                            onChange={(e) => handleImmediateChange({ mapPresence: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                          />
                          <div className="text-left">
                            <span className="flex items-center gap-1.5 text-[0.84rem] font-semibold text-app-text">
                              <MapPin className="h-3.5 w-3.5 text-app-muted" />
                              Exibir no mapa
                            </span>
                            <span className="block text-[0.76rem] text-app-muted mt-0.5">
                              Instâncias deste recurso físico serão indexadas na camada geoespacial do mapa.
                            </span>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Modo Visualização (Read-Only) */
              <>
                {Boolean(node.description?.trim()) && (
                  <div>
                    <h3 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                      Descrição
                    </h3>
                    <p className="text-[0.92rem] text-app-text leading-relaxed">
                      {node.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {!isGroup && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Natureza
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {isLogical ? 'Recurso Lógico' : 'Recurso Físico'}
                      </p>
                    </div>
                  )}

                  {!isGroup && !isLogical && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Visível no Mapa
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {context?.resourceType.mapPresence === true ? 'Sim' : 'Não'}
                      </p>
                    </div>
                  )}

                  <div className="rounded-[10px] border border-app-border p-4">
                    <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                      Descendentes
                    </span>
                    <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                      {numberFormatter.format(impact?.descendantCount ?? 0)}
                    </p>
                  </div>

                  {!isGroup && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Volume de Recursos Físicos Cadastrados
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {numberFormatter.format(impact?.activePhysicalResourceCount ?? 0)}
                      </p>
                    </div>
                  )}

                  {!isGroup && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Volume Recursos Lógicos Cadastrados
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {numberFormatter.format(impact?.activeLogicalResourceCount ?? 0)}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'characteristics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[0.88rem] font-semibold text-app-text">
                  Características do tipo ({typeCharacteristicRows.length})
                </h3>
                <p className="text-[0.78rem] text-app-muted mt-0.5">
                  Toda especificação deste tipo herda este conjunto e pode ajustar o valor.
                </p>
              </div>
              {canEdit && isEditing && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  iconLeft={<Plus className="h-3.5 w-3.5" />}
                  onClick={handleOpenCreateCharacteristic}
                >
                  Adicionar característica
                </Button>
              )}
            </div>

            {typeCharacteristicError && (
              <div
                className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{typeCharacteristicError}</span>
              </div>
            )}

            {typeCharacteristicRows.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
                <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-[0.88rem] font-medium">Nenhuma característica cadastrada.</p>
                <p className="text-[0.78rem]">
                  As características definidas aqui serão herdadas por toda especificação deste
                  tipo.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-app-border rounded-[18px] border border-app-border overflow-hidden">
                {typeCharacteristicRows.map((row) => {
                  const canMutateCharacteristic = canEdit && isEditing;
                  return (
                    <div
                      key={row.key}
                      onClick={() => handleOpenEditCharacteristic(row)}
                      className="group px-3.5 py-2.5 hover:bg-black/[0.02] cursor-pointer transition flex items-center justify-between gap-3"
                      role="button"
                      tabIndex={0}
                      title={row.description || undefined}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenEditCharacteristic(row);
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <h4 className="text-[0.88rem] font-semibold text-app-text truncate">
                          {row.name}
                        </h4>
                        <p className="text-[0.78rem] text-app-muted truncate">
                          {row.group ? `${row.group} · ` : ''}
                          {VALUE_TYPE_LABELS[row.valueType] ?? row.valueType}
                        </p>
                      </div>
                      {canMutateCharacteristic && (
                        <button
                          type="button"
                          title="Remover característica"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteCharacteristic(row);
                          }}
                          disabled={characteristicDeletingKey === row.key}
                          className="hidden group-hover:flex group-focus-within:flex rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'specifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.88rem] font-semibold text-app-text">
                Especificações vinculadas ({specifications.length})
              </h3>
              {canEdit && isEditing && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  iconLeft={<Plus className="h-3.5 w-3.5" />}
                  onClick={handleOpenCreateSpec}
                >
                  Nova especificação
                </Button>
              )}
            </div>

            {specError && (
              <div
                className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{specError}</span>
              </div>
            )}

            {specifications.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
                <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-[0.88rem] font-medium">Nenhuma especificação cadastrada.</p>
                <p className="text-[0.78rem]">
                  Especificações técnicas vinculadas a este tipo de recurso aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-app-border rounded-[18px] border border-app-border overflow-hidden">
                {specifications.map((spec) => (
                  <div
                    key={spec.id}
                    onClick={() => {
                      if (canEdit && isEditing) {
                        handleOpenEditSpec(spec);
                      } else {
                        handleOpenViewSpec(spec);
                      }
                    }}
                    className="px-3.5 py-2.5 hover:bg-black/[0.02] cursor-pointer transition flex items-center justify-between gap-3"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (canEdit && isEditing) {
                          handleOpenEditSpec(spec);
                        } else {
                          handleOpenViewSpec(spec);
                        }
                      }
                    }}
                  >
                    <div className="min-w-0">
                      <h4 className="text-[0.88rem] font-semibold text-app-text truncate">{spec.name}</h4>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {canEdit && isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditSpec(spec)}
                            className="rounded-xl border border-transparent p-1.5 text-app-muted transition hover:border-app-border hover:bg-app-accent-soft hover:text-app-text"
                            aria-label={`Editar ${spec.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSpec(spec)}
                            disabled={specDeletingId === spec.id}
                            className="rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50"
                            aria-label={`Remover ${spec.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-[0.75rem] font-mono text-app-muted">
                          {spec.id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'relations' && !isGroup && node.resourceTypeId && (
          <ResourceRelationshipRulesPanel
            resourceTypeId={node.resourceTypeId}
            canEdit={canEdit}
            isEditing={isEditing}
          />
        )}
        {activeTab === 'relations' && !isGroup && !node.resourceTypeId && (
          <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-[0.88rem] font-medium">Tipo de recurso ainda não sincronizado.</p>
          </div>
        )}
      </div>

      {context && (
        <ResourceSpecificationFormModal
          isOpen={specModalOpen}
          onClose={() => setSpecModalOpen(false)}
          resourceType={context.resourceType}
          editingSpec={editingSpec}
          readOnly={specModalReadOnly}
          onSaved={handleSpecSaved}
        />
      )}

      <ResourceCharacteristicFormModal
        isOpen={characteristicModalOpen}
        onClose={() => setCharacteristicModalOpen(false)}
        editingRow={editingCharacteristicRow}
        readOnly={!(canEdit && isEditing)}
        existingNames={typeCharacteristicRows
          .filter((r) => r.key !== editingCharacteristicRow?.key)
          .map((r) => r.name)}
        onSave={handleSaveCharacteristic}
      />

      <IconPickerModal
        isOpen={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        onSelect={handleSelectIcon}
        currentIcon={formIcon}
        nodeKind={node.kind}
        isLogical={isLogical}
      />
    </div>
  );
}

/** Indicador discreto do autosave — substitui os antigos botões "Salvar alterações"/"Reverter" e
 * os banners de sucesso/erro persistentes (plano §5.7). */
function AutosaveIndicator({ state, error }: { state: AutosaveState; error: string | null }) {
  if (state === 'idle') return null;
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[0.78rem] text-app-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Salvando…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-[0.78rem] text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        Salvo
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[0.78rem] text-status-red" title={error ?? undefined}>
        <AlertCircle className="h-3.5 w-3.5" />
        Falha ao salvar
      </span>
    );
  }
  // dirty
  return <span className="text-[0.78rem] text-app-muted">Alterações pendentes…</span>;
}
