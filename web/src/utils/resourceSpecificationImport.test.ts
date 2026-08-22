import { describe, expect, test } from 'vitest';
import type {
  ResourceCategory,
  ResourceSpecification,
  ResourceType,
} from '../services/resourceApi';
import {
  buildResourceSpecificationTemplateCsv,
  parseResourceSpecificationImport,
  RESOURCE_SPEC_IMPORT_COLUMNS,
} from './resourceSpecificationImport';

const categories: ResourceCategory[] = [
  {
    '@type': 'ResourceCategory',
    id: 'cat-access',
    href: '',
    code: 'Equipment.Access',
    name: 'Acesso',
    status: 'active',
  },
  {
    '@type': 'ResourceCategory',
    id: 'cat-transport',
    href: '',
    code: 'Equipment.Transport',
    name: 'Transporte',
    status: 'active',
  },
  {
    '@type': 'ResourceCategory',
    id: 'cat-civil',
    href: '',
    code: 'Infrastructure.CivilWorks',
    name: 'Obra Civil',
    status: 'active',
  },
  {
    '@type': 'ResourceCategory',
    id: 'cat-inactive',
    href: '',
    code: 'Equipment.CustomerPremises',
    name: 'Cliente',
    status: 'inactive',
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
  {
    '@type': 'ResourceType',
    id: 'type-router',
    href: '',
    code: 'Router',
    name: 'Roteador',
    categoryCode: 'Equipment.Transport',
    status: 'active',
  },
];

const existingSpecs: ResourceSpecification[] = [
  {
    '@type': 'ResourceSpecification',
    id: 'spec-1',
    name: 'MA5800-X7',
    category: 'Equipment.Access',
    resourceType: 'OLT',
    resourceSpecificationCharacteristic: [{ name: 'model', value: 'MA5800-X7' }],
    relatedParty: [],
  },
];

function csvFrom(headers: string[], rows: string[][]): string[][] {
  return [headers, ...rows];
}

function rowFor(overrides: Record<string, string>): string[] {
  return RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => overrides[column.field] ?? '');
}

const headers = RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => column.header);
const fieldIndex = (field: string) =>
  RESOURCE_SPEC_IMPORT_COLUMNS.findIndex((column) => column.field === field);

describe('parseResourceSpecificationImport — header validation', () => {
  test('reports missing required columns', () => {
    const csvRows = [['Categoria']];
    const result = parseResourceSpecificationImport(csvRows, {
      categories,
      resourceTypes,
      existingSpecs: [],
    });
    expect(result.headerErrors.length).toBeGreaterThan(0);
    expect(result.rows).toEqual([]);
  });

  test('reports empty files', () => {
    const result = parseResourceSpecificationImport([], {
      categories,
      resourceTypes,
      existingSpecs: [],
    });
    expect(result.headerErrors).toEqual(['Arquivo vazio.']);
  });
});

describe('parseResourceSpecificationImport — valid rows', () => {
  test('resolves category and type by code and builds a valid formState', () => {
    const row = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'New-OLT-1' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].formState.category).toBe('Equipment.Access');
    expect(result.rows[0].formState.resourceType).toBe('OLT');
    expect(result.rows[0].formState.model).toBe('New-OLT-1');
  });

  test('resolves category and type by display name', () => {
    const row = rowFor({ category: 'Acesso', resourceType: 'OLT', model: 'New-OLT-2' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].formState.category).toBe('Equipment.Access');
  });

  test('parses boolean columns using Sim/Não', () => {
    const row = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'New-OLT-3',
      stockable: 'Sim',
      discontinued: 'Não',
    });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].formState.stockable).toBe('true');
    expect(result.rows[0].formState.discontinued).toBe('false');
  });

  test('parses dates in DD/MM/AAAA format', () => {
    const row = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'New-OLT-4',
      homologationDate: '15/03/2026',
    });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].formState.homologationDate).toBe('2026-03-15');
  });

  test('resolves status and network type by label', () => {
    const row = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'New-OLT-5',
      lifecycleStatus: 'Ativo',
      networkType: 'GPON',
    });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].formState.lifecycleStatus).toBe('active');
    expect(result.rows[0].formState.networkType).toBe('GPON');
  });
});

describe('parseResourceSpecificationImport — invalid rows', () => {
  test('rejects unknown category', () => {
    const row = rowFor({ category: 'Nonexistent', resourceType: 'OLT', model: 'X' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('não encontrada'))).toBe(true);
  });

  test('rejects inactive category', () => {
    const row = rowFor({ category: 'Equipment.CustomerPremises', resourceType: 'OLT', model: 'X' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('inativa'))).toBe(true);
  });

  test('rejects the civil infrastructure category (out of scope for this import)', () => {
    const row = rowFor({ category: 'Infrastructure.CivilWorks', resourceType: 'OLT', model: 'X' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('Infraestrutura Civil'))).toBe(
      true,
    );
  });

  test('rejects a resource type that does not belong to the category', () => {
    const row = rowFor({ category: 'Equipment.Access', resourceType: 'Router', model: 'X' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('tipo'))).toBe(true);
  });

  test('rejects an empty model', () => {
    const row = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: '' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
  });

  test('rejects an unrecognized boolean value', () => {
    const row = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'New-OLT-6',
      stockable: 'talvez',
    });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('não reconhecido'))).toBe(true);
  });

  test('rejects a duplicate category+type+model within the file', () => {
    const row1 = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'Dup-1' });
    const row2 = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'Dup-1' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row1, row2]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[1].errors.some((message) => message.includes('duplicados'))).toBe(true);
  });

  test('does not flag same-model rows as duplicates when equipmentCode differs (company-specific variants)', () => {
    const row1 = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'BCSKV630',
      equipmentCode: 'EQ-BCSKV630-OPERADORA-A',
    });
    const row2 = rowFor({
      category: 'Equipment.Access',
      resourceType: 'OLT',
      model: 'BCSKV630',
      equipmentCode: 'EQ-BCSKV630-OPERADORA-B',
    });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row1, row2]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[1].errors).toEqual([]);
  });

  test('still rejects same-model rows with the same (or blank) equipmentCode as duplicates', () => {
    const row1 = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'BCSKV630' });
    const row2 = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'BCSKV630' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row1, row2]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[1].errors.some((message) => message.includes('duplicados'))).toBe(true);
  });

  test('rejects a model that already exists in the catalog', () => {
    const row = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'MA5800-X7' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].errors.some((message) => message.includes('Já existe'))).toBe(true);
  });

  test('computes 1-based line numbers accounting for the header row', () => {
    const row = rowFor({ category: 'Equipment.Access', resourceType: 'OLT', model: 'X' });
    const result = parseResourceSpecificationImport(csvFrom(headers, [row]), {
      categories,
      resourceTypes,
      existingSpecs,
    });
    expect(result.rows[0].line).toBe(2);
  });
});

describe('buildResourceSpecificationTemplateCsv', () => {
  test('includes the header and one example row per active resource type of each active network category', () => {
    const csvRows = buildResourceSpecificationTemplateCsv(categories, resourceTypes);
    expect(csvRows[0]).toEqual(headers);
    // Equipment.Access → OLT, Equipment.Transport → Router (2 example rows). The inactive
    // category (Equipment.CustomerPremises) and the civil category are excluded.
    expect(csvRows).toHaveLength(3);
    const categoryIndex = fieldIndex('category');
    const typeIndex = fieldIndex('resourceType');
    expect(csvRows.slice(1).map((row) => [row[categoryIndex], row[typeIndex]])).toEqual([
      ['Equipment.Access', 'OLT'],
      ['Equipment.Transport', 'Router'],
    ]);
  });

  test('excludes the civil infrastructure category', () => {
    const csvRows = buildResourceSpecificationTemplateCsv(categories, resourceTypes);
    const categoryIndex = fieldIndex('category');
    expect(csvRows.slice(1).some((row) => row[categoryIndex] === 'Infrastructure.CivilWorks')).toBe(
      false,
    );
  });

  test('fills every column of each example row — no blanks for the user to guess', () => {
    const csvRows = buildResourceSpecificationTemplateCsv(categories, resourceTypes);
    for (const row of csvRows.slice(1)) {
      expect(row).toHaveLength(headers.length);
      row.forEach((cell, index) => {
        expect(cell.trim(), `column "${headers[index]}" should not be blank`).not.toBe('');
      });
    }
  });

  test('the generated template round-trips through the parser with no validation errors', () => {
    const csvRows = buildResourceSpecificationTemplateCsv(categories, resourceTypes);
    const result = parseResourceSpecificationImport(csvRows, {
      categories,
      resourceTypes,
      existingSpecs: [],
    });
    expect(result.headerErrors).toEqual([]);
    for (const row of result.rows) {
      expect(row.errors).toEqual([]);
    }
  });
});

test('field index sanity check keeps column order stable', () => {
  expect(fieldIndex('category')).toBe(0);
  expect(fieldIndex('resourceType')).toBe(1);
});
