import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  CANONICAL_TEMPLATES_SNAPSHOT,
  TemplatesStudioAdapter,
} from '../src/modules/studio/adapters/templates-studio-adapter.js';
import {
  StudioTemplateImportPlanner,
  type ComputePlanInput,
} from '../src/modules/studio/template-import-planner.js';

import type { ResourceService } from '../src/modules/resource/service.js';

describe('TemplatesStudioAdapter (unit)', () => {
  // Mock resourceService for unit validation
  const mockResourceService = {
    listResourceFunctionSpecifications: async () => [],
    createResourceFunctionSpecification: async () => ({ id: 'spec-1' }),
    updateResourceFunctionSpecification: async () => ({ id: 'spec-1' }),
  } as unknown as ResourceService;
  const adapter = new TemplatesStudioAdapter(mockResourceService);

  it('validates canonical templates snapshot successfully', async () => {
    const result = await adapter.validate(CANONICAL_TEMPLATES_SNAPSHOT as unknown as Record<string, unknown>);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('rejects missing or non-array templates', async () => {
    const result = await adapter.validate({} as Record<string, unknown>);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'TEMPLATES_ARRAY_REQUIRED'));
  });

  it('rejects template without code or with duplicate code', async () => {
    const result = await adapter.validate({
      templates: [
        {
          code: 'ftth-standard',
          name: 'FTTH Standard',
          category: 'FTTH',
          fragments: [{ domain: 'resource-model', payload: {} }],
        },
        {
          code: 'ftth-standard',
          name: 'FTTH Standard 2',
          category: 'FTTH',
          fragments: [{ domain: 'resource-model', payload: {} }],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'TEMPLATE_CODE_DUPLICATE'));
  });

  it('rejects template without fragments or missing fragment domain', async () => {
    const result = await adapter.validate({
      templates: [
        {
          code: 'empty-tpl',
          name: 'Empty Template',
          category: 'General',
          fragments: [],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'TEMPLATE_FRAGMENTS_REQUIRED'));
  });
});

describe('StudioTemplateImportPlanner (unit)', () => {
  const sampleTemplate = CANONICAL_TEMPLATES_SNAPSHOT.templates[0]!;

  it('computes clean plan without collisions when base is empty', () => {
    const input: ComputePlanInput = {
      template: sampleTemplate,
      targets: ['resource-model', 'location-model'],
      baseSnapshots: {
        'resource-model': { nodes: [] },
        'location-model': { specifications: [] },
      },
    };

    const plan = StudioTemplateImportPlanner.computePlan(input);
    assert.equal(plan.templateCode, sampleTemplate.code);
    assert.equal(plan.canApply, true);
    assert.equal(plan.conflicts.length, 0);
    assert.ok(plan.operations.length > 0);
    assert.ok(plan.planChecksum.length > 0);
    assert.ok(plan.resultSnapshots['resource-model']);
    assert.ok(plan.resultSnapshots['location-model']);
  });

  it('detects collisions and sets reject resolution by default', () => {
    const input: ComputePlanInput = {
      template: sampleTemplate,
      targets: ['resource-model'],
      baseSnapshots: {
        'resource-model': {
          nodes: [
            {
              code: 'NODE_CTO_STANDARD',
              name: 'CTO Existente',
              kind: 'RESOURCE_TYPE',
            },
          ],
        },
      },
    };

    const plan = StudioTemplateImportPlanner.computePlan(input);
    assert.equal(plan.canApply, false); // Blocked due to unresolved conflict
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0]?.code, 'NODE_CTO_STANDARD');
    assert.equal(plan.conflicts[0]?.resolution, 'reject');
  });

  it('resolves collision with reuse strategy and produces valid plan', () => {
    const input: ComputePlanInput = {
      template: sampleTemplate,
      targets: ['resource-model'],
      baseSnapshots: {
        'resource-model': {
          nodes: [
            {
              code: 'NODE_CTO_STANDARD',
              name: 'CTO Existente',
              kind: 'RESOURCE_TYPE',
            },
          ],
        },
      },
      conflictResolutions: {
        'resource-model:NODE_CTO_STANDARD': 'reuse',
      },
    };

    const plan = StudioTemplateImportPlanner.computePlan(input);
    assert.equal(plan.canApply, true);
    const op = plan.operations.find((o) => o.originalCode === 'NODE_CTO_STANDARD');
    assert.equal(op?.action, 'reuse');
  });

  it('resolves collision with rename strategy and creates renamed node in target snapshot', () => {
    const input: ComputePlanInput = {
      template: sampleTemplate,
      targets: ['resource-model'],
      baseSnapshots: {
        'resource-model': {
          nodes: [
            {
              code: 'NODE_CTO_STANDARD',
              name: 'CTO Existente',
              kind: 'RESOURCE_TYPE',
            },
          ],
        },
      },
      conflictResolutions: {
        'resource-model:NODE_CTO_STANDARD': 'rename',
      },
    };

    const plan = StudioTemplateImportPlanner.computePlan(input);
    assert.equal(plan.canApply, true);
    const op = plan.operations.find((o) => o.originalCode === 'NODE_CTO_STANDARD');
    assert.equal(op?.action, 'rename');
    assert.notEqual(op?.code, 'NODE_CTO_STANDARD');
    assert.ok(op?.code.startsWith('NODE_CTO_STANDARD_tpl_'));
  });

  it('guarantees deterministic plan checksum for identical inputs', () => {
    const input: ComputePlanInput = {
      template: sampleTemplate,
      targets: ['resource-model', 'location-model'],
      baseSnapshots: {
        'resource-model': { nodes: [] },
        'location-model': { specifications: [] },
      },
    };

    const plan1 = StudioTemplateImportPlanner.computePlan(input);
    const plan2 = StudioTemplateImportPlanner.computePlan(input);
    assert.equal(plan1.planChecksum, plan2.planChecksum);
  });
});
