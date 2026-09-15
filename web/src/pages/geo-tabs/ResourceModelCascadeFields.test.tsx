import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceModelCascadeFields } from './ResourceModelCascadeFields';
import type { ResourceSpecification, ResourceType } from '../../services/resourceApi';

afterEach(() => cleanup());

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
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo A' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-b',
    name: 'CTO B',
    category: 'Infrastructure.Passive',
    resourceType: 'CTO',
    resourceTypeId: 'type-cto',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'Modelo B' }],
    relatedParty: [{ id: 'party-2', name: 'Nokia', '@referredType': 'Organization', role: 'manufacturer' }],
  },
  {
    id: 'spec-splitter',
    name: 'Splitter A',
    category: 'Infrastructure.Passive',
    resourceType: 'Splitter',
    resourceTypeId: 'type-splitter',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'SP1x8' }],
    relatedParty: [{ id: 'party-1', name: 'Furukawa', '@referredType': 'Organization', role: 'manufacturer' }],
  },
];

const currentSpecification = SPECS[0]!; // spec-a: CTO / Furukawa

describe('ResourceModelCascadeFields', () => {
  it('pré-seleciona os 2 níveis a partir da spec atual do recurso e mostra o Path', () => {
    render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        modelPath="Telecom \ Rede de Acesso \ GPON \ Distribuição"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tipo de Recurso')).toHaveValue('type-cto');
    expect(screen.getByLabelText('Especificação')).toHaveValue('spec-a');
    expect(screen.getByLabelText('Path')).toHaveTextContent(
      'Telecom \\ Rede de Acesso \\ GPON \\ Distribuição',
    );
  });

  it('mostra "—" quando o Path ainda não carregou ou não existe', () => {
    render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        modelPath={null}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Path')).toHaveTextContent('—');
  });

  it('trocar Tipo de Recurso reseta Especificação para a primeira opção compatível, sem confirmar', () => {
    const onCommit = vi.fn();
    render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        modelPath={null}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Tipo de Recurso'), { target: { value: 'type-splitter' } });

    expect(screen.getByLabelText('Especificação')).toHaveValue('spec-splitter');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('só o select de Especificação chama onCommit', () => {
    const onCommit = vi.fn();
    render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        modelPath={null}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Tipo de Recurso'), { target: { value: 'type-cto' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Especificação'), { target: { value: 'spec-b' } });
    expect(onCommit).toHaveBeenCalledWith('spec-b');
  });

  it('spec atual ausente do catálogo carregado (paginação/ended): ainda assim pré-seleciona e permite trocar', () => {
    // Reprodução do bug relatado para CDOE-02-ICARAI: a spec do recurso não veio na página de
    // 500 linhas (ou está `ended`), então `specifications` não a contém — sem mesclar a spec
    // atual, nenhum dos níveis teria opção correspondente ao valor do `<select>`.
    const orphanSpecification: ResourceSpecification = {
      id: 'spec-legacy-orphan',
      name: 'CDOE legado',
      category: 'Infrastructure.Passive',
      resourceType: 'CTO',
      resourceTypeId: 'type-cto',
      resourceSpecificationCharacteristic: [{ name: 'model', value: 'CDOE legado' }],
      relatedParty: [{ id: 'party-3', name: 'Fabricante Legado', '@referredType': 'Organization', role: 'manufacturer' }],
    };
    const onCommit = vi.fn();
    render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={orphanSpecification}
        modelPath={null}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tipo de Recurso')).toHaveValue('type-cto');
    expect(screen.getByLabelText('Especificação')).toHaveValue('spec-legacy-orphan');

    fireEvent.change(screen.getByLabelText('Especificação'), { target: { value: 'spec-b' } });
    expect(onCommit).toHaveBeenCalledWith('spec-b');
  });

  it('clicar fora do editor chama onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ResourceModelCascadeFields
        types={TYPES}
        specifications={SPECS}
        currentSpecification={currentSpecification}
        modelPath={null}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(container.querySelector('.fixed.inset-0')!);
    expect(onCancel).toHaveBeenCalled();
  });
});
