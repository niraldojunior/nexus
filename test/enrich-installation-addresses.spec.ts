import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { test, vi } from 'vitest';
import {
  applyDocumentToWorksheet,
  type AddressServices,
  buildSearchAddress,
  createAddressServices,
  type DneAddress,
  enrichRecords,
  parseCliArgs,
  parseSemicolonCsv,
  ProviderError,
  repairCorruptedCoordinate,
  selectDneAddressCandidate,
  selectGeonetCandidate,
  selectGoogleResult,
  serializeSemicolonCsv,
  type ViabCandidate,
  worksheetToDocument,
  withRetry,
} from '../scripts/enrich-installation-addresses.js';
import { AppError } from '../src/shared/errors/app-error.js';

const fakeEnv: NodeJS.ProcessEnv = {
  GEONET_API_BASE_URL: 'https://geonet.example.test/api',
  GEONET_TOKEN_URL: 'https://geonet.example.test/oauth/token',
  GEONET_CLIENT_ID: 'client-id',
  GEONET_CLIENT_SECRET: 'client-secret',
  GOOGLE_MAPS_API_KEY: 'fake-google-key',
};

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
  'DNE_CEP',
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
    viabRadius: 300,
    viabStraightOnly: false,
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
    viabRadius: 300,
    viabStraightOnly: false,
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
    viabRadius: 300,
    viabStraightOnly: false,
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

test('--only viab exige --viab-origin; aliases resolvem para viab; --viab-radius é aceito', () => {
  assert.throws(
    () => parseCliArgs(['--file', 'entrada.csv', '--all', '--only', 'viab']),
    /--viab-origin é obrigatório/,
  );
  const parsed = parseCliArgs([
    '--file',
    'entrada.csv',
    '--all',
    '--only',
    'fuzzy,cdo,cdoe',
    '--viab-origin',
    'gmaps',
    '--viab-radius',
    '150',
  ]);
  assert.deepEqual(parsed, {
    file: 'entrada.csv',
    output: 'entrada.csv',
    start: 1,
    limit: Number.MAX_SAFE_INTEGER,
    overwrite: false,
    threads: 1,
    checkpoint: 200,
    providers: ['viab'],
    viabOrigin: 'gmaps',
    viabRadius: 150,
    viabStraightOnly: false,
  });
  assert.throws(
    () =>
      parseCliArgs([
        '--file',
        'entrada.csv',
        '--all',
        '--only',
        'viab',
        '--viab-origin',
        'invalido',
      ]),
    /--viab-origin não reconhece/,
  );
});

test('--viab-origin aceita "melhor" (delega a fonte à coluna MELHOR por linha)', () => {
  const parsed = parseCliArgs([
    '--file',
    'entrada.csv',
    '--all',
    '--only',
    'viab',
    '--viab-origin',
    'melhor',
  ]);
  assert.notEqual(parsed, 'help');
  assert.equal((parsed as { viabOrigin: string }).viabOrigin, 'melhor');
});

test('--viab-straight liga viabStraightOnly (desligado por padrão)', () => {
  const withoutFlag = parseCliArgs([
    '--file',
    'entrada.csv',
    '--all',
    '--only',
    'viab',
    '--viab-origin',
    'gmaps',
  ]);
  assert.notEqual(withoutFlag, 'help');
  assert.equal((withoutFlag as { viabStraightOnly: boolean }).viabStraightOnly, false);

  const withFlag = parseCliArgs([
    '--file',
    'entrada.csv',
    '--all',
    '--only',
    'viab',
    '--viab-origin',
    'gmaps',
    '--viab-straight',
  ]);
  assert.notEqual(withFlag, 'help');
  assert.equal((withFlag as { viabStraightOnly: boolean }).viabStraightOnly, true);
});

test('usa o DNE como endereço canônico e não inclui referência informal na consulta', () => {
  const values = buildSearchAddress(row('A'), indexOf(), {
    cep: '72880000',
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
        cep: '72880000',
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
  const records = Array.from({ length: 6 }, (_, index) =>
    row(`ID-${index + 1}`, `7288700${index}`),
  );
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
        cep: '72880000',
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
      cep: '72880000',
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
    'ViaCEP=preenchido; GEONET=encontrado; Google=não encontrado; TenantReverso=desativado; Viab=desativado; linha atualizada.',
  );
});

test('preenche o DNE mesmo com UF/Município divergente e registra no log', async () => {
  const records = [row('ID-1')];
  const services: AddressServices = {
    viaCep: async () => ({
      cep: '74000000',
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
  assert.equal(at('DNE_CEP'), '74000000');
  assert.equal(summary.viaCep.filled, 0);
  assert.equal(summary.viaCep.mismatched, 1);
  assert.match(at('LOG_GERAL'), /ViaCEP=preenchido \(divergente/);
});

test('completa MUNICIPIO vazio via ViaCEP antes do GEONET, sem tratar como divergência', async () => {
  const record = row('ID-1');
  record[2] = ''; // MUNICIPIO ausente na origem (caso do arquivo acerto.end.HC.faturamento).
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...headers],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => ({
      cep: '72880000',
      logradouro: 'Quadra 6',
      complemento: '',
      bairro: 'Parque Nova Friburgo B',
      localidade: 'Cidade Ocidental',
      uf: 'GO',
    }),
    // Só "encontra" quando a linha já chega com MUNICIPIO preenchido — replica
    // a checagem de coerência real do GEONET, que exige cidade compatível.
    geonet: async (_address, _number, currentRow, index) => {
      if (currentRow[index.get('MUNICIPIO')!] !== 'Cidade Ocidental') return null;
      return {
        id: 'geo-1',
        formattedAddress: 'Quadra 6, 28',
        location: '[-47.94,-16.09]',
        precision: 'Endereço Interpolação',
      };
    },
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep', 'geonet'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('MUNICIPIO'), 'Cidade Ocidental');
  assert.equal(at('GEONET_ID'), 'geo-1');
  assert.equal(summary.municipioFilled, 1);
  assert.equal(summary.viaCep.filled, 1);
  assert.equal(summary.viaCep.mismatched, 0);
  assert.match(at('LOG_GERAL'), /MUNICIPIO completado via ViaCEP/);
});

test('repesca por rua/número/UF quando o CEP não é encontrado, e preenche DNE_CEP', async () => {
  const record = row('ID-1');
  record[2] = ''; // MUNICIPIO vazio na origem, como no arquivo acerto.end.HC.faturamento.
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...headers],
    records: [record],
  };
  const calls = { viaCep: 0, viaCepByAddress: 0 };
  const services: AddressServices = {
    viaCep: async () => {
      calls.viaCep += 1;
      return null;
    },
    viaCepByAddress: async (uf, street, number) => {
      calls.viaCepByAddress += 1;
      assert.equal(uf, 'GO');
      assert.equal(street, 'QUADRA 06 LOTE');
      assert.equal(number, '28');
      return {
        cep: '72887-220',
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

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('DNE_CEP'), '72887-220');
  assert.equal(at('DNE_LOGRADOURO'), 'Quadra 6');
  assert.equal(at('MUNICIPIO'), 'Cidade Ocidental');
  assert.equal(summary.viaCep.notFound, 1);
  assert.equal(summary.viaCepRetry.filled, 1);
  assert.equal(summary.municipioFilled, 1);
  assert.equal(calls.viaCepByAddress, 1);
  assert.match(at('LOG_GERAL'), /encontrado pela rua\/número\/UF/);
});

test('repescagem sem sucesso não inventa dado e conta como não encontrada', async () => {
  const record = row('ID-1');
  record[2] = '';
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...headers],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => null,
    viaCepByAddress: async () => null,
    geonet: async () => null,
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('DNE_CEP'), '');
  assert.equal(at('MUNICIPIO'), '');
  assert.equal(summary.viaCepRetry.notFound, 1);
  assert.match(at('LOG_GERAL'), /não encontrado por CEP nem pela rua\/número\/UF/);
});

test('trata "erro" do ViaCEP como string ou booleano e devolve o CEP encontrado', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ erro: 'true' }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          cep: '01310-100',
          logradouro: 'Avenida Paulista',
          complemento: 'de 612 a 1510 - lado par',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        }),
        { status: 200 },
      ),
    );
  const services = createAddressServices(fakeEnv, fetchImpl);

  assert.equal(await services.viaCep('99999999'), null);
  assert.deepEqual(await services.viaCep('01310100'), {
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    complemento: 'de 612 a 1510 - lado par',
    bairro: 'Bela Vista',
    localidade: 'São Paulo',
    uf: 'SP',
  });
});

test('viaCepByAddress descobre o município pelo Google e busca o endereço no DNE de verdade', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('maps.googleapis.com')) {
      return new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              formatted_address: 'Quadra 6, Cidade Ocidental - GO, Brasil',
              address_components: [
                { long_name: 'Cidade Ocidental', types: ['locality', 'political'] },
                { short_name: 'GO', types: ['administrative_area_level_1', 'political'] },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('viacep.com.br/ws/GO/Cidade%20Ocidental/Quadra%206/json/')) {
      return new Response(
        JSON.stringify([
          {
            cep: '72880-000',
            logradouro: 'Quadra 6',
            complemento: '',
            bairro: 'Parque Nova Friburgo B',
            localidade: 'Cidade Ocidental',
            uf: 'GO',
          },
        ]),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada nesta simulação: ${url}`);
  });
  const services = createAddressServices(fakeEnv, fetchImpl);

  const result = await services.viaCepByAddress!('GO', 'Quadra 6', '28');

  assert.deepEqual(result, {
    cep: '72880-000',
    logradouro: 'Quadra 6',
    complemento: '',
    bairro: 'Parque Nova Friburgo B',
    localidade: 'Cidade Ocidental',
    uf: 'GO',
  });
});

test('selectDneAddressCandidate escolhe pela faixa numérica do complemento e rejeita rua sem relação', () => {
  const paulista: DneAddress[] = [
    {
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      complemento: 'de 612 a 1510 - lado par',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
    },
    {
      cep: '01310-200',
      logradouro: 'Avenida Paulista',
      complemento: 'de 1 a 610 - lado ímpar',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
    },
  ];
  assert.equal(selectDneAddressCandidate(paulista, 'Avenida Paulista', '900')?.cep, '01310-100');
  assert.equal(selectDneAddressCandidate(paulista, 'Avenida Paulista', '50')?.cep, '01310-200');

  const semRelacao: DneAddress[] = [
    {
      cep: '99999-000',
      logradouro: 'Rua Sem Relação',
      complemento: '',
      bairro: '',
      localidade: 'São Paulo',
      uf: 'SP',
    },
  ];
  assert.equal(selectDneAddressCandidate(semRelacao, 'Avenida Paulista', '28'), null);
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
    'ViaCEP=desativado; GEONET=desativado; Google=encontrado; TenantReverso=desativado; Viab=desativado; linha atualizada.',
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
        cep: '72880000',
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

test('grava checkpoints a cada N linhas processadas e ignora linhas puladas', async () => {
  const calls = { viaCep: 0, geonet: 0, google: 0 };
  const records = Array.from({ length: 5 }, (_, index) =>
    row(`ID-${index + 1}`, `7288700${index}`),
  );
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
  // 5 linhas processadas com flush a cada 2 → checkpoints nas linhas 2 e 4.
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

test('checkpoint conta linhas processadas mesmo quando nada foi encontrado (sem mudança)', async () => {
  // Antes, o checkpoint só contava linha que mudou algum campo; um trecho longo
  // de "não encontrado" (comum neste tipo de arquivo) atrasava o salvamento.
  const records = Array.from({ length: 4 }, (_, index) =>
    row(`ID-${index + 1}`, `7288700${index}`),
  );
  const services: AddressServices = {
    viaCep: async () => null,
    viaCepByAddress: async () => null,
    geonet: async () => null,
    google: async () => null,
  };
  let flushes = 0;
  const summary = await enrichRecords(
    { bom: false, lineEnding: '\n', headers: [...headers], records },
    services,
    {
      start: 1,
      limit: 4,
      overwrite: false,
      threads: 1,
      checkpointEvery: 2,
      onCheckpoint: async () => {
        flushes += 1;
      },
    },
  );

  assert.equal(summary.updatedRows, 0);
  assert.equal(flushes, 2);
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

test('withRetry aceita opções: mais tentativas e backoff base configurável', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 4) throw new TypeError('falha temporária');
      return 'ok';
    },
    { attempts: 5, baseDelayMs: 1 },
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 4);
});

test('withRetry usa o Retry-After do provedor em vez do backoff exponencial padrão', async () => {
  let attempts = 0;
  const start = Date.now();
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new ProviderError('Routes API HTTP 429.', true, 20);
      return 'ok';
    },
    { baseDelayMs: 5_000, maxDelayMs: 30_000 },
  );
  const elapsed = Date.now() - start;

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
  assert.ok(elapsed < 1_000, `esperava usar o retryAfterMs (20ms) em vez do baseDelayMs, levou ${elapsed}ms`);
});

test('withRetry limita o Retry-After ao maxDelayMs configurado', async () => {
  let attempts = 0;
  const start = Date.now();
  await withRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new ProviderError('Routes API HTTP 429.', true, 5_000);
      return 'ok';
    },
    { maxDelayMs: 30 },
  );
  const elapsed = Date.now() - start;

  assert.equal(attempts, 2);
  assert.ok(elapsed < 500, `esperava respeitar o teto de 30ms, levou ${elapsed}ms`);
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

const tenantHeaders = [
  ...headers,
  'TENANT_LATITUDE',
  'TENANT_LONGITUDE',
  'TENANT_GMAPS_ENDERECO_REVERSO',
];

const rowWithTenant = (id: string, lat: string, lng: string, reverse = ''): string[] => [
  ...row(id),
  lat,
  lng,
  reverse,
];

test('geocoding reverso da coordenada da tenant preenche TENANT_GMAPS_ENDERECO_REVERSO quando o Gmaps está ativo', async () => {
  const record = rowWithTenant('ID-1', '-16.09', '-47.94');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  let calls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    reverseGeocodeTenant: async (lat, lng) => {
      calls += 1;
      assert.equal(lat, -16.09);
      assert.equal(lng, -47.94);
      return 'Quadra 6, Cidade Ocidental - GO, Brasil';
    },
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['gmaps'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('TENANT_GMAPS_ENDERECO_REVERSO'), 'Quadra 6, Cidade Ocidental - GO, Brasil');
  assert.equal(summary.tenantReverse.filled, 1);
  assert.equal(calls, 1);
  assert.match(at('LOG_GERAL'), /TenantReverso=preenchido/);
});

test('revisita linha já completa nos demais provedores só para preencher o reverso da tenant', async () => {
  const record = rowWithTenant('ID-1', '-16.09', '-47.94');
  // GMAPS_* já preenchido por completo: sem o novo campo a linha seria pulada.
  record[14] = 'google-1';
  record[15] = 'Quadra 6, 28';
  record[16] = '[-47.94,-16.09]';
  record[17] = 'ROOFTOP';
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  let googleCalls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => {
      googleCalls += 1;
      return null;
    },
    reverseGeocodeTenant: async () => 'Quadra 6, Cidade Ocidental - GO, Brasil',
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['gmaps'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(summary.skippedRows, 0);
  assert.equal(googleCalls, 0); // GMAPS_ID já preenchido: não refaz a consulta
  assert.equal(at('TENANT_GMAPS_ENDERECO_REVERSO'), 'Quadra 6, Cidade Ocidental - GO, Brasil');
  assert.equal(summary.tenantReverse.filled, 1);
});

test('não faz geocoding reverso da tenant quando gmaps não está entre os provedores selecionados', async () => {
  const record = rowWithTenant('ID-1', '-16.09', '-47.94');
  record[18] = 'Quadra 6'; // DNE_LOGRADOURO já preenchido: só o geonet ficaria pendente
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  let calls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => ({
      id: 'geo-1',
      formattedAddress: 'Quadra 6, 28',
      location: '[-47.94,-16.09]',
      precision: 'Endereço Interpolação',
    }),
    google: async () => null,
    reverseGeocodeTenant: async () => {
      calls += 1;
      return 'não deveria ser chamado';
    },
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['geonet'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('TENANT_GMAPS_ENDERECO_REVERSO'), '');
  assert.equal(summary.tenantReverse.filled, 0);
  assert.equal(calls, 0);
  assert.match(at('LOG_GERAL'), /TenantReverso=desativado/);
});

test('repesca o DNE pela coordenada da tenant quando a busca por rua/número/UF também falha', async () => {
  const record = rowWithTenant('ID-1', '-16.09', '-47.94');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  const calls = { viaCepByAddress: 0, viaCepByCoordinates: 0 };
  const services: AddressServices = {
    viaCep: async () => null,
    viaCepByAddress: async () => {
      calls.viaCepByAddress += 1;
      return null;
    },
    viaCepByCoordinates: async (uf, lat, lng, number) => {
      calls.viaCepByCoordinates += 1;
      assert.equal(uf, 'GO');
      assert.equal(lat, -16.09);
      assert.equal(lng, -47.94);
      assert.equal(number, '28');
      return {
        cep: '72880-000',
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

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('DNE_CEP'), '72880-000');
  assert.equal(at('DNE_LOGRADOURO'), 'Quadra 6');
  assert.equal(summary.viaCepCoordRetry.filled, 1);
  assert.equal(calls.viaCepByAddress, 1);
  assert.equal(calls.viaCepByCoordinates, 1);
  assert.match(at('LOG_GERAL'), /nem pela rua\/número\/UF; encontrado pela coordenada da tenant/);
});

test('repescagem pela coordenada da tenant sem sucesso não inventa dado', async () => {
  const record = rowWithTenant('ID-1', '-16.09', '-47.94');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => null,
    viaCepByAddress: async () => null,
    viaCepByCoordinates: async () => null,
    geonet: async () => null,
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('DNE_CEP'), '');
  assert.equal(summary.viaCepCoordRetry.notFound, 1);
  assert.match(
    at('LOG_GERAL'),
    /nem pela rua\/número\/UF; não encontrado pela coordenada da tenant/,
  );
});

test('viaCepByCoordinates faz geocoding reverso e busca o endereço no DNE de verdade', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('maps.googleapis.com')) {
      assert.match(url, /latlng=-16\.09%2C-47\.94/);
      return new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              types: ['street_address'],
              formatted_address: 'Quadra 6, Cidade Ocidental - GO, Brasil',
              address_components: [
                { long_name: 'Quadra 6', types: ['route'] },
                { long_name: 'Cidade Ocidental', types: ['locality', 'political'] },
                { short_name: 'GO', types: ['administrative_area_level_1', 'political'] },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('viacep.com.br/ws/GO/Cidade%20Ocidental/Quadra%206/json/')) {
      return new Response(
        JSON.stringify([
          {
            cep: '72880-000',
            logradouro: 'Quadra 6',
            complemento: '',
            bairro: 'Parque Nova Friburgo B',
            localidade: 'Cidade Ocidental',
            uf: 'GO',
          },
        ]),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada nesta simulação: ${url}`);
  });
  const services = createAddressServices(fakeEnv, fetchImpl);

  const result = await services.viaCepByCoordinates!('GO', -16.09, -47.94, '28');

  assert.deepEqual(result, {
    cep: '72880-000',
    logradouro: 'Quadra 6',
    complemento: '',
    bairro: 'Parque Nova Friburgo B',
    localidade: 'Cidade Ocidental',
    uf: 'GO',
  });
});

test('reverseGeocodeTenant devolve o endereço formatado da coordenada', async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            {
              types: ['street_address'],
              formatted_address: 'Quadra 6, Cidade Ocidental - GO, Brasil',
              address_components: [],
            },
          ],
        }),
        { status: 200 },
      ),
  );
  const services = createAddressServices(fakeEnv, fetchImpl);

  const result = await services.reverseGeocodeTenant!(-16.09, -47.94);

  assert.equal(result, 'Quadra 6, Cidade Ocidental - GO, Brasil');
});

// GO: [-19.6, -12.3, -53.4, -45.8] (latMin, latMax, lonMin, lonMax)
const GO_LAT_RANGE: [number, number] = [-19.6, -12.3];
const GO_LNG_RANGE: [number, number] = [-53.4, -45.8];

test('repairCorruptedCoordinate reconstrói o decimal quando só uma posição é plausível na UF', () => {
  assert.equal(repairCorruptedCoordinate('-160.931.392', GO_LAT_RANGE), -16.0931392);
  assert.equal(repairCorruptedCoordinate('-479.441.935', GO_LNG_RANGE), -47.9441935);
});

test('repairCorruptedCoordinate lida com ponto sobrando no fim (padrão de corrupção parcial)', () => {
  assert.equal(repairCorruptedCoordinate('-16.071495.', GO_LAT_RANGE), -16.071495);
});

test('repairCorruptedCoordinate não inventa valor quando mais de uma posição é plausível', () => {
  assert.equal(repairCorruptedCoordinate('-12345', [-50, 5]), null);
});

test('repairCorruptedCoordinate devolve null quando nenhuma posição cai na caixa da UF', () => {
  assert.equal(repairCorruptedCoordinate('-999.999.999', GO_LAT_RANGE), null);
  assert.equal(repairCorruptedCoordinate('abc', GO_LAT_RANGE), null);
});

test('enrichRecords repara TENANT_LATITUDE/LONGITUDE corrompidos e higieniza o CSV de saída', async () => {
  const record = rowWithTenant('ID-1', '-160.931.392', '-479.441.935');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('TENANT_LATITUDE'), '-16.0931392');
  assert.equal(at('TENANT_LONGITUDE'), '-47.9441935');
  assert.equal(summary.tenantCoordRepaired, 1);
  assert.match(at('LOG_GERAL'), /TENANT_LATITUDE\/TENANT_LONGITUDE reparados/);
});

test('reparo da coordenada da tenant tira a linha do skip mesmo com os demais provedores já completos', async () => {
  const record = rowWithTenant('ID-1', '-160.931.392', '-479.441.935');
  record[18] = 'Quadra 6'; // DNE_LOGRADOURO já preenchido: só a coordenada está quebrada
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  let viaCepCalls = 0;
  const services: AddressServices = {
    viaCep: async () => {
      viaCepCalls += 1;
      return null;
    },
    geonet: async () => null,
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(summary.skippedRows, 0); // sem o reparo, essa linha seria pulada (DNE_LOGRADOURO já ok)
  assert.equal(viaCepCalls, 0); // DNE_LOGRADOURO já preenchido: viacep nem é chamado
  assert.equal(at('TENANT_LATITUDE'), '-16.0931392');
  assert.equal(summary.tenantCoordRepaired, 1);
  assert.equal(summary.updatedRows, 1);
});

test('coordenada da tenant irrecuperável não é alterada nem contada como reparada', async () => {
  // Ambos os eixos fora de qualquer posição plausível para GO — nenhum se repara.
  const record = rowWithTenant('ID-1', '-999.999.999', '-999.999.999');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(summary.tenantCoordRepaired, 0);
  assert.equal(at('TENANT_LONGITUDE'), '-999.999.999');
  assert.equal(at('TENANT_LATITUDE'), '-999.999.999');
});

test('repara a coordenada e, na mesma passada, consegue repescar o DNE por ela', async () => {
  const record = rowWithTenant('ID-1', '-160.931.392', '-479.441.935');
  const document = {
    bom: false,
    lineEnding: '\n' as const,
    headers: [...tenantHeaders],
    records: [record],
  };
  const services: AddressServices = {
    viaCep: async () => null,
    viaCepByAddress: async () => null,
    viaCepByCoordinates: async (uf, lat, lng, number) => {
      assert.equal(uf, 'GO');
      assert.equal(lat, -16.0931392);
      assert.equal(lng, -47.9441935);
      assert.equal(number, '28');
      return {
        cep: '72880-000',
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

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viacep'],
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('TENANT_LATITUDE'), '-16.0931392');
  assert.equal(at('DNE_CEP'), '72880-000');
  assert.equal(summary.tenantCoordRepaired, 1);
  assert.equal(summary.viaCepCoordRetry.filled, 1);
});

// ---------------------------------------------------------- viab (CDOs próximas) ---

// GMAPS_LOCALIZACAO (índice 16 em `headers`) é a origem usada nos testes abaixo — o
// mesmo formato JSON.stringify([lng, lat]) que este script grava nessa coluna.
const viabRow = (id: string, origin: [number, number] | null = [-43.104, -22.901]): string[] => {
  const record = row(id);
  if (origin) record[16] = JSON.stringify(origin);
  return record;
};

const viabDocument = (
  records: string[][],
): { bom: false; lineEnding: '\n'; headers: string[]; records: string[][] } => ({
  bom: false,
  lineEnding: '\n',
  headers: [...headers],
  records,
});

const cdoCandidate = (id: string, straightMeters: number): ViabCandidate => ({
  id,
  name: `CDO-${id}`,
  lng: -43.104,
  lat: -22.901,
  straightMeters,
});

test('viab grava as 3 melhores por caminhada, reordenando as candidatas', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  const candidates = [
    cdoCandidate('cdo-1', 50),
    cdoCandidate('cdo-2', 80),
    cdoCandidate('cdo-3', 120),
    cdoCandidate('cdo-4', 150),
    cdoCandidate('cdo-5', 200),
  ];
  // Distâncias a pé propositalmente fora da ordem da linha reta: o ranking final deve
  // seguir a caminhada (cdo-3, cdo-2, cdo-5), não a ordem de chegada das candidatas.
  const walkDistances = [280, 60, 45, 290, 70];
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => candidates,
    walkRouteMatrix: async (_origin, destinations) =>
      destinations.map((_, index) => ({ distanceMeters: walkDistances[index]! })),
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-3');
  assert.equal(at('VIAB_FUZZY_CDOE_1_DISTANCIA'), '45');
  assert.equal(at('VIAB_FUZZY_CDOE_2_ID'), 'cdo-2');
  assert.equal(at('VIAB_FUZZY_CDOE_2_DISTANCIA'), '60');
  assert.equal(at('VIAB_FUZZY_CDOE_3_ID'), 'cdo-5');
  assert.equal(at('VIAB_FUZZY_CDOE_3_DISTANCIA'), '70');
  assert.match(at('LOG_VIAB'), /5 candidata\(s\)/);
  assert.match(at('LOG_VIAB'), /3 gravada\(s\)/);
  assert.equal(summary.viab.filled, 1);
  assert.equal(summary.viabStraightFallback, 0);
});

test('--viab-straight nunca chama a Routes API; grava tudo em linha reta', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  const candidates = [cdoCandidate('cdo-1', 50), cdoCandidate('cdo-2', 80), cdoCandidate('cdo-3', 120)];
  let routeCalls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => candidates,
    walkRouteMatrix: async () => {
      routeCalls += 1;
      throw new Error('não deveria ser chamado com --viab-straight');
    },
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
    viabStraightOnly: true,
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(routeCalls, 0);
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-1');
  assert.equal(at('VIAB_FUZZY_CDOE_1_DISTANCIA'), '50 (linha reta)');
  assert.equal(at('VIAB_FUZZY_CDOE_2_ID'), 'cdo-2');
  assert.equal(at('VIAB_FUZZY_CDOE_2_DISTANCIA'), '80 (linha reta)');
  assert.equal(at('VIAB_FUZZY_CDOE_3_ID'), 'cdo-3');
  assert.equal(at('VIAB_FUZZY_CDOE_3_DISTANCIA'), '120 (linha reta)');
  assert.match(at('LOG_VIAB'), /3 por linha reta \(sem rota\)/);
  assert.equal(summary.viab.filled, 1);
  assert.equal(summary.viabStraightFallback, 3);
});

test('--viab-straight não exige services.walkRouteMatrix', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => [cdoCandidate('cdo-1', 30)],
    // sem walkRouteMatrix — não pode ser exigido quando viabStraightOnly está ligado.
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
    viabStraightOnly: true,
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-1');
  assert.equal(at('VIAB_FUZZY_CDOE_1_DISTANCIA'), '30 (linha reta)');
  assert.equal(summary.viab.filled, 1);
});

test('viab descarta candidata com caminhada acima do raio mesmo com linha reta dentro dele', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  const candidates = [cdoCandidate('cdo-perto', 90), cdoCandidate('cdo-longe-a-pe', 100)];
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => candidates,
    // cdo-longe-a-pe tem linha reta de 100 m (dentro do raio) mas rota a pé de 350 m
    // (fora do raio de 300 m) — precisa ser descartada, não gravada em linha reta.
    walkRouteMatrix: async () => [{ distanceMeters: 90 }, { distanceMeters: 350 }],
  };

  await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-perto');
  assert.equal(at('VIAB_FUZZY_CDOE_2_ID'), '');
  assert.equal(at('VIAB_FUZZY_CDOE_3_ID'), '');
});

test('viab cai para linha reta marcada quando a Routes API não acha rota a pé', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => [cdoCandidate('cdo-1', 90)],
    walkRouteMatrix: async () => [null],
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-1');
  assert.equal(at('VIAB_FUZZY_CDOE_1_DISTANCIA'), '90 (linha reta)');
  assert.match(at('LOG_VIAB'), /1 por linha reta \(sem rota\)/);
  assert.equal(summary.viabStraightFallback, 1);
});

test('viab pula linha sem coordenada de referência, sem consultar nada', async () => {
  const record = viabRow('ID-1', null); // GMAPS_LOCALIZACAO vazio
  const document = viabDocument([record]);
  let nearbyCalls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => {
      nearbyCalls += 1;
      return [];
    },
    walkRouteMatrix: async () => [],
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });

  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(nearbyCalls, 0);
  assert.match(at('LOG_VIAB'), /sem coordenada de referência \(gmaps\)/);
  assert.equal(summary.viab.skipped, 1);
});

test('viab: LOG_VIAB preenchido pula a linha sem --overwrite; --overwrite reescreve e limpa slots', async () => {
  const record = viabRow('ID-1');
  const document = viabDocument([record]);
  let nearbyCalls = 0;
  const manyServices: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => {
      nearbyCalls += 1;
      return [cdoCandidate('cdo-1', 50), cdoCandidate('cdo-2', 80), cdoCandidate('cdo-3', 120)];
    },
    walkRouteMatrix: async () => [
      { distanceMeters: 50 },
      { distanceMeters: 80 },
      { distanceMeters: 120 },
    ],
  };

  await enrichRecords(document, manyServices, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });
  const at = (name: string): string => record[document.headers.indexOf(name)]!;
  assert.equal(at('VIAB_FUZZY_CDOE_3_ID'), 'cdo-3');
  assert.equal(nearbyCalls, 1);

  // Reexecução sem --overwrite: LOG_VIAB já preenchido — a linha inteira é pulada
  // (rowNeedsWork), nenhuma nova consulta é feita.
  const summaryRerun = await enrichRecords(document, manyServices, {
    start: 1,
    limit: 1,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });
  assert.equal(nearbyCalls, 1);
  assert.equal(summaryRerun.skippedRows, 1);

  // Com --overwrite, reconsulta e — como agora só há 1 candidata — limpa os slots 2 e 3.
  const oneService: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => {
      nearbyCalls += 1;
      return [cdoCandidate('cdo-unico', 30)];
    },
    walkRouteMatrix: async () => [{ distanceMeters: 30 }],
  };
  await enrichRecords(document, oneService, {
    start: 1,
    limit: 1,
    overwrite: true,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });
  assert.equal(nearbyCalls, 2);
  assert.equal(at('VIAB_FUZZY_CDOE_1_ID'), 'cdo-unico');
  assert.equal(at('VIAB_FUZZY_CDOE_2_ID'), '');
  assert.equal(at('VIAB_FUZZY_CDOE_3_ID'), '');
});

test('viab reutiliza a mesma consulta para coordenadas iguais em linhas diferentes', async () => {
  const recordA = viabRow('ID-1');
  const recordB = viabRow('ID-2');
  const document = viabDocument([recordA, recordB]);
  let nearbyCalls = 0;
  let routeCalls = 0;
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => {
      nearbyCalls += 1;
      return [cdoCandidate('cdo-1', 50)];
    },
    walkRouteMatrix: async () => {
      routeCalls += 1;
      return [{ distanceMeters: 50 }];
    },
  };

  await enrichRecords(document, services, {
    start: 1,
    limit: 2,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'gmaps',
  });

  assert.equal(nearbyCalls, 1);
  assert.equal(routeCalls, 1);
  const idOf = (record: string[]): string =>
    record[document.headers.indexOf('VIAB_FUZZY_CDOE_1_ID')]!;
  assert.equal(idOf(recordA), 'cdo-1');
  assert.equal(idOf(recordB), 'cdo-1');
});

test('viab-origin=melhor usa, por linha, a fonte indicada na coluna MELHOR', async () => {
  const headersWithMelhor = [...headers, 'MELHOR'];
  const geonetOrigin: [number, number] = [-43.2, -22.8];
  const gmapsOrigin: [number, number] = [-43.104, -22.901];

  const makeRow = (id: string, melhor: string): string[] => {
    const record = row(id);
    record[12] = JSON.stringify(geonetOrigin); // GEONET_LOCALIZACAO
    record[16] = JSON.stringify(gmapsOrigin); // GMAPS_LOCALIZACAO
    return [...record, melhor];
  };

  const recordGeonet = makeRow('ID-1', 'geonet');
  const recordGmaps = makeRow('ID-2', 'gmaps');
  const recordBlank = makeRow('ID-3', '');
  const recordInvalid = makeRow('ID-4', 'xyz');

  const document = {
    bom: false as const,
    lineEnding: '\n' as const,
    headers: headersWithMelhor,
    records: [recordGeonet, recordGmaps, recordBlank, recordInvalid],
  };

  const seenOrigins: Array<{ lng: number; lat: number }> = [];
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async (origin) => {
      seenOrigins.push(origin);
      return [cdoCandidate('cdo-1', 50)];
    },
    walkRouteMatrix: async (_origin, destinations) => destinations.map(() => ({ distanceMeters: 40 })),
  };

  const summary = await enrichRecords(document, services, {
    start: 1,
    limit: 4,
    overwrite: false,
    threads: 1,
    providers: ['viab'],
    viabOrigin: 'melhor',
  });

  const at = (record: string[], name: string): string => record[document.headers.indexOf(name)]!;

  assert.equal(at(recordGeonet, 'VIAB_FUZZY_CDOE_1_ID'), 'cdo-1');
  assert.match(at(recordGeonet, 'LOG_VIAB'), /origem=geonet/);
  assert.equal(at(recordGmaps, 'VIAB_FUZZY_CDOE_1_ID'), 'cdo-1');
  assert.match(at(recordGmaps, 'LOG_VIAB'), /origem=gmaps/);
  assert.match(
    at(recordBlank, 'LOG_VIAB'),
    /sem coordenada de referência \(melhor: MELHOR vazio ou não reconhecido\)/,
  );
  assert.match(
    at(recordInvalid, 'LOG_VIAB'),
    /sem coordenada de referência \(melhor: MELHOR vazio ou não reconhecido\)/,
  );
  assert.equal(summary.viab.filled, 2);
  assert.equal(summary.viab.skipped, 2);
  assert.deepEqual(seenOrigins, [
    { lng: geonetOrigin[0], lat: geonetOrigin[1] },
    { lng: gmapsOrigin[0], lat: gmapsOrigin[1] },
  ]);
});

test('viab-origin=melhor falha rápido quando o arquivo não tem coluna MELHOR', async () => {
  const document = viabDocument([viabRow('ID-1')]); // headers sem MELHOR (ver `headers` no topo do arquivo)
  const services: AddressServices = {
    viaCep: async () => null,
    geonet: async () => null,
    google: async () => null,
    nearbyCdos: async () => {
      throw new Error('não deveria consultar CDOs — deveria falhar antes, no ensureLayout');
    },
  };

  await assert.rejects(
    enrichRecords(document, services, {
      start: 1,
      limit: 1,
      overwrite: false,
      threads: 1,
      providers: ['viab'],
      viabOrigin: 'melhor',
    }),
    /--viab-origin=melhor requer uma coluna "MELHOR"/,
  );
});

test('viab: ensureViabColumns só acrescenta as colunas quando o provider está ativo', () => {
  const withoutViab = viabDocument([row('ID-1')]);
  const withViab = viabDocument([row('ID-2')]);
  return Promise.all([
    enrichRecords(
      withoutViab,
      { viaCep: async () => null, geonet: async () => null, google: async () => null },
      {
        start: 1,
        limit: 1,
        overwrite: false,
        threads: 1,
        providers: ['viacep'],
      },
    ),
    enrichRecords(
      withViab,
      { viaCep: async () => null, geonet: async () => null, google: async () => null },
      {
        start: 1,
        limit: 1,
        overwrite: false,
        threads: 1,
        providers: ['viab'],
        viabOrigin: 'gmaps',
      },
    ),
  ]).then(() => {
    assert.ok(!withoutViab.headers.includes('VIAB_FUZZY_CDOE_1_ID'));
    assert.ok(withViab.headers.includes('VIAB_FUZZY_CDOE_1_ID'));
    assert.ok(withViab.headers.includes('LOG_VIAB'));
  });
});
