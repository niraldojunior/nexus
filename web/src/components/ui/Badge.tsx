import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * V.tal Nexus — Badge. Porta de `docs/4-design-system/components/core/Badge.jsx`.
 * Rótulo compacto de status/categoria: fundo tintado + texto saturado.
 * Sentence case, peso médio — nunca uppercase micro-caps.
 */
export type BadgeTone = 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'brand' | 'ink';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-muted)', fg: 'var(--text-secondary)' },
  green: { bg: 'var(--status-green-soft)', fg: 'color-mix(in srgb, var(--status-green) 60%, var(--text-primary))' },
  blue: { bg: 'var(--status-blue-soft)', fg: 'color-mix(in srgb, var(--status-blue) 60%, var(--text-primary))' },
  amber: { bg: 'var(--status-amber-soft)', fg: 'color-mix(in srgb, var(--status-amber) 60%, var(--text-primary))' },
  red: { bg: 'var(--status-red-soft)', fg: 'color-mix(in srgb, var(--status-red) 60%, var(--text-primary))' },
  purple: { bg: 'var(--status-purple-soft)', fg: 'color-mix(in srgb, var(--status-purple) 60%, var(--text-primary))' },
  brand: { bg: 'var(--vt-yellow-dim)', fg: 'var(--vt-yellow-ink-soft)' },
  ink: { bg: 'var(--surface-ink)', fg: 'var(--vt-yellow)' },
};

export default function Badge({
  children,
  tone = 'neutral',
  dot = false,
  style,
  ...rest
}: BadgeProps) {
  const t = TONES[tone];
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 9px',
    borderRadius: 'var(--radius-sm)',
    background: t.bg,
    color: t.fg,
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 500,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={{ ...base, ...style }} {...rest}>
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      )}
      {children}
    </span>
  );
}
