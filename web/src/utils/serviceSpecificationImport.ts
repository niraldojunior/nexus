// Carga em massa do catálogo de Serviços (Configurações → Catálogo de Serviços → Carga em massa)
// — converte linhas de CSV em ServiceSpecFormState, reusando as mesmas regras de validação e o
// mesmo builder de payload (buildServiceSpecificationPayload) já usados pelo modal de criação
// individual (ver ServiceCatalogTab.tsx). Espelha resourceSpecificationImport.ts.
import type { ServiceCategory, ServiceSpecification, ServiceSpecificationType } from '../services/serviceApi';
import {
  emptyServiceSpecFormState,
  serviceSpecSubmitValid,
  type ServiceSpecFormState,
} from './serviceSpecificationForm';

type ImportColumnKind = 'category' | 'serviceType' | 'text';

type ImportColumn = {
  header: string;
  field: keyof ServiceSpecFormState;
  kind: ImportColumnKind;
  required?: boolean;
};

export const SERVICE_SPEC_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Camada', field: 'serviceType', kind: 'serviceType', required: true },
  { header: 'Categoria', field: 'category', kind: 'category', required: true },
  { header: 'Nome', field: 'name', kind: 'text', required: true },
  { header: 'Descrição', field: 'description', kind: 'text' },
  { header: 'Observação', field: 'observation', kind: 'text' },
];

// Uma linha de exemplo por categoria, para cada camada (CFS e RFS) — dá ao usuário um ponto de
// partida concreto por combinação Categoria+Camada aceita pelo catálogo.
export function buildServiceSpecificationTemplateCsv(categories: ServiceCategory[]): string[][] {
  const header = SERVICE_SPEC_IMPORT_COLUMNS.map((column) => column.header);

  const sortedCategories = [...categories].sort((left, right) =>
    left.code.localeCompare(right.code),
  );

  const exampleRows = sortedCategories.flatMap((category) =>
    (['CFS', 'RFS'] as const).map((serviceType) => buildExampleRow(category, serviceType)),
  );

  return [header, ...exampleRows];
}

function buildExampleRow(category: ServiceCategory, serviceType: 'CFS' | 'RFS'): string[] {
  return SERVICE_SPEC_IMPORT_COLUMNS.map((column) => {
    switch (column.field) {
      case 'serviceType':
        return serviceType;
      case 'category':
        return category.code;
      case 'name':
        return `${category.name} ${serviceType === 'CFS' ? '(Cliente)' : '(Rede)'} - Exemplo`;
      case 'description':
        return `Exemplo de especificação ${serviceType} para ${category.name}.`;
      default:
        return '';
    }
  });
}

export type ServiceSpecImportRow = {
  line: number;
  cells: string[];
  formState: ServiceSpecFormState;
  errors: string[];
};

export type ServiceSpecImportParseResult = {
  headerErrors: string[];
  rows: ServiceSpecImportRow[];
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function resolveCategory(
  raw: string,
  categories: ServiceCategory[],
): { code: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: '', error: 'categoria obrigatória' };
  const byCode = categories.find(
    (category) => category.code.toLowerCase() === trimmed.toLowerCase(),
  );
  const match =
    byCode ?? categories.find((category) => category.name.toLowerCase() === trimmed.toLowerCase());
  if (!match) return { code: '', error: `categoria "${raw}" não encontrada no catálogo` };
  return { code: match.code };
}

function resolveServiceType(raw: string): { value: ServiceSpecificationType | ''; error?: string } {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return { value: '', error: 'camada obrigatória' };
  if (trimmed === 'CFS' || trimmed === 'RFS') return { value: trimmed };
  return { value: '', error: `camada "${raw}" inválida (use CFS ou RFS)` };
}

function buildUniquenessKey(category: string, serviceType: string, name: string): string {
  return `${category}|${serviceType}|${name.trim().toLowerCase()}`;
}

export function parseServiceSpecificationImport(
  csvRows: string[][],
  {
    categories,
    existingSpecs,
  }: {
    categories: ServiceCategory[];
    existingSpecs: ServiceSpecification[];
  },
): ServiceSpecImportParseResult {
  if (csvRows.length === 0) {
    return { headerErrors: ['Arquivo vazio.'], rows: [] };
  }

  const [headerRow, ...dataRows] = csvRows;
  const headerIndex = new Map<string, number>();
  headerRow.forEach((cell, index) => headerIndex.set(normalizeToken(cell), index));

  const headerErrors: string[] = [];
  const columnIndexes = SERVICE_SPEC_IMPORT_COLUMNS.map((column) => {
    const index = headerIndex.get(normalizeToken(column.header));
    if (index === undefined && column.required) {
      headerErrors.push(`Coluna obrigatória ausente: "${column.header}".`);
    }
    return index;
  });

  if (headerErrors.length > 0) {
    return { headerErrors, rows: [] };
  }

  const seenKeys = new Set<string>();
  const existingKeys = new Set(
    existingSpecs.map((spec) => buildUniquenessKey(spec.category, spec.serviceType, spec.name)),
  );

  const rows: ServiceSpecImportRow[] = dataRows.map((cells, dataIndex) => {
    const line = dataIndex + 2; // +1 header, +1 base 1
    const errors: string[] = [];
    const formState = emptyServiceSpecFormState();

    SERVICE_SPEC_IMPORT_COLUMNS.forEach((column, columnPosition) => {
      const cellIndex = columnIndexes[columnPosition];
      const raw = cellIndex === undefined ? '' : (cells[cellIndex] ?? '');

      switch (column.kind) {
        case 'category': {
          const result = resolveCategory(raw, categories);
          if (result.error) errors.push(result.error);
          formState.category = result.code;
          break;
        }
        case 'serviceType': {
          const result = resolveServiceType(raw);
          if (result.error) errors.push(result.error);
          formState.serviceType = result.value;
          break;
        }
        case 'text': {
          (formState as unknown as Record<string, string>)[column.field] = raw.trim();
          break;
        }
      }
    });

    if (!serviceSpecSubmitValid(formState)) {
      errors.push('Camada, Categoria e Nome são obrigatórios.');
    }

    if (formState.category && formState.serviceType && formState.name) {
      const key = buildUniquenessKey(formState.category, formState.serviceType, formState.name);
      if (seenKeys.has(key)) {
        errors.push(
          'Categoria + Camada + Nome duplicados dentro do próprio arquivo.',
        );
      }
      seenKeys.add(key);
      if (existingKeys.has(key)) {
        errors.push('Já existe uma especificação com esta Categoria + Camada + Nome no catálogo.');
      }
    }

    return { line, cells, formState, errors };
  });

  return { headerErrors: [], rows };
}
