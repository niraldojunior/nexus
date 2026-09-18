import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MapPin, Plus, Search, Shield } from 'lucide-react';
import { listGeoSiteSpecifications, type GeoSpecCategory } from '../../../services/geoApi';
import {
  LOCATION_CATEGORY_LABELS,
  locationCategoryIcon,
} from './locationCategoryPresentation';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import { Button } from '../../../components/ui';
import { StudioCollectionHeader } from '../../../components/studio/StudioCollectionHeader';
import { LocationSpecImpactModal } from './LocationSpecImpactModal';
import { LocationSpecDetail } from './LocationSpecDetail';
import {
  buildLocationModelSnapshot,
  createLocationDraftSpec,
  draftSpecsFromGeoSpecs,
  draftSpecsFromSnapshot,
  type LocationModelDraftSpec,
} from './locationModelDraft';
import { useVisualIdentityPreviewUrl } from '../../../hooks/useVisualIdentityPreviewUrl';

export function LocationSpecItemIcon({ spec }: { spec: LocationModelDraftSpec }) {
  const visualIdentity = spec.visualIdentity ?? null;
  // Na modelagem, a identidade do tipo é um glifo — sem o marcador contextual do mapa.
  const previewUrl = useVisualIdentityPreviewUrl(visualIdentity, 20, {
    shape: 'none',
    color: '#0284c7',
  });
  const CategoryIcon = locationCategoryIcon(spec.category);

  if (previewUrl) {
    return <img src={previewUrl} alt="" className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  return <CategoryIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />;
}

export type LocationModelStudioProps = {
  canEdit: boolean;
  canAdmin: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

export function LocationModelStudio({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: LocationModelStudioProps) {
  const [specs, setSpecs] = useState<LocationModelDraftSpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<GeoSpecCategory | 'ALL'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [baselineActiveSpecIds, setBaselineActiveSpecIds] = useState<Set<string> | null>(null);
  const [impactingSpec, setImpactingSpec] = useState<LocationModelDraftSpec | null>(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const checksumRef = useRef<string | undefined>(undefined);
  const persistedSnapshotRef = useRef<string | undefined>(undefined);
  const wasEditingRef = useRef(isEditing);

  const canMutate = canEdit && isEditing;

  const loadSpecs = useCallback(async () => {
    setLoading(true);
    try {
      const [canonicalSpecs, status] = await Promise.all([
        listGeoSiteSpecifications(),
        getStudioStatus('location-model'),
      ]);
      const restored = status.draftVersion
        ? draftSpecsFromSnapshot(status.draftVersion.snapshot, canonicalSpecs)
        : null;
      const next = restored ?? draftSpecsFromGeoSpecs(canonicalSpecs);
      checksumRef.current = status.draftVersion?.checksum;
      persistedSnapshotRef.current = JSON.stringify(buildLocationModelSnapshot(next));
      setSpecs(next);
      setSelectedSpecId((current) =>
        current && next.some((spec) => spec.localId === current) ? current : next[0]?.localId ?? null,
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar especificações de locais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSpecs();
  }, [loadSpecs]);

  useEffect(() => {
    if (!showSearch) setFilterText('');
  }, [showSearch]);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      setBaselineActiveSpecIds(null);
      void loadSpecs();
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, loadSpecs]);

  const visibleSpecs = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    return specs
      .filter((spec) => {
        const visibleByLifecycle =
          spec.lifecycleStatus === 'Active' || (isEditing && (baselineActiveSpecIds?.has(spec.localId) ?? false));
        const visibleByCategory = categoryFilter === 'ALL' || spec.category === categoryFilter;
        const visibleBySearch =
          !term ||
          spec.name.toLowerCase().includes(term) ||
          (spec.description ?? '').toLowerCase().includes(term);
        return visibleByLifecycle && visibleByCategory && visibleBySearch;
      });
  }, [baselineActiveSpecIds, categoryFilter, filterText, isEditing, specs]);

  useEffect(() => {
    if (selectedSpecId && !visibleSpecs.some((spec) => spec.localId === selectedSpecId)) {
      setSelectedSpecId(visibleSpecs[0]?.localId ?? null);
    }
  }, [selectedSpecId, visibleSpecs]);

  const selectedSpec = specs.find((spec) => spec.localId === selectedSpecId) ?? null;
  const buildSnapshot = useCallback(async () => buildLocationModelSnapshot(specs), [specs]);

  const captureDraft = useCallback(async () => {
    const snapshot = await buildSnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);
    if (persistedSnapshotRef.current === serializedSnapshot) return;

    const checksum = checksumRef.current ?? (await getStudioStatus('location-model')).draftVersion?.checksum;
    const saved = await saveStudioDraft('location-model', snapshot, checksum);
    checksumRef.current = saved.checksum;
    persistedSnapshotRef.current = serializedSnapshot;
  }, [buildSnapshot]);

  const captureInitialSnapshot = useCallback(async () => {
    setBaselineActiveSpecIds(new Set(specs.filter((spec) => spec.lifecycleStatus === 'Active').map((spec) => spec.localId)));
    const snapshot = await buildSnapshot();
    persistedSnapshotRef.current = JSON.stringify(snapshot);
    return snapshot;
  }, [buildSnapshot, specs]);

  useEffect(() => {
    onRegisterCaptureDraft?.(captureDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [captureDraft, onRegisterCaptureDraft]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(captureInitialSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [captureInitialSnapshot, onRegisterCaptureInitialSnapshot]);

  const patchSpec = (localId: string, patch: Partial<LocationModelDraftSpec>) =>
    setSpecs((current) => current.map((spec) => (spec.localId === localId ? { ...spec, ...patch } : spec)));

  const createSpec = () => {
    const spec = createLocationDraftSpec();
    setSpecs((current) => [spec, ...current]);
    setSelectedSpecId(spec.localId);
  };

  const removeNewSpec = (localId: string) => {
    setSpecs((current) => current
      .filter((spec) => spec.localId !== localId)
      .map((spec) => ({
        ...spec,
        allowedParentLocalIds: spec.allowedParentLocalIds.filter((id) => id !== localId),
        allowedChildLocalIds: spec.allowedChildLocalIds.filter((id) => id !== localId),
      })));
    setSelectedSpecId((current) => current === localId ? null : current);
  };

  const confirmInactivate = async () => {
    if (!impactingSpec) return;
    patchSpec(impactingSpec.localId, { lifecycleStatus: 'Retired' });
  };

  const openImpact = async (spec: LocationModelDraftSpec) => {
    if (!spec.persistedId) return;
    setImpactingSpec(spec);
    setImpactModalOpen(true);
  };

  if (loading && specs.length === 0) {
    return <p className="text-[0.85rem] text-app-muted">Carregando tipos de locais…</p>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="flex items-center gap-2 rounded-[10px] bg-status-red-soft p-3 text-[0.84rem] text-status-red"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="vt-card flex min-h-[580px] flex-col p-4">
          <StudioCollectionHeader
            title="Tipos de Locais"
            showSearch={showSearch}
            onToggleSearch={() => setShowSearch((current) => !current)}
            searchLabel="Buscar locais"
          >
            {canMutate && <Button variant="primary" size="sm" onClick={createSpec} title="Incluir tipo de local" aria-label="Incluir tipo de local"><Plus className="h-4 w-4" /></Button>}
          </StudioCollectionHeader>
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtrar tipos de locais">
            {([
              ['ALL', 'Todos'],
              ...Object.entries(LOCATION_CATEGORY_LABELS),
            ] as Array<[GeoSpecCategory | 'ALL', string]>).map(([category, label]) => (
              <button
                key={category}
                type="button"
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(category)}
                className={`rounded-[8px] border px-2 py-1 text-[0.76rem] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${categoryFilter === category ? 'border-app-accent bg-app-accent-soft text-app-text font-semibold' : 'border-transparent font-medium text-app-muted hover:bg-black/[0.04] hover:text-app-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {showSearch && <div className="relative mb-3"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" /><input autoFocus value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="Buscar tipos de locais por nome..." aria-label="Buscar tipos de locais" className="w-full rounded-[14px] border border-app-border bg-white py-1.5 pl-8 pr-3 text-[0.84rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent" /></div>}
          <div className="max-h-[640px] flex-1 space-y-0.5 overflow-y-auto p-1 pr-2">
            {visibleSpecs.length === 0 ? <div className="p-8 text-center text-[0.84rem] text-app-muted">Nenhum tipo de local encontrado.</div> : visibleSpecs.map((spec) => {
              const selected = spec.localId === selectedSpecId;
              return <button key={spec.localId} type="button" aria-pressed={selected} onClick={() => setSelectedSpecId(spec.localId)} className={`flex w-full items-center justify-between gap-1 rounded-[10px] border px-2 py-1.5 text-left text-[0.85rem] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${selected ? 'border-app-accent-border bg-app-accent-soft text-app-text font-semibold ring-1 ring-app-accent-border' : 'border-transparent text-app-text hover:bg-black/[0.04]'}`}>
                <span className="flex min-w-0 items-center gap-1.5"><LocationSpecItemIcon spec={spec} /><span className="truncate" title={spec.name}>{spec.name}</span></span>
                {spec.bootstrapProtected && <span title="Protegido pelo bootstrap"><Shield className="h-3.5 w-3.5 shrink-0 text-amber-600" /></span>}
              </button>;
            })}
          </div>
        </div>
        <div className="min-w-0">
          {selectedSpec ? <LocationSpecDetail
            spec={selectedSpec}
            allSpecs={specs}
            canEdit={canEdit}
            isEditing={isEditing}
            wasActiveAtBaseline={baselineActiveSpecIds?.has(selectedSpec.localId) ?? false}
            onPatch={(patch) => patchSpec(selectedSpec.localId, patch)}
            onRemoveNew={() => removeNewSpec(selectedSpec.localId)}
            onInactivate={() => void openImpact(selectedSpec)}
            onReactivate={() => patchSpec(selectedSpec.localId, { lifecycleStatus: 'Active' })}
          /> : <div className="flex min-h-[580px] flex-col items-center justify-center rounded-[10px] border border-dashed border-app-border p-12 text-center text-app-muted"><MapPin className="mb-3 h-10 w-10 opacity-30" /><h3 className="text-[1.1rem]">Nenhum tipo de local selecionado</h3><p className="mt-1 max-w-sm text-[0.85rem]">Selecione um tipo de local à esquerda para visualizar ou editar seus dados.</p></div>}
        </div>
      </div>
      {impactingSpec?.persistedId && <LocationSpecImpactModal
        isOpen={impactModalOpen}
        onClose={() => { setImpactModalOpen(false); setImpactingSpec(null); }}
        onConfirmRetire={confirmInactivate}
        spec={{ id: impactingSpec.persistedId, name: impactingSpec.name }}
      />}
    </div>
  );
}
