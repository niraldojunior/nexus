import React from 'react';

/**
 * V.tal Nexus — IconTabs
 * Round icon + caption tab strip used for entity sub-navigation
 * (Visão geral · Portas · Cobertura · Esquemático · Histórico).
 * Active tab fills solid brand yellow; the rest are yellow-tinted rings.
 */
export function IconTabs({ items = [], value, onChange, style, ...rest }) {
  return (
    <div
      role="tablist"
      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, ...style }}
      {...rest}
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange && onChange(it.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '4px 2px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: active ? 'var(--vt-yellow)' : 'var(--vt-yellow-tint)',
                color: active ? 'var(--vt-ink)' : 'var(--text-secondary)',
                transition: 'background var(--transition-fast), color var(--transition-fast)',
              }}
            >
              {it.icon}
            </span>
            <span
              style={{
                font: 'var(--fs-sm)/1.25 var(--font-ui)',
                fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-regular)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                textAlign: 'center',
              }}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
