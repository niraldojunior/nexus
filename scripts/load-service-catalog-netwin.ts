#!/usr/bin/env node
/**
 * Carga do catálogo consolidado de Serviços (Netwin → Nexus): lê o CSV
 * `catalogo_nexus_vtal_v3.csv` (21 ServiceSpecifications — 14 CFS + 7 RFS) e envia cada linha para
 * `POST /v1/service/specifications/bulk-import` no backend local, para herdar validação canônica e
 * o evento TMF688 por item (ver ServiceService.bulkCreateServiceSpecifications).
 *
 * Uso:
 *   npm run service-catalog:load -- --file caminho/catalogo_nexus_vtal_v3.csv --dry-run
 *   npm run service-catalog:load -- --file caminho/catalogo_nexus_vtal_v3.csv
 *   npm run service-catalog:load -- --file caminho/catalogo_nexus_vtal_v3.csv --force
 *
 * Pré-requisito: backend local no ar (`npm run dev:neon` ou, para Oracle,
 * `DATABASE_PROVIDER=oracle npm run dev:neon` — confira .tmp-dev-backend.log antes de assumir qual
 * banco está de pé). --base-url aponta para outro backend; AUTH_TOKEN vem do .env.
 *
 * Idempotência: consulta o catálogo já cadastrado e pula linhas cuja chave
 * Categoria+Camada+Nome já exista, a menos que --force seja passado (nesse caso faz PATCH em vez
 * de POST).
 */
import { readFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { parseCsv } from '../src/shared/utils/csv.js';
import { parseServiceSpecCharacteristicBlock } from '../src/shared/utils/service-spec-characteristic-block.js';
import type {
  CreateServiceSpecificationInput,
  ServiceSpecificationType,
} from '../src/modules/service/domain.js';

loadEnv();

const CATEGORY_CODE_BY_NAME: Record<string, string> = {
  Acesso: 'Access',
  Voz: 'Voice',
  'Conectividade Empresarial': 'Enterprise',
  'Transporte / Atacado': 'Transport',
};

type Args = {
  file: string;
  baseUrl: string;
  dryRun: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { baseUrl: 'http://127.0.0.1:4001', dryRun: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') {
      const value = argv[++i];
      if (value !== undefined) args.file = value;
    } else if (arg === '--base-url') {
      const value = argv[++i];
      if (value !== undefined) args.baseUrl = value;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--force') {
      args.force = true;
    }
  }
  if (!args.file) {
    throw new Error('Uso: --file <caminho/catalogo_nexus_vtal_v3.csv> [--dry-run] [--force] [--base-url URL]');
  }
  return args as Args;
}

// Reparo de mojibake: quando o texto UTF-8 lido carrega sequências como "Ã§Ã£o" (comuns em CSVs
// pt-BR mal transcodificados — mesma armadilha da carga de estações Netwin), redecodifica os bytes
// como latin1→utf8.
function repairMojibake(text: string): string {
  if (!/Ã[-¿]/.test(text)) return text;
  return Buffer.from(text, 'latin1').toString('utf8');
}

function readColumn(cells: string[], header: string[], name: string): string {
  const index = header.findIndex((column) => column.trim().toLowerCase() === name.toLowerCase());
  return index === -1 ? '' : (cells[index] ?? '').trim();
}

function resolveCategoryCode(rawCategory: string): string {
  const code = CATEGORY_CODE_BY_NAME[rawCategory.trim()];
  if (!code) throw new Error(`Categoria "${rawCategory}" não mapeada para um code canônico.`);
  return code;
}

function resolveServiceType(rawType: string): ServiceSpecificationType {
  const normalized = rawType.trim().toUpperCase();
  if (normalized === 'CFS' || normalized === 'RFS') return normalized;
  throw new Error(`Tipo "${rawType}" inválido (esperado CFS ou RFS).`);
}

type CatalogRow = {
  line: number;
  input: CreateServiceSpecificationInput;
};

function buildRows(csvRows: string[][]): CatalogRow[] {
  const [header = [], ...dataRows] = csvRows;
  return dataRows.map((cells, index) => {
    const name = readColumn(cells, header, 'Nome');
    const serviceType = resolveServiceType(readColumn(cells, header, 'Tipo'));
    const category = resolveCategoryCode(readColumn(cells, header, 'Categoria'));
    // Coluna "Observações" do catálogo Netwin é anotação de origem, não a descrição funcional do
    // serviço — vai para `observation`. `description` fica em branco para edição manual no Nexus.
    const observation = readColumn(cells, header, 'Observações');
    const businessBlock = readColumn(cells, header, 'Especificações Negócio');
    const technicalBlock = readColumn(cells, header, 'Especificações Técnicas');

    const serviceSpecificationCharacteristic = [
      ...parseServiceSpecCharacteristicBlock(businessBlock, 'business'),
      ...parseServiceSpecCharacteristicBlock(technicalBlock, 'technical'),
    ];

    return {
      line: index + 2,
      input: {
        name,
        category,
        serviceType,
        ...(observation ? { observation } : {}),
        serviceSpecificationCharacteristic,
      },
    };
  });
}

type ExistingSpec = { id: string; name: string; category: string; serviceType: string };

async function fetchExistingSpecs(baseUrl: string, authToken: string): Promise<ExistingSpec[]> {
  const response = await fetch(
    `${baseUrl}/tmf-api/serviceCatalogManagement/v4/serviceSpecification?limit=1000`,
    { headers: { Authorization: `Bearer ${authToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar especificações existentes (${response.status}).`);
  }
  return (await response.json()) as ExistingSpec[];
}

function keyOf(category: string, serviceType: string, name: string): string {
  return `${category}|${serviceType}|${name.trim().toLowerCase()}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const authToken = process.env.AUTH_TOKEN ?? 'change-me';

  const raw = await readFile(args.file, 'utf8');
  const text = repairMojibake(raw);
  const csvRows = parseCsv(text);
  const rows = buildRows(csvRows);

  console.log(`${rows.length} linha(s) lida(s) de ${args.file}.`);
  const cfsCount = rows.filter((row) => row.input.serviceType === 'CFS').length;
  const rfsCount = rows.filter((row) => row.input.serviceType === 'RFS').length;
  console.log(`  CFS: ${cfsCount}  RFS: ${rfsCount}`);

  if (args.dryRun) {
    for (const row of rows) {
      const attrCount = row.input.serviceSpecificationCharacteristic?.length ?? 0;
      console.log(
        `  [linha ${row.line}] ${row.input.serviceType} ${row.input.category} "${row.input.name}" — ${attrCount} atributo(s)`,
      );
    }
    console.log('Dry-run: nada foi enviado ao backend.');
    return;
  }

  const existing = await fetchExistingSpecs(args.baseUrl, authToken);
  const existingByKey = new Map(
    existing.map((spec) => [keyOf(spec.category, spec.serviceType, spec.name), spec]),
  );

  const toCreate: CatalogRow[] = [];
  const toUpdate: { row: CatalogRow; id: string }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const key = keyOf(row.input.category, row.input.serviceType, row.input.name);
    const found = existingByKey.get(key);
    if (!found) {
      toCreate.push(row);
    } else if (args.force) {
      toUpdate.push({ row, id: found.id });
    } else {
      skipped += 1;
    }
  }

  if (toCreate.length > 0) {
    const response = await fetch(`${args.baseUrl}/v1/service/specifications/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ items: toCreate.map((row) => ({ line: row.line, input: row.input })) }),
    });
    if (!response.ok) {
      throw new Error(`Falha na carga em massa (${response.status}): ${await response.text()}`);
    }
    const result = (await response.json()) as {
      total: number;
      created: number;
      failed: number;
      results: { line: number; status: string; name: string; message?: string }[];
    };
    console.log(`Criadas: ${result.created}/${result.total}`);
    for (const item of result.results) {
      if (item.status === 'error') {
        console.error(`  [linha ${item.line}] erro em "${item.name}": ${item.message}`);
      }
    }
  }

  for (const { row, id } of toUpdate) {
    const response = await fetch(
      `${args.baseUrl}/tmf-api/serviceCatalogManagement/v4/serviceSpecification/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(row.input),
      },
    );
    if (!response.ok) {
      console.error(`  [linha ${row.line}] falha ao atualizar "${row.input.name}" (${response.status})`);
    }
  }

  console.log(`Atualizadas (--force): ${toUpdate.length}`);
  console.log(`Puladas (já existentes): ${skipped}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
