import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Crosshair,
  Fingerprint,
  Info as InfoIcon,
  Loader2,
  MapPin,
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
import type { GeonetAddressDetail } from '../../services/geonetAddressApi';

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
  onLocationResolved?: (location: AddressPinLocation) => void;
};

export type AddressPinLocation = {
  coordinates: [number, number];
  source: 'google' | 'geonet';
  precision: string;
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
  const title = address.sourceQuery?.trim() || [address.street, address.streetNr].filter(Boolean).join(', ') || address.label;
  const marker = addressStreetViewMarker(address);
  const [tab, setTab] = useState<AddressTab>('overview');
  const { snapCommand, requestSnap } = useSheetSnapCommand(minimizeSignal);
  const geonet = useGeonetAddress(address, geonetEnabled);
  const pinLocation = useMemo(
    () => selectPinLocation(address, geonet.detail),
    [address, geonet.detail],
  );

  useEffect(() => {
    // A câmera só pode voar após a comparação terminar: enquanto o detalhe Geonet
    // ainda está em trânsito, a decisão poderia mudar do ponto Google para o Geonet.
    if (geonet.status === 'loading' || geonet.locationPending) return;
    onLocationResolved?.(pinLocation);
  }, [geonet.locationPending, geonet.status, onLocationResolved, pinLocation]);

  // Endereço novo é consulta nova: a aba volta para a Visão geral, e a aba de
  // Viabilidade se desmonta — é a desmontagem dela que apaga o drop simulado do mapa
  // (ver ViabilityTab).
  const [lng, lat] = address.coordinates;
  useEffect(() => {
    setTab('overview');
  }, [lng, lat]);

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
        <PanelBarButton
          icon={Route}
          label="Viabilidade"
          active={tab === 'viability'}
          onClick={() => setTab('viability')}
        />
      </div>
      {tab === 'viability' ? (
        <ViabilityTab origin={pinLocation.coordinates} onSimulate={handleSimulate} />
      ) : (
        <AddressOverview address={address} marker={marker} geonet={geonet} pinLocation={pinLocation} />
      )}
    </>
  );

  const header = (
    <div className="border-y border-app-border px-3 py-3">
      <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted [overflow-wrap:anywhere]">
        Endereço
      </div>
      <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text [overflow-wrap:anywhere]">
        {title}
      </h3>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} onSnapChange={onSnapChange} snapCommand={snapCommand}>
        {/* Foto, título e corpo rolam juntos dentro da folha (ver BottomSheet). Na aba
            Viabilidade a foto some para o mapa (e o traçado do drop) ganharem a tela. */}
        {tab === 'overview' ? <StreetViewHero marker={marker} /> : null}
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
        <StreetViewHero marker={marker} />
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
  pinLocation,
}: {
  address: DraftAddress;
  marker: ReturnType<typeof addressStreetViewMarker>;
  geonet: ReturnType<typeof useGeonetAddress>;
  pinLocation: AddressPinLocation;
}) {
  return (
    <div className="grid gap-3">
      <div className="px-1 py-1 text-[0.76rem] text-app-muted">
        Alfinete do mapa: <span className="font-semibold">{pinLocation.source === 'google' ? 'Google' : 'GEONET'}</span>
        {' · '}
        {pinLocation.precision}
      </div>
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
      <GeonetAddressCard geonet={geonet} />
    </div>
  );
}

const GOOGLE_PRECISION_RANK: Record<string, number> = {
  ROOFTOP: 3,
  RANGE_INTERPOLATED: 2,
  GEOMETRIC_CENTER: 1,
  APPROXIMATE: 1,
};

export function selectPinLocation(
  address: DraftAddress,
  geonet: GeonetAddressDetail | null,
): AddressPinLocation {
  const google = {
    coordinates: address.coordinates,
    source: 'google' as const,
    precision: address.precision ?? 'Desconhecida',
    rank: GOOGLE_PRECISION_RANK[address.precision ?? ''] ?? 0,
  };
  const geonetPrecision = geonet?.geolocationMethod
    ? GEONET_PRECISION[geonet.geolocationMethod.trim().toUpperCase()]
    : undefined;
  const geonetRank = geonetPrecision ? ({ Alta: 3, Média: 2, Baixa: 1 }[geonetPrecision.quality] ?? 0) : 0;
  if (geonet?.coordinates && geonetRank > google.rank) {
    return {
      coordinates: geonet.coordinates,
      source: 'geonet',
      precision: `${geonetPrecision?.quality} - ${geonetPrecision?.label}`,
    };
  }
  return { coordinates: google.coordinates, source: google.source, precision: google.precision };
}

function AddressSourceCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-[14px] border border-app-border p-3 shadow-sm ${tone}`}>
      <h4 className="mb-2 flex items-center gap-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
        {icon}
        {title}
      </h4>
      <div className="grid gap-1">{children}</div>
    </section>
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

const GEONET_PRECISION: Record<string, { quality: string; label: string; className: string }> = {
  'ENDEREÇO COMPLETO': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'ENDERECO COMPLETO': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'ENDEREÇO INTERPOLAÇÃO': {
    quality: 'Média',
    label: 'Endereço Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'ENDERECO INTERPOLACAO': {
    quality: 'Média',
    label: 'Endereço Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  BAIRRO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Bairro',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  MUNICÍPIO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Município',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  MUNICIPIO: {
    quality: 'Baixa',
    label: 'Ponto no Centro do Município',
    className: 'border-status-red/30 bg-status-red-soft text-status-red',
  },
  'CEP + INTERPOLAÇÃO': {
    quality: 'Média',
    label: 'CEP + Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'CEP + INTERPOLACAO': {
    quality: 'Média',
    label: 'CEP + Interpolação',
    className: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  },
  'CEP + NÚMERO DE PORTA': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
  'CEP + NUMERO DE PORTA': {
    quality: 'Alta',
    label: 'Endereço Completo',
    className: 'border-status-green/30 bg-status-green-soft text-status-green',
  },
};

function GeonetPrecisionBadge({ method }: { method?: string }) {
  const precision = method ? GEONET_PRECISION[method.trim().toUpperCase()] : undefined;
  const text = precision ? `${precision.quality} - ${precision.label}` : (method ?? 'Desconhecida');
  return (
    <span
      className={`inline-flex items-center rounded-[999px] border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.02em] ${precision?.className ?? 'border-app-border bg-app-sidebar text-app-muted'}`}
    >
      {text}
    </span>
  );
}

function GoogleMapsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#34A853" d="M3 5.5 9.5 2v16.5L3 22V5.5Z" />
      <path fill="#4285F4" d="M9.5 2 16 5.5V22l-6.5-3.5V2Z" />
      <path fill="#FBBC04" d="M16 5.5 21 2.8v16.5L16 22V5.5Z" />
      <path
        fill="#EA4335"
        d="M12.75 7.1a3.35 3.35 0 0 0-3.35 3.35c0 2.52 3.35 6.3 3.35 6.3s3.35-3.78 3.35-6.3a3.35 3.35 0 0 0-3.35-3.35Zm0 4.6a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"
      />
    </svg>
  );
}

function VtalIcon() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-app-text"
      aria-hidden="true"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24">
        <path fill="white" d="M2.5 3h4.1L12 16.2 17.4 3h4.1L12 21 2.5 3Z" />
        <path fill="currentColor" className="text-app-accent" d="M21 15h2v3h-2z" />
      </svg>
    </span>
  );
}
