import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as resourceApi from '../services/resourceApi';
import type { LogicalResource, PhysicalResource, ResourceSpecification } from '../services/resourceApi';
import ResourcePage from './ResourcePage';

// 20 physical specs so the Equipment.Access catalog paginates client-side (>20 items with spec-ipam-2).
const physicalSpecs: ResourceSpecification[] = Array.from({ length: 20 }, (_, index) => ({
  '@type': 'ResourceSpecification' as const,
  id: `spec-${index + 1}`,
  name: `Spec ${index + 1}`,
  category: 'Equipment.Access',
  resourceType: 'OLT',
  description: `Description ${index + 1}`,
  resourceSpecificationCharacteristic: [
    { name: 'equipmentCode', value: `EQ-${index + 1}`, valueType: 'string' as const, group: 'identification' },
    { name: 'equipmentFunction', value: 'Roteador', valueType: 'string' as const, group: 'identification' },
    { name: 'model', value: `Model ${index + 1}`, valueType: 'string' as const, group: 'commercial' },
    { name: 'skuId', value: `SKU-${index + 1}`, valueType: 'string' as const, group: 'commercial' },
    { name: 'stockable', value: true, valueType: 'boolean' as const, group: 'capability' },
    { name: 'discontinued', value: false, valueType: 'boolean' as const, group: 'lifecycle' },
    { name: 'supportsSdWan', value: false, valueType: 'boolean' as const, group: 'capability' },
    { name: 'supportsVoice', value: false, valueType: 'boolean' as const, group: 'capability' },
    { name: 'homologationDate', value: '2026-06-03', valueType: 'date' as const, group: 'commercial' },
    { name: 'endOfLifeDate', value: '2026-07-03', valueType: 'date' as const, group: 'lifecycle' },
    { name: 'endOfSupportLifeDate', value: '2026-07-03', valueType: 'date' as const, group: 'lifecycle' },
    { name: 'lifecycleStatus', value: 'active', valueType: 'string' as const, group: 'lifecycle' },
  ],
  relatedParty: [
    { id: 'party-datacom', '@referredType': 'Organization' as const, role: 'manufacturer', name: 'DATACOM' },
  ],
}));

// A logical spec so logical categories have their own inventory and catalog entries.
const logicalSpec: ResourceSpecification = {
  '@type': 'ResourceSpecification',
  id: 'spec-ipam',
  name: 'Bloco IPAM',
  category: 'Logical.IPAM',
  resourceType: 'IPAddress',
  description: 'Endereçamento IPAM',
  resourceSpecificationCharacteristic: [],
  relatedParty: [],
};

const resourceSpecifications: ResourceSpecification[] = [...physicalSpecs, logicalSpec];

const partyRoles = [
  'VANTIVA',
  'BLU-CASTLE',
  'DATACOM',
  'HUAWEI',
  'ZTE',
  'SAGEMCOM',
  'NOKIA',
  'TELLESCOM',
  'ARCADYAN',
].map((name) => {
  const id = `party-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return {
    '@type': 'PartyRole' as const,
    id: `${id}-role`,
    href: `/tmf-api/partyRoleManagement/v4/partyRole/${id}-role`,
    name: 'manufacturer' as const,
    status: 'active' as const,
    partyId: id,
    party: {
      id,
      '@referredType': 'Organization' as const,
      href: `/tmf-api/partyManagement/v4/party/${id}`,
      name,
    },
  };
});

const manufacturerParties = partyRoles.map((role) => ({
  '@type': 'Organization' as const,
  id: role.party.id,
  href: role.party.href,
  name: role.party.name,
  status: 'active' as const,
  partyType: 'Organization' as const,
}));

const resourceCategories = [
  {
    '@type': 'ResourceCategory' as const,
    id: 'cat-equipment-access',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceCategory/cat-equipment-access',
    code: 'Equipment.Access',
    name: 'Equipamentos de Acesso',
    status: 'active' as const,
  },
  {
    '@type': 'ResourceCategory' as const,
    id: 'cat-equipment-transport',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceCategory/cat-equipment-transport',
    code: 'Equipment.Transport',
    name: 'Equipamentos de Transporte',
    status: 'active' as const,
  },
  {
    '@type': 'ResourceCategory' as const,
    id: 'cat-logical-ipam',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceCategory/cat-logical-ipam',
    code: 'Logical.IPAM',
    name: 'Endereçamento e IPAM',
    status: 'active' as const,
  },
];

const resourceTypes = [
  {
    '@type': 'ResourceType' as const,
    id: 'rt-olt',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceType/rt-olt',
    code: 'OLT',
    name: 'Optical Line Terminal',
    categoryCode: 'Equipment.Access',
    status: 'active' as const,
  },
  {
    '@type': 'ResourceType' as const,
    id: 'rt-ip-address',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceType/rt-ip-address',
    code: 'IPAddress',
    name: 'IP Address',
    categoryCode: 'Logical.IPAM',
    status: 'active' as const,
  },
];

// 25 physical resources in Equipment.Access (spec-1) to exercise server-side pagination.
const physicalResources: PhysicalResource[] = Array.from({ length: 25 }, (_, index) => ({
  '@type': 'PhysicalResource' as const,
  id: `phy-${index + 1}`,
  name: `Physical ${index + 1}`,
  resourceSpecificationId: 'spec-1',
  resourceSpecification: { id: 'spec-1', '@referredType': 'ResourceSpecification' as const },
  status: 'active' as const,
  manufacturer: 'V.tal',
  model: `Model ${index + 1}`,
  serialNumber: `SN-${index + 1}`,
  partNumber: `PN-${index + 1}`,
  place: { id: `site-${index + 1}`, '@referredType': 'GeographicSite' as const },
}));

const logicalResources: LogicalResource[] = Array.from({ length: 20 }, (_, index) => ({
  '@type': 'LogicalResource' as const,
  id: `log-${index + 1}`,
  name: `Logical ${index + 1}`,
  resourceSpecificationId: 'spec-ipam',
  resourceSpecification: { id: 'spec-ipam', '@referredType': 'ResourceSpecification' as const },
  status: 'active' as const,
  supportingPhysicalResourceId: `phy-${index + 1}`,
  place: { id: `site-${index + 1}`, '@referredType': 'GeographicSite' as const },
}));

const loadResourceWorkspaceSnapshotMock = vi.spyOn(resourceApi, 'loadResourceWorkspaceSnapshot');
const listResourcesMock = vi.spyOn(resourceApi, 'listResources');
const createResourceSpecificationMock = vi.spyOn(resourceApi, 'createResourceSpecification');
const updateResourceSpecificationMock = vi.spyOn(resourceApi, 'updateResourceSpecification');
const deleteResourceSpecificationMock = vi.spyOn(resourceApi, 'deleteResourceSpecification');
const createResourceMock = vi.spyOn(resourceApi, 'createResource');
const updateResourceMock = vi.spyOn(resourceApi, 'updateResource');
const deleteResourceMock = vi.spyOn(resourceApi, 'deleteResource');

type WorkspaceRequest = Parameters<typeof resourceApi.loadResourceWorkspaceSnapshot>[0];

/**
 * Mini réplica do backend (`buildResourceWorkspaceSnapshot`): aplica categoria/filtros/paginação
 * sobre os fixtures locais igual o servidor faz sobre o Postgres — os testes passam a exercitar o
 * contrato real (o que é pedido) em vez de assumir que o array inteiro sempre chega no cliente.
 */
function buildSnapshot(
  request: WorkspaceRequest,
  pools: { physical?: PhysicalResource[]; logical?: LogicalResource[]; specs?: ResourceSpecification[] } = {},
): resourceApi.ResourceWorkspaceSnapshot {
  const specs = pools.specs ?? resourceSpecifications;

  if (request.tab === 'ResourceSpecification') {
    return {
      items: [],
      totalCount: specs.length,
      resourceSpecificationOptions: specs,
      resourceCategories,
      resourceTypes,
      manufacturerOptions: manufacturerParties,
    };
  }

  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const pool = request.tab === 'PhysicalResource' ? pools.physical ?? physicalResources : pools.logical ?? logicalResources;
  const filtered = pool.filter((resource) => {
    const specId = resource.resourceSpecification?.id ?? resource.resourceSpecificationId;
    const spec = specById.get(specId);
    if (request.category && spec?.category !== request.category) return false;
    if (request.resourceSpecificationIdIn?.length && !request.resourceSpecificationIdIn.includes(specId)) return false;
    if (request.resourceTypeIn?.length && (!spec || !request.resourceTypeIn.includes(spec.resourceType))) return false;
    return true;
  });

  return {
    items: filtered.slice(request.offset, request.offset + request.limit),
    totalCount: filtered.length,
    resourceSpecificationOptions: specs,
    resourceCategories,
    resourceTypes,
    manufacturerOptions: manufacturerParties,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const spec of resourceSpecifications) {
    delete spec.validFor;
  }
  loadResourceWorkspaceSnapshotMock.mockImplementation(async (request) => buildSnapshot(request));
  listResourcesMock.mockResolvedValue([]);
  createResourceSpecificationMock.mockResolvedValue(resourceSpecifications[0]);
  updateResourceSpecificationMock.mockResolvedValue(resourceSpecifications[0]);
  deleteResourceSpecificationMock.mockImplementation(async (id) => {
    const spec = resourceSpecifications.find((item) => item.id === id);
    if (!spec) return resourceSpecifications[0];
    spec.validFor = { endDateTime: '2026-07-09T10:00:00.000Z' };
    return spec;
  });
  createResourceMock.mockResolvedValue(physicalResources[0]);
  updateResourceMock.mockResolvedValue(physicalResources[0]);
  deleteResourceMock.mockResolvedValue(physicalResources[0]);
});

afterEach(() => {
  cleanup();
});

test('defaults to the first category and lists its physical inventory', async () => {
  render(<ResourcePage />);

  expect(await screen.findByRole('heading', { name: 'Equipamentos de Acesso' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar recurso' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excluir selecionados' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Inventário' })).toHaveAttribute('aria-selected', 'true');

  await waitFor(() =>
    expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({
      tab: 'PhysicalResource',
      limit: 20,
      offset: 0,
      category: 'Equipment.Access',
    }),
  );
  expect((await screen.findAllByText('Physical 1'))[0]).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Nome do Modelo' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Tipo do Recurso' })).toBeInTheDocument();
});

test('paginates the category inventory server-side, refetching on page change', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  expect((await screen.findAllByText('Physical 1'))[0]).toBeInTheDocument();
  expect(screen.getByText('Physical 20')).toBeInTheDocument();
  expect(screen.queryByText('Physical 21')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Próximo' }));

  expect(await screen.findByText('Physical 21')).toBeInTheDocument();
  expect(screen.queryByText('Physical 1')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
  // Paginar agora é sempre um novo fetch — a página inteira nunca fica em memória no cliente.
  await waitFor(() =>
    expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({
      tab: 'PhysicalResource',
      limit: 20,
      offset: 20,
      category: 'Equipment.Access',
    }),
  );
});

test('clicking a filterable header opens a picklist that narrows the inventory server-side', async () => {
  const user = userEvent.setup();
  // First five resources use a different spec so the "Nome do Modelo" column has a real domain.
  const mixedPhysical = physicalResources.map((resource, index) => ({
    ...resource,
    resourceSpecificationId: index < 5 ? 'spec-2' : 'spec-1',
    resourceSpecification: { id: index < 5 ? 'spec-2' : 'spec-1', '@referredType': 'ResourceSpecification' as const },
  }));
  loadResourceWorkspaceSnapshotMock.mockImplementation(async (request) =>
    buildSnapshot(request, { physical: mixedPhysical }),
  );

  render(<ResourcePage category="Equipment.Access" />);
  await screen.findAllByText('Physical 1');

  await user.click(screen.getByRole('button', { name: 'Nome do Modelo' }));

  // The picklist offers the specs registered for the category — not a scan of loaded instances.
  expect(screen.getByRole('menuitemcheckbox', { name: 'Spec 1' })).toBeInTheDocument();
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Spec 2' }));

  await waitFor(() =>
    expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({
      tab: 'PhysicalResource',
      limit: 20,
      offset: 0,
      category: 'Equipment.Access',
      resourceSpecificationIdIn: ['spec-2'],
    }),
  );
  // Only the five spec-2 resources remain, on the first page.
  expect(await screen.findByText('Physical 5')).toBeInTheDocument();
  expect(screen.queryByText('Physical 6')).not.toBeInTheDocument();
  expect(screen.getByText(/de 5 registro\(s\)/)).toBeInTheDocument();
});

test('does not add filter controls to free-text columns', async () => {
  render(<ResourcePage category="Equipment.Access" />);
  await screen.findAllByText('Physical 1');

  // "Detalhes" is free text, so its header stays plain text — not a filter button.
  expect(screen.queryByRole('button', { name: 'Detalhes' })).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Detalhes' })).toBeInTheDocument();
});

test('switching to Catálogo lists specs scoped to the category with no Categoria column', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));

  await waitFor(() =>
    expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({ tab: 'ResourceSpecification', limit: 20, offset: 0 }),
  );
  expect((await screen.findAllByText('Model 1'))[0]).toBeInTheDocument();
  expect((await screen.findAllByText('OLT'))[0]).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Categoria' })).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Tipo do Recurso' })).toBeInTheDocument();
});

test('physical create modal assumes the page category and hides the Categoria field', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Recursos Físicos');
  expect(screen.queryByLabelText(/^Categoria$/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Tipo do Recurso$/i)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /Modelo/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Tipo de Local/i)).toHaveAttribute('readonly');
});

test('physical model selection auto-populates manufacturer from the selected specification', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  await user.selectOptions(screen.getByLabelText(/^Tipo do Recurso$/i), 'OLT');
  await user.selectOptions(screen.getByLabelText(/^Modelo$/i), 'spec-1');

  await waitFor(() => expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('DATACOM'));
  expect(screen.getByLabelText(/Modelo físico/i)).toHaveValue('Spec 1');
});

test('editing a physical resource also auto-populates manufacturer from the selected specification', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click((await screen.findAllByText('Physical 1'))[0]);

  expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Recursos Físicos');
  await waitFor(() => expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('DATACOM'));
  expect(screen.getByLabelText(/Modelo físico/i)).toHaveValue('Spec 1');
});

test('logical category lists logical inventory and its modal scopes specs by category', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Logical.IPAM" />);

  expect(await screen.findByRole('heading', { name: 'Endereçamento e IPAM' })).toBeInTheDocument();
  await waitFor(() =>
    expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({
      tab: 'LogicalResource',
      limit: 20,
      offset: 0,
      category: 'Logical.IPAM',
    }),
  );
  expect((await screen.findAllByText('Logical 1'))[0]).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Recursos Lógicos');
  const specSelect = screen.getByLabelText(/Nome do Modelo/i);
  expect(specSelect).toBeInTheDocument();
  expect(screen.getByLabelText(/Recurso Físico Associado/i)).toBeInTheDocument();
  expect(specSelect).toHaveTextContent('Bloco IPAM');
  // The supporting-physical-resource combobox is fetched on demand, bounded — not from a full inventory in memory.
  await waitFor(() => expect(listResourcesMock).toHaveBeenCalledWith({ kind: 'PhysicalResource', limit: 200, offset: 0, status: 'active' }));
});

test('resource specification editor omits Categoria but keeps the Tipo combobox', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));

  await user.click((await screen.findAllByText('Model 1'))[0]);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Modelo de Recurso');
  expect(screen.queryByRole('combobox', { name: 'Categoria' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Tipo do Recurso' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Cod\. Equipamento/i)).toHaveValue('EQ-1');
  expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('party-datacom');
  expect(screen.getByLabelText(/^Modelo$/i)).toHaveValue('Model 1');
});

test('resource specification create fixes the category from the page and serializes characteristics', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Modelo de Recurso');
  await user.selectOptions(screen.getByLabelText(/Fabricante/i), 'party-huawei');
  await user.type(screen.getByLabelText(/Cod\. Equipamento/i), 'EQ-OLT-001');
  await user.click(screen.getByRole('combobox', { name: 'Tipo do Recurso' }));
  await user.click(screen.getByRole('option', { name: /Optical Line Terminal/ }));
  await user.type(screen.getByLabelText(/^Modelo$/i), 'MA5800');
  await user.selectOptions(screen.getByLabelText(/Estocável\?/i), 'true');
  await user.selectOptions(screen.getByLabelText(/Status/i), 'active');

  await user.click(screen.getByRole('button', { name: 'Criar' }));

  await waitFor(() => expect(createResourceSpecificationMock).toHaveBeenCalledTimes(1));
  const payload = createResourceSpecificationMock.mock.calls[0]?.[0] as {
    name: string;
    category: string;
    resourceType: string;
    relatedParty?: Array<{ id: string; '@referredType': string; role?: string; name?: string }>;
    resourceSpecificationCharacteristic?: Array<{ name: string; value: unknown }>;
  };
  expect(payload).toEqual(
    expect.objectContaining({
      name: 'MA5800',
      category: 'Equipment.Access',
      resourceType: 'OLT',
      relatedParty: [
        expect.objectContaining({
          id: 'party-huawei',
          '@referredType': 'Organization',
          role: 'manufacturer',
          name: 'HUAWEI',
        }),
      ],
    }),
  );
  expect(payload.resourceSpecificationCharacteristic).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'equipmentCode', value: 'EQ-OLT-001' }),
      expect.objectContaining({ name: 'model', value: 'MA5800' }),
      expect.objectContaining({ name: 'stockable', value: true }),
      expect.objectContaining({ name: 'lifecycleStatus', value: 'active' }),
    ]),
  );
});

test('resource specification create requires type and model before submitting', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  const createButton = await screen.findByRole('button', { name: 'Criar' });
  expect(createButton).toBeDisabled();

  await user.type(screen.getByLabelText(/^Modelo$/i), 'MA5800');
  expect(createButton).toBeDisabled();

  await user.click(screen.getByRole('combobox', { name: 'Tipo do Recurso' }));
  await user.click(screen.getByRole('option', { name: /Optical Line Terminal/ }));

  await waitFor(() => expect(createButton).toBeEnabled());
  await user.click(createButton);

  await waitFor(() => expect(createResourceSpecificationMock).toHaveBeenCalledTimes(1));
});

test('bulk selection enables delete and reloads the inventory after deletion', async () => {
  const user = userEvent.setup();
  const inventory: PhysicalResource[] = physicalResources.map((resource) => ({ ...resource }));
  loadResourceWorkspaceSnapshotMock.mockImplementation(async (request) =>
    buildSnapshot(request, { physical: inventory.filter((resource) => resource.status === 'active') }),
  );
  deleteResourceMock.mockImplementation(async (id) => {
    const resource = inventory.find((item) => item.id === id);
    if (!resource) return physicalResources[0];
    resource.status = 'terminated';
    return resource;
  });
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Physical 1' })[0]);
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Physical 2' })[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir selecionados' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Excluir 2 selecionados?');
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

  await waitFor(() => expect(deleteResourceMock).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Excluir selecionados' })).toBeDisabled();
  await waitFor(() => expect(screen.queryByText('Physical 1')).not.toBeInTheDocument());
});

test('deleting a resource specification requires confirmation and removes it from the catalog', async () => {
  const user = userEvent.setup();
  const catalog: ResourceSpecification[] = resourceSpecifications.map((spec) => ({ ...spec }));
  loadResourceWorkspaceSnapshotMock.mockImplementation(async (request) =>
    // The backend excludes soft-terminated specs; mirror that so deletions leave the catalog.
    buildSnapshot(request, { specs: catalog.filter((spec) => !spec.validFor?.endDateTime) }),
  );
  deleteResourceSpecificationMock.mockImplementation(async (id) => {
    const spec = catalog.find((item) => item.id === id);
    if (!spec) return resourceSpecifications[0];
    spec.validFor = { endDateTime: '2026-07-09T10:00:00.000Z' };
    return spec;
  });
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));

  await screen.findByRole('checkbox', { name: 'Selecionar Spec 1' });
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Spec 1' })[0]);
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }));

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Excluir 1 selecionado?');
  expect(dialog).toHaveTextContent('Spec 1');

  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

  await waitFor(() => expect(deleteResourceSpecificationMock).toHaveBeenCalledWith('spec-1'));
  await waitFor(() => expect(screen.queryByText('Model 1')).not.toBeInTheDocument());
});

test('canceling the delete confirmation does not call delete', async () => {
  const user = userEvent.setup();
  render(<ResourcePage category="Equipment.Access" />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));

  await screen.findByRole('checkbox', { name: 'Selecionar Spec 1' });
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Spec 1' })[0]);
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Excluir 1 selecionado?');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(deleteResourceSpecificationMock).not.toHaveBeenCalled();
});
