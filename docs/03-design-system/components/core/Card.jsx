import React from 'react';

/**
 * V.tal Nexus — Card
 * Base surface. `interactive` adds the lift + golden glow on hover.
 */
export function Card({ children, interactive = false, pad = 16, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const lift = interactive && hover ? {
    transform: 'translateY(-2px)',
    borderColor: 'var(--border-strong)',
    boxShadow: 'var(--shadow-gold)',
  } : {};
  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: pad,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal)',
        ...lift,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
