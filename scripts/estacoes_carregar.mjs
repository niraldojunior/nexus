#!/usr/bin/env node
/**
 * Carga nacional de estações da V.tal no inventário Geo do Nexus.
 *
 * Origem: `estacoes_carregar-23-07.csv` — base de todas as estações em uso da
 * V.tal (519 linhas). 7 delas (Niterói/São Gonçalo) já foram carregadas antes
 * por `load-estacoes-netwin.mjs`; este script as identifica pela sigla
 * (`ESTACAO`) e descarta a inclusão, seguindo para a próxima.
 *
 * Modelagem — como isto se encaixa no cânone (ver AGENTS.md §3–§4):
 *
 *   Estação "<Nome> (<Sigla>)"     GeographicSite category=Site   (topo, CO)
 *     └── Sala "<nome da sala>"    GeographicSite category=SubSite
 *
 *   Ao contrário da carga anterior (Niterói), aqui NÃO se cria um site
 *   "Localidade" (Region) pai por bairro: a árvore de navegação atual
 *   (`src/modules/geo/tree-service.ts`) agrupa Estação por UF/Município a
 *   partir do **endereço da própria estação**, não de um Site ancestral. Em
 *   escala nacional, um Region "Centro" compartilhado colapsaria centenas de
 *   municípios num único nó — por isso a Estação é sempre topo de hierarquia,
 *   com endereço próprio (C2 — acima do Rack é GeographicSite).
 *
 *   · C5 — o Nexus gera UUID próprio; a sigla Netwin (`ESTACAO`) e demais
 *     campos do CSV ficam em `characteristic` somente-leitura no grupo
 *     `_origin`. Nada de campo hardcoded.
 *   · C6 — nada é excluído; a carga é idempotente por sigla e só cria o que
 *     falta.
 *
 * Coordenada da estação — "prefira a coordenada própria; se ela for
 * inconsistente, geoespacialize o endereço":
 *   1. Tenta ler LAT/LONG do CSV (formato inconsistente linha a linha — às
 *      vezes já vem decimal, às vezes vem com o separador decimal removido).
 *   2. Valida contra uma caixa delimitadora da UF da linha (`UF_BBOX`) — não
 *      basta estar "dentro do Brasil": uma coordenada de outra região não
 *      passa. Coordenada fora da caixa da UF é descartada como inconsistente.
 *   3. Se não sobrar coordenada válida e houver endereço textual de verdade,
 *      tenta geocodificar via Nominatim (OpenStreetMap, sem chave). Falha de
 *      geocodificação (rede/serviço indisponível) não é fatal: a estação é
 *      criada sem `place`, só sem pino no mapa.
 *   O ponto escolhido (`csv` ou `geocoded`) fica registrado em
 *   `_origin.extra.coordSource`.
 *
 * Uso (backend dev no ar em http://127.0.0.1:4001):
 *   node scripts/estacoes_carregar.mjs
 *   node scripts/estacoes_carregar.mjs --file "caminho/estacoes.csv"
 *   node scripts/estacoes_carregar.mjs --no-geocode   (pula a etapa de rede)
 *
 * Variáveis de ambiente:
 *   NEXUS_API    (default http://127.0.0.1:4001)
 *   NEXUS_TOKEN  (default change-me)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const SEED_TAG = 'estacoes-carregar';

const DEFAULT_CSV = join(__dirname, 'estacoes_carregar-23-07.csv');

const args = process.argv.slice(2);
const fileArgIdx = args.indexOf('--file');
const CSV_PATH = fileArgIdx >= 0 ? args[fileArgIdx + 1] : DEFAULT_CSV;
const GEOCODE_ENABLED = !args.includes('--no-geocode');

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'estacoes-carregar';

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

// O export vem em Latin-1/CP1252 (byte único para acento: "ENDEREÇO" chega
// como 0xC7), não UTF-8 — ler como utf8 produz "ENDERE�O" e corrompe todo
// texto acentuado do arquivo. Mesmo decodificado corretamente, alguns nomes
// de sala ainda carregam o artefato de duplo-encoding já visto na carga
// anterior ("1Â° ANDAR"); `fixMojibake` cuida disso à parte.
const BOM = String.fromCharCode(0xfeff);

function readCsvText(path) {
  const text = readFileSync(path).toString('latin1');
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

function fixMojibake(raw) {
  return String(raw ?? '')
    .replace(/Â(?=[º°ª])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del']);
const ROMAN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/;

function titleCase(raw) {
  return fixMojibake(raw)
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (!word) return word;
      if (ROMAN.test(word)) return word.toUpperCase();
      if (i > 0 && CONNECTORS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// "RUA JOAO CAETANO, 56, ALCANTARA, SAO GONCALO - RJ 24710405" → partes.
// Campos sem endereço de verdade chegam como "0" ou vazio.
function isRealAddress(raw) {
  const s = String(raw ?? '').trim();
  return s !== '' && s !== '0' && /[A-Za-zÀ-ÿ]/.test(s);
}

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

// Lista de salas separada por vírgula — nomes normalizados, vazios/"0"/"Não"
// e duplicatas (preservando ordem) descartados.
function parseSalas(raw) {
  const seen = new Set();
  const out = [];
  for (const item of String(raw ?? '').split(',')) {
    const name = fixMojibake(item);
    if (!name || name === '0' || /^n[aã]o$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// CSV `;`, sem campo com `;` interno ou aspas — split direto basta.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

// ------------------------------------------------------------- coordenadas ---

// Caixa delimitadora aproximada por UF (latMin, latMax, lonMin, lonMax), com
// folga — usada para rejeitar coordenada "consistente com o Brasil" mas
// claramente de outra região (ex.: coordenada do RJ atribuída a estação do
// PR). Não é sobre precisão de fronteira, é sobre descartar lixo grosseiro.
const UF_BBOX = {
  AC: [-11.4, -7.0, -74.2, -66.5],
  AL: [-10.6, -8.7, -38.3, -35.0],
  AP: [-1.3, 4.6, -54.9, -49.8],
  AM: [-9.9, 2.3, -73.9, -56.0],
  BA: [-18.5, -8.4, -46.7, -37.2],
  CE: [-8.0, -2.6, -41.5, -37.1],
  DF: [-16.2, -15.4, -48.4, -47.2],
  ES: [-21.4, -17.8, -42.0, -39.5],
  GO: [-19.6, -12.3, -53.4, -45.8],
  MA: [-10.4, -0.9, -48.9, -41.7],
  MT: [-18.1, -7.2, -61.7, -50.1],
  MS: [-24.2, -17.1, -58.3, -50.8],
  MG: [-23.0, -14.1, -51.1, -39.8],
  PA: [-9.9, 2.7, -59.0, -45.9],
  PB: [-8.4, -5.9, -38.9, -34.7],
  PR: [-26.8, -22.4, -54.7, -47.9],
  PE: [-9.6, -7.2, -41.5, -32.3],
  PI: [-11.0, -2.6, -46.0, -40.3],
  RJ: [-23.5, -20.6, -45.0, -40.8],
  RN: [-7.0, -4.7, -38.7, -34.8],
  RS: [-33.9, -26.9, -57.8, -49.5],
  RO: [-13.8, -7.8, -66.9, -59.6],
  RR: [-1.7, 5.4, -64.9, -58.9],
  SC: [-29.5, -25.8, -54.0, -48.2],
  SP: [-25.5, -19.6, -53.3, -44.0],
  SE: [-11.7, -9.4, -38.4, -36.3],
  TO: [-13.6, -5.0, -50.9, -45.6],
};

function inBbox(lat, lng, bbox) {
  const [latMin, latMax, lonMin, lonMax] = bbox;
  return lat >= latMin && lat <= latMax && lng >= lonMin && lng <= lonMax;
}

const VALID_UF = new Set(Object.keys(UF_BBOX));

// Algumas linhas trazem UF/MUNICIPIO inválidos na origem (ex.: `UF=TR`,
// `MUNICIPIO=Formação` — entradas de treinamento/matriz do Netwin), mas o
// texto do endereço tem a cidade real no final ("... PORTO VELHO - RO
// 76801103"). Quando a UF da linha não é um código válido, tenta extrair
// cidade/UF do próprio endereço antes de desistir.
function extractCityUfFromAddress(raw) {
  const match = String(raw ?? '').match(/,\s*([A-Za-zÀ-ÿ\s]+?)\s*-\s*([A-Za-z]{2})\s*\d{0,8}\s*$/);
  if (!match) return null;
  const uf = match[2].toUpperCase();
  if (!VALID_UF.has(uf)) return null;
  return { city: titleCase(match[1]), uf };
}

// Um eixo cru vira ponto flutuante de duas formas possíveis: já tem o ponto
// decimal (usa direto) ou veio com o separador removido (reintroduz depois
// dos N primeiros dígitos). N varia: longitude do Brasil sempre tem 2 dígitos
// inteiros (28–75); latitude tem 1 perto do equador (AP/RR/norte do AM/PA,
// que podem ser positivas) e 2 mais ao sul. Por isso latitude tenta as duas
// hipóteses e a validação de UF_BBOX escolhe qual sobrevive.
function axisCandidates(raw, intLenOptions) {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return [];
  if (/^-?\d+\.\d+$/.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) ? [v] : [];
  }
  const neg = s.startsWith('-');
  const digits = s.replace(/[^0-9]/g, '');
  const out = [];
  for (const intLen of intLenOptions) {
    if (digits.length <= intLen) continue;
    const v = Number(`${digits.slice(0, intLen)}.${digits.slice(intLen)}`);
    if (Number.isFinite(v)) out.push(neg ? -v : v);
  }
  return out;
}

// Resolve a melhor combinação (lat, lng) que caia na caixa da UF informada,
// testando as hipóteses de latitude (1 ou 2 dígitos inteiros) contra a
// longitude (sempre 2). Sem combinação válida → coordenada é descartada.
function resolveCsvCoord(rawLat, rawLng, uf) {
  const bbox = UF_BBOX[uf];
  if (!bbox) return null;
  const lats = axisCandidates(rawLat, [1, 2]);
  const lngs = axisCandidates(rawLng, [2]);
  for (const lat of lats) {
    for (const lng of lngs) {
      if (inBbox(lat, lng, bbox)) return [lng, lat];
    }
  }
  return null;
}

// ------------------------------------------------------------- geocoding -----

// Nominatim (OpenStreetMap) — não exige chave, mas pede User-Agent
// identificável e no máximo ~1 req/s. Usado só como fallback (~poucas dezenas
// de linhas) quando a coordenada do CSV não sobreviveu à validação de UF.
// Indisponibilidade de rede/serviço não é erro fatal: a estação segue sem
// `place`, e a exclusão fica registrada no resumo final.
let lastGeocodeAt = 0;
async function geocodeAddress(query, uf) {
  if (!GEOCODE_ENABLED) return null;
  const wait = 1100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('q', `${query}, Brasil`);

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'vtal-nexus-estacoes-carregar/1.0 (uso interno)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    const hit = results?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const bbox = UF_BBOX[uf];
    if (bbox && !inBbox(lat, lng, bbox)) return null;
    return [lng, lat];
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- índices -----

const siteSpecByName = new Map();
const siteBySigla = new Map(); // `_origin.extra.sigla` — chave primária de dedupe
const siteByName = new Map(); // fallback: nome gerado "<Nome> (<Sigla>)"
const childByKey = new Map(); // `${parentId}::${nome}` -> Sala existente

const created = { estacoes: 0, salas: 0 };
const discarded = { estacoes: 0 };
const coordStats = { csv: 0, geocoded: 0, none: 0 };

async function bootstrap() {
  const [specs, sites] = await Promise.all([
    api('GET', '/v1/geo/site-specifications'),
    api('GET', '/v1/geo/sites'),
  ]);
  for (const spec of specs ?? []) if (spec?.name) siteSpecByName.set(spec.name, spec.id);

  for (const site of sites ?? []) {
    if (!site?.name || site.status === 'terminated') continue;
    if (!siteByName.has(site.name)) siteByName.set(site.name, site.id);
    if (site.parentSite?.id) childByKey.set(`${site.parentSite.id}::${site.name}`, site.id);

    const extra = (site.characteristic ?? []).find((c) => c.group === '_origin' && c.name === 'extra');
    const sigla = extra?.value?.sigla;
    if (sigla && !siteBySigla.has(sigla)) siteBySigla.set(sigla, site.id);
  }
}

// -------------------------------------------------------------- ensure -------

async function ensureSpec(name, category) {
  const found = siteSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/v1/geo/site-specifications', { name, category });
  siteSpecByName.set(name, spec.id);
  return spec.id;
}

async function createPoint(coord, referencePoint) {
  const location = await api('POST', '/v1/geo/locations', {
    geometryType: 'Point',
    geometry: { type: 'Point', coordinates: coord },
    spatialRef: 'EPSG:4326',
    ...(referencePoint ? { referencePoint } : {}),
  });
  return location.id;
}

async function createAddress({ street, streetNr, city, uf, postcode, locationId }) {
  const address = await api('POST', '/v1/geo/addresses', {
    street,
    ...(streetNr ? { streetNr } : {}),
    ...(city ? { city } : {}),
    ...(uf ? { stateOrProvince: uf } : {}),
    ...(postcode ? { postcode } : {}),
    country: 'BR',
    ...(locationId ? { geographicLocationId: locationId } : {}),
  });
  return address.id;
}

async function ensureSala({ name, specId, parentSiteId }) {
  const key = `${parentSiteId}::${name}`;
  const found = childByKey.get(key);
  if (found) return found;
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
  const rows = parseCsv(readCsvText(CSV_PATH));
  if (rows.length === 0) throw new Error(`nenhuma linha lida de ${CSV_PATH}`);

  await bootstrap();

  const specEstacao = await ensureSpec('Estação', 'Site');
  const specSala = await ensureSpec('Sala', 'SubSite');

  for (const row of rows) {
    const sigla = row['ESTACAO'] || '';
    if (!sigla) continue;

    if (siteBySigla.has(sigla)) {
      discarded.estacoes++;
      console.log(`· ${sigla.padEnd(8)} já existe no Nexus — descartada`);
      continue;
    }

    const ufRaw = (row['UF'] || '').toUpperCase();
    const municipioRaw = titleCase(row['MUNICIPIO'] || '');
    const nome = titleCase(row['NOME'] || sigla);
    const estacaoName = `${nome} (${sigla})`;

    if (siteByName.has(estacaoName)) {
      discarded.estacoes++;
      siteBySigla.set(sigla, siteByName.get(estacaoName));
      console.log(`· ${sigla.padEnd(8)} já existe no Nexus (por nome) — descartada`);
      continue;
    }

    const enderecoRaw = row['ENDEREÇO'] ?? row['ENDERE�O'] ?? '';
    const hasRealAddress = isRealAddress(enderecoRaw);
    const endereco = hasRealAddress ? parseEndereco(enderecoRaw) : { street: '', streetNr: '', bairro: '', postcode: undefined };

    // UF/MUNICIPIO da linha podem ser lixo de origem (ex.: `UF=TR`,
    // `MUNICIPIO=Formação` em entradas de treinamento do Netwin). Quando a UF
    // não é um código válido, tenta recuperar cidade/UF do fim do próprio
    // endereço antes de cair no balde "Sem UF" da árvore.
    let uf = ufRaw;
    let municipio = municipioRaw;
    if (!VALID_UF.has(uf)) {
      const extracted = hasRealAddress ? extractCityUfFromAddress(enderecoRaw) : null;
      if (extracted) {
        uf = extracted.uf;
        municipio = extracted.city;
      } else {
        uf = '';
      }
    }

    // `street` é obrigatório na Address (service.ts); sem endereço de verdade,
    // usa o município como logradouro — mantém city/uf preenchidos, que é o
    // que agrupa a estação na árvore por UF/Município.
    const street = endereco.street || municipio || nome;

    // 1) coordenada do CSV, validada contra a caixa da UF resolvida.
    let coord = uf ? resolveCsvCoord(row['LAT'], row['LONG'], uf) : null;
    let coordSource = coord ? 'csv' : null;

    // 2) coordenada inconsistente/ausente + endereço de verdade → geocodifica.
    if (!coord && hasRealAddress) {
      const query = [endereco.street, endereco.streetNr, endereco.bairro, municipio, uf].filter(Boolean).join(', ');
      coord = await geocodeAddress(query, uf);
      if (coord) coordSource = 'geocoded';
    }

    if (coordSource === 'csv') coordStats.csv++;
    else if (coordSource === 'geocoded') coordStats.geocoded++;
    else coordStats.none++;

    const salas = parseSalas(row['DESCRICAO_SITES_INTERNOS']);

    const characteristic = [
      tag(),
      { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
      { group: '_origin', name: 'id', value: sigla, valueType: 'string' },
      { group: '_origin', name: 'entity', value: 'Estacao', valueType: 'string' },
      { group: '_origin', name: 'migratedAt', value: MIGRATED_AT, valueType: 'date' },
      { group: '_origin', name: 'migratedBy', value: MIGRATED_BY, valueType: 'string' },
      {
        group: '_origin',
        name: 'extra',
        valueType: 'json',
        value: {
          sigla,
          nome,
          estado: row['ESTADO'] || '',
          municipio,
          uf,
          ...(municipio !== municipioRaw ? { municipioOrigem: municipioRaw } : {}),
          ...(uf !== ufRaw ? { ufOrigem: ufRaw } : {}),
          dataAtivacao: row['DATA_ATIVACAO'] || '',
          dataUltimaModif: row['DATA_ULTIMA_MODIF'] || '',
          salasDeclaradas: salas.length,
          coordSource: coordSource ?? 'none',
        },
      },
    ];

    const payload = {
      name: estacaoName,
      siteSpecificationId: specEstacao,
      status: 'active',
      characteristic,
    };

    let locationId;
    if (coord) {
      locationId = await createPoint(coord, estacaoName);
      payload.placeId = locationId;
    }
    payload.addressId = await createAddress({
      street,
      streetNr: endereco.streetNr,
      city: municipio,
      uf,
      postcode: endereco.postcode,
      locationId,
    });

    const site = await api('POST', '/v1/geo/sites', payload);
    siteBySigla.set(sigla, site.id);
    siteByName.set(estacaoName, site.id);
    created.estacoes++;

    for (const sala of salas) {
      await ensureSala({ name: sala, specId: specSala, parentSiteId: site.id });
    }

    const flag = coordSource ? (coordSource === 'geocoded' ? '  ⚠ geocodificada' : '') : '  ⚠ sem coordenada';
    console.log(`· ${sigla.padEnd(8)} ${estacaoName.padEnd(40)} ${municipio}/${uf} — ${salas.length} salas${flag}`);
  }

  console.log('\nResumo:');
  console.log('  criados   :', JSON.stringify(created));
  console.log('  descartados:', JSON.stringify(discarded));
  console.log('  coordenada:', JSON.stringify(coordStats));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
