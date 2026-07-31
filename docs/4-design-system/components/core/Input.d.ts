import * as React from 'react';

export interface InputProps {
  label?: string;
  /** Helper text below the field */
  hint?: string;
  /** Lucide icon node shown inside, before the text */
  iconLeft?: React.ReactNode;
  type?: string;
  value?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

/** Labelled text input; focus shows the golden ring. */
export function Input(props: InputProps): React.ReactElement;
