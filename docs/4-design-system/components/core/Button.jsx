import React from 'react';

/**
 * V.tal Nexus — Button
 * Primary action carries the brand yellow with ink text; secondary is a
 * neutral outline; ghost is chrome-less; danger for destructive actions.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: { padding: '0 12px', fontSize: 'var(--fs-body)', height: 32, gap: 6 },
    md: { padding: '0 14px', fontSize: 'var(--fs-body-lg)', height: 36, gap: 8 },
    lg: { padding: '0 18px', fontSize: 'var(--fs-body-relaxed)', height: 44, gap: 8 },
  };
  const s = sizes[size] || sizes.md;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.height,
    padding: s.padding,
    fontFamily: 'var(--font-ui)',
    fontSize: s.fontSize,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
    whiteSpace: 'nowrap',
  };

  const variants = {
    primary: {
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      borderColor: 'var(--vt-yellow)',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent',
    },
    dark: {
      background: 'var(--surface-ink)',
      color: 'var(--text-on-dark)',
      borderColor: 'var(--surface-ink)',
    },
    danger: {
      background: 'var(--status-red)',
      color: '#fff',
      borderColor: 'var(--status-red)',
    },
  };

  const [hover, setHover] = React.useState(false);
  const hovers = {
    primary: { background: 'var(--vt-yellow-light)', borderColor: 'var(--vt-yellow-light)' },
    secondary: { background: 'var(--surface-muted)' },
    ghost: { background: 'var(--surface-muted)', color: 'var(--text-primary)' },
    dark: { background: 'var(--neutral-700)', borderColor: 'var(--neutral-700)' },
    danger: { background: '#DC3F3F', borderColor: '#DC3F3F' },
  };
  const hoverStyle = !disabled && hover ? (hovers[variant] || {}) : {};

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...hoverStyle, ...style }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
