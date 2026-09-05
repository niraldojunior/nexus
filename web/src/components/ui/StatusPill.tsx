import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * V.tal Nexus — StatusPill. Porta de `docs/4-design-system/components/core/StatusPill.jsx`,
 * estendida com os valores de estado TMF (`administrativeState`/`status`) usados no app —
 * `active`/`inactive`/`suspended`/`terminated`/`locked`/`planned`/`reserved` — além do
 * vocabulário de viabilidade do kit original. Um valor não mapeado cai num neutro
 * sentence-case em vez de quebrar.
 */
type Tone = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'neutral';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  online: { label: 'Online', tone: 'green' },
  active: { label: 'Ativo', tone: 'green' },
  ativo: { label: 'Ativo', tone: 'green' },
  viavel: { label: 'Viável', tone: 'green' },
  curso: { label: 'Em curso', tone: 'blue' },
  sincronizando: { label: 'Sincronizando', tone: 'blue' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  parcial: { label: 'Parcial', tone: 'amber' },
  degradado: { label: 'Degradado', tone: 'amber' },
  suspended: { label: 'Suspenso', tone: 'amber' },
  inviavel: { label: 'Inviável', tone: 'red' },
  offline: { label: 'Offline', tone: 'red' },
  terminated: { label: 'Encerrado', tone: 'red' },
  locked: { label: 'Bloqueado', tone: 'red' },
  planejado: { label: 'Planejado', tone: 'purple' },
  planned: { label: 'Planejado', tone: 'purple' },
  reservado: { label: 'Reservado', tone: 'purple' },
  reserved: { label: 'Reservado', tone: 'purple' },
};

const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  green: { color: 'var(--status-green)', bg: 'var(--status-green-soft)' },
  blue: { color: 'var(--status-blue)', bg: 'var(--status-blue-soft)' },
  amber: { color: 'var(--status-amber)', bg: 'var(--status-amber-soft)' },
  red: { color: 'var(--status-red)', bg: 'var(--status-red-soft)' },
  purple: { color: 'var(--status-purple)', bg: 'var(--status-purple-soft)' },
  neutral: { color: 'var(--text-secondary)', bg: 'var(--surface-muted)' },
};

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
  label?: string;
  pulse?: boolean;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function StatusPill({ status, label, pulse = false, style, ...rest }: StatusPillProps) {
  const known = STATUS[status.toLowerCase()];
  const tone = TONE_COLORS[known?.tone ?? 'neutral'];
  const text = label ?? known?.label ?? sentenceCase(status);

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 11px 4px 9px',
    borderRadius: 'var(--radius-full)',
    background: tone.bg,
    color: tone.color,
    fontFamily: 'var(--font-ui)',
    fontSize: '0.78rem',
    fontWeight: 600,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
  };

  return (
    <span style={{ ...base, ...style }} {...rest}>
      <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'currentColor' }} />
        {pulse && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'currentColor',
              animation: 'vtPulse 1.6s ease-out infinite',
            }}
          />
        )}
      </span>
      {text}
    </span>
  );
}
