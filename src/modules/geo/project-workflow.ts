import type { GeoProjectStatus, GeoProjectStatusBehavior, GeoProjectStatusCatalogItem } from './project-repository.js';

export const GEO_PROJECT_WORKFLOW_SCHEMA_VERSION = 1 as const;
export const GEO_PROJECT_WORKFLOW_ID = 'geo-project' as const;

export const GEO_PROJECT_WORKFLOW_ROLES = ['inventory.editor', 'platform.admin'] as const;
export type GeoProjectWorkflowRole = (typeof GEO_PROJECT_WORKFLOW_ROLES)[number];

export type GeoProjectWorkflowAction =
  | 'update-project'
  | 'cascade-sites-planning'
  | 'cascade-sites-execution'
  | 'cascade-sites-suspended'
  | 'release-inventory'
  | 'terminate-inventory';

export type GeoProjectWorkflowState = GeoProjectStatusCatalogItem;

export type GeoProjectWorkflowTransition = {
  id: string;
  fromStateCodes: string[];
  toStateCode: string;
  allowedRoles: GeoProjectWorkflowRole[];
  actions: GeoProjectWorkflowAction[];
};

export type GeoProjectWorkflowSnapshot = {
  schemaVersion: typeof GEO_PROJECT_WORKFLOW_SCHEMA_VERSION;
  workflowId: typeof GEO_PROJECT_WORKFLOW_ID;
  initialStateCode: string;
  states: GeoProjectWorkflowState[];
  transitions: GeoProjectWorkflowTransition[];
};

export type GeoProjectWorkflowReadModel = GeoProjectWorkflowSnapshot & {
  publicationChecksum?: string;
  fallback: boolean;
};

export type GeoProjectWorkflowTransitionResult = {
  project: import('./project-repository.js').GeoProject;
  transitionId: string;
  siteCascade: { updated: number; skipped: number; blocked?: number };
  resourceCascade: { updated: number; skipped: number };
};

export const PROJECT_STATUS_DEFAULTS: ReadonlyArray<GeoProjectStatusCatalogItem> = [
  { code: '1', name: 'Projeto criado', sortOrder: 1, active: true, behavior: 'planning' },
  { code: '11', name: 'Projeto em planejamento', sortOrder: 11, active: true, behavior: 'planning' },
  { code: '12', name: 'Obra em execução', sortOrder: 12, active: true, behavior: 'execution' },
  { code: '13', name: 'Obra concluída', sortOrder: 13, active: true, behavior: 'execution' },
  { code: '14', name: 'Enviado ao SAP', sortOrder: 14, active: true, behavior: 'execution' },
  { code: '15', name: 'Erro de conciliação', sortOrder: 15, active: true, behavior: 'suspended' },
  { code: '16', name: 'Conciliado com o SAP', sortOrder: 16, active: true, behavior: 'execution' },
  { code: '17', name: 'Projeto encerrado', sortOrder: 17, active: true, behavior: 'close-release' },
  { code: '18', name: 'Projeto em quantificação', sortOrder: 18, active: true, behavior: 'planning' },
  { code: '19', name: 'Projeto enviado para orçamento CRE', sortOrder: 19, active: true, behavior: 'planning' },
  { code: '20', name: 'Projeto aguardando verba', sortOrder: 20, active: true, behavior: 'planning' },
  { code: '21', name: 'Projeto em contratação', sortOrder: 21, active: true, behavior: 'planning' },
  { code: '22', name: 'Projeto em execução', sortOrder: 22, active: true, behavior: 'execution' },
  { code: '23', name: 'Projeto paralisado', sortOrder: 23, active: true, behavior: 'suspended' },
  { code: '25', name: 'Projeto conciliado físico-contábil', sortOrder: 25, active: true, behavior: 'execution' },
  { code: 'legacy-cancelled', name: 'Cancelado (legado)', sortOrder: 99_999, active: false, behavior: 'close-release' },
];

const statesByBehavior = (behavior: GeoProjectStatusBehavior): string[] =>
  PROJECT_STATUS_DEFAULTS.filter((state) => state.active && state.behavior === behavior).map(
    (state) => state.code,
  );

const nonTerminalStates = PROJECT_STATUS_DEFAULTS.filter(
  (state) => state.active && state.behavior !== 'close-release',
).map((state) => state.code);

const actionsForBehavior = (behavior: GeoProjectStatusBehavior): GeoProjectWorkflowAction[] => {
  if (behavior === 'execution') return ['update-project', 'cascade-sites-execution'];
  if (behavior === 'suspended') return ['update-project', 'cascade-sites-suspended'];
  if (behavior === 'close-release') return ['update-project', 'release-inventory'];
  return ['update-project', 'cascade-sites-planning'];
};

export const projectStatusOperationalStatus = (
  behavior: GeoProjectStatusBehavior,
): GeoProjectStatus => {
  if (behavior === 'execution') return 'active';
  if (behavior === 'suspended') return 'suspended';
  if (behavior === 'close-release') return 'terminated';
  return 'planned';
};

export const CANONICAL_GEO_PROJECT_WORKFLOW_SNAPSHOT: GeoProjectWorkflowSnapshot = {
  schemaVersion: GEO_PROJECT_WORKFLOW_SCHEMA_VERSION,
  workflowId: GEO_PROJECT_WORKFLOW_ID,
  initialStateCode: '1',
  states: PROJECT_STATUS_DEFAULTS.map((state) => ({ ...state })),
  transitions: [
    ...(['planning', 'execution', 'suspended'] as const).flatMap((fromBehavior) =>
      (['planning', 'execution', 'suspended'] as const).flatMap((toBehavior) =>
        statesByBehavior(toBehavior).map((toStateCode) => ({
          id: `${fromBehavior}-to-${toStateCode}`,
          fromStateCodes: statesByBehavior(fromBehavior),
          toStateCode,
          allowedRoles: [...GEO_PROJECT_WORKFLOW_ROLES],
          actions: actionsForBehavior(toBehavior),
        })),
      ),
    ),
    {
      id: 'close-and-release',
      fromStateCodes: nonTerminalStates,
      toStateCode: '17',
      allowedRoles: [...GEO_PROJECT_WORKFLOW_ROLES],
      actions: ['update-project', 'release-inventory'],
    },
  ],
};
