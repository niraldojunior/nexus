#!/usr/bin/env node
/**
 * Carga massiva de Projetos de trabalho + GeographicSite + GeographicAddress +
 * GeographicLocation a partir de um CSV, com reuso de tudo que já existe.
 *
 * Layout de origem (definido pelo usuário) — `;`, UTF-8 com BOM, CRLF, aspas
 * RFC 4180 (`""` escapa aspas; um campo entre aspas pode conter `;` e quebra
 * de linha — o arquivo real `legacy-data/onitel.v4.carga.sites.csv` tem os dois
 * casos em SITE_OBS):
 *
 *   PROJETO_NOME; SITE_NOME; SITE_SPECIFICATION; SITE_OBS;
 *   ADDRESS_STREET_TYPE; ADDRESS_STREET_NAME; ADDRESS_STREET_NR; ADDRESS_LOCALITY;
 *   ADDRESS_CITY; ADDRESS_STATE_OR_PROVINCE; ADDRESS_COUNTRY; ADDRESS_POSTCODE;
 *   LOCATION_GEOMETRY_TYPE; LOCATION_GEOMETRY; LOCATION_SPATIAL_REF
 *
 * Modelagem — como isto se encaixa no cânone (ver AGENTS.md §5–§6):
 *
 *   Projeto de trabalho (geo_project, REQ-MOD01-015)
 *     └── GeographicSite (spec de SITE_SPECIFICATION, ex. Installation Point)
 *          ├── GeographicAddress (opcional — se nenhum ADDRESS_* vier preenchido,
 *          │     o site é gravado sem endereço)
 *          └── GeographicLocation (opcional — se LOCATION_GEOMETRY não parsear)
 *
 *   · C2 — local de projeto é sempre GeographicSite, nunca desce a Resource.
 *   · C5 — Nexus gera UUID v7 próprio (`createCanonicalId`); nada do CSV vira
 *     campo hardcoded — o rastro fica em `characteristic` `_origin.*`
 *     (system = nome do projeto/origem, id = SITE_NOME, entity = 'Site').
 *   · C6 — nada é excluído; a carga é idempotente por nome (projeto e site) e
 *     por endereço normalizado (mesmas funções que `listAddresses` usa).
 *
 * Por que SQL direto (`--apply` grava via `scripts/loader-db.mjs`) e não a API:
 *   `POST /v1/geo/projects/:id/sites` (a única rota que teria essa forma) SEMPRE
 *   cria Location+Address+Site novos e exige `geonetAddressId` — não serve para
 *   reuso em massa. E não existe rota para vincular um Site já existente a um
 *   Projeto. Escrever direto no schema, como `load-recursos-netwin.mjs` e
 *   `estacoes_carregar.mjs --fast`, é o único caminho viável para 62 mil linhas
 *   (o backend dev atende requisições em série — ver AGENTS.md §3). Mesmo
 *   trade-off já aceito nesses scripts: não publica evento TMF688 (C7) nem
 *   grava audit log, por ser carga de migração, não mudança operacional.
 *
 * Consequência a saber: um Site vinculado a um Projeto NÃO terminado some da
 * Hierarquia/mapa/busca geral (ver PROJECT_SITE_EXCLUSION_SQL em
 * src/modules/geo/tree-service.ts) — só aparece com o projeto aberto. Depois
 * da carga, os locais só voltam ao inventário geral quando o projeto for
 * terminado (PATCH status 'terminated' cascateia para Active).
 *
 * Uso:
 *   npm run build                                    # obrigatório uma vez
 *   node scripts/sites_carregar.mjs                                    # dry-run
 *   node scripts/sites_carregar.mjs --apply                            # grava
 *   node scripts/sites_carregar.mjs --file <path> [--limit N] [--apply]
 *   node scripts/sites_carregar.mjs --project-status active --tenant default
 *
 * Variáveis de ambiente (lidas também do `.env` na raiz):
 *   DATABASE_URL_DEV (ou DATABASE_URL)  — endpoint -pooler do Neon
 *   DATABASE_PROVIDER                   — 'postgres' (default) | 'oracle'
 *   ORACLE_OBJECT_PREFIX / ORACLE_*     — quando DATABASE_PROVIDER=oracle
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import { createCanonicalId } from '../dist/src/shared/utils/canonical-id.js';
import {
  normalizeAddressText,
  normalizeCountrySearch,
  normalizePostcodeSearch,
  normalizeStreetNumberSearch,
  normalizeStreetSearch,
} from '../dist/src/modules/geo/address-normalization.js';

loadEnv({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CSV = join(__dirname, '..', 'legacy-data', 'onitel.v4.carga.sites.csv');
const MIGRATED_BY = 'sites-carregar';
const CHUNK_SIZE = 2000;
const IN_BATCH_SIZE = 1000; // teto de lista IN(...) portável (Oracle limita a 1000)

const EXPECTED_HEADER = [
  'PROJETO_NOME',
  'SITE_NOME',
  'SITE_SPECIFICATION',
  'SITE_OBS',
  'ADDRESS_STREET_TYPE',
  'ADDRESS_STREET_NAME',
  'ADDRESS_STREET_NR',
  'ADDRESS_LOCALITY',
  'ADDRESS_CITY',
  'ADDRESS_STATE_OR_PROVINCE',
  'ADDRESS_COUNTRY',
  'ADDRESS_POSTCODE',
  'LOCATION_GEOMETRY_TYPE',
  'LOCATION_GEOMETRY',
  'LOCATION_SPATIAL_REF',
];

const VALID_PROJECT_STATUSES = new Set(['planned', 'active', 'suspended', 'terminated']);
const VALID_GEOMETRY_TYPES = new Set(['Point', 'LineString', 'Polygon']);

// ------------------------------------------------------------------- CLI ----

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const CSV_PATH = argOf('--file', DEFAULT_CSV);
const APPLY = args.includes('--apply');
const LIMIT = (() => {
  const raw = argOf('--limit', undefined);
  const n = raw !== undefined ? Number(raw) : undefined;
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();
const TENANT_ID = argOf('--tenant', 'default');
const PROJECT_STATUS = argOf('--project-status', 'planned');
if (!VALID_PROJECT_STATUSES.has(PROJECT_STATUS)) {
  throw new Error(
    `--project-status inválido: '${PROJECT_STATUS}' (use planned|active|suspended|terminated)`,
  );
}

// --------------------------------------------------------------- parsing ----

// Parser CSV com máquina de estados: delimitador `;`, aspas RFC 4180 (`""`
// escapa aspas dentro de um campo entre aspas; um campo entre aspas pode
// conter `;` e quebra de linha). `\r` é sempre descartado — tanto fora de
// aspas (fim de linha CRLF) quanto dentro (normaliza quebra de linha
// embutida em campo entre aspas para `\n` puro).
function parseDelimited(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '\r') continue;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ';') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function parseCsv(text) {
  const rows = parseDelimited(text);
  if (rows.length === 0) throw new Error('arquivo CSV vazio');
  const header = rows[0].map((h) => h.trim());
  const missing = EXPECTED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(`cabeçalho não bate com o layout esperado — faltando: ${missing.join(', ')}`);
  }
  const dataRows = rows.slice(1);
  return dataRows.map((cells, idx) => {
    const record = { __line: idx + 2 };
    header.forEach((h, i) => (record[h] = (cells[i] ?? '').trim()));
    return record;
  });
}

// ---------------------------------------------------------------- helpers ---

const norm = (s) => (s ?? '').trim();
const nameKey = (s) => norm(s).toLowerCase();

function safeParseJson(text) {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const buildStreet = (streetType, streetName) =>
  [norm(streetType), norm(streetName)].filter(Boolean).join(' ');

// Mesma tradução best-effort que a cascata de status de Projeto aplica em
// app.ts (PATCH /v1/geo/projects/:id): terminated libera o local como Active
// (vida própria), os demais mapeiam 1:1 para o vocabulário canônico do Site.
const SITE_STATUS_BY_PROJECT_STATUS = {
  planned: 'Planned',
  active: 'Active',
  suspended: 'InDeactivation',
  terminated: 'Active',
};

function buildAddressKey(input) {
  return [
    normalizeStreetSearch(input.street),
    normalizeStreetNumberSearch(input.streetNr),
    normalizeAddressText(input.city),
    normalizeAddressText(input.stateOrProvince),
    normalizePostcodeSearch(input.postcode),
    normalizeCountrySearch(input.country),
  ].join('|');
}

// Mesma validação de coordenada/forma que `validateGeometry` em
// src/modules/geo/service.ts aplica (não exportada — reimplementada aqui,
// como os demais loaders --fast já fazem ao contornar o service).
function isValidCoordinate(c) {
  return (
    Array.isArray(c) &&
    typeof c[0] === 'number' &&
    typeof c[1] === 'number' &&
    c[0] >= -180 &&
    c[0] <= 180 &&
    c[1] >= -90 &&
    c[1] <= 90
  );
}

function validateGeometryShape(type, geometry) {
  if (!geometry || geometry.type !== type) return false;
  if (type === 'Point') return isValidCoordinate(geometry.coordinates);
  if (type === 'LineString') {
    return (
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2 &&
      geometry.coordinates.every(isValidCoordinate)
    );
  }
  if (type === 'Polygon') {
    const ring = geometry.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 4) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
    return ring.every(isValidCoordinate);
  }
  return false;
}

const GARBAGE_GEOMETRY = new Set(['', '#N/D', '#N/A', '-', 'N/D', 'N/A']);

// Devolve { geometry, spatialRefFixed } ou null (linha sem geometria
// utilizável) — nunca lança, o chamador decide como contabilizar.
function parseLocationInput(row, warn) {
  const typeRaw = norm(row.LOCATION_GEOMETRY_TYPE);
  const geometryRaw = norm(row.LOCATION_GEOMETRY);
  if (!geometryRaw || GARBAGE_GEOMETRY.has(geometryRaw.toUpperCase())) return null;
  if (!VALID_GEOMETRY_TYPES.has(typeRaw)) {
    warn('geometryTypeInvalid');
    return null;
  }
  let geometry;
  try {
    geometry = JSON.parse(geometryRaw);
  } catch {
    warn('geometryInvalid');
    return null;
  }
  if (!validateGeometryShape(typeRaw, geometry)) {
    warn('geometryInvalid');
    return null;
  }
  const spatialRefRaw = norm(row.LOCATION_SPATIAL_REF);
  if (spatialRefRaw && spatialRefRaw !== 'EPSG:4326') warn('spatialRefFixed');
  return { geometryType: typeRaw, geometry, spatialRef: 'EPSG:4326' };
}

function parseAddressInput(row) {
  const streetName = norm(row.ADDRESS_STREET_NAME);
  if (!streetName) return null;
  return {
    street: buildStreet(row.ADDRESS_STREET_TYPE, streetName),
    streetNr: norm(row.ADDRESS_STREET_NR) || undefined,
    locality: norm(row.ADDRESS_LOCALITY) || undefined,
    city: norm(row.ADDRESS_CITY) || undefined,
    stateOrProvince: norm(row.ADDRESS_STATE_OR_PROVINCE) || undefined,
    country: norm(row.ADDRESS_COUNTRY) || 'BR',
    postcode: norm(row.ADDRESS_POSTCODE) || undefined,
  };
}

// ------------------------------------------------------------------- main ---

async function main() {
  const sourceFile = basename(CSV_PATH);
  const text = readFileSync(CSV_PATH, 'utf8');
  let allRows = parseCsv(text);
  if (LIMIT !== undefined) allRows = allRows.slice(0, LIMIT);
  if (allRows.length === 0) throw new Error(`nenhuma linha de dados lida de ${CSV_PATH}`);
  console.log(
    `Lidas ${allRows.length} linha(s) de ${sourceFile}${LIMIT ? ` (--limit ${LIMIT})` : ''}.`,
  );

  const client = await openLoaderDb();
  const isOracle = client.provider === 'oracle';

  try {
    // ---------------------------------------------------------- bootstrap ---

    const { rows: specRows } = await client.query(
      `SELECT id, code, name, lifecycle_status FROM tmf_geographic_site_specification`,
    );
    const specByCode = new Map();
    const specByName = new Map();
    for (const spec of specRows) {
      if (spec.code) specByCode.set(String(spec.code).toUpperCase(), spec);
      specByName.set(nameKey(spec.name), spec);
    }

    const { rows: projectRows } = await client.query(
      `SELECT id, name, status FROM geo_project WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    const projectByName = new Map(projectRows.map((p) => [nameKey(p.name), p]));

    // LEFT JOIN traz a geometria da Location já ligada DIRETO ao site (sem Address) — só
    // assim dá pra saber, numa re-execução, se `plan.locationInput` já bate com o que está
    // gravado (senão todo site sem endereço levaria um UPDATE de Location a cada rodada,
    // mesmo sem nenhuma mudança real).
    const { rows: siteRows } = await client.query(
      `SELECT s.id, s.name, s.site_specification_id, s.note, s.characteristics,
              s.geographic_location_id, s.geographic_address_id, s.status,
              l.geometry_type AS own_location_geometry_type,
              l.geometry AS own_location_geometry,
              l.spatial_ref AS own_location_spatial_ref
         FROM tmf_geographic_site s
         LEFT JOIN tmf_geographic_location l ON l.id = s.geographic_location_id
        WHERE s.tenant_id = $1 AND s.status NOT IN ('Retired', 'terminated')`,
      [TENANT_ID],
    );
    const siteByName = new Map(siteRows.map((s) => [nameKey(s.name), s]));

    const { rows: linkRows } = await client.query(
      `SELECT ps.project_id, ps.site_id, ps.position
         FROM geo_project_site ps
         JOIN geo_project p ON p.id = ps.project_id
        WHERE p.tenant_id = $1`,
      [TENANT_ID],
    );
    // Posição do vínculo é rastreada pela CHAVE do projeto (nome normalizado), não pelo
    // project_id do banco — um projeto novo só ganha id real na fase de gravação, então
    // toda a fase de planejamento (dry-run incluso) precisa de uma chave estável que
    // exista mesmo antes do INSERT em geo_project.
    const projectIdToKey = new Map(projectRows.map((p) => [p.id, nameKey(p.name)]));
    const linkedProjectsBySite = new Map(); // site_id -> Set(project_id)
    const maxPositionByProjectKey = new Map(); // projectKey -> number
    for (const link of linkRows) {
      if (!linkedProjectsBySite.has(link.site_id))
        linkedProjectsBySite.set(link.site_id, new Set());
      linkedProjectsBySite.get(link.site_id).add(link.project_id);
      const key = projectIdToKey.get(link.project_id);
      if (!key) continue;
      const current = maxPositionByProjectKey.get(key) ?? -1;
      if (link.position > current) maxPositionByProjectKey.set(key, link.position);
    }
    const existingLinkPairs = new Set(linkRows.map((l) => `${l.project_id}::${l.site_id}`));

    // Endereços candidatos: só busca no banco as chaves normalizadas que o
    // CSV realmente referencia — o arquivo real tem 62k linhas mas só ~5 com
    // endereço preenchido, então isto é uma consulta pequena mesmo em escala.
    const streetSearchNeeded = new Set();
    for (const row of allRows) {
      const input = parseAddressInput(row);
      if (input) streetSearchNeeded.add(normalizeStreetSearch(input.street));
    }
    const addressIndex = new Map(); // addressKey -> { id, locationId, isNew:false }
    if (streetSearchNeeded.size > 0) {
      const streetSearchCol = isOracle
        ? `LOWER(TRANSLATE(street_name,
             'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
             'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))`
        : 'street_search';
      const streetSearchValues = [...streetSearchNeeded];
      const dbAddressRows = [];
      for (let i = 0; i < streetSearchValues.length; i += IN_BATCH_SIZE) {
        const block = streetSearchValues.slice(i, i + IN_BATCH_SIZE);
        const placeholders = block.map((_, idx) => `$${idx + 2}`).join(', ');
        const { rows } = await client.query(
          `SELECT id, street_name, street_nr, city, state_or_province, postcode, country,
                  geographic_location_id
             FROM tmf_geographic_address
            WHERE tenant_id = $1 AND ${streetSearchCol} IN (${placeholders})`,
          [TENANT_ID, ...block],
        );
        dbAddressRows.push(...rows);
      }
      for (const row of dbAddressRows) {
        const key = buildAddressKey({
          street: row.street_name,
          streetNr: row.street_nr,
          city: row.city,
          stateOrProvince: row.state_or_province,
          postcode: row.postcode,
          country: row.country,
        });
        if (!addressIndex.has(key)) {
          addressIndex.set(key, {
            id: row.id,
            locationId: row.geographic_location_id,
            isNew: false,
          });
        }
      }
    }

    // -------------------------------------------------------- planejamento --

    const warningCounts = new Map();
    const rowErrors = [];
    const addWarning = (key) => warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);

    const projectPlans = new Map(); // nameKey -> { name, id, status, isNew }
    const sitePlans = new Map(); // nameKey -> plan (ver abaixo)
    const siteOrder = []; // ordem de PRIMEIRA aparição, para bater com o CSV

    for (const row of allRows) {
      try {
        const projectNameRaw = norm(row.PROJETO_NOME);
        const siteNameRaw = norm(row.SITE_NOME);
        const specCodeRaw = norm(row.SITE_SPECIFICATION);
        if (!projectNameRaw || !siteNameRaw || !specCodeRaw) {
          rowErrors.push({
            line: row.__line,
            message: 'PROJETO_NOME, SITE_NOME e SITE_SPECIFICATION são obrigatórios',
          });
          continue;
        }

        const spec =
          specByCode.get(specCodeRaw.toUpperCase()) ?? specByName.get(nameKey(specCodeRaw));
        if (!spec || spec.lifecycle_status !== 'Active') {
          rowErrors.push({
            line: row.__line,
            message: `specification '${specCodeRaw}' não encontrada/ativa — rode POST /v1/geo/site-specifications/bootstrap`,
          });
          continue;
        }

        const pKey = nameKey(projectNameRaw);
        let projectPlan = projectPlans.get(pKey);
        if (!projectPlan) {
          const existingProject = projectByName.get(pKey);
          projectPlan = existingProject
            ? {
                name: projectNameRaw,
                id: existingProject.id,
                status: existingProject.status,
                isNew: false,
              }
            : { name: projectNameRaw, id: null, status: PROJECT_STATUS, isNew: true };
          projectPlans.set(pKey, projectPlan);
        }

        const addressInput = parseAddressInput(row);
        const locationInput = parseLocationInput(row, addWarning);
        const note = norm(row.SITE_OBS) || null;

        const sKey = nameKey(siteNameRaw);
        let sitePlan = sitePlans.get(sKey);
        if (!sitePlan) {
          sitePlan = {
            name: siteNameRaw,
            key: sKey,
            projectKey: pKey,
            projectName: projectNameRaw,
            specCode: spec.code ?? specCodeRaw,
            specId: spec.id,
            note,
            addressInput,
            locationInput,
            csvLines: [row.__line],
          };
          sitePlans.set(sKey, sitePlan);
          siteOrder.push(sKey);
        } else {
          if (sitePlan.projectKey !== pKey) {
            addWarning('siteInMultipleProjects');
          } else {
            sitePlan.specCode = spec.code ?? specCodeRaw;
            sitePlan.specId = spec.id;
            sitePlan.note = note;
            if (addressInput) sitePlan.addressInput = addressInput;
            if (locationInput) sitePlan.locationInput = locationInput;
          }
          sitePlan.csvLines.push(row.__line);
        }
      } catch (err) {
        rowErrors.push({ line: row.__line, message: err.message ?? String(err) });
      }
    }

    // ---------------------------------------------- resolução de endereço/local

    const chunks = [];
    let currentChunk = null;
    const ensureChunk = () => {
      if (!currentChunk || currentChunk.siteCount >= CHUNK_SIZE) {
        currentChunk = {
          newLocations: [],
          locationUpdates: [],
          newAddresses: [], // entries do addressIndex, finalizadas antes do flush
          addressLocationUpdates: [],
          newSites: [],
          newHistory: [],
          siteUpdates: [],
          links: [],
          siteCount: 0,
        };
        chunks.push(currentChunk);
      }
      return currentChunk;
    };

    const buildLocationRow = (id, input, referencePoint) => ({
      id,
      href: `/tmf-api/geographicLocationManagement/v4/geographicLocation/${id}`,
      tenant_id: TENANT_ID,
      geometry_type: input.geometryType,
      geometry: JSON.stringify(input.geometry),
      spatial_ref: input.spatialRef,
      reference_point: referencePoint,
      characteristics: '[]',
    });

    const created = { projects: 0, sites: 0, addresses: 0, locations: 0 };
    const updated = { sites: 0, addresses: 0, locations: 0 };
    const reused = { sites: 0, addresses: 0 };
    const linked = { new: 0, alreadyLinked: 0 };

    function resolveAddress(input, chunk) {
      const key = buildAddressKey(input);
      let entry = addressIndex.get(key);
      if (entry) {
        reused.addresses++;
        return entry;
      }
      const id = createCanonicalId();
      // `chunk` fica preso na entrada: se um endereço deduplicado for reusado por um site
      // de um bloco POSTERIOR e esse site for o que traz a geometria (attach de Location),
      // a Location tem de nascer no MESMO bloco/transação do INSERT do Address que a
      // referencia — nunca no bloco do site que apenas reusa o endereço já criado.
      entry = { id, locationId: null, isNew: true, input, chunk };
      addressIndex.set(key, entry);
      chunk.newAddresses.push(entry);
      created.addresses++;
      return entry;
    }

    for (const key of siteOrder) {
      const plan = sitePlans.get(key);
      const projectPlan = projectPlans.get(plan.projectKey);
      const existingSite = siteByName.get(key);
      const chunk = ensureChunk();
      chunk.siteCount++;

      let addressId = existingSite?.geographic_address_id ?? null;
      let locationId = existingSite?.geographic_location_id ?? null;

      if (plan.addressInput) {
        const entry = resolveAddress(plan.addressInput, chunk);
        addressId = entry.id;
        if (entry.locationId) {
          locationId = entry.locationId;
        } else if (plan.locationInput) {
          const locId = createCanonicalId();
          if (entry.isNew) {
            // A Location vai para o bloco ONDE O ADDRESS SERÁ INSERIDO (entry.chunk), não
            // necessariamente o bloco do site atual — ver comentário em resolveAddress.
            entry.locationId = locId; // finalizado no flush, junto com a linha do address
            entry.chunk.newLocations.push(buildLocationRow(locId, plan.locationInput, plan.name));
          } else {
            chunk.addressLocationUpdates.push({ addressId: entry.id, locationId: locId });
            entry.locationId = locId;
            chunk.newLocations.push(buildLocationRow(locId, plan.locationInput, plan.name));
          }
          created.locations++;
          locationId = locId;
        }
      } else if (plan.locationInput) {
        if (existingSite?.geographic_location_id) {
          locationId = existingSite.geographic_location_id;
          const geometryChanged =
            existingSite.own_location_geometry_type !== plan.locationInput.geometryType ||
            existingSite.own_location_spatial_ref !== plan.locationInput.spatialRef ||
            JSON.stringify(safeParseJson(existingSite.own_location_geometry)) !==
              JSON.stringify(plan.locationInput.geometry);
          if (geometryChanged) {
            chunk.locationUpdates.push({
              id: locationId,
              ...plan.locationInput,
              referencePoint: plan.name,
            });
            updated.locations++;
          }
        } else {
          locationId = createCanonicalId();
          chunk.newLocations.push(buildLocationRow(locationId, plan.locationInput, plan.name));
          created.locations++;
        }
      }

      const originCharacteristics = [
        { name: '_origin.system', value: plan.projectName, valueType: 'string' },
        { name: '_origin.id', value: plan.name, valueType: 'string' },
        { name: '_origin.entity', value: 'Site', valueType: 'string' },
        { name: '_origin.migratedAt', value: new Date().toISOString(), valueType: 'date' },
        { name: '_origin.migratedBy', value: MIGRATED_BY, valueType: 'string' },
        {
          name: '_origin.extra',
          valueType: 'json',
          value: { sourceFile, csvLines: plan.csvLines },
        },
      ];

      let siteId;
      if (existingSite) {
        siteId = existingSite.id;
        const charsChanged =
          JSON.stringify(sortedNames(existingSite.characteristics)) !==
          JSON.stringify(sortedNames(JSON.stringify(originCharacteristics)));
        const needsUpdate =
          existingSite.site_specification_id !== plan.specId ||
          (existingSite.note ?? null) !== plan.note ||
          (existingSite.geographic_address_id ?? null) !== addressId ||
          (existingSite.geographic_location_id ?? null) !== locationId ||
          charsChanged;
        if (needsUpdate) {
          chunk.siteUpdates.push({
            id: siteId,
            site_specification_id: plan.specId,
            note: plan.note,
            geographic_address_id: addressId,
            geographic_location_id: locationId,
            characteristics: JSON.stringify(
              mergeOriginExtra(existingSite.characteristics, originCharacteristics),
            ),
          });
          updated.sites++;
        } else {
          reused.sites++;
        }
      } else {
        siteId = createCanonicalId();
        const siteStatus = SITE_STATUS_BY_PROJECT_STATUS[projectPlan.status] ?? 'Planned';
        chunk.newSites.push({
          id: siteId,
          href: `/tmf-api/geographicSiteManagement/v4/geographicSite/${siteId}`,
          tenant_id: TENANT_ID,
          name: plan.name,
          site_specification_id: plan.specId,
          status: siteStatus,
          status_date: new Date().toISOString(),
          geographic_location_id: locationId,
          geographic_address_id: addressId,
          parent_site_id: null,
          related_party: '[]',
          site_addresses: '[]',
          note: plan.note,
          characteristics: JSON.stringify(originCharacteristics),
        });
        chunk.newHistory.push({
          id: createCanonicalId(),
          site_id: siteId,
          tenant_id: TENANT_ID,
          from_status: null,
          to_status: siteStatus,
          status_date: new Date().toISOString(),
          status_reason: null,
          actor_sub: MIGRATED_BY,
          trace_id: createCanonicalId(),
        });
        created.sites++;
      }

      // Vínculo projeto↔site — só cria se o site ainda não estiver ligado a
      // NENHUM projeto, ou já estiver ligado exatamente a este. Ligado a um
      // projeto diferente: mantém como está e avisa (nenhum local troca de
      // dono em silêncio).
      const linkedSet = linkedProjectsBySite.get(siteId);
      if (projectPlan.id && existingLinkPairs.has(`${projectPlan.id}::${siteId}`)) {
        linked.alreadyLinked++;
      } else if (linkedSet && linkedSet.size > 0 && !linkedSet.has(projectPlan.id ?? '')) {
        addWarning('siteLinkedToOtherProject');
      } else {
        const nextPosition = (maxPositionByProjectKey.get(plan.projectKey) ?? -1) + 1;
        maxPositionByProjectKey.set(plan.projectKey, nextPosition);
        chunk.links.push({ projectKey: plan.projectKey, siteId, position: nextPosition });
        linked.new++;
      }
    }

    for (const plan of projectPlans.values()) {
      if (plan.isNew) created.projects++;
    }

    // -------------------------------------------------------------- resumo --

    console.log('\nPlano:');
    console.log(`  projetos novos        : ${created.projects}`);
    console.log(`  sites novos           : ${created.sites}`);
    console.log(`  sites atualizados     : ${updated.sites}`);
    console.log(`  sites sem alteração   : ${reused.sites}`);
    console.log(`  addresses novos       : ${created.addresses}`);
    console.log(`  addresses reusados    : ${reused.addresses}`);
    console.log(`  locations novas       : ${created.locations}`);
    console.log(`  locations atualizadas : ${updated.locations}`);
    console.log(`  vínculos novos        : ${linked.new}`);
    console.log(`  vínculos já existentes: ${linked.alreadyLinked}`);
    if (warningCounts.size > 0) {
      console.log('  avisos:');
      for (const [k, v] of warningCounts) console.log(`    ${k}: ${v}`);
    }
    if (rowErrors.length > 0) {
      console.log(`  linhas com erro: ${rowErrors.length}`);
      for (const e of rowErrors.slice(0, 20)) console.log(`    linha ${e.line}: ${e.message}`);
      if (rowErrors.length > 20) console.log(`    … e mais ${rowErrors.length - 20}`);
    }

    if (!APPLY) {
      console.log('\n— DRY-RUN. Nada foi gravado. Rode com --apply para executar. —');
      return;
    }

    // ---------------------------------------------------------------- grava --

    // Projetos novos primeiro (fora dos chunks — cardinalidade baixa, e os
    // ids precisam existir antes de qualquer vínculo).
    const newProjectRows = [];
    for (const plan of projectPlans.values()) {
      if (!plan.isNew) continue;
      const id = createCanonicalId();
      plan.id = id;
      newProjectRows.push({
        id,
        tenant_id: TENANT_ID,
        name: plan.name,
        description: null,
        icon_data_url: null,
        status: plan.status,
        created_by: MIGRATED_BY,
      });
    }
    if (newProjectRows.length > 0) {
      await client.bulkInsert(
        'geo_project',
        ['id', 'tenant_id', 'name', 'description', 'icon_data_url', 'status', 'created_by'],
        newProjectRows,
      );
    }

    let chunkIdx = 0;
    for (const chunk of chunks) {
      chunkIdx++;
      await client.query('BEGIN');
      try {
        if (chunk.newLocations.length > 0) {
          await client.bulkInsert(
            'tmf_geographic_location',
            [
              'id',
              'href',
              'tenant_id',
              'geometry_type',
              'geometry',
              'spatial_ref',
              'reference_point',
              'characteristics',
            ],
            chunk.newLocations,
          );
        }
        for (const upd of chunk.locationUpdates) {
          await client.query(
            `UPDATE tmf_geographic_location
                SET geometry_type = $2, geometry = $3, spatial_ref = $4, reference_point = $5, updated_at = $6
              WHERE id = $1`,
            [
              upd.id,
              upd.geometryType,
              JSON.stringify(upd.geometry),
              upd.spatialRef,
              upd.referencePoint,
              new Date().toISOString(),
            ],
          );
        }
        if (chunk.newAddresses.length > 0) {
          const addressRows = chunk.newAddresses.map((entry) => {
            const input = entry.input;
            const characteristics = input.locality
              ? [{ name: 'locality', value: input.locality, valueType: 'string' }]
              : [];
            return {
              id: entry.id,
              href: `/tmf-api/geographicAddressManagement/v4/geographicAddress/${entry.id}`,
              tenant_id: TENANT_ID,
              street_type: null,
              street_name: input.street,
              street_search: normalizeStreetSearch(input.street),
              street_nr: input.streetNr ?? null,
              street_nr_search: normalizeStreetNumberSearch(input.streetNr) || null,
              city: input.city ?? null,
              city_search: normalizeAddressText(input.city) || null,
              state_or_province: input.stateOrProvince ?? null,
              postcode: input.postcode ?? null,
              postcode_search: normalizePostcodeSearch(input.postcode) || null,
              country: input.country ?? 'BR',
              geographic_location_id: entry.locationId ?? null,
              characteristics: JSON.stringify(characteristics),
            };
          });
          const columns = isOracle
            ? [
                'id',
                'href',
                'tenant_id',
                'street_type',
                'street_name',
                'street_nr',
                'city',
                'state_or_province',
                'postcode',
                'country',
                'geographic_location_id',
                'characteristics',
              ]
            : [
                'id',
                'href',
                'tenant_id',
                'street_type',
                'street_name',
                'street_search',
                'street_nr',
                'street_nr_search',
                'city',
                'city_search',
                'state_or_province',
                'postcode',
                'postcode_search',
                'country',
                'geographic_location_id',
                'characteristics',
              ];
          await client.bulkInsert('tmf_geographic_address', columns, addressRows);
        }
        for (const upd of chunk.addressLocationUpdates) {
          await client.query(
            `UPDATE tmf_geographic_address SET geographic_location_id = $2, updated_at = $3 WHERE id = $1`,
            [upd.addressId, upd.locationId, new Date().toISOString()],
          );
        }
        if (chunk.newSites.length > 0) {
          await client.bulkInsert(
            'tmf_geographic_site',
            [
              'id',
              'href',
              'tenant_id',
              'name',
              'site_specification_id',
              'status',
              'status_date',
              'geographic_location_id',
              'geographic_address_id',
              'parent_site_id',
              'related_party',
              'site_addresses',
              'note',
              'characteristics',
            ],
            chunk.newSites,
          );
        }
        if (chunk.newHistory.length > 0) {
          await client.bulkInsert(
            'tmf_geographic_site_status_history',
            [
              'id',
              'site_id',
              'tenant_id',
              'from_status',
              'to_status',
              'status_date',
              'status_reason',
              'actor_sub',
              'trace_id',
            ],
            chunk.newHistory,
          );
        }
        for (const upd of chunk.siteUpdates) {
          await client.query(
            `UPDATE tmf_geographic_site
                SET site_specification_id = $2, note = $3, geographic_address_id = $4,
                    geographic_location_id = $5, characteristics = $6, updated_at = $7
              WHERE id = $1`,
            [
              upd.id,
              upd.site_specification_id,
              upd.note,
              upd.geographic_address_id,
              upd.geographic_location_id,
              upd.characteristics,
              new Date().toISOString(),
            ],
          );
        }
        if (chunk.links.length > 0) {
          const linkRowsToInsert = chunk.links.map((l) => ({
            project_id: projectPlans.get(l.projectKey).id,
            site_id: l.siteId,
            position: l.position,
            created_at: new Date().toISOString(),
          }));
          await client.bulkInsert(
            'geo_project_site',
            ['project_id', 'site_id', 'position', 'created_at'],
            linkRowsToInsert,
            { onConflict: 'ON CONFLICT (project_id, site_id) DO NOTHING' },
          );
        }
        await client.query('COMMIT');
        console.log(`  bloco ${chunkIdx}/${chunks.length} gravado (${chunk.siteCount} sites).`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\nGravado com sucesso.');

    // Estatísticas do otimizador ficam presas na contagem de antes da carga (o Oracle de dev
    // chegou a achar que geo_project_site tinha 6 linhas com 62 mil gravadas) — sem isto todo
    // ganho de índice desta carga é anulado pelo CBO escolhendo o plano errado.
    console.log('\nAtualizando estatísticas...');
    for (const table of [
      'tmf_geographic_location',
      'tmf_geographic_address',
      'tmf_geographic_site',
      'tmf_geographic_site_status_history',
      'geo_project',
      'geo_project_site',
    ]) {
      await client.gatherStats(table);
    }
    console.log('Estatísticas atualizadas.');
  } finally {
    await client.close();
  }
}

// `_origin.extra` é o único campo que muda entre execuções (linha do CSV);
// os demais (`system`/`id`/`entity`/`migratedAt`/`migratedBy`) são
// preservados da carga original quando já existem, para não reescrever o
// timestamp de primeira migração a cada re-execução.
function mergeOriginExtra(storedCharacteristicsJson, freshOriginCharacteristics) {
  let stored = [];
  try {
    stored = JSON.parse(storedCharacteristicsJson || '[]');
  } catch {
    stored = [];
  }
  const storedByName = new Map(
    stored.filter((c) => c.name?.startsWith('_origin.')).map((c) => [c.name, c]),
  );
  const nonOrigin = stored.filter((c) => !c.name?.startsWith('_origin.'));
  const merged = freshOriginCharacteristics.map((fresh) => {
    if (fresh.name === '_origin.extra') return fresh;
    const existing = storedByName.get(fresh.name);
    return existing ?? fresh;
  });
  return [...nonOrigin, ...merged];
}

// Compara characteristics ignorando o conteúdo de `_origin.extra` (que muda
// a cada execução por causa de csvLines) — usado só para decidir se um
// UPDATE é necessário além do diff de colunas simples.
function sortedNames(characteristicsJson) {
  try {
    const parsed =
      typeof characteristicsJson === 'string'
        ? JSON.parse(characteristicsJson)
        : characteristicsJson;
    return (parsed ?? [])
      .filter((c) => c.name !== '_origin.extra')
      .map((c) => c.name)
      .sort();
  } catch {
    return [];
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
