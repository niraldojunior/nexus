import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceOverviewTab } from './ResourceOverviewTab';
import type { PhysicalResourceDetail } from '../../services/resourceApi';

afterEach(() => {
  cleanup();
});

const detail = (overrides: Partial<PhysicalResourceDetail> = {}): PhysicalResourceDetail => ({
  '@type': 'PhysicalResourceDetail',
  resource: {
    '@type': 'PhysicalResource',
    id: 'cto-1',
    name: 'CDOE-6746',
    resourceSpecificationId: 'spec-cto',
    resourceType: 'CTO',
    status: 'active',
    administrativeState: 'unlocked',
    operationalState: 'enabled',
    usageState: 'active',
    label: 'CDOE-6746',
    assetReference: 'SAP-1001',
    serialNumber: 'SN-123',
    partNumber: 'PN-8P',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
    characteristic: [{ name: '_origin.system', value: 'Netwin', group: '_origin' }],
  },
  specification: {
    '@type': 'ResourceSpecification',
    id: 'spec-cto',
    name: 'CTO 8 portas',
    category: 'Outside Plant',
    resourceType: 'CTO',
    resourceTypeName: 'CTO',
    manufacturer: {
      id: 'party-furukawa',
      name: 'Furukawa',
      '@referredType': 'Organization',
    },
    model: 'FDT 8',
    resourceLayer: {
      id: 'resource-layer-gpon-network',
      code: 'gpon_network',
      name: 'Rede GPON',
      '@referredType': 'ResourceLayer',
    },
    resourceSpecificationCharacteristic: [],
    relatedParty: [],
  },
  statusCatalogEntry: {
    '@type': 'ResourceStatusCatalogEntry',
    code: 'available',
    name: 'Disponível para ativação',
    sortOrder: 10,
    active: true,
    behavior: 'active',
  },
  place: {
    id: 'site-1',
    name: 'Icaraí',
    '@referredType': 'GeographicSite',
    streetType: 'Rua',
    streetName: 'Ator Paulo Gustavo',
    streetNr: '45',
    city: 'Niterói',
    stateOrProvince: 'RJ',
  },
  servingSite: { id: 'co-1', name: 'Estação Icaraí', '@referredType': 'GeographicSite' },
  project: { id: 'project-1', name: 'Expansão Icaraí', '@referredType': 'GeoProject' },
  childCount: 8,
  ...overrides,
});

describe('ResourceOverviewTab', () => {
  it('prioriza os atributos de catálogo e mostra os estados SID localizados', () => {
    render(<ResourceOverviewTab detail={detail()} />);

    expect(screen.getByText('Furukawa')).toBeInTheDocument();
    expect(screen.getByText('FDT 8')).toBeInTheDocument();
    expect(screen.getByText('Rede GPON')).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
    expect(screen.getByText('Habilitado')).toBeInTheDocument();
    expect(screen.getByText('Em Uso')).toBeInTheDocument();
    expect(screen.getByText('Disponível para ativação')).toBeInTheDocument();
    expect(screen.getByText('Rua, Ator Paulo Gustavo, nº 45, Niterói, RJ')).toBeInTheDocument();
  });

  it('abre o recurso pai quando o usuário clica na referência', () => {
    const onOpenResource = vi.fn();
    render(
      <ResourceOverviewTab
        detail={detail({
          parent: {
            id: 'parent-1',
            name: 'Splitter S8',
            '@referredType': 'PhysicalResource',
            relationshipType: 'containsAsChild',
          },
        })}
        onOpenResource={onOpenResource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Splitter S8' }));
    expect(onOpenResource).toHaveBeenCalledWith('parent-1');
  });
});
