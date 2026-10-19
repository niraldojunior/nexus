import { describe, expect, it } from 'vitest';
import type { ResourceTypeRelationshipRule } from '../../services/resourceApi';
import {
  collectTypeIds,
  createStandardNode,
  remainingCapacity,
  standardChildren,
  standardRules,
} from './resource-component-structure';

const rule = (
  id: string,
  targetId: string,
  configuration?: ResourceTypeRelationshipRule['configuration'],
  max?: number,
): ResourceTypeRelationshipRule =>
  ({
    '@type': 'ResourceTypeRelationshipRule',
    id,
    href: '',
    sourceResourceTypeId: 'root',
    relationshipTypeCode: 'containsAsChild',
    targetKind: 'RESOURCE_TYPE',
    targetId,
    lifecycleStatus: 'Active',
    ...(configuration ? { configuration } : {}),
    ...(max !== undefined ? { cardinality: { maxTargetPerSource: max } } : {}),
  }) as ResourceTypeRelationshipRule;

const linear = {
  version: 1,
  placementPolicy: 'LINEAR',
  axis: 'vertical',
  unitLabel: 'U',
  capacity: 4,
  numberingDirection: 'ascending',
} as const;

describe('resource-component-structure', () => {
  it('seleciona regras NONE e sem configuração, excluindo LINEAR', () => {
    const rules = [
      rule('a', 't1'),
      rule('b', 't2', { version: 1, placementPolicy: 'NONE' }),
      rule('c', 't3', linear),
    ];
    expect(standardRules(rules).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('cria filho sem placement e com a definição da regra', () => {
    const node = createStandardNode(rule('a', 't1'), 'spec', 'X-01');
    expect(node.placement).toBeUndefined();
    expect(node.relationshipDefinitionId).toBe('a');
    expect(node.typeId).toBe('t1');
  });

  it('respeita a cardinalidade máxima', () => {
    const r = rule('a', 't1', undefined, 2);
    const child = createStandardNode(r, 's', 'A');
    expect(remainingCapacity([child], r, [r])).toBe(1);
    expect(remainingCapacity([child, { ...child, key: 'k2' }], r, [r])).toBe(0);
    expect(remainingCapacity([], rule('b', 't1'), [])).toBeUndefined();
  });

  it('separa filhos posicionais dos padrão', () => {
    const rules = [rule('a', 't1'), rule('c', 't3', linear)];
    const std = createStandardNode(rules[0]!, 's', 'A');
    const pos = {
      ...createStandardNode(rules[1]!, 's', 'B'),
      placement: { placementPolicy: 'LINEAR' as const, position: 1 },
    };
    expect(standardChildren([std, pos], rules)).toEqual([std]);
  });

  it('coleta typeIds de toda a árvore', () => {
    const r = rule('a', 't1');
    const leaf = createStandardNode(r, 's', 'L');
    const parent = { ...createStandardNode(rule('b', 't2'), 's', 'P'), children: [leaf] };
    expect(collectTypeIds([parent]).sort()).toEqual(['t1', 't2']);
  });
});

describe('ordenação natural dos filhos padrão', () => {
  it('ordena 1, 2, 10 numericamente e não lexicograficamente', async () => {
    const { standardChildren } = await import('./resource-component-structure');
    const mk = (name: string) => ({ key: name, name, children: [] }) as never;
    const names = standardChildren(['S_1:8_10', 'S_1:8_2', 'S_1:8_1', 'S_1:8_11'].map(mk), []).map(
      (c) => c.name,
    );
    expect(names).toEqual(['S_1:8_1', 'S_1:8_2', 'S_1:8_10', 'S_1:8_11']);
  });
});
