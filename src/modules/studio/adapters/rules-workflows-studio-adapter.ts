import { AppError } from '../../../shared/errors/app-error.js';
import type { DatabaseClient } from '../../../shared/persistence/database-client.js';
import type { StudioDomainAdapter, StudioValidationIssue, StudioValidationResult } from '../domain.js';
import {
  GEO_PROJECT_WORKFLOW_ID,
  GEO_PROJECT_WORKFLOW_ROLES,
  GEO_PROJECT_WORKFLOW_SCHEMA_VERSION,
  type GeoProjectWorkflowAction,
  type GeoProjectWorkflowSnapshot,
  type GeoProjectWorkflowState,
} from '../../geo/project-workflow.js';

const ALLOWED_ROLES_SET = new Set<string>(GEO_PROJECT_WORKFLOW_ROLES);
const ALLOWED_ACTIONS_SET = new Set<GeoProjectWorkflowAction>([
  'update-project',
  'cascade-sites-planning',
  'cascade-sites-execution',
  'cascade-sites-suspended',
  'release-inventory',
  'terminate-inventory',
]);
const VALID_BEHAVIORS_SET = new Set(['planning', 'execution', 'suspended', 'close-release']);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export class RulesWorkflowsStudioAdapter implements StudioDomainAdapter {
  public readonly domain = 'rules-workflows';

  constructor(private readonly db?: DatabaseClient) {}

  public async validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> {
    const typed = snapshot as Partial<GeoProjectWorkflowSnapshot>;
    const issues: StudioValidationIssue[] = [];

    if (typed.schemaVersion !== GEO_PROJECT_WORKFLOW_SCHEMA_VERSION) {
      issues.push({
        severity: 'error',
        code: 'WORKFLOW_SCHEMA_VERSION_INVALID',
        message: `A versão do schema deve ser ${GEO_PROJECT_WORKFLOW_SCHEMA_VERSION}.`,
        path: 'schemaVersion',
      });
    }

    if (typed.workflowId !== GEO_PROJECT_WORKFLOW_ID) {
      issues.push({
        severity: 'error',
        code: 'WORKFLOW_ID_INVALID',
        message: `O workflowId deve ser "${GEO_PROJECT_WORKFLOW_ID}".`,
        path: 'workflowId',
      });
    }

    if (!Array.isArray(typed.states) || !Array.isArray(typed.transitions)) {
      return {
        valid: false,
        issues: [
          ...issues,
          {
            severity: 'error',
            code: 'WORKFLOW_STRUCTURE_INVALID',
            message: 'O snapshot de workflow deve conter as listas "states" e "transitions".',
            path: 'states',
          },
        ],
        validatedAt: new Date().toISOString(),
      };
    }

    const stateCodeMap = new Map<string, GeoProjectWorkflowState>();
    for (const [index, state] of typed.states.entries()) {
      const path = `states[${index}]`;
      if (!nonEmpty(state?.code)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_CODE_REQUIRED',
          message: 'O código do estado é obrigatório.',
          path: `${path}.code`,
        });
      } else if (stateCodeMap.has(state.code)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_CODE_DUPLICATE',
          message: `Código de estado duplicado: ${state.code}.`,
          path: `${path}.code`,
        });
      } else {
        stateCodeMap.set(state.code, state);
      }

      if (!nonEmpty(state?.name)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_NAME_REQUIRED',
          message: 'O nome do estado é obrigatório.',
          path: `${path}.name`,
        });
      }

      if (!Number.isInteger(state?.sortOrder)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_ORDER_INVALID',
          message: 'A ordem do estado deve ser um número inteiro.',
          path: `${path}.sortOrder`,
        });
      }

      if (typeof state?.active !== 'boolean') {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_ACTIVE_INVALID',
          message: 'O campo active deve ser booleano.',
          path: `${path}.active`,
        });
      }

      if (!VALID_BEHAVIORS_SET.has(state?.behavior as string)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_STATE_BEHAVIOR_INVALID',
          message: `Comportamento operacional inválido: ${state?.behavior}.`,
          path: `${path}.behavior`,
        });
      }
    }

    if (!nonEmpty(typed.initialStateCode) || !stateCodeMap.has(typed.initialStateCode)) {
      issues.push({
        severity: 'error',
        code: 'WORKFLOW_INITIAL_STATE_INVALID',
        message: 'O estado inicial deve corresponder a um estado declarado no snapshot.',
        path: 'initialStateCode',
      });
    } else {
      const initialState = stateCodeMap.get(typed.initialStateCode);
      if (!initialState?.active) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_INITIAL_STATE_INACTIVE',
          message: 'O estado inicial deve estar ativo.',
          path: 'initialStateCode',
        });
      }
    }

    const transitionIds = new Set<string>();
    const adjacency = new Map<string, Set<string>>();
    for (const stateCode of stateCodeMap.keys()) {
      adjacency.set(stateCode, new Set());
    }

    for (const [index, transition] of typed.transitions.entries()) {
      const path = `transitions[${index}]`;
      if (!nonEmpty(transition?.id)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_ID_REQUIRED',
          message: 'O ID da transição é obrigatório.',
          path: `${path}.id`,
        });
      } else if (transitionIds.has(transition.id)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_ID_DUPLICATE',
          message: `ID de transição duplicado: ${transition.id}.`,
          path: `${path}.id`,
        });
      } else {
        transitionIds.add(transition.id);
      }

      if (!Array.isArray(transition?.fromStateCodes) || transition.fromStateCodes.length === 0) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_FROM_EMPTY',
          message: 'A transição deve conter ao menos um estado de origem.',
          path: `${path}.fromStateCodes`,
        });
      } else {
        for (const fromCode of transition.fromStateCodes) {
          const fromState = stateCodeMap.get(fromCode);
          if (!fromState) {
            issues.push({
              severity: 'error',
              code: 'WORKFLOW_TRANSITION_FROM_NOT_FOUND',
              message: `Estado de origem não encontrado: ${fromCode}.`,
              path: `${path}.fromStateCodes`,
            });
          } else {
            // Estados terminais (behavior close-release) não podem ter transições de saída
            if (fromState.behavior === 'close-release') {
              issues.push({
                severity: 'error',
                code: 'WORKFLOW_TRANSITION_FROM_TERMINAL',
                message: `Estado terminal "${fromCode}" não admite transições de saída.`,
                path: `${path}.fromStateCodes`,
              });
            }
            if (nonEmpty(transition?.toStateCode) && stateCodeMap.has(transition.toStateCode)) {
              adjacency.get(fromCode)?.add(transition.toStateCode);
            }
          }
        }
      }

      if (!nonEmpty(transition?.toStateCode) || !stateCodeMap.has(transition.toStateCode)) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_TO_NOT_FOUND',
          message: `Estado de destino não encontrado: ${transition?.toStateCode}.`,
          path: `${path}.toStateCode`,
        });
      }

      if (!Array.isArray(transition?.allowedRoles) || transition.allowedRoles.length === 0) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_ROLES_EMPTY',
          message: 'Ao menos um papel deve ser atribuído à transição.',
          path: `${path}.allowedRoles`,
        });
      } else {
        for (const role of transition.allowedRoles) {
          if (!ALLOWED_ROLES_SET.has(role)) {
            issues.push({
              severity: 'error',
              code: 'WORKFLOW_TRANSITION_ROLE_UNKNOWN',
              message: `Papel desconhecido na transição: ${role}.`,
              path: `${path}.allowedRoles`,
            });
          }
        }
      }

      if (!Array.isArray(transition?.actions) || transition.actions.length === 0) {
        issues.push({
          severity: 'error',
          code: 'WORKFLOW_TRANSITION_ACTIONS_EMPTY',
          message: 'Ao menos uma ação tipada é obrigatória na transição.',
          path: `${path}.actions`,
        });
      } else {
        if (!transition.actions.includes('update-project')) {
          issues.push({
            severity: 'error',
            code: 'WORKFLOW_ACTION_UPDATE_PROJECT_REQUIRED',
            message: 'Toda transição deve incluir a ação "update-project".',
            path: `${path}.actions`,
          });
        }
        for (const action of transition.actions) {
          if (!ALLOWED_ACTIONS_SET.has(action)) {
            issues.push({
              severity: 'error',
              code: 'WORKFLOW_TRANSITION_ACTION_UNKNOWN',
              message: `Ação desconhecida: ${action}.`,
              path: `${path}.actions`,
            });
          }
        }
      }
    }

    // Graph reachability: todos os estados ativos devem ser alcançáveis a partir do estado inicial
    if (typed.initialStateCode && stateCodeMap.has(typed.initialStateCode)) {
      const reachable = new Set<string>([typed.initialStateCode]);
      const queue = [typed.initialStateCode];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency.get(current) ?? new Set();
        for (const next of neighbors) {
          if (!reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }

      for (const [code, state] of stateCodeMap.entries()) {
        if (state.active && !reachable.has(code)) {
          issues.push({
            severity: 'warning',
            code: 'WORKFLOW_STATE_UNREACHABLE',
            message: `O estado ativo "${code}" (${state.name}) não é alcançável a partir do estado inicial.`,
            path: `states[${typed.states.findIndex((s) => s.code === code)}]`,
          });
        }
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues,
      validatedAt: new Date().toISOString(),
    };
  }

  public async materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> {
    const validation = await this.validate(snapshot);
    if (!validation.valid) {
      throw new AppError(
        validation.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => issue.message)
          .join('; '),
        { code: 'STUDIO_MATERIALIZE_INVALID', statusCode: 422 },
      );
    }

    if (!this.db) return;

    const typed = snapshot as unknown as GeoProjectWorkflowSnapshot;
    const incomingCodes = new Set(typed.states.map((state) => state.code));

    // Sincroniza estados declarados no read-model de compatibilidade geo_project_status_catalog
    for (const state of typed.states) {
      const existing = await this.db.get<{ code: string }>(
        `SELECT code FROM geo_project_status_catalog WHERE tenant_id = ? AND code = ?`,
        [context.tenantId, state.code],
      );
      if (existing) {
        await this.db.run(
          `UPDATE geo_project_status_catalog
              SET name = ?, sort_order = ?, active = ?, behavior = ?
            WHERE tenant_id = ? AND code = ?`,
          [state.name, state.sortOrder, state.active ? 1 : 0, state.behavior, context.tenantId, state.code],
        );
      } else {
        await this.db.run(
          `INSERT INTO geo_project_status_catalog (tenant_id, code, name, sort_order, active, behavior)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [context.tenantId, state.code, state.name, state.sortOrder, state.active ? 1 : 0, state.behavior],
        );
      }
    }

    // Inativa estados ausentes no snapshot sem apagar registros (C6: soft-termination)
    const allDbStates = await this.db.all<{ code: string; active: number }>(
      `SELECT code, active FROM geo_project_status_catalog WHERE tenant_id = ?`,
      [context.tenantId],
    );
    for (const dbState of allDbStates) {
      if (!incomingCodes.has(dbState.code) && dbState.active === 1) {
        await this.db.run(
          `UPDATE geo_project_status_catalog SET active = 0 WHERE tenant_id = ? AND code = ?`,
          [context.tenantId, dbState.code],
        );
      }
    }
  }
}
