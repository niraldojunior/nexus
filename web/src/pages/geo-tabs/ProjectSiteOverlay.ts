// Locais do Projeto de trabalho aberto (REQ-MOD01-015/017) desenhados num <canvas> sobre o
// mapa — substitui até PROJECT_VIEWPORT_SITE_LIMIT (1.500) google.maps.Marker reais por pin,
// mesma técnica de InfraOverlay.ts (OverlayView + canvas no pane `overlayLayer`, grid espacial
// de hit-test). Um projeto grande aberto criava até 1.500 objetos DOM com listener próprio —
// o maior custo de interação do mapa depois do teto de VIEWPORT_MAX_RESULTS já ter sido
// corrigido (issue #72).
//
// Mais simples que InfraOverlay: só pontos (locais de projeto nunca são linha/cabo), e a fonte
// é `ProjectSite[]` — já um GeoTreeNode completo (com `refId`/`projectId`), sem precisar da
// conversão que InfraOverlay faz de MapTileFeature para stub. O clique/hover aqui devolve o
// ProjectSite inteiro, pronto para GeoPage chamar o mesmo `onSelectNode`/`onHoverNode` que os
// marcadores normais usam.
//
// O nó SELECIONADO nunca é desenhado aqui — GeoPage mantém um Marker real pra ele (ver
// `pinnedSelectedNode`/`pinnedNode` em GeoPage.tsx) e passa o id dele em `excludeNodeId`.

import type { GoogleMapInstance, GoogleMapsApi } from '../../utils/googleMaps';
import { buildFastProjection } from './CoverageOverlay';
import { siteIconDataUrl, siteIconFor } from '../../utils/siteIcon';
import { siteKindFromSpec } from '../../utils/placeLabel';
import type { ProjectSite } from '../../services/geoProjectApi';

type Maps = GoogleMapsApi['maps'];
type Project = (lng: number, lat: number) => [number, number] | null;
type Viewport = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// Mesmo raio/tamanho de célula de InfraOverlay.ts — consistência de "sensação" de clique entre
// as duas camadas, e a mesma razão: hitTest roda a cada mousemove (60+ Hz).
const POINT_HIT_RADIUS_PX = 16;
const HIT_GRID_CELL_PX = 64;

export type ProjectSiteOverlayHandle = {
  setData: (
    sites: ProjectSite[],
    options: {
      // Tamanho em px do pin — Estação (CO) usa `siteMarkerSize`, os demais tipos de local
      // seguem `resourceMarkerSize` (mesma régua de InfraOverlay.drawSitePoint).
      siteMarkerSize: number;
      resourceMarkerSize: number | null;
      excludeNodeId: string | null;
    },
  ) => void;
  hitTest: (lng: number, lat: number) => ProjectSite | null;
  destroy: () => void;
};

type DrawnPoint = { x: number; y: number; site: ProjectSite };

export function createProjectSiteOverlay(maps: Maps, map: GoogleMapInstance): ProjectSiteOverlayHandle {
  let data: ProjectSite[] = [];
  let siteMarkerSize = 25;
  let resourceMarkerSize: number | null = 25;
  let excludeNodeId: string | null = null;

  let lastProject: Project | null = null;
  let drawnPoints: DrawnPoint[] = [];
  let pointGrid = new Map<string, DrawnPoint[]>();

  const cellKey = (cx: number, cy: number): string => `${cx}:${cy}`;
  const cellOf = (x: number, y: number): [number, number] => [
    Math.floor(x / HIT_GRID_CELL_PX),
    Math.floor(y / HIT_GRID_CELL_PX),
  ];

  function insertPoint(point: DrawnPoint): void {
    const [cx, cy] = cellOf(point.x, point.y);
    const key = cellKey(cx, cy);
    const bucket = pointGrid.get(key);
    if (bucket) bucket.push(point);
    else pointGrid.set(key, [point]);
  }

  function queryGrid(x: number, y: number): DrawnPoint[] {
    const [cx, cy] = cellOf(x, y);
    const results: DrawnPoint[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = pointGrid.get(cellKey(cx + dx, cy + dy));
        if (bucket) results.push(...bucket);
      }
    }
    return results;
  }

  // Mesmo cache/agendamento de InfraOverlay.ts: decodificar um data-URL em Image é assíncrono;
  // enquanto não chega, o pin simplesmente não desenha nesta passada, e o onload agenda redraw.
  const imageCache = new Map<string, HTMLImageElement>();
  let redrawScheduled = false;

  function scheduleRedraw(): void {
    if (redrawScheduled) return;
    redrawScheduled = true;
    requestAnimationFrame(() => {
      redrawScheduled = false;
      overlay.draw();
    });
  }

  function loadImage(dataUrl: string): HTMLImageElement | null {
    const cached = imageCache.get(dataUrl);
    if (cached) return cached.complete ? cached : null;
    const img = new Image();
    imageCache.set(dataUrl, img);
    img.onload = scheduleRedraw;
    img.src = dataUrl;
    return null;
  }

  class ProjectSiteOverlayView extends maps.OverlayView {
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

      drawnPoints = [];
      pointGrid = new Map();
      lastProject = null;
      if (data.length === 0) return;

      const toLocal: Project = (lng, lat) => {
        const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(lat, lng));
        return pixel ? [pixel.x - left, pixel.y - top] : null;
      };

      const swLatLng = bounds.getSouthWest();
      const neLatLng = bounds.getNorthEast();
      const viewport: Viewport = {
        minLng: swLatLng.lng(),
        minLat: swLatLng.lat(),
        maxLng: neLatLng.lng(),
        maxLat: neLatLng.lat(),
      };
      const fast =
        viewport.minLng <= viewport.maxLng
          ? buildFastProjection(
              { lng: viewport.minLng, lat: viewport.minLat, x: sw.x - left, y: sw.y - top },
              { lng: viewport.maxLng, lat: viewport.maxLat, x: ne.x - left, y: ne.y - top },
            )
          : null;
      const project = fast ?? toLocal;
      lastProject = project;

      for (const site of data) {
        if (site.id === excludeNodeId) continue;
        this.drawSite(context, site, project);
      }

      for (const point of drawnPoints) insertPoint(point);
    }

    private drawSite(context: CanvasRenderingContext2D, site: ProjectSite, project: Project): void {
      if (site.geometry?.type !== 'Point') return;
      const [lng, lat] = site.geometry.coordinates;
      const local = project(lng, lat);
      if (!local) return;
      const [x, y] = local;
      const kind = siteKindFromSpec({ category: site.siteCategory, name: site.sublabel });
      const icon = siteIconFor(kind, site.status);
      const size = kind === 'CO' ? siteMarkerSize : resourceMarkerSize;
      if (size === null) return;
      const img = loadImage(siteIconDataUrl(icon, { size }));
      // Âncora central — mesma regra de buildPointMarkerVisual/InfraOverlay.drawSitePoint.
      if (img) context.drawImage(img, x - size / 2, y - size / 2, size, size);
      drawnPoints.push({ x, y, site });
    }
  }

  const overlay = new ProjectSiteOverlayView();
  overlay.setMap(map);

  return {
    setData: (sites, options) => {
      siteMarkerSize = options.siteMarkerSize;
      resourceMarkerSize = options.resourceMarkerSize;
      excludeNodeId = options.excludeNodeId;
      data = sites;
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      if (!lastProject) return null;
      const query = lastProject(lng, lat);
      if (!query) return null;
      const [qx, qy] = query;

      let nearestPoint: DrawnPoint | null = null;
      let nearestDistance = POINT_HIT_RADIUS_PX;
      for (const point of queryGrid(qx, qy)) {
        const distance = Math.hypot(point.x - qx, point.y - qy);
        if (distance <= nearestDistance) {
          nearestPoint = point;
          nearestDistance = distance;
        }
      }
      return nearestPoint ? nearestPoint.site : null;
    },
    destroy: () => overlay.setMap(null),
  };
}
