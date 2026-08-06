import { Check, Map as MapIcon, Satellite } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { GoogleMapTypeId } from '../../utils/googleMaps';

export type MapBaseLayer = {
  id: string;
  label: string;
  googleMapTypeId: GoogleMapTypeId;
  previewTone: 'mapa' | 'satelite';
};

export const BASE_MAP_LAYERS: readonly MapBaseLayer[] = [
  {
    id: 'roadmap',
    label: 'Mapa',
    googleMapTypeId: 'roadmap',
    previewTone: 'mapa',
  },
  {
    id: 'satellite',
    label: 'Satélite',
    googleMapTypeId: 'hybrid',
    previewTone: 'satelite',
  },
] as const;

type MapBaseLayerSelectorProps = {
  options?: readonly MapBaseLayer[];
  value: string;
  onChange: (layerId: string) => void;
};

function MapPreviewArtwork({ tone }: { tone: MapBaseLayer['previewTone'] }) {
  if (tone === 'mapa') {
    return (
      <>
        <div className="absolute inset-0 bg-[#dcebd5]" />
        <div className="absolute -left-2 top-1 h-4 w-16 rotate-[8deg] rounded-full bg-[#8cc8df]" />
        <div className="absolute right-1 top-1 h-5 w-5 rounded-[4px] bg-[#b8d7a9]" />
        <div className="absolute -left-3 top-[45%] h-2.5 w-[calc(100%+24px)] -rotate-[12deg] border-y border-[#d5d9dc] bg-white" />
        <div className="absolute left-[42%] -top-3 h-[calc(100%+24px)] w-2.5 rotate-[9deg] border-x border-[#d5d9dc] bg-white" />
        <div className="absolute bottom-1 left-1 h-2 w-3 rounded-[2px] bg-[#f2c98c]" />
        <div className="absolute bottom-1 right-1 h-3 w-4 rounded-[2px] bg-[#edb38f]" />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-0 bg-[#476747]" />
      <div className="absolute left-0 top-0 h-[48%] w-[46%] bg-[#78905d]" />
      <div className="absolute right-0 top-0 h-[42%] w-[48%] bg-[#a69a68]" />
      <div className="absolute bottom-0 left-0 h-[46%] w-[38%] bg-[#5a794f]" />
      <div className="absolute bottom-0 right-0 h-[52%] w-[56%] bg-[#6f8250]" />
      <div className="absolute -left-3 top-[44%] h-3 w-[calc(100%+24px)] -rotate-[12deg] border-y-2 border-[#c6c2b7] bg-[#777a78]" />
      <div className="absolute right-1 top-1 h-2.5 w-3 rotate-[8deg] bg-[#c8b5a2] shadow-sm" />
      <div className="absolute bottom-1 right-2 h-2 w-4 -rotate-[10deg] bg-[#b9c1c3] shadow-sm" />
      <div className="absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full bg-[#284a34]" />
    </>
  );
}

function LayerPreview({
  layer,
  size = 'compact',
  showLabel = false,
}: {
  layer: MapBaseLayer;
  size?: 'compact' | 'expanded';
  showLabel?: boolean;
}) {
  const Icon = layer.previewTone === 'mapa' ? MapIcon : Satellite;
  const dimensions =
    size === 'compact' ? 'h-12 w-[68px] rounded-[7px]' : 'h-12 w-[76px] rounded-[7px]';

  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden border border-white/70 shadow-sm ${dimensions}`}
    >
      <MapPreviewArtwork tone={layer.previewTone} />
      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-[6px] bg-white/90 text-app-text shadow-sm">
        <Icon className="h-3 w-3" />
      </span>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_55%,rgba(36,48,65,0.08))]" />
      {showLabel ? (
        <span className="absolute inset-x-0 bottom-0 bg-app-ink/80 px-1 py-0.5 text-center text-[0.66rem] font-semibold leading-4 text-white">
          {layer.label}
        </span>
      ) : null}
    </div>
  );
}

export function MapBaseLayerSelector({
  options = BASE_MAP_LAYERS,
  value,
  onChange,
}: MapBaseLayerSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedLayer = options.find((option) => option.id === value) ?? options[0];
  const alternateLayer =
    options.length === 2 ? options.find((option) => option.id !== selectedLayer?.id) : undefined;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!selectedLayer) return null;

  if (alternateLayer) {
    return (
      <div className="absolute bottom-8 left-3 z-30">
        <button
          type="button"
          aria-label={`Trocar base cartográfica para ${alternateLayer.label}`}
          title={`Trocar para ${alternateLayer.label}`}
          onClick={() => onChange(alternateLayer.id)}
          className="rounded-[10px] border border-app-border bg-white p-1 shadow-soft-lg transition hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
        >
          <LayerPreview layer={alternateLayer} showLabel />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute bottom-8 left-3 z-30">
      <button
        type="button"
        aria-label={`Selecionar base cartográfica. Atual: ${selectedLayer.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={`Base cartográfica: ${selectedLayer.label}`}
        onClick={() => setOpen((current) => !current)}
        className="rounded-[10px] border border-app-border bg-white p-1 shadow-soft-lg transition hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
      >
        <LayerPreview layer={selectedLayer} />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Opções de base cartográfica"
          className="absolute bottom-[calc(100%+8px)] left-0 flex gap-1.5 rounded-[12px] border border-app-border bg-white p-1.5 shadow-soft-lg"
        >
          {options.map((option) => {
            const selected = option.id === selectedLayer.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`relative grid w-[84px] justify-items-center gap-1 rounded-[8px] p-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
                  selected ? 'bg-app-accent-soft' : 'hover:bg-app-accent-soft'
                }`}
              >
                <LayerPreview layer={option} size="expanded" />
                <span className="text-[0.72rem] font-semibold leading-4 text-app-text">
                  {option.label}
                </span>
                {selected ? (
                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-accent text-app-text shadow-sm">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
