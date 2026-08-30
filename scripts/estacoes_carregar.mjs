#!/usr/bin/env node
/**
 * Carga nacional de estações da V.tal no inventário Geo do Nexus.
 *
 * Origem: `estacoes_vtal_2026-08-07.csv` — base de todas as estações em uso da
 * V.tal (519 linhas). 7 delas (Niterói/São Gonçalo) já foram carregadas antes
 * por `load-estacoes-netwin.mjs`; este script as identifica pela sigla
 * (`ESTACAO`) e, ao reexecutar, bate todos os campos e atualiza os que
 * estiverem divergentes do CSV (ver `extraDiffers`).
 *
 * O CSV inclui a coluna `SISTEMA_ORIGEM` que indica o sistema de origem do
 * registro dentro do Netwin; o valor é gravado em `_origin.extra.sistemaOrigem`.
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
 *     campos do CSV ficam em `characteristic` somente-leitura, nome plano
 *     `_origin.<campo>` (ex. `_origin.system`, `_origin.extra`) — desde a
 *     governança endurecida em 01/08 (`normalizeSiteCharacteristics`,
 *     src/modules/geo/service.ts), só o `name` iniciar com `_origin.` isenta
 *     a characteristic de precisar estar declarada na spec do Site; o
 *     formato antigo `{ group: '_origin', name: '<campo>' }` (usado por
 *     `load-estacoes-netwin.mjs` até 23/07) não passa mais e estoura
 *     `GEO_SITE_CHARACTERISTIC_UNDEFINED`. `bootstrap()` ainda lê o formato
 *     antigo para reconhecer as 7 estações legadas de Niterói.
 *   · C6 — nada é excluído; a carga é idempotente por sigla e só cria o que
 *     falta.
 *
 * `statusDate` do Site é a `DATA_ATIVACAO` real do CSV (parseada em ISO 8601),
 * não a data da carga — sem isso o Site nasce com "ativo desde hoje", o que
 * distorce qualquer leitura histórica (idade da planta, SLA de ativação).
 * Requer o fix em `service.ts` (`createSite` honrar `input.statusDate`); antes
 * dele a API ignorava esse campo e sempre gravava `new Date()`. Linha sem data
 * de ativação reconhecível (`0`, valor corrompido) cai no default da API
 * (now) — fica registrada em `_origin.extra.dataAtivacao` do mesmo jeito.
 *
 * Coordenada da estação — "prefira a coordenada própria; se ela for
 * inconsistente, geoespacialize o endereço":
 *   1. Tenta ler LAT/LONG do CSV (formato inconsistente linha a linha — às
 *      vezes já vem decimal, às vezes vem com o separador decimal removido).
 *   2. Valida contra uma caixa delimitadora da UF da linha (`UF_BBOX`) — não
 *      basta estar "dentro do Brasil": uma coordenada de outra região não
 *      passa. Coordenada fora da caixa da UF é descartada como inconsistente.
 *   3. Se não sobrar coordenada válida e houver endereço textual de verdade,
 *      tenta geocodificar via Google Geocoding API (mesma chave do frontend,
 *      `VITE_GOOGLE_MAPS_API_KEY`/`GOOGLE_MAPS_API_KEY` no `.env`). Falta de
 *      chave ou falha de geocodificação (rede/serviço indisponível) não é
 *      fatal: a estação é criada sem `place`, só sem pino no mapa.
 *   O ponto escolhido (`csv` ou `geocoded`) fica registrado em
 *   `_origin.extra.coordSource`.
 *
 * Uso via API (backend dev no ar em http://127.0.0.1:4001) — mais lento, mas
 * publica eventos TMF688 e passa por toda a governança do backend:
 *   node scripts/estacoes_carregar.mjs
 *   node scripts/estacoes_carregar.mjs --file "caminho/estacoes.csv"
 *   node scripts/estacoes_carregar.mjs --no-geocode   (pula a etapa de rede)
 *
 * Uso via SQL direto (não precisa do backend no ar; ver bloco "modo --fast"
 * mais abaixo para o tradeoff — não publica eventos nem grava audit log):
 *   node scripts/estacoes_carregar.mjs --fast            # dry-run, mostra o plano
 *   node scripts/estacoes_carregar.mjs --fast --apply     # grava
 *
 * Variáveis de ambiente (lidas também do `.env` na raiz do repo):
 *   NEXUS_API             (default http://127.0.0.1:4001) — modo API
 *   NEXUS_TOKEN           (default change-me) — modo API
 *   DATABASE_URL_DEV      (ou DATABASE_URL) — modo --fast, endpoint -pooler
 *   GOOGLE_MAPS_API_KEY   (fallback: VITE_GOOGLE_MAPS_API_KEY) — só usada se
 *                         sobrar coordenada para geocodificar; sem ela, a
 *                         etapa 3 é pulada como se fosse --no-geocode.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { openLoaderDb } from './loader-db.mjs';
import { UF_BBOX } from './uf-geo.mjs';
import { createCanonicalId } from '../dist/src/shared/utils/canonical-id.js';

loadEnv({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.NEXUS_API || 'http://127.0.0.1:4001';
const TOKEN = process.env.NEXUS_TOKEN || 'change-me';
const SEED_TAG = 'estacoes-carregar';

const DEFAULT_CSV = join(__dirname, '..', 'legacy-data', 'estacoes_vtal_2026-08-07.csv');

const args = process.argv.slice(2);
const fileArgIdx = args.indexOf('--file');
const CSV_PATH = fileArgIdx >= 0 ? args[fileArgIdx + 1] : DEFAULT_CSV;
const GEOCODE_ENABLED = !args.includes('--no-geocode');
const FAST = args.includes('--fast');
const APPLY_FAST = args.includes('--apply');
const RESET = args.includes('--reset');

const MIGRATED_AT = new Date().toISOString();
const MIGRATED_BY = 'estacoes-carregar';

// ------------------------------------------------------------------- infra ---

// 519 estações × várias chamadas cada é sessão longa o bastante para o
// backend dev soltar uma conexão (ECONNRESET) sem que isso seja um erro da
// carga em si — só retenta falha de rede (fetch nem completou), nunca uma
// resposta HTTP de erro (essa é real e deve estourar).
async function api(method, pathname, body, attempt = 1) {
  let res;
  try {
    res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (attempt >= 3) throw err;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    return api(method, pathname, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const tag = () => ({ name: '_origin.seed', value: SEED_TAG, valueType: 'string' });

// --------------------------------------------------------------- parsing -----

// O export é UTF-8 (com ou sem BOM). Bytes inválidos em UTF-8 — como o 0xC7
// do campo ENDEREÇO no header — viram U+FFFD, tratado pelo lookup de coluna
// `row['ENDERE\uFFFDO']`. Nomes antigos ainda podem ter artefatos de
// duplo-encoding ("1Â° ANDAR"); `fixMojibake` cuida disso à parte.
function readCsvText(path) {
  const buf = readFileSync(path);
  // Descarta UTF-8 BOM se presente
  const start = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

// CP1252 0x80–0x9F mapeiam para Unicode fora do range Latin-1 direto.
// Necessário para reverter mojibake: bytes UTF-8 lidos como CP1252 → string
// com esses chars especiais → `fixCp1252Mojibake` desfaz.
const CP1252_UNICODE = new Map([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);
const UNICODE_TO_CP1252 = new Map([...CP1252_UNICODE].map(([k, v]) => [v, k]));

// CP1252 tem 5 posições sem caractere atribuído em 0x80–0x9F (0x81, 0x8D, 0x8F,
// 0x90, 0x9D). O decoder windows-1252 do WHATWG (usado por navegador/Node ao
// reinterpretar bytes UTF-8 como CP1252 na origem do mojibake) não erra nessas
// posições: cai direto pro codepoint igual ao byte, o mesmo que faria Latin-1.
// Ex.: "Icaraí" (U+00CD) em UTF-8 é [0xC3, 0x8D]; reinterpretado como CP1252 e
// re-exportado em UTF-8 vira "Ã" (U+00C3) + U+008D — esse 2º codepoint é
// exatamente um desses "buracos" do CP1252. Sem tratar isso aqui, a função
// desistia (`return str`) e "Icaraí (ICI)" ficava "IcaraÃ (ICI)".
const CP1252_GAPS = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

// Tenta reverter double-encoding CP1252→UTF-8 (bytes UTF-8 armazenados como
// texto CP1252, depois re-exportados). Devolve o original se não conseguir.
function fixCp1252Mojibake(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7f) {
      bytes.push(cp);
      continue;
    }
    if (cp >= 0xa0 && cp <= 0xff) {
      bytes.push(cp);
      continue;
    }
    if (CP1252_GAPS.has(cp)) {
      bytes.push(cp);
      continue;
    }
    const b = UNICODE_TO_CP1252.get(cp);
    if (b !== undefined) {
      bytes.push(b);
      continue;
    }
    return str; // codepoint não mapeável → não é mojibake CP1252
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  return decoded.includes('\uFFFD') ? str : decoded;
}

function fixMojibake(raw) {
  const s = String(raw ?? '')
    .replace(/Â(?=[º°ª])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return fixCp1252Mojibake(s);
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

// ESTADO do CSV é o status do site no Netwin, não estado (UF) — nome infeliz
// da origem. Valores confirmados na base atual (519 linhas): "Instalado"
// (703 ocorrências) e "Em Projeto" (4 ocorrências); mapeados para os status
// canônicos de GeographicSite (service.ts): "Instalado" = Ativo = 'Active',
// "Em Projeto" = Em Implantação = 'InConstruction'. Valor não reconhecido cai
// em 'Planned' (mais conservador que assumir Active) e fica registrado como
// aviso — não é fatal, mas não deve acontecer silenciosamente.
const ESTADO_TO_STATUS = {
  instalado: 'Active',
  'em projeto': 'InConstruction',
};

function resolveSiteStatus(estadoRaw, sigla) {
  const key = String(estadoRaw ?? '')
    .trim()
    .toLowerCase();
  const status = ESTADO_TO_STATUS[key];
  if (!status) {
    console.log(`  ⚠ ${sigla}: ESTADO "${estadoRaw}" não reconhecido — usando status 'Planned'`);
    return 'Planned';
  }
  return status;
}

// "2016-08-21 15:07:06 UTC" → ISO 8601. Algumas linhas trazem lixo neste campo
// (`0`, ou o valor de ESTADO vazando por desalinhamento de coluna, ex.
// "Instalado") — `Date` aceita o formato "UTC" nativamente, então basta
// rejeitar o que não vira uma data válida.
function parseActivationDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
// A tabela vive em ./uf-geo.mjs (fonte única compartilhada com os loaders de recurso).

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

// Google Geocoding API — mesma chave do frontend (`VITE_GOOGLE_MAPS_API_KEY`
// no `.env`; habilitada para Geocoding em 06/08, ver memória de projeto
// "google-maps-apis-desabilitadas"). Usado só como fallback (~poucas dezenas
// de linhas) quando a coordenada do CSV não sobreviveu à validação de UF.
// Sem chave configurada ou indisponibilidade de rede/serviço não é erro
// fatal: a estação segue sem `place`, e a exclusão fica registrada no
// resumo final.
const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

async function geocodeAddress(query, uf) {
  if (!GEOCODE_ENABLED || !GOOGLE_MAPS_API_KEY) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${query}, Brasil`);
  url.searchParams.set('region', 'br');
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const location = data.results?.[0]?.geometry?.location;
    if (!location) return null;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
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
const siteFullBySigla = new Map(); // sigla → { id, characteristic } — para comparação e PATCH
const childByKey = new Map(); // `${parentId}::${nome}` -> Sala existente

const created = { estacoes: 0, salas: 0 };
const updated = { estacoes: 0 };
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

    // Aceita os dois formatos: legado (`group: '_origin', name: 'extra'`, usado
    // pelas 7 estações de Niterói carregadas antes da governança de
    // characteristics endurecer em 01/08) e o atual (`name: '_origin.extra'`,
    // exigido por `normalizeSiteCharacteristics` — ver nota no topo do arquivo).
    const extra = (site.characteristic ?? []).find(
      (c) => c.name === '_origin.extra' || (c.group === '_origin' && c.name === 'extra'),
    );
    const sigla = extra?.value?.sigla;
    if (sigla && !siteBySigla.has(sigla)) {
      siteBySigla.set(sigla, site.id);
      siteFullBySigla.set(sigla, { id: site.id, characteristic: site.characteristic ?? [] });
    }
  }
}

// -------------------------------------------------------------- ensure -------

// Campos do CSV mantidos em sincronia com o registro existente.
const EXTRA_CSV_KEYS = [
  'nome',
  'sistemaOrigem',
  'estado',
  'dataAtivacao',
  'dataUltimaModif',
  'salasDeclaradas',
];

function extraDiffers(stored, expected) {
  if (!stored) return true;
  return EXTRA_CSV_KEYS.some((k) => String(stored[k] ?? '') !== String(expected[k] ?? ''));
}

// Substitui _origin.extra mantendo as demais characteristics intactas.
function updateCharacteristics(existing, newExtra) {
  const out = (existing ?? []).filter((c) => c.name !== '_origin.extra');
  out.push({ name: '_origin.extra', valueType: 'json', value: newExtra });
  return out;
}

async function ensureSpec(name, category) {
  const found = siteSpecByName.get(name);
  if (found) return found;
  const spec = await api('POST', '/v1/geo/site-specifications', { name, category });
  siteSpecByName.set(name, spec.id);
  return spec.id;
}

// `validateContainment` (service.ts) exige a relação declarada nos dois
// sentidos: o filho precisa ter o pai em `allowedParentSpecIds` E o pai
// precisa ter o filho em `allowedChildSpecIds`. `ensureSpec` cria specs sem
// nenhuma relação — sem isto, todo `POST /v1/geo/sites` de Sala estoura
// `GEO_SPEC_CONTAINMENT_NOT_ALLOWED`. `PATCH` substitui a lista inteira (não
// mescla), então lemos o estado atual e só gravamos se faltar o par.
async function ensureContainment(parentSpecId, childSpecId) {
  const [parentSpec, childSpec] = await Promise.all([
    api('GET', `/v1/geo/site-specifications/${parentSpecId}`),
    api('GET', `/v1/geo/site-specifications/${childSpecId}`),
  ]);
  if (!(parentSpec.allowedChildSpecIds ?? []).includes(childSpecId)) {
    await api('PATCH', `/v1/geo/site-specifications/${parentSpecId}`, {
      allowedChildSpecIds: [...new Set([...(parentSpec.allowedChildSpecIds ?? []), childSpecId])],
    });
  }
  if (!(childSpec.allowedParentSpecIds ?? []).includes(parentSpecId)) {
    await api('PATCH', `/v1/geo/site-specifications/${childSpecId}`, {
      allowedParentSpecIds: [...new Set([...(childSpec.allowedParentSpecIds ?? []), parentSpecId])],
    });
  }
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

  const specCO = await ensureSpec('Central Office', 'Site');
  // 'Room' (não 'Sala') — a spec ad-hoc "Sala" foi unificada na canônica do bootstrap
  // "Room" (code ROOM, ver scripts/merge-sala-into-room-sql.mjs); criar de novo por
  // 'Sala' recriaria o duplicado que acabou de ser aposentado.
  const specSala = await ensureSpec('Room', 'SubSite');
  await ensureContainment(specCO, specSala);

  for (const row of rows) {
    const sigla = row['ESTACAO'] || '';
    if (!sigla) continue;

    const ufRaw = (row['UF'] || '').toUpperCase();
    const municipioRaw = titleCase(row['MUNICIPIO'] || '');
    const nome = titleCase(row['NOME'] || sigla);
    const estacaoName = `${nome} (${sigla})`;
    const salas = parseSalas(row['DESCRICAO_SITES_INTERNOS']);

    // Estação já existe (desta carga ou de uma execução anterior interrompida
    // no meio) — não recria o Site, mas ainda garante as salas: `ensureSala`
    // já é idempotente por `parentId::nome`, então isto é o que torna a carga
    // retomável depois de uma falha de rede a meio caminho (ver `api()`).
    const existingSiteId = siteBySigla.get(sigla) ?? siteByName.get(estacaoName);
    if (existingSiteId) {
      discarded.estacoes++;
      siteBySigla.set(sigla, existingSiteId);
      for (const sala of salas) {
        await ensureSala({ name: sala, specId: specSala, parentSiteId: existingSiteId });
      }
      console.log(`· ${sigla.padEnd(8)} já existe no Nexus — descartada (salas conferidas)`);
      continue;
    }

    const enderecoRaw = row['ENDEREÇO'] ?? row['ENDERE�O'] ?? '';
    const hasRealAddress = isRealAddress(enderecoRaw);
    const endereco = hasRealAddress
      ? parseEndereco(enderecoRaw)
      : { street: '', streetNr: '', bairro: '', postcode: undefined };

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
      const query = [endereco.street, endereco.streetNr, endereco.bairro, municipio, uf]
        .filter(Boolean)
        .join(', ');
      coord = await geocodeAddress(query, uf);
      if (coord) coordSource = 'geocoded';
    }

    if (coordSource === 'csv') coordStats.csv++;
    else if (coordSource === 'geocoded') coordStats.geocoded++;
    else coordStats.none++;

    const characteristic = [
      tag(),
      { name: '_origin.system', value: 'Netwin', valueType: 'string' },
      { name: '_origin.id', value: sigla, valueType: 'string' },
      { name: '_origin.entity', value: 'Estacao', valueType: 'string' },
      { name: '_origin.migratedAt', value: MIGRATED_AT, valueType: 'date' },
      { name: '_origin.migratedBy', value: MIGRATED_BY, valueType: 'string' },
      {
        name: '_origin.extra',
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

    const activationDate = parseActivationDate(row['DATA_ATIVACAO']);

    const payload = {
      name: estacaoName,
      siteSpecificationId: specCO,
      status: resolveSiteStatus(row['ESTADO'], sigla),
      ...(activationDate ? { statusDate: activationDate } : {}),
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

    const flag = coordSource
      ? coordSource === 'geocoded'
        ? '  ⚠ geocodificada'
        : ''
      : '  ⚠ sem coordenada';
    console.log(
      `· ${sigla.padEnd(8)} ${estacaoName.padEnd(40)} ${municipio}/${uf} — ${salas.length} salas${flag}`,
    );
  }

  console.log('\nResumo:');
  console.log('  criados      :', JSON.stringify(created));
  console.log('  atualizados  :', JSON.stringify(updated));
  console.log('  sem alteração:', JSON.stringify(discarded));
  console.log('  coordenada   :', JSON.stringify(coordStats));
}

// ------------------------------------------------------------ modo --fast ---
//
// `main()` faz 1 POST HTTP por Location/Address/Site/Sala — cada POST é uma
// viagem de rede até o Neon (remoto, não localhost) mais o processamento do
// backend (RBAC, characteristics, containment, audit, outbox). Em ~519
// estações + salas isso passa de milhares de round-trips sequenciais (o
// backend dev atende requisições em série — ver AGENTS.md).
//
// `--fast` faz o que `load-recursos-netwin.mjs` já faz para os 24.6k recursos
// de planta externa: grava direto no Postgres via `pg`, em poucos INSERTs
// multi-linha dentro de uma única transação. Mesmo tradeoff aceito lá — **não
// publica eventos TMF688 (C7) nem grava audit log**, porque é carga inicial
// de migração, não mudança operacional feita por um usuário. Ainda assim:
//   · gera os mesmos UUID v7 (`createCanonicalId`, mesmo gerador da app);
//   · grava `characteristics` no mesmo formato `_origin.*` (C5);
//   · grava `tmf_geographic_site_status_history` (histórico de status fica
//     íntegro mesmo sem os outros efeitos colaterais do backend);
//   · é idempotente por sigla/nome, igual `main()` — seguro rodar de novo.
// Exige que as specs "Central Office"/"Room" (com containment declarado) já
// existam — rode `main()` (sem `--fast`) uma vez antes se a base for nova.
//
// Uso:
//   node scripts/estacoes_carregar.mjs --fast              # dry-run, só mostra o plano
//   node scripts/estacoes_carregar.mjs --fast --apply       # grava

// Bulk insert delegated to the provider-aware adapter (Postgres multi-row VALUES; Oracle
// executeMany). Same drop-in as load-recursos-netwin.mjs.
async function bulkInsert(client, table, columns, rows) {
  return client.bulkInsert(table, columns, rows);
}

function historyRow(siteId, statusDate, toStatus = 'Active') {
  return {
    id: createCanonicalId(),
    site_id: siteId,
    tenant_id: 'default',
    from_status: null,
    to_status: toStatus,
    status_date: statusDate,
    status_reason: null,
    actor_sub: MIGRATED_BY,
    trace_id: createCanonicalId(),
  };
}

// As specs precisam existir com o containment já declarado nos dois sentidos
// (ver `ensureContainment`) — `--fast` não faz esse bootstrap, só confirma.
// Remove todas as estações (e salas filhas, endereços e locations associados)
// carregadas por este script ou pela carga legada de Niterói.
async function resetStations(client) {
  console.log('Identificando estações e salas para remoção…');
  const { rows: stations } = await client.query(`
    SELECT id, geographic_address_id, geographic_location_id
    FROM tmf_geographic_site s
    WHERE characteristics::jsonb @> '[{"name":"_origin.seed","value":"estacoes-carregar"}]'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(s.characteristics::jsonb) c
         WHERE c->>'name' = '_origin.entity' AND c->>'value' = 'Estacao'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(s.characteristics::jsonb) c
         WHERE c->>'group' = '_origin' AND c->>'name' = 'extra'
           AND (c->'value'->>'sigla') IS NOT NULL
       )
  `);
  if (stations.length === 0) {
    console.log('  Nenhuma estação encontrada.');
    return 0;
  }
  const stationIds = stations.map((r) => r.id);
  const { rows: salas } = await client.query(
    `SELECT id, geographic_address_id, geographic_location_id
     FROM tmf_geographic_site WHERE parent_site_id = ANY($1::text[])`,
    [stationIds],
  );
  const all = [...stations, ...salas];
  const allIds = all.map((r) => r.id);
  const addrIds = [...new Set(all.map((r) => r.geographic_address_id).filter(Boolean))];
  const locIds = [...new Set(all.map((r) => r.geographic_location_id).filter(Boolean))];

  await client.query(
    'DELETE FROM tmf_geographic_site_status_history WHERE site_id = ANY($1::text[])',
    [allIds],
  );
  await client.query('DELETE FROM tmf_geographic_site WHERE id = ANY($1::text[])', [allIds]);
  if (addrIds.length)
    await client.query('DELETE FROM tmf_geographic_address WHERE id = ANY($1::text[])', [addrIds]);
  if (locIds.length)
    await client.query('DELETE FROM tmf_geographic_location WHERE id = ANY($1::text[])', [locIds]);

  console.log(
    `  Removidos: ${stations.length} estações, ${salas.length} salas, ${addrIds.length} endereços, ${locIds.length} locations.`,
  );
  return allIds.length;
}

async function loadSpecsFast(client) {
  const { rows } = await client.query(
    `SELECT id, name, allowed_parent_spec_ids, allowed_child_spec_ids
     FROM tmf_geographic_site_specification WHERE name IN ('Central Office', 'Room')`,
  );
  const byName = new Map(rows.map((r) => [r.name, r]));
  const co = byName.get('Central Office');
  // 'Room' — a spec ad-hoc "Sala" foi unificada na canônica do bootstrap "Room" (code
  // ROOM, ver scripts/merge-sala-into-room-sql.mjs); ler por 'Sala' aqui não acharia
  // nada (spec aposentada) e mascararia o erro abaixo.
  const sala = byName.get('Room');
  if (!co || !sala) {
    throw new Error(
      'Specs "Central Office"/"Room" não encontradas. Rode `node scripts/estacoes_carregar.mjs` (modo padrão, sem --fast) uma vez antes — ele cria as specs e o containment.',
    );
  }
  const childOk = (co.allowed_child_spec_ids ?? []).includes(sala.id);
  const parentOk = (sala.allowed_parent_spec_ids ?? []).includes(co.id);
  if (!childOk || !parentOk) {
    throw new Error(
      'Specs "Central Office"/"Room" existem mas o containment Central Office→Room não está declarado. Rode o modo padrão (sem --fast) uma vez — ele chama `ensureContainment`.',
    );
  }
  return { specCOId: co.id, specSalaId: sala.id };
}

// Mesmo índice de idempotência de `bootstrap()`, mas lido direto do banco
// numa única query em vez de 1 GET por página.
async function loadExistingIndexFast(client) {
  const { rows } = await client.query(
    `SELECT id, name, parent_site_id, status, characteristics FROM tmf_geographic_site
     WHERE status NOT IN ('Retired', 'terminated')`,
  );
  const siteBySigla = new Map();
  const siteByName = new Map();
  const childByKey = new Map();
  const siteCharsBySigla = new Map();
  const siteStatusBySigla = new Map();
  for (const row of rows) {
    if (!siteByName.has(row.name)) siteByName.set(row.name, row.id);
    if (row.parent_site_id) childByKey.set(`${row.parent_site_id}::${row.name}`, row.id);
    let chars = [];
    try {
      chars = JSON.parse(row.characteristics || '[]');
    } catch {
      chars = [];
    }
    const extra = chars.find(
      (c) => c.name === '_origin.extra' || (c.group === '_origin' && c.name === 'extra'),
    );
    const sigla = extra?.value?.sigla;
    if (sigla && !siteBySigla.has(sigla)) {
      siteBySigla.set(sigla, row.id);
      siteCharsBySigla.set(sigla, chars);
      siteStatusBySigla.set(sigla, row.status);
    }
  }
  return { siteBySigla, siteByName, childByKey, siteCharsBySigla, siteStatusBySigla };
}

async function mainFast() {
  const rows = parseCsv(readCsvText(CSV_PATH));
  if (rows.length === 0) throw new Error(`nenhuma linha lida de ${CSV_PATH}`);

  const client = await openLoaderDb();

  try {
    // --reset: limpa estações/salas existentes antes de recarregar
    if (RESET) {
      if (APPLY_FAST) {
        await client.query('BEGIN');
        try {
          await resetStations(client);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      } else {
        console.log(
          '— DRY-RUN de reset: as estações existentes seriam removidas. Combine --reset com --apply para executar. —',
        );
      }
    }

    const { specCOId, specSalaId } = await loadSpecsFast(client);
    const { siteBySigla, siteByName, childByKey, siteCharsBySigla, siteStatusBySigla } =
      await loadExistingIndexFast(client);

    const newLocations = [];
    const newAddresses = [];
    const newSites = []; // ordem importa: pai (Estação) sempre antes das Salas
    const newHistory = [];
    const toUpdate = []; // { id, characteristics?, status?, statusDate? } — sites existentes com campos divergentes
    const created = { estacoes: 0, salas: 0 };
    const updated = { estacoes: 0 };
    const discarded = { estacoes: 0 };
    const coordStats = { csv: 0, geocoded: 0, none: 0 };

    const addSala = (name, parentSiteId, statusDate) => {
      const key = `${parentSiteId}::${name}`;
      if (childByKey.has(key)) return;
      const salaId = createCanonicalId();
      childByKey.set(key, salaId);
      newSites.push({
        id: salaId,
        tenant_id: 'default',
        name,
        site_specification_id: specSalaId,
        status: 'Active',
        status_date: statusDate,
        geographic_location_id: null,
        geographic_address_id: null,
        parent_site_id: parentSiteId,
        related_party: '[]',
        site_addresses: '[]',
        characteristics: JSON.stringify([tag()]),
      });
      newHistory.push(historyRow(salaId, statusDate));
      created.salas++;
    };

    for (const row of rows) {
      const sigla = row['ESTACAO'] || '';
      if (!sigla) continue;

      const ufRaw = (row['UF'] || '').toUpperCase();
      const municipioRaw = titleCase(row['MUNICIPIO'] || '');
      const nome = titleCase(row['NOME'] || sigla);
      const estacaoName = `${nome} (${sigla})`;
      const salas = parseSalas(row['DESCRICAO_SITES_INTERNOS']);
      const sistemaOrigem = fixMojibake(row['SISTEMA_ORIGEM'] || '');

      const enderecoRaw = row['ENDEREÇO'] ?? row['ENDERE�O'] ?? '';
      const hasRealAddress = isRealAddress(enderecoRaw);
      const endereco = hasRealAddress
        ? parseEndereco(enderecoRaw)
        : { street: '', streetNr: '', bairro: '', postcode: undefined };

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

      const street = endereco.street || municipio || nome;

      const expectedExtra = {
        sigla,
        nome,
        sistemaOrigem,
        estado: row['ESTADO'] || '',
        municipio,
        uf,
        ...(municipio !== municipioRaw ? { municipioOrigem: municipioRaw } : {}),
        ...(uf !== ufRaw ? { ufOrigem: ufRaw } : {}),
        dataAtivacao: row['DATA_ATIVACAO'] || '',
        dataUltimaModif: row['DATA_ULTIMA_MODIF'] || '',
        salasDeclaradas: salas.length,
      };

      const existingSiteId = siteBySigla.get(sigla) ?? siteByName.get(estacaoName);
      if (existingSiteId) {
        const storedChars = siteCharsBySigla.get(sigla) ?? [];
        const storedExtra = storedChars.find(
          (c) => c.name === '_origin.extra' || (c.group === '_origin' && c.name === 'extra'),
        )?.value;
        const charsDiffer = extraDiffers(storedExtra, expectedExtra);

        const storedStatus = siteStatusBySigla.get(sigla);
        const expectedStatus = resolveSiteStatus(row['ESTADO'], sigla);
        const statusDiffers = storedStatus !== expectedStatus;

        if (charsDiffer || statusDiffers) {
          const patch = { id: existingSiteId };
          if (charsDiffer) {
            const fullExtra = { ...expectedExtra, coordSource: storedExtra?.coordSource ?? 'none' };
            patch.characteristics = JSON.stringify(updateCharacteristics(storedChars, fullExtra));
          }
          if (statusDiffers) {
            patch.status = expectedStatus;
            patch.statusDate =
              parseActivationDate(row['DATA_ATIVACAO']) ?? new Date().toISOString();
            patch.fromStatus = storedStatus;
          }
          toUpdate.push(patch);
          updated.estacoes++;
          const parts = [
            charsDiffer && 'características',
            statusDiffers && `status ${storedStatus}→${expectedStatus}`,
          ].filter(Boolean);
          console.log(
            `↺ ${sigla.padEnd(8)} ${estacaoName.padEnd(40)} — ${parts.join(', ')} atualizado(s)`,
          );
        } else {
          discarded.estacoes++;
        }
        siteBySigla.set(sigla, existingSiteId);
        const now = new Date().toISOString();
        for (const sala of salas) addSala(sala, existingSiteId, now);
        continue;
      }

      let coord = uf ? resolveCsvCoord(row['LAT'], row['LONG'], uf) : null;
      let coordSource = coord ? 'csv' : null;
      if (!coord && hasRealAddress) {
        const query = [endereco.street, endereco.streetNr, endereco.bairro, municipio, uf]
          .filter(Boolean)
          .join(', ');
        coord = await geocodeAddress(query, uf);
        if (coord) coordSource = 'geocoded';
      }
      if (coordSource === 'csv') coordStats.csv++;
      else if (coordSource === 'geocoded') coordStats.geocoded++;
      else coordStats.none++;

      const activationDate = parseActivationDate(row['DATA_ATIVACAO']) ?? new Date().toISOString();

      const characteristic = [
        tag(),
        { name: '_origin.system', value: 'Netwin', valueType: 'string' },
        { name: '_origin.id', value: sigla, valueType: 'string' },
        { name: '_origin.entity', value: 'Estacao', valueType: 'string' },
        { name: '_origin.migratedAt', value: MIGRATED_AT, valueType: 'date' },
        { name: '_origin.migratedBy', value: MIGRATED_BY, valueType: 'string' },
        {
          name: '_origin.extra',
          valueType: 'json',
          value: { ...expectedExtra, coordSource: coordSource ?? 'none' },
        },
      ];

      const siteId = createCanonicalId();
      let locationId = null;
      if (coord) {
        locationId = createCanonicalId();
        newLocations.push({
          id: locationId,
          tenant_id: 'default',
          geometry_type: 'Point',
          geometry: JSON.stringify({ type: 'Point', coordinates: coord }),
          spatial_ref: 'EPSG:4326',
          reference_point: estacaoName,
          characteristics: '[]',
        });
      }

      const addressId = createCanonicalId();
      newAddresses.push({
        id: addressId,
        tenant_id: 'default',
        street_name: street,
        street_nr: endereco.streetNr || null,
        city: municipio || null,
        state_or_province: uf || null,
        country: 'BR',
        postcode: endereco.postcode || null,
        geographic_location_id: locationId,
        characteristics: '[]',
      });

      const siteStatus = resolveSiteStatus(row['ESTADO'], sigla);

      newSites.push({
        id: siteId,
        tenant_id: 'default',
        name: estacaoName,
        site_specification_id: specCOId,
        status: siteStatus,
        status_date: activationDate,
        geographic_location_id: locationId,
        geographic_address_id: addressId,
        parent_site_id: null,
        related_party: '[]',
        site_addresses: '[]',
        characteristics: JSON.stringify(characteristic),
      });
      newHistory.push(historyRow(siteId, activationDate, siteStatus));

      siteBySigla.set(sigla, siteId);
      siteByName.set(estacaoName, siteId);
      created.estacoes++;

      for (const sala of salas) addSala(sala, siteId, activationDate);

      const flag = coordSource
        ? coordSource === 'geocoded'
          ? '  ⚠ geocodificada'
          : ''
        : '  ⚠ sem coordenada';
      console.log(
        `· ${sigla.padEnd(8)} ${estacaoName.padEnd(40)} ${municipio}/${uf} — ${salas.length} salas${flag}`,
      );
    }

    console.log('\nPlano:');
    console.log(`  estações novas        : ${created.estacoes}`);
    console.log(`  estações atualizadas  : ${updated.estacoes}`);
    console.log(`  estações sem alteração: ${discarded.estacoes}`);
    console.log(`  salas novas           : ${created.salas}`);
    console.log(`  coordenada            : ${JSON.stringify(coordStats)}`);

    if (!APPLY_FAST) {
      console.log(
        '\n— DRY-RUN (--fast sem --apply). Nada foi gravado. Rode com --fast --apply para executar. —',
      );
      return;
    }

    await client.query('BEGIN');
    try {
      await bulkInsert(
        client,
        'tmf_geographic_location',
        [
          'id',
          'tenant_id',
          'geometry_type',
          'geometry',
          'spatial_ref',
          'reference_point',
          'characteristics',
        ],
        newLocations,
      );
      await bulkInsert(
        client,
        'tmf_geographic_address',
        [
          'id',
          'tenant_id',
          'street_name',
          'street_nr',
          'city',
          'state_or_province',
          'country',
          'postcode',
          'geographic_location_id',
          'characteristics',
        ],
        newAddresses,
      );
      await bulkInsert(
        client,
        'tmf_geographic_site',
        [
          'id',
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
          'characteristics',
        ],
        newSites,
      );
      await bulkInsert(
        client,
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
        newHistory,
      );

      // Conferência antes do COMMIT: todo id que preparamos tem de existir na base.
      const allIds = newSites.map((s) => s.id);
      if (allIds.length > 0) {
        const {
          rows: [check],
        } = await client.query(
          `SELECT count(*)::int AS n FROM tmf_geographic_site WHERE id = ANY($1::text[])`,
          [allIds],
        );
        if (check.n !== allIds.length) {
          throw new Error(
            `conferência falhou: ${check.n}/${allIds.length} sites gravados — ROLLBACK`,
          );
        }
      }

      // Atualiza sites existentes com campos divergentes (characteristics e/ou status).
      for (const patch of toUpdate) {
        if (patch.characteristics !== undefined) {
          await client.query('UPDATE tmf_geographic_site SET characteristics = $2 WHERE id = $1', [
            patch.id,
            patch.characteristics,
          ]);
        }
        if (patch.status !== undefined) {
          await client.query(
            'UPDATE tmf_geographic_site SET status = $2, status_date = $3 WHERE id = $1',
            [patch.id, patch.status, patch.statusDate],
          );
          // `newHistory` já foi gravado no bulkInsert acima — esta transição só existe
          // por causa do UPDATE (site já existia), então grava avulsa, com o `from_status`
          // real que a leitura de `loadExistingIndexFast` capturou.
          const h = historyRow(patch.id, patch.statusDate, patch.status);
          await client.query(
            `INSERT INTO tmf_geographic_site_status_history
             (id, site_id, tenant_id, from_status, to_status, status_date, status_reason, actor_sub, trace_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              h.id,
              h.site_id,
              h.tenant_id,
              patch.fromStatus ?? null,
              h.to_status,
              h.status_date,
              h.status_reason,
              h.actor_sub,
              h.trace_id,
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('\nGravado:');
    console.log(`  locations  : ${newLocations.length}`);
    console.log(`  addresses  : ${newAddresses.length}`);
    console.log(`  sites novos: ${newSites.length}`);
    console.log(`  atualizados: ${toUpdate.length}`);
    console.log(`  history    : ${newHistory.length}`);

    console.log('\nAtualizando estatísticas...');
    for (const table of [
      'tmf_geographic_location',
      'tmf_geographic_address',
      'tmf_geographic_site',
      'tmf_geographic_site_status_history',
    ]) {
      await client.gatherStats(table);
    }
    console.log('Estatísticas atualizadas.');
  } finally {
    await client.close();
  }
}

(FAST ? mainFast() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
