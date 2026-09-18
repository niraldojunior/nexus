import { describe, expect, it } from 'vitest';
import type { StudioGeoEntityNode } from '../services/studioGeoApi';
import {
  canonicalPointIconPreviewUrl,
  resolveOperationalIcon,
  type OperationalIconFacts,
} from './pointIconPreview';

const stationNode: StudioGeoEntityNode = {
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
};

const resourceNode: StudioGeoEntityNode = {
  id: 'olts',
  kind: 'ENTITY',
  parentNodeId: null,
  label: 'OLTs',
  sortOrder: 10,
  active: true,
  defaultVisible: true,
  entity: {
    category: 'RESOURCE',
    sourceDomain: 'resource-model',
    sourceType: 'RESOURCE_TYPE',
    sourceId: 'OLT',
  },
};

describe('canonicalPointIconPreviewUrl', () => {
  it('reutiliza o SVG quadrado lilás de Central Office exibido no mapa', () => {
    const url = canonicalPointIconPreviewUrl(stationNode, 'CO', 32);

    expect(url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(url)).toContain('fill="#8b5cf6"');
    expect(decodeURIComponent(url)).toContain('<rect');
  });

  it('resolve um código namespaced de outra indústria pelo registry nativo', () => {
    const url = canonicalPointIconPreviewUrl(stationNode, 'energy.substation', 32);

    expect(url).toMatch(/^data:image\/svg\+xml/);
  });

  it('usa a forma squircle para categoria LOCAL, independentemente da indústria do ícone', () => {
    const stationUrl = canonicalPointIconPreviewUrl(stationNode, 'data-center.server', 32);
    const resourceUrl = canonicalPointIconPreviewUrl(resourceNode, 'data-center.server', 32);

    // A categoria do nó decide a forma da moldura externa (squircle vs círculo); o glifo
    // interno (server) é o mesmo ícone nativo nos dois casos.
    expect(decodeURIComponent(resourceUrl)).toContain('<circle cx="16" cy="16"');
    expect(decodeURIComponent(stationUrl)).not.toContain('<circle cx="16" cy="16"');
  });

  it('mantém compatibilidade com todos os códigos Telecom legados (Site e Resource)', () => {
    for (const code of ['CO', 'POP', 'CTO', 'PI']) {
      expect(canonicalPointIconPreviewUrl(stationNode, code, 32)).toMatch(/^data:image\/svg\+xml/);
    }
    for (const code of ['OLT', 'Splitter', 'DIO', 'Pole', 'Tower', 'cdoe', 'cdoi', 'ceo']) {
      expect(canonicalPointIconPreviewUrl(resourceNode, code, 32)).toMatch(
        /^data:image\/svg\+xml/,
      );
    }
  });

  it('usa o ícone padrão do ResourceType quando não há identidade customizada', () => {
    const cdoiNode: StudioGeoEntityNode = {
      ...resourceNode,
      id: 'cdoi',
      label: 'CDOI 01',
      entity: { ...resourceNode.entity, sourceId: 'CTO' },
    };

    const url = canonicalPointIconPreviewUrl(cdoiNode, undefined, 32);

    // CTO usa o glifo package (caixa/cubo) por padrão
    expect(decodeURIComponent(url)).toContain('m7.5 4.27 9 5.15');
  });
});

describe('resolveOperationalIcon', () => {
  const cdoi: OperationalIconFacts = {
    kind: 'resource',
    resourceType: 'CTO',
    name: 'CDOI 01',
  };

  it('prioriza a identidade system do modelo com a forma contextual de mapa', () => {
    const result = resolveOperationalIcon(
      { kind: 'resource', resourceType: 'OLT', name: 'OLT Icaraí' },
      { kind: 'system', iconCode: 'Pole' },
      { size: 32, color: '#0ea5e9', opacity: 0.7 },
    );

    expect(result.assetId).toBeUndefined();
    expect(result.shape).toBe('circle');
    expect(decodeURIComponent(result.url ?? '')).toContain('fill="#0ea5e9"');
  });

  it('usa squircle para Location no mapa e glifo transparente fora dele', () => {
    const facts: OperationalIconFacts = {
      kind: 'site',
      siteCategory: 'Site',
      sublabel: 'Central Office',
    };
    const mapIcon = resolveOperationalIcon(facts, { kind: 'system', iconCode: 'CO' }, { size: 32 });
    const glyph = resolveOperationalIcon(facts, { kind: 'system', iconCode: 'CO' }, {
      size: 20,
      context: 'glyph',
      color: '#0284c7',
    });

    expect(mapIcon.shape).toBe('squircle');
    expect(decodeURIComponent(mapIcon.url ?? '')).toContain('<rect');
    expect(glyph.shape).toBe('none');
    expect(decodeURIComponent(glyph.url ?? '')).toContain('viewBox="0 0 24 24"');
    expect(decodeURIComponent(glyph.url ?? '')).not.toContain('stroke="#ffffff"');
  });

  it('mantém o asset do modelo separado do fallback síncrono', () => {
    const result = resolveOperationalIcon(cdoi, { kind: 'asset', assetId: 'asset-cdoi' }, { size: 32 });

    expect(result.assetId).toBe('asset-cdoi');
    expect(result.url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(result.url ?? '')).toContain('m7.5 4.27 9 5.15');
  });

  it('preserva o fallback canônico de CTO para recursos não customizados', () => {
    const result = resolveOperationalIcon(cdoi, undefined, { size: 32 });

    expect(result.label).toBe('CTO');
    expect(decodeURIComponent(result.url ?? '')).toContain('m7.5 4.27 9 5.15');
  });
});
