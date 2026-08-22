// Carga em massa do catálogo de Recursos de Rede (Configurações → Recursos de Rede → Carga em
// massa) — converte linhas de CSV em ResourceSpecFormState, reusando as mesmas regras de
// validação e o mesmo builder de payload (buildResourceSpecificationPayload) já usados pelos
// modais de criação individual (ver ResourceCatalogTab.tsx e ResourcePage.tsx).
import type {
  ResourceCategory,
  ResourceSpecification,
  ResourceType,
} from '../services/resourceApi';
import { resourceFieldLabel } from './resourceFieldLabels';
import {
  readResourceSpecificationCharacteristicString,
  RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS,
  RESOURCE_SPEC_NETWORK_TYPE_OPTIONS,
} from './resourceSpecificationCharacteristics';
import {
  buildTypeOptions,
  emptyResourceSpecFormState,
  isCivilInfrastructureCategory,
  readSpecificationModel,
  resourceSpecRequiredFieldsValid,
  type ResourceSpecFormState,
} from './resourceSpecificationForm';

type ImportColumnKind =
  'category' | 'resourceType' | 'text' | 'boolean' | 'date' | 'status' | 'networkType';

type ImportColumn = {
  header: string;
  field: keyof ResourceSpecFormState | 'manufacturerName';
  kind: ImportColumnKind;
  required?: boolean;
};

export const RESOURCE_SPEC_IMPORT_COLUMNS: ImportColumn[] = [
  { header: resourceFieldLabel('category'), field: 'category', kind: 'category', required: true },
  {
    header: resourceFieldLabel('resourceType'),
    field: 'resourceType',
    kind: 'resourceType',
    required: true,
  },
  { header: resourceFieldLabel('manufacturer'), field: 'manufacturerName', kind: 'text' },
  { header: resourceFieldLabel('model'), field: 'model', kind: 'text', required: true },
  { header: resourceFieldLabel('equipmentFunction'), field: 'equipmentFunction', kind: 'text' },
  { header: resourceFieldLabel('equipmentCode'), field: 'equipmentCode', kind: 'text' },
  { header: resourceFieldLabel('networkType'), field: 'networkType', kind: 'networkType' },
  { header: resourceFieldLabel('skuId'), field: 'skuId', kind: 'text' },
  { header: resourceFieldLabel('homologationDate'), field: 'homologationDate', kind: 'date' },
  { header: resourceFieldLabel('endOfLifeDate'), field: 'endOfLifeDate', kind: 'date' },
  {
    header: resourceFieldLabel('endOfSupportLifeDate'),
    field: 'endOfSupportLifeDate',
    kind: 'date',
  },
  { header: resourceFieldLabel('stockable'), field: 'stockable', kind: 'boolean' },
  { header: resourceFieldLabel('discontinued'), field: 'discontinued', kind: 'boolean' },
  { header: resourceFieldLabel('supportsSdWan'), field: 'supportsSdWan', kind: 'boolean' },
  { header: resourceFieldLabel('supportsVoice'), field: 'supportsVoice', kind: 'boolean' },
  { header: resourceFieldLabel('lifecycleStatus'), field: 'lifecycleStatus', kind: 'status' },
  { header: resourceFieldLabel('description'), field: 'description', kind: 'text' },
];

// Uma linha de exemplo por Tipo do Recurso ativo de cada Categoria ativa (exceto Infraestrutura
// Civil, fora do escopo desta carga) — dá ao usuário um ponto de partida concreto por combinação
// Categoria+Tipo aceita pelo catálogo, em vez de só um par de linhas genéricas.
export function buildResourceSpecificationTemplateCsv(
  categories: ResourceCategory[],
  resourceTypes: ResourceType[],
): string[][] {
  const header = RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => column.header);

  const activeCategories = categories
    .filter(
      (category) => category.status === 'active' && !isCivilInfrastructureCategory(category.code),
    )
    .sort((left, right) => left.code.localeCompare(right.code));

  const exampleRows = activeCategories.flatMap((category) => {
    const typesForCategory = buildTypeOptions(resourceTypes, category.code).filter(
      (option) => option.active,
    );
    return typesForCategory.map((option) => {
      const type = resourceTypes.find((candidate) => candidate.code === option.code);
      return buildExampleRow(category, type?.code ?? option.code, type?.name ?? option.label);
    });
  });

  return [header, ...exampleRows];
}

// Categorias de rede de fato (equipamento, passivo óptico, cabo) — só elas ganham um Tipo de Rede
// de exemplo; Lógico (VLAN, ASN, IP…) não carrega tecnologia de rede própria.
function isNetworkTechnologyCategory(categoryCode: string): boolean {
  return !categoryCode.startsWith('Logical');
}

function buildExampleRow(
  category: ResourceCategory,
  resourceTypeCode: string,
  resourceTypeName: string,
): string[] {
  return RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => {
    switch (column.field) {
      case 'category':
        return category.code;
      case 'resourceType':
        return resourceTypeCode;
      case 'manufacturerName':
        return 'Fabricante Exemplo';
      case 'model':
        return `${resourceTypeCode}-EXEMPLO-01`;
      case 'equipmentFunction':
        return resourceTypeName;
      case 'equipmentCode':
        return `EQ-${resourceTypeCode.toUpperCase()}-001`;
      case 'networkType':
        return isNetworkTechnologyCategory(category.code) ? 'GPON' : '';
      case 'skuId':
        return `SKU-${resourceTypeCode.toUpperCase()}-001`;
      case 'homologationDate':
        return '2026-01-15';
      case 'endOfLifeDate':
        return '2031-01-15';
      case 'endOfSupportLifeDate':
        return '2032-01-15';
      case 'stockable':
        return 'Sim';
      case 'discontinued':
        return 'Não';
      case 'supportsSdWan':
        return 'Não';
      case 'supportsVoice':
        return 'Não';
      case 'lifecycleStatus':
        return 'Ativo';
      case 'description':
        return `Exemplo de especificação para ${resourceTypeName} (${category.name}).`;
      default:
        return '';
    }
  });
}

export type ResourceSpecImportRow = {
  line: number;
  cells: string[];
  formState: ResourceSpecFormState;
  manufacturerName: string;
  errors: string[];
};

export type ResourceSpecImportParseResult = {
  headerErrors: string[];
  rows: ResourceSpecImportRow[];
};

const TRUE_VALUES = new Set(['sim', 's', 'true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['não', 'nao', 'n', 'false', '0', 'no']);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseBoolean(raw: string): { value: '' | 'true' | 'false'; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '' };
  const token = normalizeToken(trimmed);
  if (TRUE_VALUES.has(token)) return { value: 'true' };
  if (FALSE_VALUES.has(token)) return { value: 'false' };
  return { value: '', error: `valor "${raw}" não reconhecido (use Sim/Não)` };
}

function parseDate(raw: string): { value: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { value: trimmed };
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return { value: `${year}-${month}-${day}` };
  }
  return { value: '', error: `data "${raw}" inválida (use AAAA-MM-DD ou DD/MM/AAAA)` };
}

function resolveCategory(
  raw: string,
  categories: ResourceCategory[],
): { code: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: '', error: 'categoria obrigatória' };
  const byCode = categories.find(
    (category) => category.code.toLowerCase() === trimmed.toLowerCase(),
  );
  const match =
    byCode ?? categories.find((category) => category.name.toLowerCase() === trimmed.toLowerCase());
  if (!match) return { code: '', error: `categoria "${raw}" não encontrada no catálogo` };
  if (match.status !== 'active') return { code: '', error: `categoria "${raw}" está inativa` };
  if (isCivilInfrastructureCategory(match.code)) {
    return { code: '', error: `categoria "${raw}" é de Infraestrutura Civil, fora desta carga` };
  }
  return { code: match.code };
}

function resolveResourceType(
  raw: string,
  categoryCode: string,
  resourceTypes: ResourceType[],
): { code: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: '', error: 'tipo do recurso obrigatório' };
  const options = buildTypeOptions(resourceTypes, categoryCode);
  const byCode = resourceTypes.find(
    (type) =>
      type.code.toLowerCase() === trimmed.toLowerCase() && type.categoryCode === categoryCode,
  );
  const match =
    byCode ??
    resourceTypes.find(
      (type) =>
        type.name.toLowerCase() === trimmed.toLowerCase() && type.categoryCode === categoryCode,
    );
  if (!match) return { code: '', error: `tipo "${raw}" não encontrado para a categoria informada` };
  if (match.status !== 'active') return { code: '', error: `tipo "${raw}" está inativo` };
  if (!options.some((option) => option.code === match.code)) {
    return { code: '', error: `tipo "${raw}" não é válido para a categoria informada` };
  }
  return { code: match.code };
}

function resolveStatus(raw: string): { value: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '' };
  const byValue = RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS.find(
    (option) => option.value.toLowerCase() === trimmed.toLowerCase(),
  );
  const match =
    byValue ??
    RESOURCE_SPEC_LIFECYCLE_STATUS_OPTIONS.find(
      (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
    );
  if (!match) return { value: '', error: `status "${raw}" fora do domínio aceito` };
  return { value: match.value };
}

function resolveNetworkType(raw: string): { value: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '' };
  const byValue = RESOURCE_SPEC_NETWORK_TYPE_OPTIONS.find(
    (option) => option.value.toLowerCase() === trimmed.toLowerCase(),
  );
  const match =
    byValue ??
    RESOURCE_SPEC_NETWORK_TYPE_OPTIONS.find(
      (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
    );
  if (!match) return { value: '', error: `tipo de rede "${raw}" fora do domínio aceito` };
  return { value: match.value };
}

function buildUniquenessKey(
  category: string,
  resourceType: string,
  model: string,
  equipmentCode: string,
): string {
  return `${category}|${resourceType}|${model.trim().toLowerCase()}|${equipmentCode.trim().toLowerCase()}`;
}

export function parseResourceSpecificationImport(
  csvRows: string[][],
  {
    categories,
    resourceTypes,
    existingSpecs,
  }: {
    categories: ResourceCategory[];
    resourceTypes: ResourceType[];
    existingSpecs: ResourceSpecification[];
  },
): ResourceSpecImportParseResult {
  if (csvRows.length === 0) {
    return { headerErrors: ['Arquivo vazio.'], rows: [] };
  }

  const [headerRow, ...dataRows] = csvRows;
  const headerIndex = new Map<string, number>();
  headerRow.forEach((cell, index) => headerIndex.set(normalizeToken(cell), index));

  const headerErrors: string[] = [];
  const columnIndexes = RESOURCE_SPEC_IMPORT_COLUMNS.map((column) => {
    const index = headerIndex.get(normalizeToken(column.header));
    if (index === undefined && column.required) {
      headerErrors.push(`Coluna obrigatória ausente: "${column.header}".`);
    }
    return index;
  });

  if (headerErrors.length > 0) {
    return { headerErrors, rows: [] };
  }

  // Chave de unicidade: Categoria + Tipo + Modelo + Cod. Equipamento. O Cod. Equipamento entra na
  // chave porque um mesmo Modelo pode ter variantes específicas por fabricante/empresa (ex.: uma
  // ONT "BCSKV630" homologada com códigos diferentes por operadora) — sem o código, essas linhas
  // legítimas seriam rejeitadas como duplicatas do mesmo Modelo.
  const seenKeys = new Set<string>();
  const existingModelKeys = new Set(
    existingSpecs.map((spec) =>
      buildUniquenessKey(
        spec.category,
        spec.resourceType,
        readSpecificationModel(spec),
        readResourceSpecificationCharacteristicString(
          spec.resourceSpecificationCharacteristic,
          'equipmentCode',
        ),
      ),
    ),
  );

  const rows: ResourceSpecImportRow[] = dataRows.map((cells, dataIndex) => {
    const line = dataIndex + 2; // +1 header, +1 base 1
    const errors: string[] = [];
    const formState = emptyResourceSpecFormState();
    let manufacturerName = '';

    RESOURCE_SPEC_IMPORT_COLUMNS.forEach((column, columnPosition) => {
      const cellIndex = columnIndexes[columnPosition];
      const raw = cellIndex === undefined ? '' : (cells[cellIndex] ?? '');

      switch (column.kind) {
        case 'category': {
          const result = resolveCategory(raw, categories);
          if (result.error) errors.push(result.error);
          formState.category = result.code;
          break;
        }
        case 'resourceType': {
          const result = resolveResourceType(raw, formState.category, resourceTypes);
          if (result.error) errors.push(result.error);
          formState.resourceType = result.code;
          break;
        }
        case 'boolean': {
          const result = parseBoolean(raw);
          if (result.error) errors.push(result.error);
          (formState as unknown as Record<string, string>)[column.field] = result.value;
          break;
        }
        case 'date': {
          const result = parseDate(raw);
          if (result.error) errors.push(result.error);
          (formState as unknown as Record<string, string>)[column.field] = result.value;
          break;
        }
        case 'status': {
          const result = resolveStatus(raw);
          if (result.error) errors.push(result.error);
          formState.lifecycleStatus = result.value;
          break;
        }
        case 'networkType': {
          const result = resolveNetworkType(raw);
          if (result.error) errors.push(result.error);
          formState.networkType = result.value;
          break;
        }
        case 'text': {
          if (column.field === 'manufacturerName') manufacturerName = raw.trim();
          else (formState as unknown as Record<string, string>)[column.field] = raw.trim();
          break;
        }
      }
    });

    if (!resourceSpecRequiredFieldsValid(formState)) {
      errors.push('Categoria, Tipo do Recurso e Modelo são obrigatórios.');
    }

    if (formState.category && formState.resourceType && formState.model) {
      const key = buildUniquenessKey(
        formState.category,
        formState.resourceType,
        formState.model,
        formState.equipmentCode,
      );
      if (seenKeys.has(key)) {
        errors.push(
          'Categoria + Tipo + Modelo + Cod. Equipamento duplicados dentro do próprio arquivo — se são variantes distintas, informe um Cod. Equipamento diferente para cada uma.',
        );
      }
      seenKeys.add(key);
      if (existingModelKeys.has(key)) {
        errors.push(
          'Já existe uma especificação com esta Categoria + Tipo + Modelo + Cod. Equipamento no catálogo.',
        );
      }
    }

    return { line, cells, formState, manufacturerName, errors };
  });

  return { headerErrors: [], rows };
}
