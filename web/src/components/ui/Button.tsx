import { forwardRef, useState, type ButtonHTMLAttributes, type CSSProperties } from 'react';

/**
 * V.tal Nexus — Button. Porta de `docs/4-design-system/components/core/Button.jsx`.
 * Primário carrega o amarelo da marca com texto ink; secundário é outline neutro;
 * ghost é sem chrome; dark para superfícies invertidas; danger para ações destrutivas.
 * Use no máximo um `primary` por vista.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const SIZES: Record<ButtonSize, CSSProperties & { gap: number }> = {
  sm: { padding: '0 12px', fontSize: 'var(--fs-body)', height: 32, gap: 6 },
  md: { padding: '0 14px', fontSize: 'var(--fs-body-lg)', height: 36, gap: 8 },
  lg: { padding: '0 18px', fontSize: 'var(--fs-body-relaxed)', height: 44, gap: 8 },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--vt-yellow)', color: 'var(--vt-ink)', borderColor: 'var(--vt-yellow)' },
  secondary: { background: 'var(--surface-card)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'transparent' },
  dark: { background: 'var(--surface-ink)', color: 'var(--text-on-dark)', borderColor: 'var(--surface-ink)' },
  danger: { background: 'var(--status-red)', color: '#fff', borderColor: 'var(--status-red)' },
};

const HOVERS: Partial<Record<ButtonVariant, CSSProperties>> = {
  primary: { background: 'var(--vt-yellow-light)', borderColor: 'var(--vt-yellow-light)' },
  secondary: { background: 'var(--surface-muted)' },
  ghost: { background: 'var(--surface-muted)', color: 'var(--text-primary)' },
  dark: { background: 'var(--neutral-700)', borderColor: 'var(--neutral-700)' },
  danger: { background: '#DC3F3F', borderColor: '#DC3F3F' },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    disabled = false,
    fullWidth = false,
    type = 'button',
    style,
    onMouseEnter,
    onMouseLeave,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const s = SIZES[size];

  const base: CSSProperties = {
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
    transition:
      'background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)',
    whiteSpace: 'nowrap',
  };

  const hoverStyle = !disabled && hover ? HOVERS[variant] ?? {} : {};

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        onMouseLeave?.(e);
      }}
      style={{ ...base, ...VARIANTS[variant], ...hoverStyle, ...style }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});

export default Button;
