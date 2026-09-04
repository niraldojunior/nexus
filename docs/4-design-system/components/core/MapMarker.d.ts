import * as React from 'react';

export interface MapMarkerProps {
  /** Semantic state of the network element. @default "available" */
  tone?: 'available' | 'suspended' | 'partial' | 'station';
  /** @default "sm" */
  size?: 'sm' | 'md' | 'lg';
  /** White glyph placed inside the badge. */
  icon?: React.ReactNode;
  /** Promote to a yellow teardrop pin. @default false */
  selected?: boolean;
  style?: React.CSSProperties;
}

/** Circular map badge, one hue per network-element state. */
export function MapMarker(props: MapMarkerProps): React.ReactElement;
