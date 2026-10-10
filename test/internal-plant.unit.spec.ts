import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { RequestContext } from '../src/shared/http/request-context.js';
import type { IInternalPlantRepository } from '../src/modules/resource/internal-plant-repository-interface.js';
import type { InternalPlantResourceQuery } from '../src/modules/resource/internal-plant-domain.js';
import { InternalPlantService } from '../src/modules/resource/internal-plant-service.js';
import { escapeLike } from '../src/modules/resource/internal-plant-oracle-repository.js';

const context: RequestContext = {
  actorSub: 'tester',
  tenantId: 'tenant-a',
  roles: ['inventory.reader'],
  traceId: 'trace',
};

const build = () => {
  const queries: InternalPlantResourceQuery[] = [];
  const childCalls: Array<{ nodeId: string; limit: number; offset: number; tenantId: string }> = [];
  const repository: IInternalPlantRepository = {
    roots: async () => [],
    children: async (nodeId, options) => {
      childCalls.push({ nodeId, ...options });
      return { nodeId, nodes: [], total: 0, limit: options.limit, offset: options.offset };
    },
    listResources: async (query) => {
      queries.push(query);
      return { items: [], total: 0, limit: query.limit, offset: query.offset };
    },
  };
  return { service: new InternalPlantService(repository), queries, childCalls };
};

test('listResources exige contexto de consulta', async () => {
  const { service } = build();
  await assert.rejects(() => service.listResources({}, context), {
    code: 'INTERNAL_PLANT_FILTER_REQUIRED',
  });
});

test('listResources rejeita busca com menos de 3 caracteres', async () => {
  const { service } = build();
  await assert.rejects(() => service.listResources({ q: 'ab' }, context), {
    code: 'INTERNAL_PLANT_QUERY_TOO_SHORT',
  });
});

test('listResources normaliza paginação, deduplica tipos e usa o tenant do contexto', async () => {
  const { service, queries } = build();
  await service.listResources(
    { siteId: ' s1 ', resourceTypeIdIn: ['t1', 't1', ' t2 '], limit: 9999, offset: -4 },
    context,
  );
  assert.deepEqual(queries[0], {
    siteId: 's1',
    resourceTypeIdIn: ['t1', 't2'],
    limit: 200,
    offset: 0,
    tenantId: 'tenant-a',
  });
});

test('children exige nodeId e repassa tenant e página padrão', async () => {
  const { service, childCalls } = build();
  await assert.rejects(() => service.children('  ', {}, context), {
    code: 'INTERNAL_PLANT_NODE_ID_REQUIRED',
  });
  await service.children('city:city-1', {}, context);
  assert.deepEqual(childCalls[0], {
    nodeId: 'city:city-1',
    limit: 50,
    offset: 0,
    tenantId: 'tenant-a',
  });
});

test('escapeLike neutraliza curingas e o caractere de escape', () => {
  assert.equal(escapeLike('a%b_c!d'), 'a!%b!_c!!d');
});
