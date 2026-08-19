import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProjectSites, projectIdOfNode } from './geoProjectApi';
import type { GeoTreeNode } from './geoTreeApi';

afterEach(() => vi.restoreAllMocks());

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('fetchProjectSites', () => {
  it('carimba projectId nos locais devolvidos sem bounds (lista do painel)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'site:s1',
          kind: 'site',
          label: 'Local 1',
          refId: 's1',
          hasChildren: false,
          note: 'observação',
          geonetAddressId: 'geonet-1',
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sites = await fetchProjectSites('project-1');

    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      id: 'site:s1',
      note: 'observação',
      geonetAddressId: 'geonet-1',
      projectId: 'project-1',
    });
  });

  it('carimba projectId nos locais devolvidos por bbox (busca por viewport, REQ-MOD01-017)', async () => {
    // O caminho por bbox (projeto com manchas geradas) devolve note/geonetAddressId nulos —
    // é o mesmo formato que quebrava o roteamento do clique no mapa antes do carimbo.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'site:s2',
          kind: 'site',
          label: 'Local 2',
          refId: 's2',
          hasChildren: false,
          note: null,
          geonetAddressId: null,
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sites = await fetchProjectSites('project-1', {
      bounds: { minLng: -44, minLat: -23, maxLng: -43, maxLat: -22 },
    });

    expect(sites[0]).toMatchObject({ id: 'site:s2', projectId: 'project-1' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`/v1/geo/projects/project-1/sites?`);
    expect(url).toContain('minLng=-44');
  });
});

describe('projectIdOfNode', () => {
  it('devolve null para um GeoTreeNode comum, sem o carimbo de projeto', () => {
    const node: GeoTreeNode = {
      id: 'site:s3',
      kind: 'site',
      label: 'Estação',
      refId: 's3',
      hasChildren: false,
    };

    expect(projectIdOfNode(node)).toBeNull();
  });
});
