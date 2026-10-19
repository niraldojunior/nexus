import { describe, expect, it } from 'vitest';
import {
  addSupersededBy,
  applyReconciliationPlan,
  assertReconcileInvocation,
  buildReconciliationPlan,
  parseReconcileOptions,
  relatedPartyConflict,
  type SpecificationAction,
  type TargetSpecification,
} from '../src/scripts/reconcile-netwin-resource-specifications.js';
import { groupEquipmentSpecs } from '../src/scripts/netwin-migration/concrete-spec-groups.js';
import { equipmentModelSpecId } from '../src/scripts/netwin-migration/concrete-specs.js';

const groups = groupEquipmentSpecs([
  { sourceId: '10:20', resourceTypeCode: 'OLT', model: 'ZX', modelCode: 'ZX', manufacturer: 'ZTE', sapMaterialCode: 'A' },
  { sourceId: '10:21', resourceTypeCode: 'OLT', model: ' ZX ', modelCode: 'zx', manufacturer: 'zte', sapMaterialCode: 'a' },
]).groups;
const canonicalId = groups[0]!.canonicalId;
const legacyId = equipmentModelSpecId(10, 20);

const specification = (overrides: Partial<TargetSpecification> = {}): TargetSpecification => ({
  id: legacyId,
  name: 'OLT ZX',
  resourceTypeId: 'olt-type',
  description: null,
  relatedParty: null,
  validForEnd: null,
  characteristics: JSON.stringify([{ name: '_origin.id', value: '10:20' }]),
  ...overrides,
});

describe('reconcile-netwin-resource-specifications', () => {
  it('lê flags e mantém dry-run como padrão', () => {
    expect(parseReconcileOptions([], { ORACLE_OBJECT_PREFIX: 'NX_TEST_' })).toMatchObject({
      targetPrefix: 'NX_TEST_', tenantId: 'vtal', batchSize: 250, apply: false, confirmed: false,
    });
    expect(() => parseReconcileOptions(['--batch-size', '0'])).toThrow('--batch-size');
    expect(() => assertReconcileInvocation({ targetPrefix: 'NX_', tenantId: 'vtal', batchSize: 1, apply: true, confirmed: false })).toThrow('confirmação');
    expect(() => assertReconcileInvocation({ targetPrefix: 'NX_', tenantId: 'vtal', batchSize: 1, apply: false, confirmed: true })).toThrow('exige --apply');
  });

  it('trata conflitos como resultado auditável no dry-run', () => {
    const plan = buildReconciliationPlan(groups, [specification()]);
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]).toMatchObject({ reason: 'canonical-specification-missing' });
  });

  it('repointa somente grupo seguro e preserva characteristics ao aposentá-lo', () => {
    const plan = buildReconciliationPlan(groups, [
      specification(),
      specification({ id: canonicalId, name: 'OLT ZX canônico', characteristics: JSON.stringify([{ name: '_origin.id', value: '10:20' }]) }),
    ], new Map([[legacyId, { total: 3, active: 2, ended: 1 }]]));
    expect(plan.blocks).toEqual([]);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({ legacyId, canonicalId, physical: { total: 3, active: 2, ended: 1 }, retire: true });
    expect(JSON.parse(plan.actions[0]!.characteristics)).toContainEqual({
      name: '_origin.extra', value: { supersededBy: canonicalId }, valueType: 'json',
    });
  });

  it('bloqueia falta de canônica e conflitos de characteristic customizada', () => {
    const missing = buildReconciliationPlan(groups, [specification()]);
    expect(missing.blocks[0]).toMatchObject({ reason: 'canonical-specification-missing' });
    const conflict = buildReconciliationPlan(groups, [
      specification({ characteristics: JSON.stringify([{ name: 'assetClass', value: 'A' }]) }),
      specification({ id: canonicalId, characteristics: JSON.stringify([{ name: 'assetClass', value: 'B' }]) }),
    ]);
    expect(conflict.blocks[0]).toMatchObject({ reason: 'custom-characteristic-conflict' });
  });

  it('não sobrescreve provenance contraditória', () => {
    expect(addSupersededBy(JSON.stringify([{ name: '_origin.extra', value: { supersededBy: 'other' } }]), canonicalId)).toEqual({ conflict: 'origin-extra-conflict' });
    expect(addSupersededBy('{not-json', canonicalId)).toEqual({ conflict: 'characteristics-invalid' });
  });

  it('valida relatedParty e detecta divergência real de fabricante', () => {
    const cisco = JSON.stringify([{ role: 'manufacturer', name: 'CISCO' }]);
    const huawei = JSON.stringify([{ role: 'manufacturer', name: 'HUAWEI' }]);
    expect(relatedPartyConflict(cisco, cisco)).toBe(false);
    expect(relatedPartyConflict(null, cisco)).toBe(false);
    expect(relatedPartyConflict(cisco, null)).toBe(false);
    expect(relatedPartyConflict(cisco, huawei)).toBe(true);
    const customParty = JSON.stringify([{ role: 'customRole', name: 'CUSTOM' }]);
    expect(relatedPartyConflict(customParty, cisco)).toBe(true);
  });

  it('emite SQL tenant-scoped e efetiva commits por lote', async () => {
    const calls: Array<{ sql: string; params: unknown }> = [];
    let commits = 0;
    const action: SpecificationAction = {
      legacyId, canonicalId, legacyName: 'legacy', physical: { total: 1, active: 1, ended: 0 }, logical: { total: 2, active: 1, ended: 1 }, characteristics: '[]', retire: true,
    };
    const fake = {
      execute: async (sql: string, params?: unknown) => {
        calls.push({ sql, params });
        return { rowsAffected: 1 };
      },
      commit: async () => { commits++; },
      rollback: async () => undefined,
    };
    await expect(applyReconciliationPlan(fake as never, { physical: 'P_RESOURCE_PHYSICAL', logical: 'P_RESOURCE_LOGICAL', specification: 'P_RESOURCE_SPECIFICATION' }, 'vtal', [action], 1)).resolves.toEqual({ physicalUpdated: 1, logicalUpdated: 1, specificationsRetired: 1 });
    expect(commits).toBe(1);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.sql).toContain('tenant_id = :tenantId');
    expect(calls[1]!.sql).toContain('tenant_id = :tenantId');
    expect(calls[2]!.sql).toContain('NVL(valid_for_end, CURRENT_TIMESTAMP)');
    expect(calls[0]!.params).toMatchObject({ tenantId: 'vtal', legacyId, canonicalId });
  });
});
