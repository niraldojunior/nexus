import type { ResourceComponentNode } from '../../../services/resourceApi';

export type ResourceVisualState = {
  id:
    | 'in-use'
    | 'available'
    | 'planned'
    | 'blocked'
    | 'attention'
    | 'maintenance'
    | 'fault'
    | 'disabled'
    | 'unknown';
  label: string;
  surfaceClassName: string;
  borderClassName: string;
  indicatorClassName: string;
  borderStyleClassName: string;
};

type ResourceStateSource = Pick<
  ResourceComponentNode,
  'id' | 'status' | 'administrativeState' | 'operationalState' | 'portInfo'
>;

const VISUAL_STATES: Record<ResourceVisualState['id'], ResourceVisualState> = {
  'in-use': {
    id: 'in-use',
    label: 'Em uso',
    surfaceClassName: 'bg-status-green-soft',
    borderClassName: 'border-status-green/60',
    indicatorClassName: 'bg-status-green',
    borderStyleClassName: 'border-solid',
  },
  available: {
    id: 'available',
    label: 'Disponível',
    surfaceClassName: 'bg-status-green-soft',
    borderClassName: 'border-status-green/60',
    indicatorClassName: 'bg-status-green',
    borderStyleClassName: 'border-solid',
  },
  planned: {
    id: 'planned',
    label: 'Planejado',
    surfaceClassName: 'bg-status-blue-soft',
    borderClassName: 'border-status-blue/60',
    indicatorClassName: 'bg-status-blue',
    borderStyleClassName: 'border-dashed',
  },
  blocked: {
    id: 'blocked',
    label: 'Bloqueado',
    surfaceClassName: 'bg-status-amber-soft',
    borderClassName: 'border-status-amber/70',
    indicatorClassName: 'bg-status-amber',
    borderStyleClassName: 'border-solid',
  },
  attention: {
    id: 'attention',
    label: 'Atenção',
    surfaceClassName: 'bg-status-amber-soft',
    borderClassName: 'border-status-amber/50',
    indicatorClassName: 'bg-status-amber',
    borderStyleClassName: 'border-dashed',
  },
  maintenance: {
    id: 'maintenance',
    label: 'Em manutenção',
    surfaceClassName: 'bg-status-purple-soft',
    borderClassName: 'border-status-purple/60',
    indicatorClassName: 'bg-status-purple',
    borderStyleClassName: 'border-solid',
  },
  fault: {
    id: 'fault',
    label: 'Indisponível',
    surfaceClassName: 'bg-status-red-soft',
    borderClassName: 'border-status-red/60',
    indicatorClassName: 'bg-status-red',
    borderStyleClassName: 'border-solid',
  },
  disabled: {
    id: 'disabled',
    label: 'Desativado',
    surfaceClassName: 'bg-app-muted',
    borderClassName: 'border-app-border',
    indicatorClassName: 'bg-app-muted',
    borderStyleClassName: 'border-solid',
  },
  unknown: {
    id: 'unknown',
    label: 'Estado desconhecido',
    surfaceClassName: 'bg-white',
    borderClassName: 'border-app-border',
    indicatorClassName: 'bg-app-muted',
    borderStyleClassName: 'border-dashed',
  },
};

/**
 * Traduz os eixos TMF/X.731 disponíveis na projeção em uma única leitura visual.
 * A precedência protege falhas e bloqueios, que devem prevalecer sobre uso ativo.
 */
export function getResourceVisualState(resource: ResourceStateSource): ResourceVisualState {
  const status = resource.status?.toLowerCase();
  const usageState = resource.portInfo?.usageState?.toLowerCase();
  const operationalState = (resource.portInfo?.operationalState ?? resource.operationalState)?.toLowerCase();
  const administrativeState = (
    resource.portInfo?.administrativeState ?? resource.administrativeState
  )?.toLowerCase();

  if (status === 'terminated' || status === 'inactive' || operationalState === 'disabled') {
    return VISUAL_STATES.disabled;
  }
  if (status === 'fault' || status === 'failed' || status === 'offline') return VISUAL_STATES.fault;
  if (administrativeState === 'locked') return VISUAL_STATES.blocked;
  if (status === 'maintenance') return VISUAL_STATES.maintenance;
  if (status === 'planned' || status === 'design') return VISUAL_STATES.planned;
  if (administrativeState === 'shuttingdown' || status === 'suspended') return VISUAL_STATES.attention;
  if (usageState === 'active' || usageState === 'busy') return VISUAL_STATES['in-use'];
  if (status === 'active' || operationalState === 'enabled' || administrativeState === 'unlocked') {
    return VISUAL_STATES.available;
  }
  return VISUAL_STATES.unknown;
}
