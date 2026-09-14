import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  geometryFromLocationTypes,
  legacyGeometryForTypeCode,
  resolveResourceTypeGeometry,
  studioGeoGeometryIndex,
} from '../src/modules/resource/geometry-backfill.js';

// A migration v18 escreve geometria em tipos que já existem em produção. A regra que decide esse
// valor precisa ser determinística e auditável sem banco — por isso vive em funções puras. O que
// estes testes protegem é a recusa: evidência ambígua nunca pode virar um palpite gravado.

const entityNode = (sourceId: string, geometryKind: 'POINT' | 'LINE' | 'POLYGON') => ({
  id: `node-${sourceId}-${geometryKind}`,
  kind: 'ENTITY' as const,
  entity: {
    category: 'RESOURCE',
    sourceDomain: 'resource-model',
    sourceType: 'RESOURCE_TYPE',
    sourceId,
  },
  visualConfig: { geometryKind },
});

test('studioGeoGeometryIndex lê a geometria declarada no snapshot v2', () => {
  const index = studioGeoGeometryIndex({
    nodes: [
      entityNode('Pole', 'POINT'),
      entityNode('Fiber', 'LINE'),
      entityNode('CoverageArea', 'POLYGON'),
      // Nó de grupo e nó de Local não descrevem ResourceType — são ignorados.
      { id: 'group-1', kind: 'GROUP', label: 'Infra' },
      {
        id: 'node-local',
        kind: 'ENTITY',
        entity: { category: 'LOCAL', sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceId: 'Station' },
        visualConfig: { geometryKind: 'POINT' },
      },
    ],
  });

  assert.equal(index.get('Pole'), 'POINT');
  assert.equal(index.get('Fiber'), 'LINE');
  assert.equal(index.get('CoverageArea'), 'POLYGON');
  assert.equal(index.get('Station'), undefined);
});

test('studioGeoGeometryIndex deriva geometria do `shape` no snapshot v1', () => {
  // v1 não tem visualConfig; a única evidência é o shape da camada, e o matcher reconstrói o
  // identificador do catálogo de compatibilidade.
  const index = studioGeoGeometryIndex({
    groups: [{ id: 'resources', label: 'Recursos' }],
    layers: [
      { id: 'resourceCdoe', matcher: 'cdoe', shape: 'resource-points' },
      { id: 'resourceFiberCable', matcher: 'fiber-cable', shape: 'resource-lines' },
      // `stations` e `coverage` não descrevem geometria de recurso.
      { id: 'stations', matcher: 'stations', shape: 'stations' },
      { id: 'coverage', matcher: 'coverage', shape: 'coverage' },
    ],
  });

  assert.equal(index.get('legacy-cdoe'), 'POINT');
  assert.equal(index.get('legacy-fiber-cable'), 'LINE');
  assert.equal(index.get('legacy-stations'), undefined);
  assert.equal(index.get('legacy-coverage'), undefined);
});

test('studioGeoGeometryIndex descarta um sourceId com geometrias divergentes', () => {
  // Duas camadas publicadas para o mesmo tipo com geometrias diferentes não formam empate a
  // desfazer por ordem de leitura: é ausência de evidência, e o tipo cai para a próxima fonte.
  const index = studioGeoGeometryIndex({
    nodes: [entityNode('Pole', 'POINT'), entityNode('Pole', 'LINE')],
  });
  assert.equal(index.has('Pole'), false);
});

test('studioGeoGeometryIndex tolera snapshot vazio ou malformado', () => {
  assert.equal(studioGeoGeometryIndex(undefined).size, 0);
  assert.equal(studioGeoGeometryIndex('não é objeto').size, 0);
  assert.equal(studioGeoGeometryIndex({ nodes: 'não é lista' }).size, 0);
  assert.equal(studioGeoGeometryIndex({ nodes: [{ kind: 'ENTITY' }] }).size, 0);
});

test('legacyGeometryForTypeCode espelha o catálogo de compatibilidade do frontend', () => {
  assert.equal(legacyGeometryForTypeCode('Pole'), 'POINT');
  assert.equal(legacyGeometryForTypeCode('CTO'), 'POINT');
  // OpticalNode é equipamento ativo na planta externa — mesma geometria POINT da família CDOE.
  assert.equal(legacyGeometryForTypeCode('OpticalNode'), 'POINT');
  // Dutos e variações compartilham o mesmo identificador legado.
  assert.equal(legacyGeometryForTypeCode('RisingTube'), 'POINT');
  assert.equal(legacyGeometryForTypeCode('DistributionCable'), 'LINE');
  assert.equal(legacyGeometryForTypeCode('DropCable'), 'LINE');
  // Um código que o catálogo legado nunca classificou não tem evidência.
  assert.equal(legacyGeometryForTypeCode('Splitter'), undefined);
  assert.equal(legacyGeometryForTypeCode(null), undefined);
});

test('legacyGeometryForTypeCode normaliza o nodeCode de category:/type: gravado por engano em ResourceType.code', () => {
  // migrate-resource-catalog.ts gravou em ResourceType.code o nodeCode inteiro do catálogo em vez
  // do código nu do tipo, em bases reais (issue #240). O catálogo legado indexa pelo nome nu — a
  // busca precisa extrair o segmento após o último `:type:` sem exigir correção do dado persistido.
  assert.equal(legacyGeometryForTypeCode('category:Infrastructure.Passive:type:CableTunnel'), 'POINT');
  assert.equal(
    legacyGeometryForTypeCode('category:Infrastructure.Passive:layer:Ducts:type:IronPipe'),
    'POINT',
  );
  assert.equal(legacyGeometryForTypeCode('category:Infrastructure.Passive:type:Splitter'), undefined);
});

test('geometryFromLocationTypes só infere com consenso total', () => {
  assert.equal(geometryFromLocationTypes(['Point', 'Point']), 'POINT');
  assert.equal(geometryFromLocationTypes(['LineString']), 'LINE');
  assert.equal(geometryFromLocationTypes(['Polygon', 'Polygon']), 'POLYGON');
  // Mistura, ausência de instâncias e tipo fora do domínio operacional não inferem nada.
  assert.equal(geometryFromLocationTypes(['Point', 'LineString']), undefined);
  assert.equal(geometryFromLocationTypes([]), undefined);
  assert.equal(geometryFromLocationTypes(['MultiPolygon']), undefined);
  assert.equal(geometryFromLocationTypes(['Point', null]), undefined);
});

test('resolveResourceTypeGeometry respeita a precedência entre as três fontes', () => {
  const index = studioGeoGeometryIndex({ nodes: [entityNode('Pole', 'POLYGON')] });

  // 1. A publicação vigente do Studio GEO vence o catálogo legado, mesmo discordando dele.
  assert.deepEqual(
    resolveResourceTypeGeometry(
      { id: 'type-pole', code: 'Pole', locationGeometryTypes: ['Point'] },
      index,
    ),
    { geometryKind: 'POLYGON', source: 'studio-geo' },
  );

  // 2. Sem publicação, o catálogo legado decide — e vence a inferência por instância.
  assert.deepEqual(
    resolveResourceTypeGeometry(
      { id: 'type-cable', code: 'DropCable', locationGeometryTypes: ['Point'] },
      index,
    ),
    { geometryKind: 'LINE', source: 'legacy-catalog' },
  );

  // 3. Só então a inferência por consenso das instâncias.
  assert.deepEqual(
    resolveResourceTypeGeometry(
      { id: 'type-area', code: 'ServiceArea', locationGeometryTypes: ['Polygon', 'Polygon'] },
      index,
    ),
    { geometryKind: 'POLYGON', source: 'instance-geometry' },
  );
});

test('resolveResourceTypeGeometry resolve a publicação tanto por id quanto por code', () => {
  // O catálogo publicado guarda o `code` em `sourceId`; drafts autorais mais recentes guardam o id.
  const byId = studioGeoGeometryIndex({ nodes: [entityNode('type-uuid', 'LINE')] });
  assert.deepEqual(
    resolveResourceTypeGeometry({ id: 'type-uuid', code: 'Duct', locationGeometryTypes: [] }, byId),
    { geometryKind: 'LINE', source: 'studio-geo' },
  );
});

test('resolveResourceTypeGeometry devolve undefined quando não há evidência alguma', () => {
  // É este caso que interrompe a migration: um tipo visível sem evidência precisa de decisão
  // humana, não de um valor arbitrário gravado no banco.
  assert.equal(
    resolveResourceTypeGeometry(
      { id: 'type-novo', code: 'TipoNovo', locationGeometryTypes: [] },
      new Map(),
    ),
    undefined,
  );
  // Instâncias contraditórias também não resolvem.
  assert.equal(
    resolveResourceTypeGeometry(
      { id: 'type-misto', code: 'TipoMisto', locationGeometryTypes: ['Point', 'Polygon'] },
      new Map(),
    ),
    undefined,
  );
});
