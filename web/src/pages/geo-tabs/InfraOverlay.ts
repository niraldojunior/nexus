// Infra passiva (recursos + Sites não-CO + cabos) desenhada num <canvas> sobre o mapa —
// substitui um google.maps.Marker/Polyline por feature (Fase 3 da reengenharia de performance
// do mapa, issue #69): dezenas de milhares de pins como objeto nativo do Maps travam a
// interação (nenhum agrupamento — ver GeoPage); canvas desenha tudo em poucos ms, mesma
// técnica de CoverageOverlay.ts (OverlayView + canvas no pane `overlayLayer`).
//
// Fonte dos dados é o índice de tile (geo_map_feature, via useMapTiles) — MapTileFeature, não
// GeoTreeNode: mais enxuto de propósito (sem `detail`, sem a rota inteira de um cabo, só o
// trecho recortado no tile). O nó SELECIONADO nunca é desenhado aqui — GeoPage mantém um
// google.maps.Marker/Polyline real pra ele (âncora de balão, destaque nativo) e passa o id dele
// em `excludeNodeId`.
//
// Sem listener nativo (canvas é pointerEvents:none, igual a CoverageOverlay/ProjectAreaOverlay)
// — clique e hover entram pelo click/mousemove do próprio mapa em GeoPage, chamando `hitTest`.

import type { GoogleMapInstance, GoogleMapsApi } from '../../utils/googleMaps';
import { buildFastProjection } from './CoverageOverlay';
import {
  resourceIconDataUrl,
  resourceIconFor,
  CABLE_STROKE_WEIGHT,
  MARKER_ICON_SIZE,
} from '../../utils/resourceIcon';
import { siteIconDataUrl, siteIconFor, SITE_ICON_SIZE } from '../../utils/siteIcon';
import { siteKindFromSpec } from '../../utils/placeLabel';
import type { MapSiteRole } from '../../utils/mapLayers';
import type { MapTileFeature } from '../../services/geoMapTileApi';

type Maps = GoogleMapsApi['maps'];
type Project = (lng: number, lat: number) => [number, number] | null;
type Viewport = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// Raio de captura do hit-test, em px de tela — folgado o bastante pra tocar num ícone pequeno
// sem precisar acertar o pixel exato.
const POINT_HIT_RADIUS_PX = 16;
const LINE_HIT_RADIUS_PX = 7;

export type InfraOverlayHandle = {
  setData: (
    features: MapTileFeature[],
    options: {
      // Tamanho em px do pin de Recurso na escala atual (ver resourceIconSizeForScale em
      // mapScale.ts), ou `null` quando o Recurso não é desenhado nessa escala.
      resourceMarkerSize: number | null;
      // Tamanho em px do pin de Central/Estação na escala atual. Os demais Sites seguem a
      // régua de Resource e não são desenhados acima do corte de infra passiva.
      siteMarkerSize: number;
      excludeNodeId: string | null;
      // Papel funcional (siteRole, C11) por code de spec — refina o ícone de Site (CO/POP/CTO)
      // além da heurística por substring de siteKindFromSpec. Opcional: sem catálogo em mãos,
      // cai no fallback por nome.
      roleByCode?: ReadonlyMap<string, MapSiteRole>;
    },
  ) => void;
  // Feature sob a coordenada (clique/hover) — ponto vence linha em empate (equipamento é o
  // alvo mais provável de clique que o cabo por baixo dele). null fora do raio de qualquer uma.
  hitTest: (lng: number, lat: number) => MapTileFeature | null;
  destroy: () => void;
};

type DrawnPoint = { x: number; y: number; feature: MapTileFeature };
type DrawnLine = { points: Array<[number, number]>; feature: MapTileFeature };

// Recursos usam a âncora inferior-esquerda: a coordenada geográfica cai no canto do sprite,
// enquanto o alvo visual está no seu centro. O hit-test deve seguir o que a pessoa vê, não a
// âncora do Maps/canvas.
export function resourcePointHitCenter(x: number, y: number, size: number): [number, number] {
  return [x + size / 2, y - size / 2];
}

export function createInfraOverlay(maps: Maps, map: GoogleMapInstance): InfraOverlayHandle {
  let data: MapTileFeature[] = [];
  let resourceMarkerSize: number | null = MARKER_ICON_SIZE;
  let siteMarkerSize: number = SITE_ICON_SIZE;
  let excludeNodeId: string | null = null;
  let roleByCode: ReadonlyMap<string, MapSiteRole> | undefined;

  // Projeção e resultado do último `draw()` — hitTest reusa os dois: reprojeta a coordenada
  // consultada no MESMO espaço de pixel local em que os pontos/linhas já foram desenhados, em
  // vez de recalcular geometria do zero a cada clique/hover.
  let lastProject: Project | null = null;
  let drawnPoints: DrawnPoint[] = [];
  let drawnLines: DrawnLine[] = [];

  // Sprite atlas: cada (code/kind, cor, tamanho) vira um HTMLImageElement decodificado uma vez
  // a partir do data-URL já cacheado em resourceIconDataUrl/siteIconDataUrl. Decodificar uma
  // Image de data-URL é assíncrono — enquanto não chega, a feature simplesmente não desenha
  // nesta passada; o `onload` agenda um redraw (throttlado por rAF pra não empilhar um redraw
  // por ícone novo no primeiro frame).
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

  const nodeIdOf = (feature: MapTileFeature): string => `${feature.kind}:${feature.entityId}`;

  class InfraOverlayView extends maps.OverlayView {
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
      drawnLines = [];
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
      // Só usa a projeção rápida quando a viewport não cruza o antimeridiano (mesma guarda de
      // CoverageOverlay) — fora do Brasil, mas o fallback exato cobre o caso.
      const fast =
        viewport.minLng <= viewport.maxLng
          ? buildFastProjection(
              { lng: viewport.minLng, lat: viewport.minLat, x: sw.x - left, y: sw.y - top },
              { lng: viewport.maxLng, lat: viewport.maxLat, x: ne.x - left, y: ne.y - top },
            )
          : null;
      const project = fast ?? toLocal;
      lastProject = project;

      // Cabos primeiro (fundo da rede), depois pontos de recurso, depois pontos de site —
      // mesma ordem relativa de CABLE_ROUTE_Z < EQUIPMENT_MARKER_Z < SITE_MARKER_Z em GeoPage.
      for (const feature of data) {
        if (feature.shape === 'line' && nodeIdOf(feature) !== excludeNodeId) {
          this.drawLine(context, feature, project);
        }
      }
      for (const feature of data) {
        if (
          feature.shape === 'point' &&
          feature.kind === 'resource' &&
          nodeIdOf(feature) !== excludeNodeId
        ) {
          this.drawResourcePoint(context, feature, project);
        }
      }
      for (const feature of data) {
        if (
          feature.shape === 'point' &&
          feature.kind === 'site' &&
          nodeIdOf(feature) !== excludeNodeId
        ) {
          this.drawSitePoint(context, feature, project);
        }
      }
    }

    private drawLine(
      context: CanvasRenderingContext2D,
      feature: MapTileFeature,
      project: Project,
    ): void {
      const geometry = feature.geometry;
      if (!geometry || geometry.type !== 'LineString') return;
      const points = geometry.coordinates
        .map(([lng, lat]) => project(lng, lat))
        .filter((point): point is [number, number] => point !== null);
      if (points.length < 2) return;

      const icon = resourceIconFor({
        resourceType: feature.typeCode ?? '',
        status: feature.status,
      });
      context.strokeStyle = icon.color;
      context.globalAlpha = 0.9;
      context.lineWidth = CABLE_STROKE_WEIGHT[icon.code] ?? 2.5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(points[0]![0], points[0]![1]);
      for (let i = 1; i < points.length; i += 1) context.lineTo(points[i]![0], points[i]![1]);
      context.stroke();
      context.globalAlpha = 1;

      drawnLines.push({ points, feature });
    }

    private drawResourcePoint(
      context: CanvasRenderingContext2D,
      feature: MapTileFeature,
      project: Project,
    ): void {
      const local = project(feature.lng, feature.lat);
      if (!local) return;
      const [x, y] = local;
      if (resourceMarkerSize === null) return;
      const size = resourceMarkerSize;
      const icon = resourceIconFor({
        resourceType: feature.typeCode ?? '',
        status: feature.status,
        // O índice pré-computado (geo_map_feature) não traz resourceSpecification para
        // recurso — só `label` (nome). Suficiente para distinguir CDOI de CDOE (ver
        // isCdoiResource em resourceIcon.ts), já que a convenção de nome já é o sinal
        // usado pelo resto do código (ex.: condominium-workflow.ts).
        name: feature.label,
      });
      const img = loadImage(resourceIconDataUrl(icon, { size }));
      // Âncora no canto inferior-esquerdo — mesma regra de buildPointMarkerVisual em GeoPage
      // (a coordenada real fica acima e à direita do próprio ícone).
      if (img) context.drawImage(img, x, y - size, size, size);
      const [hitX, hitY] = resourcePointHitCenter(x, y, size);
      drawnPoints.push({ x: hitX, y: hitY, feature });
    }

    private drawSitePoint(
      context: CanvasRenderingContext2D,
      feature: MapTileFeature,
      project: Project,
    ): void {
      const local = project(feature.lng, feature.lat);
      if (!local) return;
      const [x, y] = local;
      const kind = siteKindFromSpec({
        category: feature.siteCategory,
        name: feature.sublabel,
        siteRole: feature.sublabel ? roleByCode?.get(feature.sublabel) : undefined,
      });
      const icon = siteIconFor(kind, feature.status);
      const size = kind === 'CO' ? siteMarkerSize : resourceMarkerSize;
      if (size === null) return;
      const img = loadImage(siteIconDataUrl(icon, { size }));
      // Âncora central — mesma regra de buildPointMarkerVisual em GeoPage (squircle).
      if (img) context.drawImage(img, x - size / 2, y - size / 2, size, size);
      drawnPoints.push({ x, y, feature });
    }
  }

  const overlay = new InfraOverlayView();
  overlay.setMap(map);

  return {
    setData: (features, options) => {
      resourceMarkerSize = options.resourceMarkerSize;
      siteMarkerSize = options.siteMarkerSize;
      excludeNodeId = options.excludeNodeId;
      roleByCode = options.roleByCode;
      data = features;
      overlay.draw();
    },
    hitTest: (lng, lat) => {
      if (!lastProject) return null;
      const query = lastProject(lng, lat);
      if (!query) return null;
      const [qx, qy] = query;

      let nearestPoint: DrawnPoint | null = null;
      let nearestPointDistance = POINT_HIT_RADIUS_PX;
      for (const point of drawnPoints) {
        const distance = Math.hypot(point.x - qx, point.y - qy);
        if (distance <= nearestPointDistance) {
          nearestPoint = point;
          nearestPointDistance = distance;
        }
      }
      if (nearestPoint) return nearestPoint.feature;

      let nearestLine: DrawnLine | null = null;
      let nearestLineDistance = LINE_HIT_RADIUS_PX;
      for (const line of drawnLines) {
        for (let i = 0; i < line.points.length - 1; i += 1) {
          const distance = distanceToSegment(qx, qy, line.points[i]!, line.points[i + 1]!);
          if (distance <= nearestLineDistance) {
            nearestLine = line;
            nearestLineDistance = distance;
          }
        }
      }
      return nearestLine ? nearestLine.feature : null;
    },
    destroy: () => overlay.setMap(null),
  };
}

// Distância de um ponto a um segmento (projeção clampada em [0,1]) — mesma técnica padrão de
// hit-test de linha usada em editores de mapa/vetor. Exportada para teste direto (o hit-test
// de linha do overlay em si só é exercitável ponta a ponta com um mapa real).
export function distanceToSegment(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number],
): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}
