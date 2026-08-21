// Densidade agregada da planta desenhada num <canvas> sobre o mapa (Fase 4, issue #69).
//
// É a contraparte de InfraOverlay para zoom aberto: acima de PASSIVE_INFRA_MAX_SCALE_METERS a
// feature individual some (780 mil pontos não são só caros — são ilegíveis) e entra esta camada,
// que responde "onde HÁ planta" em vez de "qual é cada item". As duas nunca desenham juntas
// (ver densityVisibleAtScale × useMapTiles), então o custo de manter dois canvases é nulo.
//
// Mesma casca de CoverageOverlay/InfraOverlay: OverlayView + canvas no pane `overlayLayer`,
// `pointerEvents:none`, projeção afim rápida reusada de CoverageOverlay.

import type { GoogleMapInstance, GoogleMapsApi } from '../../utils/googleMaps';
import { buildFastProjection } from './CoverageOverlay';
import type { MapDensityCell, MapDensityResponse } from '../../services/geoMapDensityApi';

type Maps = GoogleMapsApi['maps'];
type Project = (lng: number, lat: number) => [number, number] | null;

// Faixa de raio do disco, em px. O piso garante que uma célula com pouquíssima planta ainda
// seja visível (senão "vazio" e "quase vazio" viram a mesma coisa); o teto impede que a célula
// mais densa vire uma mancha que engole as vizinhas.
const MIN_RADIUS_PX = 4;
const MAX_RADIUS_PX = 26;

// Raio de captura do hover, somado ao raio do disco — o alvo é generoso porque a célula
// representa uma área, não um objeto pontual.
const HIT_SLACK_PX = 4;

export type DensityOverlayHandle = {
  setData: (data: MapDensityResponse | null) => void;
  // Célula sob a coordenada (para o balão de hover), ou null fora de qualquer disco.
  hitTest: (lng: number, lat: number) => MapDensityCell | null;
  destroy: () => void;
};

type DrawnCell = { x: number; y: number; radius: number; cell: MapDensityCell };

// Raio proporcional à contagem, em escala de RAIZ e não linear: a área do disco é que deve
// crescer com a contagem (área ∝ r²), então r ∝ √n. Com escala linear, uma célula 100× mais
// densa viraria um disco 100× maior em raio — 10.000× em área — e esmagaria o resto do mapa.
// Normalizado pela célula mais densa da resposta, não por um máximo global: o contraste é
// sempre relativo ao que está na tela.
export function densityRadiusPx(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = Math.sqrt(Math.min(count, maxCount) / maxCount);
  return MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * ratio;
}

export function createDensityOverlay(maps: Maps, map: GoogleMapInstance): DensityOverlayHandle {
  let data: MapDensityResponse | null = null;
  let lastProject: Project | null = null;
  let drawn: DrawnCell[] = [];

  class DensityOverlayView extends maps.OverlayView {
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

      drawn = [];
      lastProject = null;
      if (!data || data.cells.length === 0) return;

      const toLocal: Project = (lng, lat) => {
        const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(lat, lng));
        return pixel ? [pixel.x - left, pixel.y - top] : null;
      };
      const swLatLng = bounds.getSouthWest();
      const neLatLng = bounds.getNorthEast();
      const minLng = swLatLng.lng();
      const maxLng = neLatLng.lng();
      // Mesma guarda de antimeridiano de CoverageOverlay: a projeção afim não vale se a
      // viewport cruza a linha de data.
      const fast =
        minLng <= maxLng
          ? buildFastProjection(
              { lng: minLng, lat: swLatLng.lat(), x: sw.x - left, y: sw.y - top },
              { lng: maxLng, lat: neLatLng.lat(), x: ne.x - left, y: ne.y - top },
            )
          : null;
      const project = fast ?? toLocal;
      lastProject = project;

      const maxCount = data.cells.reduce((best, cell) => Math.max(best, cell.count), 0);

      for (const cell of data.cells) {
        const local = project(cell.lng, cell.lat);
        if (!local) continue;
        const [x, y] = local;
        const radius = densityRadiusPx(cell.count, maxCount);
        if (radius <= 0) continue;

        // Disco translúcido com contorno: o preenchimento fraco deixa discos vizinhos somarem
        // visualmente (onde há mais planta fica mais escuro, sem precisar de heatmap de verdade),
        // e o contorno mantém a célula legível quando está isolada.
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = 'rgba(36, 48, 65, 0.28)';
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = 'rgba(36, 48, 65, 0.55)';
        context.stroke();

        drawn.push({ x, y, radius, cell });
      }
    }
  }

  const overlay = new DensityOverlayView();
  overlay.setMap(map);

  return {
    setData: (next) => {
      data = next;
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      if (!lastProject) return null;
      const query = lastProject(lng, lat);
      if (!query) return null;
      const [qx, qy] = query;
      let nearest: DrawnCell | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const item of drawn) {
        const distance = Math.hypot(item.x - qx, item.y - qy);
        if (distance <= item.radius + HIT_SLACK_PX && distance < nearestDistance) {
          nearest = item;
          nearestDistance = distance;
        }
      }
      return nearest ? nearest.cell : null;
    },
    destroy: () => overlay.setMap(null),
  };
}
