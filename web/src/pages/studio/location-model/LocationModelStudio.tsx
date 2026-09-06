import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, AlertCircle, Shield, Search, MapPin } from 'lucide-react';
import type {
  GeoSpec,
  GeoSpecCategory,
  CreateGeoSpecInput,
  UpdateGeoSpecInput,
} from '../../../services/geoApi';
import {
  listGeoSiteSpecifications,
  createGeoSpec,
  updateGeoSpec,
  retireGeoSpec,
} from '../../../services/geoApi';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import { Button } from '../../../components/ui';
import { LocationSpecFormModal } from './LocationSpecFormModal';
import { LocationSpecImpactModal } from './LocationSpecImpactModal';
import { LocationSpecDetail } from './LocationSpecDetail';

export type LocationModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
  /** Existe um draft de governança aberto para o domínio "location-model" (ver StudioPage). */
  isEditing: boolean;
  /**
   * Registra (ou desregistra, com `null`) a função que captura o estado atual do modelo de locais
   * como draft de governança. `StudioPage` guarda essa função e a repassa a
   * `StudioGovernanceSummary` como `beforePublish`, para que o snapshot gravado na publicação seja
   * sempre o mais recente — mesmo padrão de `ResourceModelStudio` (ver issue #214).
   */
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  /**
   * Registra (ou desregistra, com `null`) a função que apenas monta — sem salvar — o snapshot vivo
   * atual das especificações. Chamada por `StudioPage` no clique de "Editar" para que o draft nasça
   * com uma baseline, permitindo que "Cancelar" restaure de verdade.
   */
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

const CATEGORY_LABELS: Record<GeoSpecCategory, string> = {
  Region: 'Região',
  FunctionalGroup: 'Grupo Funcional',
  Site: 'Local',
  SubSite: 'Sub-Local',
};

export function LocationModelStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: LocationModelStudioProps) {
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<GeoSpec | null>(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactingSpec, setImpactingSpec] = useState<GeoSpec | null>(null);

  // Especificações que já estavam `Active` no instante em que a sessão de edição atual começou
  // (capturado por `onRegisterCaptureInitialSnapshot`, chamado por `StudioGovernanceSummary` no
  // clique de "Editar", antes de qualquer mutação). `null` = nenhuma sessão em andamento. Sem essa
  // baseline, `filteredSpecs` reexibiria também especificações já aposentadas antes desta edição.
  const [baselineActiveSpecIds, setBaselineActiveSpecIds] = useState<Set<string> | null>(null);

  const canMutate = canEdit && isEditing;

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

  // Filtragem — fora do modo de edição, especificações aposentadas ficam ocultas. Dentro do modo
  // de edição, só reaparecem as que foram inativadas DURANTE a sessão atual (estavam `Active` na
  // baseline) — as que já estavam aposentadas antes de "Editar" continuam ocultas, mesmo em
  // edição, para não reexibir lixo histórico.
  const filteredSpecs = specs
    .filter((s) => {
      const matchesCat = selectedCategory === 'ALL' || s.category === selectedCategory;
      const matchesLifecycle =
        s.lifecycleStatus === 'Active' || (isEditing && (baselineActiveSpecIds?.has(s.id) ?? false));
      const term = filterText.toLowerCase();
      const matchesSearch =
        !term ||
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        (s.description && s.description.toLowerCase().includes(term));
      return matchesCat && matchesLifecycle && matchesSearch;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Se a especificação selecionada sair da lista filtrada (ex.: aposentada some ao encerrar a
  // edição), o painel de detalhe não pode continuar apontando para ela.
  useEffect(() => {
    if (selectedSpecId && !filteredSpecs.some((s) => s.id === selectedSpecId)) {
      setSelectedSpecId(filteredSpecs[0]?.id ?? null);
    }
  }, [filteredSpecs, selectedSpecId]);

  const selectedSpec = specs.find((s) => s.id === selectedSpecId) ?? null;

  // Monta o snapshot do modelo de locais a partir do estado vivo — usado tanto para capturar a
  // baseline ao entrar em edição quanto para gravar o draft final ao publicar.
  const buildSnapshot = useCallback(async (): Promise<Record<string, unknown>> => {
    return {
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
  }, [specs]);

  const handleCaptureAsDraft = useCallback(async () => {
    const snapshot = await buildSnapshot();
    const status = await getStudioStatus('location-model');
    await saveStudioDraft('location-model', snapshot, status.draftVersion?.checksum);
  }, [buildSnapshot]);

  useEffect(() => {
    onRegisterCaptureDraft?.(handleCaptureAsDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [handleCaptureAsDraft, onRegisterCaptureDraft]);

  // Captura a baseline de especificações ativas no exato momento em que "Editar" é clicado — além
  // de montar o snapshot (comportamento já existente), grava quais specs estavam `Active` para
  // `filteredSpecs` distinguir "inativada nesta sessão" de "já estava inativa antes".
  const captureInitialSnapshot = useCallback(async () => {
    setBaselineActiveSpecIds(
      new Set(specs.filter((s) => s.lifecycleStatus === 'Active').map((s) => s.id)),
    );
    return buildSnapshot();
  }, [specs, buildSnapshot]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(captureInitialSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [captureInitialSnapshot, onRegisterCaptureInitialSnapshot]);

  // Ao encerrar a edição (draft publicado ou cancelado), recarrega as especificações para refletir
  // o estado gravado e limpa a baseline — mesmo padrão de ResourceModelStudio.
  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      loadSpecs();
      setBaselineActiveSpecIds(null);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing]);

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
      {error && (
        <div
          className="flex items-center gap-2 rounded-[10px] p-3 text-[0.84rem]"
          style={{ background: 'var(--status-red-soft)', color: 'var(--status-red)' }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Master / Detail Grid */}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left: Lista de Especificações */}
        <div className="vt-card flex min-h-[580px] flex-col p-4">
          <div className="space-y-2 pb-3 border-b border-app-border mb-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Buscar por nome ou código..."
                  className="w-full rounded-[10px] border border-app-border bg-white pl-8 pr-3 py-1.5 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
                />
              </div>
              {canMutate && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingSpec(null);
                    setFormModalOpen(true);
                  }}
                  title="Nova especificação de local"
                  aria-label="Nova especificação de local"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto py-0.5">
              {['ALL', 'Region', 'Site', 'SubSite'].map((cat) => (
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
                    className={`p-3 rounded-[10px] border transition cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold'
                        : 'border-app-border hover:bg-black/[0.02] text-app-text'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-[0.88rem]">{spec.name}</span>
                      {spec._bootstrapProtected && (
                        <span title="Protegido pelo bootstrap" className="inline-flex">
                          <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detalhe da Especificação Selecionada */}
        <div className="min-w-0">
          {selectedSpec ? (
            <LocationSpecDetail
              spec={selectedSpec}
              allSpecs={specs}
              canEdit={canEdit}
              isEditing={isEditing}
              wasActiveAtBaseline={baselineActiveSpecIds?.has(selectedSpec.id) ?? false}
              onEdit={() => {
                setEditingSpec(selectedSpec);
                setFormModalOpen(true);
              }}
              onInactivate={() => {
                setImpactingSpec(selectedSpec);
                setImpactModalOpen(true);
              }}
              onReactivate={() => handleUpdateSpec(selectedSpec.id, { lifecycleStatus: 'Active' })}
              onUpdateCharacteristics={handleUpdateSpec}
            />
          ) : (
            <div className="flex min-h-[580px] flex-col items-center justify-center rounded-[10px] border border-dashed border-app-border p-12 text-center text-app-muted">
              <MapPin className="h-10 w-10 mb-3 opacity-30" />
              <h3 className="text-[1.1rem]">Nenhuma especificação selecionada</h3>
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
