/**
 * Testes da importação de cabos submarinos (KML/KMZ → Nexus).
 *
 * Só funções puras: leitura de KML (com e sem namespace) e KMZ, nome de arquivo, costura de trechos,
 * classificação de pastas, deduplicação de equipamentos, ids estáveis, CLI e nós do Studio GEO.
 * Sem banco. Os nomes de arquivo e de pasta são os reais de `legacy-data/cabos_submarinos/`.
 */

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { StudioGeoEntityNode } from '../src/modules/studio/adapters/studio-geo-adapter.js';
import { parseCliArgs } from '../scripts/import-submarine-cables/cli.js';
import { parseKml, parseKmlSource } from '../scripts/import-submarine-cables/kml.js';
import {
  BMH_SITE_SPEC_CODE,
  SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
  classifyFolder,
  convertDocuments,
  dedupeConsecutive,
  lengthKm,
  parseFileName,
  stitchSegments,
} from '../scripts/import-submarine-cables/mapper.js';
import {
  SUBMARINE_GROUP_NODE_ID,
  submarineNodes,
} from '../scripts/import-submarine-cables/studio-geo.js';

const MALBEC_FILE = 'MALBEC_SEG1.1_BMH_RIO-BU1_PL01_21-FEB-2020.kml';

/** KML Malbec: namespace 2.2, pasta do arquivo com rota + subpastas de waypoints. */
const malbecKml = (file: string, buCoordinate = '-42.1,-23.9,0'): string => `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Folder>
    <name>${file.replace(/\.kml$/, '')}</name>
    <Placemark><name>Route</name>
      <LineString><coordinates>-43.1,-22.9,0 -43.1,-22.9,0 -42.5,-23.4,0 ${buCoordinate}</coordinates></LineString>
    </Placemark>
    <Folder><name>Waypoints - BMH</name>
      <Placemark><name>BMH RIO DE JANEIRO</name><Point><coordinates>-43.1,-22.9,0</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>Waypoints - BU</name>
      <Placemark><name>BU1</name><Point><coordinates>${buCoordinate}</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>Waypoints - Repeaters</name>
      <Placemark><name>R1104</name><Point><coordinates>-42.8,-23.1,0</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>Waypoints - Alter Course</name>
      <Placemark><name>AC01</name><Point><coordinates>-42.9,-23.0,0</coordinates></Point></Placemark>
      <Placemark><name>AC02</name><Point><coordinates>-42.7,-23.2,0</coordinates></Point></Placemark>
    </Folder>
  </Folder>
</kml>`;

/** KML do SEGMENT 4: sem namespace, rota em trechos de 2 pontos sem nome, pontos CableType. */
const segment4Kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml><Document>
  <Folder><name>Path</name>
    <Placemark><LineString><coordinates>-38.5,-3.7 -40,0</coordinates></LineString></Placemark>
    <Placemark><LineString><coordinates>-40,0 -50,15</coordinates></LineString></Placemark>
    <Placemark><LineString><coordinates>-50,15 -64.7,32.3</coordinates></LineString></Placemark>
  </Folder>
  <Folder><name>CableType</name>
    <Placemark><name>SA</name><Point><coordinates>-38.5,-3.7</coordinates></Point></Placemark>
    <Placemark><name>LW</name><Point><coordinates>-40,0</coordinates></Point></Placemark>
    <Placemark><name>SA</name><Point><coordinates>-50,15</coordinates></Point></Placemark>
  </Folder>
</Document></kml>`;

describe('kml', () => {
  it('lê KML com namespace, preservando o caminho de pastas e descartando Z', () => {
    const document = parseKml(MALBEC_FILE, malbecKml(MALBEC_FILE));
    const route = document.placemarks.find((placemark) => placemark.kind === 'line');
    expect(route?.name).toBe('Route');
    expect(route?.folderPath).toEqual(['MALBEC_SEG1.1_BMH_RIO-BU1_PL01_21-FEB-2020']);
    expect(route?.coordinates[0]).toEqual([-43.1, -22.9]);
    const repeater = document.placemarks.find((placemark) => placemark.name === 'R1104');
    expect(repeater?.folderPath.at(-1)).toBe('Waypoints - Repeaters');
  });

  it('lê KML sem namespace (SEGMENT 4) e placemarks sem nome', () => {
    const document = parseKml('SEGMENT 4 - FORTALEZA - BERMUDA - Post Repair.kml', segment4Kml);
    const lines = document.placemarks.filter((placemark) => placemark.kind === 'line');
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.name === '')).toBe(true);
  });

  it('lê KMZ preferindo doc.kml', async () => {
    const zip = new JSZip();
    zip.file('files/outro.kml', '<kml/>');
    zip.file('doc.kml', malbecKml(MALBEC_FILE));
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const document = await parseKmlSource(
      'SEGMENT 1 BRIGHT GREEN - BOCA RATON - TUCKERTON.kmz',
      bytes,
    );
    expect(document.placemarks.some((placemark) => placemark.name === 'Route')).toBe(true);
  });

  it('rejeita XML sem raiz <kml>', () => {
    expect(() => parseKml('x.kml', '<gpx/>')).toThrow(/raiz <kml>/);
  });
});

describe('parseFileName', () => {
  it('Malbec: segmento, pontas e revisão do plano', () => {
    expect(parseFileName(MALBEC_FILE)).toEqual({
      system: 'Malbec',
      segment: 'SEG1.1',
      pontaA: 'BMH Rio de Janeiro',
      pontaB: 'BU1',
      planRevision: 'PL01 21-FEB-2020',
    });
    expect(parseFileName('MALBEC_SEG1.3_BMH_LAS_TONINAS-BU2_PL05_23-JUN-2020 (1).kml').pontaA).toBe(
      'BMH Las Toninas',
    );
  });

  it('GlobeNet: cor, pontas, grafia SEGUIMENT e observação', () => {
    expect(parseFileName('SEGMENT 6 WHITE - FORTALEZA - RIO DE JANEIRO.kmz')).toMatchObject({
      system: 'GlobeNet',
      segment: 'Segment 6',
      color: 'White',
      pontaA: 'Fortaleza',
      pontaB: 'Rio de Janeiro',
    });
    expect(parseFileName('SEGUIMENT 3 - MAIQUETIA-FORTALEZA.kmz')).toMatchObject({
      segment: 'Segment 3',
      pontaA: 'Maiquetía',
      pontaB: 'Fortaleza',
    });
    const segment4 = parseFileName('SEGMENT 4 - FORTALEZA - BERMUDA - Post Repair.kml');
    expect(segment4).toMatchObject({ pontaA: 'Fortaleza', pontaB: 'Bermuda', note: 'Post Repair' });
    expect(segment4.color).toBeUndefined();
    expect(parseFileName('SEG02-MQTA-BU-BARRANQUILLA.kmz')).toMatchObject({
      segment: 'Segment 2',
      pontaA: 'Maiquetía',
      pontaB: 'Barranquilla',
    });
  });
});

describe('geometria', () => {
  it('costura trechos encadeados e abre parte nova na lacuna', () => {
    const parts = stitchSegments([
      [
        [0, 0],
        [1, 1],
      ],
      [
        [1, 1],
        [2, 2],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
    expect(parts).toEqual([
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
  });

  it('remove vértices consecutivos repetidos', () => {
    expect(
      dedupeConsecutive([
        [0, 0],
        [0, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it('extensão geodésica: 1° de longitude no equador ≈ 111,2 km', () => {
    expect(
      lengthKm([
        [0, 0],
        [1, 0],
      ]),
    ).toBeCloseTo(111.19, 1);
  });

  it('classifica pastas de waypoint e descarta navegação', () => {
    expect(classifyFolder(['MALBEC_X', 'Waypoints - BU'])).toBe('BU');
    expect(classifyFolder(['MALBEC_X', 'Waypoints - Equalisers'])).toBe('EQUALIZER');
    expect(classifyFolder(['MALBEC_X', 'Waypoints - Alter Course'])).toBeUndefined();
    expect(classifyFolder(['CableType'])).toBeUndefined();
  });
});

describe('convertDocuments', () => {
  const malbec = parseKml(MALBEC_FILE, malbecKml(MALBEC_FILE));
  const segment2File = 'MALBEC_SEG2_BMH_PRAIA_GRANDE-BU1_PL02_16-APR-2020.kml';
  const segment2 = parseKml(segment2File, malbecKml(segment2File));

  it('converte rota com characteristics, _origin e vértice repetido removido', () => {
    const { routes } = convertDocuments([malbec]);
    expect(routes).toHaveLength(1);
    const [route] = routes;
    expect(route?.name).toBe('Malbec SEG1.1 — BMH Rio de Janeiro ↔ BU1');
    expect(route?.line.coordinates).toHaveLength(3);
    const value = (name: string): unknown =>
      route?.characteristics.find((characteristic) => characteristic.name === name)?.value;
    expect(value('sistema')).toBe('Malbec');
    expect(value('ambiente')).toBe('submarino');
    expect(value('_origin.system')).toBe('KML_CABOS_SUBMARINOS');
    expect(value('_origin.entity')).toBe('ROUTE');
    expect(value('_origin.id')).toBe(`${MALBEC_FILE}#Route`);
  });

  it('carrega só os waypoints de equipamento e conta os descartados por pasta', () => {
    const { points, reports } = convertDocuments([malbec]);
    expect(points.map((point) => point.entity).sort()).toEqual(['BMH', 'BU', 'REPEATER']);
    expect(points.find((point) => point.entity === 'BMH')?.name).toBe('Malbec BMH Rio de Janeiro');
    expect(points.find((point) => point.entity === 'REPEATER')?.name).toBe(
      'Malbec Repetidor R1104',
    );
    expect(reports[0]?.discarded).toEqual({ 'Waypoints - Alter Course': 2 });
  });

  it('BU repetido em vários segmentos entra uma vez', () => {
    const { points, conflicts } = convertDocuments([malbec, segment2]);
    expect(points.filter((point) => point.entity === 'BU')).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  it('acusa coordenada divergente para o mesmo equipamento', () => {
    const moved = parseKml(segment2File, malbecKml(segment2File, '-41,-24,0'));
    expect(convertDocuments([malbec, moved]).conflicts).toHaveLength(1);
  });

  it('ids são estáveis entre execuções e disjuntos entre entidades', () => {
    const first = convertDocuments([malbec]);
    const second = convertDocuments([parseKml(MALBEC_FILE, malbecKml(MALBEC_FILE))]);
    expect(second.routes[0]?.resourceId).toBe(first.routes[0]?.resourceId);
    expect(second.points.map((point) => point.siteId)).toEqual(
      first.points.map((point) => point.siteId),
    );
    const ids = [
      ...first.routes.flatMap((route) => [route.locationId, route.resourceId]),
      ...first.points.flatMap((point) => [point.locationId, point.siteId, point.resourceId]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SEGMENT 4: trechos sem nome viram uma rota com tiposCabo', () => {
    const document = parseKml('SEGMENT 4 - FORTALEZA - BERMUDA - Post Repair.kml', segment4Kml);
    const { routes, points, reports } = convertDocuments([document]);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.line.coordinates).toHaveLength(4);
    expect(
      routes[0]?.characteristics.find((characteristic) => characteristic.name === 'tiposCabo')
        ?.value,
    ).toBe('LW, SA');
    expect(points).toEqual([]);
    expect(reports[0]?.discarded).toEqual({ CableType: 3 });
  });
});

describe('parseCliArgs', () => {
  it('dry-run por default e prefixo normalizado', () => {
    const options = parseCliArgs(['--environment', 'nx_dev21_'], {});
    expect(options).toMatchObject({
      environment: 'NX_DEV21_',
      apply: false,
      buildFeatures: false,
      sourceDir: 'legacy-data/cabos_submarinos',
    });
  });

  it('a flag vence ORACLE_OBJECT_PREFIX; sem nenhum dos dois falha', () => {
    expect(
      parseCliArgs(['--environment', 'NX_DEV21_'], { ORACLE_OBJECT_PREFIX: 'NX_DEMO_' })
        .environment,
    ).toBe('NX_DEV21_');
    expect(parseCliArgs([], { ORACLE_OBJECT_PREFIX: 'NX_DEMO_' }).environment).toBe('NX_DEMO_');
    expect(() => parseCliArgs([], {})).toThrow(/--environment/);
  });

  it('rejeita prefixo inválido e flag desconhecida', () => {
    expect(() => parseCliArgs(['--environment', 'NX_DEV21'], {})).toThrow(/inválido/);
    expect(() => parseCliArgs(['--environment', 'NX_DEV21_', '--x'], {})).toThrow(/desconhecido/);
    expect(() => parseCliArgs(['--environment'], {})).toThrow(/exige um valor/);
  });

  it('lê as demais flags', () => {
    expect(
      parseCliArgs(
        [
          '--environment',
          'NX_DEV21_',
          '--apply',
          '--build-features',
          '--source-dir',
          'x',
          '--tenant-id',
          'vtal',
          '--owner-party-id',
          'p',
        ],
        {},
      ),
    ).toEqual({
      environment: 'NX_DEV21_',
      apply: true,
      buildFeatures: true,
      sourceDir: 'x',
      tenantId: 'vtal',
      ownerPartyId: 'p',
    });
  });
});

describe('studio-geo', () => {
  it('grupo Cabos Submarinos com cabo RESOURCE e equipamentos LOCAL', () => {
    const nodes = submarineNodes(150);
    const group = nodes.find((node) => node.id === SUBMARINE_GROUP_NODE_ID);
    expect(group).toMatchObject({ kind: 'GROUP', parentNodeId: null, sortOrder: 150 });
    const entities = nodes.filter((node): node is StudioGeoEntityNode => node.kind === 'ENTITY');
    expect(entities.every((node) => node.parentNodeId === SUBMARINE_GROUP_NODE_ID)).toBe(true);
    expect(entities.every((node) => /^[A-Za-z][A-Za-z0-9-]*$/.test(node.id))).toBe(true);
    expect(new Set(entities.map((node) => node.sortOrder)).size).toBe(entities.length);
    const cable = entities.find(
      (node) => node.entity.sourceId === SUBMARINE_CABLE_RESOURCE_TYPE_CODE,
    );
    expect(cable?.entity.category).toBe('RESOURCE');
    expect(cable?.visualConfig?.geometryKind).toBe('LINE');
    const bmh = entities.find((node) => node.entity.sourceId === BMH_SITE_SPEC_CODE);
    expect(bmh?.entity.category).toBe('LOCAL');
  });
});
