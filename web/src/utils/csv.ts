// Parser/writer CSV genérico usado pela carga em massa do catálogo de Recursos (ver
// resourceSpecificationImport.ts). Suporta RFC4180 (aspas, aspas escapadas, campo com quebra de
// linha, CRLF) e autodetecta o delimitador entre `;` e `,` — o Excel pt-BR grava `;` por padrão.

export function detectCsvDelimiter(headerLine: string): ',' | ';' {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

export function parseCsv(text: string, delimiter?: ',' | ';'): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!clean.trim()) return [];
  const sep =
    delimiter ?? detectCsvDelimiter(clean.slice(0, clean.indexOf('\n') + 1 || clean.length));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === sep) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) pushRow();

  // Descarta linhas totalmente em branco — inclui tanto a linha vazia simples (`\n\n`) quanto a
  // linha "fantasma" que o Excel às vezes grava no fim do arquivo, com todos os campos vazios mas
  // ainda separados por delimitador (`;;;;;;;;;;;;`) — sem isso, essa linha vira uma "linha" real
  // com N células vazias e falha a validação por "categoria/tipo obrigatórios".
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function escapeCsvField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][], delimiter: ',' | ';' = ';'): string {
  return rows
    .map((cells) => cells.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter))
    .join('\r\n');
}

// BOM UTF-8 garante que o Excel pt-BR abra acentuação corretamente ao clicar duas vezes no arquivo.
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
