import { useState, useEffect } from 'react';
import {
  Box,
  FileCode,
  Check,
  Save,
  Cpu,
  MapPin,
  AlertCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
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
  characteristicRowsValid,
  resourceCharacteristicRowsFrom,
  type ResourceCharacteristicRow,
} from '../../../utils/resourceCharacteristicsForm';
import ResourceCharacteristicsEditor from '../../../components/ResourceCharacteristicsEditor';
import { ResourceSpecificationFormModal } from './ResourceSpecificationFormModal';
import { IconPickerModal } from './IconPickerModal';
import { resolveNodeIcon } from './catalogNodeIcons';
import { Button } from '../../../components/ui';

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
};

type DetailTab = 'overview' | 'characteristics' | 'specifications' | 'impact';

export function ResourceNodeDetail({
  catalogId,
  node,
  canEdit,
  isEditing,
  wasActiveAtBaseline,
  onImpact,
  onReactivate,
  onUpdateNode,
}: ResourceNodeDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [path, setPath] = useState<ResourceCatalogPath | null>(null);
  const [specifications, setSpecifications] = useState<ResourceSpecification[]>([]);
  const [context, setContext] = useState<ResourceTypeCatalogContext | null>(null);
  const [impact, setImpact] = useState<ResourceCatalogNodeImpact | null>(null);

  // Linhas editáveis das características que definem o ResourceType (issue #216) — a aba
  // "Características" deixou de ser por especificação: agora edita
  // `context.resourceType.resourceTypeCharacteristic`, herdado por todas as specs desse tipo.
  const [typeCharacteristicRows, setTypeCharacteristicRows] = useState<ResourceCharacteristicRow[]>([]);
  const [typeCharacteristicSaving, setTypeCharacteristicSaving] = useState(false);
  const [typeCharacteristicSuccess, setTypeCharacteristicSuccess] = useState(false);
  const [typeCharacteristicError, setTypeCharacteristicError] = useState<string | null>(null);

  // Modal de criação/edição/leitura de ResourceSpecification (aba "Especificações", issue #216).
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<ResourceSpecification | null>(null);
  const [specModalReadOnly, setSpecModalReadOnly] = useState(false);
  const [specDeletingId, setSpecDeletingId] = useState<string | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);

  // Estados locais para edição direta (inline)
  const [formName, setFormName] = useState(node.name);
  const [formCode, setFormCode] = useState(node.code);
  const [formDescription, setFormDescription] = useState(node.description || '');
  const [formNature, setFormNature] = useState<'PhysicalResource' | 'LogicalResource'>('PhysicalResource');
  const [formMapPresence, setFormMapPresence] = useState<boolean>(true);
  const [formIcon, setFormIcon] = useState<string | undefined>(
    (node.metadata?.icon as string) || undefined,
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGroup = node.kind === 'GROUP';

  const defaultIsLogical = isLogicalResourceNode(node, context?.resourceType?.categoryCode);

  useEffect(() => {
    setFormName(node.name);
    setFormCode(node.code);
    setFormDescription(node.description || '');
    setFormIcon((node.metadata?.icon as string) || undefined);

    const initialNature: 'PhysicalResource' | 'LogicalResource' =
      node.metadata?.nature === 'LogicalResource'
        ? 'LogicalResource'
        : node.metadata?.nature === 'PhysicalResource'
          ? 'PhysicalResource'
          : defaultIsLogical
            ? 'LogicalResource'
            : 'PhysicalResource';
    setFormNature(initialNature);

    const initialMapPresence =
      typeof node.metadata?.mapPresence === 'boolean'
        ? Boolean(node.metadata?.mapPresence)
        : true;
    setFormMapPresence(initialMapPresence);
    setError(null);
    setSaveSuccess(false);
  }, [node, defaultIsLogical]);

  useEffect(() => {
    let isMounted = true;

    async function loadDetails() {
      try {
        const [pathRes, impactRes] = await Promise.all([
          getResourceCatalogNodePath(catalogId, node.id).catch(() => null),
          getResourceCatalogNodeImpact(catalogId, node.id).catch(() => null),
        ]);

        if (isMounted) {
          setPath(pathRes);
          setImpact(impactRes);
        }

        if (node.kind === 'RESOURCE_TYPE' && node.resourceTypeId) {
          const [specsRes, contextRes] = await Promise.all([
            listResourceSpecifications({ resourceTypeId: node.resourceTypeId }).catch(() => []),
            getResourceTypeCatalogContext(node.resourceTypeId).catch(() => null),
          ]);
          if (isMounted) {
            setSpecifications(specsRes);
            setContext(contextRes);
            setTypeCharacteristicRows(
              resourceCharacteristicRowsFrom(contextRes?.resourceType.resourceTypeCharacteristic),
            );
            setTypeCharacteristicError(null);
          }
        } else {
          if (isMounted) {
            setSpecifications([]);
            setContext(null);
            setTypeCharacteristicRows([]);
            setTypeCharacteristicError(null);
          }
        }
      } catch {
        // Ignora erros individuais de detalhamento para manter UI responsiva
      }
    }

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [catalogId, node]);

  const pathString = path
    ? path.nodes.length > 1
      ? `/ ${path.nodes.slice(0, -1).map((n) => n.name).join(' / ')} /`
      : '/'
    : '';

  const isLogical =
    node.metadata?.nature === 'LogicalResource'
      ? true
      : node.metadata?.nature === 'PhysicalResource'
        ? false
        : defaultIsLogical;

  const handleSelectIcon = async (newIcon: string) => {
    setFormIcon(newIcon);
    setIconPickerOpen(false);

    try {
      setSaving(true);
      const updatedMetadata: Record<string, unknown> = {
        ...(node.metadata ?? {}),
        icon: newIcon,
        ...(node.kind === 'RESOURCE_TYPE'
          ? {
              nature: formNature,
              mapPresence: formNature === 'PhysicalResource' ? formMapPresence : false,
            }
          : {}),
      };

      await onUpdateNode?.({
        name: formName.trim() || node.name,
        code: formCode.trim() || node.code,
        description: formDescription.trim() || undefined,
        metadata: updatedMetadata,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar novo ícone no catálogo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInline = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!formName.trim()) {
      setError('O nome do nó é obrigatório.');
      return;
    }
    if (!formCode.trim()) {
      setError('O código do nó é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      const updatedMetadata: Record<string, unknown> = {
        ...(node.metadata ?? {}),
        ...(formIcon ? { icon: formIcon } : {}),
        ...(node.kind === 'RESOURCE_TYPE'
          ? {
              nature: formNature,
              mapPresence: formNature === 'PhysicalResource' ? formMapPresence : false,
            }
          : {}),
      };

      // Se o ícone foi resetado para vazio/padrão, remove do metadata
      if (!formIcon && 'icon' in updatedMetadata) {
        delete updatedMetadata.icon;
      }

      await onUpdateNode?.({
        name: formName.trim(),
        code: formCode.trim(),
        description: formDescription.trim() || undefined,
        metadata: updatedMetadata,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar alterações do nó.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTypeCharacteristics = async () => {
    if (!context) return;
    if (!characteristicRowsValid(typeCharacteristicRows)) {
      setTypeCharacteristicError('Toda característica precisa de um nome.');
      return;
    }

    setTypeCharacteristicSaving(true);
    setTypeCharacteristicError(null);

    try {
      const updated = await updateResourceType(context.resourceType.id, {
        resourceTypeCharacteristic: buildCharacteristicPayload(typeCharacteristicRows),
      });
      setContext((prev) => (prev ? { ...prev, resourceType: updated } : prev));
      setTypeCharacteristicRows(resourceCharacteristicRowsFrom(updated.resourceTypeCharacteristic));
      setTypeCharacteristicSuccess(true);
      setTimeout(() => setTypeCharacteristicSuccess(false), 2500);
    } catch (err: unknown) {
      setTypeCharacteristicError(
        err instanceof Error ? err.message : 'Falha ao salvar características do tipo.',
      );
    } finally {
      setTypeCharacteristicSaving(false);
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

  const handleResetForm = () => {
    setFormName(node.name);
    setFormCode(node.code);
    setFormDescription(node.description || '');
    setFormIcon((node.metadata?.icon as string) || undefined);
    setFormNature(isLogical ? 'LogicalResource' : 'PhysicalResource');
    setFormMapPresence(
      typeof node.metadata?.mapPresence === 'boolean'
        ? Boolean(node.metadata.mapPresence)
        : true,
    );
    setError(null);
  };

  const hasFormChanges =
    formName !== node.name ||
    formCode !== node.code ||
    formDescription !== (node.description || '') ||
    formIcon !== ((node.metadata?.icon as string) || undefined) ||
    (!isGroup && formNature !== (isLogical ? 'LogicalResource' : 'PhysicalResource')) ||
    (!isGroup &&
      formNature === 'PhysicalResource' &&
      formMapPresence !==
        (typeof node.metadata?.mapPresence === 'boolean' ? Boolean(node.metadata.mapPresence) : true));

  const initialCharacteristicsJson = JSON.stringify(
    buildCharacteristicPayload(
      resourceCharacteristicRowsFrom(context?.resourceType?.resourceTypeCharacteristic),
    ),
  );
  const currentCharacteristicsPayload = buildCharacteristicPayload(typeCharacteristicRows);
  const hasCharacteristicChanges =
    JSON.stringify(currentCharacteristicsPayload) !== initialCharacteristicsJson ||
    typeCharacteristicRows.some(
      (r) => !r.name.trim() && (r.valueText || r.description || r.group),
    );

  const displayIcon = isEditing ? formIcon : (node.metadata?.icon as string | undefined);
  const CurrentNodeIcon = resolveNodeIcon(displayIcon, node.kind, isLogical);

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
                  className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-app-text text-white shadow-xs opacity-0 group-hover/icon:opacity-100 transition cursor-pointer"
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

          {canEdit && isEditing && (
            <div className="flex items-center gap-2 shrink-0">
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

        {/* Tabs — segmented control pill */}
        <div className="mt-3.5 flex">
          <div className="inline-flex items-center rounded-xl bg-black/[0.04] p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
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
                onClick={() => setActiveTab('characteristics')}
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
                onClick={() => setActiveTab('specifications')}
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
            <button
              type="button"
              onClick={() => setActiveTab('impact')}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                activeTab === 'impact'
                  ? 'bg-white text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Abrangência
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-6 pt-4 overflow-y-auto flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {isEditing ? (
              /* Modo Edição Inline Direta */
              <form onSubmit={handleSaveInline} className="space-y-5">
                {error && (
                  <div
                    className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
                    style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {saveSuccess && (
                  <div className="flex items-center gap-2 rounded-[10px] bg-emerald-50 p-3 text-[0.84rem] text-emerald-800 border border-emerald-200">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Alterações salvas com sucesso no catálogo.</span>
                  </div>
                )}

                <div className="flex items-center justify-between pb-2 border-b border-app-border">
                  <span className="text-[0.78rem] text-app-muted">
                    {hasFormChanges ? 'Existem alterações não salvas.' : 'Campos em sincronia.'}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasFormChanges && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResetForm}
                        disabled={saving}
                      >
                        Reverter
                      </Button>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      iconLeft={<Save className="h-4 w-4" />}
                      disabled={saving || !hasFormChanges}
                    >
                      {saving ? 'Salvando…' : 'Salvar alterações'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-app-text mb-1.5">
                      Nome *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
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
                      onChange={(e) => setFormCode(e.target.value)}
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
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
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
                          onClick={() => setFormNature('PhysicalResource')}
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
                          onClick={() => setFormNature('LogicalResource')}
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
                            onChange={(e) => setFormMapPresence(e.target.checked)}
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
              </form>
            ) : (
              /* Modo Visualização (Read-Only) */
              <>
                <div>
                  <h3 className="mb-3" style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Descrição
                  </h3>
                  <p className="text-[0.92rem] text-app-text leading-relaxed">
                    {node.description || 'Nenhuma descrição fornecida.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-[10px] border border-app-border p-4">
                    <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Tipo de nó</span>
                    <p className="text-[0.95rem] font-medium text-app-text mt-1">
                      {isGroup ? 'Grupo' : 'Tipo de Recurso'}
                    </p>
                  </div>

                  {!isGroup && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Natureza do recurso
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {isLogical ? 'Recurso Lógico' : 'Recurso Físico'}
                      </p>
                    </div>
                  )}

                  {!isGroup && !isLogical && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Presença no mapa
                      </span>
                      <p className="text-[0.95rem] font-semibold text-app-text mt-1">
                        {node.metadata?.mapPresence === false ? 'Oculto no mapa' : 'Exibido no mapa'}
                      </p>
                    </div>
                  )}

                  {node.resourceType && (
                    <div className="rounded-[10px] border border-app-border p-4">
                      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                        Tipo referenciado
                      </span>
                      <p className="text-[0.95rem] font-medium text-app-text mt-1">
                        {node.resourceType.name}
                      </p>
                    </div>
                  )}

                  <div className="rounded-[10px] border border-app-border p-4">
                    <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Ordem (sort)</span>
                    <p className="text-[0.95rem] font-medium text-app-text mt-1">{node.sortOrder}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'characteristics' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[0.88rem] font-semibold text-app-text">
                  Características do tipo de recurso
                </h3>
                <p className="text-[0.78rem] text-app-muted mt-0.5">
                  Define nome, grupo, tipo e valor padrão. Toda especificação deste tipo herda este
                  conjunto e pode ajustar o valor.
                </p>
              </div>
              {canEdit && isEditing && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  iconLeft={<Save className="h-3.5 w-3.5" />}
                  onClick={handleSaveTypeCharacteristics}
                  disabled={!hasCharacteristicChanges || typeCharacteristicSaving}
                >
                  {typeCharacteristicSaving ? 'Salvando…' : 'Salvar'}
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

            {typeCharacteristicSuccess && (
              <div className="flex items-center gap-2 rounded-[10px] bg-emerald-50 p-3 text-[0.84rem] text-emerald-800 border border-emerald-200">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Características do tipo salvas com sucesso.</span>
              </div>
            )}

            <ResourceCharacteristicsEditor
              rows={typeCharacteristicRows}
              onChange={setTypeCharacteristicRows}
              disabled={!(canEdit && isEditing)}
            />
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

        {activeTab === 'impact' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Descendentes</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.descendantCount ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Tipos afetados</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.resourceTypeIds.length ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Recursos físicos</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.activePhysicalResourceCount ?? 0}
                </p>
              </div>
              <div className="rounded-[10px] border border-app-border p-4">
                <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>Recursos lógicos</span>
                <p className="text-[1.25rem] font-semibold text-app-text mt-1">
                  {impact?.activeLogicalResourceCount ?? 0}
                </p>
              </div>
            </div>
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

