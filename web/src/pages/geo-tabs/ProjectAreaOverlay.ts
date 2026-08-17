// Camada das manchas de concentração/dispersão de um Projeto de trabalho (REQ-MOD01-017),
// desenhada num <canvas> sobre o mapa — mesma técnica de CoverageOverlay.ts (google.maps.
// OverlayView com canvas no pane `overlayLayer`, abaixo dos marcadores).
//
// Mais simples que CoverageOverlay: não há níveis fine/coarse/area, é sempre um conjunto fixo
// de polígonos (um por mancha), preenchido e contornado pela classe (concentração/dispersão) —
// ver projectAreaColor.ts. Reusa `traceSmoothRing` (mesmo corner-smoothing por quadrática) e o
// mesmo ray-casting de hit-test com buracos.

import type { ProjectArea } from '../../services/geoProjectApi';
import type { GoogleMapInstance, GoogleMapsApi } from '../../utils/googleMaps';
import { projectAreaFill, projectAreaStroke } from '../../utils/projectAreaColor';
import { traceSmoothRing } from './CoverageOverlay';

export type ProjectAreaOverlayHandle = {
  setData: (areas: ProjectArea[]) => void;
  // Mancha sob a coordenada (para o balão de hover), ou null fora de toda mancha.
  hitTest: (lng: number, lat: number) => ProjectArea | null;
  destroy: () => void;
};

type Maps = GoogleMapsApi['maps'];

export function createProjectAreaOverlay(
  maps: Maps,
  map: GoogleMapInstance,
): ProjectAreaOverlayHandle {
  let areas: ProjectArea[] = [];

  class ProjectAreaOverlayView extends maps.OverlayView {
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
      if (areas.length === 0) return;

      const toLocal = (lng: number, lat: number): [number, number] | null => {
        const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(lat, lng));
        return pixel ? [pixel.x - left, pixel.y - top] : null;
      };

      for (const area of areas) {
        context.fillStyle = projectAreaFill(area.kind);
        context.strokeStyle = projectAreaStroke(area.kind);
        context.lineWidth = 1.5;
        context.beginPath();
        for (const ring of area.geometry.coordinates) {
          // GeoJSON fecha o anel repetindo o primeiro ponto — traceSmoothRing já fecha via
          // módulo, então o ponto duplicado sai antes de suavizar (mesma regra de drawAreas
          // em CoverageOverlay.ts).
          const open = ring.length > 1 ? ring.slice(0, -1) : ring;
          const points = open
            .map((vertex) => toLocal(vertex[0], vertex[1]))
            .filter((point): point is [number, number] => point !== null);
          traceSmoothRing(context, points);
          context.closePath();
        }
        context.fill('evenodd');
        context.stroke();
      }
    }
  }

  const overlay = new ProjectAreaOverlayView();
  overlay.setMap(map);

  return {
    setData: (next) => {
      areas = next;
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      for (const area of areas) {
        if (pointInArea(area, lng, lat)) return area;
      }
      return null;
    },
    destroy: () => overlay.setMap(null),
  };
}

function pointInArea(area: ProjectArea, lng: number, lat: number): boolean {
  const rings = area.geometry.coordinates;
  const outer = rings[0];
  if (!outer || !ringContains(outer, lng, lat)) return false;
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
