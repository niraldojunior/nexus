import * as React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  /** Color tone. @default "neutral" */
  tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'brand' | 'ink';
  /** Show a leading status dot. @default false */
  dot?: boolean;
  style?: React.CSSProperties;
}

/** Compact uppercase status/category label with a soft tinted fill. */
export function Badge(props: BadgeProps): React.ReactElement;
