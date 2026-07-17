import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  ChevronRight,
  Layers,
  MapPin,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';

declare global {
  interface Window {
    google?: any;
    __nexusGoogleMapsPromise?: Promise<void>;
  }
}

type GeoStatus = 'planned' | 'active' | 'suspended' | 'terminated';
type GeoGeometry = { type: 'Point'; coordinates: [number, number] };

type GeoLocation = {
  '@type': 'GeographicLocation';
  id: string;
  href: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoGeometry | { type: 'LineString'; coordinates: Array<[number, number]> } | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
  spatialRef: string;
};

type GeoAddress = {
  '@type': 'GeographicAddress';
  id: string;
  href: string;
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country?: string;
  geographicLocationId?: string;
  place?: { id: string; '@referredType': 'GeographicLocation' };
};

type GeoSpec = {
  '@type': 'GeographicSiteSpecification';
  id: string;
  href: string;
  name: string;
  category: 'Region' | 'FunctionalGroup' | 'Site' | 'SubSite';
  allowedParentSpecIds: string[];
  allowedChildSpecIds: string[];
};

type RelatedSite = {
  id: string;
  relationshipType: string;
  '@referredType': 'GeographicSite';
};

type GeoSite = {
  '@type': 'GeographicSite';
  id: string;
  href: string;
  name: string;
  status: GeoStatus;
  siteSpecificationId: string;
  siteSpecification: { id: string; '@referredType': 'GeographicSiteSpecification' };
  place?: { id: string; '@referredType': 'GeographicLocation' };
  address?: { id: string; '@referredType': 'GeographicAddress' };
  parentSite?: { id: string; '@referredType': 'GeographicSite' };
  relatedSite: RelatedSite[];
  relatedParty: Array<{ id: string; role?: string; '@referredType': 'Party' }>;
  characteristic: Array<{ group?: string; name: string; value: unknown; valueType?: string }>;
};

type GeoEvent = {
  '@type': 'Event';
  id: string;
  eventType: string;
  eventTime: string;
  source: string;
  eventData: Record<string, unknown>;
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

const layerOptions = ['CO', 'POP', 'CTO', 'PI', 'Relacoes', 'Sem coordenada'] as const;
type LayerKey = (typeof layerOptions)[number];
type SiteLayer = LayerKey | 'Site';
type SiteCountKey = SiteLayer | 'Sem coordenada';

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
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [layers, setLayers] = useState<Set<LayerKey>>(() => new Set(layerOptions));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locationById = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const addressById = useMemo(() => new Map(addresses.map((item) => [item.id, item])), [addresses]);
  const specById = useMemo(() => new Map(specs.map((item) => [item.id, item])), [specs]);
  const siteById = useMemo(() => new Map(sites.map((item) => [item.id, item])), [sites]);
  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) ?? null : null;
  const hasQuery = query.trim().length > 0;

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

  const visibleSites = useMemo(
    () =>
      sites.filter((site) => {
        const spec = specById.get(site.siteSpecificationId);
        const layer = layerForSpec(spec);
        const hasPoint = Boolean(pointForSite(site, locationById));
        return (layer !== 'Site' && layers.has(layer)) || (!hasPoint && layers.has('Sem coordenada'));
      }),
    [layers, locationById, sites, specById],
  );

  const searchedSites = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sites.slice(0, 7);
    return sites
      .filter((site) => {
        const spec = specById.get(site.siteSpecificationId);
        const address = site.address ? addressById.get(site.address.id) : undefined;
        return [site.name, spec?.name, address?.street, address?.city]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .slice(0, 7);
  }, [addressById, query, sites, specById]);

  const missingPlace = sites.filter((site) => !pointForSite(site, locationById));
  const childSites = selectedSite ? sites.filter((site) => site.parentSite?.id === selectedSite.id) : [];
  const siteCounts = useMemo(() => {
    const counts: Record<SiteCountKey, number> = {
      CO: 0,
      POP: 0,
      CTO: 0,
      PI: 0,
      Relacoes: 0,
      'Sem coordenada': 0,
      Site: 0,
    };

    for (const site of sites) {
      const spec = specById.get(site.siteSpecificationId);
      const layer = layerForSpec(spec);
      counts[layer] = (counts[layer] ?? 0) + 1;
      if (!pointForSite(site, locationById)) counts['Sem coordenada'] += 1;
    }

    return counts;
  }, [locationById, sites, specById]);

  const selectSite = (site: GeoSite) => {
    setSelectedSiteId(site.id);
    setDraftAddress(null);
    setLayerPanelOpen(false);
  };

  const openDetail = (site: GeoSite, tab: DetailTab = 'overview') => {
    selectSite(site);
    setDetailTab(tab);
    setDetailOpen(true);
    setLayerPanelOpen(false);
  };

  const toggleLayer = (layer: LayerKey) => {
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-transparent">
      <main
        className={`relative h-full min-h-0 min-w-0 overflow-hidden bg-[#eef2f6] transition-[padding-right] duration-200 ${
          hierarchyOpen ? 'xl:pr-[360px]' : 'xl:pr-0'
        }`}
      >
        {error ? (
          <div className="absolute left-5 top-5 z-40 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[0.88rem] text-red-700 shadow-soft">
            {error}
          </div>
        ) : null}

        <GoogleMapPanel
          sites={visibleSites}
          specs={specById}
          locationById={locationById}
          selectedSiteId={selectedSiteId}
          draftAddress={draftAddress}
          onSelectSite={selectSite}
          onDraftAddress={setDraftAddress}
        />

        <div className="absolute left-5 top-5 z-30 flex max-w-[calc(100%-2.5rem)] flex-wrap items-start gap-3">
          <div className="relative min-w-[320px] flex-[1_1_620px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-14 w-full rounded-[24px] border border-app-border bg-white pl-11 pr-4 text-[0.95rem] text-app-text shadow-soft"
              placeholder="Buscar endereco ou site"
              id="geo-search-input"
            />
            <GoogleAutocompleteBridge onAddress={setDraftAddress} />
            {hasQuery ? (
              <div className="absolute left-0 right-0 top-[62px] z-40 max-h-[320px] overflow-auto rounded-[22px] border border-app-border bg-white p-2 shadow-modal">
                {searchedSites.length ? searchedSites.map((site) => {
                  const spec = specById.get(site.siteSpecificationId);
                  const address = site.address ? addressById.get(site.address.id) : undefined;
                  return (
                    <button
                      key={site.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2 text-left transition hover:bg-app-accent-soft"
                      onClick={() => selectSite(site)}
                    >
                      <SiteIcon layer={layerForSpec(spec)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.92rem] font-semibold text-app-text">{site.name}</span>
                        <span className="block truncate text-[0.78rem] text-app-muted">{address ? formatAddress(address) : 'Sem endereco associado'}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-app-muted" />
                    </button>
                  );
                }) : (
                  <div className="px-3 py-4 text-[0.86rem] text-app-muted">Nenhum site encontrado.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 rounded-[24px] border border-app-border bg-white px-2 py-2 shadow-soft">
            <ToolButton
              icon={Plus}
              label="Criar site"
              onClick={() => {
                setLayerPanelOpen(false);
                setCreateOpen(true);
              }}
              active={createOpen}
            />
            <ToolButton
              icon={Layers}
              label="Tipos de site"
              onClick={() => {
                setLayerPanelOpen((current) => !current);
              }}
              active={layerPanelOpen}
            />
            <ToolButton
              icon={RefreshCw}
              label="Atualizar dados"
              onClick={() => void loadGeo()}
            />
          </div>
        </div>

        {layerPanelOpen ? (
          <div className="absolute left-5 top-[92px] z-40 w-[280px] rounded-[22px] border border-app-border bg-white p-4 shadow-modal">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Tipos de site</div>
            <div className="mt-3 grid gap-2">
              {layerOptions.map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => toggleLayer(layer)}
                  className={`flex items-center justify-between rounded-[16px] border px-3 py-2 text-left text-[0.86rem] font-semibold transition ${
                    layers.has(layer)
                      ? 'border-app-accent-border bg-app-accent-soft text-app-text'
                      : 'border-app-border bg-white text-app-muted hover:bg-app-accent-soft'
                  }`}
                >
                  <span>{layer}</span>
                  <StatusPill tone={layers.has(layer) ? 'blue' : 'amber'}>{layers.has(layer) ? 'Visivel' : 'Oculto'}</StatusPill>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <FloatingPanel
          selectedSite={selectedSite}
          draftAddress={draftAddress}
          addressById={addressById}
          locationById={locationById}
          specById={specById}
          siteById={siteById}
          onClose={() => {
            setDraftAddress(null);
            setSelectedSiteId(null);
          }}
          onCreate={() => setCreateOpen(true)}
          onOpenDetail={openDetail}
        />

        {loading ? (
          <div className="absolute right-5 bottom-5 z-30 rounded-[18px] border border-app-border bg-white/90 px-4 py-3 text-[0.84rem] font-medium text-app-muted shadow-soft backdrop-blur">
            Carregando dados Geo...
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setHierarchyOpen((current) => !current)}
          className="absolute right-5 top-5 z-[60] rounded-[18px] border border-app-border bg-white px-3 py-2 text-[0.82rem] font-semibold text-app-text shadow-soft hover:border-app-accent-border hover:bg-app-accent-soft"
        >
          {hierarchyOpen ? 'Fechar hierarquia' : 'Abrir hierarquia'}
        </button>
      </main>

      <GeoHierarchySidebar
        open={hierarchyOpen}
        sites={sites}
        missingPlace={missingPlace}
        siteCounts={siteCounts}
        specs={specById}
        selectedSiteId={selectedSiteId}
        onSelect={selectSite}
        onOpenDetail={openDetail}
        onOpenTypes={() => setTypeOpen(true)}
        onReload={() => void loadGeo()}
        onClose={() => setHierarchyOpen(false)}
        onToggle={() => setHierarchyOpen((current) => !current)}
      />

      {createOpen ? (
        <CreateSiteModal
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
  onSelectSite,
  onDraftAddress,
}: {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  locationById: Map<string, GeoLocation>;
  selectedSiteId: string | null;
  draftAddress: DraftAddress | null;
  onSelectSite: (site: GeoSite) => void;
  onDraftAddress: (address: DraftAddress) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
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
        label: markerLabel(layerForSpec(spec)),
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
            {markerLabel(layerForSpec(spec))}
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

function FloatingPanel({
  selectedSite,
  draftAddress,
  addressById,
  locationById,
  specById,
  siteById,
  onClose,
  onCreate,
  onOpenDetail,
}: {
  selectedSite: GeoSite | null;
  draftAddress: DraftAddress | null;
  addressById: Map<string, GeoAddress>;
  locationById: Map<string, GeoLocation>;
  specById: Map<string, GeoSpec>;
  siteById: Map<string, GeoSite>;
  onClose: () => void;
  onCreate: () => void;
  onOpenDetail: (site: GeoSite) => void;
}) {
  if (!selectedSite && !draftAddress) return null;

  const address = selectedSite?.address ? addressById.get(selectedSite.address.id) : undefined;
  const location = selectedSite ? pointForSite(selectedSite, locationById) : draftAddress?.coordinates;
  const spec = selectedSite ? specById.get(selectedSite.siteSpecificationId) : undefined;

  return (
    <div className="absolute right-5 top-24 z-40 w-[360px] rounded-[24px] border border-app-border bg-white p-4 shadow-modal">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Endereco</div>
          <div className="mt-1 text-[0.98rem] font-semibold text-app-text">{draftAddress?.label ?? (address ? formatAddress(address) : 'Sem endereco')}</div>
          {location ? <div className="mt-1 font-mono text-[0.74rem] text-app-muted">[{location[0].toFixed(5)}, {location[1].toFixed(5)}]</div> : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft">
          <X className="h-4 w-4" />
        </button>
      </div>

      {selectedSite ? (
        <button type="button" onClick={() => onOpenDetail(selectedSite)} className="w-full rounded-[18px] border border-app-border p-3 text-left hover:bg-app-accent-soft">
          <div className="flex items-center gap-3">
            <SiteIcon layer={layerForSpec(spec)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.95rem] font-semibold text-app-text">{selectedSite.name}</div>
              <div className="text-[0.78rem] text-app-muted">{spec?.name ?? 'Tipo nao informado'} · {statusLabel[selectedSite.status]}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-app-muted" />
          </div>
        </button>
      ) : (
        <div className="rounded-[18px] border border-dashed border-app-border p-4 text-center">
          <div className="text-[0.9rem] font-semibold text-app-text">Nenhum site cadastrado neste endereco.</div>
          <button type="button" onClick={onCreate} className="geo-btn primary mt-3 w-full justify-center">
            <Plus className="h-4 w-4" />
            Criar Site aqui
          </button>
        </div>
      )}

      {selectedSite?.relatedSite.length ? (
        <div className="mt-3 grid gap-2">
          {selectedSite.relatedSite.map((relationship) => (
            <div key={`${relationship.relationshipType}-${relationship.id}`} className="rounded-[14px] bg-app-accent-soft px-3 py-2 text-[0.82rem] text-app-muted">
              <strong className="text-app-text">{relationship.relationshipType}</strong> {siteById.get(relationship.id)?.name ?? relationship.id}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GeoHierarchySidebar({
  open,
  sites,
  missingPlace,
  siteCounts,
  specs,
  selectedSiteId,
  onSelect,
  onOpenDetail,
  onOpenTypes,
  onReload,
  onClose,
  onToggle,
}: {
  open: boolean;
  sites: GeoSite[];
  missingPlace: GeoSite[];
  siteCounts: Record<string, number>;
  specs: Map<string, GeoSpec>;
  selectedSiteId: string | null;
  onSelect: (site: GeoSite) => void;
  onOpenDetail: (site: GeoSite, tab?: DetailTab) => void;
  onOpenTypes: () => void;
  onReload: () => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={onToggle}
          className="fixed right-0 top-1/2 z-[70] -translate-y-1/2 rounded-l-[18px] border border-app-border border-r-0 bg-white px-3 py-4 text-[0.78rem] font-semibold text-app-text shadow-soft transition hover:border-app-accent-border hover:bg-app-accent-soft"
          aria-label="Abrir hierarquia"
        >
          {'<'}
        </button>
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-[65] flex h-screen w-[360px] max-w-[92vw] flex-col border-l border-app-border bg-white shadow-modal transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b border-app-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Rede V.tal</div>
            <h2 className="mt-1 font-display text-[1.15rem] font-semibold text-app-text">Hierarquia de sites</h2>
          </div>
          <div className="flex items-center gap-2">
            <ToolButton icon={RefreshCw} label="Atualizar dados" onClick={onReload} />
            <ToolButton icon={Settings} label="Tipos de site" onClick={onOpenTypes} />
            <ToolButton icon={X} label="Fechar hierarquia" onClick={onClose} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <SummaryChip label="Sites" value={sites.length} />
          <SummaryChip label="Sem coord." value={missingPlace.length} tone="amber" />
          <SummaryChip label="CO" value={siteCounts.CO ?? 0} />
          <SummaryChip label="POP" value={siteCounts.POP ?? 0} />
          <SummaryChip label="CTO" value={siteCounts.CTO ?? 0} />
          <SummaryChip label="PI" value={siteCounts.PI ?? 0} />
        </div>
      </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <HierarchyTree
            sites={sites}
            specs={specs}
            selectedSiteId={selectedSiteId}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
          />
        </div>

        <div className="border-t border-app-border px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">Sem coordenada</div>
            <StatusPill tone="amber">{missingPlace.length}</StatusPill>
          </div>
          <div className="grid max-h-[180px] gap-2 overflow-auto">
            {missingPlace.length ? missingPlace.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => onSelect(site)}
                className={`rounded-[16px] border px-3 py-2 text-left transition ${
                  selectedSiteId === site.id
                    ? 'border-app-accent-border bg-app-accent-soft'
                    : 'border-app-border hover:bg-app-accent-soft'
                }`}
              >
                <span className="block text-[0.86rem] font-semibold text-app-text">{site.name}</span>
                <span className="block text-[0.74rem] text-app-muted">Sem place associado</span>
              </button>
            )) : (
              <div className="rounded-[16px] border border-dashed border-app-border px-3 py-3 text-[0.84rem] text-app-muted">
                Todas as entidades carregadas possuem place.
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-[18px] border transition ${
        active
          ? 'border-app-accent-border bg-app-accent-soft text-app-text'
          : 'border-app-border bg-white text-app-text hover:border-app-accent-border hover:bg-app-accent-soft'
      }`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SummaryChip({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'amber' }) {
  return (
    <div className="rounded-[18px] border border-app-border bg-app-panel px-3 py-2">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{label}</div>
      <div className={`mt-1 font-display text-[1.15rem] font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-app-text'}`}>{value}</div>
    </div>
  );
}

function CreateSiteModal({
  draftAddress,
  selectedSite,
  specs,
  sites,
  specById,
  addressById,
  locationById,
  onClose,
  onCreated,
}: {
  draftAddress: DraftAddress | null;
  selectedSite: GeoSite | null;
  specs: GeoSpec[];
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  addressById: Map<string, GeoAddress>;
  locationById: Map<string, GeoLocation>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [siteSpecificationId, setSiteSpecificationId] = useState(specs[0]?.id ?? '');
  const [name, setName] = useState(draftAddress ? `Site - ${draftAddress.street}` : '');
  const [status, setStatus] = useState<GeoStatus>('planned');
  const [parentSiteId, setParentSiteId] = useState(selectedSite?.id ?? '');
  const [fedBySiteId, setFedBySiteId] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedSpec = specById.get(siteSpecificationId);

  const parentOptions = useMemo(
    () => sites.filter((site) => isParentAllowed(selectedSpec, specById.get(site.siteSpecificationId))),
    [selectedSpec, sites, specById],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!siteSpecificationId || !name.trim()) return;
    setSaving(true);
    try {
      if (draftAddress) {
        await postJson('/v1/geo/workspace/site-at-address', {
          location: {
            geometryType: 'Point',
            geometry: { type: 'Point', coordinates: draftAddress.coordinates },
            spatialRef: 'EPSG:4326',
            accuracy: 'GOOGLE_MAPS',
          },
          address: {
            street: draftAddress.street,
            streetNr: draftAddress.streetNr,
            city: draftAddress.city,
            stateOrProvince: draftAddress.stateOrProvince,
            postcode: draftAddress.postcode,
            country: draftAddress.country,
          },
          site: {
            name,
            status,
            siteSpecificationId,
            parentSiteId: parentSiteId || undefined,
          },
          fedBySiteId: fedBySiteId || undefined,
          fedByRelationshipType: fedBySiteId ? 'fedBy' : undefined,
        });
      } else {
        const inheritedAddress = selectedSite?.address ? addressById.get(selectedSite.address.id) : undefined;
        const inheritedLocation = selectedSite ? pointForSite(selectedSite, locationById) : undefined;
        await postJson('/v1/geo/sites', {
          name,
          status,
          siteSpecificationId,
          parentSiteId: parentSiteId || undefined,
          addressId: inheritedAddress?.id,
          placeId: selectedSite?.place?.id ?? (inheritedLocation ? undefined : undefined),
        });
      }
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Criar site neste endereco" eyebrow="Novo Site">
      <form onSubmit={submit}>
        <div className="mb-4 rounded-[18px] bg-app-accent-soft p-4 text-[0.86rem] text-app-muted">
          <strong className="text-app-text">Address + Location</strong> serao criados ou herdados sem telas proprias.
          <div className="mt-1">{draftAddress?.label ?? (selectedSite ? `Herdado de ${selectedSite.name}` : 'Selecione um ponto no mapa para criar um site georreferenciado.')}</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Tipo do site">
            <select value={siteSpecificationId} onChange={(event) => setSiteSpecificationId(event.target.value)} className="geo-input">
              <option value="">Selecione...</option>
              {specs.map((spec) => <option key={spec.id} value={spec.id}>{spec.name} · {spec.category}</option>)}
            </select>
          </FormField>
          <FormField label="Nome do site">
            <input value={name} onChange={(event) => setName(event.target.value)} className="geo-input" placeholder="ex: PI - Rua Miguel de Frias, 380" />
          </FormField>
          <FormField label="Status inicial">
            <select value={status} onChange={(event) => setStatus(event.target.value as GeoStatus)} className="geo-input">
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="Site pai">
            <select value={parentSiteId} onChange={(event) => setParentSiteId(event.target.value)} className="geo-input">
              <option value="">Nenhum</option>
              {parentOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </FormField>
          <FormField label="Alimentado por">
            <select value={fedBySiteId} onChange={(event) => setFedBySiteId(event.target.value)} className="geo-input">
              <option value="">Nao informado</option>
              {sites.filter((site) => site.id !== selectedSite?.id).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </FormField>
        </div>
        <ModalFooter onClose={onClose} primaryLabel={saving ? 'Salvando...' : 'Criar site'} disabled={saving || !siteSpecificationId || !name.trim()} />
      </form>
    </Modal>
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
          <Info label="Address" value={address ? formatAddress(address) : 'Sem endereco'} />
          <Info label="Location" value={point ? `[${point[0].toFixed(5)}, ${point[1].toFixed(5)}]` : 'Sem place'} />
          <Info label="ParentSite" value={site.parentSite ? siteById.get(site.parentSite.id)?.name ?? site.parentSite.id : 'Nenhum'} />
          <Info label="ID" value={site.id} mono />
        </div>
      ) : null}

      {tab === 'subsites' ? (
        <div>
          <div className="mb-3 flex justify-between gap-3">
            <div className="text-[0.88rem] text-app-muted">Contencao fisica via parentSite.</div>
            <button type="button" className="geo-btn primary" onClick={onCreateSubSite}><Plus className="h-4 w-4" />Adicionar sub-site</button>
          </div>
          <SimpleRows rows={childSites.map((child) => [child.name, specById.get(child.siteSpecificationId)?.name ?? '-', statusLabel[child.status]])} empty="Este site ainda nao possui sub-sites." />
        </div>
      ) : null}

      {tab === 'topology' ? (
        <div className="grid gap-4">
          <SimpleRows rows={site.relatedSite.map((rel) => [rel.relationshipType, siteById.get(rel.id)?.name ?? rel.id, rel.id])} empty="Sem relacoes topologicas." />
          <div className="grid gap-3 rounded-[18px] border border-app-border p-4 md:grid-cols-[1fr_1fr_auto]">
            <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)} className="geo-input">
              {['fedBy', 'feeds', 'nearby', 'contains'].map((value) => <option key={value} value={value}>{value}</option>)}
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

function HierarchyTree({
  sites,
  specs,
  selectedSiteId,
  onSelect,
  onOpenDetail,
}: {
  sites: GeoSite[];
  specs: Map<string, GeoSpec>;
  selectedSiteId: string | null;
  onSelect: (site: GeoSite) => void;
  onOpenDetail: (site: GeoSite, tab?: DetailTab) => void;
}) {
  const roots = sites.filter((site) => !site.parentSite);
  const childrenByParent = useMemo(() => {
    const grouped = new Map<string, GeoSite[]>();
    for (const site of sites) {
      if (!site.parentSite) continue;
      grouped.set(site.parentSite.id, [...(grouped.get(site.parentSite.id) ?? []), site]);
    }
    return grouped;
  }, [sites]);

  const renderNode = (site: GeoSite, level: number): JSX.Element => {
    const spec = specs.get(site.siteSpecificationId);
    const children = childrenByParent.get(site.id) ?? [];
    return (
      <div key={site.id}>
        <button
          type="button"
          onClick={() => onSelect(site)}
          onDoubleClick={() => onOpenDetail(site)}
          className={`flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left ${selectedSiteId === site.id ? 'bg-app-accent-soft text-app-text' : 'text-app-muted hover:bg-app-accent-soft'}`}
          style={{ paddingLeft: 12 + level * 18 }}
        >
          <SiteIcon layer={layerForSpec(spec)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.86rem] font-semibold">{site.name}</span>
            <span className="block truncate text-[0.72rem]">{spec?.name ?? 'Tipo nao informado'}</span>
          </span>
        </button>
        {children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  if (!sites.length) {
    return <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">Nenhum GeographicSite cadastrado.</div>;
  }

  return <div className="grid gap-1">{roots.map((site) => renderNode(site, 0))}</div>;
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

function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'purple' | 'blue'; children: ReactNode }) {
  const toneClass = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];
  return <span className={`rounded-[999px] border px-3 py-1 text-[0.75rem] font-semibold ${toneClass}`}>{children}</span>;
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-app-border px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">{children}</th>;
}

function SiteIcon({ layer }: { layer: SiteLayer }) {
  const color = layer === 'CTO' ? '#1A9E7D' : layer === 'PI' ? '#8B7500' : layer === 'POP' ? '#004E89' : layer === 'CO' ? '#9B59B6' : '#5A5A5A';
  const Icon = layer === 'PI' ? MapPin : layer === 'CTO' ? Network : layer === 'POP' ? Layers : Building2;
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: color }}><Icon className="h-4 w-4" /></span>;
}

function pointForSite(site: GeoSite, locations: Map<string, GeoLocation>): [number, number] | null {
  const location = site.place ? locations.get(site.place.id) : undefined;
  if (!location || location.geometry.type !== 'Point') return null;
  return location.geometry.coordinates;
}

function formatAddress(address: GeoAddress): string {
  return [address.street, address.streetNr, address.city, address.stateOrProvince, address.postcode].filter(Boolean).join(', ');
}

function layerForSpec(spec?: GeoSpec): SiteLayer {
  const name = (spec?.name ?? '').toLowerCase();
  if (name.includes('central') || name === 'co') return 'CO';
  if (name.includes('pop')) return 'POP';
  if (name.includes('cto') || name.includes('armario')) return 'CTO';
  if (name.includes('instalacao') || name === 'pi') return 'PI';
  return 'Site';
}

function markerLabel(layer: SiteLayer): string {
  if (layer === 'CO') return 'CO';
  if (layer === 'POP') return 'P';
  if (layer === 'CTO') return 'CT';
  if (layer === 'PI') return 'PI';
  return 'S';
}

function markerColor(site: GeoSite, spec?: GeoSpec): string {
  if (site.status === 'terminated') return '#9CA3AF';
  if (site.status === 'suspended') return '#F59E0B';
  if (site.status === 'planned') return '#9B59B6';
  const layer = layerForSpec(spec);
  if (layer === 'CTO') return '#1A9E7D';
  if (layer === 'PI') return '#8B7500';
  if (layer === 'POP') return '#004E89';
  return '#FFD200';
}

function isParentAllowed(child?: GeoSpec, parent?: GeoSpec): boolean {
  if (!child || !parent) return true;
  if (child.allowedParentSpecIds.length > 0 && !child.allowedParentSpecIds.includes(parent.id)) return false;
  if (parent.allowedChildSpecIds.length > 0 && !parent.allowedChildSpecIds.includes(child.id)) return false;
  return true;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: API_HEADERS() });
  if (!response.ok) throw new Error(`GET ${url} falhou (${response.status})`);
  return await response.json() as T;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: API_HEADERS(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`POST ${url} falhou (${response.status})`);
  return await response.json() as T;
}

async function patchJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'PATCH', headers: API_HEADERS(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`PATCH ${url} falhou (${response.status})`);
  return await response.json() as T;
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
