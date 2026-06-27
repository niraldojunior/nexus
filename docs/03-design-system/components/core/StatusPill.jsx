import React from 'react';

/**
 * V.tal Nexus — StatusPill
 * Domain status indicator for network elements & viability results.
 * Maps a semantic status to color + dot; richer than a plain Badge.
 */
const STATUS = {
  online:    { label: 'Online',     color: 'var(--status-green)',  bg: 'var(--status-green-soft)' },
  viavel:    { label: 'Viável',     color: 'var(--status-green)',  bg: 'var(--status-green-soft)' },
  ativo:     { label: 'Ativo',      color: 'var(--status-green)',  bg: 'var(--status-green-soft)' },
  curso:     { label: 'Em curso',   color: 'var(--status-blue)',   bg: 'var(--status-blue-soft)' },
  sincronizando: { label: 'Sincronizando', color: 'var(--status-blue)', bg: 'var(--status-blue-soft)' },
  parcial:   { label: 'Parcial',    color: 'var(--status-amber)',  bg: 'var(--status-amber-soft)' },
  degradado: { label: 'Degradado',  color: 'var(--status-amber)',  bg: 'var(--status-amber-soft)' },
  inviavel:  { label: 'Inviável',   color: 'var(--status-red)',    bg: 'var(--status-red-soft)' },
  offline:   { label: 'Offline',    color: 'var(--status-red)',    bg: 'var(--status-red-soft)' },
  planejado: { label: 'Planejado',  color: 'var(--status-purple)', bg: 'var(--status-purple-soft)' },
  reservado: { label: 'Reservado',  color: 'var(--status-purple)', bg: 'var(--status-purple-soft)' },
};

export function StatusPill({ status = 'online', label, pulse = false, style, ...rest }) {
  const s = STATUS[status] || STATUS.online;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 11px 4px 9px',
        borderRadius: 'var(--radius-full)',
        background: s.bg,
        color: s.color,
        fontFamily: 'var(--font-ui)',
        fontSize: '0.78rem',
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'currentColor' }} />
        {pulse && (
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%', background: 'currentColor',
            animation: 'vtPulse 1.6s ease-out infinite',
          }} />
        )}
      </span>
      {label || s.label}
      <style>{`@keyframes vtPulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.6);opacity:0}}`}</style>
    </span>
  );
}
