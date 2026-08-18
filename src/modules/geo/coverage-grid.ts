// Núcleo do mapa de calor de cobertura GPON (REQ-MOD01-014).
//
// A partir da posição das CDOs (caixas de distribuição óptica) de um município, produz:
//   · uma GRADE de células de 150 m com quantas CDOs (total e disponíveis) cobrem cada
//     célula — o campo de densidade que o mapa pinta em verde/vermelho;
//   · o POLÍGONO de cobertura de cada bairro (um por componente conexo da grade daquele
//     bairro), como GeoJSON `Polygon` (anel externo + buracos);
//   · a ESTATÍSTICA por bairro (contagem real de CDOs, disponibilidade, área coberta).
//
// Cada CDO cobre 300 m lineares (mesmo raio da aba de Viabilidade). A consolidação desses
// discos é feita por células numa grade global em Web Mercator (EPSG:3857) — global, e não
// por município, para a API poder agregar 150 m → 750 m sem costura entre cidades. A
// distorção do Mercator é irrelevante para um mapa de calor; por isso o TESTE de raio é
// feito em metros verdadeiros (haversine do centro da célula à CDO), não em unidades
// projetadas.
//
// Tudo aqui é função pura (sem banco, sem I/O): o serviço de leitura e o script de carga
// (`scripts/build-gpon-coverage.mjs`, via `dist/`) compõem em cima, e os testes exercitam
// o algoritmo isolado.

import type { GeoJSONPolygon } from './domain.js';

// Raio de cobertura de uma CDO, em metros lineares. (A aba de Viabilidade usa o seu próprio
// raio em useAddressViability — são features distintas e podem divergir.)
export const COVERAGE_RADIUS_METERS = 200;

// Lado da célula da grade usada para TRAÇAR o polígono de cobertura, em metros. 50 m dá 6
// células por raio: a borda do polígono fica a ~300 m ± meia célula das CDOs (respeitando o
// raio de 300 m), bem mais suave que os antigos 150 m. É resolução de traçado — o mapa desenha
// o polígono resultante, não as células.
export const COVERAGE_CELL_METERS = 50;

// Fator de agregação da grade grossa (750 m): a API soma 5×5 células finas num GROUP BY.
export const COVERAGE_COARSE_FACTOR = 5;

// Célula de traçado dos níveis agregados (escala de município/estado) que
// scripts/build-gpon-coverage.mjs grava em geo_gpon_coverage_area (ver GeoCoverageService). Estes
// níveis NÃO re-estampam os pontos com um raio maior — isso incharia a mancha muito além da
// cobertura real (uma CDO isolada "pintando" um disco de 2 km em vez dos 200 m reais, criando
// falso positivo de cobertura em área sem CDO nenhuma). Em vez disso, `aggregateCells` agrega a
// grade fina já estampada em COVERAGE_CELL_METERS/COVERAGE_RADIUS_METERS (o raio real) para esta
// resolução mais grossa — só a resolução de TRAÇADO muda por nível; a área coberta é sempre a
// verdadeira, nunca maior.
export const COVERAGE_CITY_CELL_METERS = 500;
export const COVERAGE_UF_CELL_METERS = 2000;

// Tamanho mínimo (em células) de um componente conexo para virar polígono. Numa área densa,
// onde bairros vizinhos se sobrepõem, o "bairro dominante por célula" (dominantNeighborhood)
// deixa fragmentos de 1-3 células para o bairro perdedor — sobras do disco de 200 m que o
// vizinho mais denso não engoliu. Um CDO isolado (sem vizinho concorrente) sempre produz bem
// mais que isso (o próprio disco de 200 m já cobre dezenas de células de 50 m); abaixo do
// piso, o componente é ruído de fronteira, não uma área real — descartado antes de traçar
// (a estatística do bairro em neighborhoodStats não é afetada: conta os CDOs reais, não as
// células desenhadas).
export const COVERAGE_MIN_COMPONENT_CELLS = 6;

// Iterações de corner-cutting (Chaikin) sobre o anel já simplificado por Douglas-Peucker. 2
// iterações bastam para a escada de célula virar curva contínua; cada iteração dobra os
// vértices — o DP de limpeza logo depois devolve a contagem a um patamar razoável.
export const COVERAGE_SMOOTH_ITERATIONS = 2;

// ε (em frações de célula) do Douglas-Peucker de limpeza pós-Chaikin: remove os pontos que o
// corner-cutting insere no meio dos trechos já retos, sem reintroduzir canto.
const SMOOTH_CLEANUP_EPSILON = 0.08;

// Raio da Terra do EPSG:3857 (esfera de Mercator) e da haversine em WGS84. É a mesma
// constante que o Google usa para projetar tiles.
const EARTH_RADIUS_M = 6378137;

// Latitude limite do Web Mercator (onde tan() estoura). Nada no Brasil chega perto, mas o
// clamp protege contra coordenada anômala vinda da carga.
const MAX_MERCATOR_LAT = 85.05112878;

export type CdoPoint = {
  lng: number;
  lat: number;
  // true = CDO Ativa (disponível); false = Bloqueada/Suspensa (indisponível). C6: a CDO
  // terminada não entra na cobertura — quem chama já a exclui.
  available: boolean;
  // Chave de agregação do bairro (`<uf>|<city>|<neighborhood>`), estável e única.
  neighborhoodKey: string;
  neighborhood: string;
  city: string;
  uf: string;
};

export type CoverageCell = {
  gridX: number;
  gridY: number;
  cdoTotal: number;
  cdoAvailable: number;
  // Bairro dominante da célula (a que mais contribuiu; empate → CDO mais próxima).
  neighborhoodKey: string;
};

export type NeighborhoodStat = {
  key: string;
  neighborhood: string;
  city: string;
  uf: string;
  // Contagem REAL de CDOs do bairro (não a soma de células, que multiplica de propósito).
  cdoTotal: number;
  cdoAvailable: number;
  cdoUnavailable: number;
  // cdoAvailable / cdoTotal, em [0,1]. 0 quando o bairro não tem CDO (não deve ocorrer).
  availabilityRatio: number;
  cellCount: number;
  coveredAreaKm2: number;
};

// Um componente conexo (4-vizinhança) da grade de um bairro → uma linha de Location.
export type CoverageComponent = {
  neighborhoodKey: string;
  geometry: GeoJSONPolygon;
  cells: CoverageCell[];
};

export type CoverageResult = {
  components: CoverageComponent[];
  neighborhoods: NeighborhoodStat[];
  cellMeters: number;
  radiusMeters: number;
};

// --------------------------------------------------------------- projeção Mercator ----

export function lngLatToMercator(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const x = ((lng * Math.PI) / 180) * EARTH_RADIUS_M;
  const y = Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 180 / 2)) * EARTH_RADIUS_M;
  return [x, y];
}

export function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = ((x / EARTH_RADIUS_M) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * 180) / Math.PI;
  return [lng, lat];
}

// Haversine própria (o backend não importa de web/src) — distância verdadeira em metros.
export function haversineMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const cellKey = (gridX: number, gridY: number): string => `${gridX},${gridY}`;

// ------------------------------------------------------------------ acumulação ----

type CellAccumulator = {
  gridX: number;
  gridY: number;
  cdoTotal: number;
  cdoAvailable: number;
  tally: Map<string, number>;
  nearestKey: string;
  nearestDist: number;
};

// Carimba os discos de cobertura das CDOs numa grade de células e resolve o bairro
// dominante de cada célula. Exportado à parte do traçado de polígonos para o teste poder
// verificar a acumulação sem passar pela geometria.
export function stampCells(
  cdos: CdoPoint[],
  cellMeters: number,
  radiusMeters: number,
): CoverageCell[] {
  const cells = new Map<string, CellAccumulator>();

  for (const cdo of cdos) {
    const [x, y] = lngLatToMercator(cdo.lng, cdo.lat);
    // O raio de 300 m em metros verdadeiros vira mais unidades projetadas quanto mais
    // longe do equador (fator sec(lat)). Inflamos o retângulo de candidatas por esse
    // fator; o corte redondo real é a haversine do centro de cada célula, abaixo.
    const cos = Math.cos((cdo.lat * Math.PI) / 180);
    const scale = Math.abs(cos) > 1e-6 ? 1 / Math.abs(cos) : 1e6;
    const radiusProj = radiusMeters * scale;
    const gxMin = Math.floor((x - radiusProj) / cellMeters);
    const gxMax = Math.floor((x + radiusProj) / cellMeters);
    const gyMin = Math.floor((y - radiusProj) / cellMeters);
    const gyMax = Math.floor((y + radiusProj) / cellMeters);

    for (let gx = gxMin; gx <= gxMax; gx += 1) {
      for (let gy = gyMin; gy <= gyMax; gy += 1) {
        const centerX = (gx + 0.5) * cellMeters;
        const centerY = (gy + 0.5) * cellMeters;
        const [clng, clat] = mercatorToLngLat(centerX, centerY);
        const dist = haversineMeters(cdo.lng, cdo.lat, clng, clat);
        if (dist > radiusMeters) continue;

        const id = cellKey(gx, gy);
        let acc = cells.get(id);
        if (!acc) {
          acc = {
            gridX: gx,
            gridY: gy,
            cdoTotal: 0,
            cdoAvailable: 0,
            tally: new Map(),
            nearestKey: cdo.neighborhoodKey,
            nearestDist: Infinity,
          };
          cells.set(id, acc);
        }
        acc.cdoTotal += 1;
        if (cdo.available) acc.cdoAvailable += 1;
        acc.tally.set(cdo.neighborhoodKey, (acc.tally.get(cdo.neighborhoodKey) ?? 0) + 1);
        if (dist < acc.nearestDist) {
          acc.nearestDist = dist;
          acc.nearestKey = cdo.neighborhoodKey;
        }
      }
    }
  }

  return [...cells.values()].map((acc) => ({
    gridX: acc.gridX,
    gridY: acc.gridY,
    cdoTotal: acc.cdoTotal,
    cdoAvailable: acc.cdoAvailable,
    neighborhoodKey: dominantNeighborhood(acc),
  }));
}

// Bairro que mais CDOs contribuíram à célula; no empate, o da CDO mais próxima do centro
// (e, se ainda empatar, ordem lexicográfica, para ser determinístico).
function dominantNeighborhood(acc: CellAccumulator): string {
  let maxCount = 0;
  for (const count of acc.tally.values()) maxCount = Math.max(maxCount, count);
  const contenders = [...acc.tally.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([key]) => key);
  if (contenders.length === 1) return contenders[0] ?? acc.nearestKey;
  if (contenders.includes(acc.nearestKey)) return acc.nearestKey;
  return contenders.sort()[0] ?? acc.nearestKey;
}

// ------------------------------------------------------- estatística por bairro ----

export function neighborhoodStats(
  cdos: CdoPoint[],
  cells: CoverageCell[],
  cellMeters: number,
): NeighborhoodStat[] {
  const byKey = new Map<string, NeighborhoodStat>();
  for (const cdo of cdos) {
    let stat = byKey.get(cdo.neighborhoodKey);
    if (!stat) {
      stat = {
        key: cdo.neighborhoodKey,
        neighborhood: cdo.neighborhood,
        city: cdo.city,
        uf: cdo.uf,
        cdoTotal: 0,
        cdoAvailable: 0,
        cdoUnavailable: 0,
        availabilityRatio: 0,
        cellCount: 0,
        coveredAreaKm2: 0,
      };
      byKey.set(cdo.neighborhoodKey, stat);
    }
    stat.cdoTotal += 1;
    if (cdo.available) stat.cdoAvailable += 1;
  }

  // Área verdadeira da célula corrige a inflação do Mercator pela latitude do seu centro:
  // o lado projetado é `cellMeters`, o lado no chão é `cellMeters * cos(lat)`.
  for (const cell of cells) {
    const stat = byKey.get(cell.neighborhoodKey);
    if (!stat) continue;
    stat.cellCount += 1;
    const centerY = (cell.gridY + 0.5) * cellMeters;
    const [, clat] = mercatorToLngLat(0, centerY);
    const groundSide = cellMeters * Math.cos((clat * Math.PI) / 180);
    stat.coveredAreaKm2 += (groundSide * groundSide) / 1_000_000;
  }

  for (const stat of byKey.values()) {
    stat.cdoUnavailable = stat.cdoTotal - stat.cdoAvailable;
    stat.availabilityRatio = stat.cdoTotal > 0 ? stat.cdoAvailable / stat.cdoTotal : 0;
    stat.coveredAreaKm2 = round(stat.coveredAreaKm2, 4);
    stat.availabilityRatio = round(stat.availabilityRatio, 4);
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------- componentes conexos ----

// Flood-fill 4-vizinhança sobre as células de um bairro → lista de componentes conexos.
export function connectedComponents(cells: CoverageCell[]): CoverageCell[][] {
  const byId = new Map<string, CoverageCell>();
  for (const cell of cells) byId.set(cellKey(cell.gridX, cell.gridY), cell);

  const seen = new Set<string>();
  const components: CoverageCell[][] = [];

  for (const cell of cells) {
    const startId = cellKey(cell.gridX, cell.gridY);
    if (seen.has(startId)) continue;
    const component: CoverageCell[] = [];
    const stack = [cell];
    seen.add(startId);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      const neighbors: Array<[number, number]> = [
        [current.gridX + 1, current.gridY],
        [current.gridX - 1, current.gridY],
        [current.gridX, current.gridY + 1],
        [current.gridX, current.gridY - 1],
      ];
      for (const [nx, ny] of neighbors) {
        const nid = cellKey(nx, ny);
        if (seen.has(nid)) continue;
        const neighbor = byId.get(nid);
        if (!neighbor) continue;
        seen.add(nid);
        stack.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

// ---------------------------------------------------------------- traçado de anéis ----

type Point = [number, number];
type Segment = { from: Point; to: Point };

const pointKey = (p: Point): string => `${p[0]},${p[1]}`;

// Traça o contorno de um componente conexo em coordenadas de canto de grade (inteiras).
// Cada célula preenchida contribui com as arestas cujo vizinho do outro lado NÃO pertence
// ao componente; as arestas são orientadas CCW (interior à esquerda), então o anel externo
// sai anti-horário e os buracos, horário — a mesma convenção do GeoJSON (RFC 7946).
function boundaryRings(cellSet: Set<string>, cells: CoverageCell[]): Point[][] {
  const segments: Segment[] = [];
  for (const cell of cells) {
    const { gridX: gx, gridY: gy } = cell;
    // Arestas em coordenada de canto: célula (gx,gy) ocupa de (gx,gy) a (gx+1,gy+1).
    if (!cellSet.has(cellKey(gx, gy - 1))) segments.push({ from: [gx, gy], to: [gx + 1, gy] }); // base
    if (!cellSet.has(cellKey(gx + 1, gy)))
      segments.push({ from: [gx + 1, gy], to: [gx + 1, gy + 1] }); // direita
    if (!cellSet.has(cellKey(gx, gy + 1)))
      segments.push({ from: [gx + 1, gy + 1], to: [gx, gy + 1] }); // topo
    if (!cellSet.has(cellKey(gx - 1, gy))) segments.push({ from: [gx, gy + 1], to: [gx, gy] }); // esquerda
  }

  // Índice start→segmentos, para costurar os anéis seguindo os pontos. Num vértice de
  // pinça (duas células só encostando no canto) há duas saídas; escolher qualquer uma
  // fecha os dois anéis mesmo assim, e a simplificação depois lima o artefato.
  const byStart = new Map<string, Segment[]>();
  for (const segment of segments) {
    const key = pointKey(segment.from);
    const list = byStart.get(key) ?? [];
    list.push(segment);
    byStart.set(key, list);
  }

  const used = new Set<Segment>();
  const rings: Point[][] = [];
  for (const segment of segments) {
    if (used.has(segment)) continue;
    const ring: Point[] = [segment.from];
    let current: Segment | undefined = segment;
    while (current && !used.has(current)) {
      used.add(current);
      ring.push(current.to);
      const candidates: Segment[] = byStart.get(pointKey(current.to)) ?? [];
      current = candidates.find((candidate: Segment) => !used.has(candidate));
    }
    if (ring.length >= 4) rings.push(ring);
  }

  return rings;
}

// Área com sinal (shoelace) em coordenada de grade: > 0 = CCW (externo), < 0 = CW (buraco).
function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

// Remove pontos colineares consecutivos (colapsa trechos retos da escada em um segmento).
function dropCollinear(ring: Point[]): Point[] {
  if (ring.length <= 4) return ring;
  const start = ring[0]!;
  const end = ring[ring.length - 1]!;
  const closed = start[0] === end[0] && start[1] === end[1];
  const pts = closed ? ring.slice(0, -1) : ring.slice();
  const out: Point[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const cross =
      (cur[0] - prev[0]) * (next[1] - prev[1]) - (cur[1] - prev[1]) * (next[0] - prev[0]);
    if (cross !== 0) out.push(cur);
  }
  const first = out[0];
  if (first) out.push(first);
  return out;
}

// Douglas–Peucker em coordenada de grade, ε em frações de célula (~meia célula) — suaviza
// a escada de uma fronteira diagonal em uma reta.
function douglasPeucker(ring: Point[], epsilon: number): Point[] {
  if (ring.length <= 4) return ring;
  const start = ring[0]!;
  const end = ring[ring.length - 1]!;
  const closed = start[0] === end[0] && start[1] === end[1];
  const open = closed ? ring.slice(0, -1) : ring.slice();
  if (open.length < 3) return ring;

  const simplifyOpen = (points: Point[]): Point[] => {
    if (points.length < 3) return points;
    let maxDist = 0;
    let index = 0;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    for (let i = 1; i < points.length - 1; i += 1) {
      const dist = perpendicularDistance(points[i]!, first, last);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist <= epsilon) return [first, last];
    const left = simplifyOpen(points.slice(0, index + 1));
    const right = simplifyOpen(points.slice(index));
    return [...left.slice(0, -1), ...right];
  };

  // Anel fechado: parte em dois nos extremos mais distantes para o DP não colapsar o loop.
  const anchor = open[0]!;
  let far = 1;
  let farDist = -1;
  for (let i = 1; i < open.length; i += 1) {
    const point = open[i]!;
    const d = (point[0] - anchor[0]) ** 2 + (point[1] - anchor[1]) ** 2;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const firstHalf = simplifyOpen(open.slice(0, far + 1));
  const secondHalf = simplifyOpen([...open.slice(far), anchor]);
  const merged = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  const mergedFirst = merged[0];
  if (mergedFirst) merged.push(mergedFirst);
  return merged.length >= 4 ? merged : ring;
}

// Corner-cutting de Chaikin: substitui cada vértice pelos pontos a 1/4 e 3/4 da aresta que
// chega e da que sai, produzindo uma curva contínua que nunca sai do polígono de controle (a
// mancha não incha nem invade célula sem CDO). Preserva o sentido do percurso, então
// `signedArea` continua classificando externo (CCW) vs. buraco (CW) sem mudança.
function chaikin(ring: Point[], iterations: number): Point[] {
  if (iterations <= 0 || ring.length <= 4) return ring;
  const start = ring[0]!;
  const end = ring[ring.length - 1]!;
  const closed = start[0] === end[0] && start[1] === end[1];
  let points = closed ? ring.slice(0, -1) : ring.slice();
  if (points.length < 3) return ring;

  for (let iter = 0; iter < iterations; iter += 1) {
    const next: Point[] = [];
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      next.push([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]);
      next.push([a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75]);
    }
    points = next;
  }

  const first = points[0]!;
  return [...points, first];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  const cross = Math.abs(dx * (lineStart[1] - point[1]) - (lineStart[0] - point[0]) * dy);
  return cross / length;
}

// Converte um anel em coordenada de canto de grade para GeoJSON [lng, lat] arredondado.
function ringToLngLat(ring: Point[], cellMeters: number): Point[] {
  return ring.map(([cx, cy]) => {
    const [lng, lat] = mercatorToLngLat(cx * cellMeters, cy * cellMeters);
    return [round(lng, 6), round(lat, 6)] as Point;
  });
}

// Um componente conexo → um Polygon (anel externo CCW + buracos CW). Traça, simplifica em
// grade, arredonda os cantos (Chaikin) e só então projeta para lng/lat. Exportado para o teste
// exercitar o caso de buraco.
export function tracePolygon(
  cells: CoverageCell[],
  cellMeters: number,
  options: { smoothIterations?: number } = {},
): GeoJSONPolygon | null {
  const smoothIterations = options.smoothIterations ?? COVERAGE_SMOOTH_ITERATIONS;
  const cellSet = new Set(cells.map((cell) => cellKey(cell.gridX, cell.gridY)));
  const rings = boundaryRings(cellSet, cells)
    .map((ring) => douglasPeucker(dropCollinear(ring), 0.5))
    .map((ring) => douglasPeucker(chaikin(ring, smoothIterations), SMOOTH_CLEANUP_EPSILON))
    .filter((ring) => ring.length >= 4);
  if (rings.length === 0) return null;

  const outers = rings.filter((ring) => signedArea(ring) > 0);
  const holes = rings.filter((ring) => signedArea(ring) < 0);
  // Um componente 4-conexo tem exatamente um anel externo; se o traçado devolveu mais de
  // um (dado degenerado), fica com o de maior área e os demais viram buraco descartável.
  const outer = outers.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
  if (!outer) return null;

  const coordinates: Point[][] = [ringToLngLat(outer, cellMeters)];
  for (const hole of holes) coordinates.push(ringToLngLat(hole, cellMeters));
  return { type: 'Polygon', coordinates };
}

// ----------------------------------------------------------------- composição ----

// Agrupa por bairro, separa em componentes conexos e traça o polígono de cada um — a metade
// "geometria" de buildCoverage, isolada para poder rodar sobre uma grade AGREGADA (ver
// aggregateCells) em vez de sempre estampar os pontos de novo. Exportada para os níveis
// city/uf (scripts/build-gpon-coverage.mjs) reusarem sem duplicar o agrupamento/traçado.
export function tracePolygonsFromCells(
  cells: CoverageCell[],
  cellMeters: number,
  options: { smoothIterations?: number; minComponentCells?: number } = {},
): CoverageComponent[] {
  const smoothIterations = options.smoothIterations ?? COVERAGE_SMOOTH_ITERATIONS;
  const minComponentCells = options.minComponentCells ?? COVERAGE_MIN_COMPONENT_CELLS;

  const cellsByNeighborhood = new Map<string, CoverageCell[]>();
  for (const cell of cells) {
    const list = cellsByNeighborhood.get(cell.neighborhoodKey) ?? [];
    list.push(cell);
    cellsByNeighborhood.set(cell.neighborhoodKey, list);
  }

  const components: CoverageComponent[] = [];
  for (const [neighborhoodKey, neighborhoodCells] of cellsByNeighborhood) {
    for (const componentCells of connectedComponents(neighborhoodCells)) {
      if (componentCells.length < minComponentCells) continue;
      const geometry = tracePolygon(componentCells, cellMeters, { smoothIterations });
      if (!geometry) continue;
      components.push({ neighborhoodKey, geometry, cells: componentCells });
    }
  }
  return components;
}

// Agrega uma grade FINA já estampada (o raio real de cobertura, COVERAGE_RADIUS_METERS) para uma
// resolução mais grossa — uma célula grossa existe SE E SÓ SE alguma célula fina dela existir,
// com a estatística somada e o bairro dominante entre as finas que a compõem. Ao contrário de
// re-estampar os pontos com um raio maior (o que fazia o nível estado "pintar" um disco de 2 km
// por CDO, bem além dos 200 m reais — falso positivo de cobertura), a área coberta nunca cresce
// além do que a grade fina já mostrava; só a resolução do traçado muda. `remapKey` deriva a
// chave do nível mais grosso a partir da chave (de bairro) da célula fina — ex.:
// "UF|Cidade|Bairro" → cidade "UF|Cidade" → estado "UF".
export function aggregateCells(
  fineCells: CoverageCell[],
  fineCellMeters: number,
  coarseCellMeters: number,
  remapKey: (fineNeighborhoodKey: string) => string,
): CoverageCell[] {
  const factor = Math.max(1, Math.round(coarseCellMeters / fineCellMeters));
  const buckets = new Map<
    string,
    { gridX: number; gridY: number; total: number; available: number; tally: Map<string, number> }
  >();
  for (const cell of fineCells) {
    const gridX = Math.floor(cell.gridX / factor);
    const gridY = Math.floor(cell.gridY / factor);
    const key = cellKey(gridX, gridY);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { gridX, gridY, total: 0, available: 0, tally: new Map() };
      buckets.set(key, bucket);
    }
    bucket.total += cell.cdoTotal;
    bucket.available += cell.cdoAvailable;
    const aggregatedKey = remapKey(cell.neighborhoodKey);
    bucket.tally.set(aggregatedKey, (bucket.tally.get(aggregatedKey) ?? 0) + cell.cdoTotal);
  }

  return [...buckets.values()].map((bucket) => {
    let dominant = '';
    let best = -1;
    for (const [key, count] of bucket.tally) {
      if (count > best) {
        best = count;
        dominant = key;
      }
    }
    return {
      gridX: bucket.gridX,
      gridY: bucket.gridY,
      cdoTotal: bucket.total,
      cdoAvailable: bucket.available,
      neighborhoodKey: dominant,
    };
  });
}

export function buildCoverage(
  cdos: CdoPoint[],
  options: {
    cellMeters?: number;
    radiusMeters?: number;
    smoothIterations?: number;
    minComponentCells?: number;
  } = {},
): CoverageResult {
  const cellMeters = options.cellMeters ?? COVERAGE_CELL_METERS;
  const radiusMeters = options.radiusMeters ?? COVERAGE_RADIUS_METERS;
  const smoothIterations = options.smoothIterations ?? COVERAGE_SMOOTH_ITERATIONS;
  const minComponentCells = options.minComponentCells ?? COVERAGE_MIN_COMPONENT_CELLS;

  const cells = stampCells(cdos, cellMeters, radiusMeters);
  const neighborhoods = neighborhoodStats(cdos, cells, cellMeters);
  const components = tracePolygonsFromCells(cells, cellMeters, { smoothIterations, minComponentCells });

  return { components, neighborhoods, cellMeters, radiusMeters };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
