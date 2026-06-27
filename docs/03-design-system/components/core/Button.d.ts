import * as React from 'react';

export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual emphasis. @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon node rendered before the label */
  iconLeft?: React.ReactNode;
  /** Lucide icon node rendered after the label */
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/**
 * Primary action button for V.tal Nexus. Yellow primary, neutral secondary,
 * chrome-less ghost, dark chrome, and destructive danger.
 *
 * @startingPoint section="Core" subtitle="Button — primary, secondary, ghost, danger" viewport="700x160"
 */
export function Button(props: ButtonProps): React.ReactElement;
