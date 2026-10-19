import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
};

const dimensions = {
  sm: { width: 34, height: 24, knob: 14 },
  md: { width: 44, height: 26, knob: 20 },
} as const;

/**
 * V.tal Nexus — Switch. Porta do componente normativo do Design System para
 * configurações booleanas; amarelo sinaliza estado ativo, não decoração.
 */
const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, disabled = false, size = 'sm', style, ...rest },
  ref,
) {
  const { width, height, knob } = dimensions[size];
  const inset = (height - knob) / 2;
  const knobLeft = checked ? width - knob - inset : inset;
  const controlStyle: CSSProperties = {
    position: 'relative',
    flexShrink: 0,
    width,
    height,
    padding: 0,
    border: `1px solid ${checked ? 'var(--vt-yellow)' : 'var(--border-strong)'}`,
    borderRadius: 'var(--radius-full)',
    background: checked ? 'var(--vt-yellow)' : 'var(--surface-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background var(--transition-fast), border-color var(--transition-fast)',
    ...style,
  };

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      style={controlStyle}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: inset,
          left: knobLeft,
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: checked ? 'var(--vt-ink)' : 'var(--surface-card)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'left var(--transition-fast), background var(--transition-fast)',
        }}
      />
    </button>
  );
});

export default Switch;
