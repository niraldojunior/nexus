import { useState, type FormEvent } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { GeoLocation, GeoSite } from '../../services/geoApi';
import { createResource } from '../../services/resourceApi';
import type { ResourceSpecification } from '../../services/resourceApi';
import { equipmentKindLabel, equipmentKindDescription, equipmentKindColor } from '../../hooks/useEquipmentCatalog';

type Step = 'type' | 'location' | 'details';

export type AddEquipmentModalProps = {
  draftAddress: { street: string; streetNr?: string; city?: string; stateOrProvince?: string; postcode?: string; country: string; coordinates: [number, number]; label: string } | null;
  selectedSite: GeoSite | null;
  equipment: ResourceSpecification[];
  locationById: Map<string, GeoLocation>;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

/**
 * Modal para criar equipamentos (PhysicalResource) com localização geográfica.
 * 3 passos: 1) Escolher tipo, 2) Localização, 3) Detalhes.
 */
export function AddEquipmentModal({
  draftAddress,
  selectedSite,
  equipment,
  locationById,
  onClose,
  onCreated,
}: AddEquipmentModalProps) {
  const [step, setStep] = useState<Step>('type');
  const [resourceSpecificationId, setResourceSpecificationId] = useState(equipment[0]?.id ?? '');
  const [name, setName] = useState(draftAddress ? `${equipment[0]?.name} - ${draftAddress.street}` : '');
  const [serialNumber, setSerialNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedSpec = equipment.find((e) => e.id === resourceSpecificationId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!resourceSpecificationId || !name.trim()) return;
    setSaving(true);
    try {
      await createResource({
        '@type': 'PhysicalResource',
        name,
        resourceSpecificationId,
        serialNumber: serialNumber || undefined,
        status: 'active',
        placeId: draftAddress ? undefined : selectedSite?.place?.id,
        placeType: draftAddress || selectedSite?.place?.id ? 'GeographicLocation' : undefined,
      });
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
              {step === 'type' ? 'Passo 1' : step === 'location' ? 'Passo 2' : 'Passo 3'}
            </div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">
              {step === 'type'
                ? 'Qual equipamento?'
                : step === 'location'
                  ? 'Onde está localizado?'
                  : 'Detalhes do equipamento'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {step === 'type' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {equipment.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => {
                    setResourceSpecificationId(spec.id);
                    setName(`${spec.name}${draftAddress ? ` - ${draftAddress.street}` : ''}`);
                  }}
                  className={`rounded-[18px] border-2 p-4 text-left transition ${
                    resourceSpecificationId === spec.id
                      ? 'border-app-accent-border bg-app-accent-soft'
                      : 'border-app-border hover:border-app-accent-border hover:bg-app-accent-soft'
                  }`}
                >
                  <div className="text-[0.95rem] font-semibold text-app-text">
                    {spec.name}
                  </div>
                  <div className="mt-1 text-[0.75rem] text-app-muted">
                    {spec.description || 'Sem descrição'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'location' && (
            <div className="rounded-[18px] border-2 border-dashed border-app-border p-6 text-center">
              <div className="text-[0.9rem] font-semibold text-app-text">Localização</div>
              <div className="mt-2 text-[0.84rem] text-app-muted">
                {draftAddress ? (
                  <div>
                    <div className="font-semibold text-app-text">{draftAddress.label}</div>
                    <div className="mt-1 text-[0.75rem]">[{draftAddress.coordinates[0].toFixed(5)}, {draftAddress.coordinates[1].toFixed(5)}]</div>
                  </div>
                ) : selectedSite ? (
                  <div>Herdado de <strong>{selectedSite.name}</strong></div>
                ) : (
                  <div className="text-amber-600">⚠ Selecione um ponto no mapa</div>
                )}
              </div>
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Tipo
                  </label>
                  <div className="geo-input mt-2 bg-app-accent-soft text-app-muted">
                    {selectedSpec?.name}
                  </div>
                </div>

                <div>
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Nome
                  </label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="geo-input mt-2"
                    placeholder="ex: Splitter A1"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
                    Número de série
                  </label>
                  <input
                    value={serialNumber}
                    onChange={(event) => setSerialNumber(event.target.value)}
                    className="geo-input mt-2"
                    placeholder="ex: SN-2024-001"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="mt-5 flex justify-between gap-3 border-t border-app-border pt-4">
          <button
            type="button"
            onClick={step === 'type' ? onClose : () => setStep(step === 'details' ? 'location' : 'type')}
            className="geo-btn secondary"
          >
            {step === 'type' ? 'Cancelar' : <><ChevronLeft className="h-4 w-4" /> Voltar</>}
          </button>

          {step === 'type' && (
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
              disabled={saving || !resourceSpecificationId || !name.trim()}
              className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Criar equipamento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
