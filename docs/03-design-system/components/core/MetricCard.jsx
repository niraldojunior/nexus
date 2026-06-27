import React from 'react';

/**
 * V.tal Nexus — MetricCard
 * KPI surface: eyebrow label, big Montserrat number, optional delta + icon.
 */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaDir = 'up',
  icon,
  accent = false,
  style,
  ...rest
}) {
  const deltaColor = deltaDir === 'down' ? 'var(--status-red)' : 'var(--status-green)';
  return (
    <div
      style={{
        position: 'relative',
        background: accent ? 'var(--vt-ink)' : 'var(--surface-card)',
        border: `1px solid ${accent ? 'var(--vt-ink)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 16,
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{
          font: 'var(--text-eyebrow)', textTransform: 'uppercase', letterSpacing: '0.05em',
          color: accent ? 'rgba(255,255,255,0.55)' : 'var(--text-tertiary)',
        }}>{label}</span>
        {icon && (
          <span style={{
            display: 'flex', width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
            borderRadius: 8,
            background: accent ? 'rgba(255,217,25,0.16)' : 'var(--surface-inset)',
            color: accent ? 'var(--vt-yellow)' : 'var(--text-secondary)',
          }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.75rem', lineHeight: 1,
          letterSpacing: '-0.02em', color: accent ? '#fff' : 'var(--text-primary)',
        }}>{value}</span>
        {unit && (
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9rem',
            color: accent ? 'rgba(255,255,255,0.6)' : 'var(--text-tertiary)' }}>{unit}</span>
        )}
      </div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '0.78rem', color: deltaColor }}>
            {deltaDir === 'down' ? '▾' : '▴'} {delta}
          </span>
          <span style={{ fontSize: '0.75rem', color: accent ? 'rgba(255,255,255,0.45)' : 'var(--text-tertiary)' }}>vs. mês anterior</span>
        </div>
      )}
    </div>
  );
}
