import { describe, expect, it } from 'vitest';

import {
  ANP_BLOCK_SPEC,
  ANP_FIELD_SPEC,
  ANP_LIQUID_TERMINAL_SPEC,
  ANP_WELL_SPEC,
  mapAnpPointSite,
  mapAnpPolygons,
} from '../scripts/seed-demo-infrastructure/anp-oil.js';
import { anpPageUrl } from '../scripts/seed-demo-infrastructure/anp-geo.js';
import { ALL_DOMAINS, toGeoJsonPolygons } from '../scripts/seed-demo-infrastructure/mapper.js';

const RJ = ['RJ'];
const ring = [
  [-43.2, -22.9],
  [-43.1, -22.9],
  [-43.1, -22.8],
  [-43.2, -22.9],
];

describe('Óleo e Gás: domínio', () => {
  it('registra o domínio oil', () => {
    expect(ALL_DOMAINS).toContain('oil');
  });

  it('anpPageUrl sempre envia sortBy quando informado', () => {
    const url = anpPageUrl('POCOS_SIRGAS', { startIndex: 2000, count: 2000, sortBy: 'CADASTRO' });
    expect(url).toContain('sortBy=CADASTRO');
    expect(url).toContain('typeNames=BD_ANP%3APOCOS_SIRGAS');
  });
});

describe('Óleo e Gás: pontos', () => {
  const feature = (key: unknown, coordinates: unknown) => ({
    properties: { SIMP: key, NOME: 'Terminal X', UF: 'RJ', RAZAO_SOCI: 'Op' },
    geometry: { type: 'Point', coordinates },
  });

  it('mapeia terminal com origem e UF', () => {
    const mapped = mapAnpPointSite(feature(7, [-43.17, -22.9]), RJ, ANP_LIQUID_TERMINAL_SPEC);
    expect(mapped?.sourceId).toBe('7');
    expect(mapped?.name).toBe('Terminal X');
    expect(mapped?.characteristics.some((c) => c.name === '_origin.system')).toBe(true);
  });

  it('é determinístico', () => {
    const a = mapAnpPointSite(feature(7, [-43.17, -22.9]), RJ, ANP_LIQUID_TERMINAL_SPEC);
    const b = mapAnpPointSite(feature(7, [-43.17, -22.9]), RJ, ANP_LIQUID_TERMINAL_SPEC);
    expect(a?.resourceId).toBe(b?.resourceId);
  });

  it('descarta sem chave, sem geometria ou fora do escopo', () => {
    expect(
      mapAnpPointSite(feature(undefined, [-43.17, -22.9]), RJ, ANP_LIQUID_TERMINAL_SPEC),
    ).toBeUndefined();
    expect(mapAnpPointSite(feature(1, undefined), RJ, ANP_LIQUID_TERMINAL_SPEC)).toBeUndefined();
    expect(mapAnpPointSite(feature(1, [-60, -3]), RJ, ANP_WELL_SPEC)).toBeUndefined();
  });
});

describe('Óleo e Gás: polígonos', () => {
  const polygonFeature = (geometry: unknown) => ({
    properties: { COD_CAMPO: 'C1', NOM_CAMPO: 'Campo A', COD_BLOCO: 'B1', NOM_BLOCO: 'Bloco A' },
    geometry,
  });

  it('Polygon e MultiPolygon viram Polygon[]', () => {
    expect(toGeoJsonPolygons({ type: 'Polygon', coordinates: [ring] })).toHaveLength(1);
    expect(toGeoJsonPolygons({ type: 'MultiPolygon', coordinates: [[ring], [ring]] })).toHaveLength(
      2,
    );
    expect(toGeoJsonPolygons({ type: 'Point', coordinates: [0, 0] })).toHaveLength(0);
  });

  it('campo simples mantém o id; multipart ganha :part', () => {
    const single = mapAnpPolygons(
      polygonFeature({ type: 'Polygon', coordinates: [ring] }),
      RJ,
      ANP_FIELD_SPEC,
    );
    expect(single).toHaveLength(1);
    expect(single[0]?.originId).toBe('C1');

    const multi = mapAnpPolygons(
      polygonFeature({ type: 'MultiPolygon', coordinates: [[ring], [ring]] }),
      RJ,
      ANP_BLOCK_SPEC,
    );
    expect(multi).toHaveLength(2);
    expect(multi[0]?.originId).not.toBe(multi[1]?.originId);
    expect(multi[0]?.resourceId).not.toBe(multi[1]?.resourceId);
  });

  it('descarta polígono fora do escopo', () => {
    const far = ring.map(([x, y]) => [x! + 20, y! + 20]);
    expect(
      mapAnpPolygons(polygonFeature({ type: 'Polygon', coordinates: [far] }), RJ, ANP_FIELD_SPEC),
    ).toHaveLength(0);
  });
});
