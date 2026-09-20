import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceSpecificationFormModal } from './ResourceSpecificationFormModal';
import type { ResourceType, ResourceSpecification } from '../../../services/resourceApi';

const mockCreateResourceSpecification = vi.fn();
const mockUpdateResourceSpecification = vi.fn();

vi.mock('../../../services/resourceApi', () => ({
  createResourceSpecification: (...args: unknown[]) => mockCreateResourceSpecification(...args),
  updateResourceSpecification: (...args: unknown[]) => mockUpdateResourceSpecification(...args),
}));

vi.mock('../../../services/partyApi', () => ({
  listPartyRoles: vi.fn().mockResolvedValue([]),
}));

const mockResourceType: ResourceType = {
  '@type': 'ResourceType',
  id: 'rt-1',
  href: '/v1/resource-types/rt-1',
  categoryCode: 'Infrastructure.Active',
  code: 'OLT',
  name: 'Optical Line Terminal',
  status: 'active',
  nature: 'PhysicalResource',
  resourceTypeCharacteristic: [
    { name: 'ports', valueType: 'integer', characteristicLevel: 'specification', value: 16, group: 'Capacidade' },
    { name: 'power', valueType: 'decimal', characteristicLevel: 'specification', value: 2.5, group: 'Técnico' },
    { name: 'mac_address', valueType: 'string', characteristicLevel: 'instance', value: '00:11:22', group: 'Técnico' },
  ],
};

describe('ResourceSpecificationFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders only specification-level characteristics and excludes instance-level ones (issue #273)', () => {
    render(
      <ResourceSpecificationFormModal
        isOpen={true}
        onClose={vi.fn()}
        resourceType={mockResourceType}
      />,
    );

    // Characteristics de nível especificação devem aparecer
    expect(screen.getByText('ports')).toBeInTheDocument();
    expect(screen.getByText('power')).toBeInTheDocument();
    expect(screen.getByText('Capacidade')).toBeInTheDocument();

    // Characteristic de nível instância NÃO deve aparecer
    expect(screen.queryByText('mac_address')).not.toBeInTheDocument();
  });

  it('saves only specification-level characteristics in the payload on submit (issue #273)', async () => {
    const user = userEvent.setup();
    mockCreateResourceSpecification.mockResolvedValueOnce({
      id: 'spec-1',
      name: 'Huawei MA5800',
    });

    render(
      <ResourceSpecificationFormModal
        isOpen={true}
        onClose={vi.fn()}
        resourceType={mockResourceType}
      />,
    );

    const nameInput = screen.getByPlaceholderText('Ex.: OLT Huawei MA5800-X7');
    await user.type(nameInput, 'Huawei MA5800');

    const submitButton = screen.getByRole('button', { name: 'Criar especificação' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateResourceSpecification).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Huawei MA5800',
          resourceSpecificationCharacteristic: expect.arrayContaining([
            expect.objectContaining({ name: 'ports', value: 16 }),
            expect.objectContaining({ name: 'power', value: 2.5 }),
          ]),
        }),
      );
      // Confirma que 'mac_address' (instância) não foi enviado no payload
      const calledArgs = mockCreateResourceSpecification.mock.calls[0][0];
      const charNames = calledArgs.resourceSpecificationCharacteristic.map((c: { name: string }) => c.name);
      expect(charNames).not.toContain('mac_address');
    });
  });

  it('preserves orphan characteristics from pre-existing spec (issue #216 & #273)', () => {
    const editingSpec: ResourceSpecification = {
      '@type': 'ResourceSpecification',
      id: 'spec-1',
      name: 'Spec Legada',
      category: 'Infrastructure.Active',
      resourceType: 'OLT',
      resourceTypeId: 'rt-1',
      relatedParty: [],
      resourceSpecificationCharacteristic: [
        { name: 'ports', value: 32 },
        { name: 'orphan_characteristic', value: 'valor_orfa' },
      ],
    };

    render(
      <ResourceSpecificationFormModal
        isOpen={true}
        onClose={vi.fn()}
        resourceType={mockResourceType}
        editingSpec={editingSpec}
      />,
    );

    expect(screen.getByText('ports')).toBeInTheDocument();
    expect(screen.getByText('orphan_characteristic')).toBeInTheDocument();
    expect(screen.queryByText('mac_address')).not.toBeInTheDocument();
  });

  it('shows empty state message when resource type only has instance-level characteristics (issue #273)', () => {
    const instanceOnlyType: ResourceType = {
      ...mockResourceType,
      resourceTypeCharacteristic: [
        { name: 'serial_num', valueType: 'string', characteristicLevel: 'instance', value: null },
      ],
    };

    render(
      <ResourceSpecificationFormModal
        isOpen={true}
        onClose={vi.fn()}
        resourceType={instanceOnlyType}
      />,
    );

    expect(
      screen.getByText(
        'Este tipo não tem características de nível de especificação. As de nível de instância são preenchidas no recurso, não na especificação.',
      ),
    ).toBeInTheDocument();
  });
});
