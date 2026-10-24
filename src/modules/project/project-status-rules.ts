import { AppError } from '../../shared/errors/app-error.js';
import type { ProjectStatusBehavior } from './project-repository.js';

export const PROJECT_STATUS_BEHAVIORS = [
  'planning',
  'execution',
  'suspended',
  'close-release',
] as const;

/** Regras do catálogo de status de projeto, compartilhadas por HTTP e MCP. */
export const parseProjectStatusBehavior = (value: unknown): ProjectStatusBehavior | undefined => {
  if (value === undefined) return undefined;
  if (
    typeof value === 'string' &&
    (PROJECT_STATUS_BEHAVIORS as readonly string[]).includes(value)
  ) {
    return value as ProjectStatusBehavior;
  }
  throw new AppError('invalid project status behavior', {
    code: 'PROJECT_STATUS_BEHAVIOR_INVALID',
    statusCode: 400,
  });
};

export const assertProjectStatusCreate = (
  name: unknown,
  behaviorInput: unknown,
): { name: string; behavior: ProjectStatusBehavior } => {
  const trimmed = String(name ?? '').trim();
  const behavior = parseProjectStatusBehavior(behaviorInput);
  if (!trimmed || !behavior) {
    throw new AppError('project status name and behavior are required', {
      code: 'PROJECT_STATUS_CATALOG_INVALID',
      statusCode: 400,
    });
  }
  if (behavior === 'close-release') {
    throw new AppError('only status code 17 can close a project', {
      code: 'PROJECT_STATUS_TERMINAL_RESERVED',
      statusCode: 409,
    });
  }
  return { name: trimmed, behavior };
};

/** Valida a alteração (ou desativação, quando `deactivating`) de um status existente. */
export const assertProjectStatusChange = (
  code: string,
  change: { behavior?: unknown; active?: unknown },
  deleting = false,
): ProjectStatusBehavior | undefined => {
  const behavior = deleting ? undefined : parseProjectStatusBehavior(change.behavior);
  const deactivating = deleting || change.active === false;
  if (code === '1' && deactivating) {
    throw new AppError('default project status cannot be deactivated', {
      code: 'PROJECT_STATUS_DEFAULT_PROTECTED',
      statusCode: 409,
    });
  }
  if (code === '17' && ((behavior !== undefined && behavior !== 'close-release') || deactivating)) {
    throw new AppError('project closing status is protected', {
      code: 'PROJECT_STATUS_TERMINAL_PROTECTED',
      statusCode: 409,
    });
  }
  if (code !== '17' && behavior === 'close-release') {
    throw new AppError('only status code 17 can close a project', {
      code: 'PROJECT_STATUS_TERMINAL_RESERVED',
      statusCode: 409,
    });
  }
  return behavior;
};
