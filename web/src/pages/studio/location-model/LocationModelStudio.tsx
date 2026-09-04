import { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Building,
  Layers,
  Shield,
  Trash2,
  Edit2,
  Search,
} from 'lucide-react';
import type {
  GeoSpec,
  GeoSpecCategory,
  GeoSiteRole,
  CreateGeoSpecInput,
  UpdateGeoSpecInput,
} from '../../../services/geoApi';
import {
  listGeoSiteSpecifications,
  createGeoSpec,
  updateGeoSpec,
  retireGeoSpec,
} from '../../../services/geoApi';
import {
  getStudioStatus,
  saveStudioDraft,
} from '../../../services/studioApi';
import { LocationSpecFormModal } from './LocationSpecFormModal';
import { LocationSpecImpactModal } from './LocationSpecImpactModal';

export type LocationModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
};

const CATEGORY_LABELS: Record<GeoSpecCategory, string> = {
  Region: 'Região',
  FunctionalGroup: 'Grupo Funcional',
  Site: 'Local (Site)',
  SubSite: 'Sub-Local (SubSite)',
};

const ROLE_LABELS: Record<GeoSiteRole, string> = {
  grouping: 'Agrupamento',
  network: 'Rede',
  property: 'Imobiliário',
  service: 'Serviço',
};

const ROLE_COLORS: Record<GeoSiteRole, string> = {
  grouping: 'bg-amber-50 text-amber-700 border-amber-200',
  network: 'bg-blue-50 text-blue-700 border-blue-200',
  property: 'bg-purple-50 text-purple-700 border-purple-200',
  service: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function LocationModelStudio({ canEdit }: LocationModelStudioProps) {
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [capturingDraft, setCapturingDraft] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<GeoSpec | null>(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactingSpec, setImpactingSpec] = useState<GeoSpec | null>(null);

  const loadSpecs = async () => {
    try {
      const list = await listGeoSiteSpecifications();
      setSpecs(list);
      if (list.length > 0 && !selectedSpecId) {
        setSelectedSpecId(list[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar especificações de locais.');
    }
  };

  useEffect(() => {
    loadSpecs();
  }, []);

  const selectedSpec = specs.find((s) => s.id === selectedSpecId) ?? null;

  // Filtragem
  const filteredSpecs = specs.filter((s) => {
    const matchesCat = selectedCategory === 'ALL' || s.category === selectedCategory;
    const term = filterText.toLowerCase();
    const matchesSearch =
      !term ||
      s.name.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term) ||
      (s.description && s.description.toLowerCase().includes(term));
    return matchesCat && matchesSearch;
  });

  // Salvar snapshot como draft do Studio
  const handleCaptureAsDraft = async () => {
    try {
      setCapturingDraft(true);
      setError(null);
      setDraftSuccess(null);

      const snapshot = {
        specifications: specs.map((s) => {
          const allowedParentCodes = (s.allowedParentSpec || [])
            .map((p) => p.code)
            .concat(
              s.allowedParentSpecIds
                .map((id) => specs.find((x) => x.id === id)?.code)
                .filter((code): code is string => Boolean(code)),
            );
          const allowedChildCodes = (s.allowedChildSpec || [])
            .map((c) => c.code)
            .concat(
              s.allowedChildSpecIds
                .map((id) => specs.find((x) => x.id === id)?.code)
                .filter((code): code is string => Boolean(code)),
            );

          return {
            id: s.id,
            code: s.code,
            name: s.name,
            category: s.category,
            siteRole: s.siteRole,
            description: s.description,
            lifecycleStatus: s.lifecycleStatus,
            allowedParentCodes: Array.from(new Set(allowedParentCodes)),
            allowedChildCodes: Array.from(new Set(allowedChildCodes)),
            specCharacteristic: s.specCharacteristic || [],
          };
        }),
      };

      const status = await getStudioStatus('location-model');
      await saveStudioDraft(
        'location-model',
        snapshot,
        status.draftVersion?.checksum,
      );
      setDraftSuccess('Snapshot do modelo de locais salvo como draft de governança!');
      setTimeout(() => setDraftSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar draft no Studio.');
    } finally {
      setCapturingDraft(false);
    }
  };

  const handleCreateSpec = async (input: CreateGeoSpecInput) => {
    const created = await createGeoSpec(input);
    setSpecs((prev) => [...prev, created]);
    setSelectedSpecId(created.id);
    await loadSpecs();
  };

  const handleUpdateSpec = async (id: string, input: UpdateGeoSpecInput) => {
    const updated = await updateGeoSpec(id, input);
    setSpecs((prev) => prev.map((s) => (s.id === id ? updated : s)));
    await loadSpecs();
  };

  const handleRetireSpec = async () => {
    if (!impactingSpec) return;
    const retired = await retireGeoSpec(impactingSpec.id);
    setSpecs((prev) => prev.map((s) => (s.id === retired.id ? retired : s)));
    await loadSpecs();
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[22px] border border-app-border bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-app-accent-soft text-app-text">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[1.05rem] font-semibold text-app-text">Modelo de Locais & Contenção</h2>
            <p className="text-[0.78rem] text-app-muted">
              Especificações geográficas (TMF674), papéis funcionais (C11) e regras de hierarquia.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditingSpec(null);
                  setFormModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-[12px] bg-app-accent px-3.5 py-2 text-[0.82rem] font-semibold text-white hover:opacity-90 transition shadow-soft"
              >
                <Plus className="h-4 w-4" />
                Nova Especificação
              </button>

              <button
                type="button"
                onClick={handleCaptureAsDraft}
                disabled={capturingDraft}
                className="flex items-center gap-1.5 rounded-[12px] border border-app-border bg-white px-3.5 py-2 text-[0.82rem] font-medium text-app-text hover:bg-app-accent-soft transition"
              >
                <Save className="h-4 w-4 text-app-muted" />
                {capturingDraft ? 'Salvando...' : 'Salvar como Draft'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={loadSpecs}
            title="Recarregar Especificações"
            className="rounded-[12px] border border-app-border bg-white p-2 text-app-muted hover:text-app-text hover:bg-black/[0.02] transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {draftSuccess && (
        <div className="flex items-center gap-2 rounded-[16px] border border-emerald-200 bg-emerald-50 p-3 text-[0.84rem] text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{draftSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[16px] border border-red-200 bg-red-50 p-3 text-[0.84rem] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Master / Detail Grid */}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left: Lista de Especificações */}
        <div className="rounded-[22px] border border-app-border bg-white p-4 shadow-soft min-h-[580px] flex flex-col">
          <div className="space-y-2 pb-3 border-b border-app-border mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar por nome ou código..."
                className="w-full rounded-[12px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto py-0.5">
              {['ALL', 'Region', 'FunctionalGroup', 'Site', 'SubSite'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-[8px] text-[0.72rem] font-medium shrink-0 transition ${
                    selectedCategory === cat
                      ? 'bg-app-accent text-white font-semibold'
                      : 'bg-black/[0.03] text-app-muted hover:text-app-text'
                  }`}
                >
                  {cat === 'ALL' ? 'Todos' : CATEGORY_LABELS[cat as GeoSpecCategory] || cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[640px]">
            {filteredSpecs.length === 0 ? (
              <div className="p-8 text-center text-app-muted text-[0.84rem]">
                Nenhuma especificação encontrada.
              </div>
            ) : (
              filteredSpecs.map((spec) => {
                const isSelected = selectedSpecId === spec.id;
                return (
                  <div
                    key={spec.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSpecId(spec.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSpecId(spec.id);
                      }
                    }}
                    className={`p-3 rounded-[14px] border transition cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold shadow-xs'
                        : 'border-app-border hover:bg-black/[0.02] text-app-text'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-[0.88rem]">{spec.name}</span>
                        {spec._bootstrapProtected && (
                          <span title="Protegido pelo bootstrap" className="inline-flex">
                            <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[0.72rem] font-mono text-app-muted">{spec.code}</span>
                        <span className="text-[0.7rem] px-1.5 py-0.2 rounded bg-black/[0.04] text-app-muted font-medium">
                          {CATEGORY_LABELS[spec.category]}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[0.68rem] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${
                        ROLE_COLORS[spec.siteRole]
                      }`}
                    >
                      {ROLE_LABELS[spec.siteRole]}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detalhe da Especificação Selecionada */}
        <div className="min-w-0">
          {selectedSpec ? (
            <div className="flex flex-col h-full bg-white rounded-[22px] border border-app-border overflow-hidden shadow-soft">
              {/* Header do Detalhe */}
              <div className="p-6 border-b border-app-border bg-gradient-to-b from-black/[0.01] to-transparent">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-app-border bg-app-bg text-app-accent">
                      <Building className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.74rem] font-bold uppercase tracking-wider text-app-muted">
                          {CATEGORY_LABELS[selectedSpec.category]}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold border ${
                            ROLE_COLORS[selectedSpec.siteRole]
                          }`}
                        >
                          {ROLE_LABELS[selectedSpec.siteRole]}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${
                            selectedSpec.lifecycleStatus === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {selectedSpec.lifecycleStatus === 'Active' ? 'Ativo' : 'Aposentado'}
                        </span>
                      </div>
                      <h2 className="text-[1.35rem] font-semibold text-app-text mt-0.5 tracking-[-0.01em]">
                        {selectedSpec.name}
                      </h2>
                      <p className="text-[0.82rem] font-mono text-app-muted mt-0.5">{selectedSpec.code}</p>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSpec(selectedSpec);
                          setFormModalOpen(true);
                        }}
                        className="rounded-[12px] border border-app-border bg-white px-3 py-1.5 text-[0.82rem] font-medium text-app-text hover:bg-app-accent-soft transition"
                      >
                        <Edit2 className="h-4 w-4 inline mr-1 text-app-muted" />
                        Editar
                      </button>
                      {!selectedSpec._bootstrapProtected && selectedSpec.lifecycleStatus === 'Active' && (
                        <button
                          type="button"
                          onClick={() => {
                            setImpactingSpec(selectedSpec);
                            setImpactModalOpen(true);
                          }}
                          className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-1.5 text-[0.82rem] font-medium text-red-700 hover:bg-red-100 transition"
                        >
                          <Trash2 className="h-4 w-4 inline mr-1 text-red-600" />
                          Aposentar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Corpo com Grid de Informações e Regras */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                <div>
                  <h3 className="text-[0.82rem] font-semibold uppercase tracking-wider text-app-muted mb-2">
                    Descrição
                  </h3>
                  <p className="text-[0.92rem] text-app-text leading-relaxed">
                    {selectedSpec.description || 'Nenhuma descrição informada.'}
                  </p>
                </div>

                {/* Regras de Contenção Permitidas */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Pais Permitidos */}
                  <div className="rounded-[18px] border border-app-border p-4 bg-app-bg/40">
                    <div className="flex items-center gap-2 mb-3">
                      <FolderTree className="h-4 w-4 text-amber-600" />
                      <h4 className="text-[0.85rem] font-semibold text-app-text">
                        Pode ser contido por (Pais Permitidos)
                      </h4>
                    </div>
                    {selectedSpec.allowedParentSpecIds.length === 0 ? (
                      <p className="text-[0.8rem] text-app-muted italic">Nenhum pai permitido (Raiz do modelo).</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSpec.allowedParentSpecIds.map((pId) => {
                          const parentSpec = specs.find((s) => s.id === pId);
                          return (
                            <span
                              key={pId}
                              className="inline-flex items-center gap-1 rounded-[8px] border border-app-border bg-white px-2.5 py-1 text-[0.78rem] text-app-text font-medium"
                            >
                              <span>{parentSpec ? parentSpec.name : pId}</span>
                              <span className="text-[0.7rem] font-mono text-app-muted">
                                ({parentSpec ? parentSpec.code : pId.slice(0, 6)})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Filhos Permitidos */}
                  <div className="rounded-[18px] border border-app-border p-4 bg-app-bg/40">
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className="h-4 w-4 text-sky-600" />
                      <h4 className="text-[0.85rem] font-semibold text-app-text">
                        Pode conter diretamente (Filhos Permitidos)
                      </h4>
                    </div>
                    {selectedSpec.allowedChildSpecIds.length === 0 ? (
                      <p className="text-[0.8rem] text-app-muted italic">Nenhum filho permitido (Folha do modelo).</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSpec.allowedChildSpecIds.map((cId) => {
                          const childSpec = specs.find((s) => s.id === cId);
                          return (
                            <span
                              key={cId}
                              className="inline-flex items-center gap-1 rounded-[8px] border border-app-border bg-white px-2.5 py-1 text-[0.78rem] text-app-text font-medium"
                            >
                              <span>{childSpec ? childSpec.name : cId}</span>
                              <span className="text-[0.7rem] font-mono text-app-muted">
                                ({childSpec ? childSpec.code : cId.slice(0, 6)})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Características Canônicas */}
                <div>
                  <h3 className="text-[0.82rem] font-semibold uppercase tracking-wider text-app-muted mb-3">
                    Características da Especificação ({selectedSpec.specCharacteristic?.length ?? 0})
                  </h3>
                  {!selectedSpec.specCharacteristic || selectedSpec.specCharacteristic.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-app-border p-6 text-center text-[0.84rem] text-app-muted">
                      Nenhuma característica personalizada definida nesta especificação.
                    </div>
                  ) : (
                    <div className="divide-y divide-app-border rounded-[16px] border border-app-border overflow-hidden">
                      {selectedSpec.specCharacteristic.map((c, idx) => (
                        <div key={idx} className="p-3.5 hover:bg-black/[0.01] flex items-center justify-between text-[0.85rem]">
                          <div>
                            <span className="font-semibold text-app-text">{c.name}</span>
                            {c.description && <p className="text-[0.78rem] text-app-muted mt-0.5">{c.description}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[0.74rem] font-mono px-2 py-0.5 rounded bg-black/[0.04] text-app-muted">
                              {c.valueType}
                            </span>
                            {c.mandatory && (
                              <span className="text-[0.7rem] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                                Obrigatório
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-app-border bg-white p-12 text-center text-app-muted flex flex-col items-center justify-center min-h-[580px]">
              <MapPin className="h-10 w-10 mb-3 opacity-30" />
              <h3 className="text-[1.1rem] font-semibold text-app-text">Nenhuma especificação selecionada</h3>
              <p className="text-[0.85rem] mt-1 max-w-sm">
                Selecione uma especificação de local à esquerda para visualizar suas regras de contenção e características.
              </p>
            </div>
          )}
        </div>
      </div>

      <LocationSpecFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingSpec(null);
        }}
        onSubmitCreate={handleCreateSpec}
        onSubmitUpdate={handleUpdateSpec}
        editingSpec={editingSpec}
        allSpecs={specs}
      />

      {impactingSpec && (
        <LocationSpecImpactModal
          isOpen={impactModalOpen}
          onClose={() => {
            setImpactModalOpen(false);
            setImpactingSpec(null);
          }}
          onConfirmRetire={handleRetireSpec}
          spec={impactingSpec}
        />
      )}
    </div>
  );
}
