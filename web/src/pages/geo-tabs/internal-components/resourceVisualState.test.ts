import { describe, expect, it } from 'vitest';
import { getResourceVisualState } from './resourceVisualState';

const resource = {
  '@type': 'ResourceComponentNode' as const,
  id: 'port-01',
  name: 'PORT-01',
  kind: 'PhysicalResource' as const,
  parentId: 'cdoe-01',
  depth: 1,
};

describe('getResourceVisualState', () => {
  it('prioritizes an operational failure over a port marked as active', () => {
    expect(
      getResourceVisualState({
        ...resource,
        status: 'offline',
        portInfo: { usageState: 'active' },
      }),
    ).toMatchObject({ id: 'fault', label: 'Indisponível' });
  });

  it('uses the port usage state for an operational active resource', () => {
    expect(
      getResourceVisualState({
        ...resource,
        administrativeState: 'unlocked',
        operationalState: 'enabled',
        portInfo: { usageState: 'active' },
      }),
    ).toMatchObject({ id: 'in-use', label: 'Em uso' });
  });

  it('maps an active resource to a visible green surface', () => {
    expect(getResourceVisualState({ ...resource, status: 'active' })).toMatchObject({
      id: 'available',
      surfaceClassName: 'bg-status-green-soft',
      borderClassName: 'border-status-green/60',
    });
  });

  it('falls back to an accessible unknown state when no axis is available', () => {
    expect(getResourceVisualState(resource)).toMatchObject({
      id: 'unknown',
      label: 'Estado desconhecido',
      borderStyleClassName: 'border-dashed',
    });
  });
});
