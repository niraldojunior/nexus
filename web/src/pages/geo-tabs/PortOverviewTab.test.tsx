import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortOverviewTab } from './PortOverviewTab';
import type { ResourcePortDetail } from '../../services/resourceApi';

const detail: ResourcePortDetail = {
  '@type': 'ResourcePortDetail',
  resource: {
    '@type': 'PhysicalResource',
    id: 'port-1',
    name: 'FO.O.1',
    resourceSpecificationId: 'spec-port',
    resourceSpecification: { id: 'spec-port', '@referredType': 'ResourceSpecification' },
    resourceType: 'Port',
    status: 'active',
    administrativeState: 'unlocked',
    operationalState: 'enabled',
    usageState: 'active',
    characteristic: [],
  },
  role: 'FO.O',
  index: 1,
  splitter: {
    id: 'splitter-1',
    name: 'CDOE-02-ICARAI · Splitter 1:8',
    '@referredType': 'PhysicalResource',
    resourceType: 'Splitter',
  },
  cto: {
    id: 'cto-1',
    name: 'CDOE-02-ICARAI',
    '@referredType': 'PhysicalResource',
    resourceType: 'CTO',
  },
  splitRatio: '1:8',
  derivedUsageState: 'active',
  hasActiveService: true,
  drops: [
    {
      resource: {
        id: 'drop-1',
        name: 'DROP-01',
        '@referredType': 'PhysicalResource',
        resourceType: 'DropCable',
      },
      active: true,
    },
  ],
};

describe('PortOverviewTab', () => {
  it('renderiza metadados físicos, splitter, CTO e drop atual', () => {
    render(<PortOverviewTab detail={detail} onOpenResource={vi.fn()} />);

    expect(screen.getByText('FO.O.1')).toBeInTheDocument();
    expect(screen.getByText('CDOE-02-ICARAI · Splitter 1:8')).toBeInTheDocument();
    expect(screen.getByText('CDOE-02-ICARAI')).toBeInTheDocument();
    expect(screen.getByText('1:8')).toBeInTheDocument();
    expect(screen.getByText('DROP-01')).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado · Habilitado · Em Uso')).toBeInTheDocument();
  });

  it('identifica no detalhe o drop instalado sem serviço ativo', () => {
    render(<PortOverviewTab detail={{ ...detail, hasActiveService: false }} onOpenResource={vi.fn()} />);

    expect(screen.getByText('Drop desativado')).toBeInTheDocument();
    expect(screen.getByTitle('Estado de uso: Drop desativado').className).toContain('ring-status-green');
  });
});
