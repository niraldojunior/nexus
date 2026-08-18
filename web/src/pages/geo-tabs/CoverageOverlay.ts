// Camada de calor da cobertura GPON desenhada num <canvas> sobre o mapa (REQ-MOD01-014).
//
// É um google.maps.OverlayView com um canvas no pane `overlayLayer` (abaixo dos marcadores,
// então não rouba o clique/hover que consulta o endereço do ponto). Canvas — e não N objetos
// google.maps.Polygon — porque cada Polygon é um path SVG: dezenas de milhares deles travam o
// mapa, enquanto o canvas desenha tudo em poucos ms.
//
// Desenha os polígonos de bairro/município/estado (LOD por escala — ver coverageLevelForScale)
// como caminhos preenchidos no canvas. A cor sai de coverageColor: matiz pela disponibilidade.
// O canvas é reposicionado a cada `draw` para cobrir exatamente a viewport. (Os níveis fine/
// coarse — grade de calor por célula — existem na API para testes, mas o frontend nunca os
// pede; este overlay não tem mais o caminho de desenho por célula.)
//
// A projeção lng/lat→pixel usa uma transformação AFIM própria (buildFastProjection), calculada
// uma vez por `draw` a partir dos dois cantos da viewport — não `fromLatLngToDivPixel` por
// vértice (LatLng + trig do Google): na visão Brasil isso são ~180 mil alocações por redesenho
// de pan/zoom. Cai no `toLocal` exato (mais caro) só se a viewport cruzar o antimeridiano, onde
// a transformação linear não vale.

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

type Viewport = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function boundsOverlap(area: [number, number, number, number], viewport: Viewport): boolean {
  return (
    area[0] <= viewport.maxLng &&
    area[2] >= viewport.minLng &&
    area[1] <= viewport.maxLat &&
    area[3] >= viewport.minLat
  );
}

// Transformação AFIM lng/lat→pixel-local, calibrada pelos dois cantos da viewport (já
// projetados pelo Google em `draw`). Web Mercator é linear em (x,y) projetado — só troca de
// escala por zoom e de origem por pan — então essa transformação vale para QUALQUER ponto
// dentro (ou perto) da mesma viewport, sem precisar de `fromLatLngToDivPixel` (LatLng + trig)
// de novo. `null` se a base for degenerada (viewport de largura/altura ~0 em Mercator).
function buildFastProjection(
  a: { lng: number; lat: number; x: number; y: number },
  b: { lng: number; lat: number; x: number; y: number },
): ((lng: number, lat: number) => [number, number] | null) | null {
  const [ax, ay] = lngLatToMercator(a.lng, a.lat);
  const [bx, by] = lngLatToMercator(b.lng, b.lat);
  const dx = bx - ax;
  const dy = by - ay;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0 || dy === 0) return null;
  const scaleX = (b.x - a.x) / dx;
  const scaleY = (b.y - a.y) / dy;
  return (lng: number, lat: number) => {
    const [x, y] = lngLatToMercator(lng, lat);
    return [a.x + (x - ax) * scaleX, a.y + (y - ay) * scaleY];
  };
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

      const swLatLng = bounds.getSouthWest();
      const neLatLng = bounds.getNorthEast();
      const viewport = {
        minLng: swLatLng.lng(),
        minLat: swLatLng.lat(),
        maxLng: neLatLng.lng(),
        maxLat: neLatLng.lat(),
      };
      // Só usa a projeção rápida quando a viewport não cruza o antimeridiano (sw.lng() >
      // ne.lng() sinaliza isso) — fora do Brasil, mas o fallback exato cobre o caso.
      const fast =
        viewport.minLng <= viewport.maxLng
          ? buildFastProjection(
              { lng: viewport.minLng, lat: viewport.minLat, x: sw.x - left, y: sw.y - top },
              { lng: viewport.maxLng, lat: viewport.maxLat, x: ne.x - left, y: ne.y - top },
            )
          : null;
      this.drawAreas(context, data, fast ?? toLocal, viewport);
    }

    private drawAreas(
      context: CanvasRenderingContext2D,
      coverage: CoverageResponse,
      toLocal: (lng: number, lat: number) => [number, number] | null,
      viewport: Viewport,
    ): void {
      for (const area of coverage.areas) {
        // Culling por bbox: pula área que não toca a viewport — dispensável quando o backend já
        // recorta pelo bbox pedido, mas o bbox pedido tem folga (ver useGponCoverage), então
        // algumas áreas da resposta ficam fora da viewport exibida agora.
        if (area.bounds && !boundsOverlap(area.bounds, viewport)) continue;

        const neighborhood = coverage.neighborhoods[area.neighborhoodIndex];
        const ratio = neighborhood?.availabilityRatio ?? 0;
        context.fillStyle = coverageFill(ratio, 0, { solid: true });

        if (area.bounds) {
          const a = toLocal(area.bounds[0], area.bounds[1]);
          const b = toLocal(area.bounds[2], area.bounds[3]);
          if (a && b) {
            const w = Math.abs(b[0] - a[0]);
            const h = Math.abs(b[1] - a[1]);
            // Polígono sub-pixel (visão de país/estado, muitos municípios pequenos): um
            // retângulo de 2 px representa a área tão bem quanto o contorno suavizado, sem
            // iterar as dezenas de vértices do traçado.
            if (w < 2 && h < 2) {
              const x = Math.min(a[0], b[0]);
              const y = Math.min(a[1], b[1]);
              context.fillRect(x - 1, y - 1, 2, 2);
              continue;
            }
          }
        }

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

  return {
    setData: (next) => {
      data = next;
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      if (!data) return null;
      return hitTestAreas(data, lng, lat);
    },
    destroy: () => overlay.setMap(null),
  };
}

// Ponto-em-polígono (ray casting) sobre os polígonos de bairro/município/estado, respeitando
// buracos (um ponto dentro de um buraco não está no polígono). O bbox filtra a maior parte dos
// candidatos antes do ray casting — importa na visão de país, com milhares de polígonos.
function hitTestAreas(
  data: CoverageResponse,
  lng: number,
  lat: number,
): CoverageNeighborhood | null {
  for (const area of data.areas) {
    if (area.bounds && !pointInBounds(area.bounds, lng, lat)) continue;
    if (pointInPolygon(area, lng, lat)) {
      return data.neighborhoods[area.neighborhoodIndex] ?? null;
    }
  }
  return null;
}

function pointInBounds(
  bounds: [number, number, number, number],
  lng: number,
  lat: number,
): boolean {
  return lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];
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
