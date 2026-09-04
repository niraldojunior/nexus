import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Map,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { GeoLocation } from '../../../services/geoApi';
import {
  createGeoLocation,
  getGeoLocationReferences,
  listGeoLocations,
  terminateGeoLocation,
  updateGeoLocation,
} from '../../../services/geoApi';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import {
  GOOGLE_MAPS_KEY,
  loadGoogleMaps,
  type GoogleMapInstance,
  type GoogleMapsListener,
  type GoogleMarkerInstance,
  type GooglePolygonInstance,
} from '../../../utils/googleMaps';
import {
  closePolygonRing,
  polygonFromVertices,
  polygonIsReady,
  polygonVertices,
} from './spatialPolygon';

const EDITABLE_COVERAGE_KIND = 'EditableCoverage';
const SPATIAL_CHARACTERISTIC_GROUP = '_spatial';
const SPATIAL_REFERENCE_PREFIX = 'STUDIO-SPATIAL:';
const DEFAULT_CENTER = { lat: -22.9, lng: -43.2 };

type CoverageDraft = {
  key: string;
  name: string;
  coverageType: string;
  geometry: Extract<GeoLocation['geometry'], { type: 'Polygon' }>;
};

export type SpatialStudioProps = { canEdit: boolean; canAdmin: boolean };

const isCoverage = (location: GeoLocation): boolean =>
  location.geometryType === 'Polygon' &&
  location.referencePoint?.startsWith(SPATIAL_REFERENCE_PREFIX) === true &&
  (location.characteristic ?? []).some(
    (characteristic) =>
      characteristic.group === SPATIAL_CHARACTERISTIC_GROUP &&
      characteristic.name === 'kind' &&
      characteristic.value === EDITABLE_COVERAGE_KIND,
  );

const valueOf = (location: GeoLocation, name: string): string => {
  const value = (location.characteristic ?? []).find(
    (characteristic) =>
      characteristic.group === SPATIAL_CHARACTERISTIC_GROUP && characteristic.name === name,
  )?.value;
  return typeof value === 'string' ? value : '';
};

const draftOf = (location?: GeoLocation): CoverageDraft => ({
  key: location?.referencePoint?.slice(SPATIAL_REFERENCE_PREFIX.length) ?? '',
  name: location ? valueOf(location, 'name') : '',
  coverageType: location ? valueOf(location, 'coverageType') : '',
  geometry:
    location?.geometry.type === 'Polygon'
      ? location.geometry
      : { type: 'Polygon', coordinates: [[]] },
});

const coverageCharacteristics = (draft: CoverageDraft) => [
  {
    group: SPATIAL_CHARACTERISTIC_GROUP,
    name: 'kind',
    value: EDITABLE_COVERAGE_KIND,
    valueType: 'string' as const,
  },
  {
    group: SPATIAL_CHARACTERISTIC_GROUP,
    name: 'name',
    value: draft.name.trim(),
    valueType: 'string' as const,
  },
  {
    group: SPATIAL_CHARACTERISTIC_GROUP,
    name: 'coverageType',
    value: draft.coverageType.trim(),
    valueType: 'string' as const,
  },
];

export function SpatialStudio({ canEdit }: SpatialStudioProps) {
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<GeoLocation | null | undefined>(undefined);
  const [terminating, setTerminating] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const current = (await listGeoLocations()).filter(isCoverage);
      setLocations(current);
      setSelectedId((id) =>
        id && current.some((location) => location.id === id) ? id : (current[0]?.id ?? null),
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar coberturas espaciais.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return locations;
    return locations.filter((location) =>
      [valueOf(location, 'name'), valueOf(location, 'coverageType'), location.referencePoint]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [locations, query]);
  const selected = locations.find((location) => location.id === selectedId) ?? null;

  // Este botão substitui o "Criar draft" genérico da StudioGovernanceBar: aquele grava `{}`,
  // que o SpatialStudioAdapter rejeita (coverages é obrigatório). Aqui sempre populamos
  // `coverages` a partir das Locations `_spatial` ativas antes de salvar o draft.
  const captureDraft = async () => {
    try {
      setCapturing(true);
      setError(null);
      const status = await getStudioStatus('spatial');
      await saveStudioDraft(
        'spatial',
        {
          coverages: locations
            .filter((location) => !location.validFor?.endDateTime)
            .map((location) => ({
              id: location.id,
              key: location.referencePoint?.slice(SPATIAL_REFERENCE_PREFIX.length) ?? location.id,
              name: valueOf(location, 'name'),
              coverageType: valueOf(location, 'coverageType'),
              geometry: location.geometry,
            })),
        },
        status.draftVersion?.checksum,
      );
      setSuccess('Snapshot das coberturas manuais salvo como draft de governança.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar draft espacial.');
    } finally {
      setCapturing(false);
    }
  };

  const saveCoverage = async (draft: CoverageDraft, editingLocation?: GeoLocation) => {
    const input = {
      geometryType: 'Polygon' as const,
      geometry: draft.geometry,
      spatialRef: 'EPSG:4326',
      accuracy: 'desenho-manual',
      sourceSystem: 'MANUAL' as const,
      referencePoint: `${SPATIAL_REFERENCE_PREFIX}${draft.key.trim()}`,
      characteristic: coverageCharacteristics(draft),
    };
    if (editingLocation) await updateGeoLocation(editingLocation.id, input);
    else await createGeoLocation(input);
    setEditing(undefined);
    setSuccess(editingLocation ? 'Cobertura atualizada.' : 'Cobertura criada.');
    await load();
  };

  const terminate = async () => {
    if (!terminating) return;
    try {
      await terminateGeoLocation(terminating.id);
      setTerminating(null);
      setSuccess('Cobertura encerrada logicamente conforme C6.');
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Falha ao encerrar cobertura.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[22px] border border-app-border bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-app-accent-soft text-app-text">
            <Map className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.78rem] font-semibold uppercase tracking-wider text-app-muted">TMF675</p>
            <p className="text-[0.9rem] font-semibold text-app-text">Coberturas operacionais manuais</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit ? (
            <>
              <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1.5 rounded-[12px] bg-app-accent px-3.5 py-2 text-[0.82rem] font-semibold text-white shadow-soft">
                <Plus className="h-4 w-4" /> Nova cobertura
              </button>
              <button type="button" onClick={() => void captureDraft()} disabled={capturing} className="flex items-center gap-1.5 rounded-[12px] border border-app-border px-3.5 py-2 text-[0.82rem] font-medium text-app-text">
                <Save className="h-4 w-4" />{capturing ? 'Salvando...' : 'Salvar como Draft'}
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => void load()} className="rounded-[12px] border border-app-border p-2 text-app-muted" title="Recarregar">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error ? <Notice icon={<AlertCircle className="h-4 w-4" />} className="border-red-200 bg-red-50 text-red-700" text={error} /> : null}
      {success ? <Notice icon={<CheckCircle2 className="h-4 w-4" />} className="border-emerald-200 bg-emerald-50 text-emerald-800" text={success} /> : null}
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-[520px] rounded-[22px] border border-app-border bg-white p-4 shadow-soft">
          <label className="flex items-center gap-2 rounded-[12px] border border-app-border px-3 py-2 text-app-muted">
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-[0.86rem] outline-none" placeholder="Buscar cobertura" />
          </label>
          <div className="mt-3 space-y-1">
            {filtered.map((location) => (
              <button type="button" key={location.id} onClick={() => setSelectedId(location.id)} className={`w-full rounded-[14px] p-3 text-left ${location.id === selectedId ? 'bg-app-accent-soft' : 'hover:bg-black/[0.02]'}`}>
                <p className="text-[0.88rem] font-semibold text-app-text">{valueOf(location, 'name')}</p>
                <p className="mt-1 text-[0.76rem] text-app-muted">{valueOf(location, 'coverageType')} · {location.validFor?.endDateTime ? 'Encerrada' : 'Ativa'}</p>
              </button>
            ))}
          </div>
        </aside>
        <section className="min-h-[520px] rounded-[22px] border border-app-border bg-white p-5 shadow-soft">
          {selected ? <CoverageDetail location={selected} canEdit={canEdit} onEdit={() => setEditing(selected)} onTerminate={() => setTerminating(selected)} /> : <div className="flex h-full flex-col items-center justify-center text-center text-app-muted"><Map className="h-10 w-10 opacity-30" /><p className="mt-3 text-[0.9rem]">Nenhuma cobertura manual selecionada.</p></div>}
        </section>
      </div>
      {editing !== undefined ? <SpatialCoverageFormModal location={editing ?? undefined} onClose={() => setEditing(undefined)} onSave={saveCoverage} /> : null}
      {terminating ? <SpatialCoverageImpactModal location={terminating} onClose={() => setTerminating(null)} onConfirm={terminate} /> : null}
    </div>
  );
}

function Notice({ icon, className, text }: { icon: ReactNode; className: string; text: string }) {
  return <div className={`flex items-center gap-2 rounded-[16px] border p-3 text-[0.84rem] ${className}`}>{icon}<span>{text}</span></div>;
}

function CoverageDetail({ location, canEdit, onEdit, onTerminate }: { location: GeoLocation; canEdit: boolean; onEdit: () => void; onTerminate: () => void }) {
  const vertexCount = polygonVertices(location.geometry).length;
  return <div><div className="flex items-start justify-between gap-4 border-b border-app-border pb-4"><div><p className="text-[0.76rem] font-semibold uppercase tracking-wider text-app-muted">Cobertura espacial</p><h3 className="mt-1 font-display text-[1.5rem] font-semibold text-app-text">{valueOf(location, 'name')}</h3><p className="mt-1 text-[0.86rem] text-app-muted">{valueOf(location, 'coverageType')} · EPSG:4326 · {vertexCount} vértices</p></div>{canEdit && !location.validFor?.endDateTime ? <div className="flex gap-2"><button type="button" onClick={onEdit} className="rounded-[12px] border border-app-border px-3 py-2 text-[0.82rem] font-semibold text-app-text">Editar</button><button type="button" onClick={onTerminate} className="flex items-center gap-1 rounded-[12px] border border-red-200 px-3 py-2 text-[0.82rem] font-semibold text-red-700"><Trash2 className="h-4 w-4" /> Encerrar</button></div> : null}</div><pre className="mt-5 max-h-[360px] overflow-auto rounded-[16px] bg-app-bg p-4 text-[0.75rem] leading-5 text-app-text">{JSON.stringify(location.geometry, null, 2)}</pre></div>;
}

function SpatialCoverageFormModal({ location, onClose, onSave }: { location?: GeoLocation; onClose: () => void; onSave: (draft: CoverageDraft, location?: GeoLocation) => Promise<void> }) {
  const initial = draftOf(location);
  const [draft, setDraft] = useState(initial);
  const [vertices, setVertices] = useState(() => polygonVertices(initial.geometry));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const map = useRef<GoogleMapInstance | null>(null);
  const polygon = useRef<GooglePolygonInstance | null>(null);
  const markers = useRef<GoogleMarkerInstance[]>([]);
  const listeners = useRef<GoogleMapsListener[]>([]);
  const markerListeners = useRef<GoogleMapsListener[]>([]);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !mapElement.current) return;
    let cancelled = false;
    void loadGoogleMaps(GOOGLE_MAPS_KEY).then(() => {
      const maps = window.google?.maps;
      if (cancelled || !maps || !mapElement.current || map.current) return;
      const [lng, lat] = vertices[0] ?? [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];
      map.current = new maps.Map(mapElement.current, { center: { lat, lng }, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      listeners.current.push(map.current.addListener('click', (event) => setVertices((current) => [...current, [event.latLng.lng(), event.latLng.lat()]])));
      setMapsReady(true);
    }).catch(() => setError('Não foi possível carregar o editor de mapa.'));
    return () => {
      cancelled = true;
      for (const listener of listeners.current) listener.remove();
      listeners.current = [];
      for (const listener of markerListeners.current) listener.remove();
      markerListeners.current = [];
      for (const marker of markers.current) marker.setMap(null);
      markers.current = [];
      polygon.current?.setMap(null);
      polygon.current = null;
      map.current = null;
      setMapsReady(false);
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !map.current) return;
    polygon.current?.setMap(null);
    for (const listener of markerListeners.current) listener.remove();
    markerListeners.current = [];
    for (const marker of markers.current) marker.setMap(null);
    markers.current = [];
    if (vertices.length >= 2) polygon.current = new maps.Polygon({ map: map.current, paths: closePolygonRing(vertices).map(([lng, lat]) => ({ lng, lat })), strokeWeight: 2, fillOpacity: 0.18, clickable: false });
    markers.current = vertices.map(([lng, lat], index) => {
      const marker = new maps.Marker({ map: map.current, position: { lng, lat }, draggable: true, title: `Vértice ${index + 1}` });
      markerListeners.current.push(marker.addListener('dragend', () => {
        const position = marker.getPosition();
        if (!position) return;
        setVertices((current) => current.map((vertex, vertexIndex) => vertexIndex === index ? [position.lng(), position.lat()] : vertex));
      }));
      return marker;
    });
  }, [mapsReady, vertices]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!polygonIsReady(vertices)) {
      setError('Desenhe ao menos três vértices para formar um polígono.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave({ ...draft, geometry: polygonFromVertices(vertices) }, location);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar cobertura.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"><form onSubmit={(event) => void submit(event)} className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[24px] border border-app-border bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-[1.25rem] font-semibold text-app-text">{location ? 'Editar cobertura' : 'Nova cobertura'}</h3><p className="mt-1 text-[0.84rem] text-app-muted">Clique no mapa para desenhar; arraste os vértices para ajustar. A camada GPON derivada não é alterada.</p></div><button type="button" onClick={onClose} className="rounded-full p-1.5 text-app-muted hover:bg-black/[0.04]"><X className="h-5 w-5" /></button></div>{error ? <Notice icon={<AlertCircle className="h-4 w-4" />} className="mt-4 border-red-200 bg-red-50 text-red-700" text={error} /> : null}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-[0.82rem] font-semibold text-app-text">Chave<input required disabled={Boolean(location)} value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} className="mt-1 w-full rounded-[10px] border border-app-border px-3 py-2 font-normal" /></label><label className="text-[0.82rem] font-semibold text-app-text">Tipo<input required value={draft.coverageType} onChange={(event) => setDraft({ ...draft, coverageType: event.target.value })} className="mt-1 w-full rounded-[10px] border border-app-border px-3 py-2 font-normal" /></label></div><label className="mt-4 block text-[0.82rem] font-semibold text-app-text">Nome<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-[10px] border border-app-border px-3 py-2 font-normal" /></label><div className="mt-4 overflow-hidden rounded-[16px] border border-app-border"><div ref={mapElement} className="h-[360px] bg-app-bg" />{!GOOGLE_MAPS_KEY ? <p className="p-3 text-[0.82rem] text-app-muted">Google Maps não está configurado neste ambiente. Configure a chave para desenhar a cobertura.</p> : null}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[0.82rem] text-app-muted">{vertices.length} de 3 vértices mínimos · GeoJSON WGS84 / EPSG:4326</p><div className="flex gap-2"><button type="button" onClick={() => setVertices((current) => current.slice(0, -1))} disabled={vertices.length === 0} className="flex items-center gap-1 rounded-[10px] border border-app-border px-3 py-1.5 text-[0.78rem] text-app-text disabled:opacity-50"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button><button type="button" onClick={() => setVertices([])} disabled={vertices.length === 0} className="flex items-center gap-1 rounded-[10px] border border-app-border px-3 py-1.5 text-[0.78rem] text-app-text disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Reiniciar</button></div></div><pre className="mt-4 max-h-32 overflow-auto rounded-[12px] bg-app-bg p-3 text-[0.72rem] text-app-muted">{JSON.stringify(polygonFromVertices(vertices), null, 2)}</pre><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-[12px] border border-app-border px-4 py-2 text-[0.84rem]">Cancelar</button><button disabled={saving || !polygonIsReady(vertices)} className="rounded-[12px] bg-app-accent px-4 py-2 text-[0.84rem] font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar cobertura'}</button></div></form></div>;
}

function SpatialCoverageImpactModal({ location, onClose, onConfirm }: { location: GeoLocation; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [references, setReferences] = useState<{ activeAddressCount: number; activeSiteCount: number; blocking: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { getGeoLocationReferences(location.id).then(setReferences).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar dependências.')); }, [location.id]);
  const confirm = async () => { try { setSubmitting(true); setError(null); await onConfirm(); } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Falha ao encerrar cobertura.'); } finally { setSubmitting(false); } };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"><div className="w-full max-w-lg rounded-[24px] border border-app-border bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-[1.2rem] font-semibold text-app-text">Encerrar cobertura</h3><p className="mt-1 text-[0.84rem] text-app-muted">{valueOf(location, 'name')}</p></div><button type="button" onClick={onClose} className="rounded-full p-1.5 text-app-muted hover:bg-black/[0.04]"><X className="h-5 w-5" /></button></div><p className="mt-4 text-[0.88rem] leading-6 text-app-text">Conforme C6, o encerramento é lógico: o histórico e a geometria serão preservados.</p>{error ? <Notice icon={<AlertCircle className="h-4 w-4" />} className="mt-4 border-red-200 bg-red-50 text-red-700" text={error} /> : null}{references ? <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-[14px] border border-app-border bg-app-bg p-3"><p className="text-[0.72rem] font-semibold uppercase text-app-muted">Endereços ativos</p><p className="mt-1 text-lg font-semibold text-app-text">{references.activeAddressCount}</p></div><div className="rounded-[14px] border border-app-border bg-app-bg p-3"><p className="text-[0.72rem] font-semibold uppercase text-app-muted">Locais ativos</p><p className="mt-1 text-lg font-semibold text-app-text">{references.activeSiteCount}</p></div></div> : <p className="mt-4 text-[0.84rem] text-app-muted">Calculando dependências...</p>}{references?.blocking ? <p className="mt-4 rounded-[14px] border border-red-200 bg-red-50 p-3 text-[0.84rem] text-red-700">Existem referências ativas. O backend bloqueará o encerramento até que sejam resolvidas.</p> : null}<div className="mt-5 flex justify-end gap-2 border-t border-app-border pt-4"><button type="button" onClick={onClose} className="rounded-[12px] border border-app-border px-4 py-2 text-[0.84rem]">Cancelar</button><button type="button" onClick={() => void confirm()} disabled={submitting || references?.blocking || !references} className="rounded-[12px] bg-red-600 px-4 py-2 text-[0.84rem] font-semibold text-white disabled:opacity-50">{submitting ? 'Encerrando...' : 'Encerrar cobertura'}</button></div></div></div>;
}
