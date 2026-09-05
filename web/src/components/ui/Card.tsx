import { useState, type CSSProperties, type HTMLAttributes } from 'react';

/**
 * V.tal Nexus — Card. Porta de `docs/4-design-system/components/core/Card.jsx`.
 * Superfície plana com borda — a borda é o que faz o card ser um card, nunca sombra.
 * `elevation="raised"`/`"float"` só para painéis que realmente flutuam (menus, mapa).
 */
export type CardElevation = 'flat' | 'raised' | 'float';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevation?: CardElevation;
  pad?: number;
}

const SHADOWS: Record<CardElevation, string> = {
  flat: 'none',
  raised: 'var(--shadow-md)',
  float: 'var(--shadow-float)',
};

export default function Card({
  children,
  interactive = false,
  elevation = 'flat',
  pad = 16,
  style,
  ...rest
}: CardProps) {
  const [hover, setHover] = useState(false);
  const hoverStyle: CSSProperties =
    interactive && hover
      ? { background: 'var(--surface-card-hover)', borderColor: 'var(--border-strong)' }
      : {};

  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: elevation === 'float' ? 'var(--radius-2xl)' : 'var(--radius-lg)',
        boxShadow: SHADOWS[elevation],
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
