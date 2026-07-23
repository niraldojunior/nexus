#!/usr/bin/env node
/**
 * Carga de estações do Netwin no inventário Geo do Nexus.
 *
 * Origem: `estacoes_niteroi.csv` (export do Netwin) — estações de Niterói e
 * São Gonçalo/RJ. Cada linha é uma Central Office (Estação). A coluna
 * `DESCRIÇÃO 2` traz os nomes das salas dentro da estação.
 *
 * Modelagem — como isto se encaixa no cânone (ver AGENTS.md §3–§4):
 *
 *   Localidade (Region = bairro)                 GeographicSite category=Region
 *     └── Estação "<Nome> (<Sigla>)"             GeographicSite category=Site  → CO
 *          └── Sala "<nome da sala>"             GeographicSite category=SubSite
 *
 *   · UF/Município saem do endereço da estação (`stateOrProvince`/`city`), como
 *     a árvore de Locais deriva (web/src/utils/geoHierarchy.ts). O bairro vira
 *     uma Region ancestral para preencher o nível "Localidade" com dado real.
 *   · C2 — a estação e suas salas são hierarquia de GeographicSite (acima do
 *     rack). Rack/OLT para dentro seriam Resource, fora do escopo desta carga.
 *   · C5 — o Nexus gera UUID próprio; os identificadores do Netwin (sigla, ID
 *     Localidade, datas) ficam em `characteristic` somente-leitura no grupo
 *     `_origin`. Nada de campo hardcoded.
 *   · C6 — nada é excluído; a carga é idempotente por nome e só cria o que falta.
 *
 * Idempotente: identifica Region/Estação por nome global e Sala por
 * (estação-pai + nome). Re-executar não duplica.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/load-estacoes-netwin.mjs
 *   node scripts/load-estacoes-netwin.mjs --file "caminho/estacoes.csv"
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

import { readFileSync } from 'node:fs';

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const SEED_TAG = 'estacoes-netwin';

const DEFAULT_CSV =
  'C:/Users/VT158145/OneDrive - V.tal/Estudos/NEXUS/estacoes_niteroi.csv';

const fileArgIdx = process.argv.indexOf('--file');
const CSV_PATH = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : DEFAULT_CSV;

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'load-estacoes-netwin';

// Municípios que já existem na base com acento — mapeados para não abrir um
// bucket "Niteroi" ao lado de "Niterói" na árvore de Locais.
const CITY_CANON = {
  NITEROI: 'Niterói',
  'SAO GONCALO': 'São Gonçalo',
};

// ------------------------------------------------------------------- infra ---

async function api(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const tag = () => ({ name: 'seed', value: SEED_TAG, valueType: 'string' });

// --------------------------------------------------------------- parsing -----

// Coordenadas do CSV vêm com os pontos de milhar embaralhados no lugar do
// separador decimal (ex.: "-430.021.976", "-2.294.816"). O valor real tem
// sempre 2 dígitos inteiros (lat ~22, lng ~43 nesta região): tira o sinal e os
// pontos, e recoloca a vírgula depois do 2º dígito.
function parseCoord(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const neg = s.startsWith('-');
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length < 3) return null;
  const value = Number(`${digits.slice(0, 2)}.${digits.slice(2)}`);
  return Number.isFinite(value) ? (neg ? -value : value) : null;
}

// O export do Netwin traz resíduo de duplo-encoding em alguns nomes de sala
// ("4Âº ANDAR"): o byte 0xC2 do UTF-8 de "º"/"ª"/"°" sobrou como "Â" literal.
// Sem isto o rótulo chega torto na árvore de Locais.
function fixMojibake(raw) {
  return String(raw ?? '')
    .replace(/Â(?=[º°ª])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/;

// Title Case preservando acentos já presentes na origem; conectores em
// minúscula e numeral romano em maiúscula. Não inventa acento que não veio.
function titleCase(raw) {
  return fixMojibake(raw)
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (ROMAN.test(word)) return word.toUpperCase();
      if (i > 0 && CONNECTORS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// "RUA JOAO CAETANO, 56, ALCANTARA, SAO GONCALO - RJ 24710405"
//   → { street, streetNr, bairro, postcode }
function parseEndereco(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const street = parts[0] ? titleCase(parts[0]) : '';
  const rawNr = parts[1] ?? '';
  const streetNr = /^\d+$/.test(rawNr) ? rawNr : rawNr.toUpperCase() === 'SN' ? 'S/N' : rawNr;
  const bairro = parts[2] ? titleCase(parts[2]) : '';
  const tail = parts[3] ?? '';
  const postcode = (tail.match(/(\d{8})\s*$/) || [])[1];
  return { street, streetNr, bairro, postcode };
}

// DESCRIÇÃO 2 é uma lista de salas separada por vírgula. Normaliza espaços e
// remove entradas vazias/duplicadas preservando a ordem.
function parseSalas(raw) {
  const seen = new Set();
  const out = [];
  for (const item of String(raw ?? '').split(',')) {
    const name = fixMojibake(item);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Leitor de CSV com `;` e BOM, tolerante a CRLF. As linhas desta base não têm
// campo com `;` interno nem aspas, então um split direto basta.
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

// --------------------------------------------------------------- índices -----

const siteSpecByName = new Map();
const siteByName = new Map(); // Region + Estação (nomes globais únicos)
const childByKey = new Map(); // `${parentId}::${name}` -> Sala existente

const created = { specs: 0, regions: 0, locations: 0, addresses: 0, estacoes: 0, salas: 0 };
const reused = { regions: 0, estacoes: 0, salas: 0 };

async function bootstrap() {
  const [specs, sites] = await Promise.all([
    api('GET', '/v1/geo/site-specifications'),
    api('GET', '/v1/geo/sites'),
  ]);
  for (const spec of specs ?? []) if (spec?.name) siteSpecByName.set(spec.name, spec.id);
  // Region e Estação têm nome global único → resolvidos por `siteByName`.
  // Estação é filha de Region, então também aparece com parentSite; por isso
  // indexamos por nome INDEPENDENTE de ter pai (senão a Estação cairia só no
  // índice de filhos e uma re-execução a recriaria). Salas repetem nome entre
  // estações ("Datacom"), então são resolvidas por (estação-pai + nome).
  for (const site of sites ?? []) {
    if (!site?.name || site.status === 'terminated') continue;
    if (!siteByName.has(site.name)) siteByName.set(site.name, site.id);
    if (site.parentSite?.id) childByKey.set(`${site.parentSite.id}::${site.name}`, site.id);
  }
}

// -------------------------------------------------------------- ensure -------

async function ensureSpec(name, category) {
  const found = siteSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/v1/geo/site-specifications', { name, category });
  siteSpecByName.set(name, spec.id);
  created.specs++;
  return spec.id;
}

async function ensureRegion({ name, specId }) {
  const found = siteByName.get(name);
  if (found) {
    reused.regions++;
    return found;
  }
  const site = await api('POST', '/v1/geo/sites', {
    name,
    siteSpecificationId: specId,
    status: 'active',
    characteristic: [tag()],
  });
  siteByName.set(name, site.id);
  created.regions++;
  return site.id;
}

async function createPoint(coord, referencePoint) {
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
    spatialRef: 'EPSG:4326',
    ...(referencePoint ? { referencePoint } : {}),
  });
  created.locations++;
  return location.id;
}

async function createAddress({ street, streetNr, city, uf, postcode, locationId }) {
  const address = await api('POST', '/v1/geo/addresses', {
    street,
    ...(streetNr ? { streetNr } : {}),
    city,
    stateOrProvince: uf,
    ...(postcode ? { postcode } : {}),
    country: 'BR',
    ...(locationId ? { geographicLocationId: locationId } : {}),
  });
  created.addresses++;
  return address.id;
}

async function ensureEstacao({ name, specId, coord, address, parentSiteId, characteristic }) {
  const found = siteByName.get(name);
  if (found) {
    reused.estacoes++;
    return found;
  }
  const payload = { name, siteSpecificationId: specId, status: 'active', parentSiteId, characteristic };
  if (coord) {
    const locationId = await createPoint(coord, name);
    payload.placeId = locationId;
    payload.addressId = await createAddress({ ...address, locationId });
  }
  const site = await api('POST', '/v1/geo/sites', payload);
  siteByName.set(name, site.id);
  created.estacoes++;
  return site.id;
}

async function ensureSala({ name, specId, parentSiteId }) {
  const key = `${parentSiteId}::${name}`;
  const found = childByKey.get(key);
  if (found) {
    reused.salas++;
    return found;
  }
  const site = await api('POST', '/v1/geo/sites', {
    name,
    siteSpecificationId: specId,
    status: 'active',
    parentSiteId,
    characteristic: [tag()],
  });
  childByKey.set(key, site.id);
  created.salas++;
  return site.id;
}

// ---------------------------------------------------------------- main -------

async function main() {
  const text = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`nenhuma linha lida de ${CSV_PATH}`);

  await bootstrap();

  const specRegion = await ensureSpec('Localidade', 'Region');
  const specEstacao = await ensureSpec('Estação', 'Site');
  const specSala = await ensureSpec('Sala', 'SubSite');

  for (const row of rows) {
    const uf = row['UF'] || 'RJ';
    const municipioRaw = row['MUNICIPIO'] || '';
    const municipio = CITY_CANON[municipioRaw.toUpperCase()] ?? titleCase(municipioRaw);

    const sigla = row['SIGLA ESTAÇÃO'] || row['SIGLA ESTACAO'] || '';
    const nome = titleCase(row['NOME DA ESTAÇÃO'] || row['NOME DA ESTACAO'] || sigla);
    const estacaoName = sigla ? `${nome} (${sigla})` : nome;

    const coord = [parseCoord(row['LONGITUDE ESTAÇÃO']), parseCoord(row['LATITUDE ESTAÇÃO'])];
    const hasCoord = coord[0] != null && coord[1] != null;

    const endereco = parseEndereco(row['ENDEREÇO ESTAÇÃO'] || row['ENDERECO ESTACAO']);
    const bairro = endereco.bairro || municipio;

    const salas = parseSalas(row['DESCRIÇÃO 2'] || row['DESCRICAO 2']);

    // Localidade = bairro, como Region ancestral que preenche o nível na árvore.
    const regionId = await ensureRegion({ name: bairro, specId: specRegion });

    // _origin (C5): identificadores do Netwin, somente-leitura.
    const characteristic = [
      tag(),
      { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
      { group: '_origin', name: 'id', value: row['ID LOCALIDADE'] || '', valueType: 'string' },
      { group: '_origin', name: 'entity', value: 'Estacao', valueType: 'string' },
      { group: '_origin', name: 'migratedAt', value: MIGRATED_AT, valueType: 'date' },
      { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
      {
        group: '_origin',
        name: 'extra',
        valueType: 'json',
        value: {
          sigla,
          localidade: row['LOCALIDADE'] || '',
          estado: row['ESTADO DA ESTAÇÃO'] || '',
          bairro,
          dataAtivacao: row['DATA ATIVACAO ESTACAO'] || '',
          dataUltimaAlteracao: row['DATA ULTIMA ALTERAÇÃO ESTAÇÃO'] || '',
          salasDeclaradas: salas.length,
        },
      },
    ];

    const estacaoId = await ensureEstacao({
      name: estacaoName,
      specId: specEstacao,
      coord: hasCoord ? coord : undefined,
      address: {
        street: endereco.street,
        streetNr: endereco.streetNr,
        city: municipio,
        uf,
        postcode: endereco.postcode,
      },
      parentSiteId: regionId,
      characteristic,
    });

    for (const sala of salas) {
      await ensureSala({ name: sala, specId: specSala, parentSiteId: estacaoId });
    }

    const flag = hasCoord ? '' : '  ⚠ sem coordenada';
    console.log(`· ${estacaoName.padEnd(28)} ${municipio} / ${bairro} — ${salas.length} salas${flag}`);
  }

  console.log('\nResumo:');
  console.log('  criados :', JSON.stringify(created));
  console.log('  reusados:', JSON.stringify(reused));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
