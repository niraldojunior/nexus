// ReferenceDataStudioAdapter (Studio -> Dados de Referência, issue #196/#191). Testa validate() e
// materialize() contra um fake em memória de IReferenceDataRepository — o adapter só depende da
// interface, não da implementação Oracle (mesmo raciocínio de spatial-studio-adapter.unit.spec.ts
// ao usar o GeoRepository real em vez de subir um Oracle).

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ReferenceDataStudioAdapter } from '../src/modules/studio/adapters/reference-data-studio-adapter.js';
import type {
  CreateReferenceDataSetInput,
  CreateReferenceDataValueInput,
  ReferenceDataSet,
  ReferenceDataValue,
  UpdateReferenceDataSetInput,
  UpdateReferenceDataValueInput,
} from '../src/modules/reference-data/domain.js';
import type { IReferenceDataRepository } from '../src/modules/reference-data/repository.js';

class InMemoryReferenceDataRepository implements IReferenceDataRepository {
  private sets = new Map<string, ReferenceDataSet>();
  private values = new Map<string, ReferenceDataValue>();
  private seq = 0;
  private nextId = () => `id-${(this.seq += 1)}`;

  async listSets(tenantId: string, includeInactive = false): Promise<ReferenceDataSet[]> {
    return [...this.sets.values()].filter((s) => s.tenantId === tenantId && (includeInactive || s.active));
  }
  async getSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const set = this.sets.get(id);
    return set && set.tenantId === tenantId ? set : null;
  }
  async getSetByKey(tenantId: string, key: string): Promise<ReferenceDataSet | null> {
    return [...this.sets.values()].find((s) => s.tenantId === tenantId && s.key === key) ?? null;
  }
  async createSet(tenantId: string, input: CreateReferenceDataSetInput): Promise<ReferenceDataSet> {
    const now = new Date().toISOString();
    const set: ReferenceDataSet = {
      id: this.nextId(),
      tenantId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.sets.set(set.id, set);
    return set;
  }
  async updateSet(tenantId: string, id: string, patch: UpdateReferenceDataSetInput): Promise<ReferenceDataSet | null> {
    const current = await this.getSet(tenantId, id);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.sets.set(id, updated);
    return updated;
  }
  async deactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const current = await this.getSet(tenantId, id);
    if (!current) return null;
    const updated = { ...current, active: false };
    this.sets.set(id, updated);
    return updated;
  }
  async reactivateSet(tenantId: string, id: string): Promise<ReferenceDataSet | null> {
    const current = await this.getSet(tenantId, id);
    if (!current) return null;
    const updated = { ...current, active: true };
    this.sets.set(id, updated);
    return updated;
  }

  async listValues(tenantId: string, setId: string, includeInactive = false): Promise<ReferenceDataValue[]> {
    return [...this.values.values()].filter(
      (v) => v.tenantId === tenantId && v.setId === setId && (includeInactive || v.active),
    );
  }
  async getValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const value = this.values.get(id);
    return value && value.tenantId === tenantId ? value : null;
  }
  async createValue(
    tenantId: string,
    setId: string,
    input: CreateReferenceDataValueInput,
  ): Promise<ReferenceDataValue> {
    const now = new Date().toISOString();
    const value: ReferenceDataValue = {
      id: this.nextId(),
      tenantId,
      setId,
      key: input.key,
      label: input.label,
      sortOrder: input.sortOrder ?? 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.values.set(value.id, value);
    return value;
  }
  async updateValue(
    tenantId: string,
    id: string,
    patch: UpdateReferenceDataValueInput,
  ): Promise<ReferenceDataValue | null> {
    const current = await this.getValue(tenantId, id);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.values.set(id, updated);
    return updated;
  }
  async deactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const current = await this.getValue(tenantId, id);
    if (!current) return null;
    const updated = { ...current, active: false };
    this.values.set(id, updated);
    return updated;
  }
  async reactivateValue(tenantId: string, id: string): Promise<ReferenceDataValue | null> {
    const current = await this.getValue(tenantId, id);
    if (!current) return null;
    const updated = { ...current, active: true };
    this.values.set(id, updated);
    return updated;
  }
}

const TENANT_ID = 'default';

test('ReferenceDataStudioAdapter validates snapshot shape, required fields and duplicate keys', async () => {
  const adapter = new ReferenceDataStudioAdapter(new InMemoryReferenceDataRepository());

  const missingArray = await adapter.validate({});
  assert.equal(missingArray.valid, false);
  assert.ok(missingArray.issues.some((issue) => issue.code === 'REFERENCE_DATA_SETS_ARRAY_REQUIRED'));

  const valid = await adapter.validate({
    sets: [{ key: 'uf', name: 'UF', values: [{ key: 'rj', label: 'Rio de Janeiro' }] }],
  });
  assert.equal(valid.valid, true);

  const duplicated = await adapter.validate({
    sets: [
      { key: 'uf', name: 'UF', values: [{ key: 'rj', label: 'Rio de Janeiro' }, { key: 'RJ', label: 'dup' }] },
      { key: 'UF', name: 'UF dup', values: [] },
    ],
  });
  assert.equal(duplicated.valid, false);
  assert.ok(duplicated.issues.some((issue) => issue.code === 'REFERENCE_DATA_SET_KEY_DUPLICATE'));
  assert.ok(duplicated.issues.some((issue) => issue.code === 'REFERENCE_DATA_VALUE_KEY_DUPLICATE'));
});

test('ReferenceDataStudioAdapter materialize creates sets/values and never deletes physically', async () => {
  const repository = new InMemoryReferenceDataRepository();
  const adapter = new ReferenceDataStudioAdapter(repository);
  const context = { tenantId: TENANT_ID };

  await adapter.materialize(
    {
      sets: [
        {
          key: 'uf',
          name: 'UF',
          values: [
            { key: 'rj', label: 'Rio de Janeiro', sortOrder: 1 },
            { key: 'sp', label: 'São Paulo', sortOrder: 2 },
          ],
        },
      ],
    },
    context,
  );

  const sets = await repository.listSets(TENANT_ID, true);
  assert.equal(sets.length, 1);
  const [ufSet] = sets;
  const values = await repository.listValues(TENANT_ID, ufSet!.id, true);
  assert.equal(values.length, 2);
  assert.ok(values.every((value) => value.active));

  // Republicar sem o valor "sp" e sem o conjunto "uf" deve inativar (nunca excluir fisicamente, C6).
  await adapter.materialize({ sets: [] }, context);

  const setsAfterDiscard = await repository.listSets(TENANT_ID, true);
  assert.equal(setsAfterDiscard.length, 1, 'o registro deve continuar existindo, apenas inativo');
  assert.equal(setsAfterDiscard[0]?.active, false);
  // Igual a PartiesStudioAdapter: um conjunto ausente do snapshot só inativa o conjunto — seus
  // valores não são tocados (ficam ocultos porque o conjunto pai já está inativo).
  const valuesAfterDiscard = await repository.listValues(TENANT_ID, ufSet!.id, true);
  assert.equal(valuesAfterDiscard.length, 2, 'os valores continuam existindo, sem exclusão física');

  // Republicar o mesmo conjunto (agora por chave, sem id) restabelece a baseline ativa.
  await adapter.materialize(
    { sets: [{ key: 'uf', name: 'UF', values: [{ key: 'rj', label: 'Rio de Janeiro', sortOrder: 1 }] }] },
    context,
  );
  const setsAfterRepublish = await repository.listSets(TENANT_ID, true);
  assert.equal(setsAfterRepublish.length, 1);
  assert.equal(setsAfterRepublish[0]?.active, true, 'reativação restabelece o conjunto ao publicar de novo');
  const valuesAfterRepublish = await repository.listValues(TENANT_ID, ufSet!.id, true);
  const rj = valuesAfterRepublish.find((v) => v.key === 'rj');
  const sp = valuesAfterRepublish.find((v) => v.key === 'sp');
  assert.equal(rj?.active, true);
  assert.equal(sp?.active, false, 'valor ausente do novo snapshot permanece inativo, não é ressuscitado');
});

test('ReferenceDataStudioAdapter materialize rejects invalid snapshots and unknown ids', async () => {
  const repository = new InMemoryReferenceDataRepository();
  const adapter = new ReferenceDataStudioAdapter(repository);
  const context = { tenantId: TENANT_ID };

  await assert.rejects(() => adapter.materialize({ sets: [{ key: '', name: '' }] }, context));
  await assert.rejects(() =>
    adapter.materialize({ sets: [{ id: 'does-not-exist', key: 'uf', name: 'UF' }] }, context),
  );
});
