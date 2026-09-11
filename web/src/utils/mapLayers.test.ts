import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_MAP_LAYERS_VISIBLE,
  MAP_LAYER_CATALOG_FALLBACK,
  defaultMapLayerVisibility,
  groupVisibility,
  isMapFeatureVisible,
  nodeForMapFeature,
  readStoredExpandedGroups,
  readStoredLayerControlOpen,
  readStoredLayers,
  setGroupVisibility,
  viewportInclude,
  writeStoredExpandedGroups,
  writeStoredLayerControlOpen,
  writeStoredLayers,
} from './mapLayers';
import type { StudioGeoCatalog, StudioGeoPointVisualConfig } from '../services/studioGeoApi';

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
  it('devolve undefined quando as três camadas de viewport estão ligadas (caminho quente)', () => {
    expect(viewportInclude(ALL_MAP_LAYERS_VISIBLE)).toBeUndefined();
  });

  it('lista só as camadas ligadas', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      resourceFiberCable: false,
      resourceDropCable: false,
    };
    expect(viewportInclude(visibility)).toEqual(['sites', 'resource-points']);
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

  it('pede "sites" se QUALQUER um dos papéis de site estiver ligado', () => {
    const visibility = {
      ...ALL_MAP_LAYERS_VISIBLE,
      siteNetwork: false,
      siteService: true,
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
    expect(viewportInclude(visibility)).toEqual(['sites']);
  });

  it('estações e cobertura não entram no include (não vêm do viewport)', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, stations: false, 'coverage-gpon': false };
    expect(viewportInclude(visibility)).toBeUndefined();
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
    iconCode: 'energy.substation',
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
        visualConfig: { ...publishedPointConfig, iconCode: 'data-center.server' },
      },
    ],
  };

  it('resolve a entidade publicada por sourceModelType/sourceModelId, sem depender de rótulo/id de camada', () => {
    const node = nodeForMapFeature(
      { kind: 'site', shape: 'point', sourceModelType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceModelId: 'CO' },
      publishedCatalog,
    );
    expect(node?.id).toBe('stations');
    expect((node?.visualConfig as StudioGeoPointVisualConfig).iconCode).toBe('energy.substation');
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
      { kind: 'site', shape: 'point', sourceModelType: 'GEOGRAPHIC_SITE_SPECIFICATION', sourceModelId: 'CO' },
      catalog,
    );
    expect(siteNode?.id).toBe('stations');
  });

  it('sem sourceModelId e catálogo publicado (fallback=false), não resolve nada — nenhuma heurística legada entra em jogo', () => {
    const node = nodeForMapFeature({ kind: 'site', shape: 'point', sublabel: 'CO' }, publishedCatalog);
    expect(node).toBeUndefined();
  });

  it('catálogo em fallback ainda resolve pela heurística legada quando a feature não tem sourceModelId', () => {
    const node = nodeForMapFeature(
      { kind: 'resource', shape: 'point', typeCode: 'Tower' },
      MAP_LAYER_CATALOG_FALLBACK,
    );
    expect(node?.id).toBe('netwinTower');
  });

  it('trocar apenas visualConfig.iconCode não muda qual entidade é resolvida nem a visibilidade', () => {
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
          ? { ...node, visualConfig: { ...(node.visualConfig as StudioGeoPointVisualConfig), iconCode: 'logistics.truck' } }
          : node,
      ),
    };
    const after = nodeForMapFeature(feature, repainted);
    expect(after?.id).toBe(before?.id);
    expect(after?.defaultVisible).toBe(before?.defaultVisible);
    expect((after?.visualConfig as StudioGeoPointVisualConfig).iconCode).toBe('logistics.truck');
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
    window.localStorage.setItem('nexus.geo.mapLayers', JSON.stringify({ resourceCdoe: false, resourceDropCable: true }));
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

describe('readStoredLayers / writeStoredLayers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve o default quando não há nada salvo', () => {
    expect(readStoredLayers()).toEqual(ALL_MAP_LAYERS_VISIBLE);
  });

  it('round-trip: grava e lê de volta', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceDropCable: false, 'coverage-gpon': false };
    writeStoredLayers(visibility);
    expect(readStoredLayers()).toEqual(visibility);
  });

  it('JSON inválido cai no default', () => {
    window.localStorage.setItem('nexus.geo.mapLayers', '{not json');
    expect(readStoredLayers()).toEqual(ALL_MAP_LAYERS_VISIBLE);
  });

  it('valor não-booleano numa chave conhecida é ignorado (mantém o default daquela chave)', () => {
    window.localStorage.setItem(
      'nexus.geo.mapLayers',
      JSON.stringify({ resourceDropCable: 'nope', 'coverage-gpon': false }),
    );
    const result = readStoredLayers();
    expect(result.resourceDropCable).toBe(true);
    expect(result['coverage-gpon']).toBe(false);
  });

  it('chave desconhecida (inclusive a antiga "sites") é ignorada', () => {
    window.localStorage.setItem(
      'nexus.geo.mapLayers',
      JSON.stringify({ sites: false, unknownLayer: false, stations: false }),
    );
    const result = readStoredLayers();
    expect(result.stations).toBe(false);
    expect((result as Record<string, unknown>).unknownLayer).toBeUndefined();
    expect((result as Record<string, unknown>).sites).toBeUndefined();
  });

  it('array (não-objeto de chave/valor) cai no default', () => {
    window.localStorage.setItem('nexus.geo.mapLayers', JSON.stringify(['stations']));
    expect(readStoredLayers()).toEqual(ALL_MAP_LAYERS_VISIBLE);
  });
});

describe('readStoredLayerControlOpen / writeStoredLayerControlOpen', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('retorna default quando não há chave gravada', () => {
    expect(readStoredLayerControlOpen(false)).toBe(false);
    expect(readStoredLayerControlOpen(true)).toBe(true);
  });

  it('grava e lê o estado de seletor aberto/fechado', () => {
    writeStoredLayerControlOpen(true);
    expect(readStoredLayerControlOpen(false)).toBe(true);

    writeStoredLayerControlOpen(false);
    expect(readStoredLayerControlOpen(true)).toBe(false);
  });
});

describe('readStoredExpandedGroups / writeStoredExpandedGroups', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('retorna todos os grupos expandidos por default', () => {
    const defaultExpanded = readStoredExpandedGroups();
    expect(defaultExpanded.has('locations')).toBe(true);
    expect(defaultExpanded.has('coverage')).toBe(true);
    expect(defaultExpanded.has('netwinInfrastructure')).toBe(true);
    expect(defaultExpanded.has('resources')).toBe(true);
  });

  it('grava e lê o conjunto de grupos expandidos filtrando IDs inválidos', () => {
    const next = new Set(['locations', 'resources']);
    writeStoredExpandedGroups(next);

    const read = readStoredExpandedGroups();
    expect(read.has('locations')).toBe(true);
    expect(read.has('resources')).toBe(true);
    expect(read.has('coverage')).toBe(false);
    expect(read.has('netwinInfrastructure')).toBe(false);
  });
});
