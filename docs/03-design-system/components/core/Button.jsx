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
    sm: { padding: '6px 12px', fontSize: '0.8rem', height: 32, gap: 6 },
    md: { padding: '9px 16px', fontSize: '0.9rem', height: 40, gap: 8 },
    lg: { padding: '12px 22px', fontSize: '1rem', height: 48, gap: 10 },
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
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast), filter var(--transition-fast)',
    whiteSpace: 'nowrap',
  };

  const variants = {
    primary: {
      background: 'var(--vt-yellow)',
      color: 'var(--vt-ink)',
      borderColor: 'var(--vt-yellow-light)',
      boxShadow: 'var(--shadow-sm)',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-strong)',
      boxShadow: 'var(--shadow-sm)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent',
    },
    dark: {
      background: 'var(--surface-sidebar)',
      color: 'var(--text-on-dark)',
      borderColor: 'var(--surface-sidebar)',
    },
    danger: {
      background: 'var(--status-red)',
      color: '#fff',
      borderColor: 'var(--status-red)',
    },
  };

  const [hover, setHover] = React.useState(false);
  const hoverStyle = !disabled && hover ? {
    transform: 'translateY(-1px)',
    boxShadow: variant === 'primary' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
    filter: variant === 'ghost' ? 'none' : 'brightness(1.03)',
    background: variant === 'ghost' ? 'var(--surface-inset)' : undefined,
  } : {};

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
