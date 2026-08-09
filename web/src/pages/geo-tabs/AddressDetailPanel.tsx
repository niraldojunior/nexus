import { useEffect, useState, type ReactNode } from 'react';
import {
  Crosshair,
  Fingerprint,
  Globe,
  Info as InfoIcon,
  MapPin,
  Route,
  Tag,
  Target,
} from 'lucide-react';
import type { DraftAddress } from '../../utils/googleMaps';
import { BottomSheet } from '../../components/BottomSheet';
import { StreetViewHero } from '../../components/StreetViewHero';
import { addressStreetViewMarker } from '../../utils/streetViewMarker';
import { CoordinateStreetView } from './CoordinateStreetView';
import { IconInfoRow } from './IconInfoRow';
import { PanelBarButton } from './PanelBarButton';
import { PrecisionBadge } from './PrecisionBadge';
import { ViabilityTab, type DropSimulation } from './ViabilityTab';

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
  // Barra de pesquisa unificada, ancorada no topo do painel (desktop), flutuando
  // sobre o conteúdo que rola por baixo — mesmo padrão dos painéis de Site e Recurso.
  searchBar?: ReactNode;
  // Simulação do drop entre este endereço e a CDO escolhida na aba Viabilidade. Sobe
  // para o GeoPage porque quem desenha é o mapa, não o painel.
  onDropSimulation?: (simulation: DropSimulation | null) => void;
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
  searchBar,
  onDropSimulation,
}: AddressDetailPanelProps) {
  const title = [address.street, address.streetNr].filter(Boolean).join(', ') || address.label;
  const marker = addressStreetViewMarker(address);
  const [tab, setTab] = useState<AddressTab>('overview');

  // Endereço novo é consulta nova: a aba volta para a Visão geral, e a aba de
  // Viabilidade se desmonta — é a desmontagem dela que apaga o drop simulado do mapa
  // (ver ViabilityTab).
  const [lng, lat] = address.coordinates;
  useEffect(() => {
    setTab('overview');
  }, [lng, lat]);

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
        <ViabilityTab origin={address.coordinates} onSimulate={onDropSimulation ?? noop} />
      ) : (
        <div className="grid gap-1">
          <IconInfoRow icon={MapPin} hint="Endereço formatado" value={address.label} />
          <IconInfoRow
            icon={Crosshair}
            hint="Localização"
            value={<CoordinateStreetView marker={marker} />}
          />
          <IconInfoRow icon={Target} hint="Precisão" value={<PrecisionBadge locationType={address.precision} />} />
          <IconInfoRow icon={Tag} hint="Place ID (Google Maps)" value={address.placeId ?? '-'} mono />
          <IconInfoRow icon={Fingerprint} hint="Address ID (Geonet)" value="-" mono />
          <IconInfoRow icon={Globe} hint="Origem Localização" value="Google Maps" />
        </div>
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
      <BottomSheet onClose={onClose}>
        {/* Foto, título e corpo rolam juntos dentro da folha (ver BottomSheet). */}
        <StreetViewHero marker={marker} />
        {header}
        <div className="min-w-0 overflow-x-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    // `overflow-hidden` (não `overflow-x-hidden`): com só um eixo em `hidden`, o
    // `overflow-y: visible` computa para `auto` e a casca vira um segundo contêiner de
    // rolagem, ao lado do scroll do conteúdo — era o scroll duplo do painel. Quem rola
    // aqui é só o filho `overflow-y-auto`. Mesmo ajuste no painel de Site/Recurso.
    <div className="relative flex h-full w-[396px] max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel shadow-dock">
      {/* Barra de pesquisa ancorada no topo, flutuando sobre o conteúdo; a foto de
          Street View, o título e o corpo rolam por baixo dela — estilo Google Maps.
          Mesmo padrão no painel de Site/Recurso (ver GeoPage). */}
      {searchBar ? <div className="absolute inset-x-0 top-0 z-30">{searchBar}</div> : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <StreetViewHero marker={marker} />
        {header}
        <div className="px-3 py-3">{body}</div>
      </div>
    </div>
  );
}
