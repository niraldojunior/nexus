import * as React from 'react';

export interface SwitchProps {
  /** @default false */
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** @default false */
  disabled?: boolean;
  /** @default "md" */
  size?: 'sm' | 'md';
  /** Optional label rendered to the left; the row becomes the hit target. */
  label?: string;
  style?: React.CSSProperties;
}

/** Layer / feature toggle. Yellow when on, neutral when off. */
export function Switch(props: SwitchProps): React.ReactElement;
