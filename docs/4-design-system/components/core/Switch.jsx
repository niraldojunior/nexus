import React from 'react';

/**
 * V.tal Nexus — Switch
 * Layer / feature toggle. On = brand yellow with ink knob; off = neutral.
 * The default control for the map Layers panel.
 */
export function Switch({ checked = false, onChange, disabled = false, size = 'md', label, style, ...rest }) {
  const dims = size === 'sm' ? { w: 34, h: 20, k: 14 } : { w: 44, h: 26, k: 20 };
  const pad = (dims.h - dims.k) / 2;
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: dims.w,
        height: dims.h,
        padding: 0,
        border: '1px solid ' + (checked ? 'var(--vt-yellow)' : 'var(--border-strong)'),
        borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--vt-yellow)' : 'var(--neutral-200)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--transition-fast), border-color var(--transition-fast)',
        ...(label ? {} : style),
      }}
      {...(label ? {} : rest)}
    >
      <span
        style={{
          position: 'absolute',
          top: pad,
          left: checked ? dims.w - dims.k - pad - 2 : pad,
          width: dims.k,
          height: dims.k,
          borderRadius: '50%',
          background: checked ? 'var(--vt-ink)' : 'var(--surface-card)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'left var(--transition-fast), background var(--transition-fast)',
        }}
      />
    </button>
  );
  if (!label) return toggle;
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, cursor: disabled ? 'not-allowed' : 'pointer', ...style }} {...rest}>
      <span style={{ font: 'var(--fw-regular) var(--fs-body-relaxed)/1.3 var(--font-ui)', color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)' }}>{label}</span>
      {toggle}
    </label>
  );
}
