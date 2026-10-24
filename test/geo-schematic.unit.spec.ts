// Esquemático (GeoTreeService.schematicPath, issue #422): o salto final é o Local atendido da
// cadeia — o serving site, de qualquer tipo de Local —, não só o `serving_site_id` do
// equipamento mais a montante. Fake DatabaseClient roteado por trecho de SQL.

import { describe, expect, it, vi } from 'vitest';
import { GeoTreeService, type GeoTreeNode } from '../src/modules/geo/tree-service.js';
import type { DatabaseClient } from '../src/shared/persistence/database-client.js';

// CDOI → cabo → CEO → cabo backbone → OPT1 (nó óptico genérico dentro da estação).
const CHAIN = ['cdoi', 'cable-1', 'ceo', 'cable-2', 'opt1'];
const CABLES = new Set(['cable-1', 'cable-2']);

type Fixture = {
  // serving_site_id válidos (o JOIN com geographic_site já descartou os pendurados).
  serving?: Record<string, string>;
  placeOfLast?: string | null;
  sitesById?: Set<string>;
  sitesByLocationId?: Record<string, string>;
};

const createService = (fixture: Fixture) => {
  const edges = CHAIN.slice(0, -1).map((to, i) => ({
    resource_to_id: to,
    resource_from_id: CHAIN[i + 1],
  }));
  const all = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('CONNECT BY')) return edges;
    if (sql.includes('JOIN geographic_site s ON s.id = r.serving_site_id')) {
      return (params as string[])
        .filter((id) => fixture.serving?.[id])
        .map((id) => ({ id, serving_site_id: fixture.serving![id] }));
    }
    return []; // lances (supportedBy) dos cabos
  });
  const get = vi.fn(async (sql: string, params: unknown[] = []) => {
    const [id] = params as string[];
    if (sql.includes('SELECT place_id FROM resource_physical')) {
      return { place_id: fixture.placeOfLast ?? null };
    }
    if (sql.includes('geographic_location_id = ?')) {
      const siteId = fixture.sitesByLocationId?.[id!];
      return siteId ? { id: siteId } : undefined;
    }
    if (sql.includes('FROM geographic_site WHERE id = ?')) {
      return fixture.sitesById?.has(id!) ? { id } : undefined;
    }
    return undefined;
  });
  const service = new GeoTreeService({ all, get } as unknown as DatabaseClient);
  vi.spyOn(service, 'resourcesByIds').mockImplementation(async (ids) =>
    ids.map((id): GeoTreeNode => ({
      id: `resource:${id}`,
      kind: 'resource',
      label: id,
      refId: id,
      resourceType: CABLES.has(id) ? 'DistributionCable' : 'CTO',
      hasChildren: false,
    })),
  );
  const sitesByIds = vi
    .spyOn(service, 'sitesByIds')
    .mockImplementation(async (ids) =>
      ids.map((id): GeoTreeNode => ({
        id: `site:${id}`,
        kind: 'site',
        label: id,
        hasChildren: false,
      })),
    );
  return { service, sitesByIds };
};

const finalHop = (path: Awaited<ReturnType<GeoTreeService['schematicPath']>>) => path.hops.at(-1);

describe('GeoTreeService.schematicPath — Local atendido', () => {
  it('equipamento mais a montante sem serving herda o do equipamento a jusante', async () => {
    const { service } = createService({ serving: { cdoi: 'ici', ceo: 'ici' } });

    const path = await service.schematicPath('cdoi');

    expect(path.reachedSite).toBe(true);
    expect(finalHop(path)).toMatchObject({ role: 'site', node: { id: 'site:ici' } });
    expect(path.hops.map((hop) => hop.role)).toEqual([
      'equipment',
      'cable',
      'equipment',
      'cable',
      'equipment',
      'site',
    ]);
  });

  it('o serving do equipamento mais a montante tem prioridade', async () => {
    const { service } = createService({ serving: { cdoi: 'outro', opt1: 'ici' } });

    const path = await service.schematicPath('cdoi');

    expect(finalHop(path)).toMatchObject({ role: 'site', node: { id: 'site:ici' } });
  });

  it('ignora serving pendurado (fora de geographic_site) e cai no place do último equipamento', async () => {
    // O cabo carrega um serving inexistente — o JOIN não o devolve; nenhum outro recurso
    // tem serving, então vale o Local onde o OPT1 está, achado pela Location dele.
    const { service } = createService({
      serving: {},
      placeOfLast: 'loc-ici',
      sitesByLocationId: { 'loc-ici': 'ici' },
    });

    const path = await service.schematicPath('cdoi');

    expect(path.reachedSite).toBe(true);
    expect(finalHop(path)).toMatchObject({ role: 'site', node: { id: 'site:ici' } });
  });

  it('aceita place que é o id do próprio Local, de qualquer tipo', async () => {
    const { service } = createService({ placeOfLast: 'poste-7', sitesById: new Set(['poste-7']) });

    const path = await service.schematicPath('cdoi');

    expect(finalHop(path)).toMatchObject({ role: 'site', node: { id: 'site:poste-7' } });
  });

  it('sem serving nem place em Local, avisa que não chegou', async () => {
    const { service, sitesByIds } = createService({ placeOfLast: 'loc-rua' });

    const path = await service.schematicPath('cdoi');

    expect(path.reachedSite).toBe(false);
    expect(path.hops.some((hop) => hop.role === 'site')).toBe(false);
    expect(sitesByIds).not.toHaveBeenCalled();
  });
});
