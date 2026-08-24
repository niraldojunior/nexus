// Parser CSV RFC4180 (aspas, aspas escapadas, campo com quebra de linha, CRLF) com autodetecção de
// delimitador entre `;` e `,`. Espelha web/src/utils/csv.ts — cópia server-side porque o projeto
// web é isolado (sem alias para src/) e este parser é consumido por scripts Node em dist/.
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

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}
