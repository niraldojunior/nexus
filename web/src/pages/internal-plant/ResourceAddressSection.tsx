import { Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  getGeoAddress,
  getGeoLocation,
  getGeoSite,
  listGeoAddresses,
  postJson,
  type GeoAddress,
  type GeoLocation,
} from '../../services/geoApi';
import {
  fetchGeonetCandidates,
  fetchGeonetDetail,
  type GeonetAddressCandidate,
} from '../../services/geonetAddressApi';
import {
  GOOGLE_MAPS_KEY,
  fetchAddressPredictions,
  fetchPlaceDetails,
  loadGoogleMaps,
  type AddressPrediction,
  type GoogleMapInstance,
  type GoogleMarkerInstance,
} from '../../utils/googleMaps';
import { formatAddress } from '../../utils/placeLabel';
import { accuracyLevelOf } from '../geo-tabs/addressLocationResolution';
import { SitePinMap } from './SitePinMap';

export type GeoPlaceType = 'GeographicSite' | 'GeographicAddress' | 'GeographicLocation';

type PendingAddress = {
  source: 'GEONET' | 'GOOGLE_MAPS';
  sourceRef: string;
  coordinates: [number, number];
  label: string;
  street: string;
  streetNr?: string | undefined;
  city?: string | undefined;
  stateOrProvince?: string | undefined;
  postcode?: string | undefined;
  country: string;
  precisionRaw?: string | undefined;
};

/** Estado do `place` (place_id / place_type) do recurso no editor. */
export type GeoPlaceDraft =
  | { kind: 'none' }
  | { kind: 'existing'; id: string; type: GeoPlaceType }
  | { kind: 'pendingAddress'; address: PendingAddress }
  | { kind: 'pendingLocation'; coordinates: [number, number] };

const inputClass =
  'w-full rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent';

const TYPE_LABEL: Record<GeoPlaceType, string> = {
  GeographicSite: 'Local (Site)',
  GeographicAddress: 'Endereço',
  GeographicLocation: 'Coordenada',
};

/**
 * Grava no módulo Geo o endereço/coordenada escolhido por busca externa ou clique no mapa
 * (Location primeiro; o Address aponta para ela) e devolve a referência a usar no `place`.
 */
export async function persistPendingGeoPlace(
  draft: GeoPlaceDraft,
): Promise<{ id: string; type: GeoPlaceType } | undefined> {
  if (draft.kind === 'pendingLocation') {
    const location = await postJson<GeoLocation>('/v1/geo/locations', {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: draft.coordinates },
      spatialRef: 'EPSG:4326',
      sourceSystem: 'MANUAL',
      accuracyLevel: 'unknown',
    });
    return { id: location.id, type: 'GeographicLocation' };
  }
  if (draft.kind === 'pendingAddress') {
    const a = draft.address;
    const location = await postJson<GeoLocation>('/v1/geo/locations', {
      geometryType: 'Point',
      geometry: { type: 'Point', coordinates: a.coordinates },
      spatialRef: 'EPSG:4326',
      ...(a.precisionRaw ? { accuracy: a.precisionRaw } : {}),
      sourceSystem: a.source,
      sourceRef: a.sourceRef,
      accuracyLevel: accuracyLevelOf(a.source === 'GEONET' ? 'geonet' : 'google', a.precisionRaw),
    });
    const address = await postJson<GeoAddress>('/v1/geo/addresses', {
      street: a.street,
      streetNr: a.streetNr,
      city: a.city,
      stateOrProvince: a.stateOrProvince,
      postcode: a.postcode,
      country: a.country,
      sourceSystem: a.source,
      sourceRef: a.sourceRef,
      geographicLocationId: location.id,
    });
    return { id: address.id, type: 'GeographicAddress' };
  }
  return undefined;
}

type Resolved = {
  typeLabel: string;
  name: string | null;
  address: string | null;
  point: { lat: number; lng: number } | null;
  missing: boolean;
};

const pointOf = (loc: GeoLocation | undefined) =>
  loc?.geometry.type === 'Point'
    ? { lat: loc.geometry.coordinates[1], lng: loc.geometry.coordinates[0] }
    : null;

async function resolvePlace(draft: GeoPlaceDraft): Promise<Resolved | null> {
  if (draft.kind === 'none') return null;
  if (draft.kind === 'pendingLocation') {
    return {
      typeLabel: 'Coordenada (será criada ao salvar)',
      name: null,
      address: null,
      point: { lat: draft.coordinates[1], lng: draft.coordinates[0] },
      missing: false,
    };
  }
  if (draft.kind === 'pendingAddress') {
    return {
      typeLabel: `Endereço · ${draft.address.source === 'GEONET' ? 'Geonet' : 'Google Maps'} (será criado ao salvar)`,
      name: null,
      address: draft.address.label,
      point: { lat: draft.address.coordinates[1], lng: draft.address.coordinates[0] },
      missing: false,
    };
  }
  const typeLabel = TYPE_LABEL[draft.type];
  if (draft.type === 'GeographicLocation') {
    const loc = await getGeoLocation(draft.id);
    return { typeLabel, name: null, address: null, point: pointOf(loc), missing: !loc };
  }
  if (draft.type === 'GeographicAddress') {
    const address = await getGeoAddress(draft.id);
    const locId = address?.geographicLocationId ?? address?.place?.id;
    const loc = locId ? await getGeoLocation(locId).catch(() => undefined) : undefined;
    return {
      typeLabel,
      name: null,
      address: address ? formatAddress(address) : null,
      point: pointOf(loc),
      missing: !address,
    };
  }
  const site = await getGeoSite(draft.id);
  const [address, loc] = await Promise.all([
    site?.address?.id ? getGeoAddress(site.address.id).catch(() => undefined) : undefined,
    site?.place?.id ? getGeoLocation(site.place.id).catch(() => undefined) : undefined,
  ]);
  return {
    typeLabel,
    name: site?.name ?? null,
    address: address ? formatAddress(address) : null,
    point: pointOf(loc),
    missing: !site,
  };
}

function MapPicker({
  value,
  onPick,
}: {
  value: [number, number] | null;
  onPick: (coordinates: [number, number]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRef = useRef<GoogleMarkerInstance | null>(null);
  const valueRef = useRef(value);
  const onPickRef = useRef(onPick);
  valueRef.current = value;
  onPickRef.current = onPick;
  const [failed, setFailed] = useState(!GOOGLE_MAPS_KEY);

  const sync = () => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    const v = valueRef.current;
    if (!maps || !map || !v) return;
    const position = { lat: v[1], lng: v[0] };
    if (markerRef.current) markerRef.current.setPosition(position);
    else markerRef.current = new maps.Marker({ position, map });
    map.panTo(position);
  };

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !ref.current) return;
    let cancelled = false;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        const maps = window.google?.maps;
        if (cancelled || !ref.current || !maps) return;
        const v = valueRef.current;
        const map = new maps.Map(ref.current, {
          center: v ? { lat: v[1], lng: v[0] } : { lat: -14.235, lng: -51.925 },
          zoom: v ? 16 : 4,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;
        map.addListener('click', (event) =>
          onPickRef.current([event.latLng.lng(), event.latLng.lat()]),
        );
        sync();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(sync, [value?.[0], value?.[1]]);

  if (failed) return null;
  return (
    <div
      ref={ref}
      aria-label="Mapa para escolher a coordenada"
      className="h-56 w-full cursor-crosshair overflow-hidden rounded-[10px] border border-app-border"
    />
  );
}

type Source = 'base' | 'google' | 'geonet';
const SOURCE_LABEL: Record<Source, string> = {
  base: 'Base Nexus',
  google: 'Google Maps',
  geonet: 'Geonet',
};

type Hit = { key: string; label: string; pick: () => Promise<void> };

function AddressSearch({ onChange }: { onChange: (draft: GeoPlaceDraft) => void }) {
  const [source, setSource] = useState<Source>('base');
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const q = term.trim();
    setMessage(null);
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const mine = ++token.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      const done = (list: Hit[], empty: string) => {
        if (token.current !== mine) return;
        setHits(list);
        setMessage(list.length === 0 ? empty : null);
        setSearching(false);
      };
      const fail = (cause: unknown) => {
        if (token.current !== mine) return;
        setHits([]);
        setMessage(cause instanceof Error ? cause.message : 'Falha na busca.');
        setSearching(false);
      };
      if (source === 'base') {
        listGeoAddresses({ q, limit: 10 })
          .then((rows) =>
            done(
              rows.map((a) => ({
                key: a.id,
                label: formatAddress(a),
                pick: async () => onChange({ kind: 'existing', id: a.id, type: 'GeographicAddress' }),
              })),
              'Endereço não encontrado na base. Tente o Google Maps ou o Geonet.',
            ),
          )
          .catch(fail);
      } else if (source === 'google') {
        fetchAddressPredictions(q)
          .then((rows: AddressPrediction[]) =>
            done(
              rows.map((p) => ({
                key: p.placeId,
                label: p.description,
                pick: async () => {
                  const d = await fetchPlaceDetails(p.placeId);
                  if (!d) throw new Error('Não foi possível obter os detalhes do endereço.');
                  onChange({
                    kind: 'pendingAddress',
                    address: {
                      source: 'GOOGLE_MAPS',
                      sourceRef: d.placeId ?? p.placeId,
                      coordinates: d.coordinates,
                      label: d.label,
                      street: d.street,
                      streetNr: d.streetNr,
                      city: d.city,
                      stateOrProvince: d.stateOrProvince,
                      postcode: d.postcode,
                      country: d.country,
                      precisionRaw: d.precision,
                    },
                  });
                },
              })),
              GOOGLE_MAPS_KEY
                ? 'Nenhum endereço encontrado no Google Maps.'
                : 'Chave do Google Maps não configurada.',
            ),
          )
          .catch(fail);
      } else {
        fetchGeonetCandidates(q)
          .then((result) =>
            done(
              result.status === 'ready'
                ? result.candidates
                    .filter((c): c is GeonetAddressCandidate & { addressId: string } => Boolean(c.addressId))
                    .map((c) => ({
                      key: c.addressId,
                      label: c.formattedAddress,
                      pick: async () => {
                        const detail = await fetchGeonetDetail(c.addressId);
                        const a = detail.status === 'ready' ? detail.address : null;
                        if (!a?.coordinates) {
                          throw new Error('O Geonet não retornou coordenadas para este endereço.');
                        }
                        onChange({
                          kind: 'pendingAddress',
                          address: {
                            source: 'GEONET',
                            sourceRef: c.addressId,
                            coordinates: a.coordinates,
                            label: a.formattedAddress,
                            street: a.street ?? a.formattedAddress,
                            streetNr: a.streetNr,
                            city: a.city,
                            stateOrProvince: a.state,
                            postcode: a.postcode,
                            country: 'BR',
                            precisionRaw: a.geolocationMethod,
                          },
                        });
                      },
                    }))
                : [],
              result.status === 'not_configured'
                ? 'Geonet não configurado neste ambiente.'
                : 'Nenhum endereço encontrado no Geonet.',
            ),
          )
          .catch(fail);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term, source, onChange]);

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Fonte do endereço" className="inline-flex w-fit gap-1 rounded-[10px] bg-app-sidebar p-1">
        {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            className={`rounded-[8px] px-3 py-1 text-[0.8rem] ${source === s ? 'bg-app-panel font-semibold text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'}`}
            onClick={() => {
              setSource(s);
              setHits([]);
            }}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted" />
        <input
          className={`${inputClass} pl-8`}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Buscar endereço em ${SOURCE_LABEL[source]}`}
          aria-label="Buscar endereço"
        />
        {searching || resolving ? (
          <Loader2 size={14} aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-app-muted" />
        ) : null}
      </div>
      {hits.length > 0 ? (
        <ul className="grid max-h-44 gap-1 overflow-y-auto rounded-[10px] border border-app-border p-1">
          {hits.map((h) => (
            <li key={h.key}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1 text-left text-[0.85rem] hover:bg-app-hover"
                onClick={() => {
                  setResolving(true);
                  setMessage(null);
                  h.pick()
                    .then(() => {
                      setTerm('');
                      setHits([]);
                    })
                    .catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Falha ao carregar o endereço.'))
                    .finally(() => setResolving(false));
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="text-[0.78rem] text-app-muted">{message}</p> : null}
    </div>
  );
}

function CoordinatePicker({ onChange }: { onChange: (draft: GeoPlaceDraft) => void }) {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const set = (c: [number, number]) => {
    setCoords(c);
    setLat(c[1].toFixed(6));
    setLng(c[0].toFixed(6));
  };
  const typed = (nextLat: string, nextLng: string) => {
    setLat(nextLat);
    setLng(nextLng);
    const la = Number(nextLat.replace(',', '.'));
    const lo = Number(nextLng.replace(',', '.'));
    if (nextLat.trim() && nextLng.trim() && Math.abs(la) <= 90 && Math.abs(lo) <= 180) setCoords([lo, la]);
  };
  return (
    <div className="grid gap-2">
      <p className="text-[0.78rem] text-app-muted">Clique no mapa ou informe a latitude e a longitude.</p>
      <MapPicker value={coords} onPick={set} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputClass} value={lat} onChange={(e) => typed(e.target.value, lng)} placeholder="Latitude" aria-label="Latitude" />
        <input className={inputClass} value={lng} onChange={(e) => typed(lat, e.target.value)} placeholder="Longitude" aria-label="Longitude" />
      </div>
      <div>
        <button
          type="button"
          disabled={!coords}
          className="rounded-[8px] border border-app-border px-3 py-1.5 text-[0.82rem] font-semibold text-app-text hover:bg-app-hover disabled:opacity-50"
          onClick={() => coords && onChange({ kind: 'pendingLocation', coordinates: coords })}
        >
          Usar esta coordenada
        </button>
      </div>
    </div>
  );
}

/** Campo "Endereço" da aba Geral: mostra o `place` do recurso (endereço, coordenada ou local) ou permite escolhê-lo. */
export function GeoPlaceSection({
  value,
  onChange,
}: {
  value: GeoPlaceDraft;
  onChange: (draft: GeoPlaceDraft) => void;
}) {
  const [mode, setMode] = useState<'address' | 'map'>('address');
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(false);
  const key =
    value.kind === 'existing'
      ? `e:${value.type}:${value.id}`
      : value.kind === 'pendingAddress'
        ? `a:${value.address.sourceRef}`
        : value.kind === 'pendingLocation'
          ? `l:${value.coordinates.join(',')}`
          : 'none';

  useEffect(() => {
    if (value.kind === 'none') {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolvePlace(value)
      .then((r) => !cancelled && setResolved(r))
      .catch(() => !cancelled && setResolved(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const readOnly = value.kind === 'existing' && value.type === 'GeographicSite';

  return (
    <section className="grid gap-2" aria-label="Endereço">
      <h3 className="text-[0.78rem] font-semibold text-app-muted">Endereço</h3>
      {value.kind === 'none' ? (
        <div className="grid gap-3 rounded-[10px] border border-app-border p-3">
          <div role="radiogroup" aria-label="Tipo de preenchimento" className="inline-flex w-fit gap-1 rounded-[10px] bg-app-sidebar p-1">
            {(['address', 'map'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`rounded-[8px] px-3 py-1 text-[0.8rem] ${mode === m ? 'bg-app-panel font-semibold text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'}`}
                onClick={() => setMode(m)}
              >
                {m === 'address' ? 'Endereço' : 'Coordenada no mapa'}
              </button>
            ))}
          </div>
          {mode === 'address' ? <AddressSearch onChange={onChange} /> : <CoordinatePicker onChange={onChange} />}
        </div>
      ) : (
        <div className="grid gap-3 rounded-[10px] border border-app-border px-3 py-2 text-[0.85rem]">
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-semibold text-app-text">
                <MapPin size={15} aria-hidden="true" className="shrink-0 text-app-muted" />
                {loading
                  ? 'Carregando…'
                  : resolved?.missing
                    ? 'Referência não encontrada'
                    : (resolved?.name ?? resolved?.address ?? (resolved?.point ? 'Coordenada' : '—'))}
              </span>
              {resolved ? <span className="pl-[23px] text-[0.75rem] text-app-muted">{resolved.typeLabel}</span> : null}
            </span>
            {readOnly ? null : (
              <button type="button" aria-label="Remover endereço" className="text-app-muted hover:text-status-red" onClick={() => onChange({ kind: 'none' })}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
          {resolved?.name && resolved.address ? <p className="text-app-muted">{resolved.address}</p> : null}
          {resolved?.point ? (
            <>
              <p className="text-app-muted">
                Coordenada: {resolved.point.lat.toFixed(6)}, {resolved.point.lng.toFixed(6)}
              </p>
              <SitePinMap point={resolved.point} label="Mapa do endereço" />
            </>
          ) : null}
          {readOnly ? (
            <p className="text-[0.75rem] text-app-muted">Vínculo com um Local; altere-o na aba Locais.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
