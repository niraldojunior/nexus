import assert from 'node:assert/strict';
import { test } from 'vitest';
import { MAP_FEATURE_POINT_INSERT_SQL } from '../src/modules/geo/map-feature-synchronizer.js';

// O write-through monta o INSERT de `geo_map_feature` à mão, com a lista de colunas e a de
// VALUES em linhas separadas. Um `?` a mais não quebra typecheck nem lint — estoura só em
// runtime ("INSERT has more expressions than target columns"), no primeiro recurso pontual que
// passar pelo sincronizador. Foi o que aconteceu: a suíte só pegou pelo caminho indireto do
// MCP (geo.create_condominium), ~9 min adentro da rodada. Estes testes conferem a aridade
// direto no SQL exportado, em milissegundos.

const parts = MAP_FEATURE_POINT_INSERT_SQL.match(/\(([^)]+)\)\s*VALUES \(([^)]+)\)/s);

const split = (chunk: string): string[] =>
  chunk
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

test('VALUES tem exatamente uma expressão por coluna', () => {
  assert.ok(parts, 'não consegui separar colunas e VALUES do INSERT');
  const columns = split(parts[1]!);
  const values = split(parts[2]!);
  assert.equal(
    values.length,
    columns.length,
    `VALUES tem ${values.length} expressões para ${columns.length} colunas`,
  );
});

// As três expressões constantes são deliberadas (ver o comentário do SQL); travar a contagem
// evita que alguém troque um literal por `?` sem acrescentar o parâmetro correspondente.
test('14 placeholders + 3 expressões constantes (shape, geometry, rank)', () => {
  assert.ok(parts);
  const values = split(parts[2]!);
  const placeholders = values.filter((value) => value === '?').length;
  assert.equal(placeholders, 14, `esperava 14 placeholders, achei ${placeholders}`);
  assert.equal(values.length - placeholders, 3);
});
