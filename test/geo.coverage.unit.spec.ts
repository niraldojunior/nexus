import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildCoverage,
  connectedComponents,
  haversineMeters,
  mercatorToLngLat,
  neighborhoodStats,
  stampCells,
  tracePolygon,
  COVERAGE_CELL_METERS,
  COVERAGE_RADIUS_METERS,
  type CdoPoint,
  type CoverageCell,
} from '../src/modules/geo/coverage-grid.js';

// Bairro de Icaraí, Niterói — coordenada real de referência da base.
const ICARAI: [number, number] = [-43.106, -22.906];

const cdo = (
  lng: number,
  lat: number,
  overrides: Partial<CdoPoint> = {},
): CdoPoint => ({
  lng,
  lat,
  available: true,
  neighborhoodKey: 'RJ|Niterói|Icaraí',
  neighborhood: 'Icaraí',
  city: 'Niterói',
  uf: 'RJ',
  ...overrides,
});

// Centro verdadeiro (lng/lat) de uma célula da grade.
const cellCenter = (cell: CoverageCell): [number, number] =>
  mercatorToLngLat(
    (cell.gridX + 0.5) * COVERAGE_CELL_METERS,
    (cell.gridY + 0.5) * COVERAGE_CELL_METERS,
  );

test('stampCells carimba só células cujo centro está dentro do raio de 300 m', () => {
  const cells = stampCells([cdo(...ICARAI)], COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);

  assert.ok(cells.length > 0, 'uma CDO deve cobrir ao menos uma célula');
  for (const cell of cells) {
    const [clng, clat] = cellCenter(cell);
    const dist = haversineMeters(ICARAI[0], ICARAI[1], clng, clat);
    assert.ok(dist <= COVERAGE_RADIUS_METERS + 1e-6, `célula fora do raio: ${dist} m`);
    assert.equal(cell.cdoTotal, 1);
    assert.equal(cell.cdoAvailable, 1);
    assert.equal(cell.neighborhoodKey, 'RJ|Niterói|Icaraí');
  }
});

test('stampCells não carimba célula além do raio (CDO distante não contamina a vizinha)', () => {
  // Uma segunda CDO a ~2 km não deve compartilhar célula com a primeira.
  const near = stampCells([cdo(...ICARAI)], COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  const nearIds = new Set(near.map((c) => `${c.gridX},${c.gridY}`));
  const far = stampCells([cdo(-43.084, -22.906)], COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  for (const cell of far) {
    assert.ok(!nearIds.has(`${cell.gridX},${cell.gridY}`));
  }
});

test('células compartilhadas somam CDOs; indisponível não conta como disponível', () => {
  const cells = stampCells(
    [cdo(...ICARAI), cdo(ICARAI[0], ICARAI[1], { available: false })],
    COVERAGE_CELL_METERS,
    COVERAGE_RADIUS_METERS,
  );
  // Duas CDOs no mesmo ponto: toda célula coberta soma 2 no total e 1 no disponível.
  for (const cell of cells) {
    assert.equal(cell.cdoTotal, 2);
    assert.equal(cell.cdoAvailable, 1);
  }
});

test('bairro dominante da célula é o que mais contribuiu; empate vai para a CDO mais próxima', () => {
  const center: [number, number] = ICARAI;
  // Duas CDOs de bairros diferentes; a de Icaraí exatamente no ponto de teste, a de
  // Santa Rosa deslocada — a célula central deve ficar com Icaraí (mais próxima).
  const cells = stampCells(
    [
      cdo(center[0], center[1], { neighborhoodKey: 'RJ|Niterói|Icaraí', neighborhood: 'Icaraí' }),
      cdo(center[0] + 0.0018, center[1], {
        neighborhoodKey: 'RJ|Niterói|Santa Rosa',
        neighborhood: 'Santa Rosa',
      }),
    ],
    COVERAGE_CELL_METERS,
    COVERAGE_RADIUS_METERS,
  );
  const centralCells = cells.filter((cell) => {
    const [clng, clat] = cellCenter(cell);
    return haversineMeters(center[0], center[1], clng, clat) < 80;
  });
  assert.ok(centralCells.length > 0);
  for (const cell of centralCells) {
    assert.equal(cell.neighborhoodKey, 'RJ|Niterói|Icaraí');
  }
});

test('connectedComponents separa dois aglomerados desconexos do mesmo bairro', () => {
  const clusterA = stampCells([cdo(...ICARAI)], COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  const clusterB = stampCells(
    [cdo(-43.06, -22.94)],
    COVERAGE_CELL_METERS,
    COVERAGE_RADIUS_METERS,
  );
  const components = connectedComponents([...clusterA, ...clusterB]);
  assert.equal(components.length, 2);
});

test('tracePolygon devolve Polygon fechado e válido (anel externo)', () => {
  const cells = stampCells([cdo(...ICARAI)], COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  const polygon = tracePolygon(cells, COVERAGE_CELL_METERS);
  assert.ok(polygon, 'deve produzir polígono');
  assert.equal(polygon!.type, 'Polygon');
  const outer = polygon!.coordinates[0]!;
  assert.ok(outer.length >= 4, 'anel precisa de ao menos 4 vértices');
  assert.deepEqual(outer[0], outer[outer.length - 1], 'anel deve fechar');
});

test('tracePolygon detecta buraco: bloco preenchido com célula central vazia vira 2 anéis', () => {
  // Bloco 3×3 sem o centro → anel externo + um buraco. Construído direto em células para
  // isolar o traçado (o carimbo de raio nunca deixaria um buraco de uma célula).
  const cells: CoverageCell[] = [];
  for (let gx = 0; gx < 3; gx += 1) {
    for (let gy = 0; gy < 3; gy += 1) {
      if (gx === 1 && gy === 1) continue;
      cells.push({ gridX: gx, gridY: gy, cdoTotal: 1, cdoAvailable: 1, neighborhoodKey: 'k' });
    }
  }
  const polygon = tracePolygon(cells, COVERAGE_CELL_METERS);
  assert.ok(polygon);
  assert.equal(polygon!.coordinates.length, 2, 'externo + buraco');
});

test('neighborhoodStats conta CDOs reais, disponibilidade e área coberta', () => {
  const cdos = [
    cdo(...ICARAI, { available: true }),
    cdo(ICARAI[0] + 0.001, ICARAI[1], { available: false }),
    cdo(ICARAI[0], ICARAI[1] + 0.001, { available: true }),
  ];
  const cells = stampCells(cdos, COVERAGE_CELL_METERS, COVERAGE_RADIUS_METERS);
  const stats = neighborhoodStats(cdos, cells, COVERAGE_CELL_METERS);
  assert.equal(stats.length, 1);
  const stat = stats[0]!;
  assert.equal(stat.cdoTotal, 3, 'contagem real, não soma de células');
  assert.equal(stat.cdoAvailable, 2);
  assert.equal(stat.cdoUnavailable, 1);
  assert.ok(Math.abs(stat.availabilityRatio - 2 / 3) < 1e-3);
  assert.ok(stat.coveredAreaKm2 > 0);
});

test('buildCoverage compõe componentes, geometria e estatística por bairro', () => {
  const cdos = [
    cdo(...ICARAI),
    cdo(ICARAI[0] + 0.0009, ICARAI[1] + 0.0009),
    cdo(-43.06, -22.94, {
      neighborhoodKey: 'RJ|Niterói|Fonseca',
      neighborhood: 'Fonseca',
    }),
  ];
  const result = buildCoverage(cdos);
  assert.ok(result.components.length >= 2, 'ao menos um componente por aglomerado');
  assert.equal(result.neighborhoods.length, 2, 'dois bairros');
  for (const component of result.components) {
    assert.equal(component.geometry.type, 'Polygon');
    assert.ok(component.cells.length > 0);
  }
});
