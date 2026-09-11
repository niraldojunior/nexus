import { AlertCircle, CheckCircle2, Copy, FileStack, Layers, Plus, RefreshCw, Trash2, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStudioStatus, saveStudioDraft, type StudioDomain } from '../../../services/studioApi';
import {
  computeTemplateImportPlan,
  applyTemplateImportPlan,
  type StudioTemplateItem,
  type TemplatesStudioSnapshot,
  type StudioTemplateImportPlan,
  type ConflictStrategy,
} from '../../../services/studioTemplateApi';
import { Button } from '../../../components/ui';

type TemplatesStudioProps = {
  canEdit: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

const DOMAIN_LABELS: Record<string, string> = {
  'resource-model': 'Recursos',
  'location-model': 'Locais',
  spatial: 'Camadas Espaciais',
  'studio-geo': 'Mapa GEO',
  'rules-workflows': 'Regras e Workflows',
};

export function TemplatesStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: TemplatesStudioProps) {
  const [snapshot, setSnapshot] = useState<TemplatesStudioSnapshot | null>(null);
  const [checksum, setChecksum] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null);

  // Import / Planner state
  const [activeTab, setActiveTab] = useState<'library' | 'import'>('library');
  const [selectedTargets, setSelectedTargets] = useState<StudioDomain[]>([]);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, ConflictStrategy>>({});
  const [plan, setPlan] = useState<StudioTemplateImportPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);

  const wasEditingRef = useRef(isEditing);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getStudioStatus('templates');
      const version = status.draftVersion ?? status.publishedVersion;
      const rawSnapshot = version?.snapshot as TemplatesStudioSnapshot | undefined;
      const templates = rawSnapshot?.templates ?? [];
      setSnapshot({ templates });
      setChecksum(status.draftVersion?.checksum);
      if (templates.length > 0 && !selectedTemplateCode) {
        setSelectedTemplateCode(templates[0]?.code ?? null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }, [selectedTemplateCode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) void load();
    wasEditingRef.current = isEditing;
  }, [isEditing, load]);

  const buildSnapshot = useCallback(
    (): Record<string, unknown> => ({
      templates: snapshot?.templates ?? [],
    }),
    [snapshot],
  );

  const captureDraft = useCallback(async () => {
    if (!snapshot) return;
    const updated = await saveStudioDraft('templates', buildSnapshot(), checksum);
    setChecksum(updated.checksum);
  }, [snapshot, buildSnapshot, checksum]);

  useEffect(() => {
    onRegisterCaptureDraft?.(isEditing ? captureDraft : null);
    return () => onRegisterCaptureDraft?.(null);
  }, [onRegisterCaptureDraft, isEditing, captureDraft]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(async () => buildSnapshot());
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [onRegisterCaptureInitialSnapshot, buildSnapshot]);

  const selectedTemplate = useMemo(() => {
    return snapshot?.templates.find((t) => t.code === selectedTemplateCode) ?? null;
  }, [snapshot, selectedTemplateCode]);

  // Handle template selection and initialize target domains for planner
  useEffect(() => {
    if (selectedTemplate) {
      const availableDomains = Array.from(
        new Set(selectedTemplate.fragments.map((f) => f.domain as StudioDomain)),
      );
      setSelectedTargets(availableDomains);
      setPlan(null);
      setConflictResolutions({});
      setApplySuccessMessage(null);
    }
  }, [selectedTemplateCode]);

  // Compute dry-run plan
  const handleComputePlan = async () => {
    if (!selectedTemplate) return;
    setPlanning(true);
    setError(null);
    setApplySuccessMessage(null);
    try {
      // Gather base snapshots for selected targets
      const baseSnapshots: Partial<Record<StudioDomain, Record<string, unknown>>> = {};
      await Promise.all(
        selectedTargets.map(async (domain) => {
          const status = await getStudioStatus(domain);
          const ver = status.draftVersion ?? status.publishedVersion;
          if (ver?.snapshot) {
            baseSnapshots[domain] = ver.snapshot;
          }
        }),
      );

      const computed = await computeTemplateImportPlan({
        template: selectedTemplate,
        targets: selectedTargets,
        baseSnapshots,
        conflictResolutions,
      });
      setPlan(computed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao calcular plano de importação.');
    } finally {
      setPlanning(false);
    }
  };

  // Apply batch plan
  const handleApplyPlan = async () => {
    if (!selectedTemplate || !plan || !plan.canApply) return;
    setApplying(true);
    setError(null);
    try {
      // Gather target drafts ifMatch
      const targetDrafts: Partial<Record<StudioDomain, { ifMatch?: string }>> = {};
      await Promise.all(
        selectedTargets.map(async (domain) => {
          const status = await getStudioStatus(domain);
          if (status.draftVersion) {
            targetDrafts[domain] = { ifMatch: status.draftVersion.checksum };
          }
        }),
      );

      // Base snapshots used during apply
      const baseSnapshots: Partial<Record<StudioDomain, Record<string, unknown>>> = {};
      await Promise.all(
        selectedTargets.map(async (domain) => {
          const status = await getStudioStatus(domain);
          const ver = status.draftVersion ?? status.publishedVersion;
          if (ver?.snapshot) {
            baseSnapshots[domain] = ver.snapshot;
          }
        }),
      );

      await applyTemplateImportPlan({
        planInput: {
          template: selectedTemplate,
          targets: selectedTargets,
          baseSnapshots,
          conflictResolutions,
        },
        planChecksum: plan.planChecksum,
        targetDrafts,
      });

      setApplySuccessMessage(
        `Template "${selectedTemplate.name}" importado com sucesso para os rascunhos dos domínios alvo!`,
      );
      setPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao aplicar plano de importação.');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-text-secondary)]">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Carregando biblioteca de templates...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border-danger)] bg-[var(--color-bg-danger-subtle)] p-3 text-sm text-[var(--color-text-danger)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {applySuccessMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border-success)] bg-[var(--color-bg-success-subtle)] p-3 text-sm text-[var(--color-text-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{applySuccessMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-default)]">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'library'
              ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <FileStack className="h-4 w-4" />
          Biblioteca de Templates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'import'
              ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <Copy className="h-4 w-4" />
          Clonar / Importar para Domínios
        </button>
      </div>

      {activeTab === 'library' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Template List */}
          <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Templates Disponíveis</h3>
              {isEditing && canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const newCode = `custom-template-${Date.now().toString().slice(-4)}`;
                    const newTemplate: StudioTemplateItem = {
                      code: newCode,
                      name: 'Novo Template',
                      category: 'Geral',
                      version: '1.0.0',
                      description: 'Descrição do novo pacote declarativo.',
                      fragments: [
                        {
                          domain: 'location-model',
                          payload: { specifications: [] },
                        },
                      ],
                    };
                    setSnapshot((prev) => ({
                      templates: [...(prev?.templates ?? []), newTemplate],
                    }));
                    setSelectedTemplateCode(newCode);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {snapshot?.templates.map((tpl) => (
                <button
                  key={tpl.code}
                  type="button"
                  onClick={() => setSelectedTemplateCode(tpl.code)}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    selectedTemplateCode === tpl.code
                      ? 'border-[var(--color-brand)] bg-[var(--color-bg-brand-subtle)]'
                      : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--color-text-primary)]">{tpl.name}</span>
                    <span className="rounded bg-[var(--color-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                      {tpl.category}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    v{tpl.version} • {tpl.fragments.length} fragmento(s)
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Template Detail */}
          <div className="lg:col-span-2">
            {selectedTemplate ? (
              <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                      {selectedTemplate.name}
                    </h2>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Código: <code className="font-mono">{selectedTemplate.code}</code> | Versão:{' '}
                      {selectedTemplate.version} | Categoria: {selectedTemplate.category}
                    </p>
                  </div>
                  {isEditing && canEdit && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setSnapshot((prev) => ({
                          templates: (prev?.templates ?? []).filter((t) => t.code !== selectedTemplate.code),
                        }));
                        setSelectedTemplateCode(null);
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  )}
                </div>

                <p className="text-sm text-[var(--color-text-secondary)]">{selectedTemplate.description}</p>

                <div className="border-t border-[var(--color-border-default)] pt-4">
                  <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
                    Fragmentos Declarativos
                  </h4>
                  <div className="space-y-3">
                    {selectedTemplate.fragments.map((frag, idx) => (
                      <div
                        key={idx}
                        className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
                      >
                        <div className="flex items-center gap-2 mb-2 font-medium text-xs text-[var(--color-text-primary)]">
                          <Layers className="h-3.5 w-3.5 text-[var(--color-brand)]" />
                          <span>Domínio: {DOMAIN_LABELS[frag.domain] ?? frag.domain}</span>
                        </div>
                        <pre className="max-h-40 overflow-y-auto rounded bg-[var(--color-bg-surface)] p-2 text-xs font-mono text-[var(--color-text-secondary)]">
                          {JSON.stringify(frag.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-default)] text-sm text-[var(--color-text-secondary)]">
                Selecione um template para ver detalhes.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Planner & Import Tab */
        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Clonar Template para os Domínios do Studio
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Gera um plano determinístico de importação e aplica como rascunho (draft) nos domínios selecionados sem publicar diretamente.
            </p>
          </div>

          {selectedTemplate ? (
            <div className="space-y-4">
              <div className="rounded bg-[var(--color-bg-subtle)] p-3 text-sm">
                <span className="font-medium text-[var(--color-text-primary)]">Template selecionado:</span>{' '}
                {selectedTemplate.name} ({selectedTemplate.code} v{selectedTemplate.version})
              </div>

              {/* Target Domains Selection */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Domínios de Destino para Importação
                </label>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(selectedTemplate.fragments.map((f) => f.domain as StudioDomain))).map(
                    (domain) => {
                      const isSelected = selectedTargets.includes(domain);
                      return (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => {
                            setSelectedTargets((prev) =>
                              isSelected ? prev.filter((d) => d !== domain) : [...prev, domain],
                            );
                            setPlan(null);
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white'
                              : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                          }`}
                        >
                          {DOMAIN_LABELS[domain] ?? domain}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleComputePlan}
                  disabled={planning || selectedTargets.length === 0}
                >
                  {planning ? (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Calculando Plano...
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Simular Importação (Dry-Run)
                    </>
                  )}
                </Button>
              </div>

              {/* Plan Results */}
              {plan && (
                <div className="border-t border-[var(--color-border-default)] pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Resultado do Plano de Importação
                    </h4>
                    <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                      Checksum: {plan.planChecksum.slice(0, 12)}...
                    </span>
                  </div>

                  {/* Conflicts handling */}
                  {plan.conflicts.length > 0 && (
                    <div className="rounded-lg border border-[var(--color-border-warning)] bg-[var(--color-bg-warning-subtle)] p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-warning)]">
                        <AlertCircle className="h-4 w-4" />
                        <span>Conflitos Identificados ({plan.conflicts.length})</span>
                      </div>
                      <div className="space-y-2">
                        {plan.conflicts.map((conflict) => (
                          <div
                            key={conflict.id}
                            className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-medium text-[var(--color-text-primary)]">
                                {conflict.name} ({conflict.code})
                              </div>
                              <div className="text-[var(--color-text-secondary)]">
                                Domínio: {DOMAIN_LABELS[conflict.domain] ?? conflict.domain} • Tipo: {conflict.kind}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[var(--color-text-secondary)]">Resolução:</label>
                              <select
                                value={conflictResolutions[conflict.id] ?? 'reject'}
                                onChange={(e) => {
                                  setConflictResolutions((prev) => ({
                                    ...prev,
                                    [conflict.id]: e.target.value as ConflictStrategy,
                                  }));
                                }}
                                className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 py-1 text-xs"
                              >
                                <option value="reject">Rejeitar / Bloquear</option>
                                <option value="reuse">Reutilizar Existente</option>
                                <option value="rename">Renomear / Clonar Novo</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" variant="secondary" onClick={handleComputePlan}>
                        Recalcular com Resoluções
                      </Button>
                    </div>
                  )}

                  {/* Planned Operations */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                      Operações Previstas ({plan.operations.length})
                    </h5>
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {plan.operations.map((op, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-semibold text-[10px] ${
                                op.action === 'create'
                                  ? 'bg-green-100 text-green-800'
                                  : op.action === 'reuse'
                                    ? 'bg-blue-100 text-blue-800'
                                    : op.action === 'rename'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {op.action.toUpperCase()}
                            </span>
                            <span className="font-medium text-[var(--color-text-primary)]">{op.name}</span>
                            <span className="font-mono text-[var(--color-text-secondary)]">({op.code})</span>
                          </div>
                          <span className="text-[var(--color-text-secondary)]">
                            {DOMAIN_LABELS[op.domain] ?? op.domain}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Apply action */}
                  <div className="pt-2">
                    <Button
                      onClick={handleApplyPlan}
                      disabled={!plan.canApply || applying}
                      variant={plan.canApply ? 'primary' : 'secondary'}
                    >
                      {applying ? (
                        <>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Aplicando aos Rascunhos...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                          Gravar Rascunhos em Lote
                        </>
                      )}
                    </Button>
                    {!plan.canApply && (
                      <p className="mt-1 text-xs text-[var(--color-text-danger)]">
                        Resolva todos os conflitos antes de aplicar.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Nenhum template selecionado na biblioteca.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
