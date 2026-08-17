import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search, Target } from 'lucide-react';
import { patchJson, postJson, type GeoAddress, type GeoLocation } from '../../services/geoApi';
import {
  fetchGeonetCandidates,
  fetchGeonetDetail,
  type GeonetAddressCandidate,
} from '../../services/geonetAddressApi';
import { fetchAddressPredictions, fetchPlaceDetails, type AddressPrediction } from '../../utils/googleMaps';
import { accuracyLevelOf } from './addressLocationResolution';
import { GeonetPrecisionBadge } from './AddressSourceCard';
import { PrecisionBadge } from './PrecisionBadge';
import { GoogleMapsIcon, VtalIcon } from './AddressSourceIcons';
import { Modal } from './Modal';

const ADDRESS_DEBOUNCE_MS = 250;

type AddressSourceBase = 'geonet' | 'google';

type SelectedAddress = {
  source: AddressSourceBase;
  sourceRef: string;
  coordinates: [number, number];
  formattedAddress: string;
  street: string;
  streetNr?: string;
  city?: string;
  stateOrProvince?: string;
  postcode?: string;
  country: string;
  precisionRaw?: string;
};

export type SiteAddressModalProps = {
  siteId: string;
  currentAddressId?: string | null;
  currentLocationId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Modal de edição de endereço do painel unificado de Local (REQ-MOD01-016): o usuário
 * escolhe a base de referência (GEONET por padrão, ou Google Maps), digita e confirma um
 * candidato via autocomplete da base escolhida — Localização e Precisão são só leitura,
 * preenchidas a partir do candidato. Ao salvar, grava a fonte (`sourceSystem`/`sourceRef`)
 * e a precisão normalizada (`accuracyLevel`) em Location/Address (Fase 1 do painel
 * unificado), criando os dois se o Site ainda não tinha nenhum.
 */
export function SiteAddressModal({
  siteId,
  currentAddressId,
  currentLocationId,
  onClose,
  onSaved,
}: SiteAddressModalProps) {
  const [base, setBase] = useState<AddressSourceBase>('geonet');
  const [query, setQuery] = useState('');
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [geonetPredictions, setGeonetPredictions] = useState<GeonetAddressCandidate[]>([]);
  const [googlePredictions, setGooglePredictions] = useState<AddressPrediction[]>([]);
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  const switchBase = (next: AddressSourceBase) => {
    setBase(next);
    setQuery('');
    setGeonetPredictions([]);
    setGooglePredictions([]);
    setSelected(null);
    setPredictionsOpen(false);
  };

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    const term = query.trim();
    if (!term) {
      setGeonetPredictions([]);
      setGooglePredictions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      if (base === 'geonet') {
        void fetchGeonetCandidates(term).then((result) => {
          if (requestTokenRef.current !== token) return;
          setGeonetPredictions(result.status === 'ready' ? result.candidates : []);
        });
      } else {
        void fetchAddressPredictions(term).then((predictions) => {
          if (requestTokenRef.current !== token) return;
          setGooglePredictions(predictions);
        });
      }
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [query, base]);

  const selectGeonetCandidate = async (candidate: GeonetAddressCandidate) => {
    if (!candidate.addressId) return;
    setPredictionsOpen(false);
    setQuery(candidate.formattedAddress);
    setResolving(true);
    const result = await fetchGeonetDetail(candidate.addressId);
    setResolving(false);
    if (result.status === 'ready' && result.address?.coordinates) {
      setSelected({
        source: 'geonet',
        sourceRef: candidate.addressId,
        coordinates: result.address.coordinates,
        formattedAddress: result.address.formattedAddress,
        street: result.address.street ?? result.address.formattedAddress,
        streetNr: result.address.streetNr,
        city: result.address.city,
        stateOrProvince: result.address.state,
        postcode: result.address.postcode,
        country: 'BR',
        precisionRaw: result.address.geolocationMethod,
      });
    }
  };

  const selectGooglePrediction = async (prediction: AddressPrediction) => {
    setPredictionsOpen(false);
    setQuery(prediction.description);
    setResolving(true);
    const draft = await fetchPlaceDetails(prediction.placeId);
    setResolving(false);
    if (draft) {
      setSelected({
        source: 'google',
        sourceRef: draft.placeId ?? prediction.placeId,
        coordinates: draft.coordinates,
        formattedAddress: draft.label,
        street: draft.street,
        streetNr: draft.streetNr,
        city: draft.city,
        stateOrProvince: draft.stateOrProvince,
        postcode: draft.postcode,
        country: draft.country,
        precisionRaw: draft.precision,
      });
    }
  };

  const canSave = Boolean(selected);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const sourceSystem = selected.source === 'geonet' ? 'GEONET' : 'GOOGLE_MAPS';
      const accuracyLevel = accuracyLevelOf(selected.source, selected.precisionRaw);
      const locationPayload = {
        geometryType: 'Point' as const,
        geometry: { type: 'Point' as const, coordinates: selected.coordinates },
        spatialRef: 'EPSG:4326',
        ...(selected.precisionRaw ? { accuracy: selected.precisionRaw } : {}),
        sourceSystem,
        sourceRef: selected.sourceRef,
        accuracyLevel,
      };
      const addressPayload = {
        street: selected.street,
        streetNr: selected.streetNr,
        city: selected.city,
        stateOrProvince: selected.stateOrProvince,
        postcode: selected.postcode,
        country: selected.country,
        sourceSystem,
        sourceRef: selected.sourceRef,
      };

      if (currentLocationId && currentAddressId) {
        await Promise.all([
          patchJson<GeoLocation>(`/v1/geo/locations/${currentLocationId}`, locationPayload),
          patchJson<GeoAddress>(`/v1/geo/addresses/${currentAddressId}`, {
            ...addressPayload,
            geographicLocationId: currentLocationId,
          }),
        ]);
      } else {
        const location = await postJson<GeoLocation>('/v1/geo/locations', locationPayload);
        const address = await postJson<GeoAddress>('/v1/geo/addresses', {
          ...addressPayload,
          geographicLocationId: location.id,
        });
        await patchJson(`/v1/geo/sites/${siteId}`, {
          placeId: location.id,
          addressId: address.id,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o endereço.');
    } finally {
      setSaving(false);
    }
  };

  const predictionsVisible =
    predictionsOpen && (base === 'geonet' ? geonetPredictions.length > 0 : googlePredictions.length > 0);

  return (
    <Modal onClose={onClose} title="Editar endereço" eyebrow="Local">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
            Base de referência
          </label>
          <div
            role="radiogroup"
            aria-label="Base de referência"
            className="grid grid-cols-2 gap-1 rounded-[12px] border border-app-border bg-app-sidebar/60 p-1"
          >
            {(['geonet', 'google'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={base === option}
                onClick={() => switchBase(option)}
                className={`flex items-center justify-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[0.82rem] font-semibold transition ${
                  base === option
                    ? 'border border-app-accent-border bg-white text-app-text shadow-sm'
                    : 'border border-transparent text-app-muted hover:bg-white/60'
                }`}
              >
                {option === 'google' ? <GoogleMapsIcon /> : <VtalIcon />}
                {option === 'google' ? 'Google Maps' : 'GEONET'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
            Endereço
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-[12px] border border-app-border bg-white px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setPredictionsOpen(true);
                }}
                onFocus={() => setPredictionsOpen(true)}
                placeholder={
                  base === 'geonet' ? 'Buscar endereço no Geonet…' : 'Buscar endereço no Google Maps…'
                }
                className="h-10 w-full bg-transparent text-[0.86rem] text-app-text outline-none placeholder:text-app-muted"
              />
              {resolving ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-muted" />
              ) : null}
            </div>
            {predictionsVisible ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPredictionsOpen(false)} />
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
                  {base === 'geonet'
                    ? geonetPredictions.map((candidate) => (
                        <button
                          key={candidate.addressId ?? candidate.formattedAddress}
                          type="button"
                          disabled={!candidate.addressId}
                          onClick={() => void selectGeonetCandidate(candidate)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-app-muted" />
                          <span className="min-w-0 flex-1 truncate">{candidate.formattedAddress}</span>
                        </button>
                      ))
                    : googlePredictions.map((prediction) => (
                        <button
                          key={prediction.placeId}
                          type="button"
                          onClick={() => void selectGooglePrediction(prediction)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-app-muted" />
                          <span className="min-w-0 flex-1 truncate">{prediction.description}</span>
                        </button>
                      ))}
                </div>
              </>
            ) : null}
          </div>
          {!selected ? (
            <p className="text-[0.76rem] text-app-muted">
              Só é possível salvar depois de escolher um endereço da lista.
            </p>
          ) : null}
        </div>

        {/* Localização e Precisão só aparecem depois de um candidato escolhido — nada de
            campo vazio à espera de preenchimento manual. */}
        {selected ? (
          <div className="grid gap-2 rounded-[14px] border border-app-border p-3">
            <div className="flex min-w-0 items-center gap-2.5 py-0.5">
              <Crosshair className="h-4 w-4 shrink-0 text-app-muted" aria-hidden />
              <span className="font-mono text-[0.8rem] text-app-text">
                [{selected.coordinates[0].toFixed(5)}, {selected.coordinates[1].toFixed(5)}]
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2.5 py-0.5">
              <Target className="h-4 w-4 shrink-0 text-app-muted" aria-hidden />
              {selected.source === 'geonet' ? (
                <GeonetPrecisionBadge method={selected.precisionRaw} />
              ) : (
                <PrecisionBadge locationType={selected.precisionRaw} />
              )}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 border-t border-app-border pt-4">
          <button type="button" onClick={onClose} className="geo-btn secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
