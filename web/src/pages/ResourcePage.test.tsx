import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as resourceApi from '../services/resourceApi';
import type { PhysicalResource, ResourceSpecification } from '../services/resourceApi';
import ResourcePage from './ResourcePage';

const resourceSpecifications: ResourceSpecification[] = Array.from({ length: 20 }, (_, index) => ({
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
    id: 'rt-physical-resource',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceType/rt-physical-resource',
    code: 'PhysicalResource',
    name: 'Physical Resource',
    categoryCode: 'Equipment.Access',
    status: 'active' as const,
  },
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
    id: 'rt-logical-resource',
    href: '/tmf-api/resourceCatalogManagement/v4/resourceType/rt-logical-resource',
    code: 'LogicalResource',
    name: 'Logical Resource',
    categoryCode: 'Logical',
    status: 'active' as const,
  },
];

const physicalResources = Array.from({ length: 20 }, (_, index) => ({
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

const logicalResources = Array.from({ length: 20 }, (_, index) => ({
  '@type': 'LogicalResource' as const,
  id: `log-${index + 1}`,
  name: `Logical ${index + 1}`,
  resourceSpecificationId: 'spec-1',
  resourceSpecification: { id: 'spec-1', '@referredType': 'ResourceSpecification' as const },
  status: 'active' as const,
  supportingPhysicalResourceId: `phy-${index + 1}`,
  place: { id: `site-${index + 1}`, '@referredType': 'GeographicSite' as const },
}));

const loadResourceWorkspaceSnapshotMock = vi.spyOn(resourceApi, 'loadResourceWorkspaceSnapshot');
const createResourceSpecificationMock = vi.spyOn(resourceApi, 'createResourceSpecification');
const updateResourceSpecificationMock = vi.spyOn(resourceApi, 'updateResourceSpecification');
const deleteResourceSpecificationMock = vi.spyOn(resourceApi, 'deleteResourceSpecification');
const createResourceMock = vi.spyOn(resourceApi, 'createResource');
const updateResourceMock = vi.spyOn(resourceApi, 'updateResource');
const deleteResourceMock = vi.spyOn(resourceApi, 'deleteResource');

beforeEach(() => {
  vi.clearAllMocks();
  for (const spec of resourceSpecifications) {
    delete spec.validFor;
  }
  loadResourceWorkspaceSnapshotMock.mockImplementation(async ({ tab, limit, offset }) => ({
    items:
      tab === 'ResourceSpecification'
        ? resourceSpecifications.slice(offset, offset + limit)
        : tab === 'PhysicalResource'
          ? physicalResources.slice(offset, offset + limit)
          : logicalResources.slice(offset, offset + limit),
    resourceSpecificationOptions: resourceSpecifications,
    resourceCategories,
    resourceTypes,
    physicalResources,
    logicalResources,
    manufacturerOptions: manufacturerParties,
  }));
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

test('ResourcePage renders the contextual title and paginates with 20 records', async () => {
  render(<ResourcePage />);

  expect(screen.getByRole('heading', { name: 'Recursos Físicos' })).toBeInTheDocument();
  expect(screen.queryByText('Resource Inventory')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir Recursos Lógicos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir Catálogo de Recursos' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar recurso' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excluir selecionados' })).toBeInTheDocument();

  await waitFor(() => expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({ tab: 'PhysicalResource', limit: 20, offset: 0 }));
  expect((await screen.findAllByText('Physical 1'))[0]).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Nome do Modelo' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Tipo do Recurso' })).toBeInTheDocument();
  expect((await screen.findAllByText('Spec 1'))[0]).toBeInTheDocument();
  expect((await screen.findAllByText('OLT'))[0]).toBeInTheDocument();
  expect((await screen.findAllByText('Physical 20'))[0]).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
  await waitFor(() => expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({ tab: 'PhysicalResource', limit: 20, offset: 20 }));
});

test('controlled tab renders the requested resource view', async () => {
  render(<ResourcePage activeTab="LogicalResource" />);

  expect(screen.getByRole('heading', { name: 'Recursos Lógicos' })).toBeInTheDocument();
  await waitFor(() => expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({ tab: 'LogicalResource', limit: 20, offset: 0 }));
  expect((await screen.findAllByText('Logical 1'))[0]).toBeInTheDocument();
});

test('create button opens the modal in create mode and row click opens edit mode', async () => {
  const user = userEvent.setup();
  render(<ResourcePage />);

  await screen.findAllByText('Physical 1');

  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Recursos Físicos');
  expect(screen.getByRole('combobox', { name: /^Categoria$/i })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /^Tipo do Recurso$/i })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /Modelo/i })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /^Modelo físico$/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/ID do Local/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Tipo de Local/i)).toHaveAttribute('readonly');

  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  await user.click((await screen.findAllByText('Physical 1'))[0]);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Recursos Físicos');
});

test('physical resource model selection auto-populates manufacturer from the selected specification', async () => {
  const user = userEvent.setup();
  render(<ResourcePage />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  await user.selectOptions(screen.getByLabelText(/^Categoria$/i), 'Equipment.Access');
  await user.selectOptions(screen.getByLabelText(/^Tipo do Recurso$/i), 'OLT');
  await user.selectOptions(screen.getByLabelText(/^Modelo$/i), 'spec-1');

  await waitFor(() => expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('DATACOM'));
  expect(screen.getByLabelText(/Modelo físico/i)).toHaveValue('Spec 1');
});

test('editing a physical resource also auto-populates manufacturer from the selected specification', async () => {
  const user = userEvent.setup();
  render(<ResourcePage />);

  await screen.findAllByText('Physical 1');
  await user.click((await screen.findAllByText('Physical 1'))[0]);

  expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Recursos Físicos');
  await waitFor(() => expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('DATACOM'));
  expect(screen.getByLabelText(/Modelo físico/i)).toHaveValue('Spec 1');
});

test('physical resource category combo only exposes physical categories', async () => {
  const user = userEvent.setup();
  render(<ResourcePage />);

  await screen.findAllByText('Physical 1');
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  const categorySelect = screen.getByLabelText(/^Categoria$/i);
  expect(categorySelect).toBeInTheDocument();
  expect(within(categorySelect).getByRole('option', { name: /Equipamentos de Acesso/i })).toBeInTheDocument();
  expect(within(categorySelect).getByRole('option', { name: /Equipamentos de Transporte/i })).toBeInTheDocument();
  expect(within(categorySelect).queryByRole('option', { name: /Endereçamento e IPAM/i })).not.toBeInTheDocument();
});

test('logical resource modal keeps FK-like fields as selects', async () => {
  const user = userEvent.setup();
  render(<ResourcePage activeTab="LogicalResource" />);

  await screen.findAllByText('Logical 1');
  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Recursos Lógicos');
  expect(screen.getByLabelText(/Nome do Modelo/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Recurso Físico Associado/i)).toBeInTheDocument();
});

test('resource specification editor uses catalog-driven selects for category and type', async () => {
  const user = userEvent.setup();
  render(<ResourcePage activeTab="ResourceSpecification" />);

  await waitFor(() => expect(loadResourceWorkspaceSnapshotMock).toHaveBeenCalledWith({ tab: 'ResourceSpecification', limit: 20, offset: 0 }));
  await screen.findAllByText('Equipamentos de Acesso');
  await user.click(screen.getAllByText('Equipamentos de Acesso')[0]);

  expect(await screen.findByRole('dialog')).toHaveTextContent('Editar Modelo de Recurso');
  expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Tipo do Recurso' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Cod\. Equipamento/i)).toHaveValue('EQ-1');
  expect(screen.getByLabelText(/Fabricante/i)).toHaveValue('party-datacom');
  expect(screen.getByLabelText(/^Modelo$/i)).toHaveValue('Model 1');
  expect(screen.getByLabelText(/ID-SKU/i)).toHaveValue('SKU-1');
  expect(screen.getByLabelText(/EOL/i)).toHaveValue('2026-07-03');
  expect(screen.queryByLabelText(/^Nome$/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Categoria' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Tipo do Recurso' })).not.toBeInTheDocument();
});

test('resource specification table shows friendly category and short type codes', async () => {
  render(<ResourcePage activeTab="ResourceSpecification" />);

  expect((await screen.findAllByText('Equipamentos de Acesso'))[0]).toBeInTheDocument();
  expect((await screen.findAllByText('OLT'))[0]).toBeInTheDocument();
  expect(screen.queryByText('Equipment.Access')).not.toBeInTheDocument();
  expect(screen.queryByText('Optical Line Terminal')).not.toBeInTheDocument();
});

test('resource specification table falls back to legacy manufacturer characteristic', async () => {
  loadResourceWorkspaceSnapshotMock.mockImplementation(async ({ tab, limit, offset }) => ({
    items:
      tab === 'ResourceSpecification'
        ? [
            {
              ...resourceSpecifications[0],
              relatedParty: [],
              resourceSpecificationCharacteristic: [
                ...resourceSpecifications[0].resourceSpecificationCharacteristic,
                { name: 'manufacturer', value: 'Legacy Corp', valueType: 'string' as const, group: 'commercial' },
              ],
            },
          ].slice(offset, offset + limit)
        : physicalResources.slice(offset, offset + limit),
    resourceSpecificationOptions: resourceSpecifications,
    resourceCategories,
    resourceTypes,
    physicalResources,
    logicalResources,
    manufacturerOptions: manufacturerParties,
  }));

  render(<ResourcePage activeTab="ResourceSpecification" />);

  expect(await screen.findByText('Legacy Corp')).toBeInTheDocument();
});

test('resource specification table falls back to the specification name when model characteristic is missing', async () => {
  loadResourceWorkspaceSnapshotMock.mockImplementation(async ({ tab, limit, offset }) => ({
    items:
      tab === 'ResourceSpecification'
        ? [
            {
              ...resourceSpecifications[0],
              resourceSpecificationCharacteristic: resourceSpecifications[0].resourceSpecificationCharacteristic.filter(
                (item) => item.name !== 'model',
              ),
            },
          ].slice(offset, offset + limit)
        : physicalResources.slice(offset, offset + limit),
    resourceSpecificationOptions: resourceSpecifications,
    resourceCategories,
    resourceTypes,
    physicalResources,
    logicalResources,
    manufacturerOptions: manufacturerParties,
  }));

  render(<ResourcePage activeTab="ResourceSpecification" />);

  expect(await screen.findByText('Spec 1')).toBeInTheDocument();
});

test('resource specification create serializes the extended characteristic set', async () => {
  const user = userEvent.setup();
  render(<ResourcePage activeTab="ResourceSpecification" />);

  await user.click(screen.getByRole('button', { name: 'Criar recurso' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Criar Modelo de Recurso');
  await user.selectOptions(screen.getByLabelText(/Fabricante/i), 'party-huawei');
  await user.type(screen.getByLabelText(/Cod\. Equipamento/i), 'EQ-OLT-001');
  await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
  await user.click(screen.getByRole('option', { name: /Equipamentos de Acesso/ }));
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
  expect(payload.resourceSpecificationCharacteristic).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'manufacturer' })]));
});

test('bulk selection enables delete and reloads the active tab after deletion', async () => {
  const user = userEvent.setup();
  const inventory: PhysicalResource[] = physicalResources.map((resource) => ({ ...resource }));
  loadResourceWorkspaceSnapshotMock.mockImplementation(async ({ tab, limit, offset }) => ({
    items:
      tab === 'ResourceSpecification'
        ? resourceSpecifications.slice(offset, offset + limit)
        : tab === 'PhysicalResource'
          ? inventory.filter((resource) => resource.status === 'active').slice(offset, offset + limit)
          : logicalResources.filter((resource) => resource.status === 'active').slice(offset, offset + limit),
    resourceSpecificationOptions: resourceSpecifications,
    resourceCategories,
    resourceTypes,
    physicalResources: inventory.filter((resource) => resource.status === 'active'),
    logicalResources: logicalResources.filter((resource) => resource.status === 'active'),
    manufacturerOptions: manufacturerParties,
  }));
  deleteResourceMock.mockImplementation(async (id) => {
    const resource = inventory.find((item) => item.id === id);
    if (!resource) return physicalResources[0];
    resource.status = 'terminated';
    return resource;
  });
  render(<ResourcePage />);

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
  render(<ResourcePage activeTab="ResourceSpecification" />);

  await screen.findByRole('checkbox', { name: 'Selecionar Spec 1' });
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Spec 1' })[0]);
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }));

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Excluir 1 selecionado?');
  expect(dialog).toHaveTextContent('Spec 1');

  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

  await waitFor(() => expect(deleteResourceSpecificationMock).toHaveBeenCalledWith('spec-1'));
  await waitFor(() => expect(screen.queryByText('Spec 1')).not.toBeInTheDocument());
});

test('canceling the delete confirmation does not call delete', async () => {
  const user = userEvent.setup();
  render(<ResourcePage activeTab="ResourceSpecification" />);

  await screen.findByRole('checkbox', { name: 'Selecionar Spec 1' });
  await user.click(screen.getAllByRole('checkbox', { name: 'Selecionar Spec 1' })[0]);
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('Excluir 1 selecionado?');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(deleteResourceSpecificationMock).not.toHaveBeenCalled();
});
