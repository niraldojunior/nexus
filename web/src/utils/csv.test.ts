import { describe, expect, test } from 'vitest';
import { detectCsvDelimiter, parseCsv, toCsv } from './csv';

describe('detectCsvDelimiter', () => {
  test('prefers semicolon when it is more frequent (Excel pt-BR)', () => {
    expect(detectCsvDelimiter('Nome;Categoria;Tipo')).toBe(';');
  });

  test('falls back to comma when there is no semicolon', () => {
    expect(detectCsvDelimiter('Nome,Categoria,Tipo')).toBe(',');
  });
});

describe('parseCsv', () => {
  test('parses a simple semicolon-delimited file', () => {
    const rows = parseCsv('Nome;Categoria\nOLT-1;Equipment.Access\nOLT-2;Equipment.Access');
    expect(rows).toEqual([
      ['Nome', 'Categoria'],
      ['OLT-1', 'Equipment.Access'],
      ['OLT-2', 'Equipment.Access'],
    ]);
  });

  test('parses comma-delimited files when explicitly requested', () => {
    const rows = parseCsv('Nome,Categoria\nOLT-1,Equipment.Access', ',');
    expect(rows).toEqual([
      ['Nome', 'Categoria'],
      ['OLT-1', 'Equipment.Access'],
    ]);
  });

  test('strips a leading UTF-8 BOM', () => {
    const withBom = '﻿Nome;Categoria\nOLT-1;Equipment.Access';
    const rows = parseCsv(withBom);
    expect(rows[0]).toEqual(['Nome', 'Categoria']);
  });

  test('handles CRLF line endings', () => {
    const rows = parseCsv('Nome;Categoria\r\nOLT-1;Equipment.Access\r\n');
    expect(rows).toEqual([
      ['Nome', 'Categoria'],
      ['OLT-1', 'Equipment.Access'],
    ]);
  });

  test('handles quoted fields with embedded delimiter, quotes and newline', () => {
    const rows = parseCsv(
      'Nome;Descrição\n"OLT ""grande""";"Linha 1\nLinha 2; com ponto e vírgula"',
    );
    expect(rows).toEqual([
      ['Nome', 'Descrição'],
      ['OLT "grande"', 'Linha 1\nLinha 2; com ponto e vírgula'],
    ]);
  });

  test('skips fully blank lines', () => {
    const rows = parseCsv('Nome;Categoria\n\nOLT-1;Equipment.Access\n');
    expect(rows).toEqual([
      ['Nome', 'Categoria'],
      ['OLT-1', 'Equipment.Access'],
    ]);
  });

  test('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n  ')).toEqual([]);
  });

  test('skips a trailing "phantom" row made only of delimiters (Excel export artifact)', () => {
    const rows = parseCsv('Nome;Categoria\nOLT-1;Equipment.Access\n;\n;;;\n');
    expect(rows).toEqual([
      ['Nome', 'Categoria'],
      ['OLT-1', 'Equipment.Access'],
    ]);
  });
});

describe('toCsv / parseCsv round-trip', () => {
  test('escapes and re-parses fields with delimiter, quotes and newlines', () => {
    const rows = [
      ['Nome', 'Descrição'],
      ['OLT "grande"', 'Linha 1\nLinha 2; com ponto e vírgula'],
    ];
    const text = toCsv(rows, ';');
    expect(parseCsv(text, ';')).toEqual(rows);
  });

  test('produces plain fields without quoting when unnecessary', () => {
    const text = toCsv([['OLT-1', 'Equipment.Access']], ';');
    expect(text).toBe('OLT-1;Equipment.Access');
  });
});
