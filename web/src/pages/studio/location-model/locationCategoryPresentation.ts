import { Building2, Globe, Layers, MapPin, type LucideIcon } from 'lucide-react';
import type { GeoSpecCategory } from '../../../services/geoApi';

export const LOCATION_CATEGORY_LABELS: Record<GeoSpecCategory, string> = {
  Region: 'Região',
  Site: 'Externo',
  SubSite: 'Interno',
};

export const LOCATION_CATEGORY_ICONS: Record<GeoSpecCategory, LucideIcon> = {
  Region: Globe,
  Site: Building2,
  SubSite: Layers,
};

export const LOCATION_CATEGORY_ICON_TONES: Record<GeoSpecCategory, string> = {
  Region: 'border-amber-200 bg-amber-50 text-amber-600',
  Site: 'border-sky-200 bg-sky-50 text-sky-600',
  SubSite: 'border-purple-200 bg-purple-50 text-purple-600',
};

// D-GEO-003 foi superada: FunctionalGroup deixou de ser categoria válida (ver
// src/modules/geo/domain.ts). Uma base ainda não reiniciada pode entregar por um instante uma
// spec legada com essa categoria antes do self-heal do bootstrap aposentá-la — os getters abaixo
// caem num fallback neutro em vez de indexar undefined e quebrar o render.
export function locationCategoryLabel(category: string): string {
  return LOCATION_CATEGORY_LABELS[category as GeoSpecCategory] ?? category;
}

export function locationCategoryIcon(category: string): LucideIcon {
  return LOCATION_CATEGORY_ICONS[category as GeoSpecCategory] ?? MapPin;
}

export function locationCategoryIconTone(category: string): string {
  return (
    LOCATION_CATEGORY_ICON_TONES[category as GeoSpecCategory] ??
    'border-app-border bg-black/[0.04] text-app-muted'
  );
}
