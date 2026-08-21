import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Boxes,
  Building2,
  ChevronLeft,
  Crosshair,
  History as HistoryIcon,
  Info as InfoIcon,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { patchJson, postJson, type GeoSite, type GeoSiteStatus, type GeoSpec } from '../../services/geoApi';
import type { GeoProject } from '../../services/geoProjectApi';
import { fetchGeonetCandidates, fetchGeonetDetail, type GeonetAddressCandidate } from '../../services/geonetAddressApi';
import type { DraftAddress } from '../../utils/googleMaps';
import { useSiteDetail } from '../../hooks/useSiteDetail';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';
import { allowedChildSpecsOf, siteSpecLabel } from '../../utils/geoLabels';
import { siteStreetViewMarker } from '../../utils/streetViewMarker';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { StreetViewHero } from '../../components/StreetViewHero';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { Modal } from './Modal';
import { PanelBarButton } from './PanelBarButton';
import { SiteOverviewTab } from './SiteOverviewTab';
import { SiteSubSitesTab } from './SiteSubSitesTab';
import { SiteResourcesTab } from './SiteResourcesTab';
import { SiteHistoryTab } from './SiteHistoryTab';
import { SiteAddressModal } from './SiteAddressModal';

const ADDRESS_DEBOUNCE_MS = 250;
type SiteTab = 'overview' | 'subsites' | 'resources' | 'history';

export type SitePanelProps = {
  isMobile: boolean;
  mode: 'create' | 'view';
  // Obrigatório em modo 'view'.
  siteId: string | null;
  // Presente quando o painel é aberto de dentro de um Projeto de trabalho (REQ-MOD01-015):
  // em criação, exige candidato GEONET real (RN-008); em consulta, trava o Status enquanto
  // o projeto está em curso (RN-007).
  project?: GeoProject | null;
  projectId?: string | null;
  specs: GeoSpec[];
  sites: GeoSite[];
  pickedAddress: DraftAddress | null;
  pickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  onClose: () => void;
  // Chamado quando o usuário aperta voltar (‹) sem mais nada na pilha de drill-down de
  // sub-locais — some quando o painel não tem "voltar" (ex.: dentro de um Projeto).
  onBack?: () => void;
  onCreated: (result: { site: GeoSite }) => void;
  onChanged: () => void;
  onOpenResource: (resourceId: string) => void;
  // "Remover do projeto" (RN-009): só existe enquanto o projeto está em curso — soft-termina
  // o Site e desfaz o vínculo (DELETE /v1/geo/projects/:id/sites/:siteId), fecha o painel em
  // seguida. Ausente fora do contexto de Projeto ou depois que ele terminou (aí o Site já tem
  // vida própria — RF-010 — e "remover" vira a mesma troca de Status de qualquer outro local).
  onRemoveFromProject?: () => Promise<void>;
};

const geonetDetailInFlight = new Map<string, ReturnType<typeof fetchGeonetDetail>>();

/**
 * Painel unificado de Local (REQ-MOD01-016): substitui `ProjectSitePanel`, `SiteDetailBody` e
 * `GuidedSignupModal` por uma única casca com dois modos — criação (formulário com endereço
 * GEONET/Google) e consulta (foto de Street View + título/tipo editáveis + 4 abas: Visão
 * Geral, Sub-locais, Recursos, Histórico). A navegação para um sub-local (aba Sub-locais)
 * fica inteiramente dentro deste componente, numa pilha local — o painel "assume" o
 * sub-local aberto e o botão voltar (‹) desempilha antes de voltar para quem abriu.
 */
export function SitePanel({
  isMobile,
  mode,
  siteId,
  project,
  projectId,
  specs,
  sites,
  pickedAddress,
  pickingOnMap,
  onTogglePickOnMap,
  onSnapChange,
  minimizeSignal,
  onClose,
  onBack,
  onCreated,
  onChanged,
  onOpenResource,
  onRemoveFromProject,
}: SitePanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const [stack, setStack] = useState<string[]>(mode === 'view' && siteId ? [siteId] : []);
  const currentSiteId = stack.length > 0 ? stack[stack.length - 1] : null;
  const detail = useSiteDetail(currentSiteId ?? null);
  const [tab, setTab] = useState<SiteTab>('overview');
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [confirmingRemoveFromProject, setConfirmingRemoveFromProject] = useState(false);
  const [removingFromProject, setRemovingFromProject] = useState(false);

  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const currentSpec = detail.site ? specById.get(detail.site.siteSpecificationId) : undefined;

  // Combo de tipo do cabeçalho (ViewHeader) e do formulário de criação de Site raiz
  // (CreateBody). Um sub-local (categoria SubSite) não escolhe livremente entre CO/POP/
  // Cabinet/Ponto de Instalação — só entre os tipos que a spec do PAI aceita como filho
  // (mesma regra de SiteSubSitesTab.allowedChildSpecsOf); os demais casos (criação de Site
  // raiz, ou visualização de um Site que não é sub-local) seguem a lista fixa de tipos
  // category:'Site'. `sites` já é o catálogo "container" (specs com filhos permitidos —
  // ver GeoPage.loadGeo), então o pai de qualquer sub-local sempre está nele.
  const parentSite =
    currentSpec?.category === 'SubSite' && detail.site?.parentSite?.id
      ? sites.find((candidate) => candidate.id === detail.site?.parentSite?.id)
      : undefined;
  const siteSpecs =
    currentSpec?.category === 'SubSite'
      ? (() => {
          const parentSpec = parentSite ? specById.get(parentSite.siteSpecificationId) : undefined;
          const options = allowedChildSpecsOf(parentSpec, specs);
          return options.some((spec) => spec.id === currentSpec.id)
            ? options
            : [...options, currentSpec];
        })()
      : specs.filter(
          (spec) =>
            spec.category === 'Site' &&
            (spec.lifecycleStatus === 'Active' || spec.id === detail.site?.siteSpecificationId),
        );

  const handleBack = () => {
    if (stack.length > 1) {
      setStack((current) => current.slice(0, -1));
      setTab('overview');
      return;
    }
    (onBack ?? onClose)();
  };

  const handleOpenSubSite = (subSiteId: string) => {
    setStack((current) => [...current, subSiteId]);
    setTab('overview');
  };

  const handleRemoveFromProject = async () => {
    if (!onRemoveFromProject) return;
    setRemovingFromProject(true);
    try {
      await onRemoveFromProject();
      setConfirmingRemoveFromProject(false);
    } finally {
      setRemovingFromProject(false);
    }
  };

  const patchCurrentSite = async (patch: Partial<{
    name: string;
    siteSpecificationId: string;
    status: GeoSiteStatus;
    parentSiteId: string | null;
    note: string | null;
  }>) => {
    if (!currentSiteId) return;
    await patchJson(`/v1/geo/sites/${currentSiteId}`, patch);
    await detail.reload();
    onChanged();
  };

  const isCreating = mode === 'create' || !currentSiteId;

  const point = detail.location?.geometry.type === 'Point' ? detail.location.geometry.coordinates : null;
  const heroMarker =
    detail.site && point
      ? siteStreetViewMarker(
          { name: detail.site.name, status: detail.site.status },
          specById.get(detail.site.siteSpecificationId),
          point,
        )
      : null;

  const header = isCreating ? (
    <CreateHeader />
  ) : detail.site ? (
    <ViewHeader
      site={detail.site}
      siteSpecs={siteSpecs}
      onPatch={patchCurrentSite}
      onBack={handleBack}
      onClose={onClose}
    />
  ) : null;

  const body = isCreating ? (
    <CreateBody
      specs={siteSpecs}
      project={project ?? null}
      projectId={projectId ?? null}
      // Sub-locais não passam por este formulário (ver SiteSubSitesTab) — só criação de
      // Site raiz, com ou sem Projeto de trabalho.
      pickedAddress={pickedAddress}
      pickingOnMap={pickingOnMap}
      onTogglePickOnMap={onTogglePickOnMap}
      onCreated={(result) => {
        setStack([result.site.id]);
        onCreated(result);
      }}
    />
  ) : detail.loading && !detail.site ? (
    <div className="px-2 py-6 text-center text-[0.86rem] text-app-muted">Carregando local…</div>
  ) : detail.site ? (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1 border-b border-app-border pb-3">
        <PanelBarButton icon={InfoIcon} label="Visão Geral" active={tab === 'overview'} onClick={() => setTab('overview')} />
        <PanelBarButton icon={Building2} label="Sub-locais" active={tab === 'subsites'} onClick={() => setTab('subsites')} />
        <PanelBarButton icon={Boxes} label="Recursos" active={tab === 'resources'} onClick={() => setTab('resources')} />
        <PanelBarButton icon={HistoryIcon} label="Histórico" active={tab === 'history'} onClick={() => setTab('history')} />
      </div>

      {tab === 'overview' ? (
        <SiteOverviewTab
          site={detail.site}
          address={detail.address}
          location={detail.location}
          origin={detail.origin}
          sites={sites}
          specById={specById}
          lockedByProjectName={
            project && project.status !== 'terminated' && detail.origin?.kind === 'project'
              ? project.name
              : undefined
          }
          onPatchSite={patchCurrentSite}
          onEditAddress={() => setAddressModalOpen(true)}
        />
      ) : null}

      {tab === 'subsites' ? (
        <SiteSubSitesTab
          siteId={detail.site.id}
          siteSpecificationId={detail.site.siteSpecificationId}
          specs={specs}
          specById={specById}
          onOpenSubSite={handleOpenSubSite}
          onChanged={onChanged}
        />
      ) : null}

      {tab === 'resources' ? (
        <SiteResourcesTab siteId={detail.site.id} onOpenResource={onOpenResource} />
      ) : null}

      {tab === 'history' ? <SiteHistoryTab siteId={detail.site.id} /> : null}

      {onRemoveFromProject && stack.length === 1 ? (
        <div className="border-t border-app-border pt-4">
          <button
            type="button"
            onClick={() => setConfirmingRemoveFromProject(true)}
            className="text-[0.8rem] font-semibold text-status-red transition hover:brightness-90"
          >
            Remover do projeto
          </button>
        </div>
      ) : null}

      {addressModalOpen ? (
        <SiteAddressModal
          siteId={detail.site.id}
          currentAddressId={detail.site.address?.id}
          currentLocationId={detail.site.place?.id}
          onClose={() => setAddressModalOpen(false)}
          onSaved={() => {
            void detail.reload();
            onChanged();
          }}
        />
      ) : null}

      {confirmingRemoveFromProject ? (
        <Modal
          onClose={() => setConfirmingRemoveFromProject(false)}
          title="Excluir local"
          eyebrow="Projetos"
        >
          <div className="grid gap-4">
            <p className="text-[0.9rem] leading-snug text-app-text">
              Excluir <strong>{detail.site.name}</strong> deste projeto? O local será encerrado.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingRemoveFromProject(false)}
                className="geo-btn secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleRemoveFromProject()}
                disabled={removingFromProject}
                className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingFromProject ? 'Removendo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  ) : null;

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {!isCreating ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`}
    >
      <OverlayScrollArea className="overflow-x-hidden" hostClassName="min-h-0">
        {!isCreating ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="px-3 py-3">{body}</div>
      </OverlayScrollArea>
    </div>
  );
}

function CreateHeader() {
  return (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted">
          Novo local
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text">
          Cadastro de local
        </h3>
      </div>
    </div>
  );
}

function ViewHeader({
  site,
  siteSpecs,
  onPatch,
  onBack,
  onClose,
}: {
  site: GeoSite;
  siteSpecs: GeoSpec[];
  onPatch: (patch: { name?: string; siteSpecificationId?: string }) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(site.name);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameDraft(site.name);
  }, [site.id, site.name]);

  const commitTitle = () => {
    const next = nameDraft.trim() || site.name;
    setNameDraft(next);
    if (next !== site.name) void onPatch({ name: next });
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInputRef.current?.blur();
    } else if (event.key === 'Escape') {
      setNameDraft(site.name);
      titleInputRef.current?.blur();
    }
  };

  return (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Voltar"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <select
          value={site.siteSpecificationId}
          onChange={(event) => void onPatch({ siteSpecificationId: event.target.value })}
          aria-label="Tipo de local"
          className="-mx-1 mb-1 rounded-[6px] border border-transparent bg-transparent px-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted outline-none transition hover:border-app-border focus:border-app-accent-border"
        >
          {siteSpecs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {siteSpecLabel(spec)}
            </option>
          ))}
        </select>
        <input
          ref={titleInputRef}
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
          aria-label="Nome do local"
          className="-mx-1 w-full rounded-[8px] border border-transparent bg-transparent px-1 py-1 font-display text-[1.02rem] font-semibold leading-tight text-app-text outline-none transition hover:border-app-border focus:border-app-accent-border focus:bg-white"
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Fechar local"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

// Formulário de criação de Site raiz — com ou sem Projeto de trabalho (REQ-MOD01-015): a
// diferença é só qual rota recebe o POST e se o candidato GEONET é obrigatório (RN-008).
// Sub-local usa o formulário mínimo próprio de SiteSubSitesTab, não este.
function CreateBody({
  specs,
  project,
  projectId,
  pickedAddress,
  pickingOnMap,
  onTogglePickOnMap,
  onCreated,
}: {
  specs: GeoSpec[];
  project: GeoProject | null;
  projectId: string | null;
  pickedAddress: DraftAddress | null;
  pickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  onCreated: (result: { site: GeoSite }) => void;
}) {
  const defaultSiteSpecId =
    specs.find((spec) => spec.code === 'CUSTOMER_SITE')?.id ?? specs[0]?.id ?? '';
  const [nameDraft, setNameDraft] = useState('');
  const [siteSpecificationId, setSiteSpecificationId] = useState(defaultSiteSpecId);
  const [noteDraft, setNoteDraft] = useState('');
  const noteRef = useAutoResizeTextarea(noteDraft, 160);

  const [addressQuery, setAddressQuery] = useState('');
  const [predictions, setPredictions] = useState<GeonetAddressCandidate[]>([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [geonetAddressId, setGeonetAddressId] = useState<string | null>(null);
  const [geonetDetail, setGeonetDetail] = useState<Awaited<ReturnType<typeof fetchGeonetDetail>>['address']>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    if (!pickedAddress) return;
    setGeonetAddressId(null);
    setGeonetDetail(null);
    setAddressQuery(pickedAddress.sourceQuery?.trim() || pickedAddress.label);
    setPredictionsOpen(true);
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
      void fetchGeonetCandidates(term).then((result) => {
        if (requestTokenRef.current !== token) return;
        setPredictions(result.status === 'ready' ? result.candidates : []);
      });
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [addressQuery]);

  const selectPrediction = async (candidate: GeonetAddressCandidate) => {
    if (!candidate.addressId) return;
    setPredictionsOpen(false);
    setAddressQuery(candidate.formattedAddress);
    setResolving(true);
    let pending = geonetDetailInFlight.get(candidate.addressId);
    if (!pending) {
      pending = fetchGeonetDetail(candidate.addressId);
      geonetDetailInFlight.set(candidate.addressId, pending);
    }
    const result = await pending.finally(() => geonetDetailInFlight.delete(candidate.addressId!));
    setResolving(false);
    if (result.status === 'ready' && result.address) {
      setGeonetAddressId(candidate.addressId);
      setGeonetDetail(result.address);
    }
  };

  const canSave =
    nameDraft.trim().length > 0 && Boolean(siteSpecificationId) && Boolean(geonetAddressId) &&
    Boolean(geonetDetail?.coordinates);

  const handleCreate = async () => {
    if (!canSave || saving || !geonetAddressId || !geonetDetail?.coordinates) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        location: {
          geometryType: 'Point' as const,
          geometry: { type: 'Point' as const, coordinates: geonetDetail.coordinates },
          spatialRef: 'EPSG:4326',
          sourceSystem: 'GEONET',
          sourceRef: geonetAddressId,
          ...(geonetDetail.geolocationMethod ? { accuracy: geonetDetail.geolocationMethod } : {}),
        },
        address: {
          street: geonetDetail.street ?? geonetDetail.formattedAddress,
          streetNr: geonetDetail.streetNr,
          city: geonetDetail.city,
          stateOrProvince: geonetDetail.state,
          postcode: geonetDetail.postcode,
          country: 'BR',
          sourceSystem: 'GEONET',
          sourceRef: geonetAddressId,
        },
        site: {
          name: nameDraft.trim(),
          siteSpecificationId,
          ...(noteDraft.trim() ? { note: noteDraft.trim() } : {}),
        },
        ...(projectId ? { geonetAddressId, note: noteDraft.trim() || undefined } : {}),
      };
      const result = projectId
        ? await postJson<{ site: GeoSite }>(`/v1/geo/projects/${projectId}/sites`, payload)
        : await postJson<{ site: GeoSite }>('/v1/geo/workspace/site-at-address', payload);
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o local.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      {project ? (
        <p className="rounded-[12px] border border-app-border bg-app-accent-soft/60 px-3 py-2 text-[0.8rem] leading-snug text-app-text">
          Local do projeto <strong>{project.name}</strong> — nasce com o status do projeto.
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Endereço (GEONET)
        </label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[12px] border border-app-border bg-white px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
            <input
              value={addressQuery}
              onChange={(event) => {
                setAddressQuery(event.target.value);
                setGeonetAddressId(null);
                setGeonetDetail(null);
                setPredictionsOpen(true);
              }}
              onFocus={() => setPredictionsOpen(true)}
              placeholder="Buscar endereço no Geonet…"
              className="h-10 w-full bg-transparent text-[0.86rem] text-app-text outline-none placeholder:text-app-muted"
            />
            {resolving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-muted" /> : null}
          </div>
          {predictionsOpen && predictions.length > 0 ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPredictionsOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
                {predictions.map((candidate) => (
                  <button
                    key={candidate.addressId ?? candidate.formattedAddress}
                    type="button"
                    disabled={!candidate.addressId}
                    onClick={() => void selectPrediction(candidate)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate">{candidate.formattedAddress}</span>
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
        {geonetDetail ? (
          <p className="text-[0.76rem] text-app-muted">
            Selecionado: <span className="font-medium text-app-text">{geonetDetail.formattedAddress}</span>
          </p>
        ) : (
          <p className="text-[0.76rem] text-app-muted">
            Só é possível salvar depois de escolher um endereço com ID do Geonet.
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Nome do local
        </label>
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
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
          {specs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {siteSpecLabel(spec)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Observação
        </label>
        <textarea
          ref={noteRef}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="Adicione uma observação para este local…"
          rows={1}
          className="w-full resize-none rounded-[12px] border border-app-border bg-white px-3 py-2 text-[0.86rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted focus:border-app-accent-border"
        />
      </div>

      {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}

      <div className="flex items-center justify-end border-t border-app-border pt-4">
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!canSave || saving}
          className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Criar local'}
        </button>
      </div>
    </div>
  );
}
