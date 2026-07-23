#!/usr/bin/env node
/**
 * Carga de recursos físicos (planta externa) do Netwin no inventário do Nexus.
 *
 * Layout padrão: `scripts/recursos_niteroi.csv` — export do Netwin, `;`,
 * **ISO-8859-1** (atenção: o export de estações é UTF-8; este é latin-1).
 *
 * Estrutura da origem (deduzida e validada contra os 24.598 registros):
 *
 *   CODIGO_EQUIPAMENTO **não é o id do equipamento**. Ele significa duas coisas
 *   diferentes conforme a linha:
 *     · em linha de CAIXA (CDOE/CDOI/CEO/CEOS) → código externo do ponto
 *       (poste/obra, ex. "A8682"), compartilhado por caixas no mesmo local;
 *     · em linha de SPLITTER → o NOME da caixa que o contém ("CDOE-3901").
 *   NOME_EQUIPAMENTO é o nome do elemento dentro do seu agrupador.
 *
 * Modelagem gerada (AGENTS.md §3–§4):
 *
 *   Caixa CDOE/CDOI/CEO/CEOS   PhysicalResource · resourceType `CTO`
 *     └── Splitter             PhysicalResource · resourceType `Splitter`
 *                              ligado por `containsAsChild`
 *
 *   · Planta externa fica na rua, então cada CAIXA ganha GeographicLocation
 *     (Point) própria + GeographicAddress do logradouro — sem o endereço a
 *     árvore de Locais joga o item em "Sem UF". É a exceção consciente à regra
 *     "place é sempre Site" (ver seed-gpon-niteroi.mjs).
 *   · O SPLITTER reaproveita a Location da caixa: é o mesmo ponto físico, e
 *     duplicar 14.739 geometrias idênticas só inflaria o mapa.
 *   · C1 — nada de tipo novo no catálogo: caixa usa `CTO`, splitter `Splitter`.
 *   · C5 — id do Nexus é próprio; a chave natural do Netwin vai em
 *     `characteristic` no grupo `_origin`, e é ela que dá idempotência.
 *
 * Chave natural (unicidade verificada linha a linha na origem):
 *   caixa    → `<sigla>|<nome>|<lat>|<long>`            (9.859 únicas)
 *   splitter → `<sigla>|<caixa>|<lat>|<long>|<nome>`    (14.739 únicas)
 * A coordenada entra na chave porque nome de caixa se repete: "CDOE-311"
 * existe em Fonseca, Itaipu e Pendotiba, e "CDOE-6103" aparece duas vezes
 * dentro de Icaraí. É também o que liga cada splitter à caixa certa.
 *
 * Grava via SQL em lote (padrão de src/scripts/migrate-sqlite-to-neon.ts):
 * ~44 mil POSTs HTTP levariam mais de 10h. Tradeoff aceito com o usuário: esta
 * via **não publica eventos TMF688** (C7) — é carga inicial de migração, não
 * mudança operacional.
 *
 * Uso:
 *   node scripts/load-recursos-netwin.mjs                  # dry-run (padrão)
 *   node scripts/load-recursos-netwin.mjs --apply          # grava
 *   node scripts/load-recursos-netwin.mjs --file outro.csv --apply
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CSV_PATH = argOf('--file', 'scripts/recursos_niteroi.csv');
const APPLY = has('--apply');
const DB_URL = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'load-recursos-netwin';
const SEED_TAG = 'recursos-netwin';

// Tipos de caixa (agrupadores). Tudo que não é SPLITTER é caixa.
const BOX_TYPES = new Set(['CDOE', 'CDOI', 'CEO', 'CEOS', 'Indefinido']);

// STATUS do Netwin → status canônico do inventário.
const STATUS_MAP = {
  'Em Serviço': 'active',
  'Fora de Serviço': 'inactive',
  Bloqueado: 'suspended',
};

// O endereço do Netwin vem sem acento ("NITEROI"). Sem canonizar, a árvore de
// Locais abre um município "Niteroi" ao lado do "Niterói" das estações e a
// planta externa some da navegação. Mesmo mapa de load-estacoes-netwin.mjs.
const CITY_CANON = {
  NITEROI: 'Niterói',
  'SAO GONCALO': 'São Gonçalo',
};

const canonCity = (raw) => {
  const v = String(raw ?? '').trim();
  return CITY_CANON[v.toUpperCase()] ?? titleCase(v);
};

// Limites de sanidade para o RJ — pega coordenada que o parser não recuperou.
const LAT_RANGE = [-23.5, -20.5];
const LNG_RANGE = [-44.5, -42.5];

// --------------------------------------------------------------- parsing -----

// Mesma corrupção do export de estações: o separador decimal virou ponto de
// milhar ("-430.854.658" = -43.0854658; "-228.786.157" = -22.8786157). O valor
// real tem 2 dígitos inteiros nesta região, então recoloca-se a vírgula ali.
function parseCoord(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const neg = s.startsWith('-');
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 3) return null;
  const value = Number(`${digits.slice(0, 2)}.${digits.slice(2)}`);
  if (!Number.isFinite(value)) return null;
  return neg ? -value : value;
}

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/;

function titleCase(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word, i) => {
      if (ROMAN.test(word)) return word.toUpperCase();
      if (i > 0 && CONNECTORS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// "RUA PARDAL JUNIOR, 87, CASA 2, FUNDOS, FONSECA, NITEROI - RJ 24130260"
// O número de campos varia (complemento é opcional e pode ter várias partes),
// então lê-se pelas pontas: cidade/UF/CEP no fim, bairro logo antes.
function parseEndereco(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const tail = parts[parts.length - 1];
  const postcode = (tail.match(/(\d{8})\s*$/) || [])[1];
  const cityUf = tail.replace(/\d{8}\s*$/, '').trim();
  const [cityRaw, ufRaw] = cityUf.split(/\s*-\s*/);

  return {
    street: titleCase(parts[0]),
    streetNr: parts.length > 1 ? normalizeNr(parts[1]) : null,
    locality: parts.length > 2 ? titleCase(parts[parts.length - 2]) : null,
    city: canonCity(cityRaw || ''),
    uf: (ufRaw || '').trim().toUpperCase() || null,
    postcode: postcode ?? null,
  };
}

function normalizeNr(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return v;
  if (v.toUpperCase() === 'SN' || v.toUpperCase() === 'S/N') return 'S/N';
  return v;
}

function readCsv(path) {
  // latin-1: decodificar como UTF-8 estraga todo acento ("ICARAÍ", "Em Serviço").
  const text = new TextDecoder('latin1').decode(readFileSync(path));
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

// Sigla da estação: "FONSECA (FSA)" → "FSA". É o que liga o recurso ao site já
// carregado por load-estacoes-netwin.mjs, cujo nome é "Fonseca (FSA)".
const siglaOf = (estacao) => (String(estacao ?? '').match(/\(([^)]+)\)\s*$/) || [])[1] ?? null;

// ----------------------------------------------------------------- model -----

function buildModel(rows) {
  const problems = [];
  const boxes = new Map(); // chave natural -> caixa
  const splitters = [];

  for (const [i, row] of rows.entries()) {
    const linha = i + 2; // +1 cabeçalho, +1 base-1
    const sigla = siglaOf(row.ESTACAO);
    const lat = parseCoord(row.LAT);
    const lng = parseCoord(row.LONG);
    const tipo = row.Tipo2 || 'Indefinido';

    if (!sigla) {
      problems.push(`linha ${linha}: ESTACAO sem sigla (${row.ESTACAO})`);
      continue;
    }
    if (lat === null || lng === null) {
      problems.push(`linha ${linha}: coordenada ilegível (${row.LAT} / ${row.LONG})`);
      continue;
    }
    if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1] || lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) {
      problems.push(`linha ${linha}: coordenada fora do RJ (${lat}, ${lng})`);
      continue;
    }

    // A coordenada crua entra na chave (não a convertida) para que a ligação
    // splitter→caixa case exatamente como está na origem.
    const coordKey = `${row.LAT}|${row.LONG}`;

    if (tipo === 'SPLITTER') {
      splitters.push({
        row,
        sigla,
        lat,
        lng,
        coordKey,
        boxKey: `${sigla}|${row.CODIGO_EQUIPAMENTO}|${coordKey}`,
        nome: row.NOME_EQUIPAMENTO,
      });
      continue;
    }

    const key = `${sigla}|${row.NOME_EQUIPAMENTO}|${coordKey}`;
    if (boxes.has(key)) {
      problems.push(`linha ${linha}: caixa duplicada na origem (${key})`);
      continue;
    }
    boxes.set(key, {
      key,
      row,
      sigla,
      lat,
      lng,
      tipo: BOX_TYPES.has(tipo) ? tipo : 'Indefinido',
      nome: row.NOME_EQUIPAMENTO,
      endereco: parseEndereco(row['Endereço']),
    });
  }

  // Cada splitter tem de cair numa caixa existente; órfão vira problema, não
  // recurso solto — sem a caixa ele não tem lugar no mapa nem no grafo.
  const orphans = [];
  for (const s of splitters) {
    s.box = boxes.get(s.boxKey);
    if (!s.box) orphans.push(s);
  }

  return { boxes: [...boxes.values()], splitters, orphans, problems };
}

// Nome de exibição único. "CDOE-311" se repete entre estações, então qualifica-se
// com a sigla; e quando repete DENTRO da estação (2 casos em Icaraí) recebe um
// ordinal estável, derivado da ordem da coordenada — determinístico entre runs.
function assignDisplayNames(boxes) {
  const byLabel = new Map();
  for (const b of boxes) {
    const label = `${b.nome} (${b.sigla})`;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(b);
  }
  for (const [label, group] of byLabel) {
    if (group.length === 1) {
      group[0].displayName = label;
      continue;
    }
    group.sort((a, b) => a.key.localeCompare(b.key));
    group.forEach((b, i) => (b.displayName = i === 0 ? label : `${label} #${i + 1}`));
  }
}

// --------------------------------------------------------------- inserts -----

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// INSERT multi-linha parametrizado, em blocos que respeitam o teto de
// parâmetros do Postgres (65535 por statement).
async function bulkInsert(client, table, columns, rows, { onConflict = '' } = {}) {
  if (rows.length === 0) return 0;
  const perStatement = Math.max(1, Math.floor(60000 / columns.length));
  let total = 0;
  for (const block of chunk(rows, Math.min(perStatement, 500))) {
    const values = [];
    const tuples = block.map((row, r) => {
      const ph = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      values.push(...columns.map((col) => row[col] ?? null));
      return `(${ph.join(', ')})`;
    });
    const sql =
      `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) ` +
      `VALUES ${tuples.join(', ')} ${onConflict}`;
    const res = await client.query(sql, values);
    total += res.rowCount ?? 0;
  }
  return total;
}

// `servingSite` é a estação que atende o recurso. Planta externa fica na rua e
// tem `place` próprio (a Location do ponto), então sem esta characteristic nada
// liga o CDOE à sua estação — e é ela que a árvore de navegação do Geo expande.
// A coluna `serving_site_id` abaixo é o espelho indexado dessa verdade.
const originChars = (naturalKey, entity, extra, servingSiteId) => [
  { name: 'seed', value: SEED_TAG, valueType: 'string' },
  ...(servingSiteId ? [{ name: 'servingSite', value: servingSiteId, valueType: 'string' }] : []),
  { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
  { group: '_origin', name: 'id', value: naturalKey, valueType: 'string' },
  { group: '_origin', name: 'entity', value: entity, valueType: 'string' },
  { group: '_origin', name: 'migratedAt', value: MIGRATED_AT, valueType: 'date' },
  { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
  { group: '_origin', name: 'extra', valueType: 'json', value: extra },
];

// ------------------------------------------------------------------ main -----

async function main() {
  if (!DB_URL) throw new Error('DATABASE_URL_DEV (ou DATABASE_URL) não definido no .env');

  const rows = readCsv(CSV_PATH);
  const { boxes, splitters, orphans, problems } = buildModel(rows);
  assignDisplayNames(boxes);

  console.log(`Origem : ${CSV_PATH}`);
  console.log(`Linhas : ${rows.length}  →  caixas ${boxes.length} · splitters ${splitters.length}`);
  if (problems.length) {
    console.log(`\n⚠ ${problems.length} linha(s) descartada(s):`);
    for (const p of problems.slice(0, 10)) console.log('   ', p);
    if (problems.length > 10) console.log(`    ... +${problems.length - 10}`);
  }
  if (orphans.length) {
    console.log(`\n⚠ ${orphans.length} splitter(s) sem caixa correspondente — não serão carregados.`);
    for (const o of orphans.slice(0, 5)) console.log('   ', o.boxKey, '/', o.nome);
  }

  const pool = new pg.Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  const client = await pool.connect();

  try {
    // ---- estado atual (índices de idempotência) ----
    const { rows: siteRows } = await client.query(
      `SELECT id, name FROM tmf_geographic_site WHERE status <> 'terminated'`,
    );
    const siteBySigla = new Map();
    for (const s of siteRows) {
      const sg = siglaOf(s.name);
      if (sg && !siteBySigla.has(sg)) siteBySigla.set(sg, s.id);
    }

    const siglas = [...new Set(boxes.map((b) => b.sigla))];
    const semSite = siglas.filter((s) => !siteBySigla.has(s));
    if (semSite.length) {
      throw new Error(
        `estação não encontrada na base para a(s) sigla(s): ${semSite.join(', ')} — rode load-estacoes-netwin.mjs antes`,
      );
    }

    const { rows: specRows } = await client.query(
      `SELECT id, name FROM tmf_resource_specification`,
    );
    const specByName = new Map(specRows.map((r) => [r.name, r.id]));

    // Índice do que já foi carregado, pela chave natural em _origin.id.
    const { rows: existingRows } = await client.query(
      `SELECT id, characteristics FROM tmf_physical_resource WHERE characteristics LIKE '%"Netwin"%'`,
    );
    const idByNaturalKey = new Map();
    for (const r of existingRows) {
      let chars;
      try {
        chars = JSON.parse(r.characteristics || '[]');
      } catch {
        continue;
      }
      const k = chars.find((c) => c.group === '_origin' && c.name === 'id')?.value;
      if (typeof k === 'string') idByNaturalKey.set(k, r.id);
    }

    const novasCaixas = boxes.filter((b) => !idByNaturalKey.has(b.key));
    const splittersValidos = splitters.filter((s) => s.box);
    const novosSplitters = splittersValidos.filter(
      (s) => !idByNaturalKey.has(`${s.boxKey}|${s.nome}`),
    );

    console.log('\nEstado da base:');
    console.log(`  estações resolvidas : ${siglas.length}/${siglas.length}`);
    console.log(`  já carregados       : ${idByNaturalKey.size}`);
    console.log('\nA criar:');
    console.log(`  ResourceSpecification : ${[...new Set(boxes.map((b) => b.tipo)), 'Splitter'].filter((n) => !specByName.has(n)).length}`);
    console.log(`  GeographicLocation    : ${novasCaixas.length}`);
    console.log(`  GeographicAddress     : ${novasCaixas.filter((b) => b.endereco).length}`);
    console.log(`  PhysicalResource      : ${novasCaixas.length + novosSplitters.length}` +
      ` (${novasCaixas.length} caixas + ${novosSplitters.length} splitters)`);
    console.log(`  Relacionamentos       : ${novosSplitters.length} (containsAsChild)`);

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    // ---- gravação ----
    await client.query('BEGIN');

    // 1. Specs (uma por tipo de caixa + Splitter), reaproveitando as existentes.
    const specIdFor = new Map();
    const novasSpecs = [];
    for (const [name, resourceType] of [
      ...[...new Set(boxes.map((b) => b.tipo))].map((t) => [t, 'CTO']),
      ['Splitter', 'Splitter'],
    ]) {
      if (specByName.has(name)) {
        specIdFor.set(name, specByName.get(name));
        continue;
      }
      const id = randomUUID();
      specIdFor.set(name, id);
      novasSpecs.push({
        id,
        href: `/tmf-api/resourceCatalogManagement/v4/resourceSpecification/${id}`,
        name,
        category: 'Infrastructure.Passive',
        resource_type: resourceType,
        description: `Importado do Netwin — ${name}`,
        characteristics: JSON.stringify([{ name: 'seed', value: SEED_TAG, valueType: 'string' }]),
      });
    }
    await bulkInsert(
      client,
      'tmf_resource_specification',
      ['id', 'href', 'name', 'category', 'resource_type', 'description', 'characteristics'],
      novasSpecs,
    );

    // 2. Location + Address + recurso de cada caixa.
    const locations = [];
    const addresses = [];
    const boxResources = [];
    for (const b of novasCaixas) {
      const locId = randomUUID();
      b.locationId = locId;
      b.resourceId = randomUUID();
      locations.push({
        id: locId,
        href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${locId}`,
        geometry_type: 'Point',
        geometry: JSON.stringify({ type: 'Point', coordinates: [b.lng, b.lat] }),
        spatial_ref: 'EPSG:4326',
        reference_point: b.displayName,
        characteristics: '[]',
      });
      if (b.endereco) {
        const addrId = randomUUID();
        addresses.push({
          id: addrId,
          href: `/tmf-api/geographicAddressManagement/v4/geographicAddress/${addrId}`,
          street_name: b.endereco.street,
          street_nr: b.endereco.streetNr,
          locality: b.endereco.locality,
          city: b.endereco.city,
          state_or_province: b.endereco.uf,
          country: 'BR',
          postcode: b.endereco.postcode,
          geographic_location_id: locId,
          characteristics: '[]',
        });
      }
      boxResources.push({
        id: b.resourceId,
        href: `/tmf-api/resourceInventoryManagement/v4/resource/${b.resourceId}`,
        name: b.displayName,
        resource_specification_id: specIdFor.get(b.tipo),
        resource_type: 'CTO',
        status: STATUS_MAP[b.row.STATUS] ?? 'active',
        // `place_id`/`place_type` são as colunas que o repositório de recursos
        // realmente lê (vêm de migration); `geographic_location_id` é a coluna
        // original e continua preenchida pelo índice/FK de geo. Gravar só a
        // segunda deixa o recurso sem lugar no mapa e na árvore de Locais.
        place_id: locId,
        place_type: 'GeographicLocation',
        geographic_location_id: locId,
        serving_site_id: siteBySigla.get(b.sigla) ?? null,
        manufacturer: b.row.FABRICANTE || null,
        model: b.row.MODELO || null,
        characteristics: JSON.stringify(
          originChars(b.key, 'Equipamento', {
            estacao: b.row.ESTACAO,
            sigla: b.sigla,
            tipo: b.tipo,
            codigoPonto: b.row.CODIGO_EQUIPAMENTO,
            tipoOrigem: b.row.TIPO,
            statusOrigem: b.row.STATUS,
            grupoOperacional: b.row.ds_grupo_operacional,
            estadoControle: b.row.ds_estado_controle,
            dataEstadoControle: b.row.dt_data_estado_controle,
            bairro: b.endereco?.locality ?? null,
          }, siteBySigla.get(b.sigla)),
        ),
      });
    }

    await bulkInsert(
      client,
      'tmf_geographic_location',
      ['id', 'href', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
      locations,
    );
    await bulkInsert(
      client,
      'tmf_geographic_address',
      ['id', 'href', 'street_name', 'street_nr', 'locality', 'city', 'state_or_province',
       'country', 'postcode', 'geographic_location_id', 'characteristics'],
      addresses,
    );
    const boxCols = ['id', 'href', 'name', 'resource_specification_id', 'resource_type', 'status',
      'place_id', 'place_type', 'geographic_location_id', 'serving_site_id', 'manufacturer', 'model', 'characteristics'];
    await bulkInsert(client, 'tmf_physical_resource', boxCols, boxResources);

    // 3. Splitters — reaproveitam a Location da caixa (mesmo ponto físico).
    const boxIdByKey = new Map(novasCaixas.map((b) => [b.key, b]));
    const splitterResources = [];
    const relationships = [];
    for (const s of novosSplitters) {
      const caixa = boxIdByKey.get(s.boxKey);
      const caixaId = caixa?.resourceId ?? idByNaturalKey.get(s.boxKey);
      if (!caixaId) continue;
      const id = randomUUID();
      const naturalKey = `${s.boxKey}|${s.nome}`;
      splitterResources.push({
        id,
        href: `/tmf-api/resourceInventoryManagement/v4/resource/${id}`,
        name: `${caixa?.displayName ?? s.box.displayName} · ${s.nome}`,
        resource_specification_id: specIdFor.get('Splitter'),
        resource_type: 'Splitter',
        status: STATUS_MAP[s.row.STATUS] ?? 'active',
        place_id: caixa?.locationId ?? null,
        place_type: caixa?.locationId ? 'GeographicLocation' : null,
        geographic_location_id: caixa?.locationId ?? null,
        serving_site_id: siteBySigla.get(s.sigla) ?? null,
        manufacturer: s.row.FABRICANTE || null,
        model: s.row.MODELO || null,
        characteristics: JSON.stringify(
          originChars(naturalKey, 'Equipamento', {
            estacao: s.row.ESTACAO,
            sigla: s.sigla,
            tipo: 'SPLITTER',
            caixa: s.row.CODIGO_EQUIPAMENTO,
            tipoOrigem: s.row.TIPO,
            statusOrigem: s.row.STATUS,
            grupoOperacional: s.row.ds_grupo_operacional,
            estadoControle: s.row.ds_estado_controle,
            dataEstadoControle: s.row.dt_data_estado_controle,
          }, siteBySigla.get(s.sigla)),
        ),
      });
      relationships.push({
        resource_from_id: caixaId,
        resource_to_id: id,
        relationship_type: 'containsAsChild',
      });
    }

    await bulkInsert(client, 'tmf_physical_resource', boxCols, splitterResources);
    await bulkInsert(
      client,
      'tmf_resource_relationship',
      ['resource_from_id', 'resource_to_id', 'relationship_type'],
      relationships,
      { onConflict: 'ON CONFLICT DO NOTHING' },
    );

    // Conferência antes do COMMIT: o que foi inserido tem de bater com o plano.
    const { rows: [check] } = await client.query(
      `SELECT count(*)::int AS n FROM tmf_physical_resource WHERE characteristics LIKE '%"Netwin"%'`,
    );
    const esperado = idByNaturalKey.size + boxResources.length + splitterResources.length;
    if (check.n !== esperado) {
      await client.query('ROLLBACK');
      throw new Error(`conferência falhou: base tem ${check.n} recursos, esperado ${esperado} — ROLLBACK`);
    }

    await client.query('COMMIT');

    console.log('\nGravado:');
    console.log(`  specs           : ${novasSpecs.length}`);
    console.log(`  locations       : ${locations.length}`);
    console.log(`  addresses       : ${addresses.length}`);
    console.log(`  caixas          : ${boxResources.length}`);
    console.log(`  splitters       : ${splitterResources.length}`);
    console.log(`  relacionamentos : ${relationships.length}`);
    console.log(`  total recursos na base: ${check.n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
