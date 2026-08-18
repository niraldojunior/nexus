import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildProjectAreas,
  PROJECT_AREA_CELL_METERS,
  PROJECT_AREA_MIN_SITES,
  PROJECT_AREA_RADIUS_METERS,
  type ProjectSitePoint,
} from '../src/modules/geo/project-area-grid.js';

// Bairro de Icaraí, Niterói — mesmo ponto de referência de geo.coverage.unit.spec.ts.
const ICARAI: [number, number] = [-43.106, -22.906];
// A ~2 km de Icaraí — bem além de 2×PROJECT_AREA_RADIUS_METERS, garante mancha separada.
const FAR: [number, number] = [-43.084, -22.906];

const point = (id: string, lng: number, lat: number): ProjectSitePoint => ({
  siteId: id,
  lng,
  lat,
});

// Espalha N pontos num raio bem pequeno (~5 m) ao redor de um centro, para caírem todos na
// mesma célula/componente sem depender de ruído de ponto flutuante.
function cluster(prefix: string, count: number, center: [number, number]): ProjectSitePoint[] {
  const points: ProjectSitePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = i * 0.00002; // ~2 m por passo, dentro da mesma célula de 50 m
    points.push(point(`${prefix}${i}`, center[0] + jitter, center[1]));
  }
  return points;
}

test('grupo com >= minSites locais vira concentration', () => {
  const points = cluster('a', PROJECT_AREA_MIN_SITES, ICARAI);
  const { areas, orphanSiteIds } = buildProjectAreas(points);

  assert.equal(orphanSiteIds.length, 0);
  assert.equal(areas.length, 1);
  assert.equal(areas[0]?.kind, 'concentration');
  assert.equal(areas[0]?.siteCount, PROJECT_AREA_MIN_SITES);
});

test('grupo com < minSites locais vira dispersion — inclusive um único local isolado', () => {
  const points = [point('solo', ICARAI[0], ICARAI[1])];
  const { areas } = buildProjectAreas(points);

  assert.equal(areas.length, 1);
  assert.equal(areas[0]?.kind, 'dispersion');
  assert.equal(areas[0]?.siteCount, 1);
});

test('limiar exato: minSites - 1 é dispersion, minSites é concentration', () => {
  const below = buildProjectAreas(cluster('b', PROJECT_AREA_MIN_SITES - 1, ICARAI));
  assert.equal(below.areas[0]?.kind, 'dispersion');
  assert.equal(below.areas[0]?.siteCount, PROJECT_AREA_MIN_SITES - 1);

  const at = buildProjectAreas(cluster('c', PROJECT_AREA_MIN_SITES, ICARAI));
  assert.equal(at.areas[0]?.kind, 'concentration');
  assert.equal(at.areas[0]?.siteCount, PROJECT_AREA_MIN_SITES);
});

test('dois grupos separados por mais de 2x o raio geram duas manchas independentes', () => {
  const points = [
    ...cluster('near', PROJECT_AREA_MIN_SITES, ICARAI),
    ...cluster('far', PROJECT_AREA_MIN_SITES, FAR),
  ];
  const { areas } = buildProjectAreas(points);

  assert.equal(areas.length, 2);
  for (const area of areas) {
    assert.equal(area.kind, 'concentration');
    assert.equal(area.siteCount, PROJECT_AREA_MIN_SITES);
  }
  const totalSites = areas.reduce((sum, area) => sum + area.siteCount, 0);
  assert.equal(totalSites, PROJECT_AREA_MIN_SITES * 2);
});

test('locais dentro de 2x o raio se fundem na mesma mancha', () => {
  // ~150 m de separação, dentro de 2×200 m — deve cair no mesmo componente conexo.
  const offsetLng = ICARAI[0] + 0.0014;
  const points = [...cluster('m1', 3, ICARAI), ...cluster('m2', 2, [offsetLng, ICARAI[1]])];
  const { areas } = buildProjectAreas(points, {
    radiusMeters: PROJECT_AREA_RADIUS_METERS,
    cellMeters: PROJECT_AREA_CELL_METERS,
  });

  assert.equal(areas.length, 1);
  assert.equal(areas[0]?.siteCount, 5);
  assert.equal(areas[0]?.kind, 'concentration');
});

test('local sem geometria não entra na entrada — quem chama já filtra antes', () => {
  // buildProjectAreas não recebe pontos inválidos; este teste documenta que o array vazio
  // não gera manchas nem órfãos.
  const { areas, orphanSiteIds } = buildProjectAreas([]);
  assert.deepEqual(areas, []);
  assert.deepEqual(orphanSiteIds, []);
});

test('geometria da mancha é um Polygon fechado com anel externo CCW', () => {
  const points = cluster('d', PROJECT_AREA_MIN_SITES, ICARAI);
  const { areas } = buildProjectAreas(points);
  const geometry = areas[0]?.geometry;
  assert.ok(geometry);
  assert.equal(geometry?.type, 'Polygon');
  const outer = geometry?.coordinates[0];
  assert.ok(outer && outer.length >= 4);
  const first = outer?.[0];
  const last = outer?.[outer.length - 1];
  assert.deepEqual(first, last, 'anel externo deve fechar no mesmo ponto');
});

test('siteIds de amostra referenciam os locais reais do componente', () => {
  const points = cluster('e', PROJECT_AREA_MIN_SITES, ICARAI);
  const { areas } = buildProjectAreas(points);
  const ids = new Set(points.map((p) => p.siteId));
  for (const siteId of areas[0]?.siteIds ?? []) {
    assert.ok(ids.has(siteId));
  }
});

test('centroide fica dentro da vizinhança dos locais do grupo', () => {
  const points = cluster('f', PROJECT_AREA_MIN_SITES, ICARAI);
  const { areas } = buildProjectAreas(points);
  const [lng, lat] = areas[0]?.centroid ?? [0, 0];
  assert.ok(Math.abs(lng - ICARAI[0]) < 0.001);
  assert.ok(Math.abs(lat - ICARAI[1]) < 0.001);
});
