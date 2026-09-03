import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  MAP_FEATURE_POINT_INSERT_SQL,
  candidatesSql,
} from '../src/modules/geo/map-feature-synchronizer.js';
import { INTERNAL_RESOURCE_TYPES } from '../src/modules/geo/map-visibility.js';

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

// Regressão da divergência que deixou Porta de Splitter vazar no mapa (issue de "portas de
// splitter não devem ser exibidas no mapa"): o write-through só excluía 'Splitter'. A régua
// certa vem de map-visibility.ts (fonte única, ver também build-map-features.mjs e
// tree-service.ts); estes testes conferem o SQL de candidatos direto no texto, sem banco.
const CANDIDATES_SQL = candidatesSql('?,?');

test('candidatesSql exclui todo tipo de recurso interno (Splitter e Porta)', () => {
  assert.deepEqual([...INTERNAL_RESOURCE_TYPES].sort(), ['Port', 'Splitter']);
  for (const type of INTERNAL_RESOURCE_TYPES) {
    assert.ok(
      CANDIDATES_SQL.includes(`'${type}'`),
      `esperava a exclusão de '${type}' no SQL de candidatos`,
    );
  }
});

test('candidatesSql filtra recurso por map_presence do ResourceType vinculado por FK', () => {
  assert.match(
    CANDIDATES_SQL,
    /JOIN tmf_resource_type rt\s+ON rt\.id = rs\.resource_type_id AND rt\.tenant_id = rs\.tenant_id/,
  );
  assert.doesNotMatch(CANDIDATES_SQL, /rt\.code = rs\.resource_type/);
  assert.match(CANDIDATES_SQL, /COALESCE\(rt\.map_presence, 1\) = 1/);
});

test('candidatesSql restringe site a category = Site, fora de projeto em curso', () => {
  assert.match(CANDIDATES_SQL, /spec\.category = 'Site'/);
  assert.doesNotMatch(CANDIDATES_SQL, /'SubSite'/);
  assert.match(CANDIDATES_SQL, /geo_project_site/);
  assert.match(CANDIDATES_SQL, /p\.status <> 'terminated'/);
});
