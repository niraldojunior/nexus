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

// Tons de categoria via os tokens semânticos de status (--status-*-soft já tem variante
// translúcida no tema escuro) em vez de paletas fixas do Tailwind (amber-50/sky-50/purple-50),
// que não invertem e ficavam claras demais sobre fundo escuro.
export const LOCATION_CATEGORY_ICON_TONES: Record<GeoSpecCategory, string> = {
  Region: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  Site: 'border-status-blue/30 bg-status-blue-soft text-status-blue',
  SubSite: 'border-status-purple/30 bg-status-purple-soft text-status-purple',
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
    'border-app-border bg-[var(--surface-muted)] text-app-muted'
  );
}
