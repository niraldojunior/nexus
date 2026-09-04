import React from 'react';

/**
 * V.tal Nexus — Card
 * Flat, border-led surface. `interactive` shifts background and border
 * on hover; nothing lifts or glows. `elevation="float"` is reserved for
 * panels that genuinely sit above the map.
 */
export function Card({ children, interactive = false, elevation = 'flat', pad = 16, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const shadows = { flat: 'none', raised: 'var(--shadow-md)', float: 'var(--shadow-float)' };
  const hoverStyle = interactive && hover ? {
    background: 'var(--surface-card-hover)',
    borderColor: 'var(--border-strong)',
  } : {};
  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: elevation === 'float' ? 'var(--radius-2xl)' : 'var(--radius-lg)',
        boxShadow: shadows[elevation] || 'none',
        padding: pad,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background var(--transition-fast), border-color var(--transition-fast)',
        ...hoverStyle,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
