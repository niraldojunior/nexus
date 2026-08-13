// Viabilidade de um endereço: quais caixas de distribuição óptica existem perto o
// bastante para puxar um drop novo, e quanto cabo isso custaria a pé.
//
// É consulta visual, não TMF645 (Service Qualification, Módulo 4): nada é persistido e
// nenhum evento é publicado — o hook só cruza o endereço (Módulo 1) com a planta
// externa já inventariada (Módulo 2).

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchViewportResources, type GeoTreeNode } from '../services/geoTreeApi';
import { resourceTypeCode } from '../utils/resourceIcon';
import {
  bboxAround,
  computeWalkRouteMatrix,
  haversineMeters,
  type LngLat,
} from '../utils/googleRoutes';

// Raio de busca pedido pela operação: 300 m lineares em volta do endereço.
export const VIABILITY_RADIUS_METERS = 300;

// Teto de candidatos mandados à Routes API. O raio já limita o volume, mas um trecho
// muito denso pode ter dezenas de caixas — e cada destino da matriz é um elemento
// cobrado. 25 é folgado para a decisão (quem instala olha as primeiras) e barato.
export const VIABILITY_MAX_CANDIDATES = 25;

// Teto do bbox mandado ao servidor. Uma caixa de 600 m tem ordem de dezenas de
// recursos; o limite é só válvula contra coordenada anômala.
const VIEWPORT_LIMIT = 2000;

export type ViabilityCandidate = {
  // A CDO em si — carrega status, tipo e coordenada, então a lista desenha o mesmo
  // ícone que a árvore de hierarquia sem tabela de cor própria.
  node: GeoTreeNode;
  point: LngLat;
  // Distância usada para ordenar e exibir: a pé quando a Routes API respondeu,
  // linha reta quando não (ver `mode`).
  distanceMeters: number;
  durationSeconds?: number;
  // Distância em linha reta, sempre presente — é o que qualifica o raio de 300 m.
  straightMeters: number;
  mode: 'walk' | 'straight';
};

export type ViabilityStatus = 'idle' | 'loading' | 'ready' | 'error';

export type UseAddressViabilityResult = {
  status: ViabilityStatus;
  candidates: ViabilityCandidate[];
  error: string | null;
};

// Só caixa de distribuição serve de origem de drop. No inventário todas as caixas
// entram como `resourceType` CTO (ver glossário: CDOE é cadastrada com tipo CTO), então
// o tipo sozinho traria também CEO/CEOS — que são caixas de emenda, onde não se puxa
// drop. O nome é o que separa as duas famílias.
const CDO_NAME = /^\s*CDO/i;

const isEligibleCdo = (node: GeoTreeNode): boolean =>
  node.kind === 'resource' &&
  node.geometry?.type === 'Point' &&
  resourceTypeCode({ resourceType: node.resourceType, name: node.label }) === 'CTO' &&
  CDO_NAME.test(node.label);

// Requisições em voo por endereço. O React.StrictMode monta o componente duas vezes e o
// backend de dev atende em série — sem deduplicar, abrir a aba custa o dobro (mesmo
// padrão de useGeoDirectory/useGeoTree).
const inFlight = new Map<string, Promise<ViabilityCandidate[]>>();

const addressKey = ([lng, lat]: LngLat): string => `${lng.toFixed(6)},${lat.toFixed(6)}`;

async function fetchViability(origin: LngLat): Promise<ViabilityCandidate[]> {
  const bounds = bboxAround(origin, VIABILITY_RADIUS_METERS);
  const nodes = await fetchViewportResources(bounds, { limit: VIEWPORT_LIMIT });

  // O bbox é o quadrado que circunscreve o círculo; o corte redondo é aqui.
  const nearby = nodes
    .filter(isEligibleCdo)
    .map((node) => {
      const point = (node.geometry as { coordinates: LngLat }).coordinates;
      return { node, point, straightMeters: haversineMeters(origin, point) };
    })
    .filter((candidate) => candidate.straightMeters <= VIABILITY_RADIUS_METERS)
    .sort((left, right) => left.straightMeters - right.straightMeters)
    .slice(0, VIABILITY_MAX_CANDIDATES);

  if (!nearby.length) return [];

  const legs = await computeWalkRouteMatrix(
    origin,
    nearby.map((candidate) => candidate.point),
  );

  const candidates: ViabilityCandidate[] = nearby
    .map((candidate, index) => {
      const leg = legs[index];
      return leg
        ? {
            ...candidate,
            distanceMeters: leg.distanceMeters,
            durationSeconds: leg.durationSeconds,
            mode: 'walk' as const,
          }
        : { ...candidate, distanceMeters: candidate.straightMeters, mode: 'straight' as const };
    })
    // O raio de 300 m vale para a distância exibida: a rota a pé pode ser bem maior que a
    // linha reta (contorna quadra, atravessa rua), então uma CDO com linha reta < 300 m
    // mas caminhada > 300 m não é viável. O fallback de linha reta já passou pelo corte
    // redondo acima, então esse filtro só descarta rotas a pé longas demais.
    .filter((candidate) => candidate.distanceMeters <= VIABILITY_RADIUS_METERS);

  // Rota a pé primeiro (é a distância pedida); as que caíram no fallback de linha reta
  // vão para o fim, porque a distância delas não é comparável com a das outras.
  return candidates.sort((left, right) => {
    if (left.mode !== right.mode) return left.mode === 'walk' ? -1 : 1;
    return left.distanceMeters - right.distanceMeters;
  });
}

/**
 * Candidatas a ponto de instalação para um endereço, ordenadas da menor para a maior
 * distância a pé. Só busca quando `enabled` — a aba de Viabilidade é opt-in, e a
 * chamada à Routes API é cobrada por elemento.
 */
export function useAddressViability(
  coordinates: LngLat | null,
  enabled: boolean,
): UseAddressViabilityResult {
  const [status, setStatus] = useState<ViabilityStatus>('idle');
  const [candidates, setCandidates] = useState<ViabilityCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Estabiliza a dependência do efeito: `coordinates` é um array novo a cada render do
  // pai, mas o que importa é o par de números. O array em si fica num ref, para o
  // efeito lê-lo sem entrar na lista de dependências e refazer a busca à toa.
  const key = useMemo(() => (coordinates ? addressKey(coordinates) : null), [coordinates]);
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;

  useEffect(() => {
    const origin = coordinatesRef.current;
    if (!enabled || !origin || !key) {
      setStatus('idle');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    const pending = inFlight.get(key) ?? fetchViability(origin);
    inFlight.set(key, pending);

    pending
      .then((result) => {
        if (!active) return;
        setCandidates(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setCandidates([]);
        setError(err instanceof Error ? err.message : 'Falha ao consultar viabilidade');
        setStatus('error');
      })
      .finally(() => {
        inFlight.delete(key);
      });

    return () => {
      active = false;
    };
  }, [enabled, key]);

  return { status, candidates, error };
}
