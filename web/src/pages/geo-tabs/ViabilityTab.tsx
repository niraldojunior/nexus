import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResourceIcon } from '../../components/ResourceIcon';
import {
  useAddressViability,
  VIABILITY_RADIUS_METERS,
  type ViabilityCandidate,
} from '../../hooks/useAddressViability';
import { computeWalkRoute, type LngLat } from '../../utils/googleRoutes';
import { formatDropDistance } from '../../utils/dropSimulation';

// Simulação do drop entre o endereço e a CDO escolhida, para o mapa desenhar.
// `approximate` marca o traçado que não veio da rota a pé — é o segmento direto entre
// os dois pontos, não um caminho real.
export type DropSimulation = {
  candidateId: string;
  origin: LngLat;
  path: LngLat[];
  distanceMeters: number;
  approximate: boolean;
};

export type ViabilityTabProps = {
  origin: LngLat;
  onSimulate: (simulation: DropSimulation | null) => void;
};

// Rótulo do estado da caixa. Não usa o `StatusBadge` dos painéis de Site/Recurso de
// propósito: aquele mapeia o `GeoStatus` canônico (planned/active/suspended/terminated)
// e o acervo de caixas tem `inactive`, que cairia sem rótulo nem classe. Aqui o que
// interessa são as três situações que a operação reconhece — e a cor de cada uma já vem
// do próprio ícone (ver resourceIcon.ts), igual à árvore de hierarquia.
const statusLabel = (status: string | undefined): string =>
  status === 'active' ? 'Ativa' : status === 'suspended' ? 'Suspensa' : 'Indefinida';

const formatWalkTime = (seconds: number | undefined): string | null => {
  if (!seconds) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min a pé`;
};

/**
 * Aba de Viabilidade do painel de Endereço: as caixas de distribuição óptica (CDOE e
 * CDOI) num raio de 300 m lineares do endereço, ordenadas pela distância **a pé** — o
 * proxy do lançamento real, que segue a rua e não a linha reta.
 *
 * Clicar numa delas pede o traçado à Routes API e devolve a simulação do drop para o
 * mapa desenhar (ver `onSimulate` e GoogleMapPanel em GeoPage).
 */
export function ViabilityTab({ origin, onSimulate }: ViabilityTabProps) {
  const { status, candidates, error } = useAddressViability(origin, true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Traçado já resolvido por CDO — reclicar não paga outra chamada à Routes API.
  const pathCache = useRef<Map<string, LngLat[]>>(new Map());

  // A simulação pertence ao endereço que a gerou: sair da aba, trocar de endereço ou
  // fechar o painel tem de apagá-la do mapa, senão sobra um drop pendurado num ponto
  // que não está mais selecionado. O callback vai por ref para a limpeza rodar só na
  // desmontagem de verdade, mesmo que o pai troque a identidade da função.
  const onSimulateRef = useRef(onSimulate);
  onSimulateRef.current = onSimulate;
  useEffect(() => () => onSimulateRef.current(null), []);

  const select = useCallback(
    async (candidate: ViabilityCandidate) => {
      const id = candidate.node.id;
      setSelectedId(id);

      const cached = pathCache.current.get(id);
      if (cached) {
        onSimulate({
          candidateId: id,
          origin,
          path: cached,
          distanceMeters: candidate.distanceMeters,
          approximate: candidate.mode === 'straight',
        });
        return;
      }

      // Sem rota a pé conhecida não vale bater na API de novo — o segmento direto é a
      // representação honesta do que se sabe.
      if (candidate.mode === 'straight') {
        const path: LngLat[] = [origin, candidate.point];
        pathCache.current.set(id, path);
        onSimulate({
          candidateId: id,
          origin,
          path,
          distanceMeters: candidate.distanceMeters,
          approximate: true,
        });
        return;
      }

      setPendingId(id);
      const route = await computeWalkRoute(origin, candidate.point);
      setPendingId((current) => (current === id ? null : current));
      const path = route?.path ?? [origin, candidate.point];
      pathCache.current.set(id, path);
      onSimulate({
        candidateId: id,
        origin,
        path,
        distanceMeters: route?.distanceMeters ?? candidate.distanceMeters,
        approximate: !route,
      });
    },
    [onSimulate, origin],
  );

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-[0.86rem] text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Procurando CDOs num raio de {VIABILITY_RADIUS_METERS} m...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Não foi possível consultar a viabilidade deste endereço. {error}
      </div>
    );
  }

  if (!candidates.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.86rem] text-app-muted">
        Nenhuma CDO num raio de {VIABILITY_RADIUS_METERS} m deste endereço.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="px-1 text-[0.78rem] leading-snug text-app-muted">
        {candidates.length === 1
          ? '1 CDO encontrada'
          : `${candidates.length} CDOs encontradas`}{' '}
        num raio de {VIABILITY_RADIUS_METERS} m
      </p>

      <ul className="grid gap-0.5">
        {candidates.map((candidate) => {
          const id = candidate.node.id;
          const selected = id === selectedId;
          const walkTime = formatWalkTime(candidate.durationSeconds);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => void select(candidate)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition ${
                  selected ? 'bg-app-accent-soft text-app-text' : 'text-app-text hover:bg-app-accent-soft'
                }`}
              >
                <ResourceIcon
                  resource={{ resourceType: 'CTO', status: candidate.node.status }}
                  variant="badge"
                  size={22}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.85rem] font-medium leading-tight">
                    {candidate.node.label}
                  </span>
                  <span className="block truncate text-[0.72rem] text-app-muted">
                    {statusLabel(candidate.node.status)}
                    {walkTime ? ` · ${walkTime}` : null}
                    {candidate.mode === 'straight' ? ' · linha reta' : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {pendingId === id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-app-muted" aria-hidden="true" />
                  ) : null}
                  <span className="text-[0.82rem] font-semibold tabular-nums text-app-text">
                    {candidate.mode === 'straight' ? '≈ ' : ''}
                    {formatDropDistance(candidate.distanceMeters)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
