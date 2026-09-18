import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';
import { OracleGeoRepository } from '../src/modules/geo/oracle-repository.js';
import type {
  Characteristic,
  GeographicSite,
  GeographicSiteSpecification,
} from '../src/modules/geo/domain.js';
import { cleanupOracleTables, getOracleTestClient, isOracleTestConfigured } from './test-utils.js';

// O backfill de característica obrigatória (issue #266) é o único caminho do módulo Geo que escreve
// dentro do array JSON de `characteristics` com um UPDATE set-based. Oracle 19c não tem
// JSON_TRANSFORM, então o append é textual (SUBSTR + concat) e a idempotência vem de um NOT EXISTS
// sobre JSON_TABLE — duas coisas que só se provam contra um Oracle real. `oracle-dialect.spec.ts`
// garante a forma do SQL; este spec garante o comportamento.
const oracleConfigured = isOracleTestConfigured();
if (oracleConfigured) process.env.DATABASE_AUTO_SCHEMA = 'true';

afterAll(async () => {
  if (!oracleConfigured) return;
  const client = await getOracleTestClient();
  await cleanupOracleTables(client);
  await client.close();
});

const specFixture = (id: string): GeographicSiteSpecification => ({
  '@type': 'GeographicSiteSpecification',
  id,
  href: `/v1/geo/site-specifications/${id}`,
  name: 'Central Office',
  code: `CO_${id.toUpperCase()}`,
  category: 'Site',
  siteRole: 'network',
  lifecycleStatus: 'Active',
  specCharacteristic: [{ name: 'capacidade', valueType: 'integer', mandatory: false }],
  allowedParentSpec: [],
  allowedChildSpec: [],
  allowedParentSpecIds: [],
  allowedChildSpecIds: [],
});

const siteFixture = (
  id: string,
  specificationId: string,
  characteristic: GeographicSite['characteristic'],
): GeographicSite => ({
  '@type': 'GeographicSite',
  id,
  href: `/v1/geo/sites/${id}`,
  name: `Site ${id}`,
  status: 'Active',
  siteSpecificationId: specificationId,
  siteSpecification: { id: specificationId, '@referredType': 'GeographicSiteSpecification' },
  relatedSite: [],
  relatedParty: [],
  characteristic,
});

test.skipIf(!oracleConfigured)(
  'appendMissingSiteCharacteristics preenche só o que falta, em array vazio e preenchido (issue #266)',
  async () => {
    const client = await getOracleTestClient();
    await cleanupOracleTables(client);
    const repository = new OracleGeoRepository(client);

    const spec = await repository.upsertSpec(specFixture('spec-backfill'));

    // Array vazio: o CASE tem de montar o primeiro elemento em vez de concatenar num '[]'.
    await repository.upsertSite(siteFixture('site-empty', spec.id, []));
    // Valor falsy já informado: nunca pode ser sobrescrito pelo default.
    await repository.upsertSite(
      siteFixture('site-zero', spec.id, [{ name: 'capacidade', value: 0, valueType: 'integer' }]),
    );
    // Nome em caixa diferente: a comparação é case-insensitive, então já "tem" a característica.
    await repository.upsertSite(
      siteFixture('site-upper', spec.id, [{ name: 'CAPACIDADE', value: 7, valueType: 'integer' }]),
    );
    // Array preenchido com outra característica: o append preserva o que já estava lá.
    await repository.upsertSite(
      siteFixture('site-other', spec.id, [{ name: 'uf', value: 'RJ', valueType: 'string' }]),
    );

    const missing = await repository.countSitesMissingCharacteristics(spec.id, ['capacidade']);
    assert.equal(missing, 2, 'só site-empty e site-other estão sem a característica');

    const result = await repository.appendMissingSiteCharacteristics(spec.id, [
      { name: 'capacidade', value: 12, valueType: 'integer' },
    ]);
    assert.equal(result.updatedSites, 2);
    assert.equal(result.appliedValues, 2);

    const valueFor = async (siteId: string): Promise<unknown> => {
      const site = await repository.getSite(siteId);
      assert.ok(site, `site ${siteId} deveria existir`);
      return site!.characteristic.find(
        (item: Characteristic) => item.name.trim().toLowerCase() === 'capacidade',
      )?.value;
    };

    assert.equal(await valueFor('site-empty'), 12, 'array vazio recebe o default');
    assert.equal(await valueFor('site-other'), 12, 'array preenchido recebe o default');
    assert.equal(await valueFor('site-zero'), 0, 'valor falsy existente é preservado');
    assert.equal(await valueFor('site-upper'), 7, 'nome em outra caixa é preservado');

    // A característica preexistente não pode desaparecer no append textual.
    const other = await repository.getSite('site-other');
    assert.equal(
      other!.characteristic.find((item: Characteristic) => item.name === 'uf')?.value,
      'RJ',
      'característica preexistente sobrevive ao append',
    );

    // Idempotência: rodar de novo não duplica nem reconta.
    const second = await repository.appendMissingSiteCharacteristics(spec.id, [
      { name: 'capacidade', value: 99, valueType: 'integer' },
    ]);
    assert.equal(second.appliedValues, 0, 'segunda execução não altera nenhuma linha');
    assert.equal(await repository.countSitesMissingCharacteristics(spec.id, ['capacidade']), 0);
    assert.equal(await valueFor('site-empty'), 12, 'o default não é reaplicado nem sobrescrito');
    const empty = await repository.getSite('site-empty');
    assert.equal(
      empty!.characteristic.filter(
        (item: Characteristic) => item.name.toLowerCase() === 'capacidade',
      ).length,
      1,
      'nenhuma duplicata de característica',
    );
  },
);
