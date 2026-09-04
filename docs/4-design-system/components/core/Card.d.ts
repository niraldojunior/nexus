import * as React from 'react';

export interface CardProps {
  children?: React.ReactNode;
  /** Shift background + border on hover. @default false */
  interactive?: boolean;
  /** flat = border only (default). raised = subtle shadow. float = over-the-map panel. @default "flat" */
  elevation?: 'flat' | 'raised' | 'float';
  /** Inner padding in px. @default 16 */
  pad?: number;
  style?: React.CSSProperties;
}

/** Flat, border-led base surface. */
export function Card(props: CardProps): React.ReactElement;
