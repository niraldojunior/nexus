import { useEffect, useId, useRef, useState } from 'react';
import { Boxes, Layers, MapPin, Network, Radar, X, type LucideIcon } from 'lucide-react';
import {
  MAP_LAYER_GROUPS,
  groupVisibility,
  type MapLayerGroupId,
  type MapLayerId,
  type MapLayerVisibility,
} from '../../utils/mapLayers';
import { NETWIN_POLE_MAX_SCALE_METERS, poleVisibleAtScale } from '../../utils/mapScale';

// Ícone por grupo/camada — só para varredura visual rápida na lista; o rótulo é quem carrega
// o significado (ver AGENTS.md §10, tokens do design system, nenhuma cor hardcoded aqui).
const GROUP_ICONS: Record<MapLayerGroupId, LucideIcon> = {
  locations: MapPin,
  coverage: Radar,
  resources: Boxes,
  netwinInfrastructure: Network,
};

export type MapLayerControlProps = {
  layers: MapLayerVisibility;
  onToggleLayer: (id: MapLayerId) => void;
  onToggleGroup: (groupId: MapLayerGroupId) => void;
  onReset: () => void;
  allVisible: boolean;
  // Escala atual do mapa (ver mapScale.ts) — só usada para inibir camadas com régua própria
  // mais restrita que o toggle manual (hoje só o Poste, ver POLE_SCALE_HINT). `undefined`/`null`
  // = sem informação de escala ainda (primeiro render antes do `idle` do mapa): nada é inibido.
  scaleMeters?: number | null;
};

// Switch pequeno (role="switch") no mesmo padrão de trilha do design system: acento ligado,
// borda neutra desligada. Sem dependência externa — é só um botão com duas classes.
function LayerSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
        disabled
          ? 'cursor-not-allowed border-app-border bg-app-sidebar opacity-50'
          : checked
            ? 'border-app-accent-border bg-app-accent'
            : 'border-app-border bg-app-sidebar'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

// Camada com régua de escala própria, mais restrita que o toggle manual: fora da faixa, o
// switch fica visível mas inibido (RN "só exiba postes em escala de detalhe") — desligar sem
// mexer na preferência salva do usuário evitaria a régua reaparecer sozinha ao dar zoom, então
// em vez de forçar `visibility` para `false`, só bloqueamos a interação e explicamos o motivo.
function disabledHint(layerId: MapLayerId, scaleMeters: number | null | undefined): string | null {
  if (layerId !== 'netwinPole') return null;
  if (scaleMeters === undefined || scaleMeters === null) return null;
  if (poleVisibleAtScale(scaleMeters)) return null;
  return `Só aparece em escala de detalhe (≤ ${NETWIN_POLE_MAX_SCALE_METERS} m) — aproxime o zoom`;
}

// Controle de camadas do mapa (RF-011, REQ-MOD01-011): liga/desliga o que o mapa busca e
// desenha, agrupado em Locais/Cobertura/Recursos — cada camada corta fetch, não só o desenho
// (ver useMapTiles, filtro client-side sobre GET /v1/geo/map/tile). Fica ancorado no
// canto superior direito, aberto/fechado como o MUB (ver MapBaseLayerSelector) — mesmo cromo
// de controle flutuante (shadow-map-control, foco em app-accent).
export function MapLayerControl({
  layers,
  onToggleLayer,
  onToggleGroup,
  onReset,
  allVisible,
  scaleMeters,
}: MapLayerControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  return (
    <div
      ref={containerRef}
      className="absolute right-3 top-[72px] z-30 md:top-3"
      data-testid="map-layer-control"
    >
      <button
        type="button"
        aria-label="Camadas do mapa"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Camadas do mapa"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-app-border bg-white text-app-text shadow-map-control transition hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
      >
        <Layers className="h-5 w-5" aria-hidden="true" />
        {!allVisible ? (
          <span
            aria-hidden="true"
            title="Uma ou mais camadas estão desligadas"
            className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-app-accent"
          />
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Camadas do mapa"
          className="absolute right-0 top-[calc(100%+8px)] max-h-[calc(100vh-96px)] w-[248px] overflow-y-auto rounded-[14px] border border-app-border bg-white p-2 shadow-map-control-lg"
        >
          <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
            <span className="text-[0.8rem] font-semibold text-app-text">Camadas</span>
            <button
              type="button"
              aria-label="Fechar camadas do mapa"
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-[8px] text-app-muted transition hover:bg-app-accent-soft hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {MAP_LAYER_GROUPS.map((group) => {
              const GroupIcon = GROUP_ICONS[group.id];
              const state = groupVisibility(layers, group.id);
              return (
                <div key={group.id} className="rounded-[10px] border border-app-border/70 p-2">
                  <div className="flex items-center gap-2">
                    <GroupIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                    <span className="flex-1 truncate text-[0.82rem] font-semibold text-app-text">
                      {group.label}
                    </span>
                    {group.children.length > 1 ? (
                      <LayerSwitch
                        checked={state !== 'none'}
                        label={`Alternar grupo ${group.label}`}
                        onChange={() => onToggleGroup(group.id)}
                      />
                    ) : null}
                  </div>

                  {group.children.length > 1 ? (
                    <div className="mt-1.5 flex flex-col gap-1.5 border-t border-app-border/60 pt-1.5">
                      {group.children.map((child) => {
                        const hint = disabledHint(child.id, scaleMeters);
                        return (
                          <div
                            key={child.id}
                            className="flex items-center gap-2 pl-1"
                            title={hint ?? undefined}
                          >
                            <p
                              className={`min-w-0 flex-1 truncate text-[0.78rem] ${hint ? 'text-app-muted' : 'text-app-text'}`}
                            >
                              {child.label}
                            </p>
                            <LayerSwitch
                              checked={layers[child.id]}
                              label={child.label}
                              onChange={() => onToggleLayer(child.id)}
                              disabled={hint !== null}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1.5 flex items-center justify-end border-t border-app-border/60 pt-1.5">
                      <LayerSwitch
                        checked={layers[group.children[0]!.id]}
                        label={group.children[0]!.label}
                        onChange={() => onToggleLayer(group.children[0]!.id)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!allVisible ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-2 w-full rounded-[10px] px-2 py-1.5 text-center text-[0.76rem] font-semibold text-app-muted transition hover:bg-app-accent-soft hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            >
              Restaurar padrão
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
