import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import type { ResourceCatalogNode } from '../src/modules/resource/domain.js';
import {
  computeCatalogChecksum,
  parseLlmProposalArguments,
  parseProposalEnvelope,
  planAiOperations,
} from '../src/modules/resource/resource-catalog-ai-planner.js';
import {
  AI_TOOL_NAME,
  ResourceCatalogAiOptimizer,
} from '../src/modules/resource/resource-catalog-ai-optimizer.js';

const node = (
  id: string,
  kind: 'GROUP' | 'RESOURCE_TYPE',
  parent: string | undefined,
  sortOrder: number,
  extra: Partial<ResourceCatalogNode> = {},
): ResourceCatalogNode => ({
  '@type': 'ResourceCatalogNode',
  id,
  href: `/x/${id}`,
  catalogId: 'cat',
  ...(parent ? { parentNodeId: parent } : {}),
  code: id,
  name: id.toUpperCase(),
  kind,
  status: 'active',
  sortOrder,
  tenantId: 't',
  ...extra,
});

const nodes = (): ResourceCatalogNode[] => [
  node('g1', 'GROUP', undefined, 0),
  node('g2', 'GROUP', undefined, 1),
  node('a', 'RESOURCE_TYPE', 'g1', 0),
  node('b', 'RESOURCE_TYPE', 'g1', 1),
];

const plan = (ops: unknown[]) =>
  planAiOperations(
    nodes(),
    parseLlmProposalArguments({
      summary: 's',
      rationale: 'r',
      operations: ops,
    }).operations,
  );

describe('planAiOperations', () => {
  test('creates, moves, renames, reorders and inactivates', () => {
    const result = plan([
      { type: 'create', ref: 'new:x', kind: 'GROUP', name: 'Novo', parentRef: null },
      { type: 'move', nodeRef: 'a', parentRef: 'new:x' },
      { type: 'rename', nodeRef: 'b', name: 'Renomeado' },
      { type: 'reorder', parentRef: null, orderedRefs: ['g2', 'g1', 'new:x'] },
      { type: 'inactivate', nodeRef: 'b' },
    ]);
    assert.deepEqual(result.counters, {
      created: 1,
      renamed: 1,
      moved: 1,
      reordered: 2,
      inactivated: 1,
    });
    assert.equal(result.nodes.get('g2')!.sortOrder, 0);
    assert.equal(result.nodes.get('a')!.parentId, 'new:x');
    assert.equal(result.projectedTree[0]!.id, 'g2');
  });

  test('rejects unknown ids, duplicate refs and duplicate codes', () => {
    assert.throws(() => plan([{ type: 'inactivate', nodeRef: 'zzz' }]), /unknown node/);
    const create = { type: 'create', ref: 'new:x', kind: 'GROUP', name: 'N', parentRef: null };
    assert.throws(() => plan([create, create]), /duplicate reference/);
    assert.throws(() => plan([{ ...create, code: 'G1' }]), /already exists/);
  });

  test('rejects leaf parents, cycles and incomplete reorders', () => {
    assert.throws(() => plan([{ type: 'move', nodeRef: 'b', parentRef: 'a' }]), /not a group/);
    assert.throws(
      () =>
        plan([
          { type: 'create', ref: 'new:c', kind: 'GROUP', name: 'C', parentRef: 'g1' },
          { type: 'move', nodeRef: 'g1', parentRef: 'new:c' },
        ]),
      /cycle/,
    );
    assert.throws(
      () => plan([{ type: 'reorder', parentRef: 'g1', orderedRefs: ['a'] }]),
      /every child/,
    );
  });

  test('rejects leaving active nodes under an inactivated group', () => {
    assert.throws(() => plan([{ type: 'inactivate', nodeRef: 'g1' }]), /inactivated group/);
  });

  test('is deterministic and checksum tracks changes', () => {
    const ops = [{ type: 'rename', nodeRef: 'a', name: 'Outro' }];
    assert.deepEqual(plan(ops).projectedTree, plan(ops).projectedTree);
    const before = computeCatalogChecksum('cat', nodes());
    assert.equal(before, computeCatalogChecksum('cat', [...nodes()].reverse()));
    const changed = nodes();
    changed[0] = { ...changed[0]!, name: 'X' };
    assert.notEqual(before, computeCatalogChecksum('cat', changed));
  });
});

describe('strict parsing', () => {
  test('rejects extra fields and operations', () => {
    assert.throws(() =>
      parseLlmProposalArguments({ summary: 's', rationale: 'r', operations: [], x: 1 }),
    );
    assert.throws(() =>
      parseLlmProposalArguments({
        summary: 's',
        rationale: 'r',
        operations: [{ type: 'delete', nodeRef: 'a' }],
      }),
    );
    assert.throws(() =>
      parseLlmProposalArguments({
        summary: 's',
        rationale: 'r',
        operations: [{ type: 'inactivate', nodeRef: 'a', extra: true }],
      }),
    );
    assert.throws(() => parseProposalEnvelope('nope'));
  });
});

describe('ResourceCatalogAiOptimizer', () => {
  const source = {
    catalog: { id: 'cat', name: 'Cat', code: 'cat' },
    nodes: nodes(),
    resourceTypes: [],
    relationshipRules: [],
  } as never;

  test('returns a validated preview from the tool call', async () => {
    const optimizer = new ResourceCatalogAiOptimizer({
      completeWithTool: async () => ({
        toolName: AI_TOOL_NAME,
        arguments: {
          summary: 's',
          rationale: 'r',
          operations: [{ type: 'rename', nodeRef: 'a', name: 'Novo nome' }],
        },
      }),
    });
    const preview = await optimizer.preview(source);
    assert.equal(preview.counters.renamed, 1);
    assert.equal(preview.proposal.baselineChecksum, computeCatalogChecksum('cat', nodes()));
  });

  test('fails when the provider is missing, silent or throws', async () => {
    await assert.rejects(new ResourceCatalogAiOptimizer(undefined).preview(source), {
      statusCode: 503,
    });
    await assert.rejects(
      new ResourceCatalogAiOptimizer({ completeWithTool: async () => undefined }).preview(source),
      { statusCode: 422 },
    );
    await assert.rejects(
      new ResourceCatalogAiOptimizer({
        completeWithTool: async () => {
          throw new Error('boom');
        },
      }).preview(source),
      { statusCode: 502 },
    );
  });
});
