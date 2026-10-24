import {
  Braces,
  Building2,
  CalendarDays,
  Hash,
  Image as ImageIcon,
  List,
  SlidersHorizontal,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';

const ICON_BY_VALUE_TYPE: Record<string, LucideIcon> = {
  string: Type,
  integer: Hash,
  decimal: Hash,
  boolean: ToggleLeft,
  date: CalendarDays,
  image: ImageIcon,
  list: List,
  organization: Building2,
  json: Braces,
};

// Ícone da linha de característica (IconInfoRow) pelo tipo do valor — o nome da característica é
// livre (catálogo, C9), então o ícone diz "que tipo de dado" e o nome vai no hint.
export function characteristicIcon(valueType: string | undefined): LucideIcon {
  return (valueType && ICON_BY_VALUE_TYPE[valueType]) || SlidersHorizontal;
}
