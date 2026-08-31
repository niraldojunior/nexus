import {
  ADMIN_STATE_LABELS,
  OP_STATE_LABELS,
  USAGE_STATE_LABELS,
} from '../../utils/resourceStateLabels';

type ResourceStateLightsProps = {
  administrativeState?: string;
  operationalState?: string;
  usageState?: string;
  // Há drop fisicamente instalado, mas nenhum RFS ativo. O farol branco com borda verde
  // diferencia essa planta disponível de uma porta sem drop ou de uma conexão encerrada.
  dropDisabled?: boolean;
};

type Light = {
  label: string;
  value: string;
  // Classes completas do farol (fundo + anel) — cada farol decide as duas juntas, já
  // que o destaque de "ocioso com drop histórico" muda as duas ao mesmo tempo.
  className: string;
};

const DEFAULT_RING = 'ring-app-panel';
// Branco ao centro, borda verde — farol de drop instalado, porém desativado.
const DROP_DISABLED_CLASS = 'bg-white ring-status-green';

const administrativeTone = (value?: string) =>
  value === 'unlocked'
    ? `bg-status-green ${DEFAULT_RING}`
    : value === 'shuttingDown'
      ? `bg-status-amber ${DEFAULT_RING}`
      : `bg-status-red ${DEFAULT_RING}`;
const operationalTone = (value?: string) =>
  value === 'enabled' ? `bg-status-green ${DEFAULT_RING}` : `bg-status-red ${DEFAULT_RING}`;
// "Em Uso" (active/busy) é verde; ocioso e desconhecido são cinza — sem colidir com o
// verde de "Desbloqueado" do farol administrativo, que é um eixo diferente do SID.
const usageTone = (value?: string) =>
  value === 'active' || value === 'busy' ? `bg-status-green ${DEFAULT_RING}` : `bg-app-muted ${DEFAULT_RING}`;

/** Faróis compactos dos três eixos SID/X.731, com texto disponível a leitores de tela. */
export function ResourceStateLights({
  administrativeState,
  operationalState,
  usageState,
  dropDisabled,
}: ResourceStateLightsProps) {
  const usageHighlight = dropDisabled === true;
  const usageValue = usageHighlight
    ? 'Drop desativado'
    : USAGE_STATE_LABELS[usageState ?? ''] ?? usageState ?? 'Desconhecido';

  const lights: Light[] = [
    {
      label: 'Estado administrativo',
      value: ADMIN_STATE_LABELS[administrativeState ?? ''] ?? administrativeState ?? 'Desconhecido',
      className: administrativeTone(administrativeState),
    },
    {
      label: 'Estado operacional',
      value: OP_STATE_LABELS[operationalState ?? ''] ?? operationalState ?? 'Desconhecido',
      className: operationalTone(operationalState),
    },
    {
      label: 'Estado de uso',
      value: usageValue,
      className: usageHighlight ? DROP_DISABLED_CLASS : usageTone(usageState),
    },
  ];

  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label="Estados SID/X.731">
      {lights.map((light) => (
        <span
          key={light.label}
          className={`h-2.5 w-2.5 rounded-full ring-2 ${light.className}`}
          title={`${light.label}: ${light.value}`}
        >
          <span className="sr-only">{`${light.label}: ${light.value}`}</span>
        </span>
      ))}
    </span>
  );
}
