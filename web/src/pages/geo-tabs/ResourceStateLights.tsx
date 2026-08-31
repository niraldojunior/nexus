import {
  ADMIN_STATE_LABELS,
  OP_STATE_LABELS,
  USAGE_STATE_LABELS,
} from '../../utils/resourceStateLabels';

type ResourceStateLightsProps = {
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
};

type Light = {
  label: string;
  value: string;
  tone: string;
};

const administrativeTone = (value?: string) =>
  value === 'unlocked' ? 'bg-status-green' : value === 'shuttingDown' ? 'bg-status-amber' : 'bg-status-red';
const operationalTone = (value?: string) => (value === 'enabled' ? 'bg-status-green' : 'bg-status-red');
const usageTone = (value?: string) =>
  value === 'active' || value === 'busy'
    ? 'bg-status-amber'
    : value === 'idle'
      ? 'bg-status-green'
      : 'bg-app-muted';

/** Faróis compactos dos três eixos SID/X.731, com texto disponível a leitores de tela. */
export function ResourceStateLights({
  administrativeState,
  operationalState,
  usageState,
}: ResourceStateLightsProps) {
  const lights: Light[] = [
    {
      label: 'Estado administrativo',
      value: ADMIN_STATE_LABELS[administrativeState ?? ''] ?? administrativeState ?? 'Desconhecido',
      tone: administrativeTone(administrativeState),
    },
    {
      label: 'Estado operacional',
      value: OP_STATE_LABELS[operationalState ?? ''] ?? operationalState ?? 'Desconhecido',
      tone: operationalTone(operationalState),
    },
    {
      label: 'Estado de uso',
      value: USAGE_STATE_LABELS[usageState ?? ''] ?? usageState ?? 'Desconhecido',
      tone: usageTone(usageState),
    },
  ];

  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label="Estados SID/X.731">
      {lights.map((light) => (
        <span
          key={light.label}
          className={`h-2.5 w-2.5 rounded-full ring-2 ring-app-panel ${light.tone}`}
          title={`${light.label}: ${light.value}`}
        >
          <span className="sr-only">{`${light.label}: ${light.value}`}</span>
        </span>
      ))}
    </span>
  );
}
