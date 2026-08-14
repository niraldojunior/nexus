import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { test } from 'vitest';
import {
  applyDocumentToWorksheet,
  type AddressServices,
  buildSearchAddress,
  enrichRecords,
  parseCliArgs,
  parseSemicolonCsv,
  selectGeonetCandidate,
  selectGoogleResult,
  serializeSemicolonCsv,
  worksheetToDocument,
  withRetry,
} from '../src/scripts/enrich-installation-addresses.js';
import { AppError } from '../src/shared/errors/app-error.js';

const headers = [
  'ID',
  'UF',
  'MUNICIPIO',
  'BAIRRO',
  'CEP',
  'TIPO LOGRADOURO',
  'LOGRADOURO',
  'NUMERO',
  'TIPO COMPLEMENTO',
  'VALOR COMPLEMENTO',
  'GEONET_ID',
  'GEONET_ENDERECO',
  'GEONET_LOCALIZACAO',
  'GEONET_PRECISAO',
  'GMAPS_ID',
  'GMAPS_ENDERECO',
  'GMAPS_LOCALIZACAO',
  'GMAPS_PRECISAO',
  'DNE_LOGRADOURO',
  'DNE_COMPLEMENTO',
  'DNE_BAIRRO',
  'DNE_LOCALIDADE',
];

const indexOf = (headersToIndex = headers): Map<string, number> =>
  new Map(headersToIndex.map((header, index) => [header, index]));

const row = (id: string, cep = '72887220'): string[] => [
  id,
  'GO',
  'Cidade Ocidental',
  'Parque Nova Friburgo B',
  cep,
  'QUADRA',
  'QUADRA 06 LOTE',
  '28',
  'REFERENCIA',
  'Mercado Cristal',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
];

test('preserva BOM, acentos, aspas, delimitador e quebra de linha no CSV', () => {
  const original = '\ufeffID;TEXTO\r\n1;"Mansões; disse ""olá""\r\nem duas linhas"\r\n2;normal\r\n';
  const parsed = parseSemicolonCsv(original);

  assert.equal(parsed.bom, true);
  assert.equal(parsed.lineEnding, '\r\n');
  assert.deepEqual(parsed.records, [
    ['1', 'Mansões; disse "olá"\r\nem duas linhas'],
    ['2', 'normal'],
  ]);
  assert.equal(serializeSemicolonCsv(parsed), original);
});

test('exige um limite explícito e interpreta as opções da CLI', () => {
  assert.deepEqual(parseCliArgs(['--file', 'entrada.csv', '--limit', '10']), {
    file: 'entrada.csv',
    output: 'entrada.csv',
    start: 1,
    limit: 10,
    overwrite: false,
    threads: 1,
    checkpoint: 200,
    providers: ['viacep', 'geonet', 'gmaps'],
  });
  assert.deepEqual(parseCliArgs(['--file', 'entrada.csv', '--all', '--threads', '4']), {
    file: 'entrada.csv',
    output: 'entrada.csv',
    start: 1,
    limit: Number.MAX_SAFE_INTEGER,
    overwrite: false,
    threads: 4,
    checkpoint: 200,
    providers: ['viacep', 'geonet', 'gmaps'],
  });
  assert.deepEqual(parseCliArgs(['--file', 'entrada.csv', '--all', '--only', 'google,geonet']), {
    file: 'entrada.csv',
    output: 'entrada.csv',
    start: 1,
    limit: Number.MAX_SAFE_INTEGER,
    overwrite: false,
    threads: 1,
    checkpoint: 200,
    providers: ['gmaps', 'geonet'],
  });
  const checkpointOf = (args: string[]): number => {
    const parsed = parseCliArgs(args);
    assert.notEqual(parsed, 'help');
    return (parsed as { checkpoint: number }).checkpoint;
  };
  assert.equal(checkpointOf(['--file', 'entrada.csv', '--all', '--checkpoint', '50']), 50);
  assert.equal(checkpointOf(['--file', 'entrada.csv', '--all', '--checkpoint', '0']), 0);
  assert.throws(
    () => parseCliArgs(['--file', 'entrada.csv', '--all', '--checkpoint', '-1']),
    /maior ou igual a zero/,
  );
  assert.throws(() => parseCliArgs(['--file', 'entrada.csv']), /exatamente um/);
  assert.throws(
    () => parseCliArgs(['--file', 'entrada.csv', '--all', '--threads', '0']),
    /inteiro positivo/,
  );
  assert.throws(
    () => parseCliArgs(['--file', 'entrada.csv', '--all', '--only', 'foo']),
    /não reconhece/,
  );
  assert.throws(
    () => parseCliArgs(['--file', 'entrada.csv', '--all', '--limit', '1']),
    /exatamente um/,
  );
});

test('usa o DNE como endereço canônico e não inclui referência informal na consulta', () => {
  const values = buildSearchAddress(row('A'), indexOf(), {
    logradouro: 'Quadra 6',
    complemento: '',
    bairro: 'Parque Nova Friburgo B',
    localidade: 'Cidade Ocidental',
    uf: 'GO',
  });

  assert.equal(values.number, '28');
  assert.match(values.geonetAddress, /^Quadra 6,/);
  assert.match(values.googleAddress, /^Quadra 6, 28,/);
  assert.doesNotMatch(values.googleAddress, /Mercado Cristal/);
});

test('aceita resultado Google aproximado no mesmo município e rejeita outro município', () => {
  const input = row('A');
  const accepted = {
    place_id: 'accepted',
    formatted_address: 'Parque Nova Friburgo B, Cidade Ocidental - GO, Brasil',
    geometry: { location_type: 'APPROXIMATE' },
    types: ['political', 'sublocality'],
    address_components: [
      { long_name: 'Cidade Ocidental', types: ['administrative_area_level_2', 'political'] },
      { short_name: 'GO', types: ['administrative_area_level_1', 'political'] },
    ],
  };
  const rejected = {
    ...accepted,
    place_id: 'rejected',
    address_components: [
      { long_name: 'Goiânia', types: ['locality', 'political'] },
      { short_name: 'GO', types: ['administrative_area_level_1', 'political'] },
    ],
  };

  assert.equal(selectGoogleResult([rejected, accepted], input, indexOf())?.place_id, 'accepted');
  assert.equal(selectGoogleResult([rejected], input, indexOf()), null);
});

test('prioriza candidato GEONET com CEP e número exatos', () => {
  const input = row('A');
  const selected = selectGeonetCandidate(
    [
      {
        addressId: 'bairro',
        formattedAddress: 'Quadra 6, Cidade Ocidental - GO',
        city: 'Cidade Ocidental',
        state: 'GO',
        postcode: '72880-000',
      },
      {
        addressId: 'preciso',
        formattedAddress: 'Quadra 6, 28, Cidade Ocidental - GO',
        street: 'Quadra 6',
        streetNr: '28',
        city: 'Cidade Ocidental',
        state: 'GO',
        postcode: '72887220',
      },
    ],
    input,
    indexOf(),
  );

  assert.equal(selected?.addressId, 'preciso');
});

test('enriquece somente o intervalo pedido, preserva dados existentes e reutiliza consultas iguais', async () => {
  const records = Array.from({ length: 12 }, (_, index) => row(`ID-${index + 1}`));
  records[0]![14] = 'manual-place-id';
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const services: AddressServices = {
    viaCep: async () => {
      calls.viaCep += 1;
      return {
        logradouro: 'Quadra 6',
        complemento: '',
        bairro: 'Parque Nova Friburgo B',
        localidade: 'Cidade Ocidental',
        uf: 'GO',
      };
    },
    geonet: async () => {
      calls.geonet += 1;
      return {
        id: 'geo-1',
        formattedAddress: 'Quadra 6, 28',
        location: '[-47.94,-16.09]',
        precision: 'Endereço Interpolação',
      };
    },
    google: async () => {
      calls.google += 1;
      return {
        placeId: 'google-1',
        formattedAddress: 'Quadra 6, Cidade Ocidental - GO',
        location: '[-47.94,-16.09]',
        precision: 'APPROXIMATE',
      };
    },
  };
  const document = { bom: true, lineEnding: '\n' as const, headers: [...headers], records };
  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 10,
    overwrite: false,
    threads: 1,
  });

  assert.equal(summary.selected, 10);
  assert.equal(summary.updatedRows, 10);
  assert.equal(records[0]![14], 'manual-place-id');
  assert.equal(records[0]![15], 'Quadra 6, Cidade Ocidental - GO');
  assert.equal(records[0]![12], '[-47.94,-16.09]');
  assert.equal(records[0]![16], '[-47.94,-16.09]');
  assert.equal(records[9]![10], 'geo-1');
  assert.equal(records[10]![10], '');
  assert.equal(records[11]![16], '');
  assert.deepEqual(calls, { viaCep: 1, geonet: 1, google: 1 });
});

test('consulta linhas simultaneamente conforme o número de threads', async () => {
  // CEPs distintos evitam o cache, forçando uma consulta real por linha.
  const records = Array.from({ length: 6 }, (_, index) => row(`ID-${index + 1}`, `7288700${index}`));
  let inFlight = 0;
  let maxInFlight = 0;
  const gate = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
  const services: AddressServices = {
    viaCep: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate();
      inFlight -= 1;
      return {
        logradouro: 'Quadra 6',
        complemento: '',
        bairro: 'Parque Nova Friburgo B',
        localidade: 'Cidade Ocidental',
        uf: 'GO',
      };
    },
    geonet: async () => null,
    google: async () => null,
  };
  const document = { bom: true, lineEnding: '\n' as const, headers: [...headers], records };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 6,
    overwrite: false,
    threads: 3,
  });

  assert.equal(summary.selected, 6);
  assert.equal(maxInFlight, 3);
});

test('acrescenta as colunas de log com as consultas enviadas e o resumo da linha', async () => {
  const records = [row('ID-1')];
  const services: AddressServices = {
    viaCep: async () => ({
      logradouro: 'Quadra 6',
      complemento: '',
      bairro: 'Parque Nova Friburgo B',
      localidade: 'Cidade Ocidental',
      uf: 'GO',
    }),
    geonet: async () => ({
      id: 'geo-1',
      formattedAddress: 'Quadra 6, 28',
      location: '[-47.94,-16.09]',
      precision: 'Endereço Interpolação',
    }),
    google: async () => null,
  };
  const document = { bom: false, lineEnding: '\n' as const, headers: [...headers], records };

  await enrichRecords(document, services, { start: 1, limit: 1, overwrite: false, threads: 1 });

  const at = (name: string): string => records[0]![document.headers.indexOf(name)]!;
  assert.deepEqual(document.headers.slice(-3), [
    'LOG_CONSULTA_GEONET',
    'LOG_CONSULTA_GMAPS',
    'LOG_GERAL',
  ]);
  assert.match(at('LOG_CONSULTA_GEONET'), /^Quadra 6, .* \| nº 28$/);
  assert.match(at('LOG_CONSULTA_GMAPS'), /^Quadra 6, 28,/);
  assert.equal(
    at('LOG_GERAL'),
    'ViaCEP=preenchido; GEONET=encontrado; Google=não encontrado; linha atualizada.',
  );
});

test('preenche o DNE mesmo com UF/Município divergente e registra no log', async () => {
  const records = [row('ID-1')];
  const services: AddressServices = {
    viaCep: async () => ({
      logradouro: 'Rua Outra',
      complemento: '',
      bairro: 'Centro',
      localidade: 'Goiânia',
      uf: 'GO',
    }),
    geonet: async () => null,
    google: async () => null,
  };
  const document = { bom: false, lineEnding: '\n' as const, headers: [...headers], records };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
  });

  const at = (name: string): string => records[0]![document.headers.indexOf(name)]!;
  assert.equal(at('DNE_LOGRADOURO'), 'Rua Outra');
  assert.equal(at('DNE_LOCALIDADE'), 'Goiânia');
  assert.equal(summary.viaCep.filled, 0);
  assert.equal(summary.viaCep.mismatched, 1);
  assert.match(at('LOG_GERAL'), /ViaCEP=preenchido \(divergente/);
});

test('detalha o motivo do erro do GEONET no log', async () => {
  const records = [row('ID-1')];
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => {
      throw new AppError('Cota excedida por muitas requisições.', {
        code: 'GEONET_RATE_LIMITED',
        statusCode: 429,
      });
    },
    google: async () => null,
  };
  const document = { bom: false, lineEnding: '\n' as const, headers: [...headers], records };
  const warnings: string[] = [];
  const logger = {
    warn: (message: string): void => {
      warnings.push(message);
    },
    log: (): void => {},
  };

  const summary = await enrichRecords(
    document,
    services,
    { start: 1, limit: 1, overwrite: false, threads: 1 },
    logger,
  );

  const at = (name: string): string => records[0]![document.headers.indexOf(name)]!;
  assert.equal(summary.geonet.errors, 1);
  assert.match(at('LOG_GERAL'), /GEONET=erro \(.*GEONET_RATE_LIMITED.*HTTP 429/);
  assert.ok(
    warnings.some(
      (message) => /GEONET falhou ao consultar/.test(message) && /HTTP 429/.test(message),
    ),
  );
});

test('com --only executa apenas o provedor selecionado', async () => {
  const records = [row('ID-1')];
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const services: AddressServices = {
    viaCep: async () => {
      calls.viaCep += 1;
      return null;
    },
    geonet: async () => {
      calls.geonet += 1;
      return null;
    },
    google: async () => {
      calls.google += 1;
      return {
        placeId: 'google-1',
        formattedAddress: 'Quadra 6, Cidade Ocidental - GO',
        location: '[-47.94,-16.09]',
        precision: 'APPROXIMATE',
      };
    },
  };
  const document = { bom: false, lineEnding: '\n' as const, headers: [...headers], records };

  await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['gmaps'],
  });

  const at = (name: string): string => records[0]![document.headers.indexOf(name)]!;
  assert.deepEqual(calls, { viaCep: 0, geonet: 0, google: 1 });
  assert.equal(at('GMAPS_ID'), 'google-1');
  assert.equal(
    at('LOG_GERAL'),
    'ViaCEP=desativado; GEONET=desativado; Google=encontrado; linha atualizada.',
  );
});

const completeRow = (id: string): string[] => {
  const record = row(id);
  record[10] = 'geo-existente'; // GEONET_ID
  record[14] = 'gmaps-existente'; // GMAPS_ID
  record[18] = 'Rua Existente'; // DNE_LOGRADOURO
  return record;
};

const countingServices = (calls: { viaCep: number; geonet: number; google: number }) =>
  ({
    viaCep: async () => {
      calls.viaCep += 1;
      return {
        logradouro: 'Quadra 6',
        complemento: '',
        bairro: 'Parque Nova Friburgo B',
        localidade: 'Cidade Ocidental',
        uf: 'GO',
      };
    },
    geonet: async () => {
      calls.geonet += 1;
      return null;
    },
    google: async () => {
      calls.google += 1;
      return {
        placeId: 'google-1',
        formattedAddress: 'Quadra 6, Cidade Ocidental - GO',
        location: '[-47.94,-16.09]',
        precision: 'APPROXIMATE',
      };
    },
  }) satisfies AddressServices;

test('ignora linha já completa e replica a atual sem consultar provedores', async () => {
  const records = [completeRow('ID-1')];
  const before = [...records[0]!];
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const document = { bom: false, lineEnding: '\n' as const, headers: [...headers], records };

  const summary = await enrichRecords(document, countingServices(calls), {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
  });

  assert.deepEqual(calls, { viaCep: 0, geonet: 0, google: 0 });
  assert.equal(summary.skippedRows, 1);
  assert.equal(summary.updatedRows, 0);
  // As colunas de log são acrescentadas ao cabeçalho, mas a linha não é tocada.
  assert.deepEqual(records[0]!.slice(0, before.length), before);
});

test('o skip valida apenas o campo-sinal dos provedores ativos (--only)', async () => {
  // Linha com só GEONET_ID preenchido; GMAPS_ID e DNE_LOGRADOURO vazios.
  const partial = (): string[] => {
    const record = row('ID-1');
    record[10] = 'geo-existente';
    return record;
  };

  const geonetCalls = { viaCep: 0, geonet: 0, google: 0 };
  const geonetSummary = await enrichRecords(
    { bom: false, lineEnding: '\n', headers: [...headers], records: [partial()] },
    countingServices(geonetCalls),
    { start: 1, limit: 1, overwrite: false, threads: 1, providers: ['geonet'] },
  );
  assert.equal(geonetSummary.skippedRows, 1);
  assert.deepEqual(geonetCalls, { viaCep: 0, geonet: 0, google: 0 });

  const googleCalls = { viaCep: 0, geonet: 0, google: 0 };
  const googleSummary = await enrichRecords(
    { bom: false, lineEnding: '\n', headers: [...headers], records: [partial()] },
    countingServices(googleCalls),
    { start: 1, limit: 1, overwrite: false, threads: 1, providers: ['gmaps'] },
  );
  assert.equal(googleSummary.skippedRows, 0);
  assert.equal(googleCalls.google, 1);
});

test('--overwrite reprocessa linha completa em vez de ignorá-la', async () => {
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const summary = await enrichRecords(
    { bom: false, lineEnding: '\n', headers: [...headers], records: [completeRow('ID-1')] },
    countingServices(calls),
    { start: 1, limit: 1, overwrite: true, threads: 1 },
  );

  assert.equal(summary.skippedRows, 0);
  assert.equal(calls.google, 1);
});

test('grava checkpoints a cada N linhas atualizadas e ignora linhas puladas', async () => {
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const records = Array.from({ length: 5 }, (_, index) => row(`ID-${index + 1}`, `7288700${index}`));
  let flushes = 0;
  await enrichRecords(
    { bom: false, lineEnding: '\n', headers: [...headers], records },
    countingServices(calls),
    {
      start: 1,
      limit: 5,
      overwrite: false,
      threads: 1,
      checkpointEvery: 2,
      onCheckpoint: async () => {
        flushes += 1;
      },
    },
  );
  // 5 linhas atualizadas com flush a cada 2 → checkpoints nas linhas 2 e 4.
  assert.equal(flushes, 2);

  let skippedFlushes = 0;
  const skippedSummary = await enrichRecords(
    {
      bom: false,
      lineEnding: '\n',
      headers: [...headers],
      records: [completeRow('ID-1'), completeRow('ID-2'), completeRow('ID-3')],
    },
    countingServices({ viaCep: 0, geonet: 0, google: 0 }),
    {
      start: 1,
      limit: 3,
      overwrite: false,
      threads: 1,
      checkpointEvery: 1,
      onCheckpoint: async () => {
        skippedFlushes += 1;
      },
    },
  );
  assert.equal(skippedSummary.skippedRows, 3);
  assert.equal(skippedFlushes, 0);
});

test('repete operação transitória antes de concluir', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new TypeError('falha temporária');
      throw error;
    }
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('altera somente as células enriquecidas ao gravar uma planilha Excel', () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Endereços');
  worksheet.addRow(headers);
  worksheet.addRow(row('ID-1'));
  worksheet.getCell('A2').font = { bold: true };
  const before = worksheetToDocument(worksheet);
  const after = {
    ...before,
    headers: [...before.headers],
    records: before.records.map((record) => [...record]),
  };
  after.records[0]![10] = 'geo-1';
  after.records[0]![11] = 'Quadra 6, 28';

  applyDocumentToWorksheet(worksheet, before, after);

  assert.equal(worksheet.getCell('K2').text, 'geo-1');
  assert.equal(worksheet.getCell('L2').text, 'Quadra 6, 28');
  assert.equal(worksheet.getCell('A2').text, 'ID-1');
  assert.equal(worksheet.getCell('A2').font?.bold, true);
});
