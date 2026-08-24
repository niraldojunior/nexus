import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_MAP_LAYERS_VISIBLE,
  groupVisibility,
  isMapFeatureVisible,
  readStoredLayers,
  setGroupVisibility,
  viewportInclude,
  writeStoredLayers,
} from './mapLayers';

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
    expect(next.coverage).toBe(true);
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
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, stations: false, coverage: false };
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

describe('readStoredLayers / writeStoredLayers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devolve o default quando não há nada salvo', () => {
    expect(readStoredLayers()).toEqual(ALL_MAP_LAYERS_VISIBLE);
  });

  it('round-trip: grava e lê de volta', () => {
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceDropCable: false, coverage: false };
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
      JSON.stringify({ resourceDropCable: 'nope', coverage: false }),
    );
    const result = readStoredLayers();
    expect(result.resourceDropCable).toBe(true);
    expect(result.coverage).toBe(false);
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
