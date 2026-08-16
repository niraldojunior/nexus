import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Crosshair,
  Fingerprint,
  Info as InfoIcon,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type { GeoSiteStatus, GeoSpec } from '../../services/geoApi';
import { patchJson } from '../../services/geoApi';
import { SITE_STATUS_OPTIONS, siteSpecLabel } from '../../utils/geoLabels';
import {
  createProjectSite,
  removeProjectSite,
  updateProjectSite,
  type CreateProjectSiteInput,
  type CreatedProjectSite,
  type GeoProject,
  type ProjectSite,
  type UpdateProjectSiteInput,
} from '../../services/geoProjectApi';
import { treeNodePoint } from '../../services/geoTreeApi';
import {
  fetchGeonetCandidates,
  fetchGeonetDetail,
  type GeonetAddressCandidate,
  type GeonetAddressDetail,
} from '../../services/geonetAddressApi';
import { geocodeAddress, type DraftAddress } from '../../utils/googleMaps';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { StreetViewHero } from '../../components/StreetViewHero';
import { siteStreetViewMarker } from '../../utils/streetViewMarker';
import { AddressSourceCard, GeonetPrecisionBadge } from './AddressSourceCard';
import { GoogleMapsIcon, VtalIcon } from './AddressSourceIcons';
import { IconInfoRow } from './IconInfoRow';
import { Modal } from './Modal';
import { PanelBarButton } from './PanelBarButton';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';

const ADDRESS_DEBOUNCE_MS = 250;

export type ProjectSitePanelProps = {
  isMobile: boolean;
  projectId: string;
  project: GeoProject;
  // `null` = criação; um local existente = consulta/edição (REQ-MOD01-015 §20).
  site: ProjectSite | null;
  specs: GeoSpec[];
  // Endereço resolvido por um clique no mapa enquanto "Escolher no mapa" está ativo (ver
  // GeoPage) — chega de fora porque quem escuta o clique do mapa é o GeoPage, não este
  // painel. É só o ponto de partida: ainda precisa virar um candidato GEONET escolhido.
  pickedAddress: DraftAddress | null;
  pickingOnMap: boolean;
  onTogglePickOnMap: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  minimizeSignal?: number;
  // Fecha a janela de consulta do local — o painel do projeto permanece aberto ao lado
  // (estilo Salvos → Listas do Google Maps), diferente de "voltar" para uma tela anterior.
  onClose: () => void;
  onCreated: (created: CreatedProjectSite) => void;
  onSiteChanged: () => void;
  onRemoved: () => void;
};

// Dedup de consulta em voo por chave — mesmo motivo do `inFlight` de useGeonetAddress e dos
// hooks de diretório (AGENTS.md §3): o backend de dev atende em série e o StrictMode monta
// duas vezes, então trocar de aba Endereço não pode disparar a mesma consulta em dobro.
const geonetDetailInFlight = new Map<string, ReturnType<typeof fetchGeonetDetail>>();
const googleGeocodeInFlight = new Map<string, ReturnType<typeof geocodeAddress>>();

/**
 * Cria ou consulta um local exclusivo de um Projeto de trabalho (REQ-MOD01-015). Em criação,
 * pede um endereço com ID real do GEONET (por busca ou por um ponto escolhido no mapa,
 * reconsultado no GEONET), nome, tipo e observação — sem status: o local nasce e permanece
 * com o status do projeto (herança, não escolha do formulário). Em consulta, mostra a foto de
 * Street View, título e tipo editáveis no cabeçalho (o tipo só aparece ali, não se repete na
 * aba Visão geral) e duas abas: Visão geral (status — herdado do projeto enquanto ele está em
 * curso, ou próprio + "Projeto de origem" depois que o projeto termina, ver projectTerminated
 * — e observação) e Endereço (GEONET + Google Maps).
 */
export function ProjectSitePanel({
  isMobile,
  projectId,
  project,
  site,
  specs,
  pickedAddress,
  pickingOnMap,
  onTogglePickOnMap,
  onSnapChange,
  minimizeSignal,
  onClose,
  onCreated,
  onSiteChanged,
  onRemoved,
}: ProjectSitePanelProps) {
  const { snapCommand } = useSheetSnapCommand(minimizeSignal);
  const mode: 'create' | 'view' = site ? 'view' : 'create';
  const siteSpecs = specs.filter(
    (spec) =>
      spec.category === 'Site' &&
      (spec.lifecycleStatus === 'Active' || spec.id === site?.siteSpecificationId),
  );

  // Maioria dos locais de projeto é Ponto de Instalação — evita que quem cria esqueça de
  // trocar a combo e salve com o primeiro tipo da lista (era Cabinet/Gabinete, alfabético).
  const defaultSiteSpecId =
    siteSpecs.find((spec) => spec.code === 'INSTALLATION_POINT')?.id ?? siteSpecs[0]?.id ?? '';

  const [nameDraft, setNameDraft] = useState(site?.label ?? '');
  const [siteSpecificationId, setSiteSpecificationId] = useState(
    site?.siteSpecificationId ?? defaultSiteSpecId,
  );
  const [noteDraft, setNoteDraft] = useState(site?.note ?? '');
  const [tab, setTab] = useState<'overview' | 'address'>('overview');
  const noteRef = useAutoResizeTextarea(noteDraft, 160);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // O local só ganha status próprio quando o projeto que o originou termina (ver
  // changeSiteStatus abaixo) — enquanto o projeto está em curso, nenhuma info de status
  // aparece neste painel (nem herdada, nem editável).
  const [nextSiteStatus, setNextSiteStatus] = useState<GeoSiteStatus>(
    (site?.status as GeoSiteStatus) ?? 'Active',
  );
  const [changingSiteStatus, setChangingSiteStatus] = useState(false);

  // `site` chega `null` no primeiro render logo após criar — a lista do projeto ainda não
  // recarregou (ver handleProjectSiteCreated em GeoPage.tsx) — e só é preenchido quando o
  // refetch termina, sem remontar este painel (a `key` já fixou no siteId novo). Sem este
  // efeito, nome/tipo/observação/status ficam presos nos valores em branco/primeira opção do
  // render de criação que passou batendo, mesmo depois do local real chegar via prop.
  useEffect(() => {
    if (!site) return;
    setNameDraft(site.label);
    setSiteSpecificationId(site.siteSpecificationId ?? defaultSiteSpecId);
    setNoteDraft(site.note ?? '');
    setNextSiteStatus((site.status as GeoSiteStatus) ?? 'Active');
  }, [site?.refId]);

  // Busca GEONET (criação) — texto digitado ou herdado do reverse geocode do clique no mapa.
  const [addressQuery, setAddressQuery] = useState('');
  const [predictions, setPredictions] = useState<GeonetAddressCandidate[]>([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [geonetAddressId, setGeonetAddressId] = useState<string | null>(null);
  const [geonetDetail, setGeonetDetail] = useState<GeonetAddressDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  // "Escolher no mapa" (ver onTogglePickOnMap/GeoPage) não salva o ponto do Google direto —
  // o endereço reverso vira o texto de busca, e o usuário confirma um candidato GEONET real
  // a partir dele, como se tivesse digitado a mesma coisa.
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
    const result = await fetchGeonetDetail(candidate.addressId);
    setResolving(false);
    if (result.status === 'ready' && result.address) {
      setGeonetAddressId(candidate.addressId);
      setGeonetDetail(result.address);
    }
  };

  const canSave =
    mode === 'view'
      ? true
      : nameDraft.trim().length > 0 &&
        Boolean(siteSpecificationId) &&
        Boolean(geonetAddressId) &&
        Boolean(geonetDetail?.coordinates);

  const handleCreate = async () => {
    if (!canSave || saving || !geonetAddressId || !geonetDetail?.coordinates) return;
    setSaving(true);
    setError(null);
    try {
      const input: CreateProjectSiteInput = {
        coordinates: geonetDetail.coordinates,
        street: geonetDetail.street ?? geonetDetail.formattedAddress,
        streetNr: geonetDetail.streetNr,
        city: geonetDetail.city,
        stateOrProvince: geonetDetail.state,
        postcode: geonetDetail.postcode,
        country: 'BR',
        name: nameDraft.trim(),
        siteSpecificationId,
        geonetAddressId,
        note: noteDraft.trim() || undefined,
      };
      const created = await createProjectSite(projectId, input);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o local.');
    } finally {
      setSaving(false);
    }
  };

  const patchSite = async (patch: UpdateProjectSiteInput) => {
    if (!site?.refId) return;
    try {
      await updateProjectSite(projectId, site.refId, patch);
      onSiteChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a alteração.');
    }
  };

  const commitTitle = () => {
    if (!site) return;
    const next = nameDraft.trim() || site.label;
    setNameDraft(next);
    if (next !== site.label) void patchSite({ name: next });
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInputRef.current?.blur();
    } else if (event.key === 'Escape' && site) {
      setNameDraft(site.label);
      titleInputRef.current?.blur();
    }
  };

  const commitType = (nextSpecId: string) => {
    setSiteSpecificationId(nextSpecId);
    if (!site || nextSpecId === site.siteSpecificationId) return;
    void patchSite({ siteSpecificationId: nextSpecId });
  };

  const commitNote = () => {
    if (!site) return;
    const next = noteDraft.trim();
    if (next !== (site.note ?? '')) void patchSite({ note: next || null });
  };

  // Fora da rota /projects/:id/sites/:siteId (que nunca aceita status — ver app.ts): uma vez
  // que o projeto terminou, o local edita seu próprio status pela rota geral de Site, como
  // qualquer local avulso (mesmo padrão do SiteDetailBody em GeoPage.tsx).
  const changeSiteStatus = async () => {
    if (!site?.refId) return;
    setChangingSiteStatus(true);
    setError(null);
    try {
      await patchJson(`/v1/geo/sites/${site.refId}`, { status: nextSiteStatus });
      onSiteChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível mudar o status.');
    } finally {
      setChangingSiteStatus(false);
    }
  };

  const handleRemove = async () => {
    if (!site?.refId) return;
    setConfirmingRemove(false);
    setRemoving(true);
    try {
      await removeProjectSite(projectId, site.refId);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  const createBody = (
    <div className="grid gap-4">
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
            {resolving ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-muted" />
            ) : null}
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
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-app-muted" />
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
          {siteSpecs.map((spec) => (
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

  // Enquanto o projeto está em curso, o status do local é só um reflexo do status do
  // projeto (cascata best-effort) — sem controle próprio aqui, ver comentário em
  // changeSiteStatus. Terminado o projeto, o local vira uma entidade com vida própria: ganha
  // o controle de status que ele nunca teve (editável) e um registro do projeto que o
  // originou (só leitura, não editável).
  const projectTerminated = project.status === 'terminated';

  const viewOverviewTab = site ? (
    <div className="grid gap-3">
      {projectTerminated ? (
        <>
          <IconInfoRow icon={InfoIcon} hint="Projeto de origem" value={project.name} />
          <div className="grid min-w-0 gap-2 rounded-[14px] border border-app-border p-3">
            <select
              value={nextSiteStatus}
              onChange={(event) => setNextSiteStatus(event.target.value as GeoSiteStatus)}
              className="geo-input"
            >
              {SITE_STATUS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="geo-btn primary justify-center"
              disabled={changingSiteStatus}
              onClick={() => void changeSiteStatus()}
            >
              {changingSiteStatus ? 'Salvando…' : 'Mudar status'}
            </button>
          </div>
        </>
      ) : null}
      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Observação
        </label>
        <textarea
          ref={noteRef}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
          placeholder="Adicione uma observação para este local…"
          rows={1}
          aria-label="Observação do local"
          className="-mx-1 w-full resize-none rounded-[8px] border border-transparent bg-transparent px-1 py-1 text-[0.84rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted hover:border-app-border focus:border-app-accent-border focus:bg-white"
        />
      </div>
    </div>
  ) : null;

  const viewBody = site ? (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1 border-b border-app-border pb-3">
        <PanelBarButton
          icon={InfoIcon}
          label="Visão geral"
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        <PanelBarButton
          icon={MapIcon}
          label="Endereço"
          active={tab === 'address'}
          onClick={() => setTab('address')}
        />
      </div>
      {tab === 'overview' ? viewOverviewTab : <SiteAddressTab geonetAddressId={site.geonetAddressId} />}
      {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}
      <div className="border-t border-app-border pt-4">
        <button
          type="button"
          onClick={() => setConfirmingRemove(true)}
          disabled={removing}
          className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-status-red transition hover:brightness-90 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {removing ? 'Removendo…' : 'Remover do projeto'}
        </button>
      </div>
    </div>
  ) : null;

  // Mesmo modal de confirmação do ícone de lixeira no painel de Projeto (ProjectDetailPanel) —
  // um único padrão de "excluir local" em vez de dois (este usava window.confirm antes).
  const removeConfirm =
    confirmingRemove && site ? (
      <Modal onClose={() => setConfirmingRemove(false)} title="Excluir local" eyebrow="Projetos">
        <div className="grid gap-4">
          <p className="text-[0.9rem] leading-snug text-app-text">
            Excluir <strong>{site.label}</strong> deste projeto? O local será encerrado.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="geo-btn secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    ) : null;

  const point = site ? treeNodePoint(site) : null;
  const heroMarker =
    site && point
      ? siteStreetViewMarker(
          { name: site.label, status: site.status },
          siteSpecs.find((spec) => spec.id === site.siteSpecificationId),
          point,
        )
      : null;

  const createHeader = (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted">
          Novo local do projeto
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text">
          {nameDraft.trim() || 'Sem nome'}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const viewHeader = (
    <div className="flex items-start gap-2 border-y border-app-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <select
          value={siteSpecificationId}
          onChange={(event) => commitType(event.target.value)}
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

  const header = mode === 'create' ? createHeader : viewHeader;
  const body = mode === 'create' ? createBody : viewBody;

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {mode === 'view' ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
        {removeConfirm}
      </BottomSheet>
    );
  }

  return (
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`}
    >
      <OverlayScrollArea className="overflow-x-hidden" hostClassName="min-h-0">
        {mode === 'view' ? <StreetViewHero marker={heroMarker} /> : null}
        {header}
        <div className="px-3 py-3">{body}</div>
      </OverlayScrollArea>
      {removeConfirm}
    </div>
  );
}

// Aba Endereço do local de projeto: mesma comparação GEONET × Google do painel de Endereço
// (AddressDetailPanel), mas a partir do `geonetAddressId` gravado no local, não de uma busca —
// o Google entra como referência, geocodificando o endereço formatado que o GEONET devolveu.
function SiteAddressTab({ geonetAddressId }: { geonetAddressId: string | null }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [detail, setDetail] = useState<GeonetAddressDetail | null>(null);
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [googleAddress, setGoogleAddress] = useState<DraftAddress | null>(null);

  useEffect(() => {
    if (!geonetAddressId) {
      setStatus('empty');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const pending = geonetDetailInFlight.get(geonetAddressId) ?? fetchGeonetDetail(geonetAddressId);
    geonetDetailInFlight.set(geonetAddressId, pending);
    void pending
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'ready' && result.address) {
          setDetail(result.address);
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      })
      .finally(() => geonetDetailInFlight.delete(geonetAddressId));
    return () => {
      cancelled = true;
    };
  }, [geonetAddressId]);

  const formattedAddress = detail?.formattedAddress;
  useEffect(() => {
    if (!formattedAddress) return;
    let cancelled = false;
    setGoogleStatus('loading');
    const pending = googleGeocodeInFlight.get(formattedAddress) ?? geocodeAddress(formattedAddress);
    googleGeocodeInFlight.set(formattedAddress, pending);
    void pending
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.ok) {
          setGoogleAddress(outcome.address);
          setGoogleStatus('ready');
        } else {
          setGoogleStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) setGoogleStatus('error');
      })
      .finally(() => googleGeocodeInFlight.delete(formattedAddress));
    return () => {
      cancelled = true;
    };
  }, [formattedAddress]);

  return (
    <div className="grid gap-3">
      <AddressSourceCard icon={<VtalIcon />} title="GEONET" tone="bg-app-accent-soft/70">
        {status === 'loading' ? (
          <div className="flex items-center gap-2 py-2 text-[0.82rem] text-app-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Consultando endereço no Geonet...
          </div>
        ) : null}
        {status === 'empty' ? (
          <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
            Sem endereço Geonet vinculado a este local.
          </p>
        ) : null}
        {status === 'error' ? (
          <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
            Não foi possível consultar o Geonet.
          </p>
        ) : null}
        {status === 'ready' && detail ? (
          <>
            <IconInfoRow icon={MapPin} hint="Endereço formatado" value={detail.formattedAddress} />
            <IconInfoRow
              icon={Crosshair}
              hint="Localização"
              value={
                detail.coordinates ? (
                  <span className="font-mono">
                    [{detail.coordinates[0].toFixed(5)}, {detail.coordinates[1].toFixed(5)}]
                  </span>
                ) : (
                  '-'
                )
              }
            />
            <IconInfoRow
              icon={Target}
              hint="Precisão"
              value={<GeonetPrecisionBadge method={detail.geolocationMethod} />}
            />
            <IconInfoRow icon={Fingerprint} hint="Address ID" value={geonetAddressId ?? '-'} mono />
          </>
        ) : null}
      </AddressSourceCard>
      <AddressSourceCard icon={<GoogleMapsIcon />} title="Google Maps" tone="bg-status-green-soft/40">
        {!formattedAddress ? (
          <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
            Sem endereço Geonet para geocodificar no Google Maps.
          </p>
        ) : googleStatus === 'loading' ? (
          <div className="flex items-center gap-2 py-2 text-[0.82rem] text-app-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Consultando Google Maps...
          </div>
        ) : googleStatus === 'error' ? (
          <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
            Não foi possível localizar este endereço no Google Maps.
          </p>
        ) : googleStatus === 'ready' && googleAddress ? (
          <>
            <IconInfoRow icon={MapPin} hint="Endereço formatado" value={googleAddress.label} />
            <IconInfoRow
              icon={Crosshair}
              hint="Localização"
              value={
                <span className="font-mono">
                  [{googleAddress.coordinates[0].toFixed(5)}, {googleAddress.coordinates[1].toFixed(5)}]
                </span>
              }
            />
          </>
        ) : null}
      </AddressSourceCard>
    </div>
  );
}
