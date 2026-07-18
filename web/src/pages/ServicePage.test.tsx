import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as serviceApi from '../services/serviceApi';
import type {
  CustomerFacingService,
  ResourceFacingService,
  ServiceSpecification,
} from '../services/serviceApi';
import ServicePage from './ServicePage';

const cfsSpec: ServiceSpecification = {
  '@type': 'ServiceSpecification',
  id: 'spec-cfs-bitstream',
  name: 'Bitstream GPON 700',
  category: 'Access',
  serviceType: 'CFS',
  description: 'Banda larga wholesale',
  serviceSpecificationCharacteristic: [],
  relatedParty: [],
};

const rfsSpec: ServiceSpecification = {
  '@type': 'ServiceSpecification',
  id: 'spec-rfs-gpon',
  name: 'Acesso GPON',
  category: 'Access',
  serviceType: 'RFS',
  description: 'Acesso óptico',
  serviceSpecificationCharacteristic: [],
  relatedParty: [],
};

const otherCategorySpec: ServiceSpecification = {
  '@type': 'ServiceSpecification',
  id: 'spec-voice',
  name: 'CloudVoIP',
  category: 'Voice',
  serviceType: 'CFS',
  serviceSpecificationCharacteristic: [],
  relatedParty: [],
};

const serviceSpecifications = [cfsSpec, rfsSpec, otherCategorySpec];

const rfs: ResourceFacingService = {
  '@type': 'ResourceFacingService',
  id: 'rfs-1',
  name: 'Acesso-GPON-778899',
  serviceSpecificationId: 'spec-rfs-gpon',
  state: 'active',
  serviceCharacteristic: [],
  relatedParty: [],
  place: [],
  serviceRelationship: [],
  supportingResource: [{ id: 'ont-778899', '@referredType': 'PhysicalResource' }],
  supportingService: [],
};

const cfs: CustomerFacingService = {
  '@type': 'CustomerFacingService',
  id: 'cfs-1',
  name: 'Bitstream-GPON-700-ProvedorX-SUB778899',
  serviceSpecificationId: 'spec-cfs-bitstream',
  state: 'active',
  subscriberId: 'SUB778899',
  serviceCharacteristic: [],
  relatedParty: [],
  place: [],
  serviceRelationship: [],
  supportingService: [{ id: 'rfs-1', '@referredType': 'ResourceFacingService' }],
};

const resourceOptions = [
  {
    '@type': 'PhysicalResource' as const,
    id: 'ont-778899',
    name: 'ONT 778899',
    resourceSpecificationId: 'spec-ont',
    status: 'active' as const,
  },
];

const loadSnapshotMock = vi.spyOn(serviceApi, 'loadServiceWorkspaceSnapshot');
const createServiceMock = vi.spyOn(serviceApi, 'createService');
const terminateServiceMock = vi.spyOn(serviceApi, 'terminateService');
const createSpecMock = vi.spyOn(serviceApi, 'createServiceSpecification');

function snapshotFor(overrides: Partial<serviceApi.ServiceWorkspaceSnapshot> = {}) {
  return {
    items: [],
    serviceSpecificationOptions: serviceSpecifications,
    serviceCategories: [],
    serviceCandidates: [],
    customerFacingServices: [cfs],
    resourceFacingServices: [rfs],
    resourceOptions,
    ...overrides,
  } as serviceApi.ServiceWorkspaceSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSnapshotMock.mockImplementation(async () => snapshotFor());
  createServiceMock.mockResolvedValue(cfs);
  terminateServiceMock.mockResolvedValue(cfs);
  createSpecMock.mockResolvedValue(cfsSpec);
});

afterEach(() => {
  cleanup();
});

test('defaults to the Access category and lists both CFS and RFS of that category', async () => {
  render(<ServicePage />);

  expect(await screen.findByRole('heading', { name: 'Acesso' })).toBeInTheDocument();
  await waitFor(() =>
    expect(loadSnapshotMock).toHaveBeenCalledWith({ tab: 'CustomerFacingService', limit: 20, offset: 0 }),
  );

  expect(screen.getByText('Bitstream-GPON-700-ProvedorX-SUB778899')).toBeInTheDocument();
  expect(screen.getByText('Acesso-GPON-778899')).toBeInTheDocument();
  // The Voice-category CFS must not leak into the Access page.
  expect(screen.queryByText('CloudVoIP')).not.toBeInTheDocument();
});

test('switching to the catalog view lists only specifications of the active category', async () => {
  const user = userEvent.setup();
  render(<ServicePage category="Access" />);

  await screen.findByText('Bitstream-GPON-700-ProvedorX-SUB778899');
  await user.click(screen.getByRole('tab', { name: 'Catálogo' }));

  await waitFor(() =>
    expect(loadSnapshotMock).toHaveBeenCalledWith({ tab: 'ServiceSpecification', limit: 20, offset: 0 }),
  );
  expect(await screen.findByText('Bitstream GPON 700')).toBeInTheDocument();
  expect(screen.getByText('Acesso GPON')).toBeInTheDocument();
  expect(screen.queryByText('CloudVoIP')).not.toBeInTheDocument();
});

test('CFS creation is blocked when the category has no available RFS', async () => {
  const user = userEvent.setup();
  loadSnapshotMock.mockImplementation(async () => snapshotFor({ resourceFacingServices: [] }));
  render(<ServicePage category="Access" />);

  await screen.findByRole('heading', { name: 'Acesso' });
  await user.click(screen.getByRole('button', { name: 'Criar serviço de cliente (CFS)' }));

  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByText(/Cadastre um RFS nesta categoria antes de criar o CFS/i),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
});

test('CFS modal exposes subscriber and supporting RFS, never a resource selector', async () => {
  const user = userEvent.setup();
  render(<ServicePage category="Access" />);

  await screen.findByRole('heading', { name: 'Acesso' });
  await user.click(screen.getByRole('button', { name: 'Criar serviço de cliente (CFS)' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('SubscriberID')).toBeInTheDocument();
  expect(within(dialog).getByText(/Serviços de rede que sustentam este CFS/i)).toBeInTheDocument();
  // The C3 boundary: a CFS never binds resources directly.
  expect(within(dialog).queryByText(/Recursos que sustentam este RFS/i)).not.toBeInTheDocument();
});

test('creating a CFS posts subscriberId and the selected supporting RFS', async () => {
  const user = userEvent.setup();
  render(<ServicePage category="Access" />);

  await screen.findByRole('heading', { name: 'Acesso' });
  await user.click(screen.getByRole('button', { name: 'Criar serviço de cliente (CFS)' }));

  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByPlaceholderText('Bitstream-GPON-700-ProvedorX-SUB778899'), 'Novo CFS');
  await user.selectOptions(within(dialog).getByRole('combobox', { name: /Especificação/i }), 'spec-cfs-bitstream');
  await user.type(within(dialog).getByPlaceholderText('SUB778899'), 'SUB999');
  await user.click(within(dialog).getByRole('checkbox', { name: 'Acesso-GPON-778899' }));
  await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

  await waitFor(() => expect(createServiceMock).toHaveBeenCalledTimes(1));
  const payload = createServiceMock.mock.calls[0][0];
  expect(payload).toMatchObject({
    '@type': 'CustomerFacingService',
    subscriberId: 'SUB999',
    supportingService: [{ id: 'rfs-1', '@referredType': 'ResourceFacingService' }],
  });
});

test('terminating a selected service calls the soft-terminate endpoint', async () => {
  const user = userEvent.setup();
  render(<ServicePage category="Access" />);

  await screen.findByText('Bitstream-GPON-700-ProvedorX-SUB778899');
  await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bitstream-GPON-700-ProvedorX-SUB778899' }));
  await user.click(screen.getByRole('button', { name: 'Encerrar selecionados' }));

  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar encerramento' }));

  await waitFor(() => expect(terminateServiceMock).toHaveBeenCalledWith('cfs-1'));
});
