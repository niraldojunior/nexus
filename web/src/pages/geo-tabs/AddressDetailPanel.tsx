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
  X,
} from 'lucide-react';
import type { DraftAddress } from '../../utils/googleMaps';
import { BottomSheet } from '../../components/BottomSheet';
import { StreetViewHero } from '../../components/StreetViewHero';
import { GoogleStreetViewButton } from '../../components/GoogleStreetViewButton';
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
  onClose: () => void;
  // Barra de pesquisa unificada, sobreposta à foto de Street View no topo do painel
  // (desktop) — mesmo padrão dos painéis de Site e Recurso em GeoPage.
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
            value={
              <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
                <CoordinateStreetView marker={marker} />
                <GoogleStreetViewButton marker={marker} />
              </span>
            }
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
    <div className="flex items-start gap-2 border-b border-app-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="break-words text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.08em] text-app-muted [overflow-wrap:anywhere]">
          Endereço
        </div>
        <h3 className="break-words font-display text-[1.02rem] font-semibold leading-tight text-app-text [overflow-wrap:anywhere]">
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
        aria-label="Fechar detalhe"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet
        header={
          <>
            <StreetViewHero marker={marker} />
            {header}
          </>
        }
        onClose={onClose}
      >
        <div className="min-w-0 overflow-x-hidden px-4 py-3">{body}</div>
      </BottomSheet>
    );
  }

  return (
    <div className="flex h-full w-[396px] max-w-[85vw] shrink-0 flex-col overflow-x-hidden border-r border-app-border bg-app-panel shadow-dock">
      {header}
      {/* Cabeçalho (título + fechar) fixo; a foto de Street View e o corpo rolam
          juntos, para o conteúdo usar toda a altura do painel — não só a metade
          abaixo da foto. Mesmo padrão no painel de Site/Recurso (ver GeoPage). */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <StreetViewHero marker={marker} overlay={searchBar} />
        <div className="px-3 py-3">{body}</div>
      </div>
    </div>
  );
}
