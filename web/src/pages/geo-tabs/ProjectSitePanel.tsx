import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Crosshair, Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { patchJson, type GeoSpec, type GeoStatus } from '../../services/geoApi';
import type { GeoTreeNode } from '../../services/geoTreeApi';
import {
  createProjectSite,
  removeProjectSite,
  type CreateProjectSiteInput,
} from '../../services/geoProjectApi';
import {
  fetchAddressPredictions,
  resolveAddressByPlaceId,
  type AddressPrediction,
  type DraftAddress,
} from '../../utils/googleMaps';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS, DOCK_SEARCH_CLEARANCE_PT_CLASS } from './dock';

const ADDRESS_DEBOUNCE_MS = 250;

const statusOptions: Array<{ value: GeoStatus; label: string }> = [
  { value: 'planned', label: 'Planejado' },
  { value: 'active', label: 'Ativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'terminated', label: 'Terminado' },
];

export type ProjectSitePanelProps = {
  isMobile: boolean;
  projectId: string;
  // `null` = criação; um nó existente = edição (nome/tipo/status apenas — reposicionar um
  // local já criado é REQ-MOD01-013, fora desta entrega).
  site: GeoTreeNode | null;
  specs: GeoSpec[];
  // Endereço resolvido por um clique no mapa enquanto "Escolher no mapa" está ativo (ver
  // GeoPage) — chega de fora porque quem escuta o clique do mapa é o GeoPage, não este painel.
  pickedAddress: DraftAddress | null;
  pickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  onBack: () => void;
  onSaved: () => void;
};

/**
 * Cria ou edita um local exclusivo de um Projeto de trabalho (REQ-MOD01-015). Em criação,
 * pede endereço (autocomplete do Google ou um ponto escolhido no mapa), nome, tipo e status;
 * em edição, só nome/tipo/status — o local já nasce fora da Hierarquia (ver
 * GeoTreeService.PROJECT_SITE_EXCLUSION_SQL) e continua assim.
 */
export function ProjectSitePanel({
  isMobile,
  projectId,
  site,
  specs,
  pickedAddress,
  pickingOnMap,
  onTogglePickOnMap,
  onSnapChange,
  minimizeSignal,
  onBack,
  onSaved,
}: ProjectSitePanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const mode: 'create' | 'edit' = site ? 'edit' : 'create';
  const siteSpecs = specs.filter((spec) => spec.category === 'Site');

  const [name, setName] = useState(site?.label ?? '');
  const [status, setStatus] = useState<GeoStatus>((site?.status as GeoStatus) ?? 'planned');
  const [siteSpecificationId, setSiteSpecificationId] = useState(siteSpecs[0]?.id ?? '');
  const [address, setAddress] = useState<DraftAddress | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  // O ponto escolhido no mapa (ver onTogglePickOnMap/GeoPage) sempre substitui a busca por
  // texto — os dois preenchem o mesmo `address`, nunca ao mesmo tempo.
  useEffect(() => {
    if (!pickedAddress) return;
    setAddress(pickedAddress);
    setAddressQuery(pickedAddress.sourceQuery?.trim() || pickedAddress.label);
    setPredictionsOpen(false);
  }, [pickedAddress]);

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    const term = addressQuery.trim();
    if (!term) {
      setPredictions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      void fetchAddressPredictions(term).then((result) => {
        if (requestTokenRef.current !== token) return;
        setPredictions(result);
      });
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [addressQuery]);

  const selectPrediction = async (prediction: AddressPrediction) => {
    setPredictionsOpen(false);
    setAddressQuery(prediction.description);
    setResolving(true);
    const outcome = await resolveAddressByPlaceId(prediction.placeId);
    setResolving(false);
    if (outcome.ok) setAddress(outcome.address);
  };

  const canSave =
    mode === 'edit'
      ? name.trim().length > 0 && Boolean(siteSpecificationId)
      : name.trim().length > 0 && Boolean(siteSpecificationId) && address !== null;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create' && address) {
        const input: CreateProjectSiteInput = {
          coordinates: address.coordinates,
          street: address.street,
          streetNr: address.streetNr,
          city: address.city,
          stateOrProvince: address.stateOrProvince,
          postcode: address.postcode,
          country: address.country,
          name: name.trim(),
          status,
          siteSpecificationId,
        };
        await createProjectSite(projectId, input);
      } else if (mode === 'edit' && site?.refId) {
        await patchJson(`/v1/geo/sites/${site.refId}`, {
          name: name.trim(),
          status,
          siteSpecificationId,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o local.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!site?.refId) return;
    if (!window.confirm(`Remover "${site.label}" deste projeto?`)) return;
    setRemoving(true);
    try {
      await removeProjectSite(projectId, site.refId);
      onSaved();
    } finally {
      setRemoving(false);
    }
  };

  const body = (
    <div className="grid gap-4">
      {mode === 'create' ? (
        <div className="grid gap-1.5">
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
            Endereço
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-[12px] border border-app-border bg-white px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
              <input
                value={addressQuery}
                onChange={(event) => {
                  setAddressQuery(event.target.value);
                  setAddress(null);
                  setPredictionsOpen(true);
                }}
                onFocus={() => setPredictionsOpen(true)}
                placeholder="Buscar endereço…"
                className="h-10 w-full bg-transparent text-[0.86rem] text-app-text outline-none placeholder:text-app-muted"
              />
              {resolving ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-muted" />
              ) : null}
            </div>
            {predictionsOpen && predictions.length > 0 ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPredictionsOpen(false)} />
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
                  {predictions.map((prediction) => (
                    <button
                      key={prediction.placeId}
                      type="button"
                      onClick={() => void selectPrediction(prediction)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft"
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-app-muted" />
                      <span className="min-w-0 flex-1 truncate">{prediction.description}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onTogglePickOnMap}
            className={`flex items-center justify-center gap-2 rounded-[12px] border px-3 py-2 text-[0.82rem] font-semibold transition ${
              pickingOnMap
                ? 'border-app-accent-border bg-app-accent-soft text-app-text'
                : 'border-app-border bg-white text-app-text hover:border-app-accent-border hover:bg-app-accent-soft'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {pickingOnMap ? 'Clique no mapa para posicionar…' : 'Escolher no mapa'}
          </button>
          {address ? (
            <p className="text-[0.76rem] text-app-muted">
              Selecionado: <span className="font-medium text-app-text">{address.label}</span>
            </p>
          ) : null}
        </div>
      ) : (
        site?.detail?.address && (
          <p className="text-[0.78rem] text-app-muted">
            Endereço: <span className="font-medium text-app-text">{site.detail.address}</span>
          </p>
        )
      )}

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Nome do local
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ex: CDO Rua Miguel de Frias, 380"
          className="geo-input"
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Tipo de local
        </label>
        <select
          value={siteSpecificationId}
          onChange={(event) => setSiteSpecificationId(event.target.value)}
          className="geo-input"
        >
          <option value="">Selecione...</option>
          {siteSpecs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Status
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as GeoStatus)}
          className="geo-input"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}

      <div className="flex items-center justify-between gap-2 border-t border-app-border pt-4">
        {mode === 'edit' ? (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-status-red transition hover:brightness-90 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {removing ? 'Removendo…' : 'Remover do projeto'}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || saving}
          className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Salvando…' : mode === 'create' ? 'Criar local' : 'Salvar'}
        </button>
      </div>
    </div>
  );

  const header = (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar para o projeto"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted">
          {mode === 'create' ? 'Novo local do projeto' : 'Local do projeto'}
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text">
          {mode === 'create' ? name.trim() || 'Sem nome' : site?.label}
        </h3>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet onClose={onBack} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {header}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock ${DOCK_SEARCH_CLEARANCE_PT_CLASS}`}
    >
      {header}
      <OverlayScrollArea className="px-3 py-3" hostClassName="min-h-0">
        {body}
      </OverlayScrollArea>
    </div>
  );
}
