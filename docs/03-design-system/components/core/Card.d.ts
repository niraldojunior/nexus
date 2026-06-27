import * as React from 'react';

export interface CardProps {
  children?: React.ReactNode;
  /** Add hover lift + golden glow. @default false */
  interactive?: boolean;
  /** Inner padding in px. @default 20 */
  pad?: number;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/** Base white surface; opt into hover lift with `interactive`. */
export function Card(props: CardProps): React.ReactElement;
