import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceModelCascadeFields } from './ResourceModelCascadeFields';
import type { ResourceLayer, ResourceSpecification, ResourceType } from '../../services/resourceApi';

afterEach(() => cleanup());

const LAYERS: ResourceLayer[] = [
  { '@type': 'ResourceLayer', id: 'layer-gpon', href: '', code: 'gpon', name: 'Rede GPON', status: 'active' },
  { '@type': 'ResourceLayer', id: 'layer-p2p', href: '', code: 'p2p', name: 'Rede P2P', status: 'active' },
];
const TYPES: ResourceType[] = [
  { '@type': 'ResourceType', id: 'type-cto', href: '', code: 'CTO', name: 'CTO', categoryCode: 'Infrastructure.Passive', status: 'active' },
  { '@type': 'ResourceType', id: 'type-splitter', href: '', code: 'Splitter', name: 'Splitter', categoryCode: 'Infrastructure.Passive', status: 'active' },
];
const SPECS: ResourceSpecification[] = [
  {
    id: 'spec-a',
    name: 'CTO A',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'layer-gpon',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo A' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-b',
    name: 'CTO B',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'layer-gpon',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo B' }],
    relatedParty: [{ id: 'party-2', name: 'Nokia', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-splitter',
    name: 'Splitter A',
    category: 'Infrastructure.Passive',
    resourceType: 'Splitter',
    resourceLayerId: 'layer-gpon',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'SP1x8' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-no-manufacturer',
    name: 'CTO sem fabricante',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceLayerId: 'layer-gpon',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Genérico' }],
    relatedParty: [],
  },
];

const currentSpecification = SPECS[0]!; // spec-a: GPON / CTO / Furukawa

describe('ResourceModelCascadeFields', () => {
  it('pré-seleciona os 4 níveis a partir da spec atual do recurso', () => {
    render(
      <ResourceModelCascadeFields
        layers={LAYERS}
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Topologia')).toHaveValue('layer-gpon');
    expect(screen.getByLabelText('Tipo de equipamento')).toHaveValue('CTO');
    expect(screen.getByLabelText('Fornecedor')).toHaveValue('party-1');
    expect(screen.getByLabelText('Modelo')).toHaveValue('spec-a');
  });

  it('trocar Tipo reseta Fornecedor/Modelo para a primeira opção compatível, sem confirmar', () => {
    const onCommit = vi.fn();
    render(
      <ResourceModelCascadeFields
        layers={LAYERS}
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Tipo de equipamento'), { target: { value: 'Splitter' } });

    expect(screen.getByLabelText('Fornecedor')).toHaveValue('party-1');
    expect(screen.getByLabelText('Modelo')).toHaveValue('spec-splitter');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('bucket "sem fabricante": specs sem relatedParty de fabricante entram num balde próprio', () => {
    render(
      <ResourceModelCascadeFields
        layers={LAYERS}
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: '__no-manufacturer__' } });

    expect(screen.getByLabelText('Modelo')).toHaveValue('spec-no-manufacturer');
  });

  it('só o select de Modelo (nível 4) chama onCommit', () => {
    const onCommit = vi.fn();
    render(
      <ResourceModelCascadeFields
        layers={LAYERS}
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Fornecedor'), { target: { value: 'party-2' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'spec-b' } });
    expect(onCommit).toHaveBeenCalledWith('spec-b');
  });

  it('clicar fora do editor chama onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ResourceModelCascadeFields
        layers={LAYERS}
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(container.querySelector('.fixed.inset-0')!);
    expect(onCancel).toHaveBeenCalled();
  });
});
