import * as React from 'react';

export interface IconTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface IconTabsProps {
  items?: IconTabItem[];
  /** id of the active tab */
  value?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

/** Round icon + caption tab strip for entity sub-navigation. */
export function IconTabs(props: IconTabsProps): React.ReactElement;
