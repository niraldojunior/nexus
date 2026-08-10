import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResourceIcon } from '../../components/ResourceIcon';
import {
  useAddressViability,
  VIABILITY_RADIUS_METERS,
  type ViabilityCandidate,
} from '../../hooks/useAddressViability';
import { computeWalkRoute, type LngLat } from '../../utils/googleRoutes';
import { formatDropDistance, stitchDropPath } from '../../utils/dropSimulation';
import { shortSubstatus } from '../../utils/substatus';

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

// Traçado resolvido de uma CDO — a parte da simulação que custa uma chamada à Routes
// API (ou o segmento direto, quando não há rota a pé). É o que fica em cache por CDO.
type DropResolution = { path: LngLat[]; distanceMeters: number; approximate: boolean };

export type ViabilityTabProps = {
  origin: LngLat;
  onSimulate: (simulation: DropSimulation | null) => void;
};

// Rótulo do estado da caixa. Não usa o `StatusBadge` dos painéis de Site/Recurso de
// propósito: aquele mapeia o `GeoStatus` canônico (planned/active/suspended/terminated)
// e o acervo de caixas tem `inactive`, que cairia sem rótulo nem classe. Aqui o que
// interessa são as três situações que a operação reconhece — e a cor de cada uma já vem
// do próprio ícone (ver resourceIcon.ts), igual à árvore de hierarquia.
const statusLabel = (status: string | undefined, substatus?: string): string => {
  if (status === 'active') return 'Ativa';
  // Caixa suspensa carrega o motivo (ds_estado_controle na origem) no substatus: mostrá-lo
  // entre parênteses diz por que ela não está viável, na versão curta (ver shortSubstatus).
  if (status === 'suspended') return substatus ? `Suspensa (${shortSubstatus(substatus)})` : 'Suspensa';
  return 'Indefinida';
};

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
  // Traçado já resolvido por CDO — reclicar (ou o double-mount do StrictMode) não paga
  // outra chamada à Routes API. Guarda a *promessa* do traçado, não só o resultado: as
  // duas montagens do StrictMode disparam a auto-seleção antes de a primeira resolver,
  // e compartilhar a promessa em voo é o que mantém uma única chamada à API.
  const resolutionCache = useRef<Map<string, Promise<DropResolution>>>(new Map());

  // A simulação pertence ao endereço que a gerou: sair da aba, trocar de endereço ou
  // fechar o painel tem de apagá-la do mapa, senão sobra um drop pendurado num ponto
  // que não está mais selecionado. `mountedRef` impede que um traçado que resolve
  // depois da desmontagem *de verdade* ressuscite o drop; no double-mount do StrictMode
  // ele volta a true a tempo de a simulação ser redesenhada. O callback vai por ref
  // para a limpeza rodar mesmo que o pai troque a identidade da função.
  const onSimulateRef = useRef(onSimulate);
  onSimulateRef.current = onSimulate;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onSimulateRef.current(null);
    };
  }, []);

  const select = useCallback(
    (candidate: ViabilityCandidate) => {
      const id = candidate.node.id;
      setSelectedId(id);

      let resolution = resolutionCache.current.get(id);
      if (!resolution) {
        if (candidate.mode === 'straight') {
          // Sem rota a pé conhecida não vale bater na API — o segmento direto é a
          // representação honesta do que se sabe.
          resolution = Promise.resolve<DropResolution>({
            path: [origin, candidate.point],
            distanceMeters: candidate.distanceMeters,
            approximate: true,
          });
        } else {
          setPendingId(id);
          resolution = (async (): Promise<DropResolution> => {
            const route = await computeWalkRoute(origin, candidate.point);
            return {
              // Costura o alfinete e a CDO nas pontas do traçado da rua: a Routes API
              // devolve a polyline encaixada na via, sem os pontos reais (ver stitchDropPath).
              path: route
                ? stitchDropPath(origin, route.path, candidate.point)
                : [origin, candidate.point],
              distanceMeters: route?.distanceMeters ?? candidate.distanceMeters,
              approximate: !route,
            };
          })();
        }
        resolutionCache.current.set(id, resolution);
      }

      // O estabelecimento do drop vai por microtask (sempre, mesmo no caso síncrono da
      // linha reta): assim ele pousa *depois* da limpeza on-unmount do double-mount do
      // StrictMode, redesenhando a simulação em vez de deixá-la apagada.
      void resolution.then((resolved) => {
        if (!mountedRef.current) return;
        setPendingId((current) => (current === id ? null : current));
        onSimulateRef.current({ candidateId: id, origin, ...resolved });
      });
    },
    [origin],
  );

  // Abrir a aba já calcula a viabilidade e, assim que a lista chega, seleciona a
  // primeira CDO (a mais perto a pé) — o drop nasce desenhado e a rota já animando, sem
  // exigir clique. Continua respeitando a escolha do usuário: se ele trocou de CDO, é
  // essa que o efeito reestabelece a cada montagem. Refs em vez de deps para não
  // refazer a seleção a cada re-render do pai.
  const selectRef = useRef(select);
  selectRef.current = select;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    if (status !== 'ready' || !candidates.length) return;
    const target =
      candidates.find((candidate) => candidate.node.id === selectedIdRef.current) ?? candidates[0];
    void selectRef.current(target);
  }, [status, candidates]);

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
                  {/* Sem `truncate`: o motivo do substatus pode ser longo e deve quebrar em
                      mais de uma linha em vez de ser cortado (ver shortSubstatus). */}
                  <span className="block break-words text-[0.72rem] leading-tight text-app-muted">
                    {statusLabel(candidate.node.status, candidate.node.detail?.substatus)}
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
