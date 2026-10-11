import assert from 'node:assert/strict';
import { test } from 'vitest';
import { planAdministrativeCities } from '../src/scripts/netwin-migration/phase1-administrative-cities.js';

test('planeja municípios com UF comprovada e deduplica pela chave natural', () => {
  const plan = planAdministrativeCities(
    [
      { ID: 1, NAME: 'Niterói' },
      { ID: 2, NAME: 'NITEROI' },
      { ID: 3, NAME: 'Curitiba' },
    ],
    [
      { MUNICIPIO_ID: 1, UF_MIN: 'RJ', UF_MAX: 'RJ' },
      { MUNICIPIO_ID: 2, UF_MIN: 'RJ', UF_MAX: 'RJ' },
      { MUNICIPIO_ID: 3, UF_MIN: 'PR', UF_MAX: 'PR' },
    ],
  );
  assert.equal(plan.tuples.length, 2);
  assert.deepEqual(plan.tuples.map((t) => t.stateCode).sort(), ['PR', 'RJ']);
});

test('nunca adivinha a UF: sem UF, conflitante ou inválida ficam fora', () => {
  const plan = planAdministrativeCities(
    [
      { ID: 1, NAME: 'Sem UF' },
      { ID: 2, NAME: 'Conflito' },
      { ID: 3, NAME: 'Cidade' },
    ],
    [
      { MUNICIPIO_ID: 2, UF_MIN: 'RJ', UF_MAX: 'SP' },
      { MUNICIPIO_ID: 3, UF_MIN: 'XX', UF_MAX: 'XX' },
    ],
  );
  assert.equal(plan.tuples.length, 0);
  assert.equal(plan.withoutUf.length, 1);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.invalid.length, 1);
});
