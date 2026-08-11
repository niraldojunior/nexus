#!/usr/bin/env node
/**
 * Carga de recursos físicos (planta externa) do Netwin no inventário do Nexus.
 *
 * Layout padrão: `legacy-data/recursos_niteroi.csv` — export do Netwin, `;`,
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
 * Status/substatus (STATUS + ds_estado_controle da origem — ver resolveStatus):
 *   · "Em Serviço" sem controle → active (Ativo), sem substatus;
 *   · qualquer outro caso       → suspended (Bloqueado), com substatus recebendo
 *     o ds_estado_controle (vazio quando a origem não traz nada).
 *   O substatus é gravado como characteristic de topo (C1) e é o que o painel
 *   do Geo exibe.
 *
 * Recursos sem estação: linhas cuja ESTACAO veio vazia (o conversor as rotula
 *   "SEM ESTAÇÃO (SEM)") NÃO são descartadas. O site sentinela é criado sob
 *   demanda e vira o nó agrupador na árvore; splitters órfãos (sem caixa) entram
 *   como recurso avulso, com Location própria. Nenhum recurso fica de fora.
 *
 * TRUNCATE: por padrão a carga zera as tabelas de recurso antes de gravar
 *   (tmf_physical_resource, tmf_logical_resource e as duas de relationship —
 *   não toca no catálogo de specs nem nas tabelas de Geo). Use --no-truncate
 *   para a carga incremental idempotente antiga (pela chave natural em _origin).
 *
 * Uso:
 *   node scripts/load-recursos-netwin.mjs                  # dry-run (padrão)
 *   node scripts/load-recursos-netwin.mjs --apply          # zera + grava
 *   node scripts/load-recursos-netwin.mjs --apply --no-truncate   # incremental
 *   node scripts/load-recursos-netwin.mjs --file outro.csv --apply
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CSV_PATH = argOf('--file', 'legacy-data/recursos_niteroi.csv');
const APPLY = has('--apply');
// Toda carga zera as tabelas de recurso antes de gravar (autorizado pelo
// usuário) — é o comportamento padrão. `--no-truncate` desativa para uma carga
// incremental idempotente (o modo antigo, pela chave natural em _origin.id).
const TRUNCATE = !has('--no-truncate');

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'load-recursos-netwin';
const SEED_TAG = 'recursos-netwin';

// Nó agrupador para recursos cuja ESTACAO veio vazia na origem (o conversor os
// rotula "SEM ESTAÇÃO (SEM)"). O site é criado sob demanda para que NENHUM
// recurso deixe de ser carregado por falta de estação. `siglaOf` extrai "SEM".
const ORPHAN_SIGLA = 'SEM';
const ORPHAN_SITE_NAME = 'SEM ESTAÇÃO (SEM)';

// Tipos de caixa (agrupadores). Tudo que não é SPLITTER é caixa.
const BOX_TYPES = new Set(['CDOE', 'CDOI', 'CEO', 'CEOS', 'Indefinido']);

// Tabelas de recurso zeradas antes de cada carga (autorizado pelo usuário). NÃO
// inclui o catálogo (tmf_resource_specification) — é compartilhado e a carga o
// reusa — nem as tabelas de Geo (Location/Address), que são responsabilidade do
// truncate-geo-sites.mjs. As quatro entram num único TRUNCATE: o Postgres
// resolve as FKs entre elas (logical→physical, relationship→physical) e nenhuma
// outra tabela referencia recurso por FK, então não precisa de CASCADE.
const RESOURCE_TABLES = [
  'tmf_resource_relationship',
  'tmf_resource_relationship_generic',
  'tmf_logical_resource',
  'tmf_physical_resource',
];

// ------------------------------------------------------------ status/substatus

// Normaliza SÓ para comparar o STATUS de origem: tira acento, baixa a caixa e
// colapsa espaço. Robusto a "Em Serviço" / "Em servico" / bytes mal decodados —
// o \ufffd (caractere de substituição de um decode ruim) é descartado antes.
const foldStatus = (raw) =>
  String(raw ?? '')
    .replace(/\ufffd/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Limpa um texto que será GRAVADO (substatus e afins) preservando acento:
// descarta o \ufffd de decode ruim, troca controles (que quebrariam JSON/UI) por
// espaço e colapsa espaços. Devolve '' quando não sobra nada.
const cleanText = (raw) =>
  String(raw ?? '')
    .replace(/\ufffd/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Regra de status/substatus a partir de STATUS + ds_estado_controle do Netwin
// (o campo que o usuário chama de "ds_status_controle" — é o único de controle):
//   · "Em Serviço" sem controle            → active (Ativo), sem substatus
//   · "Em Serviço" com controle            → suspended (Bloqueado) + substatus
//   · "Fora de Serviço" (com/sem controle) → suspended (Bloqueado), substatus = controle
//   · "Bloqueado"      (com/sem controle)  → suspended (Bloqueado), substatus = controle
// Ou seja: só "Em Serviço" limpo fica Ativo; todo o resto é Bloqueado, e o
// substatus recebe o ds_estado_controle (vazio quando a origem não traz nada).
// 'suspended' é o status canônico do inventário rotulado "Suspenso"/"Bloqueado".
function resolveStatus(statusRaw, controleRaw) {
  const substatus = cleanText(controleRaw);
  if (foldStatus(statusRaw) === 'em servico' && !substatus) {
    return { status: 'active', substatus: '' };
  }
  return { status: 'suspended', substatus };
}

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
// Caixa do estado inteiro (extração RJ real: LAT -23.22..-21.70, LNG -44.72..-41.28).
// A faixa antiga [-23.5,-20.5]/[-44.5,-42.5] era calibrada para Niterói e descartava
// ~12% dos pontos numa carga estadual (Região dos Lagos, Norte Fluminense, oeste).
const LAT_RANGE = [-23.5, -20.7];
const LNG_RANGE = [-45.0, -40.9];

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

// Sigla PRIMÁRIA para vincular o recurso. ~0,04% das linhas são caixas entre
// duas estações (CEO de enlace), com a estação-par embutida: "COLEGIO,IRAJA I
// (COL,IRJ)". Usa-se a 1ª sigla ("COL") — o par completo fica em
// _origin.extra.estacao. Sem isto essas linhas abortariam por "estação não
// encontrada". Nomes de site na base não têm vírgula, então siglaOf(site) é neutro.
const primarySigla = (estacao) => {
  const s = siglaOf(estacao);
  return s ? s.split(',')[0].trim() : s;
};

// ----------------------------------------------------------------- model -----

function buildModel(rows) {
  const problems = [];
  const boxes = new Map(); // chave natural -> caixa
  const splitters = [];

  for (const [i, row] of rows.entries()) {
    const linha = i + 2; // +1 cabeçalho, +1 base-1
    const sigla = primarySigla(row.ESTACAO);
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

// Bulk insert delegated to the provider-aware adapter (Postgres multi-row VALUES; Oracle
// executeMany). The loader keeps its `$N`/`?`-free row objects; the adapter builds the SQL.
async function bulkInsert(client, table, columns, rows, opts = {}) {
  return client.bulkInsert(table, columns, rows, opts);
}

// `servingSite` é a estação que atende o recurso. Planta externa fica na rua e
// tem `place` próprio (a Location do ponto), então sem esta characteristic nada
// liga o CDOE à sua estação — e é ela que a árvore de navegação do Geo expande.
// A coluna `serving_site_id` abaixo é o espelho indexado dessa verdade.
// `substatus` é extensão V.tal (C1) — entra como characteristic de topo (sem
// grupo), só quando há valor; é o que o painel do Geo lê (via tree-service).
const originChars = (naturalKey, entity, extra, servingSiteId, substatus) => [
  { name: 'seed', value: SEED_TAG, valueType: 'string' },
  ...(servingSiteId ? [{ name: 'servingSite', value: servingSiteId, valueType: 'string' }] : []),
  ...(substatus ? [{ name: 'substatus', value: substatus, valueType: 'string' }] : []),
  { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
  { group: '_origin', name: 'id', value: naturalKey, valueType: 'string' },
  { group: '_origin', name: 'entity', value: entity, valueType: 'string' },
  { group: '_origin', name: 'migratedAt', value: MIGRATED_AT, valueType: 'date' },
  { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
  { group: '_origin', name: 'extra', valueType: 'json', value: extra },
];

// ------------------------------------------------------------------ main -----

async function main() {
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
    console.log(`\nℹ ${orphans.length} splitter(s) sem caixa correspondente — carregados como recurso avulso (Location própria, sob o nó da estação/agrupador).`);
    for (const o of orphans.slice(0, 5)) console.log('   ', o.boxKey, '/', o.nome);
  }

  const client = await openLoaderDb();

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
    // A sigla sentinela (recursos sem estação de origem) não precisa existir de
    // antemão: o nó agrupador é criado sob demanda logo abaixo.
    const semSite = siglas.filter((s) => s !== ORPHAN_SIGLA && !siteBySigla.has(s));
    if (semSite.length) {
      throw new Error(
        `estação não encontrada na base para a(s) sigla(s): ${semSite.join(', ')} — rode load-estacoes-netwin.mjs antes`,
      );
    }

    // Nó agrupador "SEM ESTAÇÃO (SEM)": criado sob demanda quando algum recurso
    // (caixa ou splitter órfão) veio sem estação — para nenhum ficar de fora.
    const usaNoOrfao =
      boxes.some((b) => b.sigla === ORPHAN_SIGLA) ||
      orphans.some((s) => s.sigla === ORPHAN_SIGLA);
    let orphanSiteId = siteBySigla.get(ORPHAN_SIGLA) ?? null;
    const criarNoOrfao = usaNoOrfao && !orphanSiteId;
    if (criarNoOrfao) {
      orphanSiteId = randomUUID();
      siteBySigla.set(ORPHAN_SIGLA, orphanSiteId);
    }

    const { rows: specRows } = await client.query(
      `SELECT id, name FROM tmf_resource_specification`,
    );
    const specByName = new Map(specRows.map((r) => [r.name, r.id]));

    // Índice do que já foi carregado, pela chave natural em _origin.id. Com
    // TRUNCATE ligado (padrão) a base de recursos é zerada antes de gravar, então
    // tudo conta como novo e nem consultamos o estado atual — o índice fica vazio.
    const idByNaturalKey = new Map();
    if (!TRUNCATE) {
      const { rows: existingRows } = await client.query(
        `SELECT id, characteristics FROM tmf_physical_resource WHERE characteristics LIKE '%"Netwin"%'`,
      );
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
    }

    const novasCaixas = boxes.filter((b) => !idByNaturalKey.has(b.key));
    const splittersValidos = splitters.filter((s) => s.box);
    const novosSplitters = splittersValidos.filter(
      (s) => !idByNaturalKey.has(`${s.boxKey}|${s.nome}`),
    );
    // Splitters órfãos (sem caixa) — não são descartados: carregam avulsos.
    const novosOrfaos = orphans.filter(
      (s) => !idByNaturalKey.has(`${s.boxKey}|${s.nome}`),
    );

    console.log('\nEstado da base:');
    console.log(`  estações resolvidas : ${siglas.length}/${siglas.length}`);
    console.log(`  já carregados       : ${idByNaturalKey.size}`);
    if (TRUNCATE) {
      console.log(
        `\n⚠ TRUNCATE ligado (padrão): as tabelas de recurso serão zeradas antes da carga —\n` +
        `   ${RESOURCE_TABLES.join(', ')}.\n` +
        `   (catálogo de specs e tabelas de Geo não são tocados; use --no-truncate para carga incremental.)`,
      );
    }
    console.log('\nA criar:');
    console.log(`  GeographicSite (nó órfão): ${criarNoOrfao ? 1 : 0}`);
    console.log(`  ResourceSpecification : ${[...new Set(boxes.map((b) => b.tipo)), 'Splitter'].filter((n) => !specByName.has(n)).length}`);
    console.log(`  GeographicLocation    : ${novasCaixas.length + novosOrfaos.length}  (${novasCaixas.length} caixas + ${novosOrfaos.length} splitters órfãos)`);
    console.log(`  GeographicAddress     : ${novasCaixas.filter((b) => b.endereco).length}`);
    console.log(`  PhysicalResource      : ${novasCaixas.length + novosSplitters.length + novosOrfaos.length}` +
      ` (${novasCaixas.length} caixas + ${novosSplitters.length} splitters + ${novosOrfaos.length} órfãos)`);
    console.log(`  Relacionamentos       : ${novosSplitters.length} (containsAsChild)`);

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Use --apply para executar. —');
      return;
    }

    // ---- gravação ----
    await client.query('BEGIN');

    // 0. Zera as tabelas de recurso (autorizado). Um único statement resolve as
    // FKs internas; RESTART IDENTITY por higiene (não há serial em uso aqui). O
    // catálogo de specs fica de pé — a etapa 1 reusa as specs existentes.
    if (TRUNCATE) {
      await client.query(`TRUNCATE TABLE ${RESOURCE_TABLES.join(', ')} RESTART IDENTITY`);
      console.log(`\nTRUNCATE: ${RESOURCE_TABLES.length} tabelas de recurso zeradas.`);
    }

    // 0b. Nó agrupador para recursos sem estação de origem (criado sob demanda).
    // O TRUNCATE acima não toca em Geo, então o site sobrevive entre execuções e
    // é reusado (idempotente). Reaproveita a site-spec "Estação" do load-estacoes.
    if (criarNoOrfao) {
      const { rows: specSite } = await client.query(
        `SELECT id FROM tmf_geographic_site_specification WHERE name = 'Estação' LIMIT 1`,
      );
      const siteSpecId = specSite[0]?.id;
      if (!siteSpecId) {
        throw new Error(
          "site-specification 'Estação' não encontrada — rode load-estacoes-netwin.mjs antes",
        );
      }
      await client.query(
        `INSERT INTO tmf_geographic_site
           (id, href, tenant_id, name, site_specification_id, status, characteristics)
         VALUES ($1, $2, 'default', $3, $4, 'Active', $5)`,
        [
          orphanSiteId,
          `/tmf-api/geographicSiteManagement/v4/geographicSite/${orphanSiteId}`,
          ORPHAN_SITE_NAME,
          siteSpecId,
          JSON.stringify([
            { name: 'seed', value: SEED_TAG, valueType: 'string' },
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'EstacaoVirtual', valueType: 'string' },
            { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
          ]),
        ],
      );
      console.log(`\nNó agrupador criado: "${ORPHAN_SITE_NAME}".`);
    }

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
      const { status, substatus } = resolveStatus(b.row.STATUS, b.row.ds_estado_controle);
      boxResources.push({
        id: b.resourceId,
        href: `/tmf-api/resourceInventoryManagement/v4/resource/${b.resourceId}`,
        name: b.displayName,
        resource_specification_id: specIdFor.get(b.tipo),
        resource_type: 'CTO',
        status,
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
            statusOrigem: cleanText(b.row.STATUS),
            grupoOperacional: cleanText(b.row.ds_grupo_operacional),
            estadoControle: substatus,
            dataEstadoControle: b.row.dt_data_estado_controle,
            bairro: b.endereco?.locality ?? null,
          }, siteBySigla.get(b.sigla), substatus),
        ),
      });
    }

    // 2b. Splitters órfãos: recurso avulso com Location própria, sob o nó
    // agrupador (ou a própria estação, quando a caixa some mas a sigla existe).
    // Sem caixa não há `containsAsChild` — vira raiz de ramo, como a planta
    // externa que ainda não pende de outro recurso (tree-service).
    const orphanResources = [];
    for (const s of novosOrfaos) {
      const locId = randomUUID();
      const parent = cleanText(s.row.CODIGO_EQUIPAMENTO);
      const display = `${parent ? `${parent} · ` : ''}${s.nome} (${s.sigla})`;
      locations.push({
        id: locId,
        href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${locId}`,
        geometry_type: 'Point',
        geometry: JSON.stringify({ type: 'Point', coordinates: [s.lng, s.lat] }),
        spatial_ref: 'EPSG:4326',
        reference_point: display,
        characteristics: '[]',
      });
      const id = randomUUID();
      const naturalKey = `${s.boxKey}|${s.nome}`;
      const { status, substatus } = resolveStatus(s.row.STATUS, s.row.ds_estado_controle);
      orphanResources.push({
        id,
        href: `/tmf-api/resourceInventoryManagement/v4/resource/${id}`,
        name: display,
        resource_specification_id: specIdFor.get('Splitter'),
        resource_type: 'Splitter',
        status,
        place_id: locId,
        place_type: 'GeographicLocation',
        geographic_location_id: locId,
        serving_site_id: siteBySigla.get(s.sigla) ?? null,
        manufacturer: s.row.FABRICANTE || null,
        model: s.row.MODELO || null,
        characteristics: JSON.stringify(
          originChars(naturalKey, 'Equipamento', {
            estacao: s.row.ESTACAO,
            sigla: s.sigla,
            tipo: 'SPLITTER',
            caixa: s.row.CODIGO_EQUIPAMENTO,
            orfao: true,
            tipoOrigem: s.row.TIPO,
            statusOrigem: cleanText(s.row.STATUS),
            grupoOperacional: cleanText(s.row.ds_grupo_operacional),
            estadoControle: substatus,
            dataEstadoControle: s.row.dt_data_estado_controle,
          }, siteBySigla.get(s.sigla), substatus),
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
      const { status, substatus } = resolveStatus(s.row.STATUS, s.row.ds_estado_controle);
      splitterResources.push({
        id,
        href: `/tmf-api/resourceInventoryManagement/v4/resource/${id}`,
        name: `${caixa?.displayName ?? s.box.displayName} · ${s.nome}`,
        resource_specification_id: specIdFor.get('Splitter'),
        resource_type: 'Splitter',
        status,
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
            statusOrigem: cleanText(s.row.STATUS),
            grupoOperacional: cleanText(s.row.ds_grupo_operacional),
            estadoControle: substatus,
            dataEstadoControle: s.row.dt_data_estado_controle,
          }, siteBySigla.get(s.sigla), substatus),
        ),
      });
      relationships.push({
        resource_from_id: caixaId,
        resource_to_id: id,
        relationship_type: 'containsAsChild',
      });
    }

    await bulkInsert(client, 'tmf_physical_resource', boxCols, splitterResources);
    // Splitters órfãos avulsos (sem relacionamento containsAsChild).
    await bulkInsert(client, 'tmf_physical_resource', boxCols, orphanResources);
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
    const esperado =
      idByNaturalKey.size + boxResources.length + splitterResources.length + orphanResources.length;
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
    console.log(`  splitters órfãos: ${orphanResources.length}  (avulsos, sob o nó agrupador)`);
    console.log(`  relacionamentos : ${relationships.length}`);
    console.log(`  total recursos na base: ${check.n}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
