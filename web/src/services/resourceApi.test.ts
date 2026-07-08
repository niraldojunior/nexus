import { afterEach, expect, test, vi } from 'vitest';
import {
  createResource,
  createResourceSpecification,
  deleteResource,
  deleteResourceSpecification,
  listResourceCategories,
  listResourceTypes,
  listResourceSpecifications,
  listResources,
  updateResource,
  updateResourceSpecification,
} from './resourceApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

test('listResourceSpecifications sends pagination params', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify([
        {
          id: 'spec-1',
          name: 'Spec 1',
          category: 'Cat',
          resourceType: 'OLT',
          resourceSpecificationCharacteristic: [],
          relatedParty: [],
        },
      ]),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await listResourceSpecifications({ limit: 20, offset: 40 });

  expect(result).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith(
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification?limit=20&offset=40',
    expect.objectContaining({ method: 'GET' }),
  );
});

test('createResourceSpecification posts a cleaned payload', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'OLT',
      category: 'Equipment.Access',
      resourceType: 'OLT',
      resourceSpecificationCharacteristic: [
        { name: 'manufacturer', value: 'V.tal', valueType: 'string', group: 'commercial' },
      ],
    });
    return new Response(
      JSON.stringify({
        id: 'spec-1',
        name: 'OLT',
        category: 'Equipment.Access',
        resourceType: 'OLT',
        resourceSpecificationCharacteristic: [],
        relatedParty: [],
      }),
      {
        status: 201,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await createResourceSpecification({
    name: 'OLT',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    description: '',
    resourceSpecificationCharacteristic: [
      { name: 'manufacturer', value: 'V.tal', valueType: 'string', group: 'commercial' },
    ],
  });

  expect(result.id).toBe('spec-1');
});

test('updateResourceSpecification sends PATCH to the entity endpoint', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        id: 'spec-1',
        name: 'OLT',
        category: 'Equipment.Access',
        resourceType: 'OLT',
        resourceSpecificationCharacteristic: [],
        relatedParty: [],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  await updateResourceSpecification('spec-1', { name: 'OLT' });

  expect(fetchMock).toHaveBeenCalledWith(
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification/spec-1',
    expect.objectContaining({ method: 'PATCH' }),
  );
});

test('resource catalog helpers hit the read-only endpoints', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/resourceCategory')) {
      return new Response(
        JSON.stringify([{ id: 'cat-equipment-access', code: 'Equipment.Access', name: 'Equipamentos de Acesso', href: '/x', '@type': 'ResourceCategory', status: 'active' }]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    return new Response(
      JSON.stringify([{ id: 'rt-olt', code: 'OLT', name: 'OLT', href: '/x', '@type': 'ResourceType', categoryCode: 'Equipment.Access', status: 'active' }]),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const categories = await listResourceCategories();
  const types = await listResourceTypes();

  expect(categories).toHaveLength(1);
  expect(types).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith('/tmf-api/resourceCatalogManagement/v4/resourceCategory', expect.objectContaining({ method: 'GET' }));
  expect(fetchMock).toHaveBeenCalledWith('/tmf-api/resourceCatalogManagement/v4/resourceType', expect.objectContaining({ method: 'GET' }));
});

test('deleteResourceSpecification calls DELETE and returns the closed entity', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        id: 'spec-1',
        validFor: { endDateTime: '2026-07-07T00:00:00.000Z' },
        resourceSpecificationCharacteristic: [],
        relatedParty: [],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await deleteResourceSpecification('spec-1');

  expect(result.validFor?.endDateTime).toBe('2026-07-07T00:00:00.000Z');
  expect(fetchMock).toHaveBeenCalledWith(
    '/tmf-api/resourceCatalogManagement/v4/resourceSpecification/spec-1',
    expect.objectContaining({ method: 'DELETE' }),
  );
});

test('listResources requests a kind-filtered page', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify([{ id: 'res-1', name: 'Resource 1', resourceSpecificationId: 'spec-1' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const result = await listResources({ kind: 'PhysicalResource', limit: 20, offset: 0 });

  expect(result).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith(
    '/tmf-api/resourceInventoryManagement/v4/resource?kind=PhysicalResource&limit=20&offset=0',
    expect.objectContaining({ method: 'GET' }),
  );
});

test('createResource, updateResource and deleteResource call the inventory endpoint', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ id: 'res-1', name: 'Resource 1', resourceSpecificationId: 'spec-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  await createResource({ '@type': 'PhysicalResource', name: 'Resource 1', resourceSpecificationId: 'spec-1' });
  await updateResource('res-1', { '@type': 'LogicalResource', name: 'Resource 2', resourceSpecificationId: 'spec-2' });
  await deleteResource('res-1');

  const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
  expect(calls[0]?.[0]).toBe('/tmf-api/resourceInventoryManagement/v4/resource');
  expect(calls[1]?.[0]).toBe('/tmf-api/resourceInventoryManagement/v4/resource/res-1');
  expect(calls[2]?.[0]).toBe('/tmf-api/resourceInventoryManagement/v4/resource/res-1');
});
