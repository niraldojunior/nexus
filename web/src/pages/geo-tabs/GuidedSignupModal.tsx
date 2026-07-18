import { useState, useMemo, type FormEvent } from 'react';
import { Plus, ChevronLeft, MapPin } from 'lucide-react';
import type { GeoStatus, GeoSpec, GeoSite, GeoAddress, GeoLocation } from '../../services/geoApi';
import { postJson } from '../../services/geoApi';
import { siteKindFromSpec, siteKindLabel, siteKindDescription, formatAddress } from '../../utils/placeLabel';

type Step = 'kind' | 'location' | 'details';

export type GuidedSignupModalProps = {
  draftAddress: { street: string; streetNr?: string; city?: string; stateOrProvince?: string; postcode?: string; country: string; coordinates: [number, number]; label: string } | null;
  selectedSite: GeoSite | null;
  specs: GeoSpec[];
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  addressById: Map<string, GeoAddress>;
  locationById: Map<string, GeoLocation>;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

/**
 * Modal guiado em 3 passos para criar um novo local:
 * 1. Escolher tipo (SiteKind com cards)
 * 2. Localização (ponto no mapa)
 * 3. Detalhes (nome, pai, alimentado por)
 */
export function GuidedSignupModal({
  draftAddress,
  selectedSite,
  specs,
  sites,
  specById,
  addressById,
  locationById,
  onClose,
  onCreated,
}: GuidedSignupModalProps) {
  const [step, setStep] = useState<Step>('kind');
  const [siteSpecificationId, setSiteSpecificationId] = useState(specs[0]?.id ?? '');
  const [name, setName] = useState(draftAddress ? `${siteKindLabel(siteKindFromSpec(specById.get(siteSpecificationId)))?.split('/')[0]} - ${draftAddress.street}` : '');
  const [status, setStatus] = useState<GeoStatus>('planned');
  const [parentSiteId, setParentSiteId] = useState(selectedSite?.id ?? '');
  const [fedBySiteId, setFedBySiteId] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedSpec = specById.get(siteSpecificationId);
  const selectedKind = siteKindFromSpec(selectedSpec);

  const parentOptions = useMemo(
    () => sites.filter((site) => isParentAllowed(selectedSpec, specById.get(site.siteSpecificationId))),
    [selectedSpec, sites, specById],
  );

  const specsByKind = useMemo(() => {
    const map = new Map<string, GeoSpec[]>();
    specs.forEach((spec) => {
      const kind = siteKindFromSpec(spec);
      if (!map.has(kind)) map.set(kind, []);
      map.get(kind)!.push(spec);
    });
    return map;
  }, [specs]);

  const kindOptions = Array.from(specsByKind.keys()).sort();

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
        const inheritedLocation = selectedSite && pointForSite(selectedSite, locationById);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6">
      <div className="w-full max-w-[720px] max-h-[90vh] overflow-auto rounded-[26px] border border-app-border bg-white p-5 shadow-modal">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {step === 'kind' ? 'Passo 1' : step === 'location' ? 'Passo 2' : 'Passo 3'}
            </div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">
              {step === 'kind'
                ? 'O que você está cadastrando?'
                : step === 'location'
                  ? 'Onde está localizado?'
                  : 'Detalhes do local'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {step === 'kind' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {kindOptions.map((kind) => {
                const specsForKind = specsByKind.get(kind) || [];
                const isSelected = selectedKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setSiteSpecificationId(specsForKind[0]?.id ?? '');
                    }}
                    className={`rounded-[18px] border-2 p-4 text-left transition ${
                      isSelected
                        ? 'border-app-accent-border bg-app-accent-soft'
                        : 'border-app-border hover:border-app-accent-border hover:bg-app-accent-soft'
                    }`}
                  >
                    <div className="text-[0.95rem] font-semibold text-app-text">
                      {siteKindLabel(kind)?.split('/')[0] || kind}
                    </div>
                    <div className="mt-1 text-[0.75rem] text-app-muted">
                      {siteKindDescription(kind)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 'location' && (
            <div className="rounded-[18px] border-2 border-dashed border-app-border p-6 text-center">
              <MapPin className="mx-auto mb-3 h-8 w-8 text-app-muted" />
              <div className="text-[0.9rem] font-semibold text-app-text">Localização selecionada</div>
              <div className="mt-2 text-[0.84rem] text-app-muted">
                {draftAddress ? (
                  <div>
                    <div className="font-semibold text-app-text">{draftAddress.label}</div>
                    <div className="mt-1 text-[0.75rem]">[{draftAddress.coordinates[0].toFixed(5)}, {draftAddress.coordinates[1].toFixed(5)}]</div>
                  </div>
                ) : selectedSite ? (
                  <div>Herdado de <strong>{selectedSite.name}</strong></div>
                ) : (
                  <div className="text-amber-600">⚠ Selecione um ponto no mapa para continuar</div>
                )}
              </div>
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Tipo de site
                  </label>
                  <select
                    value={siteSpecificationId}
                    onChange={(event) => setSiteSpecificationId(event.target.value)}
                    className="geo-input mt-2"
                  >
                    <option value="">Selecione...</option>
                    {specs.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Nome do site
                  </label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="geo-input mt-2"
                    placeholder="ex: PI - Rua Miguel de Frias, 380"
                  />
                </div>

                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Status inicial
                  </label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as GeoStatus)}
                    className="geo-input mt-2"
                  >
                    <option value="planned">Planejado</option>
                    <option value="active">Ativo</option>
                    <option value="suspended">Suspenso</option>
                    <option value="terminated">Terminado</option>
                  </select>
                </div>

                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Site pai
                  </label>
                  <select
                    value={parentSiteId}
                    onChange={(event) => setParentSiteId(event.target.value)}
                    className="geo-input mt-2"
                  >
                    <option value="">Nenhum</option>
                    {parentOptions.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Alimentado por
                  </label>
                  <select
                    value={fedBySiteId}
                    onChange={(event) => setFedBySiteId(event.target.value)}
                    className="geo-input mt-2"
                  >
                    <option value="">Não informado</option>
                    {sites
                      .filter((site) => site.id !== selectedSite?.id)
                      .map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="mt-5 flex justify-between gap-3 border-t border-app-border pt-4">
          <button
            type="button"
            onClick={step === 'kind' ? onClose : () => setStep(step === 'details' ? 'location' : 'kind')}
            className="geo-btn secondary"
          >
            {step === 'kind' ? 'Cancelar' : <><ChevronLeft className="h-4 w-4" /> Voltar</>}
          </button>

          {step === 'kind' && (
            <button
              type="button"
              onClick={() => setStep('location')}
              className="geo-btn primary"
            >
              Continuar →
            </button>
          )}

          {step === 'location' && (
            <button
              type="button"
              onClick={() => setStep('details')}
              className="geo-btn primary"
              disabled={!draftAddress && !selectedSite}
            >
              Continuar →
            </button>
          )}

          {step === 'details' && (
            <button
              type="button"
              onClick={submit}
              disabled={saving || !siteSpecificationId || !name.trim()}
              className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Criar local'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function isParentAllowed(child: GeoSpec | undefined, parent: GeoSpec | undefined): boolean {
  if (!child || !parent) return false;
  if (child.id === parent.id) return false;
  return parent.allowedChildSpecIds.includes(child.id) === false;
}

function pointForSite(site: GeoSite, locationById: Map<string, GeoLocation>): [number, number] | null {
  if (site.place?.id) {
    const location = locationById.get(site.place.id);
    if (location?.geometry?.coordinates) {
      return location.geometry.coordinates;
    }
  }
  return null;
}
