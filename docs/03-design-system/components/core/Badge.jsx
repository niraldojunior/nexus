import React from 'react';

/**
 * V.tal Nexus — Badge
 * Compact status / category label. Soft tinted fill + saturated text.
 */
export function Badge({ children, tone = 'neutral', dot = false, style, ...rest }) {
  const tones = {
    neutral: { bg: 'var(--surface-inset)', fg: 'var(--text-secondary)' },
    green:   { bg: 'var(--status-green-soft)',  fg: 'var(--status-green)' },
    blue:    { bg: 'var(--status-blue-soft)',   fg: 'var(--status-blue)' },
    amber:   { bg: 'var(--status-amber-soft)',  fg: 'var(--status-amber)' },
    red:     { bg: 'var(--status-red-soft)',    fg: 'var(--status-red)' },
    purple:  { bg: 'var(--status-purple-soft)', fg: 'var(--status-purple)' },
    brand:   { bg: 'var(--vt-yellow-dim)',      fg: '#9a7d00' },
    ink:     { bg: 'var(--vt-ink)',             fg: 'var(--vt-yellow)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        background: t.bg,
        color: t.fg,
        fontFamily: 'var(--font-ui)',
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      )}
      {children}
    </span>
  );
}
