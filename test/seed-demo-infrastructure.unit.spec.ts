/**
 * Testes do seed de infraestrutura pública (ANEEL SIGEL → Nexus DEMO).
 *
 * Cobre só as funções puras: parsing do `PopupInfo`, resolução de UF, filtro de escopo, geometria,
 * ids determinísticos, characteristics, CLI e o snapshot do Studio GEO. Sem banco e sem rede.
 *
 * Os `PopupInfo` e nomes usados aqui são **payloads reais** da fonte, copiados da extração de
 * validação — inclusive as esquisitices (espaço em excesso herdado do KML, `Capacidade: 0 MW`,
 * vírgula decimal em `34,5 Kv`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  StudioGeoEntityNode,
  StudioGeoNode,
} from '../src/modules/studio/adapters/studio-geo-adapter.js';
import {
  GAS_PIPELINE_RESOURCE_TYPE_CODE,
  ISOLATED_SYSTEM_ENTITY,
  RAIL_SEGMENT_RESOURCE_TYPE_CODE,
  RAIL_STATION_SITE_SPEC_CODE,
  mapGasPipeline,
  mapRailSegment,
  mapRailStation,
  ISOLATED_SYSTEM_SITE_SPEC_CODE,
  SUBSTATION_ENTITY,
  SUBSTATION_RESOURCE_TYPE_CODE,
  SUBSTATION_SITE_SPEC_CODE,
  TRANSMISSION_LINE_ENTITY,
  TRANSMISSION_LINE_RESOURCE_TYPE_CODE,
  bboxForStates,
  bboxForUf,
  buildCharacteristics,
  dedupeById,
  demoId,
  inBbox,
  lineInScope,
  mapIsolatedSystem,
  mapSubstation,
  mapTransmissionLine,
  normalizeName,
  parseBrazilianNumber,
  parsePopupInfo,
  resolveUf,
  substationInScope,
  toGeoJsonLines,
  toGeoJsonPoint,
  ufsFromName,
} from '../scripts/seed-demo-infrastructure/mapper.js';
import { fetchIbgeFeatures } from '../scripts/seed-demo-infrastructure/ibge.js';
import { parseCliArgs } from '../scripts/seed-demo-infrastructure/cli.js';
import {
  ENERGY_GROUP_NODE_ID,
  ISOLATED_SYSTEM_NODE_ID,
  SUBSTATION_NODE_ID,
  TRANSMISSION_LINE_NODE_ID,
  energyNodes,
  gasNodes,
  mergeDomainNodes,
  mergeEnergyNodes,
  railNodes,
} from '../scripts/seed-demo-infrastructure/studio-geo.js';

const STATES = ['RJ', 'SP'];

const characteristicValue = (
  characteristics: Array<{ name: string; value: unknown }>,
  name: string,
): unknown => characteristics.find((item) => item.name === name)?.value;

describe('parsePopupInfo', () => {
  it('extrai nome, capacidade e agente de uma subestação real', () => {
    const fields = parsePopupInfo(
      '<b>Nome: </b>GRAJAU<br/><b>Capacidade: </b>160 MW<br/><b>Agente: </b>Central Eólica Trairí SA',
    );
    expect(fields).toEqual({
      nome: 'GRAJAU',
      capacidadeMw: 160,
      operador: 'Central Eólica Trairí SA',
    });
  });

  it('extrai tensão e extensão de uma linha real', () => {
    expect(parsePopupInfo('<b>Tensão: </b>230 Kv<br/><b>Extensão: </b>57,78 Km')).toEqual({
      tensaoKv: 230,
      extensaoKm: 57.78,
    });
  });

  it('converte vírgula decimal (34,5 Kv → 34.5)', () => {
    expect(parsePopupInfo('<b>Tensão: </b>34,5 Kv<br/><b>Extensão: </b>1,1 Km')).toEqual({
      tensaoKv: 34.5,
      extensaoKm: 1.1,
    });
  });

  it('remove o espaço em excesso que a fonte herda do KML', () => {
    const fields = parsePopupInfo('<b>Nome: </b>B. FLUMINENSE       <br/><b>Capacidade: </b>0 MW');
    expect(fields.nome).toBe('B. FLUMINENSE');
  });

  it('omite "Capacidade: 0 MW" — na fonte é não informado, não zero', () => {
    const fields = parsePopupInfo(
      '<b>Nome: </b>B. FLUMINENSE<br/><b>Capacidade: </b>0 MW<br/><b>Agente: </b>Furnas Centrais Elétricas S.A.',
    );
    expect(fields.capacidadeMw).toBeUndefined();
    expect(fields.operador).toBe('Furnas Centrais Elétricas S.A.');
  });

  it('não lança com entrada vazia, nula ou sem rótulos conhecidos', () => {
    expect(parsePopupInfo('')).toEqual({});
    expect(parsePopupInfo(null)).toEqual({});
    expect(parsePopupInfo(undefined)).toEqual({});
    expect(parsePopupInfo('<b>Outro: </b>x')).toEqual({});
  });

  it('parseBrazilianNumber lida com milhar e valor inválido', () => {
    expect(parseBrazilianNumber('1.234,5')).toBe(1234.5);
    expect(parseBrazilianNumber('')).toBeUndefined();
    expect(parseBrazilianNumber('abc')).toBeUndefined();
    expect(parseBrazilianNumber(undefined)).toBeUndefined();
  });
});

describe('UF a partir do nome', () => {
  it('lê o sufixo simples', () => {
    expect(ufsFromName('Linha LT  230 kV SCHARLAU 2 / CHARQUEADAS C 1  RS')).toEqual(['RS']);
  });

  it('preserva o sufixo bi-estadual em vez de escolher uma UF', () => {
    expect(ufsFromName('Linha LT 500 kV A / B  MG/SP')).toEqual(['MG', 'SP']);
    expect(resolveUf('Linha LT 500 kV A / B  MG/SP', STATES)).toBe('MG/SP');
  });

  it('devolve [] quando não há sufixo reconhecível', () => {
    expect(ufsFromName('ROCPV-6ARA21SP')).toEqual([]);
  });

  it('sem sufixo, resolve pela geometria — e por todos os vértices, não só o primeiro', () => {
    // Primeiro vértice fora das caixas, segundo dentro de SP: a rota entra no escopo depois.
    expect(
      resolveUf('ROCPV-6ARA21SP', STATES, [
        [-60, -10],
        [-47, -22],
      ]),
    ).toBe('SP');
  });

  it('devolve undefined quando nada resolve', () => {
    expect(resolveUf('SEM SUFIXO AQUI!', STATES, [[-60, -10]])).toBeUndefined();
  });

  it('normalizeName colapsa os espaços múltiplos da fonte', () => {
    expect(normalizeName('Linha LT  230 kV  X / Y  SP')).toBe('Linha LT 230 kV X / Y SP');
    expect(normalizeName(null)).toBe('');
  });
});

describe('escopo geográfico', () => {
  it('inBbox aceita ponto dentro e rejeita fora', () => {
    const rj = bboxForUf('RJ');
    expect(inBbox(rj, -43.2, -22.9)).toBe(true); // Rio de Janeiro
    expect(inBbox(rj, -46.6, -23.5)).toBe(false); // São Paulo
  });

  it('aceita UFs fora do escopo original RJ/SP', () => {
    const amazonas = bboxForUf('AM');
    expect(inBbox(amazonas, -60, -3)).toBe(true); // Manaus
    expect(bboxForUf('RS').latMin).toBeLessThan(-30);
  });

  it('bboxForStates devolve o envelope da união', () => {
    const union = bboxForStates(STATES);
    expect(inBbox(union, -43.2, -22.9)).toBe(true);
    expect(inBbox(union, -46.6, -23.5)).toBe(true);
    expect(union.lonMin).toBe(-53.3); // extremo oeste de SP
    expect(union.latMax).toBe(-19.6); // extremo norte de SP
  });

  it('rejeita UF sem caixa conhecida', () => {
    expect(() => bboxForUf('ZZ')).toThrow(/caixa envolvente/i);
    expect(() => bboxForStates([])).toThrow(/ao menos uma UF/i);
  });

  it('o sufixo do nome é autoritativo: linha que só cruza o retângulo fica fora', () => {
    // Caso real: 175 das 476 linhas do envelope RJ+SP têm sufixo exclusivamente PR/MG/MS/ES.
    // Telêmaco Borba (PR) está DENTRO da caixa de SP, então o teste de ponto sozinho não resolve.
    const telemacoBorba: Array<[number, number]> = [[-50.6, -24.3]];
    expect(lineInScope('Linha LT 230 kV TELEMACO BORBA / X  PR', STATES, telemacoBorba)).toBe(
      false,
    );
    expect(lineInScope('Linha LT 230 kV A / B  SP', STATES, telemacoBorba)).toBe(true);
  });

  it('aceita a linha bi-estadual que toca o escopo', () => {
    expect(lineInScope('Linha LT 500 kV A / B  MG/SP', STATES, [[-45, -21]])).toBe(true);
    expect(lineInScope('Linha LT 500 kV A / B  MG/MS', STATES, [[-45, -21]])).toBe(false);
  });

  it('sem sufixo, o critério cai para a geometria', () => {
    expect(lineInScope('ROCPV-6ARA21SP', STATES, [[-47, -22]])).toBe(true);
    expect(lineInScope('ROCPV-6ARA21SP', STATES, [[-60, -10]])).toBe(false);
  });

  it('subestação é filtrada só por espaço — a camada não traz UF alguma', () => {
    expect(substationInScope(STATES, -43.2, -22.9)).toBe(true);
    expect(substationInScope(STATES, -38.5, -12.9)).toBe(false); // Salvador
  });
});

describe('geometria', () => {
  it('toGeoJsonPoint aceita par finito e rejeita o resto', () => {
    expect(toGeoJsonPoint([-43.2, -22.9])).toEqual({
      type: 'Point',
      coordinates: [-43.2, -22.9],
    });
    expect(toGeoJsonPoint([Number.NaN, -22.9])).toBeUndefined();
    expect(toGeoJsonPoint(null)).toBeUndefined();
    expect(toGeoJsonPoint([-43.2])).toBeUndefined();
  });

  it('preserva TODOS os vértices — nunca reduz a rota aos extremos', () => {
    const coordinates = Array.from({ length: 144 }, (_, i) => [-46 + i * 0.01, -23 + i * 0.01]);
    const [line] = toGeoJsonLines({ type: 'LineString', coordinates });
    expect(line?.coordinates).toHaveLength(144);
    expect(line?.coordinates[0]).toEqual(coordinates[0]);
    expect(line?.coordinates.at(-1)).toEqual(coordinates.at(-1));
  });

  it('divide MultiLineString em N partes em vez de achatar', () => {
    const parts = toGeoJsonLines({
      type: 'MultiLineString',
      coordinates: [
        [
          [-46, -23],
          [-45, -22],
        ],
        [
          [-44, -21],
          [-43, -20],
          [-42, -19],
        ],
      ],
    });
    expect(parts).toHaveLength(2);
    expect(parts.every((part) => part.type === 'LineString')).toBe(true);
    expect(parts[0]?.coordinates).toHaveLength(2);
    expect(parts[1]?.coordinates).toHaveLength(3);
  });

  it('descarta parte com menos de 2 pontos e geometria não suportada', () => {
    expect(toGeoJsonLines({ type: 'LineString', coordinates: [[-46, -23]] })).toEqual([]);
    expect(toGeoJsonLines({ type: 'Polygon', coordinates: [] })).toEqual([]);
    expect(toGeoJsonLines(null)).toEqual([]);
  });

  it('mantém vértice repetido, como a fonte traz', () => {
    const [line] = toGeoJsonLines({
      type: 'LineString',
      coordinates: [
        [-46, -23],
        [-45, -22],
        [-46, -23],
      ],
    });
    expect(line?.coordinates).toHaveLength(3);
  });
});

describe('characteristics', () => {
  const fields = { tensaoKv: 230, extensaoKm: 57.78, operador: 'Furnas' };

  it('emite o que existe, com valueType correto', () => {
    const characteristics = buildCharacteristics({
      entity: TRANSMISSION_LINE_ENTITY,
      sourceId: '123',
      fields,
      uf: 'RJ/SP',
    });
    expect(characteristicValue(characteristics, 'tensaoKv')).toBe(230);
    expect(characteristicValue(characteristics, 'extensaoKm')).toBe(57.78);
    expect(characteristicValue(characteristics, 'operador')).toBe('Furnas');
    expect(characteristicValue(characteristics, 'uf')).toBe('RJ/SP');
    expect(characteristics.find((item) => item.name === 'tensaoKv')?.valueType).toBe('number');
    expect(characteristics.find((item) => item.name === 'uf')?.valueType).toBe('string');
  });

  it('nunca emite "municipio" — a fonte não tem o dado', () => {
    const characteristics = buildCharacteristics({
      entity: TRANSMISSION_LINE_ENTITY,
      sourceId: '123',
      fields,
      uf: 'SP',
    });
    expect(characteristics.map((item) => item.name)).not.toContain('municipio');
  });

  it('omite campo ausente em vez de usar placeholder', () => {
    const characteristics = buildCharacteristics({
      entity: TRANSMISSION_LINE_ENTITY,
      sourceId: '123',
      fields: {},
    });
    const names = characteristics.map((item) => item.name);
    expect(names).not.toContain('tensaoKv');
    expect(names).not.toContain('uf');
    expect(names).not.toContain('operador');
  });

  it('grava _origin.* com system ANEEL_SIGEL (C5)', () => {
    const characteristics = buildCharacteristics({
      entity: SUBSTATION_ENTITY,
      sourceId: 456,
      fields: {},
    });
    expect(characteristicValue(characteristics, '_origin.system')).toBe('ANEEL_SIGEL');
    expect(characteristicValue(characteristics, '_origin.entity')).toBe(SUBSTATION_ENTITY);
    expect(characteristicValue(characteristics, '_origin.id')).toBe('456');
  });

  it('sufixa _origin.id nas partes de uma feature multipart', () => {
    const characteristics = buildCharacteristics({
      entity: TRANSMISSION_LINE_ENTITY,
      sourceId: '789',
      part: 2,
      fields: {},
    });
    expect(characteristicValue(characteristics, '_origin.id')).toBe('789:2');
  });
});

describe('demoId', () => {
  it('é determinístico', () => {
    expect(demoId(SUBSTATION_ENTITY, '42')).toBe(demoId(SUBSTATION_ENTITY, '42'));
  });

  it('é um UUID v5 válido', () => {
    expect(demoId(SUBSTATION_ENTITY, '42')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('separa entidades, ids e partes em espaços distintos', () => {
    const ids = new Set([
      demoId(SUBSTATION_ENTITY, '42'),
      demoId(TRANSMISSION_LINE_ENTITY, '42'),
      demoId(`${SUBSTATION_ENTITY}:SITE`, '42'),
      demoId(`${SUBSTATION_ENTITY}:RESOURCE`, '42'),
      demoId(SUBSTATION_ENTITY, '43'),
      demoId(TRANSMISSION_LINE_ENTITY, '42', 1),
      demoId(TRANSMISSION_LINE_ENTITY, '42', 2),
    ]);
    expect(ids.size).toBe(7);
  });
});

describe('mapeamento de features', () => {
  const substationFeature = {
    properties: {
      OID: 101,
      Name: 'Subestação B. FLUMINENSE',
      PopupInfo:
        '<b>Nome: </b>B. FLUMINENSE       <br/><b>Capacidade: </b>0 MW<br/><b>Agente: </b>Furnas Centrais Elétricas S.A.',
    },
    geometry: { type: 'Point', coordinates: [-43.2, -22.9] },
  };

  it('mapeia a subestação com três ids distintos (location, site, resource)', () => {
    const mapped = mapSubstation(substationFeature, STATES);
    expect(mapped).toBeDefined();
    expect(mapped?.name).toBe('Subestação B. FLUMINENSE');
    expect(mapped?.uf).toBe('RJ');
    expect(new Set([mapped?.locationId, mapped?.siteId, mapped?.resourceId]).size).toBe(3);
    expect(characteristicValue(mapped!.characteristics, 'operador')).toBe(
      'Furnas Centrais Elétricas S.A.',
    );
  });

  it('descarta subestação fora do escopo, sem OID ou sem geometria', () => {
    expect(
      mapSubstation(
        { ...substationFeature, geometry: { type: 'Point', coordinates: [-38.5, -12.9] } },
        STATES,
      ),
    ).toBeUndefined();
    expect(
      mapSubstation({ ...substationFeature, properties: { Name: 'x' } }, STATES),
    ).toBeUndefined();
    expect(mapSubstation({ ...substationFeature, geometry: null }, STATES)).toBeUndefined();
  });

  it('mapeia Sistema Isolado com identidade e origem próprias', () => {
    const mapped = mapIsolatedSystem(
      {
        properties: { OID: 404, Name: 'Sistema Isolado Manaus', PopupInfo: '' },
        geometry: { type: 'Point', coordinates: [-60.0, -3.1] },
      },
      ['AM'],
    );
    expect(mapped).toBeDefined();
    expect(mapped?.name).toBe('Sistema Isolado Manaus');
    expect(mapped?.uf).toBe('AM');
    expect(new Set([mapped?.locationId, mapped?.siteId, mapped?.resourceId]).size).toBe(3);
    expect(characteristicValue(mapped!.characteristics, '_origin.entity')).toBe(
      ISOLATED_SYSTEM_ENTITY,
    );
  });

  it('usa fallback estável e descarta Sistema Isolado sem ponto ou fora do escopo', () => {
    const missingName = mapIsolatedSystem(
      { properties: { OID: 405 }, geometry: { type: 'Point', coordinates: [-60.0, -3.1] } },
      ['AM'],
    );
    expect(missingName?.name).toBe('Sistema Isolado 405');
    expect(
      mapIsolatedSystem(
        { properties: { OID: 406 }, geometry: { type: 'Point', coordinates: [-43.2, -22.9] } },
        ['AM'],
      ),
    ).toBeUndefined();
  });

  it('mapeia a linha preservando a geometria completa', () => {
    const coordinates = Array.from({ length: 30 }, (_, i) => [-44 - i * 0.01, -22 - i * 0.01]);
    const mapped = mapTransmissionLine(
      {
        properties: {
          OID: 202,
          Name: 'Linha LT  230 kV  A / B  RJ',
          PopupInfo: '<b>Tensão: </b>230 Kv<br/><b>Extensão: </b>57,78 Km',
        },
        geometry: { type: 'LineString', coordinates },
      },
      STATES,
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.line.coordinates).toHaveLength(30);
    expect(mapped[0]?.name).toBe('Linha LT 230 kV A / B RJ');
    expect(mapped[0]?.uf).toBe('RJ');
    expect(mapped[0]?.originId).toBe('202');
  });

  it('multipart gera um registro por parte, com nome e origem distintos', () => {
    const mapped = mapTransmissionLine(
      {
        properties: { OID: 303, Name: 'Linha LT 500 kV A / B  SP', PopupInfo: '' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-46, -23],
              [-45.9, -22.9],
            ],
            [
              [-45.8, -22.8],
              [-45.7, -22.7],
            ],
          ],
        },
      },
      STATES,
    );
    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.originId).toBe('303:1');
    expect(mapped[1]?.originId).toBe('303:2');
    expect(mapped[0]?.name).toContain('parte 1');
    expect(new Set(mapped.map((item) => item.resourceId)).size).toBe(2);
  });

  it('dedupeById mantém a primeira ocorrência de OID repetido', () => {
    const items = [
      { resourceId: 'a', n: 1 },
      { resourceId: 'a', n: 2 },
      { resourceId: 'b', n: 3 },
    ];
    expect(dedupeById(items).map((item) => item.n)).toEqual([1, 3]);
  });
});

describe('parseCliArgs', () => {
  it('usa dry-run, RJ+SP e deixa tenant/owner sem default fixo', () => {
    const options = parseCliArgs([]);
    expect(options.apply).toBe(false);
    expect(options.states).toEqual(['RJ', 'SP']);
    expect(options.limit).toBeUndefined();
    // Sem default: a fase 0 resolve do `nexus_environment` do namespace de destino. Fixar
    // 'default' gravaria num tenant que nenhuma tela lê (a DEMO provisionada registra 'vtal').
    expect(options.tenantId).toBeUndefined();
    expect(options.ownerPartyId).toBeUndefined();
    expect(options.buildFeatures).toBe(false);
  });

  it('não inventa ownerPartyId quando só o tenant é informado — a fase 0 herda', () => {
    const options = parseCliArgs(['--tenant-id', 'demo']);
    expect(options.tenantId).toBe('demo');
    expect(options.ownerPartyId).toBeUndefined();
  });

  it('respeita o ownerPartyId explícito', () => {
    const options = parseCliArgs(['--tenant-id', 'demo', '--owner-party-id', 'vtal']);
    expect(options.ownerPartyId).toBe('vtal');
  });

  it('lê --apply, --limit e --build-features', () => {
    const options = parseCliArgs(['--apply', '--limit', '100', '--build-features']);
    expect(options.apply).toBe(true);
    expect(options.limit).toBe(100);
    expect(options.buildFeatures).toBe(true);
  });

  it('aceita --states em minúscula, deduplica e cobre todas as UFs', () => {
    expect(parseCliArgs(['--states', 'rj,sp']).states).toEqual(['RJ', 'SP']);
    expect(parseCliArgs(['--states', 'SP, SP ,RJ']).states).toEqual(['SP', 'RJ']);
    expect(parseCliArgs(['--states', 'am,rr,rs']).states).toEqual(['AM', 'RR', 'RS']);
    expect(parseCliArgs(['--all-states']).states).toHaveLength(27);
    expect(parseCliArgs(['--all-states']).states).toContain('AM');
    expect(parseCliArgs(['--all-states']).states).toContain('RS');
  });

  it('rejeita UF desconhecida, limite inválido, flag sem valor e flag desconhecida', () => {
    expect(() => parseCliArgs(['--states', 'ZZ'])).toThrow(/caixa envolvente/i);
    expect(() => parseCliArgs(['--limit', '0'])).toThrow(/inteiro positivo/i);
    expect(() => parseCliArgs(['--limit', '-5'])).toThrow(/inteiro positivo/i);
    expect(() => parseCliArgs(['--limit', 'abc'])).toThrow(/inteiro positivo/i);
    expect(() => parseCliArgs(['--limit'])).toThrow(/exige um valor/i);
    expect(() => parseCliArgs(['--states', '--apply'])).toThrow(/exige um valor/i);
    expect(() => parseCliArgs(['--nope'])).toThrow(/desconhecido/i);
  });
});

describe('snapshot do Studio GEO', () => {
  // `StudioGeoNode` é união discriminada por `kind`: só o braço ENTITY tem `entity` e
  // `visualConfig`. Estreitar aqui mantém as asserções sobre os campos reais do nó.
  const entityNodes = (): StudioGeoEntityNode[] =>
    energyNodes().filter(
      (node: StudioGeoNode): node is StudioGeoEntityNode => node.kind === 'ENTITY',
    );

  it('o nó LOCAL aponta para o MESMO code da site spec', () => {
    // Nós LOCAL não são validados pelo `materialize`: um sourceId divergente publicaria limpo e
    // deixaria o mapa vazio em silêncio. Este teste é o que fecha aquela classe de bug.
    const substation = entityNodes().find((node) => node.id === SUBSTATION_NODE_ID);
    expect(substation?.entity.sourceId).toBe(SUBSTATION_SITE_SPEC_CODE);
    expect(substation?.entity.sourceType).toBe('GEOGRAPHIC_SITE_SPECIFICATION');
    expect(substation?.entity.category).toBe('LOCAL');
  });

  it('o nó LOCAL de Sistemas Isolados aponta para a site spec própria', () => {
    const isolatedSystem = entityNodes().find((node) => node.id === ISOLATED_SYSTEM_NODE_ID);
    expect(isolatedSystem?.entity.sourceId).toBe(ISOLATED_SYSTEM_SITE_SPEC_CODE);
    expect(isolatedSystem?.entity.sourceType).toBe('GEOGRAPHIC_SITE_SPECIFICATION');
    expect(isolatedSystem?.entity.category).toBe('LOCAL');
    expect(isolatedSystem?.visualConfig?.geometryKind).toBe('POINT');
  });

  it('o nó RESOURCE aponta para o code do resource type, com geometryKind coerente', () => {
    const line = entityNodes().find((node) => node.id === TRANSMISSION_LINE_NODE_ID);
    expect(line?.entity.sourceId).toBe(TRANSMISSION_LINE_RESOURCE_TYPE_CODE);
    expect(line?.entity.sourceType).toBe('RESOURCE_TYPE');
    expect(line?.visualConfig?.geometryKind).toBe('LINE');
    // A subestação desenha como ponto (via site), não como linha.
    const substation = entityNodes().find((node) => node.id === SUBSTATION_NODE_ID);
    expect(substation?.visualConfig?.geometryKind).toBe('POINT');
    // O type da subestação existe no catálogo, mas não é o sourceId de nenhum nó publicado.
    expect(entityNodes().map((node) => node.entity.sourceId)).not.toContain(
      SUBSTATION_RESOURCE_TYPE_CODE,
    );
  });

  it('todas as 8 faixas de escala são visíveis — divergência deliberada do default', () => {
    for (const node of entityNodes()) {
      const bands = node.visualConfig?.scaleBands;
      if (!bands) continue;
      const entries = Object.entries(bands);
      expect(entries).toHaveLength(8);
      expect(entries.every(([, band]) => (band as { visible: boolean }).visible)).toBe(true);
    }
  });

  it('sortOrder é único entre irmãos', () => {
    const nodes = energyNodes();
    const byParent = new Map<string | null, number[]>();
    for (const node of nodes) {
      const siblings = byParent.get(node.parentNodeId ?? null) ?? [];
      siblings.push(node.sortOrder);
      byParent.set(node.parentNodeId ?? null, siblings);
    }
    for (const siblings of byParent.values()) {
      expect(new Set(siblings).size).toBe(siblings.length);
    }
  });

  it('o pai dos nós ENTITY existe e é GROUP', () => {
    const nodes = energyNodes();
    const group = nodes.find((node) => node.id === ENERGY_GROUP_NODE_ID);
    expect(group?.kind).toBe('GROUP');
    for (const node of nodes.filter((item) => item.kind === 'ENTITY')) {
      expect(node.parentNodeId).toBe(ENERGY_GROUP_NODE_ID);
    }
  });

  it('ids casam o padrão exigido pelo adapter', () => {
    for (const node of energyNodes()) {
      expect(node.id).toMatch(/^[A-Za-z][A-Za-z0-9-]*$/);
    }
  });

  it('mergeEnergyNodes preserva nós alheios e não colide sortOrder de raiz', () => {
    const existing = [
      {
        id: 'fibra',
        kind: 'GROUP' as const,
        parentNodeId: null,
        label: 'Fibra',
        sortOrder: 10,
        active: true,
      },
      {
        id: 'outro',
        kind: 'GROUP' as const,
        parentNodeId: null,
        label: 'Outro',
        sortOrder: 20,
        active: true,
      },
    ];
    const snapshot = mergeEnergyNodes(existing);
    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.nodes.map((node) => node.id)).toContain('fibra');
    expect(snapshot.nodes.map((node) => node.id)).toContain('outro');
    const group = snapshot.nodes.find((node) => node.id === ENERGY_GROUP_NODE_ID);
    expect(group?.sortOrder).toBe(30); // maior raiz existente (20) + 10
    const rootOrders = snapshot.nodes
      .filter((node) => node.parentNodeId === null)
      .map((node) => node.sortOrder);
    expect(new Set(rootOrders).size).toBe(rootOrders.length);
  });

  it('é idempotente: republicar não duplica os nós de energia', () => {
    const once = mergeEnergyNodes([]);
    const twice = mergeEnergyNodes(once.nodes);
    expect(twice.nodes).toHaveLength(once.nodes.length);
    expect(new Set(twice.nodes.map((node) => node.id)).size).toBe(twice.nodes.length);
  });
});

describe('IBGE: gás e ferrovia', () => {
  const line = {
    type: 'LineString',
    coordinates: [
      [-43.3, -22.9],
      [-43.2, -22.8],
    ],
  };

  it('mapeia gasoduto com origem IBGE_BC250 e descarta atributos desconhecidos', () => {
    const [mapped] = mapGasPipeline(
      {
        properties: { OID: '95', nome: 'Gasbol', tipotrechoduto: 'Gasoduto', operacional: 'Desconhecido', situacaofisica: null },
        geometry: line,
      },
      STATES,
    );
    expect(mapped?.name).toBe('Gasbol');
    expect(mapped?.originSystem).toBe('IBGE_BC250');
    expect(characteristicValue(mapped!.characteristics, '_origin.system')).toBe('IBGE_BC250');
    expect(mapped!.characteristics.map((c) => c.name)).not.toContain('operacional');
    expect(mapped!.characteristics.map((c) => c.name)).not.toContain('situacaofisica');
  });

  it('usa nome de fallback e filtra por geometria', () => {
    const [mapped] = mapRailSegment({ properties: { OID: '7', nome: null }, geometry: line }, STATES);
    expect(mapped?.name).toBe('Trecho Ferroviário 7');
    const far = { type: 'LineString', coordinates: [[-60, -3], [-59, -3]] };
    expect(mapRailSegment({ properties: { OID: '8' }, geometry: far }, STATES)).toEqual([]);
    expect(mapRailSegment({ properties: { OID: '9' }, geometry: null }, STATES)).toEqual([]);
  });

  it('divide multipart com sufixo de parte', () => {
    const multi = { type: 'MultiLineString', coordinates: [line.coordinates, line.coordinates] };
    const parts = mapGasPipeline({ properties: { OID: '1', nome: 'X' }, geometry: multi }, STATES);
    expect(parts).toHaveLength(2);
    expect(new Set(parts.map((p) => p.resourceId)).size).toBe(2);
  });

  it('mapeia estação com origem IBGE_BCIM e fallback de nome', () => {
    const mapped = mapRailStation(
      { properties: { OID: '3', nome: null }, geometry: { type: 'Point', coordinates: [-43.2, -22.9] } },
      STATES,
    );
    expect(mapped?.name).toBe('Estação Ferroviária 3');
    expect(mapped?.originSystem).toBe('IBGE_BCIM');
    expect(
      mapRailStation(
        { properties: { OID: '4' }, geometry: { type: 'Point', coordinates: [-60, -3] } },
        STATES,
      ),
    ).toBeUndefined();
  });

  it('não altera os ids de energia ao parametrizar a origem', () => {
    expect(demoId('SUBSTATION', '1')).toBe(demoId('SUBSTATION', '1', undefined, 'ANEEL_SIGEL'));
    expect(demoId('SUBSTATION', '1')).not.toBe(demoId('SUBSTATION', '1', undefined, 'IBGE_BC250'));
  });

  it('--domains: default energy, valida e deduplica', () => {
    expect(parseCliArgs([]).domains).toEqual(['energy']);
    expect(parseCliArgs(['--domains', 'GAS,rail,gas']).domains).toEqual(['gas', 'rail']);
    expect(() => parseCliArgs(['--domains', 'agua'])).toThrow(/Domínio desconhecido/);
  });

  it('nós Studio de gás e ferrovia apontam para os códigos certos, com sortOrder único', () => {
    const entities = [...gasNodes(), ...railNodes()].filter(
      (n): n is StudioGeoEntityNode => n.kind === 'ENTITY',
    );
    expect(entities.map((n) => n.entity.sourceId).sort()).toEqual(
      [GAS_PIPELINE_RESOURCE_TYPE_CODE, RAIL_SEGMENT_RESOURCE_TYPE_CODE, RAIL_STATION_SITE_SPEC_CODE].sort(),
    );
    const snapshot = mergeDomainNodes([], ['energy', 'gas', 'rail']);
    const roots = snapshot.nodes.filter((n) => n.parentNodeId === null).map((n) => n.sortOrder);
    expect(new Set(roots).size).toBe(3);
    const again = mergeDomainNodes(snapshot.nodes, ['gas', 'rail']);
    expect(again.nodes).toHaveLength(snapshot.nodes.length);
  });
});

describe('cliente WFS do IBGE', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pagina por startIndex e extrai o id numérico', async () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `L.${i}`, properties: { nome: 'a' }, geometry: null }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: mk(1000) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: mk(5) }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchIbgeFeatures({ typeName: 'X' });
    expect(result).toHaveLength(1005);
    expect(result[3]?.properties.OID).toBe('3');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('startIndex=1000');
  });
});
