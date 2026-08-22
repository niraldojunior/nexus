import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as resourceApi from '../services/resourceApi';
import * as partyApi from '../services/partyApi';
import type {
  ResourceCategory,
  ResourceSpecification,
  ResourceType,
} from '../services/resourceApi';
import type { Party } from '../services/partyApi';
import ResourceSpecificationBulkImportModal from './ResourceSpecificationBulkImportModal';
import { RESOURCE_SPEC_IMPORT_COLUMNS } from '../utils/resourceSpecificationImport';

const categories: ResourceCategory[] = [
  {
    '@type': 'ResourceCategory',
    id: 'cat-access',
    href: '',
    code: 'Equipment.Access',
    name: 'Acesso',
    status: 'active',
  },
];

const resourceTypes: ResourceType[] = [
  {
    '@type': 'ResourceType',
    id: 'type-olt',
    href: '',
    code: 'OLT',
    name: 'OLT',
    categoryCode: 'Equipment.Access',
    status: 'active',
  },
];

const manufacturerOptions: Party[] = [
  {
    '@type': 'Organization',
    id: 'party-huawei',
    href: '',
    name: 'Huawei',
    status: 'active',
    partyType: 'Organization',
    partyCharacteristic: [],
  },
];

const existingSpecs: ResourceSpecification[] = [];

const bulkCreateMock = vi.spyOn(resourceApi, 'bulkCreateResourceSpecifications');
const createPartyMock = vi.spyOn(partyApi, 'createParty');
const createPartyRoleMock = vi.spyOn(partyApi, 'createPartyRole');

const headers = RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => column.header);

function rowFor(overrides: Record<string, string>): string[] {
  return RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => overrides[column.field] ?? '');
}

function csvText(rows: string[][]): string {
  return [headers, ...rows].map((cells) => cells.join(';')).join('\r\n');
}

function makeCsvFile(rows: string[][], name = 'carga.csv'): File {
  return new File([csvText(rows)], name, { type: 'text/csv' });
}

beforeEach(() => {
  bulkCreateMock.mockReset();
  createPartyMock.mockReset();
  createPartyRoleMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderModal(onImported = vi.fn()) {
  render(
    <ResourceSpecificationBulkImportModal
      categories={categories}
      resourceTypes={resourceTypes}
      manufacturerOptions={manufacturerOptions}
      existingSpecs={existingSpecs}
      onClose={vi.fn()}
      onImported={onImported}
    />,
  );
}

test('uploading a mixed CSV renders a preview summary with valid and invalid rows', async () => {
  const user = userEvent.setup();
  renderModal();

  const validRow = rowFor({
    category: 'Equipment.Access',
    resourceType: 'OLT',
    model: 'MA5800-X7',
  });
  const invalidRow = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: '' });
  const file = makeCsvFile([validRow, invalidRow]);

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);

  await waitFor(() => {
    expect(screen.getByText('2 linha(s) no arquivo')).toBeInTheDocument();
  });
  expect(screen.getByText('1 pronta(s)')).toBeInTheDocument();
  expect(screen.getByText('1 com erro')).toBeInTheDocument();
});

test('importing only sends valid rows to the server and reports created/failed counts', async () => {
  const user = userEvent.setup();
  bulkCreateMock.mockResolvedValue({
    total: 1,
    created: 1,
    failed: 0,
    results: [{ line: 2, status: 'created', id: 'spec-new', name: 'MA5800-X7' }],
  });
  renderModal();

  const validRow = rowFor({
    category: 'Equipment.Access',
    resourceType: 'OLT',
    model: 'MA5800-X7',
  });
  const invalidRow = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: '' });
  const file = makeCsvFile([validRow, invalidRow]);

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);

  await waitFor(() => expect(screen.getByText('1 pronta(s)')).toBeInTheDocument());

  const importButton = screen.getByRole('button', { name: /Importar 1 linha/ });
  await user.click(importButton);

  await waitFor(() => expect(bulkCreateMock).toHaveBeenCalledTimes(1));
  expect(bulkCreateMock.mock.calls[0][0]).toHaveLength(1);

  await waitFor(() => expect(screen.getByText('1 criada(s)')).toBeInTheDocument());
  expect(screen.getByText('1 com falha')).toBeInTheDocument();
});

test('a manufacturer name not in the catalog is created automatically before import', async () => {
  const user = userEvent.setup();
  createPartyMock.mockResolvedValue({
    '@type': 'Organization',
    id: 'party-new',
    href: '',
    name: 'Furukawa',
    status: 'active',
    partyType: 'Organization',
    partyCharacteristic: [],
  });
  createPartyRoleMock.mockResolvedValue({
    '@type': 'PartyRole',
    id: 'role-new',
    href: '',
    name: 'manufacturer',
    status: 'active',
    partyId: 'party-new',
    party: { id: 'party-new', '@referredType': 'Organization', name: 'Furukawa' },
    partyRoleCharacteristic: [],
  });
  bulkCreateMock.mockResolvedValue({
    total: 1,
    created: 1,
    failed: 0,
    results: [{ line: 2, status: 'created', id: 'spec-new', name: 'Splitter 1x8' }],
  });
  const onImported = vi.fn();
  renderModal(onImported);

  const row = rowFor({
    category: 'Equipment.Access',
    resourceType: 'OLT',
    model: 'Splitter 1x8',
    manufacturerName: 'Furukawa',
  });
  const file = makeCsvFile([row]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);

  await waitFor(() => expect(screen.getByText('1 pronta(s)')).toBeInTheDocument());
  const importButton = screen.getByRole('button', { name: /Importar 1 linha/ });
  await user.click(importButton);

  await waitFor(() =>
    expect(createPartyMock).toHaveBeenCalledWith({
      name: 'Furukawa',
      partyType: 'Organization',
    }),
  );
  expect(createPartyRoleMock).toHaveBeenCalledWith({ partyId: 'party-new', name: 'manufacturer' });
  await waitFor(() => expect(screen.getByText('1 fabricante(s) criado(s)')).toBeInTheDocument());
  expect(onImported).toHaveBeenCalled();
});

test('rejected rows list their error message in the result report', async () => {
  const user = userEvent.setup();
  bulkCreateMock.mockResolvedValue({
    total: 1,
    created: 0,
    failed: 1,
    results: [
      {
        line: 2,
        status: 'error',
        name: 'MA5800-X7',
        code: 'RESOURCE_TYPE_CATEGORY_MISMATCH',
        message: 'resource type is not allowed for category',
      },
    ],
  });
  renderModal();

  const row = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'MA5800-X7' });
  const file = makeCsvFile([row]);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);

  await waitFor(() => expect(screen.getByText('1 pronta(s)')).toBeInTheDocument());
  const importButton = screen.getByRole('button', { name: /Importar 1 linha/ });
  await user.click(importButton);

  await waitFor(() => expect(screen.getByText('1 com falha')).toBeInTheDocument());
  expect(screen.getByText('resource type is not allowed for category')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Baixar linhas rejeitadas/ })).toBeInTheDocument();
});
