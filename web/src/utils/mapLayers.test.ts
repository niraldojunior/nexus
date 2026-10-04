import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_MAP_LAYERS_VISIBLE,
  MAP_LAYER_CATALOG_FALLBACK,
  defaultMapLayerVisibility,
  descendantEntities,
  groupVisibility,
  mapLayerEntities,
  mapLayerEntitiesForDraw,
  mapLayerVisualRank,
  isMapFeatureVisible,
  nodeForMapFeature,
  readStoredBaseMap,
  readStoredExpandedGroups,
  readStoredLayerControlOpen,
  readStoredLayers,
  setGroupVisibility,
  viewportInclude,
  visibleMapSiteSourceIds,
  visibleCoverageLayer,
  writeStoredBaseMap,
  writeStoredExpandedGroups,
  writeStoredLayerControlOpen,
  writeStoredLayers,
} from './mapLayers';
import type { StudioGeoCatalog, StudioGeoPointVisualConfig } from '../services/studioGeoApi';
import { defaultColorRule } from './studioGeoDefaults';

describe('ordem operacional das camadas', () => {
  const catalog: StudioGeoCatalog = {
    schemaVersion: 2,
    configured: true,
    environmentId: 'ordering',
    fallback: false,
    nodes: [
      { id: 'z-group', kind: 'GROUP', parentNodeId: null, label: 'Z', sortOrder: 20, active: true },
      { id: 'a-group', kind: 'GROUP', parentNodeId: null, label: 'A', sortOrder: 10, active: true },
      {
        id: 'nested-group',
        kind: 'GROUP',
        parentNodeId: 'a-group',
        label: 'Aninhado',
        sortOrder: 20,
        active: true,
      },
      {
        id: 'cdoe',
        kind: 'ENTITY',
        parentNodeId: 'a-group',
        label: 'CDOE',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'RESOURCE',
          sourceDomain: 'resource-model',
          sourceType: 'RESOURCE_TYPE',
          sourceId: 'CDOE',
        },
      },
      {
        id: 'coverage',
        kind: 'ENTITY',
        parentNodeId: 'nested-group',
        label: 'Cobertura',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'COVERAGE',
          sourceDomain: 'spatial',
          sourceType: 'GPON_AGGREGATE',
          sourceId: 'gpon',
        },
      },
      {
        id: 'tie-b',
        kind: 'ENTITY',
        parentNodeId: 'z-group',
        label: 'B',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'LOCAL',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: 'B',
        },
      },
      {
        id: 'tie-a',
        kind: 'ENTITY',
        parentNodeId: 'z-group',
        label: 'A',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'LOCAL',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: 'A',
        },
      },
      {
        id: 'inactive',
        kind: 'ENTITY',
        parentNodeId: 'a-group',
        label: 'Inativa',
        sortOrder: 1,
        active: false,
        defaultVisible: true,
        entity: {
          category: 'RESOURCE',
          sourceDomain: 'resource-model',
          sourceType: 'RESOURCE_TYPE',
          sourceId: 'INACTIVE',
        },
      },
    ],
  };

  it('achata a árvore na mesma ordem do controle, com o primeiro item mais frontal', () => {
    expect(mapLayerEntities(catalog).map((node) => node.id)).toEqual([
      'cdoe',
      'coverage',
      'tie-a',
      'tie-b',
    ]);
    expect(mapLayerVisualRank(mapLayerEntities(catalog)[0], catalog)).toBe(0);
    expect(mapLayerVisualRank(undefined, catalog)).toBe(-1);
  });

  it('inverte a prioridade apenas para o desenho no canvas', () => {
    expect(mapLayerEntitiesForDraw(catalog).map((node) => node.id)).toEqual([
      'tie-b',
      'tie-a',
      'coverage',
      'cdoe',
    ]);
  });

  it('mantém a ordem hierárquica ao listar descendentes', () => {
    expect(descendantEntities(catalog, 'a-group').map((node) => node.id)).toEqual([
      'cdoe',
      'coverage',
    ]);
  });
});

describe('groupVisibility / setGroupVisibility', () => {
  it('reporta "all" quando todos os filhos do grupo estão ligados', () => {
    expect(groupVisibility(ALL_MAP_LAYERS_VISIBLE, 'locations')).toBe('all');
    expect(groupVisibility(ALL_MAP_LAYERS_VISIBLE, 'resources')).toBe('all');
  });

  it('reporta "none" quando todos os filhos do grupo estão desligados', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      stations: false,
      siteNetwork: false,
      siteService: false,
      netwinTower: false,
    };
    expect(groupVisibility(visibility, 'locations')).toBe('none');
  });

  it('reporta "some" quando só parte dos filhos está ligada', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceDropCable: false };
    expect(groupVisibility(visibility, 'resources')).toBe('some');
  });

  it('grupo sem filhos (id desconhecido) reporta "none"', () => {
    expect(groupVisibility(ALL_MAP_LAYERS_VISIBLE, 'nope' as never)).toBe('none');
  });

  it('clique no grupo com algum filho ligado desliga todos os filhos', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceDropCable: false };
    const next = setGroupVisibility(visibility, 'resources');
    expect(next.resourceCdoe).toBe(false);
    expect(next.resourceDropCable).toBe(false);
  });

  it('clique no grupo com todos os filhos desligados liga todos', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      resourceCdoe: false,
      resourceCdoi: false,
      resourceCeo: false,
      resourceDio: false,
      resourceFiberCable: false,
      resourceDropCable: false,
    };
    const next = setGroupVisibility(visibility, 'resources');
    expect(next.resourceCdoe).toBe(true);
    expect(next.resourceDropCable).toBe(true);
  });

  it('não muda outros grupos', () => {
    const next = setGroupVisibility(ALL_MAP_LAYERS_VISIBLE, 'resources');
    expect(next.stations).toBe(true);
    expect(next.siteNetwork).toBe(true);
    expect(next['coverage-gpon']).toBe(true);
  });
});

describe('viewportInclude', () => {
  it('devolve undefined quando as duas camadas de viewport estão ligadas (caminho quente)', () => {
    expect(viewportInclude(ALL_MAP_LAYERS_VISIBLE)).toBeUndefined();
  });

  it('lista só as camadas ligadas', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      resourceFiberCable: false,
      resourceDropCable: false,
    };
    expect(viewportInclude(visibility)).toEqual(['resource-points']);
  });

  it('devolve lista vazia quando tudo de viewport está desligado', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      siteNetwork: false,
      siteService: false,
      netwinTower: false,
      netwinPole: false,
      netwinDuct: false,
      netwinManhole: false,
      resourceCdoe: false,
      resourceCdoi: false,
      resourceCeo: false,
      resourceDio: false,
      resourceFiberCable: false,
      resourceDropCable: false,
    };
    expect(viewportInclude(visibility)).toEqual([]);
  });

  it('Sites nunca entram no include (têm leitura própria por bbox)', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      netwinTower: false,
      netwinPole: false,
      netwinDuct: false,
      netwinManhole: false,
      resourceCdoe: false,
      resourceCdoi: false,
      resourceCeo: false,
      resourceDio: false,
      resourceFiberCable: false,
      resourceDropCable: false,
    };
    expect(viewportInclude(visibility)).toEqual([]);
  });

  it('estações e cobertura não entram no include (não vêm do viewport)', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, stations: false, 'coverage-gpon': false };
    expect(viewportInclude(visibility)).toBeUndefined();
  });
});

describe('visibleMapSiteSourceIds', () => {
  const siteEntity = (
    id: string,
    sourceId: string,
    visible = true,
  ): StudioGeoCatalog['nodes'][number] =>
    ({
      id,
      kind: 'ENTITY',
      parentNodeId: null,
      label: id,
      sortOrder: 1,
      active: true,
      defaultVisible: visible,
      entity: {
        category: 'LOCAL',
        sourceDomain: 'location-model',
        sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceId,
      },
      visualConfig: { geometryKind: 'POINT', scaleBands: {} },
    }) as never;
  const catalog: StudioGeoCatalog = {
    schemaVersion: 2,
    configured: true,
    environmentId: 'x',
    fallback: false,
    nodes: [
      siteEntity('a', 'CO'),
      siteEntity('b', 'ENERGY_SUBSTATION'),
      siteEntity('c', 'HIDDEN', false),
    ],
  };

  it('devolve source IDs ordenados, sem exceção por tipo e respeitando o toggle', () => {
    expect(visibleMapSiteSourceIds({}, catalog)).toEqual(['CO', 'ENERGY_SUBSTATION']);
  });

  it('no fallback nunca envia IDs legacy-*', () => {
    const ids = visibleMapSiteSourceIds(ALL_MAP_LAYERS_VISIBLE, undefined, null, [
      { code: 'CO', siteRole: 'network' },
      { code: 'SVC', siteRole: 'service' },
    ]);
    expect(ids).toEqual(['CO', 'SVC']);
    expect(ids.some((id) => id.startsWith('legacy-'))).toBe(false);
  });
});

describe('visibleCoverageLayer', () => {
  // Catálogo mínimo com dois nós COVERAGE, cada um com um sourceType diferente — nenhum é
  // GPON_AGGREGATE, o caso que motivou a função (publicação via seletor "Região (Cobertura)"
  // do Studio, que sempre emite GEOGRAPHIC_SITE_SPECIFICATION).
  const catalogWithTwoCoverageLayers: StudioGeoCatalog = {
    schemaVersion: 2,
    configured: true,
    environmentId: 'coverage-agnostic',
    fallback: false,
    nodes: [
      {
        id: 'group',
        kind: 'GROUP',
        parentNodeId: null,
        label: 'Cobertura',
        sortOrder: 10,
        active: true,
      },
      {
        id: 'coverage-region',
        kind: 'ENTITY',
        parentNodeId: 'group',
        label: 'Cobertura por Região',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'COVERAGE',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: 'GPON_COVERAGE',
        },
      },
      {
        id: 'coverage-spatial',
        kind: 'ENTITY',
        parentNodeId: 'group',
        label: 'Cobertura Espacial',
        sortOrder: 20,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'COVERAGE',
          sourceDomain: 'spatial',
          sourceType: 'SPATIAL_COVERAGE',
          sourceId: 'spatial-1',
        },
      },
    ],
  };

  it('acha um nó COVERAGE publicado como GEOGRAPHIC_SITE_SPECIFICATION, não só GPON_AGGREGATE', () => {
    const catalog: StudioGeoCatalog = {
      ...catalogWithTwoCoverageLayers,
      nodes: catalogWithTwoCoverageLayers.nodes.filter((node) => node.id !== 'coverage-spatial'),
    };
    const visibility = defaultMapLayerVisibility(catalog);
    const layer = visibleCoverageLayer(visibility, catalog);
    expect(layer?.id).toBe('coverage-region');
    expect(layer?.entity.sourceType).toBe('GEOGRAPHIC_SITE_SPECIFICATION');
  });

  it('ignora nó COVERAGE desligado na visibilidade', () => {
    const catalog: StudioGeoCatalog = {
      ...catalogWithTwoCoverageLayers,
      nodes: catalogWithTwoCoverageLayers.nodes.filter((node) => node.id !== 'coverage-spatial'),
    };
    const visibility = { ...defaultMapLayerVisibility(catalog), 'coverage-region': false };
    expect(visibleCoverageLayer(visibility, catalog)).toBeUndefined();
  });

  it('ignora nó COVERAGE fora da faixa de escala publicada', () => {
    const scaleBands = {
      le5m: { visible: false, strokeWidth: 0 },
      le10m: { visible: false, strokeWidth: 0 },
      le20m: { visible: false, strokeWidth: 0 },
      le50m: { visible: false, strokeWidth: 0 },
      le100m: { visible: false, strokeWidth: 0 },
      le500m: { visible: false, strokeWidth: 0 },
      le1km: { visible: false, strokeWidth: 0 },
      gt1km: { visible: false, strokeWidth: 0 },
    };
    const catalog: StudioGeoCatalog = {
      ...catalogWithTwoCoverageLayers,
      nodes: catalogWithTwoCoverageLayers.nodes
        .map((node) =>
          node.id === 'coverage-region'
            ? {
                ...node,
                visualConfig: {
                  geometryKind: 'POLYGON' as const,
                  fill: defaultColorRule('COVERAGE', '#000'),
                  fillOpacity: 1,
                  stroke: defaultColorRule('COVERAGE', '#000'),
                  strokeOpacity: 1,
                  strokeStyle: 'solid' as const,
                  scaleBands,
                },
              }
            : node,
        )
        .filter((node) => node.id !== 'coverage-spatial'),
    };
    const visibility = defaultMapLayerVisibility(catalog);
    // scaleMeters explícito (200m) cai numa banda marcada como invisível na publicação.
    expect(visibleCoverageLayer(visibility, catalog, 200)).toBeUndefined();
  });

  it('com duas camadas COVERAGE ligadas, vence a primeira em ordem de desenho', () => {
    const visibility = defaultMapLayerVisibility(catalogWithTwoCoverageLayers);
    const layer = visibleCoverageLayer(visibility, catalogWithTwoCoverageLayers);
    // mapLayerEntitiesForDraw inverte a ordem do Studio: o último da lista (coverage-spatial)
    // desenha primeiro.
    expect(layer?.id).toBe('coverage-spatial');
  });

  it('continua reconhecendo o nó canônico GPON_AGGREGATE do bootstrap legado', () => {
    const visibility = defaultMapLayerVisibility(MAP_LAYER_CATALOG_FALLBACK);
    const layer = visibleCoverageLayer(visibility, MAP_LAYER_CATALOG_FALLBACK);
    expect(layer?.id).toBe('coverage-gpon');
    expect(layer?.entity.sourceType).toBe('GPON_AGGREGATE');
  });
});

describe('isMapFeatureVisible', () => {
  it('filtra cada tipo de recurso Netwin sem esconder recursos de outros catálogos', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, netwinTower: false };
    expect(
      isMapFeatureVisible({ kind: 'resource', shape: 'point', typeCode: 'Tower' }, visibility),
    ).toBe(false);
    expect(
      isMapFeatureVisible({ kind: 'resource', shape: 'point', typeCode: 'OLT' }, visibility),
    ).toBe(true);
  });

  it('recurso sem camada correspondente permanece visível', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, netwinPole: false };
    expect(
      isMapFeatureVisible({ kind: 'resource', shape: 'point', typeCode: 'Splitter' }, visibility),
    ).toBe(true);
  });

  it('agrupa Duto/tubo de subida/túnel/pedestal/suporte na camada única "Dutos"', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, netwinDuct: false };
    for (const typeCode of [
      'Duct',
      'RisingTube',
      'CableTunnel',
      'Pedestal',
      'SupportBracket',
      'IronPipe',
    ]) {
      expect(isMapFeatureVisible({ kind: 'resource', shape: 'point', typeCode }, visibility)).toBe(
        false,
      );
    }
  });

  it('CTO roteia para CDOI quando o nome contém "CDOI", senão para CDOE', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceCdoi: false };
    expect(
      isMapFeatureVisible(
        { kind: 'resource', shape: 'point', typeCode: 'CTO', label: 'CDOI Bloco A' },
        visibility,
      ),
    ).toBe(false);
    expect(
      isMapFeatureVisible(
        { kind: 'resource', shape: 'point', typeCode: 'CTO', label: 'CTO 001' },
        visibility,
      ),
    ).toBe(true);
  });

  it('cabos de fibra (Fiber/DistributionCable/BackboneCable) e Drop Cable ficam em camadas separadas', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceFiberCable: false };
    for (const typeCode of ['Fiber', 'DistributionCable', 'BackboneCable']) {
      expect(isMapFeatureVisible({ kind: 'resource', shape: 'line', typeCode }, visibility)).toBe(
        false,
      );
    }
    expect(
      isMapFeatureVisible({ kind: 'resource', shape: 'line', typeCode: 'DropCable' }, visibility),
    ).toBe(true);
  });

  it('roteia site pelo siteRole resolvido via roleByCode (siteService)', () => {
    const roleByCode = new Map([['CUSTOMER_SITE', 'service' as const]]);
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, siteService: false };
    expect(
      isMapFeatureVisible(
        { kind: 'site', shape: 'point', sublabel: 'CUSTOMER_SITE' },
        visibility,
        roleByCode,
      ),
    ).toBe(false);
    expect(
      isMapFeatureVisible(
        { kind: 'site', shape: 'point', sublabel: 'CUSTOMER_SITE' },
        { ...visibility, siteService: true },
        roleByCode,
      ),
    ).toBe(true);
  });

  it('papel property e código desconhecido caem em siteNetwork', () => {
    const roleByCode = new Map([['CONDOMINIUM', 'property' as const]]);
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, siteNetwork: false };
    expect(
      isMapFeatureVisible(
        { kind: 'site', shape: 'point', sublabel: 'CONDOMINIUM' },
        visibility,
        roleByCode,
      ),
    ).toBe(false);
    expect(isMapFeatureVisible({ kind: 'site', shape: 'point', sublabel: 'CO' }, visibility)).toBe(
      false,
    );
  });
});

describe('nodeForMapFeature', () => {
  const publishedPointConfig: StudioGeoPointVisualConfig = {
    geometryKind: 'POINT',
    color: defaultColorRule('LOCAL', '#8b5cf6'),
    opacity: 1,
    scaleBands: {
      le5m: { visible: true, sizePx: 18 },
      le10m: { visible: true, sizePx: 18 },
      le20m: { visible: true, sizePx: 18 },
      le50m: { visible: true, sizePx: 18 },
      le100m: { visible: true, sizePx: 18 },
      le500m: { visible: true, sizePx: 18 },
      le1km: { visible: true, sizePx: 18 },
      gt1km: { visible: true, sizePx: 18 },
    },
  };

  const publishedCatalog: StudioGeoCatalog = {
    schemaVersion: 2,
    configured: true,
    environmentId: 'env-published',
    fallback: false,
    nodes: [
      {
        id: 'stations',
        kind: 'ENTITY',
        parentNodeId: null,
        label: 'Estações',
        sortOrder: 10,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'LOCAL',
          sourceDomain: 'location-model',
          sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
          sourceId: 'CO',
        },
        visualIdentity: { kind: 'system', iconCode: 'energy.substation' },
        visualConfig: publishedPointConfig,
      },
      {
        id: 'olts',
        kind: 'ENTITY',
        parentNodeId: null,
        label: 'OLTs',
        sortOrder: 20,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'RESOURCE',
          sourceDomain: 'resource-model',
          sourceType: 'RESOURCE_TYPE',
          sourceId: 'OLT',
        },
        visualIdentity: { kind: 'system', iconCode: 'data-center.server' },
        visualConfig: publishedPointConfig,
      },
      {
        id: 'cdoi',
        kind: 'ENTITY',
        parentNodeId: null,
        label: 'CDOI',
        sortOrder: 30,
        active: true,
        defaultVisible: true,
        entity: {
          category: 'RESOURCE',
          sourceDomain: 'resource-model',
          sourceType: 'RESOURCE_TYPE',
          sourceId: 'category:CDOI',
        },
        visualIdentity: { kind: 'system', iconCode: 'network.ont' },
        visualConfig: publishedPointConfig,
      },
    ],
  };

  it('resolve a entidade publicada por sourceModelType/sourceModelId, sem depender de rótulo/id de camada', () => {
    const node = nodeForMapFeature(
      {
        kind: 'site',
        shape: 'point',
        sourceModelType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceModelId: 'CO',
      },
      publishedCatalog,
    );
    expect(node?.id).toBe('stations');
    expect(node?.visualIdentity?.kind === 'system' ? node.visualIdentity.iconCode : undefined).toBe(
      'energy.substation',
    );
  });

  it('resolve Resource pelo ResourceType.code canônico persistido no índice', () => {
    const node = nodeForMapFeature(
      {
        kind: 'resource',
        shape: 'point',
        sourceModelType: 'RESOURCE_TYPE',
        sourceModelId: 'category:CDOI',
      },
      publishedCatalog,
    );
    expect(node?.id).toBe('cdoi');
  });

  it('não resolve o código histórico CTO em catálogo publicado com identidade canônica CDOI', () => {
    const node = nodeForMapFeature(
      {
        kind: 'resource',
        shape: 'point',
        sourceModelType: 'RESOURCE_TYPE',
        sourceModelId: 'CTO',
      },
      publishedCatalog,
    );
    expect(node).toBeUndefined();
  });

  it('não confunde Site e Resource com o mesmo sourceId quando sourceModelType diverge', () => {
    const catalog: StudioGeoCatalog = {
      ...publishedCatalog,
      nodes: [
        ...publishedCatalog.nodes,
        {
          id: 'ambiguous-resource',
          kind: 'ENTITY',
          parentNodeId: null,
          label: 'Ambíguo',
          sortOrder: 30,
          active: true,
          defaultVisible: true,
          entity: {
            category: 'RESOURCE',
            sourceDomain: 'resource-model',
            sourceType: 'RESOURCE_TYPE',
            sourceId: 'CO',
          },
        },
      ],
    };
    const siteNode = nodeForMapFeature(
      {
        kind: 'site',
        shape: 'point',
        sourceModelType: 'GEOGRAPHIC_SITE_SPECIFICATION',
        sourceModelId: 'CO',
      },
      catalog,
    );
    expect(siteNode?.id).toBe('stations');
  });

  it('sem sourceModelId e catálogo publicado (fallback=false), não resolve nada — nenhuma heurística legada entra em jogo', () => {
    const node = nodeForMapFeature(
      { kind: 'site', shape: 'point', sublabel: 'CO' },
      publishedCatalog,
    );
    expect(node).toBeUndefined();
  });

  it('catálogo em fallback ainda resolve pela heurística legada quando a feature não tem sourceModelId', () => {
    const node = nodeForMapFeature(
      { kind: 'resource', shape: 'point', typeCode: 'Tower' },
      MAP_LAYER_CATALOG_FALLBACK,
    );
    expect(node?.id).toBe('netwinTower');
  });

  it('trocar apenas a aparência (opacidade) não muda qual entidade é resolvida nem a visibilidade, nem a identidade canônica', () => {
    const feature = {
      kind: 'resource' as const,
      shape: 'point' as const,
      sourceModelType: 'RESOURCE_TYPE' as const,
      sourceModelId: 'OLT',
    };
    const before = nodeForMapFeature(feature, publishedCatalog);
    const repainted: StudioGeoCatalog = {
      ...publishedCatalog,
      nodes: publishedCatalog.nodes.map((node) =>
        node.id === 'olts' && node.kind === 'ENTITY'
          ? {
              ...node,
              visualConfig: { ...(node.visualConfig as StudioGeoPointVisualConfig), opacity: 0.5 },
            }
          : node,
      ),
    };
    const after = nodeForMapFeature(feature, repainted);
    expect(after?.id).toBe(before?.id);
    expect(after?.defaultVisible).toBe(before?.defaultVisible);
    expect((after?.visualConfig as StudioGeoPointVisualConfig).opacity).toBe(0.5);
    expect(after?.visualIdentity).toEqual(before?.visualIdentity);
  });
});

describe('published catalog reconciliation', () => {
  it('preserves existing preferences, drops retired IDs and defaults only new layers', () => {
    const catalog = {
      ...MAP_LAYER_CATALOG_FALLBACK,
      publicationChecksum: 'catalog-v2',
      fallback: false,
      nodes: [
        ...MAP_LAYER_CATALOG_FALLBACK.nodes.filter((node) => node.id !== 'resourceDropCable'),
        {
          id: 'newLayer',
          kind: 'ENTITY' as const,
          parentNodeId: 'resources',
          label: 'Nova',
          sortOrder: 70,
          defaultVisible: false,
          active: true,
          entity: {
            category: 'RESOURCE' as const,
            sourceDomain: 'resource-model' as const,
            sourceType: 'RESOURCE_TYPE' as const,
            sourceId: 'legacy-tower',
          },
        },
      ],
    };
    window.localStorage.setItem(
      `nexus.geo.mapLayers::${catalog.environmentId}`,
      JSON.stringify({ resourceCdoe: false, resourceDropCable: true }),
    );
    expect(readStoredLayers(catalog)).toMatchObject({ resourceCdoe: false, newLayer: false });
    expect(readStoredLayers(catalog).resourceDropCable).toBeUndefined();
  });

  it('uses catalog defaults when resetting visibility', () => {
    const catalog = {
      ...MAP_LAYER_CATALOG_FALLBACK,
      nodes: MAP_LAYER_CATALOG_FALLBACK.nodes.map((node) =>
        node.id === 'coverage-gpon' ? { ...node, defaultVisible: false } : node,
      ),
    };
    expect(defaultMapLayerVisibility(catalog)['coverage-gpon']).toBe(false);
  });
});

describe('mapLayerTree defesa contra ciclo', () => {
  it('não estoura a pilha quando um id duplicado do catálogo cria um grupo ancestral de si mesmo', () => {
    // Catálogo corrompido: dois nós compartilham o id "a" — um legítimo na raiz, outro
    // (dado inconsistente fora do fluxo de publicação validado) com `parentNodeId` apontando
    // para o próprio id "a". Ao expandir o nó raiz "a", seus filhos incluem essa duplicata, que
    // reaparece na mesma trilha de ancestrais e recursaria para sempre sem o corte de ciclo.
    const cyclicCatalog: StudioGeoCatalog = {
      schemaVersion: 2,
      configured: true,
      environmentId: 'cyclic',
      fallback: false,
      nodes: [
        {
          id: 'a',
          kind: 'GROUP',
          parentNodeId: null,
          label: 'A raiz',
          sortOrder: 10,
          active: true,
        },
        {
          id: 'a',
          kind: 'GROUP',
          parentNodeId: 'a',
          label: 'A duplicado',
          sortOrder: 20,
          active: true,
        },
        {
          id: 'leaf',
          kind: 'ENTITY',
          parentNodeId: 'a',
          label: 'Leaf',
          sortOrder: 10,
          active: true,
          defaultVisible: true,
          entity: {
            category: 'RESOURCE',
            sourceDomain: 'resource-model',
            sourceType: 'RESOURCE_TYPE',
            sourceId: 'CDOE',
          },
        },
      ],
    };

    expect(() => mapLayerEntities(cyclicCatalog)).not.toThrow();
    expect(mapLayerEntities(cyclicCatalog).map((node) => node.id)).toEqual(['leaf']);
  });
});

describe('readStoredLayers / writeStoredLayers', () => {
  const ENV = 'env-a';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve o default quando não há nada salvo', () => {
    expect(readStoredLayers()).toEqual(ALL_MAP_LAYERS_VISIBLE);
  });

  it('round-trip: grava e lê de volta', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      resourceDropCable: false,
      'coverage-gpon': false,
    };
    writeStoredLayers(visibility, ENV);
    expect(readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV })).toEqual(
      visibility,
    );
  });

  it('JSON inválido cai no default', () => {
    window.localStorage.setItem(`nexus.geo.mapLayers::${ENV}`, '{not json');
    expect(readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV })).toEqual(
      ALL_MAP_LAYERS_VISIBLE,
    );
  });

  it('valor não-booleano numa chave conhecida é ignorado (mantém o default daquela chave)', () => {
    window.localStorage.setItem(
      `nexus.geo.mapLayers::${ENV}`,
      JSON.stringify({ resourceDropCable: 'nope', 'coverage-gpon': false }),
    );
    const result = readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV });
    expect(result.resourceDropCable).toBe(true);
    expect(result['coverage-gpon']).toBe(false);
  });

  it('chave desconhecida (inclusive a antiga "sites") é ignorada', () => {
    window.localStorage.setItem(
      `nexus.geo.mapLayers::${ENV}`,
      JSON.stringify({ sites: false, unknownLayer: false, stations: false }),
    );
    const result = readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV });
    expect(result.stations).toBe(false);
    expect((result as Record<string, unknown>).unknownLayer).toBeUndefined();
    expect((result as Record<string, unknown>).sites).toBeUndefined();
  });

  it('array (não-objeto de chave/valor) cai no default', () => {
    window.localStorage.setItem(`nexus.geo.mapLayers::${ENV}`, JSON.stringify(['stations']));
    expect(readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV })).toEqual(
      ALL_MAP_LAYERS_VISIBLE,
    );
  });

  it('dois environmentId isolam as preferências entre si', () => {
    writeStoredLayers({ ...ALL_MAP_LAYERS_VISIBLE, stations: false }, 'env-x');
    writeStoredLayers({ ...ALL_MAP_LAYERS_VISIBLE, stations: true }, 'env-y');
    expect(
      readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: 'env-x' }).stations,
    ).toBe(false);
    expect(
      readStoredLayers({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: 'env-y' }).stations,
    ).toBe(true);
  });
});

describe('readStoredBaseMap / writeStoredBaseMap', () => {
  const ENV = 'env-a';
  const OPTIONS = [{ id: 'roadmap' }, { id: 'satellite' }, { id: 'geonet', disabled: true }];

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve a primeira opção selecionável quando não há preferência salva', () => {
    expect(readStoredBaseMap(OPTIONS, ENV)).toBe('roadmap');
  });

  it('grava e lê o MUB por ambiente e usuário', () => {
    writeStoredBaseMap('satellite', ENV, 'user-a');
    writeStoredBaseMap('roadmap', ENV, 'user-b');

    expect(readStoredBaseMap(OPTIONS, ENV, 'user-a')).toBe('satellite');
    expect(readStoredBaseMap(OPTIONS, ENV, 'user-b')).toBe('roadmap');
    expect(readStoredBaseMap(OPTIONS, 'env-b', 'user-a')).toBe('roadmap');
  });

  it('ignora MUB inexistente ou desabilitado', () => {
    window.localStorage.setItem('nexus.geo.baseMap::env-a', 'retired');
    expect(readStoredBaseMap(OPTIONS, ENV)).toBe('roadmap');

    window.localStorage.setItem('nexus.geo.baseMap::env-a', 'geonet');
    expect(readStoredBaseMap(OPTIONS, ENV)).toBe('roadmap');
  });

  it('migra a preferência legada sem namespace no ambiente legacy', () => {
    window.localStorage.setItem('nexus.geo.baseMap', 'satellite');
    expect(readStoredBaseMap(OPTIONS, 'legacy')).toBe('satellite');
    expect(window.localStorage.getItem('nexus.geo.baseMap::legacy')).toBe('satellite');
  });
});

describe('readStoredLayerControlOpen / writeStoredLayerControlOpen', () => {
  const ENV = 'env-a';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('retorna default quando não há chave gravada', () => {
    expect(readStoredLayerControlOpen(ENV, false)).toBe(false);
    expect(readStoredLayerControlOpen(ENV, true)).toBe(true);
  });

  it('grava e lê o estado de seletor aberto/fechado', () => {
    writeStoredLayerControlOpen(true, ENV);
    expect(readStoredLayerControlOpen(ENV, false)).toBe(true);

    writeStoredLayerControlOpen(false, ENV);
    expect(readStoredLayerControlOpen(ENV, true)).toBe(false);
  });
});

describe('readStoredExpandedGroups / writeStoredExpandedGroups', () => {
  const ENV = 'env-a';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('retorna todos os grupos expandidos por default', () => {
    const defaultExpanded = readStoredExpandedGroups({
      ...MAP_LAYER_CATALOG_FALLBACK,
      environmentId: ENV,
    });
    expect(defaultExpanded.has('locations')).toBe(true);
    expect(defaultExpanded.has('coverage')).toBe(true);
    expect(defaultExpanded.has('netwinInfrastructure')).toBe(true);
    expect(defaultExpanded.has('resources')).toBe(true);
  });

  it('grava e lê o conjunto de grupos expandidos filtrando IDs inválidos', () => {
    const next = new Set(['locations', 'resources']);
    writeStoredExpandedGroups(next, ENV);

    const read = readStoredExpandedGroups({ ...MAP_LAYER_CATALOG_FALLBACK, environmentId: ENV });
    expect(read.has('locations')).toBe(true);
    expect(read.has('resources')).toBe(true);
    expect(read.has('coverage')).toBe(false);
    expect(read.has('netwinInfrastructure')).toBe(false);
  });
});

describe('migração de chaves legadas (sem namespace)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('ambiente legacy migra uma única vez a chave antiga sem namespace', () => {
    window.localStorage.setItem(
      'nexus.geo.mapLayers',
      JSON.stringify({ ...ALL_MAP_LAYERS_VISIBLE, stations: false }),
    );
    const legacyCatalog = { ...MAP_LAYER_CATALOG_FALLBACK, environmentId: 'legacy' };
    expect(readStoredLayers(legacyCatalog).stations).toBe(false);

    // Migração persiste sob a chave namespaced; alterações futuras não voltam a copiar a antiga.
    window.localStorage.setItem('nexus.geo.mapLayers', JSON.stringify(ALL_MAP_LAYERS_VISIBLE));
    expect(readStoredLayers(legacyCatalog).stations).toBe(false);
  });

  it('ambiente empty nunca lê nem apaga a chave legada sem namespace', () => {
    window.localStorage.setItem(
      'nexus.geo.mapLayers',
      JSON.stringify({ ...ALL_MAP_LAYERS_VISIBLE, stations: false }),
    );
    const emptyCatalog = {
      ...MAP_LAYER_CATALOG_FALLBACK,
      environmentId: 'env-empty-1',
      fallback: false,
    };
    expect(readStoredLayers(emptyCatalog)).toEqual(ALL_MAP_LAYERS_VISIBLE);
    expect(window.localStorage.getItem('nexus.geo.mapLayers')).not.toBeNull();
  });
});
