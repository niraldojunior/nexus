import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Crosshair,
  Fingerprint,
  Hash,
  Info as InfoIcon,
  Loader2,
  Map as MapIcon,
  MapPin,
  Phone,
  Route,
  Target,
} from 'lucide-react';
import type { DraftAddress } from '../../utils/googleMaps';
import {
  BottomSheet,
  useSheetSnapCommand,
  type BottomSheetSnapState,
} from '../../components/BottomSheet';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { DOCK_WIDTH_CLASS, DOCK_ELEVATION_CLASS } from './dock';
import { StreetViewHero } from '../../components/StreetViewHero';
import { addressStreetViewMarker } from '../../utils/streetViewMarker';
import { CoordinateStreetView } from './CoordinateStreetView';
import { IconInfoRow } from './IconInfoRow';
import { PanelBarButton } from './PanelBarButton';
import { PrecisionBadge } from './PrecisionBadge';
import { ViabilityTab, type DropSimulation } from './ViabilityTab';
import { useGeonetAddress } from '../../hooks/useGeonetAddress';
import { useViaCepAddress } from '../../hooks/useViaCepAddress';
import type { GeonetAddressDetail } from '../../services/geonetAddressApi';
import { cepFromText, formatCep, normalizeCep } from '../../utils/cep';
import {
  formatDivergenceMeters,
  resolveAddressLocation,
  type AddressLocationResolution,
  type AddressPinLocation,
} from './addressLocationResolution';
import { AddressSourceSwitch } from './AddressSourceSwitch';
import { CorreiosIcon, GoogleMapsIcon, VtalIcon } from './AddressSourceIcons';
import { AddressSourceCard, GeonetPrecisionBadge } from './AddressSourceCard';
export {
  selectPinLocation,
  type AddressLocationResolution,
  type AddressPinLocation,
} from './addressLocationResolution';

type AddressTab = 'overview' | 'viability';

// Identidade estável para quando o painel é montado sem quem desenhe a simulação
// (testes e usos fora do mapa) — um literal inline remontaria o efeito do ViabilityTab.
const noop = () => {};

export type AddressDetailPanelProps = {
  isMobile: boolean;
  address: DraftAddress;
  // Fecha o painel: no mobile é o único fechar (arrastar a folha para baixo). No
  // desktop, quem fecha é o X da barra de pesquisa ancorada (ver onClear em GeoPage).
  onClose: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  // Contador que, ao incrementar, encolhe a folha para peek (ver BottomSheet) — usado
  // quando o usuário navega o mapa manualmente com este painel aberto (ver GeoPage).
  minimizeSignal?: number;
  // Simulação do drop entre este endereço e a CDO escolhida na aba Viabilidade. Sobe
  // para o GeoPage porque quem desenha é o mapa, não o painel.
  onDropSimulation?: (simulation: DropSimulation | null) => void;
  geonetEnabled?: boolean;
  onLocationResolved?: (resolution: AddressLocationResolution) => void;
};

/**
 * Painel de consulta de um endereço encontrado na barra de pesquisa (Google Maps),
 * quando o termo pesquisado não corresponde a um Site ou Recurso do inventário.
 * Mesma casca dos painéis de detalhe de Site/Recurso — dock à esquerda no desktop,
 * bottom sheet no mobile —, mas somente leitura: não há cadastro nem edição aqui,
 * só os campos que identificam o endereço em campo e o alfinete no mapa (ver GeoPage).
 */
export function AddressDetailPanel({
  isMobile,
  address,
  onClose,
  onSnapChange,
  minimizeSignal,
  onDropSimulation,
  geonetEnabled = true,
  onLocationResolved,
}: AddressDetailPanelProps) {
  const title =
    address.sourceQuery?.trim() ||
    [address.street, address.streetNr].filter(Boolean).join(', ') ||
    address.label;
  const [tab, setTab] = useState<AddressTab>('overview');
  const { snapCommand, requestSnap } = useSheetSnapCommand(minimizeSignal);
  const geonet = useGeonetAddress(address, geonetEnabled);
  const resolutionKey = `${address.coordinates.join(',')}|${geonet.detail?.coordinates?.join(',') ?? ''}`;
  const [sourceChoice, setSourceChoice] = useState<{
    key: string;
    source: AddressPinLocation['source'];
  } | null>(null);
  const resolution = useMemo(
    () =>
      resolveAddressLocation(
        address,
        geonet.detail,
        sourceChoice?.key === resolutionKey ? sourceChoice.source : null,
      ),
    [address, geonet.detail, resolutionKey, sourceChoice],
  );
  const activeLocation =
    resolution.mode === 'automatic' ? resolution.selected : resolution[resolution.selectedSource];
  const marker = addressStreetViewMarker({
    ...address,
    coordinates: activeLocation.coordinates,
  });

  useEffect(() => {
    // A câmera só pode voar após a comparação terminar: enquanto o detalhe Geonet
    // ainda está em trânsito, a decisão poderia mudar do ponto Google para o Geonet.
    if (geonet.status === 'loading' || geonet.locationPending) return;
    onLocationResolved?.(resolution);
  }, [geonet.locationPending, geonet.status, onLocationResolved, resolution]);

  // Endereço novo é consulta nova: a aba volta para a Visão geral, e a aba de
  // Viabilidade se desmonta — é a desmontagem dela que apaga o drop simulado do mapa
  // (ver ViabilityTab).
  const [lng, lat] = address.coordinates;
  useEffect(() => {
    setTab('overview');
  }, [lng, lat]);

  const chooseSource = useCallback(
    (source: AddressPinLocation['source']) => {
      setSourceChoice({ key: resolutionKey, source });
      setTab('overview');
      (onDropSimulation ?? noop)(null);
    },
    [onDropSimulation, resolutionKey],
  );

  // No mobile a aba Viabilidade dá lugar ao mapa: a foto do Street View some (ver o
  // corpo) e a folha vai para `mid`, para o traçado do drop caber na área descoberta. O
  // efeito segue `tab`, então dispara ao entrar na aba (inclusive na volta a ela).
  useEffect(() => {
    if (isMobile && tab === 'viability') requestSnap('mid');
  }, [isMobile, tab, requestSnap]);

  // Cada CDO escolhida na lista (não a limpeza on-unmount) reabre a folha em `mid` no
  // mobile: trocar de CDO com a folha em `full` esconderia o drop recém-projetado da nova
  // caixa, então a folha volta ao meio para a projeção caber na tela. O drop em si sobe
  // para o GeoPage desenhar (ver onDropSimulation e ViabilityTab).
  const handleSimulate = useCallback(
    (simulation: DropSimulation | null) => {
      if (isMobile && simulation) requestSnap('mid');
      (onDropSimulation ?? noop)(simulation);
    },
    [isMobile, requestSnap, onDropSimulation],
  );

  const body = (
    <>
      {/* Barra de ações abaixo do título, mesmo padrão dos painéis de Site e
          Recurso. O Street View fica ao lado da coordenada, como nos demais campos. */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-app-border pb-3">
        <PanelBarButton
          icon={InfoIcon}
          label="Visão geral"
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        {activeLocation ? (
          <PanelBarButton
            icon={Route}
            label="Viabilidade"
            active={tab === 'viability'}
            onClick={() => setTab('viability')}
          />
        ) : null}
      </div>
      {tab === 'viability' && activeLocation ? (
        <ViabilityTab origin={activeLocation.coordinates} onSimulate={handleSimulate} />
      ) : (
        <AddressOverview
          address={address}
          marker={marker}
          geonet={geonet}
          resolution={resolution}
          onChooseSource={chooseSource}
        />
      )}
    </>
  );

  const header = (
    <div className="border-y border-app-border px-3 py-3">
      <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted">
        Endereço
      </div>
      <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text">
        {title}
      </h3>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {/* Foto, título e corpo rolam juntos dentro da folha (ver BottomSheet). Na aba
            Viabilidade a foto some para o mapa (e o traçado do drop) ganharem a tela. */}
        {tab === 'overview' && marker ? <StreetViewHero marker={marker} /> : null}
        {header}
        {/* `overflow-hidden` nos dois eixos mantém o BottomSheet como único dono
            do gesto vertical; `overflow-x-hidden` faria Y computar para `auto`. */}
        <div className="min-w-0 overflow-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    // `overflow-hidden` (não `overflow-x-hidden`): com só um eixo em `hidden`, o
    // `overflow-y: visible` computa para `auto` e a casca vira um segundo contêiner de
    // rolagem, ao lado do scroll do conteúdo — era o scroll duplo do painel. Quem rola
    // aqui é só o filho `overflow-y-auto`. Mesmo ajuste no painel de Site/Recurso.
    <div
      className={`${DOCK_ELEVATION_CLASS} flex h-full ${DOCK_WIDTH_CLASS} max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock`}
    >
      {/* A barra de pesquisa é uma instância única, sobreposta a esta doca pelo GeoPage
          (estilo Google Maps): a foto de Street View, o título e o corpo rolam por baixo
          dela. Aqui o painel só cede o topo — não monta a barra. */}
      {/* Barra de rolagem sobreposta: a foto e as abas usam toda a largura do painel; o
          polegar projeta por cima delas no hover (ver OverlayScrollArea). */}
      <OverlayScrollArea className="overflow-x-hidden">
        {marker ? <StreetViewHero marker={marker} /> : null}
        {header}
        <div className="px-3 py-3">{body}</div>
      </OverlayScrollArea>
    </div>
  );
}

function AddressOverview({
  address,
  marker,
  geonet,
  resolution,
  onChooseSource,
}: {
  address: DraftAddress;
  marker: ReturnType<typeof addressStreetViewMarker>;
  geonet: ReturnType<typeof useGeonetAddress>;
  resolution: AddressLocationResolution;
  onChooseSource: (source: AddressPinLocation['source']) => void;
}) {
  const activeLocation =
    resolution.mode === 'automatic' ? resolution.selected : resolution[resolution.selectedSource];
  return (
    <div className="grid gap-3">
      {resolution.mode === 'conflict' ? (
        // Divergência relevante: caixa vermelha pastel (mesmos tokens da precisão baixa) que
        // explica a distância e hospeda a chave de troca de base. A caixa amarela antiga
        // confundia com "precisão média"; a escolha ficava em botões soltos no rodapé de
        // cada card. Agora decisão e diagnóstico ficam juntos.
        <div className="rounded-[12px] border border-status-red/30 bg-status-red-soft px-3 py-2.5 text-[0.78rem] leading-snug text-app-text">
          As localizações retornadas divergem em {formatDivergenceMeters(resolution.distanceMeters)}
          . Selecione a base usada no alfinete e na análise de viabilidade.
          <AddressSourceSwitch resolution={resolution} onChoose={onChooseSource} />
        </div>
      ) : (
        <div className="px-1 py-1 text-[0.76rem] text-app-muted">
          Alfinete do mapa:{' '}
          <span className="font-semibold">
            {activeLocation.source === 'google' ? 'Google' : 'GEONET'}
          </span>
          {' · '}
          {activeLocation.precision}
        </div>
      )}
      {/* GEONET primeiro: é a base preferencial da V.tal (ver selectPinLocation). O Google
          vem logo abaixo como referência externa, e o DNE (Correios) fecha a Visão geral. */}
      <GeonetAddressCard geonet={geonet} />
      <AddressSourceCard
        icon={<GoogleMapsIcon />}
        title="Google Maps"
        tone="bg-status-green-soft/40"
      >
        <IconInfoRow icon={MapPin} hint="Endereço formatado" value={address.label} />
        <IconInfoRow
          icon={Crosshair}
          hint="Localização"
          value={<CoordinateStreetView marker={marker} />}
        />
        <IconInfoRow
          icon={Target}
          hint="Precisão"
          value={<PrecisionBadge locationType={address.precision} />}
        />
        <IconInfoRow icon={Fingerprint} hint="Place ID" value={address.placeId ?? '-'} mono />
      </AddressSourceCard>
      <DneAddressCard address={address} geonet={geonet.detail} />
    </div>
  );
}

function GeonetAddressCard({ geonet }: { geonet: ReturnType<typeof useGeonetAddress> }) {
  const selected = geonet.candidates.find((candidate) => candidate.addressId === geonet.selectedId);
  const detail: GeonetAddressDetail | null = geonet.detail ?? (selected ? { ...selected } : null);
  const selectedIndex = geonet.candidates.findIndex(
    (candidate) => candidate.addressId === geonet.selectedId,
  );

  return (
    <AddressSourceCard icon={<VtalIcon />} title="GEONET" tone="bg-app-accent-soft/70">
      {geonet.status === 'loading' ? (
        <div className="flex items-center gap-2 py-2 text-[0.82rem] text-app-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Consultando endereço no Geonet...
        </div>
      ) : null}
      {geonet.status === 'idle' ? (
        <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
          A comparação Geonet é feita para endereços pesquisados.
        </p>
      ) : null}
      {geonet.status === 'not_configured' ? (
        <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
          Consulta Geonet não configurada neste ambiente.
        </p>
      ) : null}
      {geonet.status === 'empty' ? (
        <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
          Nenhum endereço equivalente encontrado no Geonet.
        </p>
      ) : null}
      {geonet.status === 'error' ? (
        <div className="grid gap-2 py-1 text-[0.82rem] leading-snug text-app-muted">
          <span>{geonet.error ?? 'Não foi possível consultar o Geonet.'}</span>
          <button
            type="button"
            onClick={geonet.retry}
            className="w-fit rounded-[10px] border border-app-border px-2.5 py-1 text-[0.76rem] font-semibold text-app-text transition hover:border-app-accent-border hover:bg-app-accent-soft"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {geonet.status === 'ready' && detail ? (
        <>
          {geonet.candidates.length > 1 ? (
            <label className="mb-1 grid gap-1 text-[0.72rem] font-medium text-app-muted">
              Resultado {Math.max(1, selectedIndex + 1)} de {geonet.candidates.length}
              <select
                value={geonet.selectedId ?? ''}
                onChange={(event) => geonet.select(event.target.value)}
                className="w-full rounded-[10px] border border-app-border bg-white px-2 py-1.5 text-[0.8rem] text-app-text outline-none focus:border-app-accent-border"
              >
                {geonet.candidates.map((candidate) => (
                  <option
                    key={candidate.addressId ?? candidate.formattedAddress}
                    value={candidate.addressId ?? ''}
                    disabled={!candidate.addressId}
                  >
                    {candidate.formattedAddress}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
          <IconInfoRow icon={Fingerprint} hint="Address ID" value={detail.addressId ?? '-'} mono />
        </>
      ) : null}
    </AddressSourceCard>
  );
}

// CEP a consultar no DNE: primeiro o que foi digitado na busca (mais fiel à intenção),
// depois o da base preferencial (GEONET) e, por fim, o do Google.
function dneCepOf(address: DraftAddress, geonet: GeonetAddressDetail | null): string | null {
  return (
    cepFromText(address.sourceQuery) ??
    normalizeCep(geonet?.postcode) ??
    normalizeCep(address.postcode)
  );
}

// Endereçamento oficial dos Correios (base DNE) para o CEP consultado, via ViaCEP. Puramente
// informativo — arbitra logradouro/bairro/localidade quando Google e GEONET divergem.
function DneAddressCard({
  address,
  geonet,
}: {
  address: DraftAddress;
  geonet: GeonetAddressDetail | null;
}) {
  const cep = dneCepOf(address, geonet);
  const dne = useViaCepAddress(cep);
  const locality = dne.address
    ? [dne.address.localidade, dne.address.uf].filter(Boolean).join(' - ')
    : '';
  const street = dne.address
    ? [dne.address.logradouro, dne.address.complemento].filter(Boolean).join(', ')
    : '';
  return (
    <AddressSourceCard icon={<CorreiosIcon />} title="DNE (Correios)" tone="bg-app-sidebar/70">
      {!cep ? (
        <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
          Sem CEP na consulta para buscar no DNE.
        </p>
      ) : null}
      {cep && dne.status === 'loading' ? (
        <div className="flex items-center gap-2 py-2 text-[0.82rem] text-app-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Consultando CEP no DNE...
        </div>
      ) : null}
      {cep && dne.status === 'not_found' ? (
        <p className="py-1 text-[0.82rem] leading-snug text-app-muted">
          CEP {formatCep(cep)} não encontrado no DNE.
        </p>
      ) : null}
      {cep && dne.status === 'error' ? (
        <div className="grid gap-2 py-1 text-[0.82rem] leading-snug text-app-muted">
          <span>{dne.error ?? 'Não foi possível consultar o CEP.'}</span>
          <button
            type="button"
            onClick={dne.retry}
            className="w-fit rounded-[10px] border border-app-border px-2.5 py-1 text-[0.76rem] font-semibold text-app-text transition hover:border-app-accent-border hover:bg-app-accent-soft"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {dne.status === 'ready' && dne.address ? (
        <>
          <IconInfoRow icon={MapPin} hint="Logradouro" value={street || '-'} />
          <IconInfoRow icon={Building2} hint="Bairro" value={dne.address.bairro || '-'} />
          <IconInfoRow icon={MapIcon} hint="Localidade / UF" value={locality || '-'} />
          <IconInfoRow icon={Hash} hint="CEP" value={formatCep(dne.address.cep)} mono />
          <IconInfoRow icon={Fingerprint} hint="Código IBGE" value={dne.address.ibge || '-'} mono />
          <IconInfoRow icon={Phone} hint="DDD" value={dne.address.ddd || '-'} />
        </>
      ) : null}
    </AddressSourceCard>
  );
}
