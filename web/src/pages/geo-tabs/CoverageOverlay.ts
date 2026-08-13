// Camada de calor da cobertura GPON desenhada num <canvas> sobre o mapa (REQ-MOD01-014).
//
// É um google.maps.OverlayView com um canvas no pane `overlayLayer` (abaixo dos marcadores,
// então não rouba o clique/hover que consulta o endereço do ponto). Canvas — e não N objetos
// google.maps.Polygon — porque cada Polygon é um path SVG: dezenas de milhares deles travam o
// mapa, enquanto o canvas desenha tudo em poucos ms.
//
// Desenha células (níveis fine/coarse) como retângulos e polígonos de bairro (nível area) como
// caminhos preenchidos. A cor sai de coverageColor: matiz pela disponibilidade, alfa pela
// densidade. O canvas é reposicionado a cada `draw` para cobrir exatamente a viewport, e cada
// geometria é projetada com `fromLatLngToDivPixel`.

import type {
  CoverageArea,
  CoverageNeighborhood,
  CoverageResponse,
} from '../../services/geoCoverageApi';
import type { GoogleMapInstance, GoogleMapsApi } from '../../utils/googleMaps';
import { coverageFill } from '../../utils/coverageColor';

const EARTH_RADIUS_M = 6378137;
const MAX_LAT = 85.05112878;

function lngLatToMercator(lng: number, lat: number): [number, number] {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = ((lng * Math.PI) / 180) * EARTH_RADIUS_M;
  const y = Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 180 / 2)) * EARTH_RADIUS_M;
  return [x, y];
}

function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = ((x / EARTH_RADIUS_M) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * 180) / Math.PI;
  return [lng, lat];
}

type PathSink = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'quadraticCurveTo'>;

// Caminho fechado por PONTOS MÉDIOS: cada vértice do anel vira o ponto de controle de uma
// quadrática entre o meio da aresta que chega e o meio da que sai. É a versão contínua
// (invariante a zoom) do corner-cutting já aplicado na geração (coverage-grid.ts) — aqui
// suaviza o que sobrar do traçado em grade, sem inchar nem encolher a silhueta (a curva nunca
// sai do polígono de controle). Com menos de 3 pontos cai no `lineTo` reto de sempre.
export function traceSmoothRing(sink: PathSink, points: Array<[number, number]>): void {
  const n = points.length;
  if (n === 0) return;
  if (n < 3) {
    sink.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < n; i += 1) sink.lineTo(points[i]![0], points[i]![1]);
    return;
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const start = mid(points[n - 1]!, points[0]!);
  sink.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    const m = mid(p, q);
    sink.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
}

export type CoverageOverlayHandle = {
  setData: (data: CoverageResponse | null) => void;
  // Bairro sob a coordenada (para o balão de hover), ou null fora da mancha.
  hitTest: (lng: number, lat: number) => CoverageNeighborhood | null;
  destroy: () => void;
};

type Maps = GoogleMapsApi['maps'];

export function createCoverageOverlay(maps: Maps, map: GoogleMapInstance): CoverageOverlayHandle {
  let data: CoverageResponse | null = null;
  // Índice de célula "gx,gy" → tupla, reconstruído a cada setData para o hit-test do hover.
  let cellIndex: Map<string, number[]> | null = null;

  class CoverageOverlay extends maps.OverlayView {
    private canvas: HTMLCanvasElement | null = null;

    public onAdd(): void {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.pointerEvents = 'none';
      canvas.style.left = '0';
      canvas.style.top = '0';
      this.canvas = canvas;
      this.getPanes()?.overlayLayer.appendChild(canvas);
    }

    public onRemove(): void {
      this.canvas?.parentNode?.removeChild(this.canvas);
      this.canvas = null;
    }

    public draw(): void {
      const canvas = this.canvas;
      const projection = this.getProjection();
      if (!canvas || !projection) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const bounds = map.getBounds();
      if (!bounds) return;
      // Canta o canvas exatamente sobre a viewport, em coordenadas do pane (div pixel), e
      // desenha cada ponto em `fromLatLngToDivPixel - origem`.
      const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
      const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
      if (!sw || !ne) return;
      const left = Math.min(sw.x, ne.x);
      const top = Math.min(sw.y, ne.y);
      const width = Math.max(1, Math.abs(ne.x - sw.x));
      const height = Math.max(1, Math.abs(sw.y - ne.y));
      const dpr = window.devicePixelRatio || 1;

      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!data) return;

      const toLocal = (lng: number, lat: number): [number, number] | null => {
        const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(lat, lng));
        return pixel ? [pixel.x - left, pixel.y - top] : null;
      };

      if (data.level === 'area') this.drawAreas(context, data, toLocal);
      else this.drawCells(context, data, toLocal);
    }

    private drawCells(
      context: CanvasRenderingContext2D,
      coverage: CoverageResponse,
      toLocal: (lng: number, lat: number) => [number, number] | null,
    ): void {
      const gridSize = coverage.grid.sizeMeters;
      for (const cell of coverage.cells) {
        const [gx, gy, total, available] = cell;
        if (gx === undefined || gy === undefined) continue;
        const [lng0, lat0] = mercatorToLngLat(gx * gridSize, gy * gridSize);
        const [lng1, lat1] = mercatorToLngLat((gx + 1) * gridSize, (gy + 1) * gridSize);
        const a = toLocal(lng0, lat0);
        const b = toLocal(lng1, lat1);
        if (!a || !b) continue;
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        const w = Math.abs(b[0] - a[0]);
        const h = Math.abs(b[1] - a[1]);
        const ratio = (total ?? 0) > 0 ? (available ?? 0) / (total ?? 1) : 0;
        context.fillStyle = coverageFill(ratio, total ?? 0);
        // +1 px cobre o filete transparente entre células vizinhas (arredondamento de pixel).
        context.fillRect(x, y, w + 1, h + 1);
      }
    }

    private drawAreas(
      context: CanvasRenderingContext2D,
      coverage: CoverageResponse,
      toLocal: (lng: number, lat: number) => [number, number] | null,
    ): void {
      for (const area of coverage.areas) {
        const neighborhood = coverage.neighborhoods[area.neighborhoodIndex];
        const ratio = neighborhood?.availabilityRatio ?? 0;
        context.fillStyle = coverageFill(ratio, 0, { solid: true });
        context.beginPath();
        for (const ring of area.geometry.coordinates) {
          // GeoJSON fecha o anel repetindo o primeiro ponto no fim — traceSmoothRing já
          // fecha via módulo, então o ponto duplicado sai antes de suavizar.
          const open = ring.length > 1 ? ring.slice(0, -1) : ring;
          const points = open
            .map((vertex) => toLocal(vertex[0], vertex[1]))
            .filter((point): point is [number, number] => point !== null);
          traceSmoothRing(context, points);
          context.closePath();
        }
        // evenodd desenha os buracos (anéis internos horários) como vazios.
        context.fill('evenodd');
      }
    }
  }

  const overlay = new CoverageOverlay();
  overlay.setMap(map);

  const rebuildIndex = (next: CoverageResponse | null): void => {
    if (!next || next.level === 'area') {
      cellIndex = null;
      return;
    }
    const index = new Map<string, number[]>();
    for (const cell of next.cells) {
      if (cell[0] === undefined || cell[1] === undefined) continue;
      index.set(`${cell[0]},${cell[1]}`, cell);
    }
    cellIndex = index;
  };

  return {
    setData: (next) => {
      data = next;
      rebuildIndex(next);
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      if (!data) return null;
      if (data.level === 'area') return hitTestAreas(data, lng, lat);
      if (!cellIndex) return null;
      const [x, y] = lngLatToMercator(lng, lat);
      const gridSize = data.grid.sizeMeters;
      const gx = Math.floor(x / gridSize);
      const gy = Math.floor(y / gridSize);
      const cell = cellIndex.get(`${gx},${gy}`);
      const index = cell?.[4];
      if (index === undefined || index < 0) return null;
      return data.neighborhoods[index] ?? null;
    },
    destroy: () => overlay.setMap(null),
  };
}

// Ponto-em-polígono (ray casting) sobre os polígonos de bairro do nível area, respeitando
// buracos (um ponto dentro de um buraco não está no polígono).
function hitTestAreas(
  data: CoverageResponse,
  lng: number,
  lat: number,
): CoverageNeighborhood | null {
  for (const area of data.areas) {
    if (pointInPolygon(area, lng, lat)) {
      return data.neighborhoods[area.neighborhoodIndex] ?? null;
    }
  }
  return null;
}

function pointInPolygon(area: CoverageArea, lng: number, lat: number): boolean {
  const rings = area.geometry.coordinates;
  const outer = rings[0];
  if (!outer || !ringContains(outer, lng, lat)) return false;
  // Dentro de um buraco (anel interno) → fora do polígono.
  for (let i = 1; i < rings.length; i += 1) {
    const hole = rings[i];
    if (hole && ringContains(hole, lng, lat)) return false;
  }
  return true;
}

function ringContains(ring: Array<[number, number]>, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
