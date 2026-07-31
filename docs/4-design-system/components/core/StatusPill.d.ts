import * as React from 'react';

export interface StatusPillProps {
  /** Domain status key. @default "online" */
  status?:
    | 'online' | 'viavel' | 'ativo'
    | 'curso' | 'sincronizando'
    | 'parcial' | 'degradado'
    | 'inviavel' | 'offline'
    | 'planejado' | 'reservado';
  /** Override the default Portuguese label */
  label?: string;
  /** Animate a radar pulse on the dot (use for live/online states) */
  pulse?: boolean;
  style?: React.CSSProperties;
}

/**
 * Network-domain status indicator (element health & viability outcomes).
 * @startingPoint section="Core" subtitle="StatusPill — network & viability states" viewport="700x120"
 */
export function StatusPill(props: StatusPillProps): React.ReactElement;
