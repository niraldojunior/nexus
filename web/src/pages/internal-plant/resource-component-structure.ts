import type { ResourceTypeRelationshipRule } from '../../services/resourceApi';
import type { ChildNode } from './ResourceEditorModal';
import { containmentRules, nextKey } from './resource-component-shared';

export const isStandardRule = (rule: ResourceTypeRelationshipRule): boolean =>
  !rule.configuration || rule.configuration.placementPolicy === 'NONE';

/** Regras de contenção com organização padrão (NONE ou sem configuração). */
export const standardRules = (
  rules: ResourceTypeRelationshipRule[] | undefined,
): ResourceTypeRelationshipRule[] => containmentRules(rules).filter(isStandardRule);

export const hasPositionalRules = (rules: ResourceTypeRelationshipRule[] | undefined): boolean =>
  containmentRules(rules).some((rule) => !isStandardRule(rule));

const naturalCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordem natural: S_1 < S_2 < S_10, sem exigir zeros à esquerda. */
export const naturalByName = (a: ChildNode, b: ChildNode): number =>
  naturalCollator.compare(a.name, b.name);

/** Filhos da organização padrão: nunca possuem `placement`. */
export const standardChildren = (
  children: ChildNode[],
  rules: ResourceTypeRelationshipRule[] | undefined,
): ChildNode[] => {
  const positional = new Set(
    containmentRules(rules)
      .filter((rule) => !isStandardRule(rule))
      .map((rule) => rule.id),
  );
  return children
    .filter(
      (child) =>
        !child.placement &&
        !(child.relationshipDefinitionId && positional.has(child.relationshipDefinitionId)),
    )
    .sort(naturalByName);
};

export const countForRule = (
  children: ChildNode[],
  rule: ResourceTypeRelationshipRule,
  rules: ResourceTypeRelationshipRule[],
): number =>
  children.filter((child) =>
    child.relationshipDefinitionId
      ? child.relationshipDefinitionId === rule.id
      : child.typeId === rule.targetId &&
        standardRules(rules).filter((candidate) => candidate.targetId === rule.targetId)[0]?.id ===
          rule.id,
  ).length;

/** Quantos filhos ainda cabem na regra; `undefined` quando ilimitado. */
export const remainingCapacity = (
  children: ChildNode[],
  rule: ResourceTypeRelationshipRule,
  rules: ResourceTypeRelationshipRule[],
): number | undefined => {
  const maximum = rule.cardinality?.maxTargetPerSource;
  return maximum === undefined
    ? undefined
    : Math.max(0, maximum - countForRule(children, rule, rules));
};

export const createStandardNode = (
  rule: ResourceTypeRelationshipRule,
  specId: string,
  name: string,
): ChildNode => ({
  key: nextKey(),
  relationshipDefinitionId: rule.id,
  name,
  specId,
  typeId: rule.targetId,
  status: 'active',
  statusCode: '',
  administrativeState: 'unlocked',
  operationalState: 'enabled',
  usageState: 'idle',
  characteristics: [],
  children: [],
});

export const collectTypeIds = (nodes: ChildNode[]): string[] => [
  ...new Set(nodes.flatMap((node) => [node.typeId, ...collectTypeIds(node.children)])),
];

/** Nome calculado: `<prefixo>_<n>`; sem prefixo, apenas o número. */
export const calculatedName = (
  prefix: string,
  start: number,
  step: number,
  index: number,
): string => {
  const number = start + step * index;
  const base = prefix.trim();
  return base ? `${base}_${number}` : String(number);
};
