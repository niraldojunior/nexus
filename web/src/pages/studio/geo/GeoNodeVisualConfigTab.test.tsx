import { describe, expect, it } from 'vitest';
import type { StudioGeoEntityNode } from '../../../services/studioGeoApi';
import { canonicalPointIconPreviewUrl } from './GeoNodeVisualConfigTab';

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
});
