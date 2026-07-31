import * as React from 'react';

export interface MetricCardProps {
  /** Eyebrow label above the number */
  label: string;
  /** The headline figure (already formatted) */
  value: string | number;
  /** Small unit suffix, e.g. "%", "Gbps" */
  unit?: string;
  /** Delta string, e.g. "2.4%" */
  delta?: string;
  /** @default "up" */
  deltaDir?: 'up' | 'down';
  /** Lucide icon node */
  icon?: React.ReactNode;
  /** Dark ink fill with yellow accent (hero KPI). @default false */
  accent?: boolean;
  style?: React.CSSProperties;
}

/**
 * KPI tile: label, large Montserrat number, optional delta and icon.
 * @startingPoint section="Core" subtitle="MetricCard — KPI tiles" viewport="700x200"
 */
export function MetricCard(props: MetricCardProps): React.ReactElement;
