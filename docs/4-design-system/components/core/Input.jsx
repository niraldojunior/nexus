import React from 'react';

/**
 * V.tal Nexus — Input
 * Text field with optional leading icon and label. Resting border is the
 * hairline; focus swaps it for yellow plus a soft ring.
 */
export function Input({
  label,
  hint,
  iconLeft,
  type = 'text',
  value,
  placeholder,
  onChange,
  disabled = false,
  fullWidth = true,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <span style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>{label}</span>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          height: 36,
          background: disabled ? 'var(--surface-muted)' : 'var(--surface-card)',
          border: `1px solid ${focus ? 'var(--vt-yellow)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: focus ? 'var(--focus-shadow)' : 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          ...style,
        }}
      >
        {iconLeft && (
          <span style={{ display: 'flex', color: focus ? 'var(--vt-ink)' : 'var(--text-tertiary)' }}>{iconLeft}</span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--fs-body-lg)',
            color: 'var(--text-primary)',
            minWidth: 0,
          }}
          {...rest}
        />
      </div>
      {hint && (
        <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{hint}</span>
      )}
    </label>
  );
}
