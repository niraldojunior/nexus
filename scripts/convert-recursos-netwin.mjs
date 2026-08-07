#!/usr/bin/env node
/**
 * Conversor de extração Netwin (layout "estado", CSV `,` UTF-8) para o layout
 * de entrada de `load-recursos-netwin.mjs` (layout "Niterói", CSV `;` ISO-8859-1).
 *
 * Origem  : legacy-data/recursos_rj_2026-08-07.csv   (ex.: extração do RJ inteiro)
 * Destino : <mesmo nome>_CONVERTIDO.csv             (na mesma pasta legacy-data)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MAPA DE CONVERSÃO  (origem → destino)
 * ─────────────────────────────────────────────────────────────────────────────
 *  ESTACAO                       → ESTACAO                (transformado, ver abaixo)
 *  NUM_CDO                       → CODIGO_EQUIPAMENTO     (direto — polimórfico*)
 *  LAT                           → LAT                    (verbatim)
 *  LONG                          → LONG                   (verbatim)
 *  FABRICANTE                    → FABRICANTE             (direto)
 *  ds_grupo_operacional          → ds_grupo_operacional   (direto)
 *  ds_estado_controle            → ds_estado_controle     (direto)
 *  dt_data_estado_controle       → dt_data_estado_controle(direto)
 *  no_nome_estado_operacional    → STATUS                 (direto)
 *  no_modelo                     → MODELO                 (direto)
 *  cd_tipo                       → TIPO                   (direto)
 *  (derivado de cd_codigo)       → Tipo2                  (classe: SPLITTER/CDOE/…)
 *  cd_codigo                     → NOME_EQUIPAMENTO       (direto)
 *  END_CDO                       → Endereço               (ou fallback município)
 *
 *  Ignoradas (sem coluna no destino): UF, NOME_MUNICIPIO, SIGLA_MUNICIPIO,
 *  ID_IBGE, no_fabricante. NOME_MUNICIPIO/UF são usados só no enriquecimento.
 *
 * *NUM_CDO é polimórfico, exatamente como CODIGO_EQUIPAMENTO no destino:
 *   · linha de CAIXA    → código do ponto/obra ("P-142232")
 *   · linha de SPLITTER → NOME da caixa que o contém ("CEOS-4")
 *  É esse campo que o loader usa para ligar splitter → caixa (mesma sigla +
 *  mesma coordenada crua). Verificado: 100% dos splitters têm NUM_CDO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSFORMAÇÕES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. ESTACAO "ARARUAMA I;AMA"  →  "ARARUAMA I (AMA)"
 *     O loader extrai a sigla por `\(([^)]+)\)$`; sem os parênteses o recurso é
 *     descartado. O token após ';' é a sigla da ESTAÇÃO (não do município).
 *
 *  2. Tipo2 — classe do elemento, que o loader usa para separar caixa×splitter:
 *       splitter (no_modelo começa com "SPLITTER" / cd_codigo casa /^S\d/) → "SPLITTER"
 *       caixa    → prefixo alfabético de cd_codigo ("CEOS-8"→"CEOS", "CDOE-311"→"CDOE").
 *     O loader reconhece CDOE/CDOI/CEO/CEOS; qualquer outro vira "Indefinido".
 *
 *  3. Delimitador `,`→`;`, aspas removidas, e todo `;` interno vira `,` (o loader
 *     faz split ingênuo por `;`, sem tratar aspas).
 *
 *  4. Saída em ISO-8859-1 (latin-1): é como o loader decodifica o arquivo.
 *     A extração já cabe 100% em latin-1 (sem caractere > U+00FF).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENRIQUECIMENTO
 * ─────────────────────────────────────────────────────────────────────────────
 *  END_CDO vazio (~10%): sintetiza-se "<NOME_MUNICIPIO> - RJ" para o recurso cair
 *  no município certo da árvore de Locais em vez de "Sem UF". Sem logradouro real,
 *  street_name fica com o nome do município (cosmético; a navegação é o que importa).
 *  Use --no-enrich para desligar.
 *
 *  ESTACAO vazia (~1.914 linhas): NÃO são descartadas — recebem a estação
 *  sentinela "SEM ESTAÇÃO (SEM)". O load-recursos-netwin.mjs cria esse site sob
 *  demanda e agrupa esses recursos num nó próprio da árvore (splitters sem caixa
 *  entram como recurso avulso). Nenhuma linha é descartada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ ATENÇÃO ao rodar o loader depois: `load-recursos-netwin.mjs` valida a
 *  coordenada contra uma caixa estreita (LAT[-23.5,-20.5], LNG[-44.5,-42.5])
 *  calibrada para Niterói. No estado inteiro isso descarta ~12% dos pontos
 *  (Região dos Lagos, Norte Fluminense, extremo oeste). Este conversor reporta a
 *  contagem no fim; para carregar o RJ todo, amplie LAT/LNG_RANGE no loader
 *  (sugestão: LAT[-23.5,-20.7], LNG[-45.0,-40.9]).
 *
 * Uso:
 *   node scripts/convert-recursos-netwin.mjs
 *   node scripts/convert-recursos-netwin.mjs --file legacy-data/recursos_rj_2026-08-07.csv
 *   node scripts/convert-recursos-netwin.mjs --out outro.csv --no-enrich
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const IN_PATH = argOf('--file', 'legacy-data/recursos_rj_2026-08-07.csv');
const ENRICH = !has('--no-enrich');

// Filtro opcional por município (subconjunto que caiba na cota do Neon).
// Fold: sem acento + maiúsculo, para casar "São Gonçalo" com "SAO GONCALO".
const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const MUNI_FILTER = (() => {
  const set = new Set(argOf('--municipio', '').split(',').map(fold).filter(Boolean));
  return set.size ? set : null;
})();
const muniSlug = MUNI_FILTER
  ? '_' + [...MUNI_FILTER].join('-').replace(/[^A-Z0-9]+/g, '').slice(0, 24)
  : '';
const OUT_PATH = argOf('--out', IN_PATH.replace(/\.csv$/i, '') + '_CONVERTIDO' + muniSlug + '.csv');

// Estação sentinela para linhas de ESTACAO vazia. O loader reconhece a sigla
// "SEM" (via siglaOf) e cria o site agrupador sob demanda — nada é descartado.
const ORPHAN_ESTACAO = 'SEM ESTAÇÃO (SEM)';

// Cabeçalho do layout destino (idêntico a legacy-data/recursos_niteroi.csv).
const OUT_HEADER = [
  'ESTACAO', 'CODIGO_EQUIPAMENTO', 'LAT', 'LONG', 'FABRICANTE',
  'ds_grupo_operacional', 'ds_estado_controle', 'dt_data_estado_controle',
  'STATUS', 'MODELO', 'TIPO', 'Tipo2', 'NOME_EQUIPAMENTO', 'Endereço',
];

// Caixa de sanidade do loader — só para REPORTAR quantos pontos ele descartaria.
// Alinhada à faixa vigente em load-recursos-netwin.mjs (ampliada p/ o RJ inteiro).
const LOADER_LAT = [-23.5, -20.7];
const LOADER_LNG = [-45.0, -40.9];

// --------------------------------------------------------------- CSV parse ----

// Parser de UMA linha lógica (vírgula + aspas duplas, com "" escapado).
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Aspas não-fechadas ⇒ o campo tem newline embutido; junta com a próxima linha.
const quotesBalanced = (s) => (s.match(/"/g) || []).length % 2 === 0;

// ------------------------------------------------------------- transforms -----

// "ARARUAMA I;AMA" → "ARARUAMA I (AMA)". Sem ';' devolve como está.
function estacaoToParen(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const i = s.lastIndexOf(';');
  if (i < 0) return s;
  const nome = s.slice(0, i).trim();
  const sigla = s.slice(i + 1).trim();
  return sigla ? `${nome} (${sigla})` : nome;
}

const isSplitter = (cdCodigo, noModelo) =>
  /^S\d/.test(String(cdCodigo ?? '').trim()) ||
  String(noModelo ?? '').trim().toUpperCase().startsWith('SPLITTER');

// Classe da caixa = prefixo alfabético de cd_codigo. "CEOS-8"→"CEOS".
function boxTipo2(cdCodigo) {
  const m = String(cdCodigo ?? '').trim().match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : 'Indefinido';
}

// Remove ';', CR/LF e espaços das pontas — o destino é delimitado por ';'.
const cell = (v) => String(v ?? '').replace(/[;\r\n]+/g, ',').trim();

// Escreve latin-1; troca qualquer caractere > U+00FF por '?' (não deve ocorrer).
function toLatin1(str) {
  const buf = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    buf[i] = cp > 0xff ? 0x3f : cp;
  }
  return buf;
}

// ------------------------------------------------------------------ main ------

async function main() {
  const rl = createInterface({
    input: createReadStream(IN_PATH, 'utf8'),
    crlfDelay: Infinity,
  });
  const out = createWriteStream(OUT_PATH);

  const write = async (line) => {
    if (!out.write(toLatin1(line + '\n'))) await once(out, 'drain');
  };

  let header = null;
  let idx = {};
  let pending = '';

  const stats = {
    linhas: 0, escritas: 0, caixas: 0, splitters: 0,
    semEstacao: 0, enriquecidas: 0, foraDaCaixaLoader: 0,
    statusNaoMapeado: 0, filtradas: 0,
  };
  const tipo2Dist = new Map();
  const STATUS_KNOWN = new Set(['Em Serviço', 'Fora de Serviço', 'Bloqueado']);

  await write(OUT_HEADER.join(';'));

  for await (const physical of rl) {
    // Reagrupa linhas lógicas quebradas por newline dentro de aspas.
    pending = pending ? pending + '\n' + physical : physical;
    if (!quotesBalanced(pending)) continue;
    const line = pending;
    pending = '';
    if (!line.trim()) continue;

    if (!header) {
      header = parseCsvLine(line).map((h) => h.trim());
      header.forEach((h, i) => (idx[h] = i));
      continue;
    }

    const c = parseCsvLine(line);
    const g = (name) => (c[idx[name]] ?? '').trim();
    stats.linhas++;

    // Filtro por município (subconjunto), quando pedido.
    if (MUNI_FILTER && !MUNI_FILTER.has(fold(g('NOME_MUNICIPIO')))) {
      stats.filtradas++;
      continue;
    }

    // ESTACAO vazia não é descartada: recebe a estação sentinela e vai para o
    // nó agrupador que o loader cria sob demanda.
    let estacao = estacaoToParen(g('ESTACAO'));
    if (!estacao) { estacao = ORPHAN_ESTACAO; stats.semEstacao++; }

    const cdCodigo = g('cd_codigo');
    const noModelo = g('no_modelo');
    const splitter = isSplitter(cdCodigo, noModelo);
    const tipo2 = splitter ? 'SPLITTER' : boxTipo2(cdCodigo);
    tipo2Dist.set(tipo2, (tipo2Dist.get(tipo2) || 0) + 1);
    if (splitter) stats.splitters++; else stats.caixas++;

    // Endereço: original, ou fallback município para o item não cair em "Sem UF".
    let endereco = g('END_CDO');
    if (!endereco && ENRICH) {
      const mun = g('NOME_MUNICIPIO');
      if (mun) { endereco = `${mun} - RJ`; stats.enriquecidas++; }
    }

    // Diagnóstico da caixa de coord do loader (não altera a saída).
    const lat = Number(g('LAT'));
    const lng = Number(g('LONG'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (lat < LOADER_LAT[0] || lat > LOADER_LAT[1] ||
          lng < LOADER_LNG[0] || lng > LOADER_LNG[1]) stats.foraDaCaixaLoader++;
    }

    const status = g('no_nome_estado_operacional');
    if (status && !STATUS_KNOWN.has(status)) stats.statusNaoMapeado++;

    const rowOut = [
      estacao,                         // ESTACAO
      g('NUM_CDO'),                    // CODIGO_EQUIPAMENTO
      g('LAT'),                        // LAT
      g('LONG'),                       // LONG
      g('FABRICANTE'),                 // FABRICANTE
      g('ds_grupo_operacional'),       // ds_grupo_operacional
      g('ds_estado_controle'),         // ds_estado_controle
      g('dt_data_estado_controle'),    // dt_data_estado_controle
      status,                          // STATUS
      noModelo,                        // MODELO
      g('cd_tipo'),                    // TIPO
      tipo2,                           // Tipo2
      cdCodigo,                        // NOME_EQUIPAMENTO
      endereco,                        // Endereço
    ].map(cell);

    await write(rowOut.join(';'));
    stats.escritas++;
  }

  out.end();
  await once(out, 'finish');

  const pct = (x) => `${((100 * x) / (stats.linhas || 1)).toFixed(1)}%`;
  console.log(`Origem  : ${IN_PATH}`);
  console.log(`Destino : ${OUT_PATH}  (ISO-8859-1, ';')`);
  if (MUNI_FILTER) {
    console.log(`Filtro município: ${[...MUNI_FILTER].join(', ')}  (descartadas ${stats.filtradas} de outros municípios)`);
  }
  console.log(`\nLinhas lidas      : ${stats.linhas}`);
  console.log(`Linhas escritas   : ${stats.escritas}  (${stats.caixas} caixas + ${stats.splitters} splitters)`);
  console.log(`Sem estação       : ${stats.semEstacao}  (ESTACAO vazia → agrupadas em "${ORPHAN_ESTACAO}")`);
  if (ENRICH) console.log(`Endereços enriq.  : ${stats.enriquecidas}  (END_CDO vazio → "<município> - RJ")`);
  if (stats.statusNaoMapeado) {
    console.log(`STATUS fora do mapa: ${stats.statusNaoMapeado}  (ex.: "Em Manutenção"/"Com Defeito"; o loader trata como Bloqueado/suspended via resolveStatus)`);
  }
  console.log('\nDistribuição de Tipo2 (saída):');
  for (const [k, v] of [...tipo2Dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  if (stats.foraDaCaixaLoader) {
    console.log(`\n⚠ ${stats.foraDaCaixaLoader} ponto(s) (${pct(stats.foraDaCaixaLoader)}) caem FORA da caixa de coordenadas`);
    console.log(`  do load-recursos-netwin.mjs (LAT[${LOADER_LAT}], LNG[${LOADER_LNG}]) e seriam`);
    console.log(`  descartados na carga — ajuste LAT_RANGE/LNG_RANGE no loader antes do --apply.`);
  }
  console.log('\nPróximo passo:');
  console.log(`  node scripts/load-recursos-netwin.mjs --file ${OUT_PATH}            # dry-run`);
  console.log(`  node scripts/load-recursos-netwin.mjs --file ${OUT_PATH} --apply    # grava`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
