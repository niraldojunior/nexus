import type { ServiceSpecCharacteristic } from '../../modules/service/domain.js';

// Converte o texto multi-linha das colunas "Especificações Negócio" / "Especificações Técnicas" do
// catálogo Netwin em ServiceSpecCharacteristic[]. Cada linha segue o formato:
//   - nome_atributo (tipo): Descrição do atributo. Domínio: valor do domínio
// onde `tipo` pode conter parênteses aninhados (ex.: "int (opcional)", "FK (opcional)").
const LINE_PATTERN = /^-\s*(\S+)\s*\((.*)\)\s*:\s*(.+)$/;
const DOMAIN_SPLIT_PATTERN = /Dom[ií]nio\s*:\s*/i;
const ENUM_DOMAIN_PATTERN = /^\{(.*)\}$/;

function mapSourceTypeToValueType(sourceType: string): ServiceSpecCharacteristic['valueType'] {
  const normalized = sourceType.toLowerCase();
  if (normalized.startsWith('int')) return 'integer';
  if (normalized.startsWith('float') || normalized.startsWith('decimal')) return 'decimal';
  if (normalized.startsWith('bool')) return 'boolean';
  if (normalized.startsWith('date')) return 'date';
  if (normalized.startsWith('list') || normalized.startsWith('map') || normalized.startsWith('multi-enum'))
    return 'json';
  return 'string';
}

function parseLine(line: string): ServiceSpecCharacteristic | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = LINE_PATTERN.exec(trimmed);
  if (!match) return null;

  const name = match[1] ?? '';
  const sourceType = match[2] ?? '';
  const rest = match[3] ?? '';
  const [descriptionPart, domainPart] = rest.split(DOMAIN_SPLIT_PATTERN);
  const description = (descriptionPart ?? '').trim().replace(/\.\s*$/, '');
  const valueDomain = domainPart?.trim();
  const required = !/opcional/i.test(sourceType);

  const characteristic: ServiceSpecCharacteristic = {
    name: name.trim(),
    valueType: mapSourceTypeToValueType(sourceType) ?? 'string',
    required,
    sourceType: sourceType.trim(),
    ...(description ? { description } : {}),
    ...(valueDomain ? { valueDomain } : {}),
  };

  const enumMatch = valueDomain ? ENUM_DOMAIN_PATTERN.exec(valueDomain) : null;
  const enumValues = enumMatch?.[1];
  if (enumValues) {
    characteristic.characteristicValueSpecification = enumValues
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => ({ value }));
  }

  return characteristic;
}

export function parseServiceSpecCharacteristicBlock(
  block: string | undefined,
  group: 'business' | 'technical',
): ServiceSpecCharacteristic[] {
  if (!block) return [];
  return block
    .split('\n')
    .map((line) => parseLine(line))
    .filter((characteristic): characteristic is ServiceSpecCharacteristic => characteristic !== null)
    .map((characteristic) => ({ ...characteristic, group }));
}
