#!/usr/bin/env node
/**
 * Reparo heurístico de TENANT_LATITUDE/TENANT_LONGITUDE corrompidos por
 * reformatação de planilha (Excel/LibreOffice sob locale pt-BR).
 *
 * Sintoma: uma célula puramente numérica como "-47.9441935" (ponto decimal),
 * ao passar por uma planilha configurada com vírgula decimal, é reinterpretada
 * como inteiro e reexportada com pontos de milhar: "-479.441.935". Os dígitos
 * são preservados; só a posição do separador se perde. Campos "disfarçados" de
 * texto (com colchetes/vírgula, como GEONET_LOCALIZACAO) escapam ilesos — é
 * assim que se distingue esse padrão de uma corrupção de arquivo genérica.
 *
 * O reparo não "adivinha" o valor original: para cada célula com 2+ pontos
 * (ou 0 pontos onde deveria haver 1), remove todos os pontos e testa, para
 * cada posição plausível de separador decimal, se o número resultante cai
 * dentro da caixa delimitadora da UF declarada na própria linha (UF_BBOX, a
 * mesma fonte usada pelos loaders de recursos/estações). Só aplica quando
 * exatamente UMA posição é geograficamente plausível; ambíguas ou sem
 * candidato plausível ficam de fora do reparo e aparecem no relatório para
 * checagem manual — nunca inventa coordenada.
 *
 * Uso:
 *   node scripts/repair-tenant-coordinates.mjs [--file <csv>]              # dry-run: só relatório
 *   node scripts/repair-tenant-coordinates.mjs [--file <csv>] --apply      # grava de volta (com backup .bak)
 *   node scripts/repair-tenant-coordinates.mjs --file <csv> --out <outro.csv> --apply
 */

import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bboxForUf } from './uf-geo.mjs';

const BRAZIL_BBOX = [-34, 5.3, -74, -28];

function parseArgs(argv) {
  let file = 'legacy-data/onitel.HCs.v4.enriquecido.csv';
  let out = '';
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') file = argv[++i];
    else if (arg === '--out') out = argv[++i];
    else if (arg === '--apply') apply = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return { file, out: out || file, apply };
}

// --- CSV ponto-e-vírgula, ciente de aspas (mesma gramática do enriquecimento). ---
function parseSemicolonCsv(input) {
  const bom = input.charCodeAt(0) === 0xfeff;
  const text = bom ? input.slice(1) : input;
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  const [headers, ...data] = records;
  return { bom, lineEnding, headers, records: data };
}

function serializeSemicolonCsv(doc) {
  const escape = (v) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [doc.headers, ...doc.records].map((r) => r.map(escape).join(';'));
  return `${doc.bom ? '﻿' : ''}${rows.join(doc.lineEnding)}${doc.lineEnding}`;
}

// --- Reparo por posição de decimal plausível ---

// Classifica e tenta reparar uma célula. Retorna:
//   { status: 'ok' }              já limpa, dentro do range — não mexe
//   { status: 'vazio' }           célula vazia ou placeholder (#N/D) — não mexe
//   { status: 'reparado', value } corrigido com confiança (posição única plausível)
//   { status: 'ambiguo' }         2+ posições plausíveis — não mexe, reporta
//   { status: 'irrecuperavel' }   nenhuma posição plausível — não mexe, reporta
function repairCell(raw, range) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '#N/D') return { status: 'vazio' };

  const asIs = Number(trimmed.replace(',', '.'));
  if (Number.isFinite(asIs) && asIs >= range[0] && asIs <= range[1]) return { status: 'ok' };

  // Só mexe em valores puramente numéricos (dígitos, ponto(s), sinal opcional).
  // Vírgula decimal ou qualquer outro caractere sai por aqui — não é o padrão
  // de corrupção que este script sabe reparar.
  const sign = trimmed.startsWith('-') ? -1 : 1;
  const body = trimmed.replace(/^[-+]/, '');
  if (!/^[\d.]+$/.test(body)) return { status: 'irrecuperavel' };
  const digits = body.replace(/\./g, '');
  if (digits.length < 2) return { status: 'irrecuperavel' };

  const candidates = [];
  for (let k = 1; k < digits.length; k += 1) {
    const value = sign * Number(`${digits.slice(0, k)}.${digits.slice(k)}`);
    if (value >= range[0] && value <= range[1]) candidates.push(value);
  }
  if (candidates.length === 1) return { status: 'reparado', value: candidates[0] };
  return { status: candidates.length > 1 ? 'ambiguo' : 'irrecuperavel' };
}

async function main() {
  const { file, out, apply } = parseArgs(process.argv.slice(2));
  const text = await readFile(file, 'utf8');
  const doc = parseSemicolonCsv(text);
  const index = new Map(doc.headers.map((h, i) => [h.trim(), i]));
  for (const col of ['UF', 'ID', 'TENANT_LATITUDE', 'TENANT_LONGITUDE']) {
    if (!index.has(col)) throw new Error(`Coluna obrigatória ausente no CSV: ${col}`);
  }
  const latPos = index.get('TENANT_LATITUDE');
  const lngPos = index.get('TENANT_LONGITUDE');
  const ufPos = index.get('UF');
  const idPos = index.get('ID');

  const counts = { ok: 0, vazio: 0, reparado: 0, ambiguo: 0, irrecuperavel: 0 };
  const samples = { reparado: [], ambiguo: [], irrecuperavel: [] };

  // lat e lng são reparados de forma independente: um eixo já limpo ou
  // corrigível não fica refém do outro estar ambíguo/irrecuperável — o par só
  // vira coordenada utilizável quando os dois, individualmente, estiverem OK
  // (o que tenantLocationOf() do enriquecimento já exige de qualquer forma).
  const priority = { irrecuperavel: 0, ambiguo: 1, reparado: 2, vazio: 3, ok: 4 };
  for (const row of doc.records) {
    const uf = row[ufPos]?.trim().toUpperCase();
    const bbox = bboxForUf(uf);
    const latRange = bbox ? [bbox[0], bbox[1]] : [BRAZIL_BBOX[0], BRAZIL_BBOX[1]];
    const lngRange = bbox ? [bbox[2], bbox[3]] : [BRAZIL_BBOX[2], BRAZIL_BBOX[3]];

    const latResult = repairCell(row[latPos] ?? '', latRange);
    const lngResult = repairCell(row[lngPos] ?? '', lngRange);
    if (latResult.status === 'reparado') row[latPos] = String(latResult.value);
    if (lngResult.status === 'reparado') row[lngPos] = String(lngResult.value);

    const rowStatus =
      priority[latResult.status] <= priority[lngResult.status] ? latResult.status : lngResult.status;
    counts[rowStatus] = (counts[rowStatus] ?? 0) + 1;
    if (rowStatus !== 'ok' && rowStatus !== 'vazio' && samples[rowStatus]?.length < 8) {
      samples[rowStatus].push({
        id: row[idPos],
        uf,
        rawLat: row[latPos],
        rawLng: row[lngPos],
        latStatus: latResult.status,
        lngStatus: lngResult.status,
      });
    }
  }

  console.log(`Arquivo: ${file}`);
  console.log(`Total de linhas: ${doc.records.length}`);
  console.log('Resultado:', counts);
  for (const key of ['reparado', 'ambiguo', 'irrecuperavel']) {
    if (samples[key].length) {
      console.log(`\nAmostra (${key}):`);
      console.log(JSON.stringify(samples[key], null, 2));
    }
  }

  if (!apply) {
    console.log('\nDry-run — nada foi gravado. Rode de novo com --apply para persistir.');
    return;
  }

  const backupPath = `${resolve(file)}.bak`;
  await writeFile(backupPath, text, 'utf8');
  console.log(`\nBackup do estado atual salvo em: ${backupPath}`);

  const serialized = serializeSemicolonCsv(doc);
  const tmpPath = `${resolve(out)}.repair-${process.pid}.tmp`;
  await writeFile(tmpPath, serialized, 'utf8');
  await rename(tmpPath, resolve(out)).catch(async (error) => {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  });
  console.log(`Gravado: ${out} (${counts.reparado} linha(s) com coordenada da tenant reparada).`);
}

main().catch((error) => {
  console.error(`Falha no reparo: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
