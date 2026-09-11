import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT } from '../src/modules/geo/project-workflow.js';
import { RulesWorkflowsStudioAdapter } from '../src/modules/studio/adapters/rules-workflows-studio-adapter.js';

describe('RulesWorkflowsStudioAdapter (unit)', () => {
  const adapter = new RulesWorkflowsStudioAdapter();

  it('validates canonical geo-project workflow snapshot successfully', async () => {
    const result = await adapter.validate(CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT as unknown as Record<string, unknown>);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('rejects invalid schema version or workflowId', async () => {
    const badVersion = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      schemaVersion: 2,
    });
    assert.equal(badVersion.valid, false);
    assert.ok(badVersion.issues.some((e) => e.path === 'schemaVersion'));

    const badId = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      workflowId: 'other-workflow',
    });
    assert.equal(badId.valid, false);
    assert.ok(badId.issues.some((e) => e.path === 'workflowId'));
  });

  it('rejects non-existent initialStateCode', async () => {
    const result = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      initialStateCode: '9999',
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.path === 'initialStateCode'));
  });

  it('rejects duplicate state codes or empty names', async () => {
    const result = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      states: [
        { code: '1', name: 'Planejamento', sortOrder: 10, active: true, behavior: 'planning' },
        { code: '1', name: 'Duplicado', sortOrder: 20, active: true, behavior: 'planning' },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'WORKFLOW_STATE_CODE_DUPLICATE'));
  });

  it('rejects transitions pointing to unknown destination state', async () => {
    const result = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      transitions: [
        {
          id: 'trans-invalid-dest',
          fromStateCodes: ['1'],
          toStateCode: '999',
          allowedRoles: ['inventory.editor'],
          actions: ['update-project'],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'WORKFLOW_TRANSITION_TO_NOT_FOUND'));
  });

  it('rejects transitions with unknown roles or empty role set', async () => {
    const result = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      transitions: [
        {
          id: 'trans-bad-role',
          fromStateCodes: ['1'],
          toStateCode: '17',
          allowedRoles: ['unauthorized.role' as never],
          actions: ['update-project'],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'WORKFLOW_TRANSITION_ROLE_UNKNOWN'));
  });

  it('rejects transitions transitioning out of terminal close-release states', async () => {
    const result = await adapter.validate({
      ...CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT,
      transitions: [
        {
          id: 'trans-out-of-terminal',
          fromStateCodes: ['17'],
          toStateCode: '22',
          allowedRoles: ['platform.admin'],
          actions: ['update-project'],
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((e) => e.code === 'WORKFLOW_TRANSITION_FROM_TERMINAL'));
  });
});
