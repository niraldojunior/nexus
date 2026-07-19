import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import { siteKindFromSpec, formatAddress, buildGeoDirectory } from '../utils/placeLabel';
import { buildLocationHierarchy, type HierInstance } from '../utils/geoHierarchy';
import { useResourceInventory, identifyEquipmentType, equipmentTypeColor, equipmentTypeLabel } from '../hooks/useEquipmentInventory';
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

const API_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') ?? 'change-me'}`,
});

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const DEFAULT_CENTER = { lat: -22.9068, lng: -43.1075 };

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

  const { physical, located, loading: resourcesLoading } = useResourceInventory();
  const { navParams, clearNav, goToResource } = useNavigation();

  const locationById = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const addressById = useMemo(() => new Map(addresses.map((item) => [item.id, item])), [addresses]);
  const specById = useMemo(() => new Map(specs.map((item) => [item.id, item])), [specs]);
  const siteById = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;
  const [searching, setSearching] = useState(false);

  // Equipamentos posicionáveis no mapa (PhysicalResource com place).
  const inventoryEquipment = useMemo(() => physical.filter((item) => item.place?.id).slice(0, 500), [physical]);

  // Diretório Geo + hierarquia de navegação (UF → Município → … → instância).
  const directory = useMemo(
    () => buildGeoDirectory(sites, addresses, locations, specs),
    [sites, addresses, locations, specs],
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
        const layer = siteKindFromSpec(spec);
        const hasPoint = Boolean(pointForSite(site, locationById));
        return (layer !== 'Site' && layers.has(layer)) || (!hasPoint && layers.has('Sem coordenada'));
      }),
    [layers, locationById, sites, specById],
  );

  const childSites = selectedSite ? sites.filter((site) => site.parentSite?.id === selectedSite.id) : [];

  const selectSite = (site: GeoSite) => {
    setSelectedSiteId(site.id);
    setSelectedResource(null);
    setDraftAddress(null);
    const point = pointForSite(site, locationById);
    if (point) setFocusPoint(point);
  };

  const openDetail = (site: GeoSite, tab: DetailTab = 'overview') => {
    selectSite(site);
    setDetailTab(tab);
    setDetailOpen(true);
  };

  // Seleção vinda da sidebar de hierarquia (árvore ou combos).
  // Local → seleciona + abre detalhe do Site; Equipamento/Cabo → seleciona,
  // centraliza no mapa e abre o cartão de detalhe do recurso.
  const selectInstance = (instance: HierInstance) => {
    if (instance.referredType === 'GeographicSite') {
      const site = siteById.get(instance.id);
      if (site) openDetail(site);
      return;
    }
    setSelectedResource(instance);
    setSelectedSiteId(null);
    if (instance.placeId) {
      const location = locationById.get(instance.placeId);
      if (location?.geometry.type === 'Point') setFocusPoint(location.geometry.coordinates);
    }
  };

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
          selectedSiteId={selectedSiteId}
          draftAddress={draftAddress}
          focusPoint={focusPoint}
          onSelectSite={selectSite}
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

        {selectedResource ? (
          <ResourceDetailCard
            instance={selectedResource}
            onClose={() => setSelectedResource(null)}
            onOpenResource={() => goToResource(selectedResource.id)}
          />
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
  selectedSiteId,
  draftAddress,
  focusPoint,
  onSelectSite,
  onDraftAddress,
  equipment = [],
}: {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  locationById: Map<string, GeoLocation>;
  selectedSiteId: string | null;
  draftAddress: DraftAddress | null;
  focusPoint?: [number, number] | null;
  onSelectSite: (site: GeoSite) => void;
  onDraftAddress: (address: DraftAddress) => void;
  equipment?: any[];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const equipmentMarkersRef = useRef<any[]>([]);
  const draftMarkerRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);

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
        });
        mapRef.current.addListener('click', (event: any) => {
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
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lng: point[0], lat: point[1] },
        title: site.name,
        label: markerLabel(siteKindFromSpec(spec)),
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: markerColor(site, spec),
          fillOpacity: 1,
          strokeColor: selectedSiteId === site.id ? '#243041' : '#ffffff',
          strokeWeight: selectedSiteId === site.id ? 4 : 2,
          scale: selectedSiteId === site.id ? 12 : 9,
        },
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
      if (!equip.place?.id) continue;
      // Para equipamentos, assumir que place.id é uma location (não site)
      const location = locationById.get(equip.place.id);
      if (!location?.geometry?.coordinates) continue;

      const [lng, lat] = location.geometry.coordinates;
      const type = identifyEquipmentType(equip);
      const color = equipmentTypeColor[type] || '#6B7280';
      const label = equipmentTypeLabel[type] || '?';

      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lng, lat },
        title: equip.name,
        label,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 7,
        },
      });
      equipmentMarkersRef.current.push(marker);
    }
  }, [equipment, locationById, mapsReady]);

  if (!GOOGLE_MAPS_KEY) {
    return <FallbackMap sites={sites} specs={specs} locationById={locationById} draftAddress={draftAddress} onSelectSite={onSelectSite} />;
  }

  return <div ref={mapEl} className="absolute inset-0 h-full w-full" />;
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
        return (
          <button
            key={site.id}
            type="button"
            onClick={() => onSelectSite(site)}
            className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-white text-[0.72rem] font-bold shadow-soft"
            style={{
              left: `${20 + (index % 6) * 10}%`,
              top: `${30 + (index % 4) * 12}%`,
              background: markerColor(site, spec),
              color: '#243041',
            }}
          >
            {markerLabel(siteKindFromSpec(spec))}
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


// Converter tipo de site (SiteKind) para rótulo de marker no Google Maps.
function markerLabel(kind: ReturnType<typeof siteKindFromSpec>): string {
  const labels: Record<string, string> = {
    CO: 'CO',
    POP: 'P',
    CTO: 'CT',
    PI: 'PI',
    REGION: 'R',
    SUBSITE: 'S',
    SITE: 'S',
  };
  return labels[kind] ?? 'S';
}

// Colorir o marker no mapa por tipo de site + status.
function markerColor(site: GeoSite, spec?: GeoSpec): string {
  if (site.status === 'terminated') return '#9CA3AF';
  if (site.status === 'suspended') return '#F59E0B';
  if (site.status === 'planned') return '#9B59B6';
  const kind = siteKindFromSpec(spec);
  const colors: Record<string, string> = {
    CO: '#9B59B6',
    POP: '#004E89',
    CTO: '#1A9E7D',
    PI: '#8B7500',
    REGION: '#5A5A5A',
    SUBSITE: '#5A5A5A',
    SITE: '#FFD200',
  };
  return colors[kind] ?? '#FFD200';
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
