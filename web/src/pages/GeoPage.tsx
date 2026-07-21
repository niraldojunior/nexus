import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  GeoStatus,
  GeoLocation,
  GeoAddress,
  GeoSpec,
  GeoSite,
  GeoEvent,
  GeoGeometry,
} from '../services/geoApi';
import { getJson, postJson, patchJson } from '../services/geoApi';
import {
  siteKindFromSpec,
  siteKindLabel,
  formatAddress,
  buildGeoDirectory,
  resolvePlaceLabel,
  resolvePlacePoint,
  resolvePlaceRoute,
} from '../utils/placeLabel';
import type { GeoDirectory, SiteKind } from '../utils/placeLabel';
import { buildLocationHierarchy, isCableResource, type HierInstance, type HierResource } from '../utils/geoHierarchy';
import { useResourceInventory } from '../hooks/useEquipmentInventory';
import { resourceIconFor, resourceIconDataUrl, resourceTypeCode } from '../utils/resourceIcon';
import { siteIconDataUrl, siteIconFor } from '../utils/siteIcon';
import { useNavigation } from '../hooks/useNavigation';
import { GuidedSignupModal, HierarchySidebar } from './geo-tabs';

declare global {
  interface Window {
    google?: any;
    __nexusGoogleMapsPromise?: Promise<void>;
  }
}

type RelatedSite = {
  id: string;
  relationshipType: string;
  '@referredType': 'GeographicSite';
};

type DraftAddress = {
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country: string;
  coordinates: [number, number];
  label: string;
};

type DetailTab = 'overview' | 'subsites' | 'topology' | 'lifecycle' | 'resources';

// Conteúdo do balão flutuante ancorado no item clicado no mapa. É montado no
// GeoPage (que tem o diretório Geo e o inventário) e apenas desenhado pelo
// painel do mapa — assim o painel não precisa saber o que é Site ou Recurso.
type MapBalloon = {
  // `site:<id>` | `resource:<id>` — identifica o alvo e detecta troca de item.
  key: string;
  point: [number, number];
  // Deslocamento em px do bico do balão em relação à coordenada, para o balão
  // pousar acima do ícone em vez de cobri-lo.
  offset: [number, number];
  iconUrl: string;
  eyebrow: string;
  title: string;
  rows: Array<[string, string]>;
  actionLabel: string;
  onAction: () => void;
};

const API_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') ?? 'change-me'}`,
});

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Lado do ícone de equipamento no mapa, em px. Um pouco menor que o pin de site
// para o equipamento não competir com o local que o contém.
const MARKER_ICON_SIZE = 26;

// Equipamento desenha acima do pin de local: por padrão o Google Maps ordena os
// markers por latitude, e o pin do site cobriria o equipamento que mora nele.
const EQUIPMENT_MARKER_Z = 1000;

// Lado do ícone de local, um pouco maior que o de equipamento: o local é o
// contexto, o equipamento é o detalhe dentro dele.
const SITE_ICON_SIZE = 30;
const SITE_MARKER_Z = 500;

// A rota do cabo fica abaixo de todos os pins — é o fundo por onde a rede passa.
const CABLE_ROUTE_Z = 10;

// Espessura por hierarquia da planta: o feeder é o tronco, o drop é o capilar.
const CABLE_STROKE_WEIGHT: Record<string, number> = {
  BackboneCable: 5,
  DistributionCable: 3.5,
  DropCable: 2,
  Fiber: 3,
  Jumper: 2,
  PatchCord: 2,
};
const DEFAULT_CENTER = { lat: -22.9068, lng: -43.1075 };

// O basemap é contexto, não conteúdo: POI comercial some por inteiro e os demais
// POIs perdem o ícone (o texto fica, como referência de orientação) para não
// competirem com os pins de local, equipamento e rota de cabo do inventário.
const MAP_STYLES = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

const statusLabel: Record<GeoStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  suspended: 'Suspenso',
  terminated: 'Terminado',
};

const relationshipTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    fedBy: 'Alimentado por',
    feeds: 'Alimenta',
    nearby: 'Próximo de',
    contains: 'Contém',
  };
  return labels[type] || type;
};

const layerOptions = ['CO', 'POP', 'CTO', 'PI', 'Relacoes', 'Sem coordenada'] as const;
type LayerKey = (typeof layerOptions)[number];

// As camadas cobrem só os tipos de local que ganham pin próprio. Região,
// Sub-local (andar, sala técnica) e Local genérico não têm chave de camada —
// antes isto os derrubava do mapa, porque `layers.has(kind)` nunca casava.
const LAYER_FOR_SITE_KIND: Partial<Record<SiteKind, LayerKey>> = {
  CO: 'CO',
  POP: 'POP',
  CTO: 'CTO',
  PI: 'PI',
};

export default function GeoPage() {
  const [sites, setSites] = useState<GeoSite[]>([]);
  const [addresses, setAddresses] = useState<GeoAddress[]>([]);
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [draftAddress, setDraftAddress] = useState<DraftAddress | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [layers] = useState<Set<LayerKey>>(() => new Set(layerOptions));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<HierInstance | null>(null);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  // Alvo do balão. Estado separado da seleção porque a carga inicial pré-seleciona
  // o primeiro site — isso posiciona a árvore, mas não deve abrir um balão sozinho.
  const [balloonKey, setBalloonKey] = useState<string | null>(null);

  const { physical, located, loading: resourcesLoading } = useResourceInventory();
  const { navParams, clearNav, goToResource } = useNavigation();

  const locationById = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const addressById = useMemo(() => new Map(addresses.map((item) => [item.id, item])), [addresses]);
  const specById = useMemo(() => new Map(specs.map((item) => [item.id, item])), [specs]);
  const siteById = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;
  const [searching, setSearching] = useState(false);

  // Diretório Geo + hierarquia de navegação (UF → Município → … → instância).
  const directory = useMemo(
    () => buildGeoDirectory(sites, addresses, locations, specs),
    [sites, addresses, locations, specs],
  );

  // Equipamentos posicionáveis no mapa: só entram os que o diretório consegue
  // resolver para uma coordenada — seja via Site, Location ou Address.
  const inventoryEquipment = useMemo<HierResource[]>(
    () => physical.filter((item) => resolvePlacePoint(item.place, directory)).slice(0, 500),
    [physical, directory],
  );
  const hierarchyRoots = useMemo(
    () => buildLocationHierarchy(directory, sites, located),
    [directory, sites, located],
  );
  const selectedInstanceKey = selectedResource
    ? `${selectedResource.referredType}:${selectedResource.id}`
    : selectedSiteId
      ? `GeographicSite:${selectedSiteId}`
      : null;

  const runAddressSearch = useCallback(async () => {
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      const address = await geocodeAddress(term);
      if (address) setDraftAddress(address);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const loadGeo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [siteData, addressData, locationData, specData] = await Promise.all([
        getJson<GeoSite[]>('/v1/geo/sites'),
        getJson<GeoAddress[]>('/v1/geo/addresses'),
        getJson<GeoLocation[]>('/v1/geo/locations'),
        getJson<GeoSpec[]>('/v1/geo/site-specifications'),
      ]);
      setSites(siteData);
      setAddresses(addressData);
      setLocations(locationData);
      setSpecs(specData);
      setSelectedSiteId((current) => current ?? siteData[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados Geo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGeo();
  }, [loadGeo]);

  useEffect(() => {
    if (!selectedSite || !detailOpen) return;
    void getJson<GeoEvent[]>(`/v1/geo/sites/${selectedSite.id}/events`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [detailOpen, selectedSite]);

  // Responder a parâmetros de navegação (ex: vindo de Recursos/Serviços)
  useEffect(() => {
    if (!navParams || navParams.page !== 'geo') return;
    if (navParams.siteId) {
      const site = sites.find((s) => s.id === navParams.siteId);
      if (site) {
        setSelectedSiteId(site.id);
        setDetailOpen(true);
        clearNav();
      }
    }
  }, [navParams, sites, clearNav]);

  const visibleSites = useMemo(
    () =>
      sites.filter((site) => {
        const spec = specById.get(site.siteSpecificationId);
        if (!pointForSite(site, locationById)) return layers.has('Sem coordenada');
        const layer = LAYER_FOR_SITE_KIND[siteKindFromSpec(spec)];
        return layer ? layers.has(layer) : true;
      }),
    [layers, locationById, sites, specById],
  );

  const childSites = selectedSite ? sites.filter((site) => site.parentSite?.id === selectedSite.id) : [];

  const selectSite = (site: GeoSite) => {
    setSelectedSiteId(site.id);
    setSelectedResource(null);
    setDraftAddress(null);
    setBalloonKey(`site:${site.id}`);
    const point = pointForSite(site, locationById);
    if (point) setFocusPoint(point);
  };

  // Fecha o balão: clique no mapa fora de qualquer item, X do próprio balão ou Esc.
  const closeBalloon = useCallback(() => setBalloonKey(null), []);

  const openDetail = (site: GeoSite, tab: DetailTab = 'overview') => {
    selectSite(site);
    setDetailTab(tab);
    setDetailOpen(true);
  };

  // Seleção vinda do mapa (pin de equipamento ou traçado de cabo). Converte o
  // recurso cru na mesma forma que a árvore entrega, para o cartão de detalhe
  // ser o mesmo nos dois caminhos.
  const selectResourceFromMap = useCallback((resource: HierResource) => {
    setSelectedSiteId(null);
    setBalloonKey(`resource:${resource.id}`);
    setSelectedResource({
      id: resource.id,
      name: resource.name,
      entity: isCableResource(resource) ? 'Cabo' : 'Equipamento',
      referredType: resource['@type'] ?? 'PhysicalResource',
      placeId: resource.place?.id,
      placeType: resource.place?.['@referredType'],
      siteKind: null,
      resourceType: resourceTypeCode(resource),
    });
  }, []);

  // Seleção vinda da sidebar de hierarquia (árvore ou combos). Centraliza o mapa
  // e abre o mesmo balão do clique no pin — a árvore e o mapa são dois caminhos
  // para a mesma seleção, e o detalhe completo sai do botão do balão.
  const selectInstance = (instance: HierInstance) => {
    if (instance.referredType === 'GeographicSite') {
      const site = siteById.get(instance.id);
      if (site) selectSite(site);
      return;
    }
    setSelectedResource(instance);
    setSelectedSiteId(null);
    setBalloonKey(`resource:${instance.id}`);
    const point = resolvePlacePoint(
      instance.placeId ? { id: instance.placeId, '@referredType': instance.placeType } : null,
      directory,
    );
    if (point) setFocusPoint(point);
  };

  // Monta o conteúdo do balão a partir do alvo selecionado. Fica aqui, e não no
  // painel do mapa, porque só o GeoPage tem diretório Geo + inventário para
  // resolver tipo, endereço e local de um item.
  const balloon = useMemo<MapBalloon | null>(() => {
    if (!balloonKey) return null;
    const separator = balloonKey.indexOf(':');
    const kind = balloonKey.slice(0, separator);
    const id = balloonKey.slice(separator + 1);

    if (kind === 'site') {
      const site = siteById.get(id);
      if (!site) return null;
      const point = pointForSite(site, locationById);
      if (!point) return null;
      const spec = specById.get(site.siteSpecificationId);
      const kindOfSite = siteKindFromSpec(spec);
      const icon = siteIconFor(kindOfSite, site.status);
      const address = site.address ? addressById.get(site.address.id) : undefined;
      const parent = site.parentSite ? siteById.get(site.parentSite.id) : undefined;
      // O pin do local é centrado na coordenada e cresce quando selecionado.
      const pinSize = SITE_ICON_SIZE + 8;
      const rows: Array<[string, string]> = [
        ['Status', statusLabel[site.status]],
        ['Endereço', address ? formatAddress(address) : 'Sem endereço'],
      ];
      if (parent) rows.push(['Local pai', parent.name]);
      return {
        key: balloonKey,
        point,
        offset: [0, -(pinSize / 2 + 6)],
        iconUrl: siteIconDataUrl(icon, { size: 40 }),
        eyebrow: spec?.name ?? siteKindLabel[kindOfSite],
        title: site.name,
        rows,
        actionLabel: 'Ver detalhes do local',
        onAction: () => openDetail(site),
      };
    }

    const equip = inventoryEquipment.find((item) => item.id === id);
    if (!equip) return null;
    const point = resolvePlacePoint(equip.place, directory);
    if (!point) return null;
    const icon = resourceIconFor(equip);
    // Cabo não tem pin: o balão nasce sobre o traçado, sem folga de ícone.
    const isCable = Boolean(resolvePlaceRoute(equip.place, directory));
    const placeLabel = resolvePlaceLabel(equip.place, directory);
    const rows: Array<[string, string]> = [];
    if (equip.model) rows.push(['Modelo', equip.model]);
    if (equip.manufacturer) rows.push(['Fabricante', equip.manufacturer]);
    if (equip.serialNumber) rows.push(['Nº de série', equip.serialNumber]);
    if (placeLabel) rows.push(['Local', placeLabel.name]);
    return {
      key: balloonKey,
      point,
      // O ícone de equipamento é ancorado no canto inferior-esquerdo, então ele
      // fica acima e à direita da coordenada — o balão segue o ícone.
      offset: isCable ? [0, -8] : [MARKER_ICON_SIZE / 2, -(MARKER_ICON_SIZE + 4)],
      iconUrl: resourceIconDataUrl(icon, { size: 40 }),
      eyebrow: icon.label,
      title: equip.name,
      rows,
      actionLabel: 'Abrir no módulo Recursos',
      onAction: () => goToResource(equip.id),
    };
  }, [
    addressById,
    balloonKey,
    directory,
    goToResource,
    inventoryEquipment,
    locationById,
    siteById,
    specById,
  ]);

  // Esc fecha o balão — mas só quando nenhum modal está aberto, senão a tecla
  // fecharia os dois de uma vez.
  useEffect(() => {
    if (!balloonKey || detailOpen || createOpen || typeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBalloon();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [balloonKey, closeBalloon, createOpen, detailOpen, typeOpen]);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-transparent flex flex-col">
      <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-[#eef2f6]">
        {error ? (
          <div className="absolute left-5 top-5 z-40 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.88rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}

        <div className="flex h-full min-h-0">
            <HierarchySidebar
              roots={hierarchyRoots}
              loading={resourcesLoading || loading}
              selectedInstanceKey={selectedInstanceKey}
              onSelectInstance={selectInstance}
              onReload={() => void loadGeo()}
              onOpenTypes={() => setTypeOpen(true)}
            />
            <div className="relative min-h-0 flex-1">
            <GoogleMapPanel
          sites={visibleSites}
          specs={specById}
          locationById={locationById}
          directory={directory}
          selectedSiteId={selectedSiteId}
          draftAddress={draftAddress}
          focusPoint={focusPoint}
          balloon={balloon}
          onSelectSite={selectSite}
          onSelectResource={selectResourceFromMap}
          onCloseBalloon={closeBalloon}
          onDraftAddress={setDraftAddress}
          equipment={inventoryEquipment}
        />

        <div className="absolute left-3 top-3 z-30 w-[400px] max-w-[calc(100%-1.5rem)]">
          <div className="flex h-12 items-center rounded-2xl border border-app-border bg-white shadow-soft transition focus-within:border-app-accent-border focus-within:ring-[0.5px] focus-within:ring-app-focus/15">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runAddressSearch();
              }}
              className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent pl-4 pr-2 text-[15px] text-app-text placeholder:text-app-muted focus:outline-none"
              placeholder="Pesquisar no mapa"
              id="geo-search-input"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition hover:bg-black/5"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <span className="mx-1 h-6 w-px bg-app-border" />
            <button
              type="button"
              onClick={() => void runAddressSearch()}
              disabled={searching}
              className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[#1a73e8] transition hover:bg-[#1a73e8]/10 disabled:opacity-50"
              aria-label="Pesquisar endereço"
            >
              {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-5 w-5" />}
            </button>
          </div>
          <GoogleAutocompleteBridge onAddress={setDraftAddress} />
        </div>

        {loading ? (
          <div className="absolute right-5 bottom-5 z-30 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.84rem] font-medium text-app-muted shadow-soft backdrop-blur">
            Carregando dados Geo...
          </div>
        ) : null}

            </div>
          </div>
      </main>

      {createOpen ? (
        <GuidedSignupModal
          draftAddress={draftAddress}
          selectedSite={selectedSite}
          specs={specs}
          sites={sites}
          specById={specById}
          addressById={addressById}
          locationById={locationById}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            setDraftAddress(null);
            await loadGeo();
          }}
        />
      ) : null}

      {detailOpen && selectedSite ? (
        <SiteDetailModal
          site={selectedSite}
          tab={detailTab}
          childSites={childSites}
          sites={sites}
          specById={specById}
          siteById={siteById}
          addressById={addressById}
          locationById={locationById}
          events={events}
          onTab={setDetailTab}
          onClose={() => setDetailOpen(false)}
          onChanged={async () => {
            await loadGeo();
            const updatedEvents = await getJson<GeoEvent[]>(`/v1/geo/sites/${selectedSite.id}/events`).catch(() => []);
            setEvents(updatedEvents);
          }}
          onCreateSubSite={() => {
            setDetailOpen(false);
            setCreateOpen(true);
          }}
        />
      ) : null}

      {typeOpen ? (
        <TypeManagementModal
          specs={specs}
          onClose={() => setTypeOpen(false)}
          onChanged={async () => {
            await loadGeo();
          }}
        />
      ) : null}
    </div>
  );
}

function GoogleMapPanel({
  sites,
  specs,
  locationById,
  directory,
  selectedSiteId,
  draftAddress,
  focusPoint,
  balloon,
  onSelectSite,
  onSelectResource,
  onCloseBalloon,
  onDraftAddress,
  equipment = [],
}: {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  locationById: Map<string, GeoLocation>;
  directory: GeoDirectory;
  selectedSiteId: string | null;
  draftAddress: DraftAddress | null;
  focusPoint?: [number, number] | null;
  balloon: MapBalloon | null;
  onSelectSite: (site: GeoSite) => void;
  onSelectResource: (resource: HierResource) => void;
  onCloseBalloon: () => void;
  onDraftAddress: (address: DraftAddress) => void;
  equipment?: HierResource[];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const equipmentMarkersRef = useRef<any[]>([]);
  const cableRoutesRef = useRef<any[]>([]);
  const draftMarkerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  // Nó fora da árvore do React: o InfoWindow do Google recebe este elemento como
  // conteúdo e o React desenha dentro dele via portal, mantendo o balão como
  // componente normal (com handlers) em vez de HTML em string.
  const balloonNode = useMemo(() => document.createElement('div'), []);
  // O balão abre/fecha por callbacks que mudam a cada render; o listener do mapa
  // é registrado uma vez só, então lê sempre a versão atual daqui.
  const closeBalloonRef = useRef(onCloseBalloon);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    closeBalloonRef.current = onCloseBalloon;
  }, [onCloseBalloon]);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !mapEl.current) return;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        if (!mapEl.current || mapRef.current) return;
        mapRef.current = new window.google.maps.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom: 15,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          styles: MAP_STYLES,
        });
        mapRef.current.addListener('click', (event: any) => {
          // Clique fora de qualquer item: o balão sai. Cliques em marker ou
          // polyline não chegam aqui, então o balão só fecha no vazio do mapa.
          closeBalloonRef.current();
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          reverseGeocode(lat, lng).then((address) => {
            onDraftAddress(address ?? {
              street: 'Ponto selecionado no mapa',
              city: 'Niteroi',
              stateOrProvince: 'RJ',
              country: 'BR',
              coordinates: [lng, lat],
              label: `Ponto selecionado [${lng.toFixed(5)}, ${lat.toFixed(5)}]`,
            });
          });
        });
        setMapsReady(true);
      })
      .catch(() => setMapsReady(false));
  }, [onDraftAddress]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    for (const site of sites) {
      const point = pointForSite(site, locationById);
      if (!point) continue;
      const spec = specs.get(site.siteSpecificationId);
      const icon = siteIconFor(siteKindFromSpec(spec), site.status);
      // O selecionado cresce; o resto fica no tamanho base. Local é quadrado
      // arredondado, para não se confundir com o círculo dos equipamentos.
      const size = selectedSiteId === site.id ? SITE_ICON_SIZE + 8 : SITE_ICON_SIZE;
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lng: point[0], lat: point[1] },
        title: `${site.name} · ${icon.label}`,
        icon: {
          url: siteIconDataUrl(icon, { size }),
          scaledSize: new window.google.maps.Size(size, size),
          anchor: new window.google.maps.Point(size / 2, size / 2),
        },
        zIndex: selectedSiteId === site.id ? SITE_MARKER_Z + 1 : SITE_MARKER_Z,
      });
      marker.addListener('click', () => onSelectSite(site));
      markersRef.current.push(marker);
    }
  }, [locationById, mapsReady, onSelectSite, selectedSiteId, sites, specs]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !draftAddress) return;
    const [lng, lat] = draftAddress.coordinates;
    if (draftMarkerRef.current) draftMarkerRef.current.setMap(null);
    draftMarkerRef.current = new window.google.maps.Marker({
      map: mapRef.current,
      position: { lng, lat },
      title: draftAddress.label,
      label: '+',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: '#FFD200',
        fillOpacity: 1,
        strokeColor: '#243041',
        strokeWeight: 3,
        scale: 11,
      },
    });
    mapRef.current.panTo({ lng, lat });
  }, [draftAddress, mapsReady]);

  // Centralizar o mapa quando a hierarquia seleciona um item (Site ou recurso).
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !focusPoint) return;
    const [lng, lat] = focusPoint;
    mapRef.current.panTo({ lng, lat });
  }, [focusPoint, mapsReady]);

  // Renderizar equipamentos no mapa
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    equipmentMarkersRef.current.forEach((marker) => marker.setMap(null));
    equipmentMarkersRef.current = [];

    for (const equip of equipment) {
      // O place de um equipamento pode ser Site (dentro do CO/POP, C2), Location
      // (ponto de planta externa) ou Address — resolvePlacePoint cobre os três.
      const point = resolvePlacePoint(equip.place, directory);
      if (!point) continue;

      const [lng, lat] = point;
      // Mesmo glifo e mesma cor de família que a árvore de Locais usa.
      const icon = resourceIconFor(equip);

      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lng, lat },
        title: `${equip.name} · ${icon.label}`,
        icon: {
          url: resourceIconDataUrl(icon, { size: MARKER_ICON_SIZE }),
          scaledSize: new window.google.maps.Size(MARKER_ICON_SIZE, MARKER_ICON_SIZE),
          // Âncora no canto inferior-esquerdo do ícone: o equipamento fica acima e
          // à direita da coordenada, em vez de centrado nela. Um equipamento dentro
          // de um CO/PI compartilha a coordenada exata do site, e centrado ele ficaria
          // escondido atrás do pin do local.
          anchor: new window.google.maps.Point(0, MARKER_ICON_SIZE),
        },
        zIndex: EQUIPMENT_MARKER_Z,
      });
      marker.addListener('click', () => onSelectResource(equip));
      equipmentMarkersRef.current.push(marker);
    }
  }, [directory, equipment, mapsReady, onSelectResource]);

  // Renderizar a rota dos cabos. Um cabo não é um ponto: a Location dele é uma
  // LineString com o traçado real na rua, então vira polyline em vez de pin.
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    cableRoutesRef.current.forEach((line) => line.setMap(null));
    cableRoutesRef.current = [];

    for (const equip of equipment) {
      const route = resolvePlaceRoute(equip.place, directory);
      if (!route) continue;
      const icon = resourceIconFor(equip);

      const line = new window.google.maps.Polyline({
        map: mapRef.current,
        path: route.map(([lng, lat]) => ({ lng, lat })),
        strokeColor: icon.color,
        strokeOpacity: 0.9,
        strokeWeight: CABLE_STROKE_WEIGHT[icon.code] ?? 2.5,
        zIndex: CABLE_ROUTE_Z,
      });
      line.addListener('click', () => onSelectResource(equip));
      cableRoutesRef.current.push(line);
    }
  }, [directory, equipment, mapsReady, onSelectResource]);

  // Balão ancorado no item selecionado. Usa o InfoWindow nativo — é o que dá o
  // bico apontando para o pin, o auto-pan quando o balão nasce fora da tela e o
  // X de fechar que o usuário já espera do Google Maps.
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    if (!infoWindowRef.current) {
      infoWindowRef.current = new window.google.maps.InfoWindow();
      infoWindowRef.current.addListener('closeclick', () => closeBalloonRef.current());
    }
    const infoWindow = infoWindowRef.current;

    if (!balloon) {
      infoWindow.close();
      return;
    }

    const [lng, lat] = balloon.point;
    infoWindow.setContent(balloonNode);
    infoWindow.setOptions({
      pixelOffset: new window.google.maps.Size(balloon.offset[0], balloon.offset[1]),
    });
    infoWindow.setPosition({ lng, lat });
    infoWindow.open({ map: mapRef.current });
  }, [balloon, balloonNode, mapsReady]);

  useEffect(() => () => infoWindowRef.current?.close(), []);

  if (!GOOGLE_MAPS_KEY) {
    return <FallbackMap sites={sites} specs={specs} locationById={locationById} draftAddress={draftAddress} onSelectSite={onSelectSite} />;
  }

  return (
    <>
      <div ref={mapEl} className="absolute inset-0 h-full w-full" />
      {balloon ? createPortal(<MapBalloonCard balloon={balloon} />, balloonNode) : null}
    </>
  );
}

// Conteúdo do balão do mapa: identidade do item (tipo + nome + ícone), os campos
// que o identificam em campo e o atalho para o detalhe completo. O detalhe mora
// no módulo dono da entidade — aqui é só o cartão de visita.
function MapBalloonCard({ balloon }: { balloon: MapBalloon }) {
  return (
    <div className="w-[244px] pb-1 pl-1 pt-1">
      <div className="flex items-start gap-2.5 pr-5">
        <img src={balloon.iconUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
            {balloon.eyebrow}
          </div>
          <h3 className="font-display text-[1rem] font-semibold leading-tight text-app-text">{balloon.title}</h3>
        </div>
      </div>

      {balloon.rows.length ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-app-border pt-2.5">
          {balloon.rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-[0.72rem] text-app-muted">{label}</dt>
              <dd className="truncate text-[0.78rem] text-app-text" title={value}>
                {value}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}

      <button type="button" onClick={balloon.onAction} className="geo-btn primary mt-3 w-full justify-center">
        {balloon.actionLabel}
      </button>
    </div>
  );
}

function FallbackMap({
  sites,
  specs,
  locationById,
  draftAddress,
  onSelectSite,
}: {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  locationById: Map<string, GeoLocation>;
  draftAddress: DraftAddress | null;
  onSelectSite: (site: GeoSite) => void;
}) {
  return (
    <div className="absolute inset-0 h-full w-full bg-[linear-gradient(rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(215,222,232,0.72)_1px,transparent_1px),linear-gradient(135deg,#dce4ec,#f8fafc_46%,#e7eaf0)] bg-[length:36px_36px,36px_36px,auto]">
      <div className="absolute right-4 top-20 z-20 rounded-[18px] border border-app-border bg-white px-4 py-3 text-[0.84rem] text-app-muted shadow-soft">
        Configure <strong className="text-app-text">VITE_GOOGLE_MAPS_API_KEY</strong> para ativar Google Maps.
      </div>
      {sites.map((site, index) => {
        const point = pointForSite(site, locationById);
        if (!point) return null;
        const spec = specs.get(site.siteSpecificationId);
        const icon = siteIconFor(siteKindFromSpec(spec), site.status);
        return (
          <button
            key={site.id}
            type="button"
            onClick={() => onSelectSite(site)}
            title={`${site.name} · ${icon.label}`}
            className="absolute z-20 h-10 w-10 shadow-soft"
            style={{
              left: `${20 + (index % 6) * 10}%`,
              top: `${30 + (index % 4) * 12}%`,
            }}
          >
            <img src={siteIconDataUrl(icon, { size: 40 })} alt={site.name} className="h-10 w-10" />
          </button>
        );
      })}
      {draftAddress ? (
        <div className="absolute left-[54%] top-[52%] z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-app-text bg-app-accent font-bold shadow-soft">+</div>
      ) : null}
    </div>
  );
}

function GoogleAutocompleteBridge({ onAddress }: { onAddress: (address: DraftAddress) => void }) {
  useEffect(() => {
    const input = document.getElementById('geo-search-input') as HTMLInputElement | null;
    if (!GOOGLE_MAPS_KEY || !input) return;
    void loadGoogleMaps(GOOGLE_MAPS_KEY).then(() => {
      const autocomplete = new window.google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'br' },
        fields: ['address_components', 'formatted_address', 'geometry', 'name'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) return;
        onAddress(addressFromGooglePlace(place));
      });
    });
  }, [onAddress]);

  return null;
}

// Cartão flutuante de detalhe de um recurso (Equipamento/Cabo) selecionado na
// hierarquia. Recursos completos vivem no módulo Resource — aqui só o resumo +
// atalho, preservando a fronteira Geo × Resource.
function ResourceDetailCard({
  instance,
  onClose,
  onOpenResource,
}: {
  instance: HierInstance;
  onClose: () => void;
  onOpenResource: () => void;
}) {
  return (
    <div className="absolute right-5 top-5 z-30 w-[280px] rounded-[18px] border border-app-border bg-white p-4 shadow-modal">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{instance.entity}</div>
          <h3 className="mt-0.5 font-display text-[1.05rem] font-semibold text-app-text">{instance.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-app-muted hover:bg-app-accent-soft"
          aria-label="Fechar detalhe"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenResource}
        className="geo-btn primary mt-3 w-full justify-center"
      >
        Abrir no módulo Recursos
      </button>
    </div>
  );
}


function SiteDetailModal({
  site,
  tab,
  childSites,
  sites,
  specById,
  siteById,
  addressById,
  locationById,
  events,
  onTab,
  onClose,
  onChanged,
  onCreateSubSite,
}: {
  site: GeoSite;
  tab: DetailTab;
  childSites: GeoSite[];
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  siteById: Map<string, GeoSite>;
  addressById: Map<string, GeoAddress>;
  locationById: Map<string, GeoLocation>;
  events: GeoEvent[];
  onTab: (tab: DetailTab) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onCreateSubSite: () => void;
}) {
  const spec = specById.get(site.siteSpecificationId);
  const address = site.address ? addressById.get(site.address.id) : undefined;
  const point = pointForSite(site, locationById);
  const [relationshipTarget, setRelationshipTarget] = useState('');
  const [relationshipType, setRelationshipType] = useState('fedBy');
  const [nextStatus, setNextStatus] = useState<GeoStatus>(site.status);

  const addRelationship = async () => {
    if (!relationshipTarget || !relationshipType.trim()) return;
    await postJson(`/v1/geo/sites/${site.id}/relationships`, {
      relatedSiteId: relationshipTarget,
      relationshipType,
    });
    await onChanged();
  };

  const changeStatus = async () => {
    await patchJson(`/v1/geo/sites/${site.id}`, { status: nextStatus });
    await onChanged();
  };

  return (
    <Modal onClose={onClose} title={site.name} eyebrow={`Site · ${spec?.name ?? 'Tipo nao informado'}`} wide>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-app-border pb-3">
        {[
          ['overview', 'Visao geral'],
          ['subsites', 'Sub-sites'],
          ['topology', 'Topologia'],
          ['lifecycle', 'Ciclo de vida'],
          ['resources', 'Recursos'],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => onTab(id as DetailTab)} className={`rounded-[999px] px-3 py-2 text-[0.82rem] font-semibold ${tab === id ? 'bg-app-accent text-app-text' : 'bg-app-accent-soft text-app-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Tipo" value={`${spec?.name ?? '-'} · ${spec?.category ?? '-'}`} />
          <Info label="Status" value={statusLabel[site.status]} />
          <Info label="Endereço" value={address ? formatAddress(address) : 'Sem endereço'} />
          <Info label="Localização" value={point ? `[${point[0].toFixed(5)}, ${point[1].toFixed(5)}]` : 'Não localizado'} />
          <Info label="ParentSite" value={site.parentSite ? siteById.get(site.parentSite.id)?.name ?? site.parentSite.id : 'Nenhum'} />
          <Info label="ID" value={site.id} mono />
        </div>
      ) : null}

      {tab === 'subsites' ? (
        <div>
          <div className="mb-3 flex justify-between gap-3">
            <div className="text-[0.88rem] text-app-muted">Contenção física via site pai.</div>
            <button type="button" className="geo-btn primary" onClick={onCreateSubSite}><Plus className="h-4 w-4" />Adicionar sub-site</button>
          </div>
          <SimpleRows rows={childSites.map((child) => [child.name, specById.get(child.siteSpecificationId)?.name ?? '-', statusLabel[child.status]])} empty="Este site ainda não possui sub-sites." />
        </div>
      ) : null}

      {tab === 'topology' ? (
        <div className="grid gap-4">
          <SimpleRows rows={site.relatedSite.map((rel) => [relationshipTypeLabel(rel.relationshipType), siteById.get(rel.id)?.name ?? rel.id, rel.id])} empty="Sem relações topológicas." />
          <div className="grid gap-3 rounded-[18px] border border-app-border p-4 md:grid-cols-[1fr_1fr_auto]">
            <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)} className="geo-input">
              {['fedBy', 'feeds', 'nearby', 'contains'].map((value) => <option key={value} value={value}>{relationshipTypeLabel(value)}</option>)}
            </select>
            <select value={relationshipTarget} onChange={(event) => setRelationshipTarget(event.target.value)} className="geo-input">
              <option value="">Site relacionado</option>
              {sites.filter((item) => item.id !== site.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="button" className="geo-btn primary justify-center" onClick={() => void addRelationship()}>Adicionar</button>
          </div>
        </div>
      ) : null}

      {tab === 'lifecycle' ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-[18px] border border-app-border p-4 md:grid-cols-[1fr_auto]">
            <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as GeoStatus)} className="geo-input">
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="geo-btn primary justify-center" onClick={() => void changeStatus()}>Mudar status</button>
          </div>
          <SimpleRows rows={events.map((event) => [new Date(event.eventTime).toLocaleString('pt-BR'), event.eventType, event.source])} empty="Sem eventos registrados." />
        </div>
      ) : null}

      {tab === 'resources' ? (
        <div className="rounded-[18px] border border-app-border bg-app-accent-soft p-4 text-[0.9rem] text-app-muted">
          Recursos fisicos sao gerenciados pelo modulo Resource (TMF634/639). Esta aba mostra apenas o resumo referencial para preservar a fronteira Geo x Resource.
        </div>
      ) : null}
    </Modal>
  );
}

function TypeManagementModal({ specs, onClose, onChanged }: { specs: GeoSpec[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GeoSpec['category']>('Site');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await postJson('/v1/geo/site-specifications', { name, category });
      setName('');
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Tipos de Site" eyebrow="Catalogo">
      <div className="mb-4 max-h-[260px] overflow-auto rounded-[18px] border border-app-border">
        <table className="w-full border-collapse text-left">
          <thead><tr><Th>Nome</Th><Th>Categoria</Th><Th>Filhos permitidos</Th></tr></thead>
          <tbody>
            {specs.map((spec) => (
              <tr key={spec.id} className="border-t border-app-border">
                <td className="px-4 py-3 text-[0.88rem] font-semibold text-app-text">{spec.name}</td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">{spec.category}</td>
                <td className="px-4 py-3 text-[0.84rem] text-app-muted">{spec.allowedChildSpecIds.length || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="geo-input" placeholder="ex: Central Office" />
        <select value={category} onChange={(event) => setCategory(event.target.value as GeoSpec['category'])} className="geo-input">
          {['Region', 'FunctionalGroup', 'Site', 'SubSite'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="submit" className="geo-btn primary justify-center" disabled={saving || !name.trim()}>Criar</button>
      </form>
    </Modal>
  );
}

function Modal({ children, title, eyebrow, onClose, wide }: { children: ReactNode; title: string; eyebrow: string; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6">
      <div className={`max-h-[90vh] overflow-auto rounded-[26px] border border-app-border bg-white p-5 shadow-modal ${wide ? 'w-full max-w-[920px]' : 'w-full max-w-[720px]'}`}>
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{eyebrow}</div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ModalFooter({ onClose, primaryLabel, disabled }: { onClose: () => void; primaryLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-3 border-t border-app-border pt-4">
      <button type="button" onClick={onClose} className="geo-btn secondary">Cancelar</button>
      <button type="submit" disabled={disabled} className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60">{primaryLabel}</button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">{label}{children}</label>;
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[18px] border border-app-border p-4">
      <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{label}</div>
      <div className={`mt-1 text-[0.9rem] text-app-text ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function SimpleRows({ rows, empty }: { rows: string[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">{empty}</div>;
  return (
    <div className="overflow-auto rounded-[18px] border border-app-border">
      <table className="w-full border-collapse text-left">
        <tbody>{rows.map((row) => <tr key={row.join('|')} className="border-b border-app-border last:border-b-0">{row.map((cell, index) => <td key={`${cell}-${index}`} className="px-4 py-3 text-[0.86rem] text-app-muted first:font-semibold first:text-app-text">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-app-border px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{children}</th>;
}

function pointForSite(site: GeoSite, locations: Map<string, GeoLocation>): [number, number] | null {
  const location = site.place ? locations.get(site.place.id) : undefined;
  if (!location || location.geometry.type !== 'Point') return null;
  return location.geometry.coordinates;
}


function isParentAllowed(child?: GeoSpec, parent?: GeoSpec): boolean {
  if (!child || !parent) return true;
  if (child.allowedParentSpecIds.length > 0 && !child.allowedParentSpecIds.includes(parent.id)) return false;
  if (parent.allowedChildSpecIds.length > 0 && !parent.allowedChildSpecIds.includes(child.id)) return false;
  return true;
}


function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__nexusGoogleMapsPromise) return window.__nexusGoogleMapsPromise;

  window.__nexusGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Maps.'));
    document.head.appendChild(script);
  });

  return window.__nexusGoogleMapsPromise;
}

async function reverseGeocode(lat: number, lng: number): Promise<DraftAddress | null> {
  if (!window.google?.maps) return null;
  const geocoder = new window.google.maps.Geocoder();
  const result = await geocoder.geocode({ location: { lat, lng } });
  const place = result.results?.[0];
  if (!place) return null;
  return addressFromGooglePlace({
    formatted_address: place.formatted_address,
    address_components: place.address_components,
    geometry: { location: { lat: () => lat, lng: () => lng } },
  });
}

// Geocodifica um texto livre (endereço digitado) em um DraftAddress posicionável no mapa.
async function geocodeAddress(query: string): Promise<DraftAddress | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  await loadGoogleMaps(GOOGLE_MAPS_KEY);
  if (!window.google?.maps) return null;
  const geocoder = new window.google.maps.Geocoder();
  const result = await geocoder.geocode({
    address: query,
    componentRestrictions: { country: 'br' },
  }).catch(() => null);
  const place = result?.results?.[0];
  if (!place) return null;
  const location = place.geometry?.location;
  return addressFromGooglePlace({
    formatted_address: place.formatted_address,
    address_components: place.address_components,
    name: query,
    geometry: { location: { lat: () => location.lat(), lng: () => location.lng() } },
  });
}

function addressFromGooglePlace(place: any): DraftAddress {
  const components = place.address_components ?? [];
  const get = (type: string, short = false) => {
    const component = components.find((item: any) => item.types?.includes(type));
    return short ? component?.short_name : component?.long_name;
  };
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  const route = get('route') ?? place.name ?? 'Endereco selecionado';
  const streetNr = get('street_number');
  const city = get('administrative_area_level_2') ?? get('locality');
  const state = get('administrative_area_level_1', true);
  const postcode = get('postal_code');
  return {
    street: route,
    streetNr,
    city,
    stateOrProvince: state,
    postcode,
    country: get('country', true) ?? 'BR',
    coordinates: [lng, lat],
    label: place.formatted_address ?? [route, streetNr, city, state].filter(Boolean).join(', '),
  };
}
