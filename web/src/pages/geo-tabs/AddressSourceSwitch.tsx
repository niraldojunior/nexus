import { GoogleMapsIcon, VtalIcon } from './AddressSourceIcons';
import type { AddressLocationResolution, AddressPinLocation } from './addressLocationResolution';

// Seletor de base dentro da caixa de divergência: escolhe qual fonte (GEONET × Google Maps)
// crava o alfinete no mapa e alimenta a análise de viabilidade. GEONET vem primeiro por ser a
// base preferencial da V.tal (ver selectPinLocation). Substitui os antigos botões de rodapé de
// cada card — a decisão agora fica junto do texto que explica a divergência.
export function AddressSourceSwitch({
  resolution,
  onChoose,
}: {
  resolution: Extract<AddressLocationResolution, { mode: 'conflict' }>;
  onChoose: (source: AddressPinLocation['source']) => void;
}) {
  const order: AddressPinLocation['source'][] = ['geonet', 'google'];
  return (
    <div
      role="radiogroup"
      aria-label="Base de localização"
      className="mt-2 grid grid-cols-2 gap-1 rounded-[12px] border border-app-border bg-app-sidebar/60 p-1"
    >
      {order.map((source) => {
        const location = resolution[source];
        const selected = resolution.selectedSource === source;
        const label = source === 'google' ? 'Google Maps' : 'GEONET';
        return (
          <button
            key={source}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChoose(source)}
            className={`flex min-w-0 flex-col gap-0.5 rounded-[9px] px-2.5 py-1.5 text-left transition ${
              selected
                ? 'border border-app-accent-border bg-white text-app-text shadow-sm'
                : 'border border-transparent text-app-muted hover:bg-white/60'
            }`}
          >
            <span className="flex items-center gap-1.5 text-[0.78rem] font-semibold">
              {source === 'google' ? <GoogleMapsIcon /> : <VtalIcon />}
              {label}
            </span>
            <span className="truncate text-[0.68rem] leading-tight text-app-muted">
              {location.precision}
            </span>
          </button>
        );
      })}
    </div>
  );
}
